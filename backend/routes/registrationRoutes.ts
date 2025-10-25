import express from 'express';
import asyncHandler from 'express-async-handler';
import productRegistrationService from '../services/productRegistrationService';

const router = express.Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const licenseRegex = /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/;

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const status = productRegistrationService.getStatus();
    res.json(status);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { email, licenseKey } = req.body as { email?: string; licenseKey?: string };

    if (!email || !emailRegex.test(email)) {
      res.status(400).json({ message: 'A valid email address is required.' });
      return;
    }

    if (!licenseKey) {
      res.status(400).json({ message: 'A license key is required.' });
      return;
    }

    const normalizedKey = licenseKey.trim().toUpperCase();
    if (!licenseRegex.test(normalizedKey)) {
      res.status(400).json({ message: 'License keys must follow the format XXXX-XXXX-XXXX-XXXX.' });
      return;
    }

    try {
      productRegistrationService.register(email, normalizedKey);
      const status = productRegistrationService.getStatus();
      res.status(201).json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed.';
      res.status(409).json({ message });
    }
  })
);

export default router;
