import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { SourceTask, ObserverSnapshot, Project, Observation, ObservedTask } from './types'

interface TaskRow { id: string; payload: string; digest: string; present: number; first_seen: string; last_seen: string; project_id: number | null; has_binding: number }
interface StateRow { status: ObserverSnapshot['source']['status']; observed_at: string | null; attempted_at: string | null; warnings: string; runtime: string }

const UNKNOWN_RUNTIME = { status: 'unknown' as const, version: null, checkedAt: null }

export class ObservationStore {
  private db: Database.Database
  private sourceKey: string
  constructor(databasePath: string, sourceKey: string) {
    this.sourceKey = sourceKey
    if (databasePath !== ':memory:') mkdirSync(path.dirname(databasePath), { recursive: true })
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('busy_timeout = 5000')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cp_projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, owner TEXT NOT NULL DEFAULT '', goal TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS cp_tasks (source_key TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, digest TEXT NOT NULL, present INTEGER NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, PRIMARY KEY(source_key,id));
      CREATE TABLE IF NOT EXISTS cp_bindings (source_key TEXT NOT NULL, task_id TEXT NOT NULL, project_id INTEGER REFERENCES cp_projects(id), PRIMARY KEY(source_key,task_id), FOREIGN KEY(source_key,task_id) REFERENCES cp_tasks(source_key,id));
      CREATE TABLE IF NOT EXISTS cp_history (id INTEGER PRIMARY KEY, source_key TEXT NOT NULL, task_id TEXT NOT NULL, status TEXT NOT NULL, phase TEXT NOT NULL, source_updated_at TEXT NOT NULL, observed_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS cp_history_task ON cp_history(source_key,task_id,id);
      CREATE TABLE IF NOT EXISTS cp_sources (source_key TEXT PRIMARY KEY, status TEXT NOT NULL, observed_at TEXT, attempted_at TEXT, warnings TEXT NOT NULL, runtime TEXT NOT NULL);
    `)
    const insert = this.db.prepare('INSERT OR IGNORE INTO cp_projects(name) VALUES (?)')
    for (const name of ['USVDS2', 'BMAD', 'Toonflow', 'Google-TTS', 'Research Lab']) insert.run(name)
    this.db.prepare("INSERT OR IGNORE INTO cp_sources VALUES (?, 'never', NULL, NULL, '[]', ?)").run(sourceKey, JSON.stringify(UNKNOWN_RUNTIME))
  }

  save(tasks: SourceTask[], observedAt: string, runtime: ObserverSnapshot['source']['runtime']): void {
    this.db.transaction(() => {
      this.db.prepare('UPDATE cp_tasks SET present = 0 WHERE source_key = ?').run(this.sourceKey)
      for (const task of tasks) {
        const payload = JSON.stringify(task)
        const digest = createHash('sha256').update(payload).digest('hex')
        const prior = this.db.prepare('SELECT digest FROM cp_tasks WHERE source_key = ? AND id = ?').get(this.sourceKey, task.id) as { digest: string } | undefined
        this.db.prepare(`INSERT INTO cp_tasks VALUES (?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(source_key,id) DO UPDATE SET payload=excluded.payload,digest=excluded.digest,present=1,last_seen=excluded.last_seen`).run(this.sourceKey, task.id, payload, digest, observedAt, observedAt)
        if (task.project) this.db.prepare('INSERT OR IGNORE INTO cp_projects(name) VALUES (?)').run(task.project)
        if (prior?.digest !== digest) {
          this.db.prepare('INSERT INTO cp_history(source_key,task_id,status,phase,source_updated_at,observed_at) VALUES (?, ?, ?, ?, ?, ?)').run(this.sourceKey, task.id, task.status, task.phase, task.updated_at, observedAt)
          this.db.prepare('DELETE FROM cp_history WHERE source_key = ? AND task_id = ? AND id NOT IN (SELECT id FROM cp_history WHERE source_key = ? AND task_id = ? ORDER BY id DESC LIMIT 100)').run(this.sourceKey, task.id, this.sourceKey, task.id)
        }
      }
      this.db.prepare("UPDATE cp_sources SET status='ok',observed_at=?,attempted_at=?,warnings='[]',runtime=? WHERE source_key=?").run(observedAt, observedAt, JSON.stringify(runtime), this.sourceKey)
    })()
  }

  fail(message: string, attemptedAt: string, runtime: ObserverSnapshot['source']['runtime'], partial = false): void {
    this.db.prepare('UPDATE cp_sources SET status=?,attempted_at=?,warnings=?,runtime=? WHERE source_key=?')
      .run(partial ? 'partial' : 'unavailable', attemptedAt, JSON.stringify([message.slice(0, 4000)]), JSON.stringify(runtime), this.sourceKey)
  }

  createProject(name: string, owner = '', goal = ''): number {
    if (!name.trim() || name.length > 200 || owner.length > 200 || goal.length > 4000) throw new Error('项目名称、负责人或目标无效')
    const result = this.db.prepare('INSERT INTO cp_projects(name,owner,goal) VALUES (?,?,?)').run(name.trim(), owner.trim(), goal.trim())
    return Number(result.lastInsertRowid)
  }

  bind(taskId: string, projectId: number | null): void {
    if (!this.db.prepare('SELECT id FROM cp_tasks WHERE source_key=? AND id=?').get(this.sourceKey, taskId)) throw new Error('来源任务不存在')
    if (projectId !== null && (!Number.isSafeInteger(projectId) || !this.db.prepare('SELECT id FROM cp_projects WHERE id=?').get(projectId))) throw new Error('项目不存在')
    this.db.prepare('INSERT INTO cp_bindings VALUES (?,?,?) ON CONFLICT(source_key,task_id) DO UPDATE SET project_id=excluded.project_id').run(this.sourceKey, taskId, projectId)
  }

  snapshot(): ObserverSnapshot {
    const state = this.db.prepare('SELECT * FROM cp_sources WHERE source_key=?').get(this.sourceKey) as StateRow
    const projects = this.db.prepare('SELECT * FROM cp_projects ORDER BY id').all() as Project[]
    const rows = this.db.prepare(`SELECT t.*,b.project_id,CASE WHEN b.task_id IS NULL THEN 0 ELSE 1 END AS has_binding
      FROM cp_tasks t LEFT JOIN cp_bindings b ON b.source_key=t.source_key AND b.task_id=t.id WHERE t.source_key=? ORDER BY json_extract(t.payload,'$.updated_at') DESC`).all(this.sourceKey) as TaskRow[]
    const tasks: ObservedTask[] = rows.map(row => {
      const task = JSON.parse(row.payload) as SourceTask
      const sourceProject = projects.find(project => project.name === task.project)
      return { ...task, sourceKey: this.sourceKey, projectId: row.has_binding ? row.project_id : sourceProject?.id ?? null,
        projectOrigin: row.has_binding ? 'manual' : sourceProject ? 'source' : 'unassigned', present: row.present === 1, firstSeenAt: row.first_seen, lastSeenAt: row.last_seen }
    })
    const history = this.db.prepare('SELECT id,task_id AS taskId,status,phase,source_updated_at AS sourceUpdatedAt,observed_at AS observedAt FROM cp_history WHERE source_key=? ORDER BY id DESC LIMIT 1000').all(this.sourceKey) as Observation[]
    const stale = state.status !== 'ok' || !state.observed_at || Date.now() - Date.parse(state.observed_at) > 60000
    const runtime = JSON.parse(state.runtime) as ObserverSnapshot['source']['runtime']
    if (runtime.checkedAt && Date.now() - Date.parse(runtime.checkedAt) > 60000) runtime.status = 'unknown'
    return {
      source: { key: this.sourceKey, transport: 'filesystem-readonly', status: state.status, observedAt: state.observed_at, attemptedAt: state.attempted_at,
        stale, runtime, warnings: JSON.parse(state.warnings), sessions: { status: 'not-collected', description: '当前适配器没有持续采集命令会话；任务状态不是进程状态，Agent 与 heartbeat 未知。' } },
      projects, tasks, history,
    }
  }
  close(): void { this.db.close() }
}
