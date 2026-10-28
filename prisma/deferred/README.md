# Deferred database contractions

These SQL files are intentionally outside Prisma's automatic migration chain.
Run them only on staging after a snapshot, scoped test-data cleanup, a clean
baseline audit, and successful application smoke tests. Promote the same SQL to
production only after the full verification window.

Order:

1. `validate_tenant_constraints.sql`
2. `remove_sensitive_legacy_columns.sql`
3. `remove_legacy_product_stock.sql`
