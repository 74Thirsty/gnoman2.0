import test from 'node:test';
import { strict as assert } from 'node:assert';
import { tmpdir } from 'os';
import path from 'path';
import fs from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../../dist/backend/modules/sandbox');
const require = createRequire(import.meta.url);

const loadModule = async (modulePath) => {
  const moduleUrl = pathToFileURL(path.join(distPath, modulePath)).href;
  return import(moduleUrl);
};

const unwrapDefault = (mod) => {
  if (!mod) return mod;
  if (mod.default && typeof mod.default === 'object' && 'default' in mod.default) {
    return mod.default.default;
  }
  return mod.default ?? mod;
};

const setRpcStub = (responses) => {
  const { JsonRpcProvider } = require('ethers');
  const originalSend = JsonRpcProvider.prototype.send;
  const originalEstimateGas = JsonRpcProvider.prototype.estimateGas;
  const originalCall = JsonRpcProvider.prototype.call;
  const originalGetNetwork = JsonRpcProvider.prototype.getNetwork;

  JsonRpcProvider.prototype.send = async function (method, params) {
    const handler = responses[method];
    if (!handler) {
      return originalSend.call(this, method, params);
    }
    const result = await handler(params ?? []);
    if (result && result.error) {
      const error = new Error(result.error.message);
      error.code = result.error.code;
      throw error;
    }
    return result;
  };

  JsonRpcProvider.prototype.estimateGas = async function (request) {
    const value = await JsonRpcProvider.prototype.send.call(this, 'eth_estimateGas', [request]);
    return BigInt(value);
  };

  JsonRpcProvider.prototype.call = async function (request) {
    return JsonRpcProvider.prototype.send.call(this, 'eth_call', [request]);
  };

  JsonRpcProvider.prototype.getNetwork = async function () {
    const chainIdHex = await JsonRpcProvider.prototype.send.call(this, 'eth_chainId', []);
    return {
      chainId: BigInt(chainIdHex),
      name: 'mock-network'
    };
  };

  return () => {
    JsonRpcProvider.prototype.send = originalSend;
    JsonRpcProvider.prototype.estimateGas = originalEstimateGas;
    JsonRpcProvider.prototype.call = originalCall;
    JsonRpcProvider.prototype.getNetwork = originalGetNetwork;
  };
};

test('ABI parsing exposes function metadata for parameter forms', async () => {
  const module = await loadModule('abiLoader.js');
  const parseAbi = module.parseAbi ?? unwrapDefault(module).parseAbi;
  const abi = JSON.stringify([
    {
      inputs: [
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' }
      ],
      name: 'transfer',
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
      type: 'function'
    }
  ]);
  const metadata = parseAbi({ abi, name: 'Token' });
  assert.strictEqual(metadata.name, 'Token');
  assert.strictEqual(metadata.functions[0].name, 'transfer');
  assert.strictEqual(metadata.functions[0].inputs.length, 2);
});

test('Parameter schema generation includes ABI parameters', async () => {
  const module = await loadModule('formBuilder.js');
  const buildParameterFields = module.buildParameterFields ?? unwrapDefault(module).buildParameterFields;
  const metadata = {
    name: 'Token',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ]
  };
  const schema = buildParameterFields(metadata);
  assert.strictEqual(schema.length, 2);
  assert.strictEqual(schema[0].name, 'recipient');
  assert.strictEqual(schema[1].placeholder, 'uint256');
});

test('Static simulation captures gas estimate and decoded return data', async () => {
  const module = await loadModule('contractSimulator.js');
  const simulateContractCall = module.simulateContractCall ?? unwrapDefault(module).simulateContractCall;
  const { Interface } = require('ethers');
  const abi = [
    'function getValue(uint256 key) view returns (uint256)'
  ];
  const iface = new Interface(abi);
  const encodedResult = iface.encodeFunctionResult('getValue', [42n]);

  const restore = setRpcStub({
    eth_chainId: async () => '0x1',
    eth_estimateGas: async () => '0x5208',
    eth_call: async () => encodedResult,
    debug_traceCall: async () => ({ gas: '0x5208' })
  });

  const metadata = {
    name: 'KVStore',
    abi,
    functions: [
      {
        name: 'getValue',
        stateMutability: 'view',
        inputs: [{ name: 'key', type: 'uint256' }],
        outputs: [{ name: '', type: 'uint256' }],
        payable: false,
        constant: true
      }
    ]
  };

  const result = await simulateContractCall(metadata, {
    rpcUrl: 'http://localhost:8545',
    contractAddress: '0x0000000000000000000000000000000000000001',
    functionName: 'getValue',
    parameters: { key: '0x0' },
    value: '0x0'
  });

  restore();

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.gasEstimate, '21000');
  assert.deepStrictEqual(Array.from(result.decodedReturnData), [42n]);
  assert.strictEqual(result.callData.startsWith('0x'), true);
  assert.strictEqual(result.value, '0x0');
});

