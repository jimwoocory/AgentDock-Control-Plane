// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { claudeReadonlyInvocation, collectCodexLocalSessions, collectCodexThreads, mapCodexThread } from './runtime-monitor'
import Database from 'better-sqlite3'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const observedAt = '2026-10-12T08:00:00.000Z'
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

describe('Codex readonly runtime observation', () => {
  it('maps documented active flags without reading a prompt or title', () => {
    const agent = mapCodexThread({ id: 'thread-1', status: { type: 'active', activeFlags: ['waitingOnApproval'] }, updatedAt: 1760255999, name: 'private title', preview: 'private prompt' }, observedAt)
    expect(agent).toMatchObject({ id: 'codex:thread-1', label: 'Codex thread thread-1', status: 'Waiting Approval', rawStatus: 'active', currentAction: null, lastHeartbeatAt: null, observedAt })
    expect(JSON.stringify(agent)).not.toContain('private')
  })

  it('uses metadata-only reads for loaded threads and maps unknown runtime state honestly', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    let closed = 0
    const transport = {
      request: async (method: string, params: unknown) => {
        calls.push({ method, params })
        if (method === 'initialize') return {}
        if (method === 'thread/loaded/list') return { data: ['a', 'b'] }
        return { thread: { id: (params as { threadId: string }).threadId, status: { type: 'notLoaded' }, updatedAt: 1760255999, preview: 'must not persist' } }
      },
      notify: async (method: string, params: unknown) => { calls.push({ method, params }) },
      close: () => { closed++ },
    }
    const result = await collectCodexThreads(transport, observedAt)
    expect(result.map(agent => agent.status)).toEqual(['Unknown', 'Unknown'])
    expect(calls).toEqual([
      { method: 'initialize', params: { clientInfo: { name: 'mission-control-observer', version: '1' }, capabilities: { experimentalApi: false } } },
      { method: 'initialized', params: {} },
      { method: 'thread/loaded/list', params: { limit: 100 } },
      { method: 'thread/read', params: { threadId: 'a', includeTurns: false } },
      { method: 'thread/read', params: { threadId: 'b', includeTurns: false } },
    ])
    expect(closed).toBe(1)
  })

  it('derives running only from an unclosed local lifecycle event without persisting titles', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'codex-monitor-')); roots.push(root)
    await mkdir(path.join(root, 'sessions'))
    const db = new Database(path.join(root, 'state_5.sqlite'))
    db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL, updated_at INTEGER NOT NULL, source TEXT NOT NULL, archived INTEGER NOT NULL)')
    db.prepare('INSERT INTO threads VALUES (?,?,?,?,?)').run('local-a', path.join(root, 'sessions', 'a.jsonl'), 1760255999000, 'cli', 0); db.close()
    await writeFile(path.join(root, 'sessions', 'a.jsonl'), '{"timestamp":"2026-10-12T07:59:30.000Z","type":"event_msg","payload":{"type":"task_started","title":"private task"}}\n')
    const agents = await collectCodexLocalSessions(root, observedAt)
    expect(agents).toEqual([expect.objectContaining({ id: 'codex:local-a', status: 'Running', rawStatus: 'task_started', lastHeartbeatAt: null })])
    expect(JSON.stringify(agents)).not.toContain('private task')
    await writeFile(path.join(root, 'sessions', 'a.jsonl'), '{"timestamp":"2026-10-12T08:10:00.000Z","type":"event_msg","payload":{"type":"task_started"}}\n')
    expect(await collectCodexLocalSessions(root, observedAt)).toEqual([expect.objectContaining({ status: 'Unknown', stale: true })])
  })

  it('uses fixed official Claude executable arguments on Windows instead of a shell shim', () => {
    const invocation = claudeReadonlyInvocation('C:/Users/example/AppData/Roaming', candidate => candidate.endsWith(path.join('bin', 'claude.exe')))
    expect(invocation).toEqual({ command: path.join('C:/Users/example/AppData/Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'), args: ['agents', '--json'] })
  })
})
