'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { GraphNode, NodeInput, NodeKind, NodePriority } from '@/lib/agentdock/graph-types'

const kinds: NodeKind[] = ['epic', 'feature', 'task', 'subtask']
const priorities: NodePriority[] = ['low', 'medium', 'high', 'urgent']
const rank: Record<NodeKind, number> = { epic: 0, feature: 1, task: 2, subtask: 3 }
type Draft = { title: string; kind: NodeKind; parentId: string; priority: NodePriority; owner: string; agentId: string; criteria: string; dependencies: string[] }
const draftFor = (node: GraphNode | null): Draft => ({ title: node?.title ?? '', kind: node?.kind ?? 'task', parentId: node?.parentId ?? '', priority: node?.priority ?? 'medium', owner: node?.owner ?? '', agentId: node?.agentId ?? '', criteria: (node?.acceptanceCriteria ?? []).join('\n'), dependencies: node?.dependencies ?? [] })

export function NodeEditor({ node, nodes, projectId, onCreate, onSave }: { node: GraphNode | null; nodes: GraphNode[]; projectId: number | null; onCreate: (input: NodeInput) => Promise<void>; onSave: (id: string, patch: Partial<NodeInput>) => Promise<void> }) {
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => draftFor(node))
  const lastNodeId = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (lastNodeId.current === node?.id) return
    lastNodeId.current = node?.id
    setCreating(false)
    setDraft(draftFor(node))
  }, [node])
  const source = node?.origin === 'agentdock'
  const fixedSourceStep = Boolean(source && node?.id.startsWith('step:'))
  const localMode = creating || !node || !source
  const projectNodes = useMemo(() => nodes.filter(item => item.projectId === projectId && item.id !== (creating ? null : node?.id)), [nodes, projectId, node?.id, creating])
  const parentOptions = projectNodes.filter(item => !item.id.startsWith('step:') && rank[item.kind] < rank[draft.kind])
  const submit = async () => {
    if (!projectId || !draft.title.trim()) return
    setBusy(true)
    try {
      if (creating || !node) await onCreate({ projectId, title: draft.title.trim(), kind: draft.kind, parentId: draft.parentId || null, priority: draft.priority, owner: draft.owner, agentId: draft.agentId || null, acceptanceCriteria: draft.criteria.split('\n').map(value => value.trim()).filter(Boolean), dependencies: draft.dependencies })
      else if (source) await onSave(node.id, { parentId: fixedSourceStep ? node.parentId : draft.parentId || null, priority: draft.priority, owner: draft.owner, agentId: draft.agentId || null, dependencies: draft.dependencies })
      else await onSave(node.id, { projectId, title: draft.title.trim(), kind: draft.kind, parentId: draft.parentId || null, priority: draft.priority, owner: draft.owner, agentId: draft.agentId || null, acceptanceCriteria: draft.criteria.split('\n').map(value => value.trim()).filter(Boolean), dependencies: draft.dependencies })
    } finally { setBusy(false) }
  }
  const startCreate = () => { setCreating(true); setDraft(draftFor(null)) }
  return <aside className="rounded-lg border border-border bg-card" aria-label="节点详情"><div className="flex items-center justify-between border-b border-border px-3 py-2"><div><p className="text-xs text-muted-foreground">{creating ? '创建本地节点' : node ? `${node.kind} · ${node.id}` : '创建本地节点'}</p><h2 className="text-sm font-semibold">{creating ? '新建节点' : node?.title ?? '新建节点'}</h2></div><button type="button" onClick={startCreate} className="rounded border border-border px-2 py-1 text-xs hover:bg-secondary">新建节点</button></div>{source && !creating && <p className="m-3 rounded border border-sky-500/30 bg-sky-500/10 p-2 text-xs text-sky-100">来源投影：业务字段只读。仅父级、优先级、负责人、Agent 与依赖可保存在本地控制台。</p>}<div className="space-y-3 p-3 text-sm"><label className="block text-xs">标题<input aria-label="标题" disabled={!localMode} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 disabled:opacity-60" /></label><div className="grid grid-cols-2 gap-2"><label className="text-xs">类型<select disabled={!localMode} value={draft.kind} onChange={event => setDraft(current => ({ ...current, kind: event.target.value as NodeKind, parentId: '' }))} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5">{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label><label className="text-xs">优先级<select value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value as NodePriority }))} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5">{priorities.map(priority => <option key={priority}>{priority}</option>)}</select></label></div><label className="block text-xs">父节点<select disabled={fixedSourceStep && !creating} value={draft.parentId} onChange={event => setDraft(current => ({ ...current, parentId: event.target.value }))} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 disabled:opacity-60"><option value="">无</option>{parentOptions.map(item => <option key={item.id} value={item.id}>{item.kind} · {item.title}</option>)}</select>{fixedSourceStep && !creating && <span className="mt-1 block text-xs text-muted-foreground">来源步骤的父级由来源树固定。</span>}</label><label className="block text-xs">负责人<input value={draft.owner} onChange={event => setDraft(current => ({ ...current, owner: event.target.value }))} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" /></label><label className="block text-xs">Agent<input value={draft.agentId} onChange={event => setDraft(current => ({ ...current, agentId: event.target.value }))} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" /></label><label className="block text-xs">验收条件（每行一项）<textarea disabled={!localMode} value={draft.criteria} onChange={event => setDraft(current => ({ ...current, criteria: event.target.value }))} className="mt-1 min-h-16 w-full rounded border border-border bg-background px-2 py-1.5 disabled:opacity-60" /></label><fieldset><legend className="text-xs">依赖项</legend><div className="mt-1 max-h-24 space-y-1 overflow-auto rounded border border-border p-2">{projectNodes.length ? projectNodes.map(item => <label key={item.id} className="flex gap-2 text-xs"><input type="checkbox" checked={draft.dependencies.includes(item.id)} onChange={event => setDraft(current => ({ ...current, dependencies: event.target.checked ? [...current.dependencies, item.id] : current.dependencies.filter(id => id !== item.id) }))} />{item.title}</label>) : <span className="text-xs text-muted-foreground">当前项目没有可选节点</span>}</div></fieldset><button type="button" disabled={busy || (!creating && !node)} onClick={() => void submit()} className="w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy ? '保存中…' : creating || !node ? '创建节点' : '保存本地管理信息'}</button></div></aside>
}
