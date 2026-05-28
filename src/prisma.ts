import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create connection pool and driver adapter
const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

// Helper to get username from request headers safely
export function getUsername(req: { headers: Record<string, string | string[] | undefined> }): string {
  const header = req.headers['x-user-name'];
  if (Array.isArray(header)) return header[0] || 'System';
  return header || 'System';
}

// Helper functions for user logging
export async function logUserActivity(
  username: string | null,
  action: string,
  details?: any
) {
  if (!username) return;
  try {
    const user = await prisma.user.findUnique({
      where: { name: username },
    });
    if (user) {
      const logs = JSON.parse(user.logs || '[]');
      logs.push({
        action,
        details,
        timestamp: new Date().toISOString(),
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { logs: JSON.stringify(logs) },
      });
    }
  } catch (error) {
    console.error(`Failed to log user activity for ${username}:`, error);
  }
}
