import express from 'express';
import asyncHandler from 'express-async-handler';
import { licenseService } from '../services/licenseService';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const status = licenseService.getStatus();
    res.json(status);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { token } = req.body as { token?: string };

    if (!token) {
      res.status(400).json({ message: 'A license token is required.' });
      return;
    }

    try {
      const status = licenseService.applyLicense(token);
      res.status(201).json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to apply license token.';
      res.status(400).json({ message });
    }
  })
);

export default router;
