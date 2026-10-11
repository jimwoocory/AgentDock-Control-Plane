// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { MonitorStore } from './monitor-store'
import type { AgentMonitorSnapshot } from './monitor-types'

const opened: MonitorStore[] = []
function store(key = 'source-a') { const result = new MonitorStore(':memory:', key); opened.push(result); return result }
afterEach(() => { for (const item of opened.splice(0)) item.close() })

const snapshot: AgentMonitorSnapshot = {
  capabilities: [{ id: 'codex', label: 'Codex', status: 'ok', description: 'readonly', observedAt: '2026-10-12T08:00:00.000Z' }],
  agents: [{ id: 'codex:a', label: 'Codex thread a', runtime: 'codex', source: 'Codex app-server proxy', status: 'Running', rawStatus: 'active', taskId: null, currentAction: null, lastActivityAt: '2026-10-12T07:00:00.000Z', lastHeartbeatAt: null, observedAt: '2026-10-12T08:00:00.000Z', stale: false, present: true }],
  events: [], collectedAt: '2026-10-12T08:00:00.000Z', stale: false, warnings: [],
}

describe('monitor snapshot persistence', () => {
  it('partitions agents by source and emits an event only for an observed state change', () => {
    const first = store('one'); const second = store('two')
    first.save(snapshot); first.save(snapshot); second.save({ ...snapshot, agents: [] })
    expect(first.snapshot().agents).toHaveLength(1)
    expect(first.snapshot().events).toHaveLength(1)
    expect(second.snapshot().agents).toHaveLength(0)
  })

  it('preserves prior agents as stale when collection fails instead of inventing Idle', () => {
    const result = store()
    result.save(snapshot)
    result.fail('Codex readonly connection unavailable', '2026-10-12T08:01:00.000Z')
    expect(result.snapshot()).toMatchObject({ stale: true, warnings: ['Codex readonly connection unavailable'], agents: [{ id: 'codex:a', status: 'Running', stale: true, present: true }] })
  })

  it('records unavailable capabilities when the first collection cannot produce agents', () => {
    const result = store()
    result.fail('readonly unavailable', '2026-10-12T08:01:00.000Z', [{ id: 'agentdock', label: 'AgentDock telemetry', status: 'unavailable', description: 'not exposed', observedAt: null }])
    expect(result.snapshot().capabilities).toEqual([expect.objectContaining({ id: 'agentdock', status: 'unavailable' })])
  })

  it('keeps a failed runtime last-known while another runtime reports a successful empty list', () => {
    const result = store()
    result.save(snapshot)
    result.save({ ...snapshot, capabilities: [
      { id: 'codex', label: 'Codex', status: 'unavailable', description: 'offline', observedAt: null },
      { id: 'claude', label: 'Claude', status: 'ok', description: 'readonly', observedAt: snapshot.collectedAt },
    ], agents: [] })
    expect(result.snapshot().agents).toEqual([expect.objectContaining({ id: 'codex:a', status: 'Running', present: true, stale: true })])
  })

  it('preserves an explicitly stale agent from a successful partial collection', () => {
    const result = store(); const now = new Date().toISOString()
    result.save({ ...snapshot, collectedAt: now, agents: snapshot.agents.map(agent => ({ ...agent, observedAt: now, stale: true })) })
    expect(result.snapshot()).toMatchObject({ stale: false, agents: [{ id: 'codex:a', stale: true }] })
  })
})
