import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import { decodePayload, discoverContract, estimateGasForFunction, fetchSourceCode, scanSourceCode } from '../services/devToolsService';

export const discoverContractHandler = asyncHandler(async (req: Request, res: Response) => {
  const { address, chainId } = req.body as { address?: string; chainId?: number };
  if (!address?.trim()) {
    res.status(400).json({ message: 'address is required.' });
    return;
  }
  const payload = await discoverContract(address, chainId);
  res.json(payload);
});

export const estimateGasHandler = asyncHandler(async (req: Request, res: Response) => {
  const { address, chainId, functionSignature, args, from, value } = req.body as {
    address?: string;
    chainId?: number;
    functionSignature?: string;
    args?: string[];
    from?: string;
    value?: string;
  };
  if (!address?.trim() || !functionSignature?.trim()) {
    res.status(400).json({ message: 'address and functionSignature are required.' });
    return;
  }
  const payload = await estimateGasForFunction({
    address,
    chainId,
    functionSignature,
    args: Array.isArray(args) ? args : [],
    from,
    value
  });
  res.json(payload);
});

export const scanContractHandler = asyncHandler(async (req: Request, res: Response) => {
  const { address, chainId, sourceCode } = req.body as { address?: string; chainId?: number; sourceCode?: string };
  let finalSource = sourceCode?.trim() ?? '';
  let sourceName = 'manual';
  if (!finalSource && address?.trim()) {
    const fetched = await fetchSourceCode(address, chainId);
    finalSource = fetched.sourceCode;
    sourceName = fetched.contractName;
  }
  if (!finalSource) {
    res.status(400).json({ message: 'Either address or sourceCode must be provided.' });
    return;
  }
  const report = scanSourceCode(finalSource);
  res.json({
    sourceName,
    findings: report.findings,
    overallRiskScore: report.overallRiskScore
  });
});

export const decodeHandler = asyncHandler(async (req: Request, res: Response) => {
  const { mode, chainId, txHash, address, calldata, topics, eventData } = req.body as {
    mode?: 'txHash' | 'rawCalldata' | 'eventLog';
    chainId?: number;
    txHash?: string;
    address?: string;
    calldata?: string;
    topics?: string[];
    eventData?: string;
  };
  if (!mode) {
    res.status(400).json({ message: 'mode is required.' });
    return;
  }
  const payload = await decodePayload({ mode, chainId, txHash, address, calldata, topics, eventData });
  res.json(payload);
});
