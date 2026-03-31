const { spawn } = require('child_process');
const electronPath = require('electron');

const sanitizeGtkModules = (envVar) => {
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

if (process.platform === 'linux') {
  sanitizeGtkModules('GTK_MODULES');
  sanitizeGtkModules('GTK3_MODULES');
}

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('Failed to launch Electron:', error);
  process.exit(1);
});

