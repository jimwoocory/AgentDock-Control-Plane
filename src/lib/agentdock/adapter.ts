import { lstat, readdir, open, realpath } from 'node:fs/promises'
import { lstatSync, realpathSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import type { SourceTask } from './types'

const TASK_FILE = /^tsk_[a-f0-9]{16}\.json$/
const MAX_BYTES = 512 * 1024
const MAX_TASKS = 2000

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('对象格式无效')
  return value as Record<string, unknown>
}
function text(value: unknown, fallback = '', limit = 20000): string {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string' || value.length > limit) throw new Error('文本字段无效或过长')
  return value
}
function list(value: unknown, limit = 2000): Record<string, unknown>[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > limit) throw new Error('列表字段无效或过长')
  return value.map(record)
}
function timestamp(value: unknown): string {
  const result = text(value, '', 128)
  if (!Number.isFinite(Date.parse(result))) throw new Error('时间字段无效')
  return result
}

function normalizeTask(value: unknown, filename: string): SourceTask {
  const task = record(value)
  if (task.schema_version !== 1 || task.id !== filename.slice(0, -5)) throw new Error('任务 ID 或 schema_version 不匹配')
  const title = text(task.title, '', 1000)
  if (!title.trim()) throw new Error('任务标题为空')
  const updatedAt = timestamp(task.updated_at)
  const review = task.final_review == null ? null : record(task.final_review)
  return {
    id: task.id as string, title, goal: text(task.goal), project: text(task.project, '', 200) || null,
    device: text(task.device, '', 200) || null, status: text(task.status, 'unknown', 128), phase: text(task.phase, 'unknown', 128),
    created_at: timestamp(task.created_at), updated_at: updatedAt, summary: text(task.summary),
    steps: list(task.steps).map(step => ({ id: text(step.id, '', 200), title: text(step.title, '', 2000),
      phase: text(step.phase, 'unknown', 128), status: text(step.status, 'unknown', 128), updated_at: step.updated_at ? timestamp(step.updated_at) : updatedAt })),
    conditions: list(task.conditions).map(condition => ({ id: text(condition.id, '', 200), text: text(condition.text) })),
    events: list(task.events).map(event => ({ type: text(event.type, 'unknown', 128), summary: text(event.summary), created_at: timestamp(event.created_at) })),
    final_review: review ? { status: text(review.status, 'unknown', 128), summary: text(review.summary),
      verified_facts: listStrings(review.verified_facts) } : null,
  }
}
function listStrings(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 2000) throw new Error('验收证据字段无效')
  return value.map(item => text(item))
}

/** Only task files are opened. Never read credentials, config, browser data or executables. */
export async function readTaskFiles(root: string): Promise<{ tasks: SourceTask[]; errors: string[] }> {
  const taskRoot = path.resolve(root, 'tasks')
  if ((await lstat(taskRoot)).isSymbolicLink()) throw new Error('拒绝符号链接任务目录')
  const actualRoot = await realpath(taskRoot)
  const filenames = (await readdir(taskRoot)).filter(name => TASK_FILE.test(name)).sort()
  if (filenames.length > MAX_TASKS) throw new Error('任务数量超过 2000，请缩小采集范围')
  const tasks: SourceTask[] = []
  const errors: string[] = []
  for (const filename of filenames) {
    try {
      const filePath = path.join(taskRoot, filename)
      const before = await lstat(filePath)
      if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_BYTES) throw new Error('不是普通文件或超过 512 KiB')
      if (path.dirname(await realpath(filePath)) !== actualRoot) throw new Error('文件超出来源目录')
      const handle = await open(filePath, 'r')
      try {
        const opened = await handle.stat()
        const named = await lstat(filePath)
        // Windows does not expose portable O_NOFOLLOW. Bind reads to the opened
        // descriptor and verify identity before reading any bytes instead.
        if (!opened.isFile() || named.isSymbolicLink() || opened.ino !== before.ino || opened.dev !== before.dev || named.ino !== opened.ino || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs) throw new Error('采集中发生文件替换')
        const buffer = Buffer.alloc(MAX_BYTES + 1)
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
        const after = await handle.stat()
        const afterNamed = await lstat(filePath)
        if (bytesRead > MAX_BYTES || before.size !== bytesRead || before.size !== after.size || before.mtimeMs !== after.mtimeMs || afterNamed.isSymbolicLink() || afterNamed.ino !== opened.ino || afterNamed.dev !== opened.dev) throw new Error('采集中发生文件变更')
        tasks.push(normalizeTask(JSON.parse(buffer.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, '')), filename))
      } finally { await handle.close() }
    } catch (error) {
      errors.push(`${filename}: ${error instanceof Error ? error.message : '读取失败'}`)
    }
  }
  const afterNames = (await readdir(taskRoot)).filter(name => TASK_FILE.test(name)).sort()
  if (JSON.stringify(afterNames) !== JSON.stringify(filenames)) errors.push('采集中任务目录发生变更，下一轮重试')
  return { tasks, errors }
}

export function observerSettings() {
  const sourceHome = path.resolve(process.env.AGENTDOCK_HOME || path.join(os.homedir(), '.agentdock'))
  const key = createHash('sha256').update(`${os.hostname()}\n${sourceHome}`).digest('hex').slice(0, 24)
  const databasePath = path.resolve(process.env.AGENTDOCK_OBSERVER_DB || path.join(process.cwd(), '.data', 'agentdock-observer.db'))
  const relative = path.relative(canonicalPath(sourceHome), canonicalPath(databasePath))
  if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('观察数据库不能位于 AgentDock 来源目录内')
  return { sourceHome, key, databasePath }
}

/** Resolve existing ancestors too, so an absent DB under a junction is checked physically. */
function canonicalPath(candidate: string): string {
  let current = candidate
  const missing: string[] = []
  while (true) {
    try { return path.join(realpathSync(current), ...missing.reverse()) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      try { if (lstatSync(current).isSymbolicLink()) throw new Error('拒绝失效的路径链接') }
      catch (statError) { if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError }
      const parent = path.dirname(current)
      if (parent === current) throw error
      missing.push(path.basename(current))
      current = parent
    }
  }
}

export async function probeRuntime(): Promise<{ status: 'healthy' | 'unreachable'; version: string | null; checkedAt: string }> {
  const checkedAt = new Date().toISOString()
  try {
    const url = new URL(process.env.AGENTDOCK_HEALTH_URL || 'http://127.0.0.1:8765/healthz')
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/healthz') throw new Error('只允许本机健康接口')
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error', cache: 'no-store' })
    if (!response.ok) throw new Error('健康检查失败')
    const body = record(await response.json())
    if (body.ok !== true) throw new Error('健康检查未通过')
    return { status: 'healthy', version: text(body.version, '', 100) || null, checkedAt }
  } catch {
    return { status: 'unreachable', version: null, checkedAt }
  }
}
