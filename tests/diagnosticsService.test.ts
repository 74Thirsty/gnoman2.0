import fs from 'fs/promises';
import path from 'path';
import { runSystemDiagnostics } from '../backend/services/diagnosticsService';

describe('runSystemDiagnostics', () => {
  const logsPath = path.join(process.cwd(), 'logs');
  const safevaultPath = path.join(process.cwd(), '.safevault');
  let removeLogs = false;
  let removeSafevault = false;

  beforeAll(async () => {
    removeLogs = await fs
      .access(logsPath)
      .then(() => false)
      .catch(() => true);
    removeSafevault = await fs
      .access(safevaultPath)
      .then(() => false)
      .catch(() => true);
    if (removeLogs) {
      await fs.rm(logsPath, { recursive: true, force: true });
    }
    if (removeSafevault) {
      await fs.rm(safevaultPath, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    if (removeLogs) {
      await fs.rm(logsPath, { recursive: true, force: true });
    }
    if (removeSafevault) {
      await fs.rm(safevaultPath, { recursive: true, force: true });
    }
  });

  it('produces a consistent report snapshot', async () => {
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
    await fs.rm(logsPath, { recursive: true, force: true });
    const report = await runSystemDiagnostics({ autoFix: true, skipGpg: true });
    const logsCheck = report.checks.find((check) => check.id === 'logs-dir');
    expect(logsCheck?.status).toBe('ok');
    await expect(fs.stat(logsPath)).resolves.toBeDefined();
  });
});
