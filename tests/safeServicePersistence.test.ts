import fs from 'fs';
import os from 'os';
import path from 'path';

const originalCwd = process.cwd();

describe('safeService persisted state loading', () => {
  let workspace: string;
  let storageDir: string;
  let safesPath: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gnoman-safe-service-'));
    process.chdir(workspace);
    storageDir = path.join(workspace, '.gnoman');
    safesPath = path.join(storageDir, 'safes.json');
    fs.mkdirSync(storageDir, { recursive: true });
  });

  afterEach(() => {
    jest.resetModules();
    process.chdir(originalCwd);
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('loads valid safes even when persisted payload includes malformed entries', async () => {
    fs.writeFileSync(
      safesPath,
      JSON.stringify(
        {
          version: 1,
          safes: [
            {
              address: '0x1111111111111111111111111111111111111111',
              rpcUrl: 'http://localhost:8545',
              owners: ['0x2222222222222222222222222222222222222222', 'bad-owner'],
              threshold: 1,
              modules: ['0x3333333333333333333333333333333333333333', 'bad-module'],
              delegates: [
                {
                  address: '0x4444444444444444444444444444444444444444',
                  label: 'Ops',
                  since: '2024-01-01T00:00:00.000Z'
                },
                {
                  address: 'not-an-address',
                  label: 'Invalid',
                  since: '2024-01-01T00:00:00.000Z'
                }
              ],
              transactions: []
            },
            {
              address: 'invalid-safe-address',
              rpcUrl: 'http://localhost:8545',
              owners: [],
              threshold: 1,
              modules: [],
              delegates: [],
              transactions: []
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    );

    const safeService = await import('../backend/services/safeService');
    const owners = await safeService.getOwners('0x1111111111111111111111111111111111111111');

    expect(owners).toEqual(['0x2222222222222222222222222222222222222222']);
    await expect(safeService.getOwners('0x5555555555555555555555555555555555555555')).rejects.toThrow('Safe not loaded');
  });
});
