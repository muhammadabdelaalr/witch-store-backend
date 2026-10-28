import { PrismaClient } from "./generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

import dns from "dns";

// Configure reliable DNS servers to bypass intermittent local router DNS issues
try {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch {
  // Ignore in environments where setServers is restricted
}

const dnsCache = new Map<string, { ips: string[]; expires: number }>();
const KNOWN_FALLBACKS: Record<string, string[]> = {
  "aws-1-eu-central-1.pooler.supabase.com": [
    "3.71.225.44",
    "3.65.151.229",
    "18.196.8.182",
  ],
};

function reliableLookup(hostname: string, options: any, callback: any) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  const now = Date.now();
  const cached = dnsCache.get(hostname);
  if (cached && cached.expires > now && cached.ips.length > 0) {
    const ip = cached.ips[Math.floor(Math.random() * cached.ips.length)];
    if (options && options.all) {
      return callback(
        null,
        cached.ips.map((address) => ({ address, family: 4 })),
      );
    }
    return callback(null, ip, 4);
  }

  dns.resolve4(hostname, (err, addresses) => {
    let finalAddresses = addresses;
    if (err || !finalAddresses || finalAddresses.length === 0) {
      if (KNOWN_FALLBACKS[hostname]) {
        finalAddresses = KNOWN_FALLBACKS[hostname];
      }
    }

    if (finalAddresses && finalAddresses.length > 0) {
      dnsCache.set(hostname, { ips: finalAddresses, expires: now + 300000 }); // cache 5m
      const ip =
        finalAddresses[Math.floor(Math.random() * finalAddresses.length)];
      if (options && options.all) {
        return callback(
          null,
          finalAddresses.map((address) => ({ address, family: 4 })),
        );
      }
      return callback(null, ip, 4);
    }

    return dns.lookup(hostname, options, callback);
  });
}

// Create connection pool and driver adapter
const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  lookup: reliableLookup,
} as any);

pool.on("error", (err) => {
  console.error("[PG POOL] Unexpected error on idle client:", err.message);
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

// Compatibility helper for older controllers. Identity comes from the signed user token.
export function getUsername(req: { tenant?: { user?: { name: string } } }): string {
  return req.tenant?.user?.name || 'System';
}

// Helper functions for user logging
export async function logUserActivity(
  company_id: number | null,
  username: string | null,
  action: string,
  details?: any,
) {
  if (!username) return;
  try {
    const user = await prisma.user.findFirst({
      where: {
        company_id: company_id || 1,
        name: username,
      },
    });
    if (!user || !company_id) return;
    await prisma.tenantAuditLog.create({
      data: {
        company_id,
        branch_id: user.branch_id,
        user_id: user.id,
        action,
        entity_type: 'legacy_activity',
        details: details ?? undefined,
      },
    });
  } catch (error) {
    console.error(`Failed to log user activity for ${username}:`, error);
  }
}
