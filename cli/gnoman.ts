#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import process from 'process';
import keyringManager from '../src/core/keyringManager';
import type { KeyringBackendName } from '../src/core/backends/types';
import {
  exportWallet,
  importWalletFromEncryptedJson,
  listWalletMetadata
} from '../backend/services/walletService';

const AVAILABLE_BACKENDS: KeyringBackendName[] = ['system', 'file', 'memory'];

type CommandHandler = (args: string[]) => Promise<void>;

const maskSecret = (value: string | null) => {
  if (!value) {
    return null;
  }
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

const takeOption = (args: string[], option: string) => {
  const index = args.indexOf(option);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (typeof value !== 'string') {
    throw new Error(`Option ${option} requires a value.`);
  }
  args.splice(index, 2);
  return value;
};

const takeFlag = (args: string[], option: string) => {
  const index = args.indexOf(option);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
};

const ensureBackend = async (backend?: string) => {
  if (!backend) {
    return;
  }
  if (!AVAILABLE_BACKENDS.includes(backend as KeyringBackendName)) {
    throw new Error(`Unsupported backend '${backend}'. Use one of: ${AVAILABLE_BACKENDS.join(', ')}`);
  }
  await keyringManager.switchBackend(backend as KeyringBackendName);
};

const ensureFileOutput = async (filePath: string, data: string) => {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, data, 'utf8');
};

const readSource = async (source: string) => {
  if (source === '-' || source === '/dev/stdin') {
    return new Promise<string>((resolve, reject) => {
      let buffer = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        buffer += chunk.toString();
      });
      process.stdin.on('end', () => resolve(buffer));
      process.stdin.on('error', (error) => reject(error));
    });
  }
  return fs.readFile(source, 'utf8');
};

const parseEnvFile = (content: string) => {
  const records: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, remainder] = match;
    let value = remainder.trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }
    records[key] = value;
  }
  return records;
};

const serializeEnv = (records: Record<string, string>) =>
  Object.entries(records)
    .map(([key, value]) => `${key}="${value.replace(/"/g, '\\"')}"`)
    .join('\n');

const encryptWithGpg = async (data: string, recipient: string, output: string) => {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('gpg', ['--batch', '--yes', '--encrypt', '--recipient', recipient, '--output', output], {
      stdio: ['pipe', 'inherit', 'inherit']
    });
    child.on('error', (error) => reject(error));
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`gpg exited with code ${code}`));
      }
    });
    child.stdin.end(data, 'utf8');
  });
};

const keyringHandlers: Record<string, CommandHandler> = {
  async backend(args) {
    const action = args.shift();
    if (!action || action === 'list') {
      await keyringManager.list();
      console.log(`Active backend: ${keyringManager.currentBackend()}`);
      console.log(`Available: ${AVAILABLE_BACKENDS.join(', ')}`);
      return;
    }
    if (action === 'switch') {
      const target = args.shift();
      if (!target) {
        throw new Error('Backend name is required.');
      }
      await ensureBackend(target);
      console.log(`Switched to backend: ${keyringManager.currentBackend()}`);
      return;
    }
    throw new Error(`Unsupported backend action '${action}'.`);
  },

  async list(args) {
    const backend = takeOption(args, '--backend');
    await ensureBackend(backend);
    const secrets = await keyringManager.list();
    if (Object.keys(secrets).length === 0) {
      console.log('No keyring entries found.');
      return;
    }
    for (const [key, value] of Object.entries(secrets)) {
      console.log(`${key}: ${maskSecret(value)}`);
    }
  },

  async set(args) {
    const backend = takeOption(args, '--backend');
    const key = args.shift();
    const value = args.shift();
    if (!key || typeof value !== 'string') {
      throw new Error('Usage: gnoman keyring set <key> <value>');
    }
    await ensureBackend(backend);
    await keyringManager.set(key, value);
    console.log(`Stored secret '${key}'.`);
  },

  async add(args) {
    await keyringHandlers.set(args);
  },

  async edit(args) {
    await keyringHandlers.set(args);
  },

  async get(args) {
    const backend = takeOption(args, '--backend');
    const key = args.shift();
    if (!key) {
      throw new Error('Usage: gnoman keyring get <key>');
    }
    await ensureBackend(backend);
    const value = await keyringManager.get(key);
    if (value === null) {
      console.error('Secret not found.');
      process.exitCode = 1;
      return;
    }
    console.log(value);
  },

  async delete(args) {
    const backend = takeOption(args, '--backend');
    const key = args.shift();
    if (!key) {
      throw new Error('Usage: gnoman keyring delete <key>');
    }
    await ensureBackend(backend);
    await keyringManager.delete(key);
    console.log(`Deleted secret '${key}'.`);
  },

  async remove(args) {
    await keyringHandlers.delete(args);
  },

  async export(args) {
    const backend = takeOption(args, '--backend');
    const format = (takeOption(args, '--format') ?? 'json').toLowerCase();
    const output = takeOption(args, '--output');
    const gpgRecipient = takeOption(args, '--gpg');
    await ensureBackend(backend);
    const secrets = await keyringManager.list();
    let payload: string;
    if (format === 'env') {
      payload = `${serializeEnv(secrets)}\n`;
    } else if (format === 'json') {
      payload = `${JSON.stringify(secrets, null, 2)}\n`;
    } else {
      throw new Error(`Unsupported export format '${format}'. Use env or json.`);
    }
    if (gpgRecipient) {
      if (!output) {
        throw new Error('The --output option is required when using --gpg.');
      }
      await encryptWithGpg(payload, gpgRecipient, output);
      console.log(`Exported secrets to ${output} using GPG recipient ${gpgRecipient}.`);
      return;
    }
    if (output) {
      await ensureFileOutput(output, payload);
      console.log(`Exported secrets to ${output}.`);
    } else {
      process.stdout.write(payload);
    }
  },

  async import(args) {
    const backend = takeOption(args, '--backend');
    const format = (takeOption(args, '--format') ?? 'json').toLowerCase();
    const source = args.shift();
    if (!source) {
      throw new Error('Usage: gnoman keyring import <file> [--format env|json]');
    }
    await ensureBackend(backend);
    const content = await readSource(source);
    let records: Record<string, string>;
    if (format === 'env') {
      records = parseEnvFile(content);
    } else if (format === 'json') {
      const parsed = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Invalid JSON payload for keyring import.');
      }
      records = Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => typeof value === 'string') as [string, string][]
      );
    } else {
      throw new Error(`Unsupported import format '${format}'. Use env or json.`);
    }
    for (const [key, value] of Object.entries(records)) {
      await keyringManager.set(key, value);
    }
    console.log(`Imported ${Object.keys(records).length} secrets into backend ${keyringManager.currentBackend()}.`);
  }
};

