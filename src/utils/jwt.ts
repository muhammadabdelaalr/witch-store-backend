import jwt from 'jsonwebtoken';
import { requireSecret } from '../config/env';

export type TokenRole = 'owner' | 'support' | 'sales' | 'device' | 'user';

export interface TokenPayload {
  user_id?: number;
  username?: string;
  company_id: number;
  license_id: number;
  device_id: string;
  branch_id?: number;
  role: TokenRole;
  email?: string;
}

function jwtSecret(): string {
  return requireSecret('JWT_SECRET');
}

function refreshSecret(): string {
  return requireSecret('JWT_REFRESH_SECRET');
}

export function generateAccessToken(payload: TokenPayload): string {
  const expiresIn = payload.role === 'user' ? '12h' : '2h';
  return jwt.sign(payload, jwtSecret(), { expiresIn });
}

export function generateUserAccessToken(
  payload: Omit<TokenPayload, 'role'> & { role?: 'user'; branch_id: number; user_id: number },
): { token: string; expiresAt: string } {
  const token = jwt.sign({ ...payload, role: 'user' }, jwtSecret(), { expiresIn: '12h' });
  return {
    token,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  };
}

export function generateRefreshToken(payload: Omit<TokenPayload, 'role'> & { role: string }): string {
  if (payload.role === 'user') {
    throw new Error('Employee sessions do not support refresh tokens');
  }
  return jwt.sign(payload, refreshSecret(), { expiresIn: '30d' });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, jwtSecret()) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, refreshSecret()) as TokenPayload;
}

export function decodeTokenWithoutVerification(token: string): Partial<TokenPayload> | null {
  const decoded = jwt.decode(token);
  return decoded && typeof decoded === 'object' ? decoded as Partial<TokenPayload> : null;
}
