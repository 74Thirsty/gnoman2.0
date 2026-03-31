import { Request, Response, NextFunction } from 'express';

export function requireIssueApiKey(req: Request, res: Response, next: NextFunction) {
  const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  if (!isProd) {
    return next();
  }

  const required = process.env.LICENSE_ISSUE_API_KEY;
  if (!required || required.trim().length === 0) {
    return res.status(500).json({ error: 'Server misconfigured: LICENSE_ISSUE_API_KEY missing' });
  }

  const provided = req.header('x-license-issue-key') ?? '';
  if (provided !== required) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}
