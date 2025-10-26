import sandboxManager from '../../modules/sandbox';
import type {
  ContractSimulationRequest,
  ContractSimulationResult,
  SafeSimulationRequest
} from '../../modules/sandbox/types';

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

const defaultForkCommands = ['anvil'];
const allowedForkCommands = (() => {
  const fromEnv = process.env.GNOMAN_FORK_ALLOWLIST?.split(',').map((value) => value.trim()).filter(Boolean);
  if (fromEnv && fromEnv.length > 0) {
    const normalized = new Set(fromEnv.map((command) => command.toLowerCase()));
    defaultForkCommands.forEach((command) => normalized.add(command));
    return normalized;
  }
  return new Set(defaultForkCommands.map((command) => command.toLowerCase()));
})();

const sanitizeRpcUrl = (rpcUrl: unknown) => {
  if (typeof rpcUrl !== 'string' || rpcUrl.trim().length === 0) {
    throw new Error('rpcUrl is required');
  }
  try {
    const url = new URL(rpcUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('rpcUrl must use http or https');
    }
    url.hash = '';
    return url.toString();
  } catch (error) {
    throw new Error('Invalid rpcUrl');
  }
};

const sanitizePort = (port: unknown) => {
  if (port === undefined || port === null || port === '') {
    return undefined;
  }
  if (typeof port === 'string' && port.trim().length > 0) {
    if (!/^[0-9]+$/.test(port)) {
      throw new Error('Port must be a number');
    }
    return sanitizePort(Number(port));
  }
  if (typeof port !== 'number' || !Number.isInteger(port)) {
    throw new Error('Port must be an integer');
  }
  if (port < 1024 || port > 65535) {
    throw new Error('Port must be between 1024 and 65535');
  }
  return port;
};

const sanitizeBlockNumber = (blockNumber: unknown) => {
  if (blockNumber === undefined || blockNumber === null || blockNumber === '') {
    return undefined;
  }
  if (typeof blockNumber === 'string' && blockNumber.trim().length > 0) {
    if (!/^[0-9]+$/.test(blockNumber)) {
      throw new Error('blockNumber must be a number');
    }
    return sanitizeBlockNumber(Number(blockNumber));
  }
  if (typeof blockNumber !== 'number' || !Number.isInteger(blockNumber)) {
    throw new Error('blockNumber must be an integer');
  }
  if (blockNumber < 0) {
    throw new Error('blockNumber cannot be negative');
  }
  return blockNumber;
};

const sanitizeForkCommand = (command: unknown) => {
  if (command === undefined || command === null || command === '') {
    return undefined;
  }
  if (typeof command !== 'string') {
    throw new Error('command must be a string');
  }
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error('command contains unsupported characters');
  }
  if (!allowedForkCommands.has(trimmed.toLowerCase())) {
    throw new Error('command is not allowed');
  }
  return trimmed;
};

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

export const startFork = (rpcUrl: string, blockNumber?: number, port?: number, command?: string) => {
  const sanitizedRpcUrl = sanitizeRpcUrl(rpcUrl);
  const sanitizedBlockNumber = sanitizeBlockNumber(blockNumber);
  const sanitizedPort = sanitizePort(port);
  const sanitizedCommand = sanitizeForkCommand(command);
  return sandboxManager.startFork(sanitizedRpcUrl, sanitizedBlockNumber, sanitizedPort, sanitizedCommand);
};

export const stopFork = () => sandboxManager.stopFork();

export const forkStatus = () => sandboxManager.forkStatus();
