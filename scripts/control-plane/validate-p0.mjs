// This acceptance fixture can only write to an explicitly marked, separate local validation deployment.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const base = 'http://127.0.0.1:4320'
const login = JSON.parse(readFileSync(path.resolve('.data/operator-login.json'), 'utf8'))
const auth = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(login) })
assert.equal(auth.status, 200, 'Fixture login must succeed')
const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
async function api(route, method = 'GET', body, status = 200) {
  const response = await fetch(base + route, { method, headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const result = await response.json()
  assert.equal(response.status, status, `${method} ${route}: ${result.error ?? 'unexpected HTTP status'}`)
  return result
}
const original = await api('/api/agentdock')
assert.equal(original.validationFixture, true, 'Refuse fixture writes to a real deployment')
assert.equal((await fetch(base + '/api/agentdock/graph')).status, 401)
assert.equal((await fetch(base + '/api/agentdock/agents')).status, 401)
assert.equal((await fetch(base + '/api/tasks', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, body: '{}' })).status, 403)
let graph = await api('/api/agentdock/graph')
assert.equal(graph.nodes.length, 0, 'Use a fresh isolated database for this acceptance run')
const projects = ['USVDS2', 'BMAD', 'Toonflow', 'Google-TTS', 'Research Lab']
const tasks = new Map()
for (const name of projects) {
  const projectId = original.projects.find(project => project.name === name)?.id
  assert.ok(projectId)
  const epic = (await api('/api/agentdock/graph', 'POST', { projectId, kind: 'epic', title: `${name} · 验收 Epic` }, 201)).id
  const feature = (await api('/api/agentdock/graph', 'POST', { projectId, parentId: epic, kind: 'feature', title: `${name} · 验收 Feature` }, 201)).id
  const ids = []
  for (let index = 0; index < 10; index++) ids.push((await api('/api/agentdock/graph', 'POST', { projectId, parentId: feature, kind: 'task', title: `${name} · 验收任务 ${String(index + 1).padStart(2, '0')}`, acceptanceCriteria: ['独立项目隔离', '依赖可见'], dependencies: index ? [ids[index - 1]] : [] }, 201)).id)
  await api('/api/agentdock/graph', 'POST', { projectId, parentId: ids[0], kind: 'subtask', title: `${name} · 验收 Subtask` }, 201)
  tasks.set(name, ids)
}
const first = tasks.get(projects[0])
await api('/api/agentdock/graph', 'PATCH', { id: first[0], priority: 'urgent', owner: '验收操作员' })
await api('/api/agentdock/graph', 'PATCH', { id: first[0], dependencies: [first[9]] }, 400)
await api('/api/agentdock/graph', 'PATCH', { id: first[0], dependencies: [tasks.get(projects[1])[0]] }, 400)
await api('/api/agentdock/graph', 'PATCH', { id: first[0], parentId: first[1] }, 400)
graph = await api('/api/agentdock/graph')
assert.equal(graph.nodes.length, 65)
assert.equal(graph.nodes.filter(node => node.kind === 'task').length, 50)
assert.equal(graph.nodes.reduce((total, node) => total + node.dependencies.length, 0), 45)
for (const name of projects) {
  const projectId = original.projects.find(project => project.name === name).id
  assert.equal(graph.nodes.filter(node => node.projectId === projectId && node.kind === 'task').length, 10)
}
assert.equal(graph.changes.length, 66)
assert.equal(graph.nodes.find(node => node.id === first[0]).priority, 'urgent')
const report = { verifiedAt: new Date().toISOString(), fixture: true, projects: 5, taskCount: 50, nodeCount: 65, dependencyCount: 45,
  hierarchy: 'Epic > Feature > Task > Subtask', checks: ['authenticated APIs', 'runtime writes blocked', 'project isolation', 'dependency cycles rejected', 'cross-project dependencies rejected', 'invalid parent rejected', 'priority persisted', 'management history persisted'] }
mkdirSync('.data/p0-validation', { recursive: true })
writeFileSync('.data/p0-validation/acceptance.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
