import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-fallback-key-replace-in-env';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret-fallback-key';

export interface TokenPayload {
  user_id?: number;
  username?: string;
  company_id: number;
  license_id: number;
  device_id: string;
  role: 'owner' | 'device' | 'user';
  email?: string; // for owner portal
}

export function generateAccessToken(payload: TokenPayload): string {
  // Access tokens last 15 minutes in standard configs, but for local retail stability we can set to 2 hours
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}

export function generateRefreshToken(payload: Omit<TokenPayload, 'role'> & { role: string }): string {
  // Refresh tokens last 30 days
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '30d' });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
}
