-- Additive security and financial-integrity foundation.
-- Product.stock_qty is removed by the later contract migration after application compatibility is established.

-- Bring historical databases and fresh migration installs to the same shift schema.
CREATE TABLE IF NOT EXISTS "shifts" (
  "id" SERIAL PRIMARY KEY,
  "company_id" INTEGER NOT NULL REFERENCES "companies" ("id") ON DELETE CASCADE,
  "branch_id" INTEGER NOT NULL REFERENCES "branches" ("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'open',
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "opening_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cash_sales_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cash_refunds_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cash_in_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cash_out_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "expected_cash" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "actual_cash" DOUBLE PRECISION,
  "difference" DOUBLE PRECISION,
  "variance_reason" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "shifts_company_branch_status_idx" ON "shifts" ("company_id", "branch_id", "status");
CREATE INDEX IF NOT EXISTS "shifts_user_status_idx" ON "shifts" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "shifts_opened_at_idx" ON "shifts" ("opened_at");

CREATE TABLE IF NOT EXISTS "cash_movements" (
  "id" SERIAL PRIMARY KEY,
  "shift_id" INTEGER NOT NULL REFERENCES "shifts" ("id") ON DELETE CASCADE,
  "company_id" INTEGER NOT NULL REFERENCES "companies" ("id") ON DELETE CASCADE,
  "branch_id" INTEGER NOT NULL REFERENCES "branches" ("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "reason" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "cash_movements_shift_id_idx" ON "cash_movements" ("shift_id");
CREATE INDEX IF NOT EXISTS "cash_movements_company_branch_created_idx" ON "cash_movements" ("company_id", "branch_id", "created_at");

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "shift_id" INTEGER;
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_shift_id_fkey";
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "shifts" ("id") ON DELETE SET NULL NOT VALID;

-- Tenant-scoped idempotency replaces the old globally unique key.
DROP INDEX IF EXISTS "idx_sales_idempotency_key";
CREATE UNIQUE INDEX IF NOT EXISTS "sales_company_id_idempotency_key_key"
  ON "sales" ("company_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Stable composite targets used by tenant-safe foreign keys and validation.
CREATE UNIQUE INDEX IF NOT EXISTS "branches_company_id_id_key" ON "branches" ("company_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "products_company_id_id_key" ON "products" ("company_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "customers_company_id_id_key" ON "customers" ("company_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_company_id_id_key" ON "suppliers" ("company_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_company_id_id_key" ON "sales" ("company_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_company_id_id_key" ON "users" ("company_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "shifts_company_id_id_key" ON "shifts" ("company_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "refunds_company_id_id_key" ON "refunds" ("company_id", "id");

-- Customer ledger traceability and exact reversals.
ALTER TABLE "customer_transactions"
  ADD COLUMN IF NOT EXISTS "source_type" TEXT,
  ADD COLUMN IF NOT EXISTS "source_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "reversal_of_id" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "customer_transactions_company_id_idempotency_key_key"
  ON "customer_transactions" ("company_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "customer_transactions_company_source_idx"
  ON "customer_transactions" ("company_id", "source_type", "source_id");
ALTER TABLE "customer_transactions" DROP CONSTRAINT IF EXISTS "customer_transactions_reversal_of_id_fkey";
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_reversal_of_id_fkey"
  FOREIGN KEY ("reversal_of_id") REFERENCES "customer_transactions" ("id") ON DELETE SET NULL NOT VALID;

-- Refund attribution and payment allocation.
ALTER TABLE "refunds"
  ALTER COLUMN "branch_id" DROP DEFAULT,
  ADD COLUMN IF NOT EXISTS "shift_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "user_id" INTEGER;

ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_shift_id_fkey";
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "shifts" ("id") ON DELETE SET NULL NOT VALID;
ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_user_id_fkey";
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL NOT VALID;
CREATE INDEX IF NOT EXISTS "refunds_shift_id_idx" ON "refunds" ("shift_id");

CREATE TABLE IF NOT EXISTS "refund_payments" (
  "id" SERIAL PRIMARY KEY,
  "refund_id" INTEGER NOT NULL REFERENCES "refunds" ("id") ON DELETE CASCADE,
  "company_id" INTEGER NOT NULL REFERENCES "companies" ("id") ON DELETE CASCADE,
  "branch_id" INTEGER NOT NULL REFERENCES "branches" ("id") ON DELETE CASCADE,
  "method" "PaymentMethod" NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL CHECK ("amount" > 0),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "refund_payments_refund_id_idx" ON "refund_payments" ("refund_id");
CREATE INDEX IF NOT EXISTS "refund_payments_company_branch_method_created_idx"
  ON "refund_payments" ("company_id", "branch_id", "method", "created_at");

-- Shared, atomic rate limiting for serverless/multi-instance deployments.
CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "scope" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "window_start" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expires_at" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("scope", "key_hash", "window_start")
);
CREATE INDEX IF NOT EXISTS "rate_limit_buckets_expires_at_idx" ON "rate_limit_buckets" ("expires_at");

-- Collision-free invoice numbering, scoped by company and business date.
CREATE TABLE IF NOT EXISTS "invoice_counters" (
  "company_id" INTEGER NOT NULL,
  "business_date" TEXT NOT NULL,
  "next_value" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("company_id", "business_date")
);

-- Immutable tenant audit trail. Application grants INSERT/SELECT only; no update/delete API exists.
CREATE TABLE IF NOT EXISTS "tenant_audit_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "company_id" INTEGER NOT NULL REFERENCES "companies" ("id") ON DELETE CASCADE,
  "branch_id" INTEGER REFERENCES "branches" ("id") ON DELETE SET NULL,
  "user_id" INTEGER REFERENCES "users" ("id") ON DELETE SET NULL,
  "request_id" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "tenant_audit_logs_company_branch_created_idx"
  ON "tenant_audit_logs" ("company_id", "branch_id", "created_at");
CREATE INDEX IF NOT EXISTS "tenant_audit_logs_company_user_created_idx"
  ON "tenant_audit_logs" ("company_id", "user_id", "created_at");
CREATE INDEX IF NOT EXISTS "tenant_audit_logs_company_entity_idx"
  ON "tenant_audit_logs" ("company_id", "entity_type", "entity_id");

-- Company-consistent foreign keys on rows that carry company_id.
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_company_branch_fkey"
  FOREIGN KEY ("company_id", "branch_id") REFERENCES "branches" ("company_id", "id") NOT VALID;
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_company_product_fkey"
  FOREIGN KEY ("company_id", "product_id") REFERENCES "products" ("company_id", "id") NOT VALID;
ALTER TABLE "sales" ADD CONSTRAINT "sales_company_branch_fkey"
  FOREIGN KEY ("company_id", "branch_id") REFERENCES "branches" ("company_id", "id") NOT VALID;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_company_sale_fkey"
  FOREIGN KEY ("company_id", "sale_id") REFERENCES "sales" ("company_id", "id") NOT VALID;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_company_branch_fkey"
  FOREIGN KEY ("company_id", "branch_id") REFERENCES "branches" ("company_id", "id") NOT VALID;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_company_user_fkey"
  FOREIGN KEY ("company_id", "user_id") REFERENCES "users" ("company_id", "id") NOT VALID;

-- Eliminate insecure defaults without invalidating existing password hashes.
ALTER TABLE "users" ALTER COLUMN "password" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "plain_password" DROP DEFAULT;
UPDATE "users" SET "plain_password" = NULL WHERE "plain_password" IS NOT NULL;
