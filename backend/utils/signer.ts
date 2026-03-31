import { JsonRpcProvider, Wallet } from 'ethers';
import { requireRpcUrl } from '../services/rpcService';

export const createBackendSigner = async (preferredRpcUrl?: string) => {
  const privateKey = process.env.PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error('PRIVATE_KEY is missing. Configure PRIVATE_KEY in the backend environment.');
  }
  const rpcUrl = await requireRpcUrl(preferredRpcUrl ?? process.env.RPC_URL);
  return new Wallet(privateKey, new JsonRpcProvider(rpcUrl));
};
