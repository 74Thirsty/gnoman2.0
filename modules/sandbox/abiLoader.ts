import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { Interface, FunctionFragment, ParamType, type InterfaceAbi } from 'ethers';
import type { AbiFunctionDescription, AbiFunctionInput, AbiLoadRequest, AbiMetadata } from './types';

const SAFE_ABI_CANDIDATES = [
  path.join(__dirname, 'safe.abi.json'),
  path.join(process.cwd(), 'modules/sandbox/safe.abi.json')
];

const resolveSafeAbiPath = () => {
  for (const candidate of SAFE_ABI_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return SAFE_ABI_CANDIDATES[0];
};

export const loadSafeAbi = (): AbiMetadata => {
  const abiSource = readFileSync(resolveSafeAbiPath(), 'utf8');
  return parseAbi({ abi: abiSource, name: 'Safe' });
};

export const parseAbi = ({ abi, name }: AbiLoadRequest): AbiMetadata => {
  const abiJson: InterfaceAbi = typeof abi === 'string' ? JSON.parse(abi) : abi;
  const iface = new Interface(abiJson);
  const functionFragments = iface.fragments.filter((fragment): fragment is FunctionFragment => fragment.type === 'function');
  const functions: AbiFunctionDescription[] = functionFragments.map((fn) => ({
    name: fn.name,
    stateMutability: fn.stateMutability,
    inputs: fn.inputs.map(mapParam),
    outputs: fn.outputs?.map(mapParam) ?? [],
    payable: fn.payable,
    constant: fn.constant ?? false
  }));

  return {
    name: name ?? functionFragments[0]?.name ?? 'Contract',
    abi: abiJson,
    functions
  };
};

const mapParam = (fragment: ParamType): AbiFunctionInput => ({
  name: fragment.name,
  type: fragment.type,
  internalType: (fragment as { internalType?: string }).internalType,
  indexed:
    (fragment as { indexed?: boolean | null }).indexed === null
      ? undefined
      : (fragment as { indexed?: boolean | null }).indexed ?? undefined
});

export const loadAbiFromFile = (filePath: string, name?: string): AbiMetadata => {
  if (!existsSync(filePath)) {
    throw new Error(`ABI file not found at ${filePath}`);
  }
  const raw = readFileSync(filePath, 'utf8');
  return parseAbi({ abi: raw, name: name ?? path.basename(filePath) });
};

export const validateFunctionExists = (metadata: AbiMetadata, functionName: string) => {
  const exists = metadata.functions.some((fn) => fn.name === functionName);
  if (!exists) {
    throw new Error(`Function ${functionName} not found in ABI ${metadata.name}`);
  }
};

export const requireSafeAbi = (): AbiMetadata => {
  const safePath = resolveSafeAbiPath();
  if (!existsSync(safePath)) {
    throw new Error('Safe ABI definition missing');
  }
  const abiSource = readFileSync(safePath, 'utf8');
  return parseAbi({ abi: abiSource, name: 'Safe' });
};

