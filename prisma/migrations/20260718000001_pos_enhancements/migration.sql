-- Phase 3 POS Enhancements Migration
-- Adds invoice_number, status, cancellation tracking, idempotency key to sales.
-- Creates sale_payments and inventory_movements tables.
-- Adds line_discount to sale_items.

-- Add new columns to sales table
ALTER TABLE "sales"
ADD COLUMN IF NOT EXISTS "invoice_number" TEXT,
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT,
ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "cancelled_by" TEXT,
ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

-- Add partial unique index for idempotency_key (unique when not null)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_sales_idempotency_key"
ON "sales" ("idempotency_key")
WHERE "idempotency_key" IS NOT NULL;

-- Add unique constraint for invoice_number per company
CREATE UNIQUE INDEX IF NOT EXISTS "idx_sales_company_invoice_unique"
ON "sales" ("company_id", "invoice_number")
WHERE "invoice_number" IS NOT NULL;

-- Add line_discount to sale_items
ALTER TABLE "sale_items"
ADD COLUMN IF NOT EXISTS "line_discount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Create sale_payments table
CREATE TABLE IF NOT EXISTS "sale_payments" (
  "id" SERIAL NOT NULL,
  "sale_id" INTEGER NOT NULL,
  "company_id" INTEGER NOT NULL,
  "method" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- Sale payments foreign keys
ALTER TABLE "sale_payments"
DROP CONSTRAINT IF EXISTS "sale_payments_sale_id_fkey",
ADD CONSTRAINT "sale_payments_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sale_payments"
DROP CONSTRAINT IF EXISTS "sale_payments_company_id_fkey",
ADD CONSTRAINT "sale_payments_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_sale_payments_sale"
ON "sale_payments" ("sale_id");

CREATE INDEX IF NOT EXISTS "idx_sale_payments_company_method_date"
ON "sale_payments" ("company_id", "method", "created_at");

-- Create inventory_movements table
CREATE TABLE IF NOT EXISTS "inventory_movements" (
  "id" SERIAL NOT NULL,
  "company_id" INTEGER NOT NULL,
  "branch_id" INTEGER NOT NULL,
  "product_id" INTEGER NOT NULL,
  "movement_type" TEXT NOT NULL,
  "quantity_delta" INTEGER NOT NULL,
  "balance_after" INTEGER,
  "reference_type" TEXT NOT NULL,
  "reference_id" INTEGER NOT NULL,
  "user_id" INTEGER,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- Inventory movements foreign keys
ALTER TABLE "inventory_movements"
DROP CONSTRAINT IF EXISTS "inventory_movements_company_id_fkey",
ADD CONSTRAINT "inventory_movements_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_movements"
DROP CONSTRAINT IF EXISTS "inventory_movements_branch_id_fkey",
ADD CONSTRAINT "inventory_movements_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_movements"
DROP CONSTRAINT IF EXISTS "inventory_movements_product_id_fkey",
ADD CONSTRAINT "inventory_movements_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_inventory_movements_company_branch_product"
ON "inventory_movements" ("company_id", "branch_id", "product_id");

CREATE INDEX IF NOT EXISTS "idx_inventory_movements_company_branch_date"
ON "inventory_movements" ("company_id", "branch_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_inventory_movements_reference"
ON "inventory_movements" ("reference_type", "reference_id");

-- Sales indexes for Phase 3 query patterns
CREATE INDEX IF NOT EXISTS "idx_sales_company_branch_date"
ON "sales" ("company_id", "branch_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_sales_company_invoice"
ON "sales" ("company_id", "invoice_number")
WHERE "invoice_number" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_sales_company_branch_status_date"
ON "sales" ("company_id", "branch_id", "status", "created_at" DESC);
