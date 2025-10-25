import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';
import fs from 'fs';

export interface ForkOptions {
  rpcUrl: string;
  blockNumber?: number;
  port?: number;
  command?: string;
  workspace?: string;
}

export interface ForkStatus {
  active: boolean;
  port?: number;
  pid?: number;
  startedAt?: string;
  rpcUrl?: string;
  blockNumber?: number;
  command?: string;
  error?: string;
}

export default class LocalFork extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private status: ForkStatus = { active: false };

  constructor(private readonly logsDir: string) {
    super();
  }

  start(options: ForkOptions) {
    if (this.process) {
      throw new Error('Fork already running');
    }

    const port = options.port ?? 8545;
    const command = options.command ?? 'anvil';
    const args = ['--fork-url', options.rpcUrl, '--port', String(port)];
    if (options.blockNumber !== undefined) {
      args.push('--fork-block-number', String(options.blockNumber));
    }

    const forkWorkspace = options.workspace ?? process.cwd();
    const logFile = path.join(this.logsDir, `fork-${Date.now()}.log`);
    const outStream = fs.createWriteStream(logFile, { flags: 'a' });

    const child = spawn(command, args, {
      cwd: forkWorkspace,
      stdio: 'pipe'
    });

    child.on('error', (error) => {
      outStream.write(String(error));
      this.status = { active: false, error: (error as Error).message };
      this.emit('error', (error as Error).message);
    });

    child.stdout.on('data', (data) => {
      outStream.write(data);
      this.emit('log', data.toString());
    });

    child.stderr.on('data', (data) => {
      outStream.write(data);
      this.emit('error', data.toString());
    });

    child.on('close', (code) => {
      outStream.close();
      this.process = null;
      this.status = { active: false, error: code ? `Fork exited with code ${code}` : undefined };
      this.emit('stop', this.status);
    });

    this.process = child;
    this.status = {
      active: true,
      port,
      pid: child.pid ?? undefined,
      startedAt: new Date().toISOString(),
      rpcUrl: `http://127.0.0.1:${port}`,
      blockNumber: options.blockNumber,
      command
    };

    this.emit('start', this.status);
    return this.status;
  }

  stop() {
    if (!this.process) {
      return this.status;
    }
    this.process.kill('SIGTERM');
    this.process = null;
    this.status = { active: false };
    this.emit('stop', this.status);
    return this.status;
  }

  getStatus(): ForkStatus {
    return this.status;
  }
}
