import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { fetchHandler } from '../worker/server.mjs'

export function setup() {
  const sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter(x => x.endsWith('.sql'))) sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'))
  const DB = { prepare(sql) { let args = []; return { bind(...value) { args = value; return this }, async all() { return { results: sqlite.prepare(sql).all(...args) } }, async first() { return sqlite.prepare(sql).get(...args) ?? null }, async run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } } } } }, async batch(statements) { sqlite.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results } catch (e) { sqlite.exec('ROLLBACK'); throw e } } }
  const env = { DB, COLLECTOR_KEY: 'test-key-0123456789-0123456789', SOURCE_KEY: 'company:PC-20251130TKZA' }
  const call = (path, method = 'GET', body, headers = {}) => fetchHandler(new Request(`https://example.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env)
  const user = { 'oai-authenticated-user-id': 'fixture-user', Origin: 'https://example.test' }
  const service = { 'X-CP-Collector-Key': env.COLLECTOR_KEY }
  return { env, call, user, service, sqlite }
}
export const fixture = () => ({ sourceKey: 'company:PC-20251130TKZA', machine: 'PC-20251130TKZA', capturedAt: new Date().toISOString(), taskReadOK: true, tasks: [{ id: 'tsk_0123456789abcdef', title: 'Synthetic source', status: 'active', phase: 'work', project: null, updated_at: '2026-10-12T00:00:00Z', conditions: [], steps: [{ id: 's1', title: 'Synthetic step', status: 'pending' }], events: [] }], agents: [], capabilities: [], warnings: [] })

