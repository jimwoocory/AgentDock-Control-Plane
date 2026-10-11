'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { GraphNode, GraphSnapshot, NodeInput } from '@/lib/agentdock/graph-types'
import type { AgentMonitorSnapshot } from '@/lib/agentdock/monitor-types'
import { AgentMonitor } from './agent-monitor'
import { NodeEditor } from './node-editor'
import { TaskGraph } from './task-graph'

type Project = { id: number; name: string }
type SourceTask = { id: string; title: string; status: string; phase: string; summary?: string; events?: Array<{ type: string; summary: string; created_at: string }>; final_review?: { status: string; summary: string } | null }
type Legacy = { projects?: Project[]; history?: Array<{ id: number; taskId: string; status: string; phase: string; observedAt: string }>; tasks?: SourceTask[]; source?: { status: string; stale: boolean; observedAt: string | null; warnings: string[]; runtime?: { status: string; version?: string | null; checkedAt?: string | null } }; validationFixture?: boolean }
const message = (error: unknown) => error instanceof Error ? error.message : '未知错误'

export function FullDashboard() {
  const [graph, setGraph] = useState<GraphSnapshot | null>(null)
  const [monitor, setMonitor] = useState<AgentMonitorSnapshot | null>(null)
  const [legacy, setLegacy] = useState<Legacy | null>(null)
  const [project, setProject] = useState<number | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'graph' | 'tree'>('graph')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [projectDraft, setProjectDraft] = useState({ name: '', owner: '', goal: '' })
  const loaded = useRef(false)
  const load = useCallback(async () => {
    try {
      const [nextGraph, nextMonitor, nextLegacy] = await Promise.all([apiFetch<GraphSnapshot>('/api/agentdock/graph'), apiFetch<AgentMonitorSnapshot>('/api/agentdock/agents'), apiFetch<Legacy>('/api/agentdock')])
      setGraph(nextGraph); setMonitor(nextMonitor); setLegacy(nextLegacy); setError(null); loaded.current = true
    } catch (caught) { setError(`${loaded.current ? '采集请求失败；保留上次成功数据。' : '无法读取控制台数据。'} ${message(caught)}`) }
  }, [])
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 15_000); return () => window.clearInterval(timer) }, [load])
  const nodes = useMemo(() => (graph?.nodes ?? []).filter(node => (project === 'all' || node.projectId === project) && (!query || `${node.title} ${node.status} ${node.owner} ${node.id}`.toLowerCase().includes(query.toLowerCase()))), [graph, project, query])
  const treeNodes = useMemo(() => {
    const byParent = new Map<string | null, GraphNode[]>()
    nodes.forEach(node => { const key = node.parentId && nodes.some(item => item.id === node.parentId) ? node.parentId : null; byParent.set(key, [...(byParent.get(key) ?? []), node]) })
    const result: Array<{ node: GraphNode; depth: number }> = []
    const visit = (parent: string | null, depth: number) => (byParent.get(parent) ?? []).sort((a, b) => a.title.localeCompare(b.title)).forEach(node => { result.push({ node, depth }); visit(node.id, depth + 1) })
    visit(null, 0); return result
  }, [nodes])
  const active = nodes.find(node => node.id === selectedId) ?? nodes[0] ?? null
  useEffect(() => { if (active && active.id !== selectedId) setSelectedId(active.id) }, [active, selectedId])
  const sourceDetail = legacy?.tasks?.find(task => task.id === active?.sourceTaskId || task.id === active?.id)
  const selectedProject = project === 'all' ? active?.projectId ?? legacy?.projects?.[0]?.id ?? null : project
  const create = async (input: NodeInput) => { try { await apiFetch('/api/agentdock/graph', { method: 'POST', body: JSON.stringify(input) }); await load() } catch (caught) { setError(`创建本地节点失败：${message(caught)}`) } }
  const save = async (id: string, patch: Partial<NodeInput>) => { try { await apiFetch('/api/agentdock/graph', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) }); await load() } catch (caught) { setError(`保存本地管理信息失败：${message(caught)}`) } }
  const createProject = async () => { if (!projectDraft.name.trim()) return; try { await apiFetch('/api/agentdock/projects', { method: 'POST', body: JSON.stringify(projectDraft) }); setProjectDraft({ name: '', owner: '', goal: '' }); await load() } catch (caught) { setError(`创建本地项目失败：${message(caught)}`) } }
  if (!graph) return <main className="p-6 text-sm text-muted-foreground">正在读取 AgentDock 控制台…{error && <p className="mt-2 text-amber-300">{error}</p>}</main>
  return <main className="min-h-full bg-background p-3 md:p-4">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3"><div><p className="text-xs text-muted-foreground">AgentDock / 本地控制平面</p><h1 className="text-xl font-semibold">任务图谱与 Agent 状态</h1><p className="mt-1 text-xs text-muted-foreground">来源任务与步骤仅作投影；本地管理信息单独保存。</p></div><button onClick={() => void load()} className="rounded border border-border px-3 py-1.5 text-sm">刷新</button></header>
    {legacy?.validationFixture && <p className="mt-3 rounded border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">验收夹具 · 5项目/50任务 · 非真实执行数据</p>}{legacy?.source && <p aria-label="来源采集状态" className={`mt-3 rounded border px-3 py-2 text-xs ${legacy.source.stale ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-border bg-card'}`}>来源采集：{legacy.source.status} · {legacy.source.observedAt ?? '尚未成功采集'}{legacy.source.runtime && ` · runtime 健康：${legacy.source.runtime.status}${legacy.source.runtime.version ? ` (${legacy.source.runtime.version})` : ''}`}{legacy.source.stale && ' · 快照可能过期，保留最后事实'}{legacy.source.warnings.map(warning => ` · ${warning}`)}</p>}
    {error && <p role="alert" className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{error}</p>}
    <div className="mt-3 grid gap-3 xl:grid-cols-[190px_minmax(0,1fr)_330px]">
      <nav className="rounded-lg border border-border bg-card p-2" aria-label="项目导航"><p className="px-2 pb-2 text-xs font-semibold text-muted-foreground">项目</p><button onClick={() => setProject('all')} className="mb-1 w-full rounded px-2 py-1.5 text-left text-sm">全部项目 <span className="float-right">{graph.nodes.length}</span></button>{(legacy?.projects ?? []).map(item => <button key={item.id} onClick={() => setProject(item.id)} className={`mb-1 w-full rounded px-2 py-1.5 text-left text-sm ${project === item.id ? 'bg-primary/15 text-primary' : ''}`}>{item.name}<span className="float-right">{graph.nodes.filter(node => node.projectId === item.id).length}</span></button>)}<div className="mt-2 space-y-1 border-t border-border pt-2"><input aria-label="项目名称" value={projectDraft.name} onChange={event => setProjectDraft(current => ({ ...current, name: event.target.value }))} placeholder="新项目" className="w-full rounded border border-border bg-background px-2 py-1 text-xs" /><input aria-label="项目负责人" value={projectDraft.owner} onChange={event => setProjectDraft(current => ({ ...current, owner: event.target.value }))} placeholder="负责人" className="w-full rounded border border-border bg-background px-2 py-1 text-xs" /><input aria-label="项目目标" value={projectDraft.goal} onChange={event => setProjectDraft(current => ({ ...current, goal: event.target.value }))} placeholder="目标" className="w-full rounded border border-border bg-background px-2 py-1 text-xs" /><button onClick={() => void createProject()} className="w-full rounded border border-border px-2 py-1 text-xs">创建项目</button></div></nav>
      <section className="min-w-0 space-y-3"><div className="rounded-lg border border-border bg-card"><div className="flex gap-2 border-b border-border p-2"><h2 className="mr-auto text-sm font-semibold">任务图谱</h2><input aria-label="搜索节点" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索" className="rounded border border-border bg-background px-2 text-sm" /><button onClick={() => setMode('graph')} className="text-xs">图</button><button onClick={() => setMode('tree')} className="text-xs">树</button></div><div className="p-2">{mode === 'graph' ? <TaskGraph nodes={nodes} selectedId={active?.id ?? null} onSelect={setSelectedId} /> : <div className="divide-y divide-border">{treeNodes.map(({ node, depth }) => <button key={node.id} onClick={() => setSelectedId(node.id)} className="flex w-full gap-2 px-3 py-2 text-left text-sm" style={{ paddingLeft: `${12 + depth * 18}px` }}><span>{node.kind}</span><span className="flex-1">{node.title}</span><span>{node.status}</span><span>{node.dependencies.length} 依赖</span></button>)}</div>}</div></div>
      <section className="rounded-lg border border-border bg-card p-3"><h2 className="text-sm font-semibold">本地管理历史</h2>{graph.changes.slice(0, 8).map(change => <p key={change.id} className="mt-1 text-xs text-muted-foreground">{change.nodeId} · {change.action} · {change.summary}</p>)}<h3 className="mt-3 border-t border-border pt-2 text-xs font-medium">来源观察历史（只读）</h3>{(legacy?.history ?? []).slice(0, 5).map(item => <p key={item.id} className="mt-1 text-xs text-muted-foreground">{item.taskId} · {item.status} / {item.phase} · {item.observedAt}</p>)}</section><AgentMonitor snapshot={monitor} /></section>
      <aside className="space-y-3"><NodeEditor node={active} nodes={graph.nodes} projectId={selectedProject} onCreate={create} onSave={save} />{sourceDetail && <section className="rounded-lg border border-border bg-card p-3 text-sm"><h2 className="font-semibold">来源任务详情（只读）</h2><p className="mt-1 text-xs text-muted-foreground">{sourceDetail.status} · {sourceDetail.phase} · {sourceDetail.summary ?? '来源未提供摘要'}</p><h3 className="mt-3 text-xs font-medium">来源事件</h3>{(sourceDetail.events ?? []).map((event, index) => <p key={`${event.created_at}-${index}`} className="mt-1 text-xs text-muted-foreground">{event.type} · {event.summary}</p>)}{sourceDetail.final_review && <p className="mt-3 text-xs">最终复核：{sourceDetail.final_review.status} · {sourceDetail.final_review.summary}</p>}</section>}</aside>
    </div>
  </main>
}
