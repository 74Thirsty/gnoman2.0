import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { EventFragment, FunctionFragment, Interface, ParamType, type InterfaceAbi, ethers } from 'ethers';

export interface ContractAbiParam {
  name: string;
  type: string;
  internalType?: string;
  indexed?: boolean;
}

export interface ContractAbiFunction {
  name: string;
  signature: string;
  selector: string;
  stateMutability: string;
  inputs: ContractAbiParam[];
  outputs: ContractAbiParam[];
  payable: boolean;
  constant: boolean;
}

export interface ContractAbiEvent {
  name: string;
  signature: string;
  topic: string;
  inputs: ContractAbiParam[];
  anonymous: boolean;
}

export interface ContractRecord {
  id: string;
  address: string;
  name?: string;
  network?: string;
  tags?: string[];
  type?: string;
  abi?: InterfaceAbi;
  abiFunctions?: ContractAbiFunction[];
  abiEvents?: ContractAbiEvent[];
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

const mapAbiParam = (fragment: ParamType): ContractAbiParam => ({
  name: fragment.name,
  type: fragment.type,
  internalType: (fragment as { internalType?: string }).internalType,
  indexed:
    (fragment as { indexed?: boolean | null }).indexed === null
      ? undefined
      : (fragment as { indexed?: boolean | null }).indexed ?? undefined
});

const extractAbiEntities = (abi: string | InterfaceAbi) => {
  const abiJson: InterfaceAbi = typeof abi === 'string' ? JSON.parse(abi) : abi;
  const iface = new Interface(abiJson);
  const functionFragments = iface.fragments.filter(
    (fragment): fragment is FunctionFragment => fragment.type === 'function'
  );
  const eventFragments = iface.fragments.filter(
    (fragment): fragment is EventFragment => fragment.type === 'event'
  );
  const abiFunctions: ContractAbiFunction[] = functionFragments.map((fn) => ({
    name: fn.name,
    signature: fn.format(),
    selector: fn.selector,
    stateMutability: fn.stateMutability,
    inputs: fn.inputs.map(mapAbiParam),
    outputs: fn.outputs?.map(mapAbiParam) ?? [],
    payable: fn.payable,
    constant: fn.constant ?? false
  }));
  const abiEvents: ContractAbiEvent[] = eventFragments.map((event) => ({
    name: event.name,
    signature: event.format(),
    topic: event.topicHash,
    inputs: event.inputs.map(mapAbiParam),
    anonymous: event.anonymous ?? false
  }));
  return { abiJson, abiFunctions, abiEvents };
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
  type,
  abi
}: {
  address: string;
  name?: string;
  network?: string;
  tags?: string[];
  type?: string;
  abi?: string | InterfaceAbi;
}) => {
  const normalizedAddress = ethers.getAddress(address);
  const now = new Date().toISOString();
  const existing = Array.from(contracts.values()).find(
    (record) => record.address.toLowerCase() === normalizedAddress.toLowerCase()
  );
  const parsedAbi = abi ? extractAbiEntities(abi) : undefined;
  const record: ContractRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    address: normalizedAddress,
    name: name?.trim() ? name.trim() : existing?.name,
    network: network?.trim() ? network.trim() : existing?.network,
    tags: normalizeTags(tags) ?? existing?.tags,
    type: type?.trim() ? type.trim() : existing?.type,
    abi: parsedAbi?.abiJson ?? existing?.abi,
    abiFunctions: parsedAbi?.abiFunctions ?? existing?.abiFunctions,
    abiEvents: parsedAbi?.abiEvents ?? existing?.abiEvents,
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
