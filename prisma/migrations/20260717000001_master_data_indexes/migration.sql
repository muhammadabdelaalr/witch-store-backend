-- Add is_active flag to products for soft-filtering active catalog items
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Composite index for fast catalog filtering by company, category, and active status
CREATE INDEX IF NOT EXISTS "idx_products_company_category_active" ON "products" ("company_id", "category_id", "is_active");
