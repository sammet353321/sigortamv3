I will implement Google Drive integration to save policy PDFs directly to Drive instead of Supabase.

**1. Backend Implementation (`whatsapp-backend`)**
-   I will install `googleapis`, `multer`, and `cors` packages.
-   I will create a new service `src/DriveService.js` to handle Google Drive authentication and file uploads.
-   I will add a new API endpoint `POST /upload-to-drive` in `index.js`.
    -   This endpoint will accept the PDF file.
    -   It will use a `service-account.json` file (which you need to provide) to authenticate with Google.
    -   It will upload the file to Drive and return the file's URL.

**2. Frontend Update (`PolicyCut.tsx`)**
-   I will modify the `handleSave` function.
-   Instead of uploading to Supabase Storage, it will send the file to your local backend (`http://localhost:3004/upload-to-drive`).
-   The returned Google Drive link will be saved to the database.

**IMPORTANT: Required User Action**
To make this work, you will need to:
1.  Get a **Google Service Account Key** (JSON file) from Google Cloud Console.
2.  Rename it to **`service-account.json`**.
3.  Place it inside the **`c:\Users\Administrator\Desktop\SİGORTAA\whatsapp-backend\`** folder.
4.  (Optional) Share your target Google Drive folder with the Service Account's email address if you want files to go to a specific folder.

If you confirm, I will set up the code structure now.
