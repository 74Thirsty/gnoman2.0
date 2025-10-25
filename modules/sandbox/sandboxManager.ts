import fs from 'fs';
import path from 'path';
import { getAddress } from 'ethers';
import { parseAbi, validateFunctionExists, requireSafeAbi } from './abiLoader';
import type {
  AbiMetadata,
  ContractSimulationRequest,
  ContractSimulationResult,
  SafeSimulationRequest,
  SandboxLogEntry
} from './types';
import LocalFork from './localFork';
import { simulateContractCall, simulateOnFork } from './contractSimulator';

const LOG_DIRECTORY = path.join(__dirname, 'logs');
const HISTORY_LIMIT = 100;

export default class SandboxManager {
  private abiRegistry: Map<string, AbiMetadata> = new Map();
  private history: SandboxLogEntry[] = [];
  private fork: LocalFork;
  private logDirectory: string;

  constructor(logDir: string = LOG_DIRECTORY) {
    this.logDirectory = logDir;
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
    this.fork = new LocalFork(this.logDirectory);
    this.bootstrapHistory();
  }

  private bootstrapHistory() {
    const files = fs
      .readdirSync(this.logDirectory)
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.join(this.logDirectory, file))
      .sort();

    files.slice(-HISTORY_LIMIT).forEach((file) => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(content) as SandboxLogEntry;
        this.history.push(parsed);
      } catch (error) {
        console.error('Failed to parse sandbox log', error);
      }
    });
  }

  private persist(result: SandboxLogEntry) {
    const fileName = path.join(this.logDirectory, `${result.id}.json`);
    const replacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value);
    fs.writeFileSync(fileName, JSON.stringify(result, replacer, 2));
  }

  getHistory(): SandboxLogEntry[] {
    return [...this.history].reverse();
  }

  clearHistory() {
    this.history = [];
    const files = fs.readdirSync(this.logDirectory).filter((file) => file.endsWith('.json'));
    for (const file of files) {
      fs.unlinkSync(path.join(this.logDirectory, file));
    }
  }

  loadAbi(abi: string, name?: string): AbiMetadata {
    const metadata = parseAbi({ abi, name });
    this.abiRegistry.set(metadata.name, metadata);
    return metadata;
  }

  getAbi(name: string): AbiMetadata | undefined {
    return this.abiRegistry.get(name);
  }

  listAbis(): AbiMetadata[] {
    return Array.from(this.abiRegistry.values());
  }

  async simulate(metadata: AbiMetadata, request: ContractSimulationRequest): Promise<ContractSimulationResult> {
    validateFunctionExists(metadata, request.functionName);
    const sanitized = {
      ...request,
      contractAddress: getAddress(request.contractAddress)
    };

    let result: ContractSimulationResult;

    const forkStatus = this.fork.getStatus();
    if (request.fork && forkStatus.active && forkStatus.rpcUrl) {
      result = await simulateOnFork(metadata, sanitized, forkStatus.rpcUrl);
    } else {
      result = await simulateContractCall(metadata, sanitized);
    }

    const entry: SandboxLogEntry = {
      ...result
    };

    this.history.push(entry);
    if (this.history.length > HISTORY_LIMIT) {
      this.history = this.history.slice(-HISTORY_LIMIT);
    }
    this.persist(entry);

    return result;
  }

  async simulateSafe(request: SafeSimulationRequest) {
    const safeAbi = requireSafeAbi();
    const result = await this.simulate(safeAbi, {
      rpcUrl: request.rpcUrl,
      contractAddress: request.safeAddress,
      functionName: request.functionName,
      parameters: request.parameters,
      value: request.value,
      fork: request.fork,
      forkBlockNumber: request.forkBlockNumber,
      forkRpcUrl: request.forkRpcUrl,
      gasLimit: request.gasLimit,
      from: request.from
    });

    return result;
  }

  startFork(rpcUrl: string, blockNumber?: number, port?: number, command?: string) {
    return this.fork.start({ rpcUrl, blockNumber, port, command });
  }

  stopFork() {
    return this.fork.stop();
  }

  forkStatus() {
    return this.fork.getStatus();
  }
}
