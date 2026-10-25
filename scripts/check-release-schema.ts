/** Read-only release preflight. Never changes schema, data, or migration history. */
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { Prisma, PrismaClient } from '@prisma/client'

const db = new PrismaClient()
try {
  const [history, columns, enumRows, folders] = await Promise.all([
    db.$queryRaw<Array<{ migration_name: string; checksum: string; finished: boolean; rolled_back: boolean }>>`
      SELECT migration_name, checksum, finished_at IS NOT NULL AS finished,
        rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations"`,
    db.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    db.$queryRaw<Array<{ name: string; value: string }>>`
      SELECT t.typname AS name, e.enumlabel AS value FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'`,
    readdir(new URL('../prisma/migrations/', import.meta.url), { withFileTypes: true }),
  ])
  const migrationNames = folders.filter(folder => folder.isDirectory()).map(folder => folder.name).sort()
  const pending: string[] = []
  const checksumMismatches: string[] = []
  for (const name of migrationNames) {
    const applied = history.find(row => row.migration_name === name && row.finished && !row.rolled_back)
    if (!applied) { pending.push(name); continue }
    const sql = await readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url))
    if (createHash('sha256').update(sql).digest('hex') !== applied.checksum) checksumMismatches.push(name)
  }
  const actualColumns = new Set(columns.map(column => `${column.table_name}.${column.column_name}`))
  const missingColumns = Prisma.dmmf.datamodel.models.flatMap(model => model.fields
    .filter(field => field.kind !== 'object')
    .map(field => `${model.dbName ?? model.name}.${field.dbName ?? field.name}`))
    .filter(column => !actualColumns.has(column))
  const actualEnums = new Set(enumRows.map(row => `${row.name}.${row.value}`))
  const missingEnumValues = Prisma.dmmf.datamodel.enums.flatMap(type => type.values
    .map(value => `${type.dbName ?? type.name}.${value.dbName ?? value.name}`))
    .filter(value => !actualEnums.has(value))
  const failedMigrations = history.filter(row => !row.finished && !row.rolled_back).map(row => row.migration_name)
  console.log(JSON.stringify({ pendingMigrations: pending, missingColumns, missingEnumValues, checksumMismatches, failedMigrations }, null, 2))
  if (pending.length || missingColumns.length || missingEnumValues.length || checksumMismatches.length || failedMigrations.length) process.exitCode = 1
} catch (error: unknown) {
  // Prisma connection errors can include connection metadata: keep diagnostics bounded.
  console.error('Schema preflight could not finish.', error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'Check database connectivity and migration history.')
  process.exitCode = 1
} finally { await db.$disconnect() }
