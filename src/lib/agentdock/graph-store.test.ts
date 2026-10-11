// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GraphStore } from './graph-store'
import { ObservationStore } from './store'
import type { SourceTask } from './types'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
function open() { const directory = mkdtempSync(path.join(tmpdir(), 'cp-graph-')); directories.push(directory); return new GraphStore(path.join(directory, 'graph.db'), 'primary') }
describe('persistent local task graph', () => {
  it('projects real tasks and steps without inferring dependencies, retaining local metadata across collection', () => {
    const store = open(); const dbPath = path.join(directories[0], 'graph.db')
    const observations = new ObservationStore(dbPath, 'primary')
    const now = new Date().toISOString()
    const source: SourceTask = { id: 'tsk_real', title: 'Source task', goal: '', project: 'USVDS2', device: null, status: 'active', phase: 'execute', created_at: now, updated_at: now, summary: '', steps: [{ id: 'step1', title: 'Source step', phase: 'execute', status: 'pending', updated_at: now }], conditions: [{ id: 'c1', text: 'Source criterion' }], events: [], final_review: null }
    observations.save([source], now, { status: 'healthy', version: '1', checkedAt: now })
    const projected = store.snapshot().nodes
    expect(projected).toHaveLength(2)
    expect(projected.every(node => node.dependencies.length === 0)).toBe(true)
    const task = projected.find(node => node.kind === 'task')!
    const step = projected.find(node => node.kind === 'subtask')!
    expect(step.parentId).toBe(task.id)
    expect(() => store.update(task.id, { status: 'completed' })).toThrow(/只读/)
    expect(() => store.update(step.id, { parentId: null })).toThrow(/固定/)
    store.update(task.id, { owner: 'Human', priority: 'urgent' })
    observations.save([{ ...source, title: 'Changed source title' }], now, { status: 'healthy', version: '1', checkedAt: now })
    expect(store.snapshot().nodes.find(node => node.id === task.id)).toMatchObject({ title: 'Changed source title', owner: 'Human', priority: 'urgent' })
    observations.save([], now, { status: 'healthy', version: '1', checkedAt: now })
    expect(store.snapshot().nodes.every(node => node.missing)).toBe(true)
    observations.close(); store.close()
  })
  it('creates a complete hierarchy, records changes and persists after reopening', () => {
    const store = open()
    const epic = store.create({ projectId: 1, kind: 'epic', title: 'Epic' })
    const feature = store.create({ projectId: 1, parentId: epic, kind: 'feature', title: 'Feature' })
    const task = store.create({ projectId: 1, parentId: feature, kind: 'task', title: 'Task', acceptanceCriteria: ['Build passes'] })
    const subtask = store.create({ projectId: 1, parentId: task, kind: 'subtask', title: 'Subtask' })
    store.update(task, { priority: 'urgent', owner: 'operator', dependencies: [subtask] })
    expect(store.snapshot().nodes).toHaveLength(4)
    expect(store.snapshot().nodes.find(node => node.id === task)).toMatchObject({ priority: 'urgent', dependencies: [subtask] })
    expect(store.snapshot().changes).toHaveLength(5)
    store.close()
    const reopened = new GraphStore(path.join(directories[0], 'graph.db'), 'primary')
    expect(reopened.snapshot().nodes).toHaveLength(4)
    reopened.close()
  })
  it('rejects dependency cycles, cross-project edges, invalid parents and missing references without partial updates', () => {
    const store = open()
    const a = store.create({ projectId: 1, kind: 'task', title: 'A' })
    const b = store.create({ projectId: 1, kind: 'task', title: 'B', dependencies: [a] })
    const other = store.create({ projectId: 2, kind: 'task', title: 'Other' })
    expect(() => store.update(a, { dependencies: [b] })).toThrow(/循环/)
    expect(() => store.update(a, { dependencies: [other] })).toThrow(/项目/)
    expect(() => store.update(a, { parentId: b })).toThrow(/层级/)
    expect(() => store.update(a, { dependencies: ['missing'] })).toThrow(/不存在/)
    expect(store.snapshot().nodes.find(node => node.id === a)?.dependencies).toEqual([])
    store.close()
  })
  it('keeps fifty tasks in five projects isolated and queryable', () => {
    const store = open()
    for (let projectId = 1; projectId <= 5; projectId++) for (let index = 0; index < 10; index++) store.create({ projectId, kind: 'task', title: `Project ${projectId} task ${index}` })
    expect(store.snapshot().nodes).toHaveLength(50)
    for (let projectId = 1; projectId <= 5; projectId++) expect(store.snapshot().nodes.filter(node => node.projectId === projectId)).toHaveLength(10)
    store.close()
  })
})
