import fs from 'fs';
import path from 'path';
import readline from 'readline';

interface EnvState {
  projectRoot: string;
  envPath: string;
  licensePath: string;
  values: Record<string, string>;
  needsPrivateKey: boolean;
  needsWrite: boolean;
}

const DEFAULTS: Record<string, string> = {
  PORT: '4399',
  NODE_ENV: 'development',
  VITE_DEV_SERVER_URL: 'http://localhost:5173'
};

const HEADER_LINES = [
  '# GNOMAN 2.0 environment configuration',
  '# Managed automatically. Delete this file to trigger a fresh setup prompt.',
  ''
];

function determineProjectRoot(): string {
  const candidate = path.resolve(__dirname, '..', '..');
  if (fs.existsSync(path.join(candidate, 'package.json'))) {
    return candidate;
  }

  const distCandidate = path.resolve(__dirname, '..', '..', '..');
  if (fs.existsSync(path.join(distCandidate, 'package.json'))) {
    return distCandidate;
  }

  return process.cwd();
}

function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) {
      continue;
    }

    const delimiter = line.indexOf('=');
    if (delimiter === -1) {
      continue;
    }

    const key = line.slice(0, delimiter).trim();
    if (!key) {
      continue;
    }

    const value = line.slice(delimiter + 1).trim();
    values[key] = stripSurroundingQuotes(value);
  }

  return values;
}

function stripSurroundingQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}

function serializeEnv(values: Record<string, string>): string {
  const orderedKeys = ['PORT', 'NODE_ENV', 'VITE_DEV_SERVER_URL', 'LICENSE_PRIVATE_KEY'];
  const extras = Object.keys(values)
    .filter((key) => !orderedKeys.includes(key))
    .sort();

  const lines = [...HEADER_LINES];

  for (const key of [...orderedKeys, ...extras]) {
    const value = values[key];
    if (typeof value === 'undefined') {
      continue;
    }
    lines.push(`${key}=${value}`);
  }

  lines.push('');
  return lines.join('\n');
}

function normalizeRelativePath(projectRoot: string, targetPath: string): string {
  const relative = path.relative(projectRoot, targetPath);
  return relative.split(path.sep).join('/');
}

export function loadEnvironment(): EnvState {
  const projectRoot = determineProjectRoot();
  const envPath = path.join(projectRoot, '.env');
  const licensePath = path.join(projectRoot, 'backend', 'licenses', 'license_private.pem');

  const values: Record<string, string> = {};

  if (fs.existsSync(envPath)) {
    const contents = fs.readFileSync(envPath, 'utf8');
    Object.assign(values, parseEnvFile(contents));
  }

  let needsWrite = false;

  for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
    if (values[key]) {
      continue;
    }

    if (process.env[key]) {
      values[key] = process.env[key] as string;
      continue;
    }

    values[key] = defaultValue;
    needsWrite = true;
  }

  const envLicense = process.env.LICENSE_PRIVATE_KEY ?? values.LICENSE_PRIVATE_KEY;
  if (envLicense) {
    values.LICENSE_PRIVATE_KEY = envLicense;
  }

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      process.env[key] = value;
    }
  }

  const resolvedLicensePath = values.LICENSE_PRIVATE_KEY
    ? path.resolve(projectRoot, values.LICENSE_PRIVATE_KEY)
    : licensePath;

  const needsPrivateKey = !values.LICENSE_PRIVATE_KEY || !fs.existsSync(resolvedLicensePath);

  if (!values.LICENSE_PRIVATE_KEY && fs.existsSync(licensePath)) {
    values.LICENSE_PRIVATE_KEY = normalizeRelativePath(projectRoot, licensePath);
    process.env.LICENSE_PRIVATE_KEY = values.LICENSE_PRIVATE_KEY;
    needsWrite = true;
  }

  return {
    projectRoot,
    envPath,
    licensePath,
    values,
    needsPrivateKey,
    needsWrite
  };
}

export async function ensureEnvironment(existingState?: EnvState): Promise<void> {
  const state = existingState ?? loadEnvironment();
  let { values, needsPrivateKey, needsWrite } = state;

  if (needsPrivateKey) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error(
        'LICENSE_PRIVATE_KEY is not configured and an interactive terminal is unavailable. Set the variable manually to continue.'
      );
    }

    console.log('GNOMAN 2.0 requires your Ed25519 private key before issuing licenses.');
    console.log('Paste the full PEM (including BEGIN/END lines). Submit an empty line to finish.');

    const key = await promptForPrivateKey();

    if (!key.trim()) {
      throw new Error('An Ed25519 private key is required to continue.');
    }

    const normalizedKey = ensureTrailingNewline(key.trim());

    if (!fs.existsSync(path.dirname(state.licensePath))) {
      fs.mkdirSync(path.dirname(state.licensePath), { recursive: true });
    }

    fs.writeFileSync(state.licensePath, normalizedKey, { mode: 0o600 });
    console.log(`Saved private key to ${normalizeRelativePath(state.projectRoot, state.licensePath)}.`);

    const relativePath = normalizeRelativePath(state.projectRoot, state.licensePath);
    values.LICENSE_PRIVATE_KEY = relativePath;
    process.env.LICENSE_PRIVATE_KEY = relativePath;
    needsPrivateKey = false;
    needsWrite = true;
  }

  if (!fs.existsSync(state.envPath) || needsWrite) {
    const contents = serializeEnv(values);
    fs.writeFileSync(state.envPath, contents);
    console.log(`Updated ${normalizeRelativePath(state.projectRoot, state.envPath)}.`);
  }
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

async function promptForPrivateKey(): Promise<string> {
  while (true) {
    const captured = await captureMultiLineInput();
    const trimmed = captured.trim();
    if (trimmed) {
      return trimmed;
    }
    console.log('A private key is required. Please try again.');
  }
}

function captureMultiLineInput(): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const lines: string[] = [];

    const handleLine = (line: string) => {
      if (line.trim() === '' && lines.length > 0) {
        rl.removeListener('line', handleLine);
        rl.close();
        return;
      }

      lines.push(line);
    };

    rl.on('line', handleLine);

    rl.once('close', () => {
      resolve(lines.join('\n'));
    });

    rl.once('SIGINT', () => {
      rl.close();
      reject(new Error('Private key entry cancelled by user.'));
    });

    rl.prompt();
  });
}