test('Simulation failure captures revert reason', async () => {
  const module = await loadModule('contractSimulator.js');
  const simulateContractCall = module.simulateContractCall ?? unwrapDefault(module).simulateContractCall;
  const restore = setRpcStub({
    eth_chainId: async () => '0x1',
    eth_estimateGas: async () => '0x5208',
    eth_call: async () => ({ error: { code: 3, message: 'execution reverted: TEST' } }),
    debug_traceCall: async () => ({})
  });

  const abi = [
    'function fail() view returns (bool)'
  ];

  const metadata = {
    name: 'Fail',
    abi,
    functions: [
      {
        name: 'fail',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'bool' }],
        payable: false,
        constant: true
      }
    ]
  };

  const result = await simulateContractCall(metadata, {
    rpcUrl: 'http://localhost:8545',
    contractAddress: '0x0000000000000000000000000000000000000002',
    functionName: 'fail',
    parameters: {}
  });

  restore();

  assert.strictEqual(result.success, false);
  assert.ok(result.revertReason?.includes('execution'));
});

test('Sandbox manager logs simulations and recovers history', async () => {
  const SandboxManager = unwrapDefault(await loadModule('sandboxManager.js'));
  const { parseAbi } = await loadModule('abiLoader.js');
  const tempDir = mkdtempSync(path.join(tmpdir(), 'sandbox-'));

  const abi = JSON.stringify([
    {
      inputs: [],
      name: 'ping',
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'view',
      type: 'function'
    }
  ]);

  const metadata = parseAbi({ abi, name: 'Ping' });

  const encodedReturn = '0x0000000000000000000000000000000000000000000000000000000000000001';

  const restore = setRpcStub({
    eth_chainId: async () => '0x5',
    eth_estimateGas: async () => '0x5208',
    eth_call: async () => encodedReturn,
    debug_traceCall: async () => ({})
  });

  const manager = new SandboxManager(tempDir);
  const result = await manager.simulate(metadata, {
    rpcUrl: 'http://localhost:8545',
    contractAddress: '0x0000000000000000000000000000000000000003',
    functionName: 'ping',
    parameters: {}
  });
  restore();

  assert.ok(result.success);
  assert.strictEqual(manager.getHistory().length, 1);

  const persistedFiles = fs.readdirSync(tempDir).filter((file) => file.endsWith('.json'));
  assert.strictEqual(persistedFiles.length, 1);
  const logContent = JSON.parse(fs.readFileSync(path.join(tempDir, persistedFiles[0]), 'utf8'));
  assert.strictEqual(logContent.rpcUrl, 'http://localhost:8545');

  const revived = new SandboxManager(tempDir);
  assert.strictEqual(revived.getHistory().length, 1);

  rmSync(tempDir, { recursive: true, force: true });
});

test('Safe simulation encodes parameters and returns SafeTx-like data', async () => {
  const SandboxManager = unwrapDefault(await loadModule('sandboxManager.js'));
  const tempDir = mkdtempSync(path.join(tmpdir(), 'safe-'));
  const manager = new SandboxManager(tempDir);

  const restore = setRpcStub({
    eth_chainId: async () => '0x1',
    eth_estimateGas: async () => '0x5208',
    eth_call: async () => '0x0000000000000000000000000000000000000000000000000000000000000000',
    debug_traceCall: async () => ({})
  });

  const result = await manager.simulateSafe({
    rpcUrl: 'http://localhost:8545',
    safeAddress: '0x0000000000000000000000000000000000000004',
    functionName: 'isOwner',
    parameters: { owner: '0x0000000000000000000000000000000000000005' }
  });

  restore();
  assert.ok(result.callData.startsWith('0x'));
  rmSync(tempDir, { recursive: true, force: true });
});

