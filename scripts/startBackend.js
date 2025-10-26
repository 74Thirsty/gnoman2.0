const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function resolveBackendEntryPoint() {
  const projectRoot = path.resolve(__dirname, '..');
  const candidates = [
    path.join(projectRoot, 'dist', 'backend', 'index.js'),
    path.join(projectRoot, 'dist', 'backend', 'backend', 'index.js')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate compiled backend entry point. Expected one of: ${candidates
      .map((candidate) => `'${candidate}'`)
      .join(', ')}`
  );
}

function startBackend() {
  let entryPoint;
  try {
    entryPoint = resolveBackendEntryPoint();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
    return;
  }

  const child = spawn(process.execPath, [entryPoint], {
    stdio: 'inherit'
  });

  child.on('close', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error('Failed to start backend:', error);
    process.exit(1);
  });
}

startBackend();
