const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveUrl: (url) => ipcRenderer.invoke('save-url', url),
  clearUrl: () => ipcRenderer.invoke('clear-url'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (_event, value) => callback(value))
});

window.addEventListener('DOMContentLoaded', () => {
    // Check if we are in the setup page or the main app
    const isSetupPage = document.getElementById('saveBtn') !== null;

    if (!isSetupPage) {
        injectFloatingControls();
    }
});

function injectFloatingControls() {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '10px';
    container.style.right = '20px';
    container.style.zIndex = '999999';
    container.style.display = 'flex';
    container.style.gap = '10px';
    container.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    container.style.padding = '8px';
    container.style.borderRadius = '30px';
    container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    container.style.backdropFilter = 'blur(5px)';

    // Update Button (Hidden by default, shows when update available)
    const updateBtn = document.createElement('button');
    updateBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
    `;
    styleButton(updateBtn, '#10b981'); // Green
    updateBtn.title = "Güncelleme Kontrol Ediliyor...";
    updateBtn.style.display = 'none'; // Hidden initially
    updateBtn.id = 'update-btn';
    
    // Refresh Button
    const refreshBtn = document.createElement('button');
    refreshBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/>
            <path d="M3 3v9h9"/>
        </svg>
    `;
    styleButton(refreshBtn, '#2563eb');
    refreshBtn.title = "Sayfayı Yenile";
    refreshBtn.onclick = () => window.location.reload();

    // Settings (Gear) Button
    const settingsBtn = document.createElement('button');
    settingsBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
        </svg>
    `;
    styleButton(settingsBtn, '#4b5563');
    settingsBtn.title = "Bağlantı Ayarları";
    settingsBtn.onclick = () => {
        if(confirm('Bağlantı adresini değiştirmek istediğinize emin misiniz?')) {
            ipcRenderer.invoke('clear-url');
        }
    };

    container.appendChild(updateBtn);
    container.appendChild(refreshBtn);
    container.appendChild(settingsBtn);
    document.body.appendChild(container);

    // Setup Update Listeners
    setupUpdateListeners(updateBtn);
}

function styleButton(btn, color) {
    btn.style.background = 'none';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.style.padding = '5px';
    btn.style.borderRadius = '50%';
    btn.style.color = color;
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.transition = 'background-color 0.2s';
    
    btn.onmouseover = () => {
        btn.style.backgroundColor = 'rgba(0,0,0,0.05)';
    };
    btn.onmouseout = () => {
        btn.style.backgroundColor = 'transparent';
    };
}

function setupUpdateListeners(btn) {
    ipcRenderer.on('update-available', () => {
        btn.style.display = 'flex';
        btn.title = "Yeni güncelleme indiriliyor...";
        btn.style.color = '#f59e0b'; // Amber (Downloading)
        // Add a spinning animation maybe?
        btn.innerHTML = `
            <svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
        `;
        // Add style for spin
        if (!document.getElementById('spin-style')) {
            const style = document.createElement('style');
            style.id = 'spin-style';
            style.innerHTML = `
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .animate-spin { animation: spin 1s linear infinite; }
            `;
            document.head.appendChild(style);
        }
    });

    ipcRenderer.on('update-downloaded', () => {
        btn.style.display = 'flex';
        btn.title = "Güncellemeyi Yüklemek İçin Tıklayın";
        btn.style.color = '#10b981'; // Green (Ready)
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
        `;
        // Pulse animation
        if (!document.getElementById('pulse-style')) {
             const style = document.createElement('style');
             style.id = 'pulse-style';
             style.innerHTML = `
                 @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
             `;
             document.head.appendChild(style);
        }
        btn.style.animation = 'pulse 2s infinite';
        
        btn.onclick = () => {
            if(confirm('Güncelleme hazır. Uygulamayı yeniden başlatıp yüklemek ister misiniz?')) {
                ipcRenderer.invoke('install-update');
            }
        };
    });

    ipcRenderer.on('update-error', (_event, err) => {
        console.error('Update error:', err);
        // Optional: Show error state
    });
}