test('Fork mode uses alternate RPC endpoint when active', async () => {
  const SandboxManager = unwrapDefault(await loadModule('sandboxManager.js'));
  const tempDir = mkdtempSync(path.join(tmpdir(), 'fork-'));
  const manager = new SandboxManager(tempDir);

  const forkReturn = '0x000000000000000000000000000000000000000000000000000000000000002a';

  const restore = setRpcStub({
    eth_chainId: async () => '0x1',
    eth_estimateGas: async () => '0x5208',
    eth_call: async () => forkReturn,
    debug_traceCall: async () => ({})
  });

  manager['fork'].getStatus = () => ({ active: true, rpcUrl: 'http://localhost:1111' });

  const metadata = {
    name: 'Counter',
    abi: ['function value() view returns (uint256)'],
    functions: [
      {
        name: 'value',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        payable: false,
        constant: true
      }
    ]
  };

  const result = await manager.simulate(metadata, {
    rpcUrl: 'http://localhost:8545',
    contractAddress: '0x0000000000000000000000000000000000000006',
    functionName: 'value',
    parameters: {},
    fork: true
  });

  restore();
  assert.strictEqual(result.forkMode, true);
  assert.strictEqual(result.rpcUrl, 'http://localhost:1111');
  rmSync(tempDir, { recursive: true, force: true });
});

test('Fork simulations fall back to provided RPC URL when no local fork is active', async () => {
  const SandboxManager = unwrapDefault(await loadModule('sandboxManager.js'));
  const tempDir = mkdtempSync(path.join(tmpdir(), 'remote-fork-'));
  const manager = new SandboxManager(tempDir);

  const restore = setRpcStub({
    eth_chainId: async () => '0x1',
    eth_estimateGas: async () => '0x5208',
    eth_call: async () =>
      '0x000000000000000000000000000000000000000000000000000000000000002a',
    debug_traceCall: async () => ({})
  });

  manager['fork'].getStatus = () => ({ active: false });

  const metadata = {
    name: 'Counter',
    abi: ['function value() view returns (uint256)'],
    functions: [
      {
        name: 'value',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        payable: false,
        constant: true
      }
    ]
  };

  const result = await manager.simulate(metadata, {
    rpcUrl: 'http://localhost:8545',
    contractAddress: '0x0000000000000000000000000000000000000006',
    functionName: 'value',
    parameters: {},
    fork: true,
    forkRpcUrl: 'http://127.0.0.1:9090'
  });

  restore();
  assert.strictEqual(result.forkMode, true);
  assert.strictEqual(result.rpcUrl, 'http://127.0.0.1:9090');
  rmSync(tempDir, { recursive: true, force: true });
});

test('Fork flag gracefully degrades when no fork configuration is available', async () => {
  const SandboxManager = unwrapDefault(await loadModule('sandboxManager.js'));
  const tempDir = mkdtempSync(path.join(tmpdir(), 'no-fork-'));
  const manager = new SandboxManager(tempDir);

  const restore = setRpcStub({
    eth_chainId: async () => '0x1',
    eth_estimateGas: async () => '0x5208',
    eth_call: async () =>
      '0x000000000000000000000000000000000000000000000000000000000000002a',
    debug_traceCall: async () => ({})
  });

  manager['fork'].getStatus = () => ({ active: false });

  const metadata = {
    name: 'Counter',
    abi: ['function value() view returns (uint256)'],
    functions: [
      {
        name: 'value',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        payable: false,
        constant: true
      }
    ]
  };

  const result = await manager.simulate(metadata, {
    rpcUrl: 'http://localhost:8545',
    contractAddress: '0x0000000000000000000000000000000000000006',
    functionName: 'value',
    parameters: {},
    fork: true
  });

  restore();
  assert.strictEqual(result.forkMode, false);
  assert.strictEqual(result.rpcUrl, 'http://localhost:8545');
  rmSync(tempDir, { recursive: true, force: true });
});
