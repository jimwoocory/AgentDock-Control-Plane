// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, readFile, rm, mkdir, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readTaskFiles, observerSettings } from './adapter'

const temporaryRoots: string[] = []
afterEach(async () => { vi.unstubAllEnvs(); for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cp-reader-test-'))
  temporaryRoots.push(root)
  await mkdir(path.join(root, 'tasks'))
  return root
}
const task = {
  schema_version: 1, id: 'tsk_1111111111111111', title: '重复标题', goal: '验收目标', project: 'USVDS2',
  status: 'active', phase: 'execute', created_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-11T00:00:00Z',
  steps: [{ id: 's1', title: '检查', status: 'pending', phase: 'execute' }],
  conditions: [{ id: 'c1', text: '构建通过' }], events: [{ type: 'created', summary: '创建', created_at: '2026-10-10T00:00:00Z' }],
}

describe('AgentDock read-only file boundary', () => {
  it('rejects an observer database physically inside the source through a directory alias', async () => {
    const root = await fixture()
    const alias = path.join(root, 'alias')
    await symlink(root, alias, 'junction')
    vi.stubEnv('AGENTDOCK_HOME', alias)
    vi.stubEnv('AGENTDOCK_OBSERVER_DB', path.join(root, 'observer.db'))
    expect(() => observerSettings()).toThrow()
  })
  it('preserves source IDs, unknown status, steps and bytes while reading real files', async () => {
    const root = await fixture()
    const filename = path.join(root, 'tasks', `${task.id}.json`)
    const bytes = JSON.stringify({ ...task, status: 'future-status' })
    await writeFile(filename, bytes)
    const result = await readTaskFiles(root)
    expect(result.errors).toEqual([])
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]).toMatchObject({ id: task.id, status: 'future-status', project: 'USVDS2', steps: [{ id: 's1', status: 'pending' }] })
    expect(await readFile(filename, 'utf8')).toBe(bytes)
  })
  it('reports corrupt JSON instead of turning the source into a successful empty list', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'tasks', `${task.id}.json`), '{broken')
    expect((await readTaskFiles(root)).errors).toHaveLength(1)
  })
  it('rejects filename/payload ID mismatch and unsupported schema', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'tasks', `${task.id}.json`), JSON.stringify({ ...task, id: '../../outside' }))
    expect((await readTaskFiles(root)).errors).toHaveLength(1)
    await writeFile(path.join(root, 'tasks', `${task.id}.json`), JSON.stringify({ ...task, schema_version: 99 }))
    expect((await readTaskFiles(root)).errors).toHaveLength(1)
  })
  it('bounds oversized files and distinguishes a missing directory', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'tasks', `${task.id}.json`), 'x'.repeat(524289))
    expect((await readTaskFiles(root)).errors).toHaveLength(1)
    await expect(readTaskFiles(path.join(root, 'absent'))).rejects.toThrow()
  })
})
