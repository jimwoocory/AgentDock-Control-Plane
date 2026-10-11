// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { ObservationStore } from './store'
import type { SourceTask } from './types'

const opened: ObservationStore[] = []
afterEach(() => { for (const store of opened.splice(0)) store.close() })
const now = new Date().toISOString()
const runtime = { status: 'healthy' as const, version: '1.0.1', checkedAt: now }
const first: SourceTask = { id: 'tsk_1111111111111111', title: '相同标题', goal: '独立目标', project: 'USVDS2', device: null,
  status: 'active', phase: 'execute', created_at: now, updated_at: now, summary: '', steps: [], conditions: [], events: [], final_review: null }
function fixture(key = 'source-1') { const store = new ObservationStore(':memory:', key); opened.push(store); return store }

describe('independent observation history and project mappings', () => {
  it('keeps 50 tasks isolated across five projects without inventing dependencies', () => {
    const store = fixture()
    const names = ['USVDS2', 'BMAD', 'Toonflow', 'Google-TTS', 'Research Lab']
    store.save(Array.from({ length: 50 }, (_, index) => ({ ...first, id: `tsk_${index.toString(16).padStart(16, '0')}`, project: names[index % 5] })), now, runtime)
    const snapshot = store.snapshot()
    expect(snapshot.tasks).toHaveLength(50)
    for (const project of snapshot.projects) expect(snapshot.tasks.filter(task => task.projectId === project.id)).toHaveLength(10)
  })
  it('isolates identical-title tasks using IDs and source project metadata', () => {
    const store = fixture()
    store.save([first, { ...first, id: 'tsk_2222222222222222', project: 'BMAD' }], now, runtime)
    const result = store.snapshot()
    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[0].projectId).not.toBe(result.tasks[1].projectId)
    expect(result.tasks.every(task => task.projectOrigin === 'source')).toBe(true)
    expect(result.source.runtime.status).toBe('healthy')
  })
  it('retains prior tasks and histories on corrupt source rather than deleting them', () => {
    const store = fixture()
    store.save([first], now, runtime)
    store.fail('无法读取某任务', now, runtime, true)
    expect(store.snapshot()).toMatchObject({ source: { status: 'partial', stale: true }, tasks: [{ id: first.id, status: 'active' }] })
    expect(store.snapshot().history).toHaveLength(1)
  })
  it('deduplicates unchanged observations but records real status changes', () => {
    const store = fixture()
    store.save([first], now, runtime)
    store.save([first], now, runtime)
    expect(store.snapshot().history).toHaveLength(1)
    store.save([{ ...first, status: 'blocked' }], now, runtime)
    expect(store.snapshot().history).toHaveLength(2)
  })
  it('keeps explicit local project bindings through resync without changing source metadata', () => {
    const store = fixture()
    store.save([first], now, runtime)
    const bmad = store.snapshot().projects.find(project => project.name === 'BMAD')!
    store.bind(first.id, bmad.id)
    store.save([first], now, runtime)
    expect(store.snapshot().tasks[0]).toMatchObject({ project: 'USVDS2', projectId: bmad.id, projectOrigin: 'manual' })
    expect(() => store.bind('tsk_absent', bmad.id)).toThrow()
    expect(() => store.bind(first.id, 999999)).toThrow()
  })
  it('marks a disappeared file as missing rather than completed or permanently erased', () => {
    const store = fixture()
    store.save([first], now, runtime)
    store.save([], now, runtime)
    expect(store.snapshot().tasks[0]).toMatchObject({ id: first.id, status: 'active', present: false })
  })
})
