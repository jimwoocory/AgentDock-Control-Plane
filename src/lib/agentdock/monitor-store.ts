import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { AgentEvent, AgentMonitorSnapshot, MonitorCapability, ObservedAgent } from './monitor-types'

interface StateRow { collected_at: string | null; attempted_at: string | null; warnings: string }
interface AgentRow { payload: string; present: number }

function runtimeForCapability(id: string): ObservedAgent['runtime'] | null {
  if (id === 'codex') return 'codex'
  if (id === 'claude') return 'claude'
  if (id === 'agentdock') return 'agentdock'
  return null
}

export class MonitorStore {
  private db: Database.Database
  private sourceKey: string
  constructor(databasePath: string, sourceKey: string) {
    this.sourceKey = sourceKey
    if (databasePath !== ':memory:') mkdirSync(path.dirname(databasePath), { recursive: true })
    this.db = new Database(databasePath); this.db.pragma('journal_mode = WAL'); this.db.pragma('busy_timeout = 5000')
    this.db.exec(`CREATE TABLE IF NOT EXISTS cp_monitor_state (source_key TEXT PRIMARY KEY, collected_at TEXT, attempted_at TEXT, warnings TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cp_monitor_agents (source_key TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, present INTEGER NOT NULL, PRIMARY KEY(source_key,id));
      CREATE TABLE IF NOT EXISTS cp_monitor_capabilities (source_key TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(source_key,id));
      CREATE TABLE IF NOT EXISTS cp_monitor_events (id INTEGER PRIMARY KEY, source_key TEXT NOT NULL, agent_id TEXT NOT NULL, status TEXT NOT NULL, action TEXT NOT NULL, observed_at TEXT NOT NULL);`)
    this.db.prepare("INSERT OR IGNORE INTO cp_monitor_state VALUES (?, NULL, NULL, '[]')").run(sourceKey)
  }
  save(snapshot: AgentMonitorSnapshot): void {
    this.db.transaction(() => {
      const successful = new Set(snapshot.capabilities.filter(capability => capability.status === 'ok').map(capability => runtimeForCapability(capability.id)).filter((runtime): runtime is ObservedAgent['runtime'] => runtime !== null))
      const known = this.db.prepare('SELECT id,payload,present FROM cp_monitor_agents WHERE source_key=?').all(this.sourceKey) as Array<AgentRow & { id: string }>
      const received = new Set(snapshot.agents.map(agent => agent.id))
      for (const row of known) {
        const agent = JSON.parse(row.payload) as ObservedAgent
        if (successful.has(agent.runtime) && !received.has(agent.id)) this.db.prepare('UPDATE cp_monitor_agents SET present=0,payload=? WHERE source_key=? AND id=?').run(JSON.stringify({ ...agent, present: false, stale: false }), this.sourceKey, row.id)
        else if (!successful.has(agent.runtime)) this.db.prepare('UPDATE cp_monitor_agents SET payload=? WHERE source_key=? AND id=?').run(JSON.stringify({ ...agent, stale: true }), this.sourceKey, row.id)
      }
      for (const agent of snapshot.agents) {
        const prior = this.db.prepare('SELECT payload FROM cp_monitor_agents WHERE source_key=? AND id=?').get(this.sourceKey, agent.id) as { payload: string } | undefined
        this.db.prepare('INSERT INTO cp_monitor_agents VALUES (?,?,?,1) ON CONFLICT(source_key,id) DO UPDATE SET payload=excluded.payload,present=1').run(this.sourceKey, agent.id, JSON.stringify(agent))
        if (!prior || this.changed(JSON.parse(prior.payload) as ObservedAgent, agent)) this.db.prepare('INSERT INTO cp_monitor_events(source_key,agent_id,status,action,observed_at) VALUES (?,?,?,?,?)').run(this.sourceKey, agent.id, agent.status, agent.rawStatus || 'observed', agent.observedAt)
      }
      this.db.prepare('DELETE FROM cp_monitor_events WHERE source_key=? AND id NOT IN (SELECT id FROM cp_monitor_events WHERE source_key=? ORDER BY id DESC LIMIT 1000)').run(this.sourceKey, this.sourceKey)
      for (const capability of snapshot.capabilities) this.db.prepare('INSERT INTO cp_monitor_capabilities VALUES (?,?,?) ON CONFLICT(source_key,id) DO UPDATE SET payload=excluded.payload').run(this.sourceKey, capability.id, JSON.stringify(capability))
      this.db.prepare('UPDATE cp_monitor_state SET collected_at=?,attempted_at=?,warnings=? WHERE source_key=?').run(snapshot.collectedAt, snapshot.collectedAt, JSON.stringify(snapshot.warnings), this.sourceKey)
    })()
  }
  fail(message: string, attemptedAt: string, capabilities: MonitorCapability[] = []): void {
    this.db.transaction(() => {
      const rows = this.db.prepare('SELECT id,payload FROM cp_monitor_agents WHERE source_key=?').all(this.sourceKey) as Array<{ id: string; payload: string }>
      for (const row of rows) this.db.prepare('UPDATE cp_monitor_agents SET payload=? WHERE source_key=? AND id=?').run(JSON.stringify({ ...(JSON.parse(row.payload) as ObservedAgent), stale: true }), this.sourceKey, row.id)
      for (const capability of capabilities) this.db.prepare('INSERT INTO cp_monitor_capabilities VALUES (?,?,?) ON CONFLICT(source_key,id) DO UPDATE SET payload=excluded.payload').run(this.sourceKey, capability.id, JSON.stringify(capability))
      this.db.prepare('UPDATE cp_monitor_state SET attempted_at=?,warnings=? WHERE source_key=?').run(attemptedAt, JSON.stringify([message.slice(0, 4000)]), this.sourceKey)
    })()
  }
  snapshot(): AgentMonitorSnapshot {
    const state = this.db.prepare('SELECT * FROM cp_monitor_state WHERE source_key=?').get(this.sourceKey) as StateRow
    const stale = !state.collected_at || Date.now() - Date.parse(state.collected_at) > 60000 || state.attempted_at !== state.collected_at
    const agents = (this.db.prepare('SELECT payload,present FROM cp_monitor_agents WHERE source_key=? ORDER BY id').all(this.sourceKey) as AgentRow[]).map(row => ({ ...(JSON.parse(row.payload) as ObservedAgent), present: row.present === 1, stale: stale || (JSON.parse(row.payload) as ObservedAgent).stale }))
    agents.sort((first, second) => Number(second.present && !second.stale) - Number(first.present && !first.stale) || (Date.parse(second.lastActivityAt ?? '') || 0) - (Date.parse(first.lastActivityAt ?? '') || 0))
    const capabilityRows = this.db.prepare('SELECT payload FROM cp_monitor_capabilities WHERE source_key=? ORDER BY id').all(this.sourceKey) as Array<{ payload: string }>
    const capabilities = capabilityRows.map(row => JSON.parse(row.payload) as MonitorCapability)
    const events = this.db.prepare('SELECT id,agent_id AS agentId,status,action,observed_at AS observedAt FROM cp_monitor_events WHERE source_key=? ORDER BY id DESC LIMIT 1000').all(this.sourceKey) as AgentEvent[]
    return { capabilities, agents, events, collectedAt: state.collected_at, stale, warnings: JSON.parse(state.warnings) }
  }
  close(): void { this.db.close() }
  private changed(first: ObservedAgent, second: ObservedAgent): boolean { return first.status !== second.status || first.rawStatus !== second.rawStatus || first.present !== second.present }
}
