import { ethers } from 'ethers';

interface CallStaticRequest {
  rpcUrl: string;
  contractAddress: string;
  abi: string;
  method: string;
  args?: unknown[];
  value?: string;
}

interface ForkRequest {
  rpcUrl: string;
  targetAddress: string;
  data: string;
  value?: string;
}

export const simulateCallStatic = async ({ rpcUrl, contractAddress, abi, method, args = [], value }: CallStaticRequest) => {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const iface = new ethers.Interface(abi);
  const contract = new ethers.Contract(contractAddress, iface, provider);
  try {
    const fn = contract.getFunction(method);
    const result = await fn.staticCall(...(args ?? []), {
      value: value ? ethers.parseEther(value) : undefined
    });
    return { success: true, result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

export const simulateForkTransaction = async ({ rpcUrl, targetAddress, data, value }: ForkRequest) => {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = ethers.Wallet.createRandom().connect(provider);
  try {
    const txResponse = await signer.sendTransaction({
      to: targetAddress,
      data,
      value: value ? ethers.parseEther(value) : undefined
    });
    const receipt = await txResponse.wait();
    return { success: true, hash: receipt?.hash, status: receipt?.status };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};
