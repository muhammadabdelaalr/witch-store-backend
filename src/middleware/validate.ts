import { Request, Response, NextFunction } from 'express';
import { z, ZodType } from 'zod';

export function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        code: 'VALIDATION_ERROR',
        message: 'Request body validation failed.',
        details: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

function validateReadOnlyPart(part: 'params' | 'query', schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        code: 'VALIDATION_ERROR',
        message: `Request ${part} validation failed.`,
        details: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
      return;
    }
    next();
  };
}

export const validateParams = (schema: ZodType) => validateReadOnlyPart('params', schema);
export const validateQuery = (schema: ZodType) => validateReadOnlyPart('query', schema);

const boundedText = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => boundedText(max).optional().nullable();
const positiveId = z.coerce.number().int().positive();
const finiteMoney = z.coerce.number().finite().nonnegative();
const dateText = z.string().trim().max(40).refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date');
const paymentMethod = z.enum(['cash', 'instapay', 'wallet', 'card', 'deferred', 'installment']);
const password = z.string().trim().min(8).max(128).refine(
  (value) => !['admin', 'password', '12345678'].includes(value.toLowerCase()),
  'Password is too weak',
);

export const employeeLoginSchema = z.object({
  username: boundedText(254).min(1),
  password: z.string().min(1).max(128),
});

export const createUserSchema = z.object({
  name: boundedText(100).min(1),
  phone: boundedText(30).min(1),
  email: z.string().trim().email().max(254).optional().nullable().or(z.literal('')),
  password,
  isAdmin: z.boolean().optional(),
  role_id: z.coerce.number().int().positive().optional().nullable(),
});

export const updateUserSchema = createUserSchema.partial().extend({ password: password.optional() });

const saleItemSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  qty: z.coerce.number().int().positive(),
  unit_price: z.coerce.number().finite().nonnegative(),
  cost_price: z.coerce.number().finite().nonnegative().optional(),
  line_discount: z.coerce.number().finite().nonnegative().optional().default(0),
});

const paymentSchema = z.object({ method: paymentMethod, amount: z.coerce.number().finite().positive() });

export const saleSchema = z.object({
  customer_id: z.coerce.number().int().positive().optional().nullable(),
  customer_name: boundedText(150).optional().nullable(),
  items: z.array(saleItemSchema).min(1).max(500),
  discount: z.coerce.number().finite().min(0).max(100).default(0),
  tax: z.coerce.number().finite().min(0).max(100).default(0),
  amount_paid: z.coerce.number().finite().nonnegative().optional(),
  payment_method: paymentMethod,
  payments: z.array(paymentSchema).max(10).optional(),
  sale_type: z.enum(['retail', 'wholesale']).optional(),
  notes: boundedText(1000).optional().nullable(),
  idempotency_key: z.string().uuid().optional(),
});

export const cancelSaleSchema = z.object({ reason: boundedText(500).min(1) });

export const refundSchema = z.object({
  items: z.array(z.object({ product_id: z.coerce.number().int().positive(), qty: z.coerce.number().int().positive() })).min(1).max(500),
  reason: boundedText(500).optional().nullable(),
  payments: z.array(paymentSchema).min(1).max(10).optional(),
});

export const openShiftSchema = z.object({ opening_balance: z.coerce.number().finite().nonnegative(), notes: boundedText(1000).optional() });
export const closeShiftSchema = z.object({ actual_cash: z.coerce.number().finite().nonnegative(), variance_reason: boundedText(500).optional(), notes: boundedText(1000).optional() });
export const cashMovementSchema = z.object({
  type: z.enum(['CASH_IN', 'CASH_OUT', 'DRAWER_EXPENSE']),
  amount: z.coerce.number().finite().positive(),
  reason: boundedText(500).optional(),
  notes: boundedText(1000).optional(),
});
export const inventoryAdjustmentSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE']),
  qty: z.coerce.number().int().positive(),
  reason: boundedText(500).min(1),
  notes: boundedText(1000).optional(),
});

export const idParamSchema = z.object({ id: z.string().regex(/^\d+$/) });
export const emptyBodySchema = z.object({});
export const paginationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  search: boundedText(100).optional(),
}).passthrough();

export const categorySchema = z.object({ name: boundedText(100).min(1) });

