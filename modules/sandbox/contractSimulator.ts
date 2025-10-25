import { JsonRpcProvider, Wallet, Interface, getAddress, isHexString, ZeroAddress, type InterfaceAbi } from 'ethers';
import type {
  ContractSimulationRequest,
  ContractSimulationResult,
  SimulationParameterMap,
  AbiMetadata
} from './types';
import { randomUUID } from 'crypto';

const TRACE_METHOD = 'debug_traceCall';

const toHexValue = (value?: string) => {
  if (!value) return undefined;
  return isHexString(value) ? value : `0x${BigInt(value).toString(16)}`;
};

export interface SimulationContext {
  metadata: AbiMetadata;
  request: ContractSimulationRequest;
  abiInterface: Interface;
}

export const buildProvider = async (rpcUrl: string) => {
  const provider = new JsonRpcProvider(rpcUrl);
  await provider.getNetwork();
  return provider;
};

export const encodeParameters = (abiInterface: Interface, functionName: string, parameters: SimulationParameterMap) => {
  const fragment = abiInterface.getFunction(functionName);
  if (!fragment) {
    throw new Error(`Function ${functionName} not found in ABI`);
  }
  const orderedArgs = fragment.inputs.map((input, index) => {
    if (input.name && input.name in parameters) {
      return parameters[input.name];
    }
    const fallbackKey = `arg_${index}`;
    if (fallbackKey in parameters) {
      return parameters[fallbackKey];
    }
    throw new Error(`Missing parameter ${input.name || fallbackKey}`);
  });
  return abiInterface.encodeFunctionData(functionName, orderedArgs);
};

const decodeReturn = (abiInterface: Interface, functionName: string, data: string | null | undefined) => {
  if (!data) return null;
  try {
    return abiInterface.decodeFunctionResult(functionName, data);
  } catch (error) {
    return { error: (error as Error).message };
  }
};

const captureTrace = async (
  provider: JsonRpcProvider,
  request: ContractSimulationRequest,
  callData: string,
  from: string
) => {
  try {
    const trace = await provider.send(TRACE_METHOD, [
      {
        from,
        to: request.contractAddress,
        data: callData,
        gas: request.gasLimit,
        value: request.value ? toHexValue(request.value) : undefined
      },
      'latest',
      {
        enableMemory: true,
        enableReturnData: true,
        disableStack: false
      }
    ]);
    return trace;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

const runStaticCall = async (
  provider: JsonRpcProvider,
  abiInterface: Interface,
  request: ContractSimulationRequest,
  callData: string,
  from: string
) => {
  try {
    const result = await provider.call({
      to: request.contractAddress,
      data: callData,
      from,
      value: request.value ? toHexValue(request.value) : undefined
    });
    return { success: true as const, result };
  } catch (error) {
    return { success: false as const, error: error as Error };
  }
};

const estimateGas = async (
  provider: JsonRpcProvider,
  request: ContractSimulationRequest,
  callData: string,
  from: string
) => {
  try {
    const estimate = await provider.estimateGas({
      to: request.contractAddress,
      data: callData,
      from,
      value: request.value ? toHexValue(request.value) : undefined,
      gasLimit: request.gasLimit ? BigInt(request.gasLimit) : undefined
    });
    return estimate.toString();
  } catch (error) {
    return undefined;
  }
};

export const simulateContractCall = async (
  metadata: AbiMetadata,
  request: ContractSimulationRequest
): Promise<ContractSimulationResult> => {
  const provider = await buildProvider(request.rpcUrl);
  const network = await provider.getNetwork();
  const abiInterface = new Interface(metadata.abi as InterfaceAbi);
  const contractAddress = getAddress(request.contractAddress);
  const fromAddress = request.from ? getAddress(request.from) : ZeroAddress;
  const callData = encodeParameters(abiInterface, request.functionName, request.parameters);
  const gasEstimate = await estimateGas(provider, { ...request, contractAddress }, callData, fromAddress);
  const staticResult = await runStaticCall(provider, abiInterface, { ...request, contractAddress }, callData, fromAddress);

  let decoded: unknown = null;
  let revertReason: string | undefined;

  if (staticResult.success) {
    decoded = decodeReturn(abiInterface, request.functionName, staticResult.result);
  } else {
    const error = staticResult.error;
    revertReason = error.message;
  }

  const trace = await captureTrace(provider, { ...request, contractAddress }, callData, fromAddress);

  const record: ContractSimulationResult = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    success: staticResult.success,
    network: {
      chainId: Number(network.chainId.toString()),
      name: network.name
    },
    gasEstimate,
    gasLimit: request.gasLimit,
    returnData: staticResult.success ? staticResult.result : undefined,
    decodedReturnData: decoded ?? undefined,
    error: staticResult.success ? undefined : staticResult.error?.message,
    revertReason,
    trace,
    callData,
    functionName: request.functionName,
    contractAddress,
    parameters: request.parameters,
    forkMode: Boolean(request.fork),
    rpcUrl: request.rpcUrl,
    value: request.value
  };

  return record;
};

export const simulateOnFork = async (
  metadata: AbiMetadata,
  request: ContractSimulationRequest,
  forkRpcUrl: string
): Promise<ContractSimulationResult> => {
  const provider = await buildProvider(forkRpcUrl);
  const abiInterface = new Interface(metadata.abi as InterfaceAbi);
  const contractAddress = getAddress(request.contractAddress);
  const callData = encodeParameters(abiInterface, request.functionName, request.parameters);
  const fromWallet = Wallet.createRandom().connect(provider);
  const gasEstimate = await provider.estimateGas({
    to: contractAddress,
    data: callData,
    value: request.value ? toHexValue(request.value) : undefined,
    gasLimit: request.gasLimit ? BigInt(request.gasLimit) : undefined,
    from: await fromWallet.getAddress()
  });

  try {
    const response = await provider.call({
      to: contractAddress,
      data: callData,
      from: await fromWallet.getAddress(),
      value: request.value ? toHexValue(request.value) : undefined
    });

    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      success: true,
      network: {
        chainId: Number((await provider.getNetwork()).chainId.toString()),
        name: (await provider.getNetwork()).name
      },
      gasEstimate: gasEstimate.toString(),
      returnData: response,
      decodedReturnData: decodeReturn(abiInterface, request.functionName, response) ?? undefined,
      callData,
      functionName: request.functionName,
      contractAddress,
      parameters: request.parameters,
      forkMode: true,
      rpcUrl: forkRpcUrl,
      value: request.value
    };
  } catch (error) {
    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      success: false,
      network: {
        chainId: Number((await provider.getNetwork()).chainId.toString()),
        name: (await provider.getNetwork()).name
      },
      gasEstimate: gasEstimate.toString(),
      error: (error as Error).message,
      callData,
      functionName: request.functionName,
      contractAddress,
      parameters: request.parameters,
      forkMode: true,
      rpcUrl: forkRpcUrl,
      value: request.value
    };
  }
};
