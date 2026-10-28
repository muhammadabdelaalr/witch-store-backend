-- Complete database-level tenant isolation for every relation carrying company_id.
-- Constraints are added NOT VALID first, then validated explicitly so staging exposes
-- legacy cross-tenant rows before production rollout.

CREATE UNIQUE INDEX IF NOT EXISTS "categories_company_id_id_key" ON "categories" ("company_id", "id");

ALTER TABLE "products" ADD CONSTRAINT "products_company_branch_fkey"
  FOREIGN KEY ("company_id", "branch_id") REFERENCES "branches" ("company_id", "id") NOT VALID;
ALTER TABLE "products" ADD CONSTRAINT "products_company_category_fkey"
  FOREIGN KEY ("company_id", "category_id") REFERENCES "categories" ("company_id", "id") NOT VALID;

ALTER TABLE "sales" ADD CONSTRAINT "sales_company_shift_fkey"
  FOREIGN KEY ("company_id", "shift_id") REFERENCES "shifts" ("company_id", "id") NOT VALID;
ALTER TABLE "sales" ADD CONSTRAINT "sales_company_customer_fkey"
  FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers" ("company_id", "id") NOT VALID;

ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_company_sale_fkey"
  FOREIGN KEY ("company_id", "sale_id") REFERENCES "sales" ("company_id", "id") ON DELETE CASCADE NOT VALID;

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_company_branch_fkey"
  FOREIGN KEY ("company_id", "branch_id") REFERENCES "branches" ("company_id", "id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_company_product_fkey"
  FOREIGN KEY ("company_id", "product_id") REFERENCES "products" ("company_id", "id") ON DELETE CASCADE NOT VALID;

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_branch_fkey"
  FOREIGN KEY ("company_id", "branch_id") REFERENCES "branches" ("company_id", "id") NOT VALID;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_category_fkey"
  FOREIGN KEY ("company_id", "category_id") REFERENCES "categories" ("company_id", "id") NOT VALID;

ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_company_customer_fkey"
  FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers" ("company_id", "id") NOT VALID;

ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_company_supplier_fkey"
  FOREIGN KEY ("company_id", "supplier_id") REFERENCES "suppliers" ("company_id", "id") NOT VALID;
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_company_invoice_fkey"
  FOREIGN KEY ("company_id", "invoice_id") REFERENCES "supplier_invoices" ("company_id", "id") NOT VALID;

ALTER TABLE "users" ADD CONSTRAINT "users_company_branch_fkey"
  FOREIGN KEY ("company_id", "branch_id") REFERENCES "branches" ("company_id", "id") NOT VALID;

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_company_branch_fkey"
  FOREIGN KEY ("company_id", "branch_id") REFERENCES "branches" ("company_id", "id") NOT VALID;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_company_shift_fkey"
  FOREIGN KEY ("company_id", "shift_id") REFERENCES "shifts" ("company_id", "id") NOT VALID;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_company_user_fkey"
  FOREIGN KEY ("company_id", "user_id") REFERENCES "users" ("company_id", "id") NOT VALID;

ALTER TABLE "refund_payments" ADD CONSTRAINT "refund_payments_company_refund_fkey"
  FOREIGN KEY ("company_id", "refund_id") REFERENCES "refunds" ("company_id", "id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "refund_payments" ADD CONSTRAINT "refund_payments_company_branch_fkey"
  FOREIGN KEY ("company_id", "branch_id") REFERENCES "branches" ("company_id", "id") ON DELETE CASCADE NOT VALID;

ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_company_branch_fkey"
  FOREIGN KEY ("company_id", "branch_id") REFERENCES "branches" ("company_id", "id") NOT VALID;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_company_supplier_fkey"
  FOREIGN KEY ("company_id", "supplier_id") REFERENCES "suppliers" ("company_id", "id") NOT VALID;

ALTER TABLE "supplier_invoice_history" ADD CONSTRAINT "supplier_invoice_history_company_invoice_fkey"
  FOREIGN KEY ("company_id", "invoice_id") REFERENCES "supplier_invoices" ("company_id", "id") ON DELETE CASCADE NOT VALID;

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_company_shift_fkey"
  FOREIGN KEY ("company_id", "shift_id") REFERENCES "shifts" ("company_id", "id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_company_branch_fkey"
  FOREIGN KEY ("company_id", "branch_id") REFERENCES "branches" ("company_id", "id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_company_user_fkey"
  FOREIGN KEY ("company_id", "user_id") REFERENCES "users" ("company_id", "id") ON DELETE CASCADE NOT VALID;

ALTER TABLE "tenant_audit_logs" ADD CONSTRAINT "tenant_audit_logs_company_branch_fkey"
  FOREIGN KEY ("company_id", "branch_id") REFERENCES "branches" ("company_id", "id") NOT VALID;
ALTER TABLE "tenant_audit_logs" ADD CONSTRAINT "tenant_audit_logs_company_user_fkey"
  FOREIGN KEY ("company_id", "user_id") REFERENCES "users" ("company_id", "id") NOT VALID;

-- Existing rows are validated by prisma/deferred/validate_tenant_constraints.sql
-- after baseline mismatches have been resolved. New writes are protected now.
