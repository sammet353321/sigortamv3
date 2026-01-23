const { app, BrowserWindow, ipcMain } = require('electron');
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
