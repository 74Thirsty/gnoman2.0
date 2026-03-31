import type { InterfaceAbi } from 'ethers';

export interface AbiLoadRequest {
  abi: string | InterfaceAbi;
  name?: string;
}

export interface AbiFunctionInput {
  name: string;
  type: string;
  internalType?: string;
  indexed?: boolean;
}

export interface AbiFunctionDescription {
  name: string;
  stateMutability: string;
  inputs: AbiFunctionInput[];
  outputs: AbiFunctionInput[];
  payable: boolean;
  constant: boolean;
}

export interface SimulationParameterMap {
  [parameterName: string]: unknown;
}

export interface ContractSimulationRequest {
  rpcUrl: string;
  contractAddress: string;
  functionName: string;
  parameters: SimulationParameterMap;
  value?: string;
  fork?: boolean;
  forkBlockNumber?: number;
  forkRpcUrl?: string;
  gasLimit?: string;
  from?: string;
}

export interface ContractSimulationResult {
  id: string;
  timestamp: string;
  success: boolean;
  network: {
    chainId: number;
    name: string;
  } | null;
  gasUsed?: string;
  gasEstimate?: string;
  gasLimit?: string;
  returnData?: unknown;
  decodedReturnData?: unknown;
  logs?: Array<Record<string, unknown>>;
  error?: string;
  revertReason?: string;
  trace?: unknown;
  callData: string;
  functionName: string;
  contractAddress: string;
  parameters: SimulationParameterMap;
  forkMode: boolean;
  rpcUrl: string;
  value?: string;
}

export interface SafeSimulationRequest extends ContractSimulationRequest {
  safeAddress: string;
  safeNonce?: number;
  safeThreshold?: number;
  operation?: number;
  gasToken?: string;
  refundReceiver?: string;
}

export interface SandboxLogEntry extends ContractSimulationResult {
  signer?: string;
}

export interface AbiMetadata {
  name: string;
  abi: InterfaceAbi;
  functions: AbiFunctionDescription[];
}
