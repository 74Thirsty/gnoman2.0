import fs from 'fs/promises';
import os from 'os';
import path from 'path';

jest.mock('../backend/services/walletStore', () => ({
  walletRepository: {
    list: jest.fn(() => [])
  }
}));

const originalCwd = process.cwd();

describe('runSystemDiagnostics', () => {
  let workspace: string;
  let logsPath: string;
  let safevaultPath: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'gnoman-diagnostics-'));
    process.chdir(workspace);
    logsPath = path.join(workspace, 'logs');
    safevaultPath = path.join(workspace, '.safevault');
    await fs.rm(logsPath, { recursive: true, force: true });
    await fs.rm(safevaultPath, { recursive: true, force: true });
    jest.resetModules();
  });

  afterEach(async () => {
    jest.resetModules();
    process.chdir(originalCwd);
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('produces a consistent report snapshot', async () => {
    const { runSystemDiagnostics } = await import('../backend/services/diagnosticsService');
    const report = await runSystemDiagnostics({ skipGpg: true });
    expect(report.generatedAt).toEqual(expect.any(String));
    expect(report.environment.cwd).toBe(process.cwd());
    expect(report.summary.total).toBe(report.checks.length);

    const nodeCheck = report.checks.find((check) => check.id === 'node-version');
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck?.metadata).toEqual(
      expect.objectContaining({ current: process.version })
    );

    const walletCheck = report.checks.find((check) => check.id === 'wallet-inventory');
    expect(walletCheck).toBeDefined();
    expect(walletCheck?.metadata).toEqual(
      expect.objectContaining({ count: expect.any(Number) })
    );

    const keyringChecks = report.checks.filter((check) => check.id.startsWith('keyring-'));
    expect(keyringChecks.map((check) => check.id)).toEqual(
      expect.arrayContaining(['keyring-system', 'keyring-file', 'keyring-memory'])
    );
  });

  it('auto-fix mode creates the logs directory', async () => {
    const { runSystemDiagnostics } = await import('../backend/services/diagnosticsService');
    await fs.rm(logsPath, { recursive: true, force: true });
    const report = await runSystemDiagnostics({ autoFix: true, skipGpg: true });
    const logsCheck = report.checks.find((check) => check.id === 'logs-dir');
    expect(logsCheck?.status).toBe('ok');
    await expect(fs.stat(logsPath)).resolves.toBeDefined();
  });
});
