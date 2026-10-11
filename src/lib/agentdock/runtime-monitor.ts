import { spawn } from 'node:child_process'
import Database from 'better-sqlite3'
import { lstat, open, realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AgentMonitorSnapshot, AgentStatus, MonitorCapability, ObservedAgent } from './monitor-types'

export interface ReadonlyRpcTransport {
  request(method: string, params: unknown): Promise<unknown>
  notify(method: string, params: unknown): Promise<void>
  close?(): void
}

interface RuntimeMonitorOptions {
  codexTransport?: ReadonlyRpcTransport
  claudeAgents?: () => Promise<unknown>
  now?: () => string
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function timestamp(seconds: unknown): string | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? new Date(seconds > 10_000_000_000 ? seconds : seconds * 1000).toISOString() : null
}

function status(value: unknown): { status: AgentStatus; rawStatus: string } {
  const record = object(value)
  const type = typeof record.type === 'string' ? record.type : 'unknown'
  const flags = Array.isArray(record.activeFlags) ? record.activeFlags : []
  if (type === 'active' && flags.includes('waitingOnApproval')) return { status: 'Waiting Approval', rawStatus: type }
  if (type === 'active' && flags.includes('waitingOnUserInput')) return { status: 'Blocked', rawStatus: type }
  if (type === 'active') return { status: 'Running', rawStatus: type }
  if (type === 'idle') return { status: 'Idle', rawStatus: type }
  if (type === 'systemError') return { status: 'Failed', rawStatus: type }
  return { status: 'Unknown', rawStatus: type }
}

/** Convert only documented operational metadata. Titles, previews, and turns never leave the transport. */
export function mapCodexThread(thread: unknown, observedAt: string): ObservedAgent {
  const value = object(thread)
  const id = typeof value.id === 'string' && value.id ? value.id : 'unknown'
  const mapped = status(value.status)
  return {
    id: `codex:${id}`, label: `Codex thread ${id}`, runtime: 'codex', source: 'Codex app-server proxy',
    ...mapped, taskId: null, currentAction: null, lastActivityAt: timestamp(value.updatedAt), lastHeartbeatAt: null,
    observedAt, stale: false, present: true,
  }
}

export async function collectCodexThreads(transport: ReadonlyRpcTransport, observedAt: string): Promise<ObservedAgent[]> {
  try {
    await transport.request('initialize', { clientInfo: { name: 'mission-control-observer', version: '1' }, capabilities: { experimentalApi: false } })
    await transport.notify('initialized', {})
    const loaded = object(await transport.request('thread/loaded/list', { limit: 100 }))
    const ids = Array.isArray(loaded.data) ? loaded.data.filter((id): id is string => typeof id === 'string').slice(0, 100) : []
    let cursor = 0
    const read = async () => {
      const agents: ObservedAgent[] = []
      while (cursor < ids.length) {
        const threadId = ids[cursor++]
        const response = object(await transport.request('thread/read', { threadId, includeTurns: false }))
        agents.push(mapCodexThread(response.thread, observedAt))
      }
      return agents
    }
    const reads = Promise.all(Array.from({ length: Math.min(4, ids.length) }, read)).then(parts => parts.flat())
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([reads, new Promise<ObservedAgent[]>((_, reject) => { deadline = setTimeout(() => reject(new Error('Codex readonly collection timed out')), 5000) })])
    } finally { if (deadline) clearTimeout(deadline) }
  } finally {
    transport.close?.()
  }
}

interface LocalThreadRow { id: string; rollout_path: string; updated_at: number; source: string }

function eventTime(value: unknown): string | null {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString()
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString()
  return null
}

