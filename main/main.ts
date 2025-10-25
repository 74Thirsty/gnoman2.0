import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as url from 'url';
import { registerIpcHandlers } from './ipcHandlers';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

if (process.platform === 'linux') {
  const gtkModules = process.env.GTK_MODULES;
  if (gtkModules) {
    const sanitizedModules = gtkModules
      .split(':')
      .map((moduleName) => moduleName.trim())
      .filter((moduleName) => moduleName && moduleName !== 'colorreload-gtk-module');

    if (sanitizedModules.length === 0) {
      delete process.env.GTK_MODULES;
    } else if (sanitizedModules.join(':') !== gtkModules) {
      process.env.GTK_MODULES = sanitizedModules.join(':');
    }
  }
}

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (isDev) {
    const devServerURL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    await mainWindow.loadURL(devServerURL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadURL(
      url.format({
        pathname: path.join(__dirname, '../renderer/index.html'),
        protocol: 'file:',
        slashes: true
      })
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    void createWindow();
  }
});

app.whenReady().then(() => {
  registerIpcHandlers(ipcMain);
  void createWindow();
});

