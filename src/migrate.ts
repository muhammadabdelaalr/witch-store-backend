/**
 * The former one-off SQLite migrator contained a machine-specific path and
 * truncated shared PostgreSQL tables before importing unscoped rows. Keeping
 * that behavior callable is unsafe in a multi-tenant deployment.
 *
 * Historical desktop imports must now be implemented as a tenant-scoped,
 * dry-run-first tool with explicit company and branch IDs. The supported test
 * cleanup path is scripts/reset-test-data.ts.
 */
throw new Error(
  'LEGACY_MIGRATION_DISABLED: use a tenant-scoped importer with explicit company/branch IDs and a staging snapshot',
);