async function lifecycleEvent(filePath: string, sessionsRoot: string): Promise<{ type: string; at: string | null } | null> {
  const named = await lstat(filePath)
  if (!named.isFile() || named.isSymbolicLink()) throw new Error('Codex session is not a regular file')
  const actualRoot = await realpath(sessionsRoot)
  const actualFile = await realpath(filePath)
  const relative = path.relative(actualRoot, actualFile)
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Codex session is outside the allowed directory')
  const handle = await open(actualFile, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error('Codex session is not a regular file')
    const bytes = Math.min(stat.size, 1024 * 1024)
    const buffer = Buffer.alloc(bytes)
    await handle.read(buffer, 0, bytes, Math.max(0, stat.size - bytes))
    let latest: { type: string; at: string | null } | null = null
    for (const line of buffer.toString('utf8').split('\n')) {
      try {
        const row = object(JSON.parse(line)); const payload = object(row.payload)
        const type = typeof payload.type === 'string' ? payload.type : ''
        if (row.type === 'event_msg' && ['task_started', 'task_complete', 'turn_aborted'].includes(type)) latest = { type, at: eventTime(row.timestamp ?? row.created_at ?? row.time) }
      } catch { /* Ignore partial JSONL line and unrelated records. */ }
    }
    return latest
  } finally { await handle.close() }
}

/** Reads only Codex's documented local thread metadata and lifecycle event types. */
export async function collectCodexLocalSessions(codexHome = path.join(os.homedir(), '.codex'), observedAt = new Date().toISOString()): Promise<ObservedAgent[]> {
  const home = path.resolve(codexHome); const databasePath = path.join(home, 'state_5.sqlite'); const sessionsRoot = path.join(home, 'sessions')
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    database.pragma('query_only = ON')
    const columns = database.prepare('PRAGMA table_info(threads)').all() as Array<{ name: string }>
    if (!['id', 'rollout_path', 'updated_at', 'source', 'archived'].every(name => columns.some(column => column.name === name))) throw new Error('Codex local thread schema is unsupported')
    const rows = database.prepare('SELECT id,rollout_path,updated_at,source FROM threads WHERE archived=0 ORDER BY updated_at DESC LIMIT 50').all() as LocalThreadRow[]
    const agents: ObservedAgent[] = []
    for (const row of rows) {
      let lifecycle: { type: string; at: string | null } | null = null
      try { lifecycle = await lifecycleEvent(row.rollout_path, sessionsRoot) } catch { continue }
      const lastActivityAt = lifecycle?.at || timestamp(row.updated_at)
      const age = lifecycle?.at ? Date.parse(observedAt) - Date.parse(lifecycle.at) : Number.NaN
      const aged = !Number.isFinite(age) || age < 0 || age > 60000
      const status: AgentStatus = lifecycle?.type === 'task_started' && !aged ? 'Running' : lifecycle?.type === 'task_complete' && !aged ? 'Completed' : 'Unknown'
      agents.push({ id: `codex:${row.id}`, label: `Codex thread ${row.id}`, runtime: 'codex', source: 'Codex local readonly session record', status, rawStatus: lifecycle?.type || 'unknown', taskId: null, currentAction: null, lastActivityAt, lastHeartbeatAt: null, observedAt, stale: aged, present: true })
    }
    return agents
  } finally { database.close() }
}

function proxyTransport(executable = process.env.CODEX_CLI_PATH || 'codex'): ReadonlyRpcTransport {
  const child = spawn(executable, ['app-server', 'proxy'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  let nextId = 1
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timeout: ReturnType<typeof setTimeout> }>()
  let buffer = ''
  const fail = (message: string) => { for (const item of pending.values()) { clearTimeout(item.timeout); item.reject(new Error(message)) } pending.clear() }
  child.stdout.on('data', chunk => {
    buffer += String(chunk)
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); newline = buffer.indexOf('\n')
      try { const message = object(JSON.parse(line)); const item = pending.get(Number(message.id)); if (item) { pending.delete(Number(message.id)); clearTimeout(item.timeout); if (message.error) item.reject(new Error('Codex readonly proxy returned an error')); else item.resolve(message.result) } } catch { /* Ignore non-protocol stdout. */ }
    }
  })
  child.stdout.on('data', () => { if (buffer.length > 1024 * 1024) { child.kill(); fail('Codex readonly proxy output exceeded limit') } })
  child.on('error', () => fail('Codex readonly proxy unavailable'))
  child.on('exit', () => fail('Codex readonly proxy unavailable'))
  const send = (message: Record<string, unknown>) => {
    if (!child.stdin.writable) throw new Error('Codex readonly proxy unavailable')
    child.stdin.write(`${JSON.stringify(message)}\n`)
  }
  return {
    request(method, params) { return new Promise((resolve, reject) => { const id = nextId++; const requestTimeout = setTimeout(() => { pending.delete(id); reject(new Error('Codex readonly proxy timed out')) }, 1500); pending.set(id, { resolve, reject, timeout: requestTimeout }); try { send({ jsonrpc: '2.0', id, method, params }) } catch { clearTimeout(requestTimeout); pending.delete(id); reject(new Error('Codex readonly proxy unavailable')) } }) },
    async notify(method, params) { send({ jsonrpc: '2.0', method, params }) },
    close() { child.kill(); },
  }
}

