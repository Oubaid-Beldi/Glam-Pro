import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// A tiny in-memory stand-in for the supabase-js query builder — just the calls
// the services actually make (select/insert/update/delete, eq/ilike/in/limit,
// maybeSingle/single/returns, awaiting the builder). Not a Postgres emulator:
// the only constraint it enforces is project_members' (project_id, user_id) key.

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>
type Result = { data: unknown; error: { code: string; message: string } | null }

class FakeQuery implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private filters: ((row: Row) => boolean)[] = []
  private payload: Row[] = []
  private patch: Row = {}
  private max: number | null = null
  private readonly tables: Tables
  private readonly table: string

  constructor(tables: Tables, table: string) {
    this.tables = tables
    this.table = table
    this.tables[table] ??= []
  }

  select() {
    return this
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert'
    this.payload = Array.isArray(rows) ? rows : [rows]
    return this
  }
  update(patch: Row) {
    this.op = 'update'
    this.patch = patch
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }
  ilike(column: string, pattern: string) {
    const target = pattern.replace(/\\(.)/g, '$1').toLowerCase()
    this.filters.push((row) => typeof row[column] === 'string' && (row[column] as string).toLowerCase() === target)
    return this
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]))
    return this
  }
  limit(n: number) {
    this.max = n
    return this
  }
  returns() {
    return this
  }

  private matching(): Row[] {
    const rows = this.tables[this.table].filter((row) => this.filters.every((f) => f(row)))
    return this.max === null ? rows : rows.slice(0, this.max)
  }

  private execute(): Result {
    const rows = this.tables[this.table]
    switch (this.op) {
      case 'select':
        return { data: this.matching().map((r) => ({ ...r })), error: null }
      case 'insert': {
        const inserted: Row[] = []
        for (const input of this.payload) {
          if (
            this.table === 'project_members' &&
            rows.some((r) => r.project_id === input.project_id && r.user_id === input.user_id)
          ) {
            return { data: null, error: { code: '23505', message: 'duplicate key value' } }
          }
          const row: Row = { created_at: new Date().toISOString(), ...input }
          if (this.table === 'project_invitations') row.id ??= randomUUID()
          rows.push(row)
          inserted.push({ ...row })
        }
        return { data: inserted, error: null }
      }
      case 'update': {
        const updated = this.matching()
        for (const row of updated) Object.assign(row, this.patch)
        return { data: updated.map((r) => ({ ...r })), error: null }
      }
      case 'delete': {
        const doomed = new Set(this.matching())
        this.tables[this.table] = rows.filter((r) => !doomed.has(r))
        return { data: [...doomed], error: null }
      }
    }
  }

  maybeSingle(): Promise<Result> {
    const result = this.execute()
    if (result.error) return Promise.resolve(result)
    const data = result.data as Row[]
    if (data.length > 1) return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'multiple rows' } })
    return Promise.resolve({ data: data[0] ?? null, error: null })
  }

  single(): Promise<Result> {
    const result = this.execute()
    if (result.error) return Promise.resolve(result)
    const data = result.data as Row[]
    if (data.length !== 1) return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'not one row' } })
    return Promise.resolve({ data: data[0], error: null })
  }

  then<T1 = Result, T2 = never>(
    onFulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected)
  }
}

export function createFakeSupabase(seed: Tables = {}) {
  const tables: Tables = Object.fromEntries(Object.entries(seed).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]))
  const client = { from: (table: string) => new FakeQuery(tables, table) } as unknown as SupabaseClient
  return { client, tables }
}
