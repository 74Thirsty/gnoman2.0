import axios from 'axios';

export const http = axios.create({
  baseURL: process.env.ETHERSCAN_BASE_URL?.trim() || 'https://api.etherscan.io/api',
  timeout: 10_000
});
