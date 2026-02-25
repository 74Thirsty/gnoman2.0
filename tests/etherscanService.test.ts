import fs from 'fs';
import os from 'os';
import path from 'path';
import { http } from '../backend/utils/http';
import {
  resolveAbiByAddress,
  resolveAbiFileForAddress,
  _internal as etherscanInternal
} from '../backend/services/etherscanService';

describe('etherscanService ABI resolver', () => {
  const originalCwd = process.cwd();
  let workspace: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gnoman-abi-'));
    process.chdir(workspace);
    delete process.env.ETHERSCAN_API_KEY;
    delete process.env.ETHERSCAN_CHAIN_ID;
    etherscanInternal.clearCaches();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('returns cached ABI without network call', async () => {
    const address = '0x1111111111111111111111111111111111111111';
    const cachePath = path.join(workspace, 'abi', 'address', '1', `${address}.json`);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ abi: [{ type: 'function', name: 'transfer' }] }));

    const requestSpy = jest.spyOn(http, 'get');

    const abi = await resolveAbiByAddress(1, address);

    expect(requestSpy).not.toHaveBeenCalled();
    expect(abi[0]).toEqual(expect.objectContaining({ name: 'transfer' }));
  });

  it('detects proxy implementation and caches under original address', async () => {
    process.env.ETHERSCAN_API_KEY = 'test-key';
    const original = '0x2222222222222222222222222222222222222222';
    const implementation = '0x3333333333333333333333333333333333333333';

    const requestSpy = jest.spyOn(http, 'get').mockImplementation(async (_url, config) => {
      const action = (config?.params as { action?: string }).action;
      if (action === 'getsourcecode') {
        return {
          data: { status: '1', message: 'OK', result: [{ Implementation: implementation }] }
        } as never;
      }
      if (action === 'getabi') {
        expect((config?.params as { address?: string }).address).toBe(implementation.toLowerCase());
        return {
          data: {
            status: '1',
            message: 'OK',
            result: JSON.stringify([{ type: 'function', name: 'balanceOf' }])
          }
        } as never;
      }
      throw new Error(`Unexpected action: ${String(action)}`);
    });

    const resolvedPath = await resolveAbiFileForAddress(1, original, 'ERC20');

    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(resolvedPath).toContain(path.join('abi', 'address', '1', `${original.toLowerCase()}.json`));
    const metaPath = resolvedPath.replace(/\.json$/, '.meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
    expect(meta).toEqual(
      expect.objectContaining({
        chainId: 1,
        address: original.toLowerCase(),
        abiTargetAddress: implementation.toLowerCase(),
        isProxy: true,
        abiNameHint: 'ERC20',
        source: 'etherscan'
      })
    );
  });


  it('rate limits to <= 3 calls/sec under repeated resolves', async () => {
    process.env.ETHERSCAN_API_KEY = 'test-key';
    const calls: number[] = [];

    jest.spyOn(http, 'get').mockImplementation(async (_url, config) => {
      calls.push(Date.now());
      const action = (config?.params as { action?: string }).action;
      if (action === 'getsourcecode') {
        return { data: { status: '1', message: 'OK', result: [{ Implementation: '' }] } } as never;
      }
      return {
        data: { status: '1', message: 'OK', result: JSON.stringify([{ type: 'function', name: 'foo' }]) }
      } as never;
    });

    const start = Date.now();
    await resolveAbiByAddress(1, '0x5555555555555555555555555555555555555555');
    await resolveAbiByAddress(1, '0x6666666666666666666666666666666666666666');
    const elapsed = Date.now() - start;

    expect(calls.length).toBe(4);
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });

  it('fails clearly when API key is missing and no local ABI exists', async () => {
    await expect(resolveAbiByAddress(1, '0x4444444444444444444444444444444444444444')).rejects.toThrow(
      'Missing ABI and no ETHERSCAN_API_KEY configured'
    );
  });
});
