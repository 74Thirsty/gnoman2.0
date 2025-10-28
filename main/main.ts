import type { BrowserWindow as BrowserWindowType } from 'electron';
import { app, BrowserWindow as BrowserWindowCtor, ipcMain } from 'electron';
import { fork, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { registerIpcHandlers } from './ipcHandlers';

const isDev = process.env.NODE_ENV === 'development';
const backendPort = Number.parseInt(process.env.PORT ?? '4399', 10);

const sleep = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

let backendProcess: ChildProcess | null = null;

const resolveBackendEntry = () => {
  const searchRoots = new Set<string>();
  let current = path.resolve(__dirname);

  for (let depth = 0; depth < 6; depth += 1) {
    searchRoots.add(current);

    const distDir = path.join(current, 'dist');
    if (fs.existsSync(distDir)) {
      searchRoots.add(distDir);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  const suffixes: string[][] = [
    ['backend', 'index.js'],
    ['backend', 'backend', 'index.js']
  ];

  for (const root of searchRoots) {
    for (const parts of suffixes) {
      const candidate = path.join(root, ...parts);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
};

const backendHealthUrl = `http://127.0.0.1:${backendPort}/api/health`;

const isBackendReachable = async () => {
  try {
    const response = await fetch(backendHealthUrl, { cache: 'no-store' });
    return response.ok;
  } catch (error) {
    const maybeErrno = error as { code?: string };
    if (maybeErrno.code !== 'ECONNREFUSED') {
      console.warn('Backend health probe failed:', error);
    }
    return false;
  }
};

const ensureBackendRunning = async () => {
  if (await isBackendReachable()) {
    return;
  }

  if (!backendProcess) {
    const backendEntry = resolveBackendEntry();

    if (!backendEntry) {
      console.error('Unable to locate backend bundle. Have you run `npm run build:backend`?');
      return;
    }

    backendProcess = fork(backendEntry, {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: backendPort.toString()
      },
      stdio: 'inherit'
    });

    backendProcess.on('exit', (code, signal) => {
      backendProcess = null;
      if (signal) {
        console.warn(`Backend exited after receiving signal ${signal}.`);
        return;
      }

      if (code && code !== 0) {
        console.error(`Backend process exited with code ${code}.`);
      }
    });

    backendProcess.on('error', (error) => {
      console.error('Failed to launch embedded backend:', error);
    });
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isBackendReachable()) {
      return;
    }

    await sleep(250);
  }

  console.error('Timed out waiting for embedded backend to report healthy.');
};

if (!isDev) {
  app.commandLine.appendSwitch('allow-file-access-from-files');
}

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
      preload: path.join(__dirname, 'preload/index.js'),
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
    const resolveRendererIndex = () => {
      const candidates = [
        path.resolve(__dirname, '..', '..', 'renderer', 'index.html'),
        path.resolve(__dirname, '..', 'renderer', 'index.html')
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }

      console.error('Unable to locate renderer bundle. Have you run `npm run build:renderer`?');
      return undefined;
    };

    const rendererIndex = resolveRendererIndex();

    if (!rendererIndex) {
      throw new Error('Renderer bundle missing from build output.');
    }

    await mainWindow.loadURL(
      url.format({
        pathname: rendererIndex,
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

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.removeAllListeners();
    backendProcess.kill();
    backendProcess = null;
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    void createWindow();
  }
});

app.whenReady().then(async () => {
  registerIpcHandlers(ipcMain);
  await ensureBackendRunning();
  await createWindow();
});

