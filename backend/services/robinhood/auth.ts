import crypto from 'crypto';

export interface RobinhoodSignedHeaders {
  'x-api-key': string;
  'x-signature': string;
  'x-timestamp': string;
}

export interface SignRobinhoodRequestParams {
  apiKey: string;
  privateKey: string;
  method: string;
  path: string;
  body?: string;
  timestamp?: number;
}

/**
 * Template helper for signing Robinhood requests.
 * Robinhood's canonical payload format may evolve; keep the canonical string construction in one place.
 */
export const signRobinhoodRequest = ({
  apiKey,
  privateKey,
  method,
  path,
  body = '',
  timestamp = Date.now(),
}: SignRobinhoodRequestParams): RobinhoodSignedHeaders => {
  const canonical = `${timestamp}|${method.toUpperCase()}|${path}|${body}`;
  const signature = crypto
    .createSign('SHA256')
    .update(canonical)
    .end()
    .sign(privateKey, 'base64');

  return {
    'x-api-key': apiKey,
    'x-signature': signature,
    'x-timestamp': String(timestamp),
  };
};
