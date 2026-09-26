-- CreateTable Role
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[] NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- Add role_id to users
ALTER TABLE "users" ADD COLUMN "role_id" INTEGER;
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- Alter refresh_tokens for hashed-token storage and rotation
ALTER TABLE "refresh_tokens" ADD COLUMN "token_hash" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "revoked" BOOLEAN NOT NULL DEFAULT false;

-- Clear existing raw tokens; clients will re-login/re-activate to obtain rotated tokens
DELETE FROM "refresh_tokens";

ALTER TABLE "refresh_tokens" ALTER COLUMN "token" DROP NOT NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "token_hash" SET NOT NULL;
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_device_id_idx" ON "refresh_tokens"("device_id");

-- Seed default roles
INSERT INTO "roles" ("key", "name", "permissions", "updated_at") VALUES
('owner', 'Owner / المالك', ARRAY['pos:sale','pos:cancel','pos:reprint','pos:hold','products:read','products:create','products:update','products:delete','categories:read','categories:create','categories:update','categories:delete','customers:read','customers:create','customers:update','customers:delete','customers:payment','suppliers:read','suppliers:create','suppliers:update','suppliers:delete','supplier_invoices:create','supplier_invoices:update','suppliers:payment','expenses:read','expenses:create','expenses:update','expenses:delete','reports:read','users:read','users:create','users:update','users:delete','refunds:create','inventory:read','inventory:adjust'], CURRENT_TIMESTAMP),
('branch_manager', 'Branch Manager / مدير الفرع', ARRAY['pos:sale','pos:cancel','pos:reprint','pos:hold','products:read','products:create','products:update','categories:read','customers:read','customers:create','customers:update','customers:payment','suppliers:read','suppliers:create','suppliers:update','supplier_invoices:create','suppliers:payment','expenses:read','expenses:create','reports:read','users:read','users:create','users:update','refunds:create','inventory:read','inventory:adjust'], CURRENT_TIMESTAMP),
('cashier', 'Cashier / كاشير', ARRAY['pos:sale','pos:hold','products:read','categories:read','customers:read','customers:create','customers:payment','expenses:read','expenses:create'], CURRENT_TIMESTAMP),
('sales', 'Sales / مبيعات', ARRAY['pos:sale','pos:hold','products:read','customers:read','customers:create','customers:update','customers:payment','reports:read'], CURRENT_TIMESTAMP),
('inventory', 'Inventory / مخزن', ARRAY['products:read','products:create','products:update','categories:read','categories:create','suppliers:read','supplier_invoices:create','inventory:read','inventory:adjust'], CURRENT_TIMESTAMP),
('purchasing', 'Purchasing / مشتريات', ARRAY['suppliers:read','suppliers:create','suppliers:update','supplier_invoices:create','supplier_invoices:update','suppliers:payment','products:read'], CURRENT_TIMESTAMP),
('accountant', 'Accountant / محاسب', ARRAY['reports:read','expenses:read','expenses:create','customers:read','customers:payment','suppliers:read','suppliers:payment'], CURRENT_TIMESTAMP),
('viewer', 'Viewer / عارض', ARRAY['products:read','customers:read','suppliers:read','reports:read','expenses:read'], CURRENT_TIMESTAMP);

-- Assign existing users to a default role
DO $$
DECLARE
  owner_role_id INTEGER;
  cashier_role_id INTEGER;
BEGIN
  SELECT id INTO owner_role_id FROM "roles" WHERE "key" = 'owner';
  SELECT id INTO cashier_role_id FROM "roles" WHERE "key" = 'cashier';
  UPDATE "users" SET "role_id" = owner_role_id WHERE "isAdmin" = true;
  UPDATE "users" SET "role_id" = cashier_role_id WHERE "isAdmin" = false AND "role_id" IS NULL;
END $$;
