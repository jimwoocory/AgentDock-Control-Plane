import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { ObservationStore } from './store'
import type { GraphNode, GraphSnapshot, NodeInput, NodePatch, NodeKind } from './graph-types.ts'

const rank: Record<NodeKind, number> = { epic: 0, feature: 1, task: 2, subtask: 3 }
const keys = ['projectId', 'parentId', 'kind', 'title', 'status', 'priority', 'owner', 'agentId', 'acceptanceCriteria', 'dependencies']
export class GraphStore {
  private db: Database.Database
  private observations: ObservationStore
  private sourceKey: string
  constructor(databasePath: string, sourceKey: string) {
    this.sourceKey = sourceKey
    this.observations = new ObservationStore(databasePath, sourceKey)
    this.db = new Database(databasePath)
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(`CREATE TABLE IF NOT EXISTS cp_graph_nodes(source_key TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(source_key,id));
      CREATE TABLE IF NOT EXISTS cp_graph_changes(id INTEGER PRIMARY KEY,source_key TEXT NOT NULL,node_id TEXT NOT NULL,action TEXT NOT NULL,summary TEXT NOT NULL,created_at TEXT NOT NULL);`)
  }
  private nodes(): GraphNode[] { return (this.db.prepare('SELECT payload FROM cp_graph_nodes WHERE source_key=? ORDER BY id').all(this.sourceKey) as { payload: string }[]).map(row => JSON.parse(row.payload)) }
  private put(node: GraphNode) { this.db.prepare('INSERT INTO cp_graph_nodes VALUES (?,?,?) ON CONFLICT(source_key,id) DO UPDATE SET payload=excluded.payload').run(this.sourceKey, node.id, JSON.stringify(node)) }
  private synchronize() {
    const snapshot = this.observations.snapshot()
    const existing = new Map(this.nodes().map(node => [node.id, node]))
    this.db.transaction(() => {
      for (const node of existing.values()) if (node.origin === 'agentdock') this.put({ ...node, missing: true })
      for (const task of snapshot.tasks) {
        const id = `src:${this.sourceKey}:${task.id}`
        const prior = existing.get(id)
        const parent = prior?.parentId ? existing.get(prior.parentId) : null
        const node: GraphNode = { id, projectId: task.projectId, parentId: parent && parent.projectId === task.projectId && rank[parent.kind] < 2 ? parent.id : null,
          kind: 'task', title: task.title, status: task.status, priority: prior?.priority ?? 'medium', owner: prior?.owner ?? '', agentId: prior?.agentId ?? null,
          acceptanceCriteria: task.conditions.map(item => item.text), dependencies: (prior?.dependencies ?? []).filter(dependency => existing.get(dependency)?.projectId === task.projectId),
          origin: 'agentdock', sourceTaskId: task.id, missing: !task.present, updatedAt: task.updated_at }
        this.put(node)
        for (const step of task.steps) {
          const stepId = `step:${createHash('sha256').update(`${id}:${step.id}`).digest('hex').slice(0, 24)}`
          const previous = existing.get(stepId)
          this.put({ ...node, id: stepId, parentId: id, kind: 'subtask', title: step.title, status: step.status, updatedAt: step.updated_at,
            priority: previous?.priority ?? 'medium', owner: previous?.owner ?? '', agentId: previous?.agentId ?? null, acceptanceCriteria: [],
            dependencies: (previous?.dependencies ?? []).filter(dependency => existing.get(dependency)?.projectId === task.projectId) })
        }
      }
      const reconciled = this.nodes(); const map = new Map(reconciled.map(node => [node.id, node]))
      for (const node of reconciled) {
        const parent = node.parentId ? map.get(node.parentId) : null
        const parentId = parent && parent.projectId === node.projectId && rank[parent.kind] < rank[node.kind] ? parent.id : null
        const dependencies = node.dependencies.filter(id => map.get(id)?.projectId === node.projectId)
        if (node.parentId !== parentId || dependencies.length !== node.dependencies.length) this.change({ ...node, parentId, dependencies }, 'reconcile', '来源项目关联变更，移除跨项目父级或依赖')
      }
    })()
  }
  snapshot(): GraphSnapshot {
    this.synchronize()
    return { nodes: this.nodes(), changes: this.db.prepare('SELECT id,node_id AS nodeId,action,summary,created_at AS createdAt FROM cp_graph_changes WHERE source_key=? ORDER BY id DESC LIMIT 1000').all(this.sourceKey) as GraphSnapshot['changes'] }
  }
  private validate(node: GraphNode, all: GraphNode[]) {
    if (!Object.hasOwn(rank, node.kind) || !['low', 'medium', 'high', 'urgent'].includes(node.priority)) throw new Error('节点类型或优先级无效')
    const fields = node.origin === 'local' ? [[node.title, 300], [node.status, 100], [node.owner, 200]] as const : [[node.owner, 200]] as const
    for (const [value, limit] of fields) if (typeof value !== 'string' || value.length > limit) throw new Error('字段格式或长度无效')
    if (!node.title.trim() || !node.status.trim()) throw new Error('标题和状态不能为空')
    if (node.projectId === null ? node.origin === 'local' : !Number.isSafeInteger(node.projectId) || !this.db.prepare('SELECT id FROM cp_projects WHERE id=?').get(node.projectId)) throw new Error('项目不存在')
    if (node.projectId === null && (node.parentId !== null || node.dependencies.length)) throw new Error('设置父级或依赖前请先关联项目')
    if (node.agentId !== null && (typeof node.agentId !== 'string' || node.agentId.length > 300)) throw new Error('Agent 字段无效')
    if (node.origin === 'local' && (!Array.isArray(node.acceptanceCriteria) || node.acceptanceCriteria.length > 100 || node.acceptanceCriteria.some(value => typeof value !== 'string' || value.length > 2000))) throw new Error('验收条件无效')
    if (!Array.isArray(node.dependencies) || node.dependencies.length > 200 || node.dependencies.some(value => typeof value !== 'string') || new Set(node.dependencies).size !== node.dependencies.length) throw new Error('依赖字段无效')
    const map = new Map(all.map(item => [item.id, item])); map.set(node.id, node)
    if (node.parentId !== null) {
      const parent = map.get(node.parentId)
      if (!parent) throw new Error('父节点不存在')
      if (parent.projectId !== node.projectId) throw new Error('父节点必须属于同一项目')
      if (rank[parent.kind] >= rank[node.kind]) throw new Error('父节点层级必须高于子节点')
    }
    for (const dependency of node.dependencies) {
      const target = map.get(dependency)
      if (!target) throw new Error('依赖节点不存在')
      if (target.projectId !== node.projectId) throw new Error('依赖必须属于同一项目')
    }
    // Validate reverse links too: changing project or kind cannot invalidate children/dependents.
    for (const current of map.values()) {
      if (current.parentId === node.id && (current.projectId !== node.projectId || rank[current.kind] <= rank[node.kind])) throw new Error('修改会破坏现有子节点层级或项目')
      if (current.dependencies.includes(node.id) && current.projectId !== node.projectId) throw new Error('修改会破坏现有依赖项目')
    }
    const visiting = new Set<string>(); const visited = new Set<string>()
    const visit = (id: string) => { if (visiting.has(id)) throw new Error('任务依赖存在循环'); if (visited.has(id)) return; visiting.add(id); for (const dependency of map.get(id)?.dependencies ?? []) visit(dependency); visiting.delete(id); visited.add(id) }
    for (const id of map.keys()) visit(id)
  }
  private change(node: GraphNode, action: string, summary: string) {
    this.put(node)
    this.db.prepare('INSERT INTO cp_graph_changes(source_key,node_id,action,summary,created_at) VALUES (?,?,?,?,?)').run(this.sourceKey, node.id, action, summary, new Date().toISOString())
    this.db.prepare('DELETE FROM cp_graph_changes WHERE source_key=? AND id NOT IN (SELECT id FROM cp_graph_changes WHERE source_key=? ORDER BY id DESC LIMIT 1000)').run(this.sourceKey, this.sourceKey)
  }
  create(input: NodeInput): string {
    this.synchronize()
    if (Object.keys(input).some(key => !keys.includes(key))) throw new Error('未知节点字段')
    const node: GraphNode = { id: `local:${randomUUID()}`, parentId: null,
      status: 'pending', priority: 'medium', owner: '', agentId: null, acceptanceCriteria: [], dependencies: [], ...input,
      origin: 'local', sourceTaskId: null, missing: false, updatedAt: new Date().toISOString() }
    this.db.transaction(() => { this.validate(node, this.nodes()); this.change(node, 'create', `创建 ${node.kind}：${node.title}`) })()
    return node.id
  }
  update(id: string, patch: NodePatch): void {
    this.synchronize()
    if (Object.keys(patch).some(key => !keys.includes(key))) throw new Error('未知节点字段')
    this.db.transaction(() => {
      const all = this.nodes(); const prior = all.find(node => node.id === id)
      if (!prior) throw new Error('节点不存在')
      if (prior.origin === 'agentdock' && Object.keys(patch).some(key => !['parentId', 'priority', 'owner', 'agentId', 'dependencies'].includes(key))) throw new Error('来源任务业务字段只读')
      if (id.startsWith('step:') && patch.parentId !== undefined && patch.parentId !== prior.parentId) throw new Error('来源步骤父节点固定')
      const node = { ...prior, ...patch, updatedAt: new Date().toISOString() }
      this.validate(node, all)
      this.change(node, 'update', `更新本地管理字段：${Object.keys(patch).join(', ')}`)
    })()
  }
  close() { this.db.close(); this.observations.close() }
}
