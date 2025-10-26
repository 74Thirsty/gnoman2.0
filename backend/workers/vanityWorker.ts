import { parentPort, workerData } from 'worker_threads';
import { ethers } from 'ethers';

interface VanityWorkerData {
  prefix?: string;
  suffix?: string;
  regex?: string;
  maxAttempts: number;
  derivationPath: string;
  progressInterval?: number;
}

const { prefix, suffix, regex: regexPattern, maxAttempts, derivationPath, progressInterval } =
  workerData as VanityWorkerData;
const normalizedPrefix = prefix?.replace(/^0x/i, '').toLowerCase();
const normalizedSuffix = suffix?.replace(/^0x/i, '').toLowerCase();
const regex = regexPattern ? new RegExp(regexPattern, 'i') : undefined;

let cancelled = false;
let attempts = 0;
const startedAt = Date.now();
const attemptModulo = Math.max(100, progressInterval ?? 5000);
let lastReport = startedAt;

parentPort?.on('message', (message: { type: 'cancel' }) => {
  if (message.type === 'cancel') {
    cancelled = true;
  }
});

const reportProgress = () => {
  parentPort?.postMessage({
    type: 'progress',
    attempts,
    elapsedMs: Date.now() - startedAt
  });
};

const matchesPattern = (address: string) => {
  const normalized = address.toLowerCase().replace(/^0x/, '');
  const prefixMatch = normalizedPrefix ? normalized.startsWith(normalizedPrefix) : true;
  const suffixMatch = normalizedSuffix ? normalized.endsWith(normalizedSuffix) : true;
  const regexMatch = regex ? regex.test(address) : true;
  return prefixMatch && suffixMatch && regexMatch;
};

(async () => {
  while (!cancelled && (maxAttempts <= 0 || attempts < maxAttempts)) {
    const wallet = ethers.Wallet.createRandom({ path: derivationPath });
    attempts += 1;
    if (matchesPattern(wallet.address)) {
      parentPort?.postMessage({
        type: 'result',
        address: wallet.address,
        mnemonic: wallet.mnemonic?.phrase,
        derivationPath: wallet.path,
        attempts,
        elapsedMs: Date.now() - startedAt
      });
      return;
    }
    if (attempts % attemptModulo === 0 || Date.now() - lastReport >= 2000) {
      reportProgress();
      lastReport = Date.now();
    }
  }
  parentPort?.postMessage({
    type: 'complete',
    attempts,
    elapsedMs: Date.now() - startedAt,
    cancelled,
    success: false
  });
})();
