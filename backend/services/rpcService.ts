import { ethers } from 'ethers';
import keyringAccessor from './keyringAccessor';

export const resolveRpcUrl = async (preferred?: string) => {
  const trimmed = preferred?.trim();
  if (trimmed) {
    return trimmed;
  }
  const envRpc =
    process.env.GNOMAN_RPC_URL ??
    process.env.SAFE_RPC_URL ??
    process.env.RPC_URL;
  if (envRpc && envRpc.trim()) {
    return envRpc.trim();
  }
  try {
    const keyringRpc =
      (await keyringAccessor.get('RPC_URL')) ??
      (await keyringAccessor.get('SAFE_RPC_URL')) ??
      (await keyringAccessor.get('GNOMAN_RPC_URL'));
    if (keyringRpc && keyringRpc.trim()) {
      return keyringRpc.trim();
    }
  } catch (error) {
    console.warn('Unable to read RPC URL from keyring', error);
  }
  return undefined;
};

export const requireRpcUrl = async (preferred?: string) => {
  const rpcUrl = await resolveRpcUrl(preferred);
  if (!rpcUrl) {
    throw new Error('RPC URL missing. Configure GNOMAN_RPC_URL or store RPC_URL in the keyring.');
  }
  return rpcUrl;
};

export const formatEtherBalance = (value: bigint) => {
  const formatted = ethers.formatEther(value);
  const [whole, fraction = ''] = formatted.split('.');
  const paddedFraction = fraction.padEnd(4, '0').slice(0, 4);
  return `${whole}.${paddedFraction}`;
};

export const getBalance = async (address: string, preferredRpcUrl?: string) => {
  const rpcUrl = await resolveRpcUrl(preferredRpcUrl);
  if (!rpcUrl) {
    return undefined;
  }
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(address);
    return formatEtherBalance(balance);
  } catch (error) {
    console.warn('Unable to fetch balance', error);
    return undefined;
  }
};
