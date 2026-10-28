-- Denormalize company_id onto financial child rows so PostgreSQL can enforce tenant consistency.
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;
UPDATE "sale_items" si SET "company_id" = s."company_id" FROM "sales" s
WHERE si."sale_id" = s."id" AND si."company_id" IS NULL;

ALTER TABLE "refund_items" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;
UPDATE "refund_items" ri SET "company_id" = r."company_id" FROM "refunds" r
WHERE ri."refund_id" = r."id" AND ri."company_id" IS NULL;

ALTER TABLE "supplier_invoice_items" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;
UPDATE "supplier_invoice_items" sii SET "company_id" = i."company_id" FROM "supplier_invoices" i
WHERE sii."invoice_id" = i."id" AND sii."company_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "sale_items" WHERE "company_id" IS NULL) THEN
    RAISE EXCEPTION 'Preflight failed: sale_items contains rows without a resolvable company';
  END IF;
  IF EXISTS (SELECT 1 FROM "refund_items" WHERE "company_id" IS NULL) THEN
    RAISE EXCEPTION 'Preflight failed: refund_items contains rows without a resolvable company';
  END IF;
  IF EXISTS (SELECT 1 FROM "supplier_invoice_items" WHERE "company_id" IS NULL) THEN
    RAISE EXCEPTION 'Preflight failed: supplier_invoice_items contains rows without a resolvable company';
  END IF;
END $$;

ALTER TABLE "sale_items" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "refund_items" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "supplier_invoice_items" ALTER COLUMN "company_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoices_company_id_id_key"
  ON "supplier_invoices" ("company_id", "id");
CREATE INDEX IF NOT EXISTS "sale_items_company_id_sale_id_idx" ON "sale_items" ("company_id", "sale_id");
CREATE INDEX IF NOT EXISTS "refund_items_company_id_refund_id_idx" ON "refund_items" ("company_id", "refund_id");
CREATE INDEX IF NOT EXISTS "supplier_invoice_items_company_id_invoice_id_idx"
  ON "supplier_invoice_items" ("company_id", "invoice_id");

ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "sale_items_sale_id_fkey";
ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "sale_items_product_id_fkey";
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_company_sale_fkey"
  FOREIGN KEY ("company_id", "sale_id") REFERENCES "sales" ("company_id", "id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_company_product_fkey"
  FOREIGN KEY ("company_id", "product_id") REFERENCES "products" ("company_id", "id") NOT VALID;

ALTER TABLE "refund_items" DROP CONSTRAINT IF EXISTS "refund_items_refund_id_fkey";
ALTER TABLE "refund_items" DROP CONSTRAINT IF EXISTS "refund_items_product_id_fkey";
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_company_refund_fkey"
  FOREIGN KEY ("company_id", "refund_id") REFERENCES "refunds" ("company_id", "id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_company_product_fkey"
  FOREIGN KEY ("company_id", "product_id") REFERENCES "products" ("company_id", "id") NOT VALID;

ALTER TABLE "supplier_invoice_items" DROP CONSTRAINT IF EXISTS "supplier_invoice_items_invoice_id_fkey";
ALTER TABLE "supplier_invoice_items" DROP CONSTRAINT IF EXISTS "supplier_invoice_items_product_id_fkey";
ALTER TABLE "supplier_invoice_items" ADD CONSTRAINT "supplier_invoice_items_company_invoice_fkey"
  FOREIGN KEY ("company_id", "invoice_id") REFERENCES "supplier_invoices" ("company_id", "id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "supplier_invoice_items" ADD CONSTRAINT "supplier_invoice_items_company_product_fkey"
  FOREIGN KEY ("company_id", "product_id") REFERENCES "products" ("company_id", "id") NOT VALID;

-- Existing rows are validated only after the scoped cleanup and staging checks.
-- NOT VALID constraints still protect every new or modified row immediately.
