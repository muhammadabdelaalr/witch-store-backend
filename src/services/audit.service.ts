import { Request } from 'express';
import { Prisma } from '../generated/prisma';
import { prisma } from '../prisma';

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: Prisma.InputJsonValue;
}

export async function writeTenantAudit(req: Request, event: AuditEvent): Promise<void> {
  const tenant = req.tenant;
  if (!tenant) return;

  await prisma.tenantAuditLog.create({
    data: {
      company_id: tenant.company_id,
      branch_id: tenant.branch_id,
      user_id: tenant.user?.id,
      request_id: req.id,
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId == null ? null : String(event.entityId),
      details: event.details,
    },
  });
}

export function writeTenantAuditBestEffort(req: Request, event: AuditEvent): void {
  writeTenantAudit(req, event).catch((error) => {
    console.error(JSON.stringify({
      level: 'error',
      event: 'tenant_audit_write_failed',
      request_id: req.id,
      message: error instanceof Error ? error.message : String(error),
    }));
  });
}

