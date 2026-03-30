import fs from 'fs';
import path from 'path';

jest.mock('../backend/services/walletService', () => ({
  getDecryptedSigner: jest.fn(),
}));

const storageDir = path.join(process.cwd(), '.gnoman');
const safesPath = path.join(storageDir, 'safes.json');

describe('safeService approval management', () => {
  let backup: string | undefined;

  beforeAll(() => {
    fs.mkdirSync(storageDir, { recursive: true });
    if (fs.existsSync(safesPath)) {
      backup = fs.readFileSync(safesPath, 'utf8');
    }
  });

  afterEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    if (typeof backup === 'string') {
      fs.writeFileSync(safesPath, backup, 'utf8');
      return;
    }
    if (fs.existsSync(safesPath)) {
      fs.rmSync(safesPath, { force: true });
    }
  });

  it('revokes an approval and removes the matching signature', async () => {
    const txHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const signer = '0x3333333333333333333333333333333333333333';

    fs.writeFileSync(
      safesPath,
      JSON.stringify(
        {
          version: 1,
          safes: [
            {
              address: '0x1111111111111111111111111111111111111111',
              rpcUrl: 'http://localhost:8545',
              owners: [
                '0x2222222222222222222222222222222222222222',
                signer,
              ],
              threshold: 2,
              modules: [],
              delegates: [],
              transactions: [
                {
                  hash: txHash,
                  safeTransactionHash: txHash,
                  to: '0x4444444444444444444444444444444444444444',
                  value: '0',
                  data: '0x',
                  operation: 0,
                  nonce: '7',
                  signatures: [
                    { signer, data: '0x1234' },
                  ],
                  approvals: [signer],
                  createdAt: new Date().toISOString(),
                  executed: false,
                },
              ],
            },
          ],
        },
        null,
        2
      ),
      'utf8'
    );

    const safeService = await import('../backend/services/safeService');
    const updated = await safeService.revokeTransactionApproval(
      '0x1111111111111111111111111111111111111111',
      txHash,
      signer
    );

    expect(updated.approvals).toEqual([]);
    expect(updated.signatures).toEqual([]);

    const transactions = safeService.listSafeTransactionsByAddress('0x1111111111111111111111111111111111111111');
    expect(transactions[0].approvals).toEqual([]);
    expect(transactions[0].signatures).toEqual([]);
  });

  it('adds approval signatures up to threshold and persists in tx queue', async () => {
    const txHash = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const signer = '0x5CbDd86a2FA8Dc4bDdd8a8f69dBa48572EeC07FB';

    fs.writeFileSync(
      safesPath,
      JSON.stringify(
        {
          version: 1,
          safes: [
            {
              address: '0x1111111111111111111111111111111111111111',
              rpcUrl: 'http://localhost:8545',
              owners: [
                signer,
                '0x2222222222222222222222222222222222222222',
              ],
              threshold: 2,
              modules: [],
              delegates: [],
              transactions: [
                {
                  hash: txHash,
                  safeTransactionHash: txHash,
                  to: '0x4444444444444444444444444444444444444444',
                  value: '0',
                  data: '0x',
                  operation: 0,
                  nonce: '8',
                  signatures: [],
                  approvals: [],
                  createdAt: new Date().toISOString(),
                  executed: false,
                },
              ],
            },
          ],
        },
        null,
        2
      ),
      'utf8'
    );

    const wallet = { privateKey: '0x59c6995e998f97a5a0044966f094538f5f9f7f53b9ce5f5f6f89f8d5f9a11df2' };
    const walletService = await import('../backend/services/walletService');
    (walletService.getDecryptedSigner as jest.Mock).mockReturnValue(wallet);

    const safeService = await import('../backend/services/safeService');
    const updated = await safeService.addTransactionApproval(
      '0x1111111111111111111111111111111111111111',
      txHash,
      signer
    );

    expect(updated.approvals).toEqual([signer]);
    expect(updated.signatures).toHaveLength(1);

    const transactions = safeService.listSafeTransactionsByAddress('0x1111111111111111111111111111111111111111');
    expect(transactions[0].approvals).toEqual([signer]);
    expect(transactions[0].signatures).toHaveLength(1);
  });

});
