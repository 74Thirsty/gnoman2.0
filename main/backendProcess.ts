import { ChildProcess, fork } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';

const DEFAULT_PORT = 4399;
const STARTUP_TIMEOUT_MS = 10_000;
const RETRY_INTERVAL_MS = 250;

let backendProcess: ChildProcess | null = null;
let readinessPromise: Promise<void> | null = null;

const resolvePort = () => {
  const raw = process.env.PORT ?? String(DEFAULT_PORT);
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? DEFAULT_PORT : parsed;
};

const waitForHealthcheck = (port: number) => {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  const scheduleRetry = (resolve: () => void, reject: (error: Error) => void) => {
    if (Date.now() >= deadline) {
      reject(new Error('Timed out waiting for embedded backend to become ready.'));
      return;
    }

    setTimeout(() => attempt(resolve, reject), RETRY_INTERVAL_MS);
  };

  const attempt = (resolve: () => void, reject: (error: Error) => void) => {
    const request = http.get({
      host: '127.0.0.1',
      port,
      path: '/api/health',
      timeout: RETRY_INTERVAL_MS
    });

    request.on('response', (response) => {
      response.destroy();
      if (response.statusCode === 200) {
        resolve();
        return;
      }

      scheduleRetry(resolve, reject);
    });

    request.on('error', () => {
      scheduleRetry(resolve, reject);
    });

    request.on('timeout', () => {
      request.destroy();
      scheduleRetry(resolve, reject);
    });
  };

  return new Promise<void>((resolve, reject) => {
    attempt(resolve, reject);
  });
};

const resolveBackendEntryPoint = () => {
  const candidates = [
    path.join(__dirname, '../backend/index.js'),
    path.join(__dirname, '../backend/backend/index.js')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate the compiled backend entry point. Checked: ${candidates
      .map((candidate) => '"' + candidate + '"')
      .join(', ')}`
  );
};

const launchBackend = (port: number) => {
  const entryPoint = resolveBackendEntryPoint();

  backendProcess = fork(entryPoint, [], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore'
  });

  backendProcess.on('error', (error) => {
    console.error('Failed to launch embedded GNOMAN 2.0 backend:', error);
  });

  backendProcess.on('exit', (code, signal) => {
    backendProcess = null;
    if (code !== 0) {
      console.error(
        `Embedded GNOMAN 2.0 backend exited with code ${code ?? 'null'}${signal ? `, signal ${signal}` : ''}`
      );
    }
  });
};

export const startEmbeddedBackend = () => {
  if (process.env.NODE_ENV === 'development') {
    return Promise.resolve();
  }

  const port = resolvePort();

  if (backendProcess) {
    if (!readinessPromise) {
      readinessPromise = waitForHealthcheck(port);
    }
    return readinessPromise;
  }

  try {
    launchBackend(port);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error('Failed to launch embedded backend');
    console.error('Failed to launch embedded GNOMAN 2.0 backend:', failure);
    readinessPromise = Promise.reject(failure);
    return readinessPromise;
  }
  readinessPromise = waitForHealthcheck(port);
  return readinessPromise;
};

export const stopEmbeddedBackend = () => {
  readinessPromise = null;

  if (!backendProcess) {
    return;
  }

  backendProcess.removeAllListeners('exit');
  backendProcess.kill();
  backendProcess = null;
};
