const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class DriveService {
    constructor() {
        this.auth = null;
        this.drive = null;
        this.initialized = false;
        
        // Path to service account key
        this.keyFilePath = path.join(process.cwd(), 'service-account.json');
        
        this.initialize();
    }

    initialize() {
        if (!fs.existsSync(this.keyFilePath)) {
            console.log('[DriveService] service-account.json not found. Drive upload disabled.');
            return;
        }

        try {
            this.auth = new google.auth.GoogleAuth({
                keyFile: this.keyFilePath,
                scopes: ['https://www.googleapis.com/auth/drive.file'],
            });

            this.drive = google.drive({ version: 'v3', auth: this.auth });
            this.initialized = true;
            console.log('[DriveService] Initialized successfully.');
            
            // Check Quota
            this.checkQuota();

        } catch (error) {
            console.error('[DriveService] Init failed:', error);
        }
    }

    async checkQuota() {
        try {
            const res = await this.drive.about.get({
                fields: 'storageQuota, user'
            });
            const quota = res.data.storageQuota;
            const user = res.data.user;
            console.log(`[DriveService] Connected as: ${user.emailAddress}`);
            console.log(`[DriveService] Quota: Limit=${quota.limit}, Usage=${quota.usage}, UsageInDrive=${quota.usageInDrive}, UsageInTrash=${quota.usageInTrash}`);
            
            if (!quota.limit || quota.limit === '0') {
                 console.warn('[DriveService] WARNING: Account has 0 storage limit! Uploads will fail unless using Shared Drives.');
            }
        } catch (err) {
            console.error('[DriveService] Failed to check quota:', err.message);
        }
    }

    async getOrCreateDailyFolder() {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        
        const folderName = `${dd}.${mm}.${yyyy} POLİÇELER`;
        const PARENT_FOLDER_ID = '1KCo3q-ZSlJi3TRJGpGdRKs55jScYoyoa'; // Provided by User

        try {
            // 1. Check if folder exists inside the parent folder
            // IMPORTANT: 'parents' query ensures we look inside the shared folder
            const res = await this.drive.files.list({
                q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${PARENT_FOLDER_ID}' in parents and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive',
                supportsAllDrives: true, // Required for Shared Drives/Folders
                includeItemsFromAllDrives: true
            });

            if (res.data.files.length > 0) {
                console.log(`[DriveService] Found existing folder: ${folderName}`);
                return res.data.files[0].id;
            }

            // 2. Create folder if not exists
            const fileMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [PARENT_FOLDER_ID] // Create INSIDE the shared folder
            };

            const folder = await this.drive.files.create({
                resource: fileMetadata,
                fields: 'id',
                supportsAllDrives: true
            });

            console.log(`[DriveService] Created new folder: ${folderName}`);
            
            return folder.data.id;

        } catch (error) {
            console.error('[DriveService] Failed to get/create daily folder:', error);
            throw error; 
        }
    }

    async uploadFile(fileObject, folderId = null) {
        if (!this.initialized) {
            throw new Error('Google Drive integration is not configured. Missing service-account.json?');
        }

        try {
            // If no folder provided, get/create today's folder
            const targetFolderId = folderId || await this.getOrCreateDailyFolder();

            const fileMetadata = {
                name: fileObject.originalname, // Original filename
            };

            if (targetFolderId) {
                fileMetadata.parents = [targetFolderId];
            }

            const media = {
                mimeType: fileObject.mimetype,
                body: fs.createReadStream(fileObject.path),
            };

            // V3 FIX: Use supportsAllDrives=true and try to avoid 'quota' error by ensuring the file inherits ownership correctly
            // Actually, Service Accounts CANNOT inherit ownership in personal drives easily.
            // But if the SA has EDITOR role on the folder, it should be able to upload using the FOLDER OWNER's quota?
            // NO. In "My Drive" (Personal), the CREATOR owns the file and consumes CREATOR's quota.
            // Since SA has 0 quota, it FAILS to create file even inside a shared folder.
            
            // WORKAROUND: We must transfer ownership immediately? No, impossible at creation.
            // WORKAROUND 2: The only way is if the Folder is in a "Shared Drive" (Team Drive).
            // WORKAROUND 3: Enable billing or storage for the SA project?
            
            // Let's try to upload WITHOUT metadata first? No.
            
            // IMPORTANT: If we are here, it means SA has 0 quota.
            // We can try to upload with 'writersCanShare: true'?
            
            const response = await this.drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, name, webViewLink, webContentLink',
                supportsAllDrives: true,
            });

            // Make the file readable by anyone with the link (Optional - remove if private)
            // Or rely on folder permissions.
            // For now, let's keep it private to the Service Account unless shared.
            // But user needs to view it. 
            // Better to grant permission to anyone with link or just return the link.
            
            // To make it viewable by the user, we might need to share it or make it public.
            // Let's make it 'reader' for 'anyone'.
            try {
                await this.drive.permissions.create({
                    fileId: response.data.id,
                    requestBody: {
                        role: 'reader',
                        type: 'anyone',
                    },
                    supportsAllDrives: true, // Also needed for permission changes on shared drives
                });
            } catch (permError) {
                console.warn('[DriveService] Could not set public permission:', permError.message);
            }

            return {
                success: true,
                fileId: response.data.id,
                url: response.data.webViewLink, // View in browser
                downloadUrl: response.data.webContentLink
            };

        } catch (error) {
            console.error('[DriveService] Upload failed:', error);
            
            // FALLBACK: If upload fails due to Quota, try to upload to Root (maybe shared folder issue?)
            // Or return a specific error that allows the frontend to continue saving to DB at least.
            
            // If the error contains "quota", we can't do anything about Drive.
            // But we should NOT block the DB save.
            // We will throw, but maybe the frontend should handle it gracefully?
            // The frontend code:
            /*
              } catch (err) {
                  console.error('Drive Upload Error:', err);
                  toast.error(`Drive'a yüklenemedi: ${(err as any).message}`);
                  setSaving(false);
                  return; // THIS STOPS DB SAVE
              }
            */
            // So we must throw. 
            
            throw error;
        }
    }
}

module.exports = new DriveService();