export const productSchema = z.object({
  name: boundedText(200).min(1),
  sku: optionalText(100),
  barcode: optionalText(100),
  category_id: positiveId.optional().nullable(),
  factory: optionalText(200),
  description: optionalText(2000),
  cost_price: finiteMoney.optional(),
  sell_price: finiteMoney.optional(),
  stock_qty: z.coerce.number().int().nonnegative().optional(),
  low_stock_threshold: z.coerce.number().int().nonnegative().optional().nullable(),
  is_active: z.boolean().optional(),
  image_path: optionalText(1000),
});
export const updateProductSchema = productSchema.partial();
export const legacyStockAdjustmentSchema = z.object({
  delta: z.coerce.number().int().refine((value) => value !== 0, 'Delta cannot be zero'),
  reason: boundedText(500).optional(),
});

export const partySchema = z.object({
  name: boundedText(200).min(1),
  phone: optionalText(30),
  email: z.string().trim().email().max(254).optional().nullable().or(z.literal('')),
  address: optionalText(500),
  balance: finiteMoney.optional(),
});
export const updatePartySchema = partySchema.partial();
export const customerTransactionSchema = z.object({
  customer_id: positiveId,
  type: z.enum(['payment', 'debt']),
  amount: z.coerce.number().finite().positive(),
  notes: optionalText(1000),
});
export const supplierTransactionSchema = z.object({
  supplier_id: positiveId,
  type: z.enum(['payment', 'purchase']),
  amount: z.coerce.number().finite().positive(),
  notes: boundedText(1000).min(1),
  date: dateText.optional(),
  invoice_id: positiveId.optional().nullable(),
});

const supplierInvoiceItemSchema = z.object({
  product_id: positiveId,
  qty: z.coerce.number().int().positive(),
  unit_cost: finiteMoney,
});
export const supplierInvoiceSchema = z.object({
  supplier_id: positiveId,
  total: finiteMoney,
  amount_paid: finiteMoney,
  notes: boundedText(2000).min(1),
  invoice_date: dateText,
  items: z.array(supplierInvoiceItemSchema).min(1).max(500),
  is_refund: z.boolean().optional(),
});
export const updateSupplierInvoiceSchema = supplierInvoiceSchema.omit({ supplier_id: true });

