import { describe, expect, it, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app';
import { generateRefreshToken, generateUserAccessToken, verifyAccessToken } from '../src/utils/jwt';
import {
  idParamSchema,
  ownerCompanySchema,
  productSchema,
  refundSchema,
  saleSchema,
  supplierTransactionSchema,
} from '../src/middleware/validate';
import { buildFallbackPayments, calculateAppliedPayment, calculateCustomerDebt, calculateDefaultTendered, calculateTotals } from '../src/services/sale.service';
import { PaymentMethod } from '../src/generated/prisma';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-access-secret-with-at-least-32-characters';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-with-at-least-32-characters';
});

describe('employee sessions', () => {
  it('signs the tenant, branch, device, and user identity for 12 hours', () => {
    const session = generateUserAccessToken({
      user_id: 7,
      company_id: 2,
      license_id: 3,
      device_id: 'device-1',
      branch_id: 4,
    });
    const payload = verifyAccessToken(session.token);
    const decoded = jwt.decode(session.token) as jwt.JwtPayload;
    expect(payload).toMatchObject({ role: 'user', user_id: 7, company_id: 2, branch_id: 4, device_id: 'device-1' });
    expect((decoded.exp || 0) - (decoded.iat || 0)).toBe(12 * 60 * 60);
  });

  it('does not allow refresh tokens for employees', () => {
    expect(() => generateRefreshToken({
      role: 'user', user_id: 7, company_id: 2, license_id: 3, device_id: 'device-1', branch_id: 4,
    })).toThrow(/do not support refresh/i);
  });
});

describe('sale validation', () => {
  it('accepts line discounts and strips client-supplied seller identity', () => {
    const result = saleSchema.parse({
      items: [{ product_id: 1, qty: 2, unit_price: 10, line_discount: 1 }],
      discount: 10,
      tax: 14,
      payment_method: 'cash',
      amount_paid: 20,
      seller_name: 'spoofed',
      idempotency_key: 'd0f5ad8d-ec41-4b96-9f32-e346cabb59c8',
    });
    expect(result.items[0].line_discount).toBe(1);
    expect(result).not.toHaveProperty('seller_name');
  });

  it('rejects fractional piece quantities', () => {
    expect(() => saleSchema.parse({
      items: [{ product_id: 1, qty: 1.5, unit_price: 10 }],
      payment_method: 'cash',
    })).toThrow();
  });

  it('applies line discount, then invoice discount, then tax', () => {
    expect(calculateTotals(
      [{ qty: 2, unit_price: 10, line_discount: 1 }],
      10,
      14,
    )).toEqual({
      subtotal: 18,
      discountAmount: 1.8,
      taxableAmount: 16.2,
      taxAmount: 2.27,
      total: 18.47,
    });
  });

  it('treats over-tender as change and allocates only the invoice amount', () => {
    expect(calculateCustomerDebt(18.47, 20)).toBe(0);
    expect(calculateAppliedPayment('cash', 18.47, 20)).toBe(18.47);
    expect(calculateAppliedPayment('deferred', 18.47, 0)).toBe(18.47);
    expect(buildFallbackPayments(PaymentMethod.deferred, 100, 25)).toEqual([
      { method: PaymentMethod.cash, amount: 25 },
      { method: PaymentMethod.deferred, amount: 75 },
    ]);
    expect(calculateDefaultTendered([
      { method: PaymentMethod.cash, amount: 25 },
      { method: PaymentMethod.deferred, amount: 75 },
    ], PaymentMethod.deferred, 100)).toBe(25);
    expect(calculateDefaultTendered([], PaymentMethod.deferred, 100)).toBe(0);
  });
});

describe('request validation contracts', () => {
  it('strips seller identity from refunds and supplier payments', () => {
    const refund = refundSchema.parse({
      items: [{ product_id: 1, qty: 1 }],
      seller_name: 'spoofed',
    });
    const supplierPayment = supplierTransactionSchema.parse({
      supplier_id: 1,
      type: 'payment',
      amount: 10,
      notes: 'receipt',
      seller_name: 'spoofed',
    });
    expect(refund).not.toHaveProperty('seller_name');
    expect(supplierPayment).not.toHaveProperty('seller_name');
  });

  it('rejects invalid IDs, non-finite product numbers, and weak owner passwords', () => {
    expect(() => idParamSchema.parse({ id: '../1' })).toThrow();
    expect(() => productSchema.parse({ name: 'P', cost_price: Number.NaN })).toThrow();
    expect(() => ownerCompanySchema.parse({
      name: 'Tenant', address: 'Cairo', supervisor_name: 'Owner', supervisor_phone: '1', password: 'admin',
    })).toThrow();
  });
});

describe('HTTP hardening and versioning', () => {
  const app = createApp();

  it('exposes health without credentials and adds security headers', async () => {
    const response = await request(app).get('/health').expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('marks the legacy API as deprecated while keeping v1 canonical', async () => {
    const legacy = await request(app).get('/api/products').expect(401);
    const v1 = await request(app).get('/api/v1/products').expect(401);
    expect(legacy.headers.deprecation).toBe('true');
    expect(v1.headers.deprecation).toBeUndefined();
  });
});
