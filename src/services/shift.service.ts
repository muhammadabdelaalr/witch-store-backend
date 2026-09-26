import { prisma } from '../prisma';

export interface TenantContext {
  company_id: number;
  company_name: string;
  branch_id: number;
  user?: {
    id: number;
    name: string;
    role: {
      id: number;
      key: string;
      name: string;
      permissions: string[];
    } | null;
  };
}

export class ShiftError extends Error {
  code: string;
  status: number;
  details?: any;

  constructor(code: string, message: string, status: number = 400, details?: any) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export interface OpenShiftInput {
  opening_balance: number;
  notes?: string;
}

export interface CashMovementInput {
  type: 'CASH_IN' | 'CASH_OUT' | 'DRAWER_EXPENSE';
  amount: number;
  reason?: string;
  notes?: string;
}

export interface CloseShiftInput {
  actual_cash: number;
  variance_reason?: string;
  notes?: string;
}

export async function openShift(input: OpenShiftInput, tenant: TenantContext) {
  const companyId = tenant.company_id;
  const branchId = tenant.branch_id;
  const userId = tenant.user?.id;

  if (!userId) {
    throw new ShiftError('UNAUTHORIZED', 'Logged in user required to open shift', 401);
  }

  const openingBalance = round2(parseFloat(String(input.opening_balance || 0)));
  if (isNaN(openingBalance) || openingBalance < 0) {
    throw new ShiftError('INVALID_AMOUNT', 'Opening balance must be a non-negative number');
  }

  // Check if active open shift already exists for this user & branch
  const existingShift = await prisma.shift.findFirst({
    where: {
      company_id: companyId,
      branch_id: branchId,
      user_id: userId,
      status: 'open',
    },
  });

  if (existingShift) {
    throw new ShiftError(
      'SHIFT_ALREADY_OPEN',
      'You already have an active open shift in this branch',
      400,
      { shift_id: existingShift.id }
    );
  }

  const shift = await prisma.shift.create({
    data: {
      company_id: companyId,
      branch_id: branchId,
      user_id: userId,
      status: 'open',
      opening_balance: openingBalance,
      expected_cash: openingBalance,
      notes: input.notes || null,
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  return shift;
}

export async function getCurrentShift(tenant: TenantContext) {
  const companyId = tenant.company_id;
  const branchId = tenant.branch_id;
  const userId = tenant.user?.id;

  if (!userId) return null;

  const shift = await prisma.shift.findFirst({
    where: {
      company_id: companyId,
      branch_id: branchId,
      user_id: userId,
      status: 'open',
    },
    include: {
      user: { select: { id: true, name: true } },
      cash_movements: { orderBy: { created_at: 'desc' } },
    },
  });

  if (!shift) return null;

  return calculateLiveShiftTotals(shift);
}

async function calculateLiveShiftTotals(shift: any) {
  // Aggregate cash payments for sales completed during this shift window
  const cashPayments = await prisma.salePayment.aggregate({
    where: {
      company_id: shift.company_id,
      method: 'cash',
      created_at: { gte: shift.opened_at },
      sale: { branch_id: shift.branch_id, status: 'completed' },
    },
    _sum: { amount: true },
  });

  // Aggregate cash refunds completed during this shift window
  const cashRefunds = await prisma.refund.aggregate({
    where: {
      company_id: shift.company_id,
      branch_id: shift.branch_id,
      created_at: { gte: shift.opened_at },
    },
    _sum: { total: true },
  });

  // Aggregate manual cash movements
  const cashInMovements = (shift.cash_movements || [])
    .filter((m: any) => m.type === 'CASH_IN')
    .reduce((sum: number, m: any) => sum + m.amount, 0);

  const cashOutMovements = (shift.cash_movements || [])
    .filter((m: any) => m.type === 'CASH_OUT' || m.type === 'DRAWER_EXPENSE')
    .reduce((sum: number, m: any) => sum + m.amount, 0);

  const cashSalesTotal = round2(cashPayments._sum.amount || 0);
  const cashRefundsTotal = round2(cashRefunds._sum.total || 0);
  const cashInTotal = round2(cashInMovements);
  const cashOutTotal = round2(cashOutMovements);

  const expectedCash = round2(
    shift.opening_balance + cashSalesTotal + cashInTotal - cashOutTotal - cashRefundsTotal
  );

  return {
    ...shift,
    cash_sales_total: cashSalesTotal,
    cash_refunds_total: cashRefundsTotal,
    cash_in_total: cashInTotal,
    cash_out_total: cashOutTotal,
    expected_cash: expectedCash,
  };
}

export async function recordCashMovement(input: CashMovementInput, tenant: TenantContext) {
  const companyId = tenant.company_id;
  const branchId = tenant.branch_id;
  const userId = tenant.user?.id;

  if (!userId) {
    throw new ShiftError('UNAUTHORIZED', 'Logged in user required', 401);
  }

  const amount = round2(parseFloat(String(input.amount || 0)));
  if (isNaN(amount) || amount <= 0) {
    throw new ShiftError('INVALID_AMOUNT', 'Movement amount must be greater than 0');
  }

  const currentShift = await prisma.shift.findFirst({
    where: {
      company_id: companyId,
      branch_id: branchId,
      user_id: userId,
      status: 'open',
    },
  });

  if (!currentShift) {
    throw new ShiftError('NO_OPEN_SHIFT', 'No active open shift found for this user', 400);
  }

  const movement = await prisma.cashMovement.create({
    data: {
      shift_id: currentShift.id,
      company_id: companyId,
      branch_id: branchId,
      user_id: userId,
      type: input.type,
      amount,
      reason: input.reason || null,
      notes: input.notes || null,
    },
  });

  return movement;
}

export async function closeShift(shiftId: number, input: CloseShiftInput, tenant: TenantContext) {
  const companyId = tenant.company_id;
  const branchId = tenant.branch_id;
  const userId = tenant.user?.id;

  const shift = await prisma.shift.findFirst({
    where: {
      id: shiftId,
      company_id: companyId,
      branch_id: branchId,
      status: 'open',
    },
    include: {
      cash_movements: true,
    },
  });

  if (!shift) {
    throw new ShiftError('SHIFT_NOT_FOUND', 'Active open shift not found', 404);
  }

  const liveTotals = await calculateLiveShiftTotals(shift);
  const actualCash = round2(parseFloat(String(input.actual_cash || 0)));
  if (isNaN(actualCash) || actualCash < 0) {
    throw new ShiftError('INVALID_AMOUNT', 'Actual cash must be a non-negative number');
  }

  const difference = round2(actualCash - liveTotals.expected_cash);

  // If variance exists, require reason
  if (Math.abs(difference) > 0.01 && !input.variance_reason) {
    throw new ShiftError(
      'VARIANCE_REASON_REQUIRED',
      'A reason is required when a cash shortage or overage exists',
      400,
      { expected_cash: liveTotals.expected_cash, actual_cash: actualCash, difference }
    );
  }

  const closedShift = await prisma.shift.update({
    where: { id: shift.id },
    data: {
      status: 'closed',
      closed_at: new Date(),
      cash_sales_total: liveTotals.cash_sales_total,
      cash_refunds_total: liveTotals.cash_refunds_total,
      cash_in_total: liveTotals.cash_in_total,
      cash_out_total: liveTotals.cash_out_total,
      expected_cash: liveTotals.expected_cash,
      actual_cash: actualCash,
      difference,
      variance_reason: input.variance_reason || null,
      notes: input.notes || shift.notes,
    },
    include: {
      user: { select: { id: true, name: true } },
      cash_movements: { orderBy: { created_at: 'desc' } },
    },
  });

  return closedShift;
}

export async function getShiftSummary(shiftId: number, tenant: TenantContext) {
  const companyId = tenant.company_id;

  const shift = await prisma.shift.findFirst({
    where: {
      id: shiftId,
      company_id: companyId,
    },
    include: {
      user: { select: { id: true, name: true } },
      cash_movements: { orderBy: { created_at: 'desc' } },
    },
  });

  if (!shift) {
    throw new ShiftError('SHIFT_NOT_FOUND', 'Shift not found', 404);
  }

  if (shift.status === 'open') {
    return calculateLiveShiftTotals(shift);
  }

  return shift;
}

export async function listShifts(
  tenant: TenantContext,
  filters: {
    status?: string;
    page?: number;
    limit?: number;
  }
) {
  const companyId = tenant.company_id;
  const branchId = tenant.branch_id;
  const page = filters.page || 1;
  const limit = filters.limit || 10;
  const skip = (page - 1) * limit;

  const where: any = {
    company_id: companyId,
    branch_id: branchId,
  };

  if (filters.status && filters.status !== 'all') {
    where.status = filters.status;
  }

  const [shifts, total] = await Promise.all([
    prisma.shift.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { opened_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.shift.count({ where }),
  ]);

  return {
    data: shifts,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
