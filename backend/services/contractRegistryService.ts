import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

export interface ContractRecord {
  id: string;
  address: string;
  name?: string;
  network?: string;
  tags?: string[];
  type?: string;
  createdAt: string;
  updatedAt: string;
}

interface ContractStorePayload {
  version: number;
  contracts: ContractRecord[];
}

const storageDir = path.join(process.cwd(), '.gnoman');
const contractsPath = path.join(storageDir, 'contracts.json');
const contracts = new Map<string, ContractRecord>();

const ensureStorageDir = () => {
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
};

const normalizeTags = (tags?: string[]) => {
  if (!tags) {
    return undefined;
  }
  const normalized = tags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return normalized.length ? Array.from(new Set(normalized)) : undefined;
};

const loadContracts = () => {
  try {
    ensureStorageDir();
    if (!fs.existsSync(contractsPath)) {
      return;
    }
    const raw = fs.readFileSync(contractsPath, 'utf8');
    if (!raw.trim()) {
      return;
    }
    const payload = JSON.parse(raw) as Partial<ContractStorePayload> | ContractRecord[];
    const records = Array.isArray(payload) ? payload : payload.contracts;
    if (!Array.isArray(records)) {
      return;
    }
    contracts.clear();
    for (const record of records) {
      if (!record.address || !record.id) {
        continue;
      }
      contracts.set(record.id, { ...record });
    }
  } catch (error) {
    console.error('Failed to load contracts', error);
  }
};

const persistContracts = () => {
  try {
    ensureStorageDir();
    const payload: ContractStorePayload = {
      version: 1,
      contracts: Array.from(contracts.values()).map((record) => ({ ...record }))
    };
    fs.writeFileSync(contractsPath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to persist contracts', error);
  }
};

loadContracts();

export const listContracts = () => {
  return Array.from(contracts.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
};

export const addContract = ({
  address,
  name,
  network,
  tags,
  type
}: {
  address: string;
  name?: string;
  network?: string;
  tags?: string[];
  type?: string;
}) => {
  const normalizedAddress = ethers.getAddress(address);
  const now = new Date().toISOString();
  const existing = Array.from(contracts.values()).find(
    (record) => record.address.toLowerCase() === normalizedAddress.toLowerCase()
  );
  const record: ContractRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    address: normalizedAddress,
    name: name?.trim() ? name.trim() : existing?.name,
    network: network?.trim() ? network.trim() : existing?.network,
    tags: normalizeTags(tags) ?? existing?.tags,
    type: type?.trim() ? type.trim() : existing?.type,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  contracts.set(record.id, record);
  persistContracts();
  return record;
};

export const removeContract = (id: string) => {
  const existing = contracts.get(id);
  if (!existing) {
    return undefined;
  }
  contracts.delete(id);
  persistContracts();
  return existing;
};
