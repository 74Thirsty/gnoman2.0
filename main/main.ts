import type { BrowserWindow as BrowserWindowType } from 'electron';
import { app, BrowserWindow as BrowserWindowCtor, ipcMain } from 'electron';
import * as path from 'path';
import * as url from 'url';
import { registerIpcHandlers } from './ipcHandlers';
import { startEmbeddedBackend, stopEmbeddedBackend } from './backendProcess';

const isDev = process.env.NODE_ENV === 'development';

if (process.platform === 'linux') {
  const sanitizeGtkModules = (envVar: string) => {
    const modules = process.env[envVar];

    if (!modules) {
      return;
    }

    const sanitizedModules = modules
      .split(':')
      .map((moduleName) => moduleName.trim())
      .filter((moduleName) => moduleName && moduleName !== 'colorreload-gtk-module');

    if (sanitizedModules.length === 0) {
      delete process.env[envVar];
      return;
    }

    const normalized = sanitizedModules.join(':');

    if (normalized !== modules) {
      process.env[envVar] = normalized;
    }
  };

  sanitizeGtkModules('GTK_MODULES');
  sanitizeGtkModules('GTK3_MODULES');
}

let mainWindow: BrowserWindowType | null = null;

const createWindow = async () => {
  mainWindow = new BrowserWindowCtor({
    width: 1280,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setTitle('GNOMAN 2.0');

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

app.whenReady()
  .then(async () => {
    await startEmbeddedBackend();
    registerIpcHandlers(ipcMain);
    await createWindow();
  })
  .catch((error) => {
    console.error('Failed to launch GNOMAN 2.0:', error);
    app.quit();
  });

app.on('before-quit', () => {
  stopEmbeddedBackend();
});