function execJson(command: string, args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    let output = ''
    const timeout = setTimeout(() => { child.kill(); reject(new Error('readonly command timed out')) }, 5000)
    child.stdout.on('data', chunk => { output = `${output}${String(chunk)}`.slice(0, 1024 * 1024) })
    child.on('error', () => { clearTimeout(timeout); reject(new Error('readonly command unavailable')) })
    child.on('exit', code => { clearTimeout(timeout); if (code !== 0) reject(new Error('readonly command unavailable')); else try { resolve(JSON.parse(output)) } catch { reject(new Error('readonly command returned invalid JSON')) } })
  })
}

export function claudeReadonlyInvocation(appData = process.env.APPDATA || '', exists: (candidate: string) => boolean = existsSync): { command: string; args: string[] } {
  const nativeExecutable = path.join(appData, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
  if (appData && exists(nativeExecutable)) return { command: nativeExecutable, args: ['agents', '--json'] }
  return { command: 'claude', args: ['agents', '--json'] }
}

function collectClaudeAgents(): Promise<unknown> {
  const invocation = claudeReadonlyInvocation()
  return execJson(invocation.command, invocation.args)
}

function claudeAgents(value: unknown, observedAt: string): ObservedAgent[] {
  if (!Array.isArray(value)) throw new Error('Claude readonly command returned invalid data')
  return value.slice(0, 100).map((item, index) => {
    const agent = object(item); const id = typeof agent.id === 'string' ? agent.id : String(index)
    return { id: `claude:${id}`, label: `Claude agent ${id}`, runtime: 'claude', source: 'Claude Code agents --json', status: 'Unknown', rawStatus: typeof agent.status === 'string' ? agent.status : 'unknown', taskId: null, currentAction: null, lastActivityAt: null, lastHeartbeatAt: null, observedAt, stale: false, present: true }
  })
}

export async function collectRuntimeMonitor(options: RuntimeMonitorOptions = {}): Promise<AgentMonitorSnapshot> {
  const observedAt = options.now?.() || new Date().toISOString()
  const capabilities: MonitorCapability[] = [{ id: 'agentdock', label: 'AgentDock agent/session telemetry', status: 'unavailable', description: '当前 AgentDock 未公开只读 Agent 或 session 遥测；不从任务状态推断。', observedAt: null }]
  const agents: ObservedAgent[] = []; const warnings: string[] = []
  try { agents.push(...await collectCodexThreads(options.codexTransport || proxyTransport(), observedAt)); capabilities.push({ id: 'codex', label: 'Codex app-server proxy', status: 'ok', description: '仅读取已加载线程元数据；未读取标题、预览或 turns。', observedAt }) }
  catch {
    try { agents.push(...await collectCodexLocalSessions(undefined, observedAt)); capabilities.push({ id: 'codex', label: 'Codex local session records', status: 'ok', description: '只读 state SQLite 元数据与受限 lifecycle 事件；无 heartbeat。', observedAt }) }
    catch { capabilities.push({ id: 'codex', label: 'Codex readonly sources', status: 'unavailable', description: '未能连接已运行 app-server，且本地会话记录不可用。', observedAt: null }) }
  }
  try { agents.push(...claudeAgents(await (options.claudeAgents || collectClaudeAgents)(), observedAt)); capabilities.push({ id: 'claude', label: 'Claude Code agents', status: 'ok', description: '来自 claude agents --json 的只读列表。', observedAt }) }
  catch { capabilities.push({ id: 'claude', label: 'Claude Code agents', status: 'unavailable', description: 'Claude Code 只读 agent 列表不可用。', observedAt: null }) }
  return { capabilities, agents, events: [], collectedAt: observedAt, stale: false, warnings }
}