export const expenseSchema = z.object({
  category_id: positiveId.optional().nullable(),
  category: boundedText(100).min(1),
  amount: z.coerce.number().finite().positive(),
  description: optionalText(1000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const updateExpenseSchema = expenseSchema.partial();

export const licenseActivationSchema = z.object({
  license_key: boundedText(256).min(1),
  device_name: boundedText(200).optional(),
  platform: boundedText(100).optional(),
  app_version: boundedText(50).optional(),
});
export const refreshTokenSchema = z.object({ refreshToken: z.string().min(32).max(4096) });

const positiveIntegerText = z.string().regex(/^[1-9]\d*$/);
const isoDateQuery = z.string().max(40).refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date');
export const listQuerySchema = z.object({
  page: positiveIntegerText.optional(),
  limit: positiveIntegerText.optional(),
  search: boundedText(100).optional(),
}).passthrough();
export const saleListQuerySchema = z.object({
  page: positiveIntegerText.optional(),
  limit: positiveIntegerText.optional(),
  from: isoDateQuery.optional(),
  to: isoDateQuery.optional(),
  customerId: positiveIntegerText.optional(),
  sale_type: z.enum(['retail', 'wholesale']).optional(),
  status: z.enum(['held', 'completed', 'cancelled', 'refunded']).optional(),
  invoiceId: boundedText(100).optional(),
});
export const shiftListQuerySchema = z.object({
  page: positiveIntegerText.optional(),
  limit: positiveIntegerText.optional(),
  status: z.enum(['open', 'closed']).optional(),
});
export const inventoryBalanceQuerySchema = z.object({
  page: positiveIntegerText.optional(),
  limit: positiveIntegerText.optional(),
  search: boundedText(100).optional(),
  category_id: positiveIntegerText.optional(),
  low_stock_only: z.enum(['true', 'false']).optional(),
});
export const inventoryMovementQuerySchema = z.object({
  page: positiveIntegerText.optional(),
  limit: positiveIntegerText.optional(),
  product_id: positiveIntegerText.optional(),
  movement_type: boundedText(50).optional(),
  from: isoDateQuery.optional(),
  to: isoDateQuery.optional(),
});
export const productListQuerySchema = z.object({
  page: positiveIntegerText.optional(),
  limit: positiveIntegerText.optional(),
  search: boundedText(100).optional(),
  categoryId: positiveIntegerText.optional(),
  lowStock: z.enum(['true', 'false']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});
export const productLookupQuerySchema = z.object({
  query: boundedText(200).min(1),
  isActive: z.enum(['true', 'false']).optional(),
});
export const expenseListQuerySchema = z.object({
  page: positiveIntegerText.optional(),
  limit: positiveIntegerText.optional(),
  from: isoDateQuery.optional(),
  to: isoDateQuery.optional(),
  category: boundedText(100).optional(),
});
export const supplierInvoiceListQuerySchema = z.object({
  supplierId: positiveIntegerText.optional(),
  page: positiveIntegerText.optional(),
  limit: positiveIntegerText.optional(),
});
export const reportQuerySchema = z.object({
  from: isoDateQuery.optional(),
  to: isoDateQuery.optional(),
  sale_type: z.enum(['retail', 'wholesale']).optional(),
  categoryId: positiveIntegerText.optional(),
});

export const ownerLoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});
const ownerPassword = z.string().trim().min(8).max(128).refine(
  (value) => !['admin', 'password', '12345678'].includes(value.toLowerCase()),
  'Password is too weak',
);
export const ownerCompanySchema = z.object({
  name: boundedText(200).optional(),
  legal_name: optionalText(250),
  phone: optionalText(30),
  email: z.string().trim().email().max(254).optional().nullable().or(z.literal('')),
  password: ownerPassword,
  address: boundedText(500).min(1),
  app_name: optionalText(150),
  supervisor_name: optionalText(150),
  supervisor_phone: optionalText(30),
}).refine((value) => Boolean(value.name || value.phone), { message: 'Company name or phone is required' });
export const updateOwnerCompanySchema = z.object({
  name: boundedText(200).optional(),
  legal_name: optionalText(250),
  phone: optionalText(30),
  email: z.string().trim().email().max(254).optional().nullable().or(z.literal('')),
  password: ownerPassword.optional(),
  address: boundedText(500).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  app_name: optionalText(150),
  supervisor_name: optionalText(150),
  supervisor_phone: optionalText(30),
});
export const companyStatusSchema = z.object({ status: z.enum(['active', 'suspended']) });

const idArray = z.array(positiveId).max(500);
export const ownerPlanSchema = z.object({
  name: boundedText(150).min(1),
  description: optionalText(2000),
  price_monthly: finiteMoney,
  price_yearly: finiteMoney,
  is_lifetime: z.boolean().optional(),
  max_users: positiveId.optional(),
  max_devices: positiveId.optional(),
  max_branches: positiveId.optional(),
  moduleIds: idArray.optional(),
  featureIds: idArray.optional(),
});
export const updateOwnerPlanSchema = ownerPlanSchema.partial().extend({ is_active: z.boolean().optional() });

const moduleOverride = z.object({ moduleId: positiveId, isEnabled: z.boolean() });
const featureOverride = z.object({ featureId: positiveId, isEnabled: z.boolean() });
export const ownerLicenseSchema = z.object({
  company_id: positiveId,
  plan_id: positiveId,
  type: z.enum(['subscription', 'lifetime']).optional(),
  expires_at: dateText.optional().nullable(),
  max_devices: positiveId.optional(),
  max_users: positiveId.optional(),
  max_branches: positiveId.optional(),
  allow_all_modules: z.boolean().optional(),
  customModules: z.array(moduleOverride).max(500).optional(),
  customFeatures: z.array(featureOverride).max(500).optional(),
});
export const updateOwnerLicenseSchema = ownerLicenseSchema.omit({ company_id: true, plan_id: true }).partial();
export const extendLicenseSchema = z.object({
  days: z.coerce.number().int().positive().max(36500).optional(),
  newExpiryDate: dateText.optional(),
}).refine((value) => value.days !== undefined || value.newExpiryDate !== undefined, { message: 'days or newExpiryDate is required' });
export const ownerPaymentSchema = z.object({
  company_id: positiveId,
  license_id: positiveId,
  plan_id: positiveId,
  amount: z.coerce.number().finite().positive(),
  billing_cycle: z.enum(['monthly', 'yearly', 'lifetime']).optional(),
  method: boundedText(50).min(1),
  notes: optionalText(1000),
});
