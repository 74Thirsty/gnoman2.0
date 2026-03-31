import { ethers } from 'ethers';
import { secretsResolver } from '../utils/secretsResolver';

export const resolveRpcUrl = async (preferred?: string) => {
  const trimmed = preferred?.trim();
  if (trimmed) {
    return trimmed;
  }
  const resolved =
    (await secretsResolver.resolve('GNOMAN_RPC_URL', { failClosed: false })) ??
    (await secretsResolver.resolve('SAFE_RPC_URL', { failClosed: false })) ??
    (await secretsResolver.resolve('RPC_URL', { failClosed: false }));
  return resolved?.trim() || undefined;
};

export const requireRpcUrl = async (preferred?: string) => {
  const rpcUrl = await resolveRpcUrl(preferred);
  if (!rpcUrl) {
    throw new Error('RPC URL missing. Configure GNOMAN_RPC_URL or encrypted local secrets file.');
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