const walletHandlers: Record<string, CommandHandler> = {
  async list(_args) {
    const wallets = await listWalletMetadata();
    if (wallets.length === 0) {
      console.log('No wallets stored.');
      return;
    }
    for (const wallet of wallets) {
      console.log(`${wallet.address} (${wallet.alias ?? 'unnamed'})`);
    }
  },

  async export(args) {
    const address = args.shift();
    const password = takeOption(args, '--password');
    const output = takeOption(args, '--output');
    if (!address || !password) {
      throw new Error('Usage: gnoman wallets export <address> --password <password> [--output <file>]');
    }
    const keystore = await exportWallet(address, password);
    if (output) {
      await ensureFileOutput(output, `${keystore}\n`);
      console.log(`Exported wallet ${address} to ${output}.`);
    } else {
      process.stdout.write(`${keystore}\n`);
    }
  },

  async import(args) {
    const source = args.shift();
    const password = takeOption(args, '--password');
    const alias = takeOption(args, '--alias');
    const hidden = takeFlag(args, '--hidden');
    if (!source || !password) {
      throw new Error('Usage: gnoman wallets import <file> --password <password> [--alias <alias>] [--hidden]');
    }
    const json = await readSource(source);
    const wallet = await importWalletFromEncryptedJson({ json, password, alias, hidden });
    console.log(`Imported wallet ${wallet.address} (${wallet.alias ?? 'unnamed'}).`);
  }
};

const printHelp = () => {
  console.log(`GNOMAN CLI

Usage:
  gnoman keyring <command> [...args]
  gnoman wallets <command> [...args]

Keyring commands:
  keyring backend list
  keyring backend switch <system|file|memory>
  keyring list [--backend <name>]
  keyring set <key> <value> [--backend <name>]
  keyring get <key> [--backend <name>]
  keyring delete <key> [--backend <name>]
  keyring export [--format env|json] [--output <file>] [--gpg <recipient>] [--backend <name>]
  keyring import <file|-> [--format env|json] [--backend <name>]

Wallet commands:
  wallets list
  wallets export <address> --password <password> [--output <file>]
  wallets import <file|-> --password <password> [--alias <alias>] [--hidden]
`);
};

const handlers: Record<string, Record<string, CommandHandler>> = {
  keyring: keyringHandlers,
  wallets: walletHandlers
};

const main = async () => {
  const args = process.argv.slice(2);
  const namespace = args.shift();
  if (!namespace) {
    printHelp();
    return;
  }
  const group = handlers[namespace as keyof typeof handlers];
  if (!group) {
    throw new Error(`Unknown command group '${namespace}'.`);
  }
  const subcommand = args.shift() ?? 'list';
  const handler = group[subcommand];
  if (!handler) {
    throw new Error(`Unknown ${namespace} command '${subcommand}'.`);
  }
  await handler(args);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
