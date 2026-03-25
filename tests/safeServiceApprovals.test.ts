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
});
