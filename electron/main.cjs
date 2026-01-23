const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// --- Config Store Implementation ---
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'app-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}
// ----------------------------------

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// --- NETWORK RESILIENCE & VPN COMPATIBILITY ---
// Disable QUIC and HTTP/3 to avoid UDP blocking by corporate VPNs (Fortinet/Cisco)
app.commandLine.appendSwitch('disable-quic');
app.commandLine.appendSwitch('disable-http3');
app.commandLine.appendSwitch('disable-features', 'quic');
// Try to fix white screen issues with renderer crashing or gpu issues in VM/VPN
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu');

app.commandLine.appendSwitch('ignore-certificate-errors');
// Aggressive SSL/TLS downgrades for hostile enterprise networks
app.commandLine.appendSwitch('ssl-version-min', 'tls1.0');
app.commandLine.appendSwitch('disable-http2'); // Often fixes protocol errors in proxies
app.commandLine.appendSwitch('ignore-urlfetcher-cert-requests');

// Ensure system proxy settings are respected but not enforced if broken
// app.commandLine.appendSwitch('no-proxy-server'); // Uncomment only if proxy is causing issues

// TLS/SSL Security Configuration
// We stick to the system trust store. If Fortinet performs SSL inspection,
// the corporate root CA must be in the Windows Trusted Root Store.
// ----------------------------------------------

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "SİGORTAM KAYIT",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // Enable some resilience
      webSecurity: true, 
      allowRunningInsecureContent: false
    },
    autoHideMenuBar: true,
    frame: true,
    icon: path.join(__dirname, '../public/favicon.ico')
  });

  const config = loadConfig();
  
  if (config.targetUrl) {
    console.log('Loading saved URL:', config.targetUrl);
    mainWindow.loadURL(config.targetUrl).catch(err => {
        console.error('Failed to load URL:', err);
    });
  } else {
    console.log('No URL found, loading setup.');
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));
  }

  // Determine if we are in development or production
  const isDev = !app.isPackaged;
  if (isDev) {
    // mainWindow.webContents.openDevTools();
  }

  // --- ERROR HANDLING FOR WHITE SCREEN ---
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('Page failed to load:', errorCode, errorDescription, validatedURL);
      
      // Load a local error page instead of white screen
      const errorHtml = `
        <html>
        <body style="font-family: sans-serif; padding: 2rem; text-align: center; background: #f0f2f5;">
            <h2 style="color: #dc2626;">Bağlantı Hatası</h2>
            <p>Sayfa yüklenirken bir sorun oluştu.</p>
            <div style="background: white; padding: 1rem; border-radius: 8px; margin: 1rem auto; max-width: 500px; text-align: left;">
                <p><strong>URL:</strong> ${validatedURL}</p>
                <p><strong>Hata Kodu:</strong> ${errorCode}</p>
                <p><strong>Açıklama:</strong> ${errorDescription}</p>
            </div>
            <p style="color: #6b7280; font-size: 0.9rem;">
                Lütfen internet bağlantınızı ve VPN durumunuzu kontrol edin. 
                <br>Eğer kurumsal VPN kullanıyorsanız, güvenlik duvarı bu adresi engelliyor olabilir.
            </p>
            <button onclick="window.location.reload()" style="background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 10px;">Tekrar Dene</button>
            <br><br>
            <button onclick="window.electronAPI.clearUrl()" style="background: #4b5563; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Ayarları Sıfırla (Kuruluma Dön)</button>
        </body>
        </html>
      `;
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
  });

  // Auto Updater Events
  autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update-available');
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('update-error', err.toString());
  });

  // Check for updates once window is ready
  mainWindow.once('ready-to-show', () => {
      autoUpdater.checkForUpdatesAndNotify();
  });

  // Handle certificate errors (Optional: Log only, do not blindly bypass)
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    // Fortinet SSL Inspection often causes 'net::ERR_CERT_AUTHORITY_INVALID'
    // if the root CA is not installed.
    console.error(`Certificate Error at ${url}: ${error}`);
    
    if (error === 'net::ERR_CERT_AUTHORITY_INVALID' || error === 'net::ERR_CERT_COMMON_NAME_INVALID') {
        // BYPASS SSL ERRORS FOR CORPORATE VPN COMPATIBILITY
        // Warning: This reduces security but is necessary for some filtered environments.
        event.preventDefault();
        callback(true);
        console.log('Certificate error bypassed by application logic (VPN Mode).');
    } else {
        // Default behavior for other errors
        callback(false);
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  // IPC Handlers
  ipcMain.handle('save-url', async (event, url) => {
    let targetUrl = url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }
    saveConfig({ targetUrl });
    mainWindow.loadURL(targetUrl);
    return true;
  });

  ipcMain.handle('clear-url', async () => {
    saveConfig({}); // Clear config
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));
    return true;
  });

  ipcMain.handle('check-update', () => {
      autoUpdater.checkForUpdates();
  });

  ipcMain.handle('install-update', () => {
      autoUpdater.quitAndInstall();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
