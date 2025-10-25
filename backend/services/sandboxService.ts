import sandboxManager from '../../modules/sandbox';
import type { ContractSimulationRequest, ContractSimulationResult, SafeSimulationRequest } from '../../modules/sandbox/types';

interface LegacyCallStaticRequest {
  rpcUrl: string;
  contractAddress: string;
  abi: string;
  method: string;
  args?: unknown[];
  value?: string;
}

interface AbiRequestBody {
  abi: string;
  name?: string;
}

interface SimulationBody extends ContractSimulationRequest {
  abi: string;
  abiName?: string;
}

export const loadAbi = ({ abi, name }: AbiRequestBody) => sandboxManager.loadAbi(abi, name);

export const listAbis = () => sandboxManager.listAbis();

export const simulateCallStatic = async (body: LegacyCallStaticRequest) => {
  const metadata = sandboxManager.loadAbi(body.abi, 'Inline ABI');
  const parameters = (body.args ?? []).reduce<Record<string, unknown>>((acc, value, index) => {
    const input = metadata.functions.find((fn) => fn.name === body.method)?.inputs[index];
    const key = input?.name ? input.name : `arg_${index}`;
    acc[key] = value;
    return acc;
  }, {});

  return sandboxManager.simulate(metadata, {
    rpcUrl: body.rpcUrl,
    contractAddress: body.contractAddress,
    functionName: body.method,
    parameters,
    value: body.value
  });
};

export const simulateContract = async (body: SimulationBody): Promise<ContractSimulationResult> => {
  const metadata = body.abiName ? sandboxManager.getAbi(body.abiName) : undefined;
  const abiMetadata = metadata ?? sandboxManager.loadAbi(body.abi, body.abiName ?? 'Contract');
  const { abi: _abi, abiName: _name, ...request } = body;
  return sandboxManager.simulate(abiMetadata, request);
};

export const simulateSafe = async (body: SafeSimulationRequest) => sandboxManager.simulateSafe(body);

export const getHistory = () => sandboxManager.getHistory();

export const clearHistory = () => sandboxManager.clearHistory();

export const startFork = (rpcUrl: string, blockNumber?: number, port?: number, command?: string) =>
  sandboxManager.startFork(rpcUrl, blockNumber, port, command);

export const stopFork = () => sandboxManager.stopFork();

export const forkStatus = () => sandboxManager.forkStatus();
