import fs from 'fs';
import os from 'os';
import path from 'path';
import { ethers } from 'ethers';

const originalCwd = process.cwd();
const allowanceInterface = new ethers.Interface([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]);

const SAFE_ADDRESS = '0x1111111111111111111111111111111111111111';
const MODULE_ADDRESS = '0x2222222222222222222222222222222222222222';
const TOKEN_ADDRESS = '0x3333333333333333333333333333333333333333';
const UNSUPPORTED_TOKEN_ADDRESS = '0x4444444444444444444444444444444444444444';
const HISTORICAL_SPENDER = '0x5555555555555555555555555555555555555555';
const REGISTRY_SPENDER = '0x6666666666666666666666666666666666666666';

const historicalApproveData = allowanceInterface.encodeFunctionData('approve', [HISTORICAL_SPENDER, 123n]);

jest.mock('../backend/services/transactionHoldService', () => ({
  holdService: {
    createHold: jest.fn(async () => null),
    getHoldState: jest.fn(() => ({ safeAddress: SAFE_ADDRESS, enabled: true, holdHours: 24, updatedAt: 'now' })),
    summarize: jest.fn(() => ({ executed: 0, pending: 0 })),
    getEffectivePolicy: jest.fn(async (address: string) => ({ global: { enabled: true, holdHours: 24 }, local: { safeAddress: address, enabled: true, holdHours: 24, updatedAt: 'now' } }))
  }
}));

const mockGetCode = jest.spyOn(ethers.JsonRpcProvider.prototype, 'getCode');
const mockCall = jest.spyOn(ethers.JsonRpcProvider.prototype, 'call');

const encodeAllowanceResult = (amount: bigint) =>
  allowanceInterface.encodeFunctionResult('allowance', [amount]);

const encodeApproveResult = () => allowanceInterface.encodeFunctionResult('approve', [true]);

describe('safeService allowance revocation flow', () => {
  let workspace: string;
  let safesPath: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gnoman-safe-allowances-'));
    process.chdir(workspace);
    fs.mkdirSync(path.join(workspace, '.gnoman'), { recursive: true });
    safesPath = path.join(workspace, '.gnoman', 'safes.json');
    fs.writeFileSync(
      safesPath,
      JSON.stringify(
        {
          version: 1,
          safes: [
            {
              address: SAFE_ADDRESS,
              rpcUrl: 'http://localhost:8545',
              owners: ['0x7777777777777777777777777777777777777777'],
              threshold: 1,
              modules: [MODULE_ADDRESS],
              delegates: [],
              transactions: [
                {
                  hash: '0xabc',
                  payload: {
                    to: TOKEN_ADDRESS,
                    data: historicalApproveData,
                    value: '0',
                    methodSignature: 'approve(address,uint256)'
                  },
                  approvals: [],
                  createdAt: '2024-01-01T00:00:00.000Z',
                  executed: false
                }
              ]
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    );

    mockGetCode.mockImplementation(async (target) => {
      const normalized = ethers.getAddress(target as string);
      if ([TOKEN_ADDRESS, UNSUPPORTED_TOKEN_ADDRESS].includes(normalized)) {
        return '0x1234';
      }
      return '0x';
    });

    mockCall.mockImplementation(async (tx) => {
      const to = ethers.getAddress(tx.to as string);
      const data = tx.data as string;
      if (to === UNSUPPORTED_TOKEN_ADDRESS && data.startsWith(allowanceInterface.getFunction('allowance')!.selector)) {
        throw new Error('allowance reverted');
      }
      if (data.startsWith(allowanceInterface.getFunction('allowance')!.selector)) {
        const [, spender] = allowanceInterface.decodeFunctionData('allowance', data);
        const normalizedSpender = ethers.getAddress(spender);
        if (to === TOKEN_ADDRESS && normalizedSpender === HISTORICAL_SPENDER) {
          return encodeAllowanceResult(100n);
        }
        if (to === TOKEN_ADDRESS && normalizedSpender === REGISTRY_SPENDER) {
          return encodeAllowanceResult(75n);
        }
        return encodeAllowanceResult(0n);
      }
      if (data.startsWith(allowanceInterface.getFunction('approve')!.selector)) {
        const [spender, amount] = allowanceInterface.decodeFunctionData('approve', data);
        expect(amount).toBe(0n);
        expect(tx.from).toBe(SAFE_ADDRESS);
        if (to === TOKEN_ADDRESS && [HISTORICAL_SPENDER, REGISTRY_SPENDER].includes(ethers.getAddress(spender))) {
          return encodeApproveResult();
        }
        throw new Error('approve reverted');
      }
      throw new Error(`unexpected call ${data}`);
    });
  });

  afterEach(() => {
    jest.resetModules();
    mockGetCode.mockReset();
    mockCall.mockReset();
    process.chdir(originalCwd);
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  afterAll(() => {
    mockGetCode.mockRestore();
    mockCall.mockRestore();
  });

  it('discovers active allowances, skips unsupported tokens, and produces deterministic revoke batches', async () => {
    const { addContract } = await import('../backend/services/contractRegistryService');
    addContract({ address: TOKEN_ADDRESS, type: 'erc20', tags: ['token'] });
    addContract({ address: UNSUPPORTED_TOKEN_ADDRESS, type: 'erc20', tags: ['token'] });
    addContract({ address: REGISTRY_SPENDER, type: 'protocol', tags: ['dex'] });

    const safeService = await import('../backend/services/safeService');

    const discovery = await safeService.discoverAllowanceRevocations(SAFE_ADDRESS);
    expect(discovery.approvals).toEqual([
      { token: TOKEN_ADDRESS, spender: HISTORICAL_SPENDER, allowance: '100' },
      { token: TOKEN_ADDRESS, spender: REGISTRY_SPENDER, allowance: '75' }
    ]);
    expect(discovery.unsupported).toEqual(
      expect.arrayContaining([expect.objectContaining({ token: UNSUPPORTED_TOKEN_ADDRESS })])
    );

    const firstProposal = await safeService.proposeAllowanceRevocations(SAFE_ADDRESS, { chunkSize: 1 });
    expect(firstProposal.batches).toHaveLength(2);
    expect(firstProposal.batches.every((batch) => batch.existing === false)).toBe(true);
    expect(firstProposal.batches.map((batch) => batch.calls[0])).toEqual([
      {
        target: TOKEN_ADDRESS,
        data: allowanceInterface.encodeFunctionData('approve', [HISTORICAL_SPENDER, 0n]),
        value: '0'
      },
      {
        target: TOKEN_ADDRESS,
        data: allowanceInterface.encodeFunctionData('approve', [REGISTRY_SPENDER, 0n]),
        value: '0'
      }
    ]);

    const secondProposal = await safeService.proposeAllowanceRevocations(SAFE_ADDRESS, { chunkSize: 1 });
    expect(secondProposal.batches.map((batch) => batch.txHash)).toEqual(
      firstProposal.batches.map((batch) => batch.txHash)
    );
    expect(secondProposal.batches.every((batch) => batch.existing === true)).toBe(true);
  });
});
