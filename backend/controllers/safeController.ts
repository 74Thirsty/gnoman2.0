import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import {
  connectToSafe,
  getOwners,
  addOwner as addSafeOwner,
  removeOwner as removeSafeOwner,
  changeThreshold as changeSafeThreshold,
  enableModule as enableSafeModule,
  disableModule as disableSafeModule,
  addDelegate as addSafeDelegate,
  removeDelegate as removeSafeDelegate,
  updateFallbackHandler as updateSafeFallbackHandler,
  updateGuard as updateSafeGuard,
  proposeTransaction as proposeSafeTransaction,
  executeTransaction as executeSafeTransaction,
  getSafeDetails as getSafeProfile,
  syncSafeState as syncSafeStateService
} from '../services/safeService';
import { holdService } from '../services/transactionHoldService';

export const loadSafe = asyncHandler(async (req: Request, res: Response) => {
  const { address, rpcUrl } = req.body as { address: string; rpcUrl?: string };
  const safe = await connectToSafe(address, rpcUrl);
  res.json(safe);
});

export const listOwners = asyncHandler(async (req: Request, res: Response) => {
  const owners = await getOwners(req.params.address);
  res.json(owners);
});

export const addOwner = asyncHandler(async (req: Request, res: Response) => {
  const { owner, threshold } = req.body as { owner: string; threshold: number };
  const result = await addSafeOwner(req.params.address, owner, threshold);
  res.json(result);
});

export const getSafeDetails = asyncHandler(async (req: Request, res: Response) => {
  const safe = await getSafeProfile(req.params.address);
  res.json(safe);
});

export const syncSafeState = asyncHandler(async (req: Request, res: Response) => {
  const safe = await syncSafeStateService(req.params.address);
  const balance = await getSafeProfile(req.params.address).then((profile) => profile.balance);
  res.json({
    address: safe.address,
    threshold: safe.threshold,
    owners: safe.owners,
    modules: safe.modules,
    delegates: safe.delegates,
    fallbackHandler: safe.fallbackHandler,
    guard: safe.guard,
    rpcUrl: safe.rpcUrl,
    network: safe.network,
    balance
  });
});

export const removeOwner = asyncHandler(async (req: Request, res: Response) => {
  const { threshold } = req.body as { threshold: number };
  const result = await removeSafeOwner(req.params.address, req.params.ownerAddress, threshold);
  res.json(result);
});

export const changeThreshold = asyncHandler(async (req: Request, res: Response) => {
  const { threshold } = req.body as { threshold: number };
  const result = await changeSafeThreshold(req.params.address, threshold);
  res.json(result);
});

export const enableModule = asyncHandler(async (req: Request, res: Response) => {
  const { module } = req.body as { module: string };
  const result = await enableSafeModule(req.params.address, module);
  res.json(result);
});

export const disableModule = asyncHandler(async (req: Request, res: Response) => {
  const result = await disableSafeModule(req.params.address, req.params.moduleAddress);
  res.json(result);
});

export const addDelegate = asyncHandler(async (req: Request, res: Response) => {
  const { address, label } = req.body as { address: string; label?: string };
  const payload = {
    address,
    label: label?.trim() ? label.trim() : 'Proposer',
    since: new Date().toISOString()
  };
  const delegates = await addSafeDelegate(req.params.address, payload);
  res.json(delegates);
});

export const removeDelegate = asyncHandler(async (req: Request, res: Response) => {
  const delegates = await removeSafeDelegate(req.params.address, req.params.delegateAddress);
  res.json(delegates);
});

export const updateFallbackHandler = asyncHandler(async (req: Request, res: Response) => {
  const { handler } = req.body as { handler?: string };
  const result = await updateSafeFallbackHandler(req.params.address, handler);
  res.json(result);
});

export const updateGuard = asyncHandler(async (req: Request, res: Response) => {
  const { guard } = req.body as { guard?: string };
  const result = await updateSafeGuard(req.params.address, guard);
  res.json(result);
});

export const proposeTransaction = asyncHandler(async (req: Request, res: Response) => {
  const { tx, meta } = req.body as { tx: unknown; meta?: Record<string, unknown> };
  const proposal = await proposeSafeTransaction(req.params.address, tx, meta);
  res.json(proposal);
});

export const executeTransaction = asyncHandler(async (req: Request, res: Response) => {
  const { txHash } = req.params;
  const { password } = req.body as { password?: string };
  const hold = await holdService.getHold(txHash);
  if (hold && !holdService.canExecute(hold)) {
    res.status(423).json({ message: 'Transaction is still in hold period', hold });
    return;
  }
  const execution = await executeSafeTransaction(req.params.address, txHash, password);
  if (hold) {
    await holdService.markExecuted(txHash);
  }
  res.json(execution);
});

export const toggleHold = asyncHandler(async (req: Request, res: Response) => {
  const { enabled, holdHours = 24 } = req.body as { enabled: boolean; holdHours?: number };
  const policy = await holdService.setHoldState(req.params.address, enabled, holdHours);
  const summary = holdService.summarize(req.params.address);
  const effective = await holdService.getEffectivePolicy(req.params.address);
  res.json({ policy, summary, effective });
});

export const listHeldTransactions = asyncHandler(async (req: Request, res: Response) => {
  const [transactions, summary, effective] = await Promise.all([
    holdService.listHolds(req.params.address),
    Promise.resolve(holdService.summarize(req.params.address)),
    holdService.getEffectivePolicy(req.params.address)
  ]);
  res.json({ records: transactions, summary, effective });
});

export const releaseTransactionHold = asyncHandler(async (req: Request, res: Response) => {
  const hold = await holdService.releaseNow(req.params.txHash);
  res.json(hold ?? { txHash: req.params.txHash, released: true });
});

export const getHoldPolicy = asyncHandler(async (req: Request, res: Response) => {
  const [policy, summary, effective] = await Promise.all([
    Promise.resolve(holdService.getHoldState(req.params.address)),
    Promise.resolve(holdService.summarize(req.params.address)),
    holdService.getEffectivePolicy(req.params.address)
  ]);
  res.json({ policy, summary, effective });
});

export const listHoldPolicies = asyncHandler(async (_req: Request, res: Response) => {
  const policies = holdService.listHoldPolicies();
  res.json(policies);
});
