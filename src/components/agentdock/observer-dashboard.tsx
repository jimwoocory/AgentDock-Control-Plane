'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ObservedTask, ObserverSnapshot, Project } from '@/lib/agentdock/types'

type LoadState = 'loading' | 'ready' | 'error'

function formatTime(value: string | null) {
  if (!value) return '尚未采集'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function statusClass(status: string) {
  const normalized = status.trim().toLocaleLowerCase()
  if (['done', 'completed', 'success'].includes(normalized)) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  if (['failed', 'error', 'blocked'].includes(normalized)) return 'border-red-500/30 bg-red-500/10 text-red-300'
  if (['running', 'active', 'in-progress'].includes(normalized)) return 'border-sky-500/30 bg-sky-500/10 text-sky-300'
  return 'border-border bg-secondary/50 text-muted-foreground'
}

async function responseError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown; message?: unknown }
    if (typeof body.error === 'string') return body.error
    if (typeof body.message === 'string') return body.message
  } catch {}
  return `HTTP ${response.status}`
}

function taskMatches(task: ObservedTask, search: string, status: string) {
  const normalized = search.trim().toLocaleLowerCase()
  return (!status || task.status === status) && (!normalized || `${task.title} ${task.goal} ${task.summary} ${task.id}`.toLocaleLowerCase().includes(normalized))
}

function SourceNotice({ snapshot }: { snapshot: ObserverSnapshot }) {
  const { source } = snapshot
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3" aria-label="来源状态">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">文件系统只读来源</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{source.key} · {source.transport} · 状态：{source.status}</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-xs ${source.stale ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
          {source.stale ? '快照可能过期' : '最近快照可用'}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <p>最近成功采集：<span className="text-foreground/80">{formatTime(source.observedAt)}</span></p>
        <p>runtime 探测：<span className="text-foreground/80">{source.runtime.status} · {source.runtime.version ?? '版本未知'} · {formatTime(source.runtime.checkedAt)}（仅健康探测，不代表 agent 在线）</span></p>
        <p>会话：<span className="text-foreground/80">{source.sessions.description}</span></p>
      </div>
      {source.warnings.map(warning => <p key={warning} className="mt-2 text-xs text-amber-300">{warning}</p>)}
    </section>
  )
}

function ProjectCard({ project, selected, count, onSelect }: { project: Project | null; selected: boolean; count: number; onSelect: () => void }) {
  const title = project?.name ?? '未归属'
  const description = project ? `${project.owner || '未指定负责人'} · ${project.goal || '未填写目标'}` : '来源未提供项目字段，或尚未手动关联。'
  return (
    <button type="button" onClick={onSelect} className={`min-h-28 rounded-lg border p-3 text-left transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-secondary/40'}`}>
      <div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold">{title}</span><span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">{count}</span></div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</p>
    </button>
  )
}

function TaskDetail({ task, history, projects, bindingProject, onBindingChange, onSaveBinding, saving }: { task: ObservedTask; history: ObserverSnapshot['history']; projects: Project[]; bindingProject: string; onBindingChange: (value: string) => void; onSaveBinding: () => void; saving: boolean }) {
  const taskHistory = history.filter(item => item.taskId === task.id)
  return (
    <aside className="rounded-lg border border-border bg-card" aria-label="任务详情">
      <header className="border-b border-border px-4 py-3"><p className="text-xs text-muted-foreground">来源任务 {task.id}</p><h2 className="mt-1 text-base font-semibold">{task.title}</h2><p className="mt-1 text-sm text-muted-foreground">{task.summary || task.goal || '来源未提供摘要。'}</p></header>
      <div className="space-y-5 p-4 text-sm">
        <section className="rounded-md border border-border bg-secondary/20 p-3"><label htmlFor="task-project-binding" className="text-xs font-medium">本地项目归属</label><div className="mt-2 flex gap-2"><select id="task-project-binding" value={bindingProject} onChange={event => onBindingChange(event.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"><option value="">未归属</option>{projects.map(project => <option key={project.id} value={String(project.id)}>{project.name}</option>)}</select><button type="button" disabled={saving} onClick={onSaveBinding} className="rounded-md border border-border bg-card px-2 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">{saving ? '保存中…' : '保存归属'}</button></div><p className="mt-2 text-xs text-muted-foreground">仅保存控制台本地关联，不会改写来源 project 字段。</p></section>
        {!task.present && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">来源文件现已缺失；以下是最后一次采集到的历史记录，不代表当前状态。</p>}
        <section><h3 className="font-medium">步骤树（非依赖关系）</h3><p className="mt-1 text-xs text-muted-foreground">步骤由来源任务记录；它们不是任务依赖图。</p><ol className="mt-3 space-y-2 border-l border-border pl-3">{task.steps.length ? task.steps.map(step => <li key={step.id}><p>{step.title}</p><p className="text-xs text-muted-foreground">{step.phase} · {step.status} · {formatTime(step.updated_at)}</p></li>) : <li className="text-muted-foreground">来源未采集步骤。</li>}</ol></section>
        <section><h3 className="font-medium">验收条件</h3><ul className="mt-2 space-y-1 text-muted-foreground">{task.conditions.length ? task.conditions.map(condition => <li key={condition.id}>• {condition.text}</li>) : <li>来源未提供验收条件。</li>}</ul></section>
        <section><h3 className="font-medium">来源事件</h3><ul className="mt-2 space-y-2">{task.events.length ? task.events.map((event, index) => <li key={`${event.created_at}-${index}`}><p>{event.summary}</p><p className="text-xs text-muted-foreground">{event.type} · {formatTime(event.created_at)}</p></li>) : <li className="text-muted-foreground">来源未采集事件。</li>}</ul></section>
        <section><h3 className="font-medium">采集历史</h3><ul className="mt-2 space-y-2">{taskHistory.length ? taskHistory.map(item => <li key={item.id}><p>{item.status} · {item.phase}</p><p className="text-xs text-muted-foreground">采集于 {formatTime(item.observedAt)}</p></li>) : <li className="text-muted-foreground">尚无采集历史。</li>}</ul></section>
        <p className="rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">未知（来源未报告 agent / heartbeat）。runtime 健康状态只表示 healthz 探测结果。</p>
      </div>
    </aside>
  )
}

export function ObserverDashboard() {
  const [snapshot, setSnapshot] = useState<ObserverSnapshot | null>(null)
  const snapshotRef = useRef<ObserverSnapshot | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<number | 'unassigned' | 'all'>('all')
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [bindingProject, setBindingProject] = useState('')
  const [savingBinding, setSavingBinding] = useState(false)
  const [projectDraft, setProjectDraft] = useState({ name: '', owner: '', goal: '' })
  const [savingProject, setSavingProject] = useState(false)

  const load = useCallback(async (refresh = false) => {
    try {
      const response = await fetch(refresh ? '/api/agentdock/refresh' : '/api/agentdock', refresh ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : undefined)
      if (response.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
        return
      }
      if (!response.ok) throw new Error(await responseError(response))
      const data = await response.json() as ObserverSnapshot
      snapshotRef.current = data
      setSnapshot(data)
      setLoadState('ready')
      setError(null)
    } catch (caught) {
      setLoadState('error')
      const detail = caught instanceof Error ? caught.message : '未知错误'
      setError(snapshotRef.current ? `采集请求失败：${detail}。保留上次成功采集的数据。` : `无法读取观察快照：${detail}`)
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => { void load() }, 15_000)
    return () => window.clearInterval(interval)
  }, [load])

  const projectTasks = useMemo(() => (snapshot?.tasks ?? []).filter(task => {
    if (selectedProject === 'all') return true
    return selectedProject === 'unassigned' ? task.projectId === null : task.projectId === selectedProject
  }).filter(task => taskMatches(task, search, status)), [snapshot, search, selectedProject, status])
  const activeTask = projectTasks.find(task => task.id === selectedTask) ?? projectTasks[0] ?? null
  const statuses = useMemo(() => [...new Set((snapshot?.tasks ?? []).map(task => task.status))], [snapshot])

  useEffect(() => { setBindingProject(activeTask?.projectId === null || !activeTask ? '' : String(activeTask.projectId)) }, [activeTask?.id, activeTask?.projectId])

  const saveBinding = async () => {
    if (!activeTask) return
    setSavingBinding(true)
    try {
      const response = await fetch('/api/agentdock/bindings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: activeTask.id, projectId: bindingProject ? Number(bindingProject) : null }) })
      if (!response.ok) throw new Error(await responseError(response))
      await load()
    } catch (caught) { setError(`保存本地归属失败：${caught instanceof Error ? caught.message : '未知错误'}`) } finally { setSavingBinding(false) }
  }

  const createProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingProject(true)
    try {
      const response = await fetch('/api/agentdock/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projectDraft) })
      if (!response.ok) throw new Error(await responseError(response))
      setProjectDraft({ name: '', owner: '', goal: '' })
      await load()
    } catch (caught) { setError(`创建本地项目失败：${caught instanceof Error ? caught.message : '未知错误'}`) } finally { setSavingProject(false) }
  }

  if (loadState === 'loading' && !snapshot) return <main className="p-6 text-sm text-muted-foreground">正在读取 AgentDock 只读快照…</main>
  if (!snapshot) return <main className="p-6"><h1 className="text-lg font-semibold">AgentDock 观察面板</h1><p className="mt-2 text-sm text-red-300">{error ?? '尚无可显示的快照。'}</p><button className="mt-4 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary" onClick={() => void load()}>重试</button></main>

  return <main className="min-h-full space-y-4 bg-background p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">AgentDock / P0 只读观察</p><h1 className="mt-1 text-xl font-semibold tracking-tight">AgentDock 观察面板</h1><p className="mt-1 text-sm text-muted-foreground">项目关联写入控制台本地 metadata；来源任务、步骤和事件始终只读。</p></div><button type="button" onClick={() => void load(true)} className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">重新采集</button></header>
    {error && <div role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{error}</div>}
    <SourceNotice snapshot={snapshot} />
    <section aria-label="项目筛选"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">项目</h2><span className="text-xs text-muted-foreground">{snapshot.projects.length} 个本地项目容器</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{snapshot.projects.map(project => <ProjectCard key={project.id} project={project} selected={selectedProject === project.id} count={snapshot.tasks.filter(task => task.projectId === project.id).length} onSelect={() => setSelectedProject(project.id)} />)}<ProjectCard project={null} selected={selectedProject === 'unassigned'} count={snapshot.tasks.filter(task => task.projectId === null).length} onSelect={() => setSelectedProject('unassigned')} /><button className="text-left text-xs text-muted-foreground underline" onClick={() => setSelectedProject('all')}>查看全部任务</button></div><form onSubmit={createProject} className="mt-3 grid gap-2 rounded-lg border border-dashed border-border p-3 md:grid-cols-[1fr_1fr_2fr_auto]"><input required aria-label="项目名称" value={projectDraft.name} onChange={event => setProjectDraft(current => ({ ...current, name: event.target.value }))} placeholder="新建本地项目名称" className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" /><input aria-label="项目负责人" value={projectDraft.owner} onChange={event => setProjectDraft(current => ({ ...current, owner: event.target.value }))} placeholder="负责人" className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" /><input aria-label="项目目标" value={projectDraft.goal} onChange={event => setProjectDraft(current => ({ ...current, goal: event.target.value }))} placeholder="目标（仅本地 metadata）" className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" /><button disabled={savingProject} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50">{savingProject ? '创建中…' : '创建项目'}</button></form></section>
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]"><div className="rounded-lg border border-border bg-card"><div className="flex flex-wrap gap-2 border-b border-border p-3"><input aria-label="搜索任务" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索任务、目标或 ID" className="min-w-48 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" /><select aria-label="任务状态" value={status} onChange={event => setStatus(event.target.value)} className="rounded-md border border-border bg-background px-2 text-sm"><option value="">全部状态</option>{statuses.map(value => <option key={value} value={value}>{value}</option>)}</select></div><div className="divide-y divide-border/70">{projectTasks.length ? projectTasks.map(task => <button key={task.id} type="button" onClick={() => setSelectedTask(task.id)} className={`w-full px-4 py-3 text-left hover:bg-secondary/40 ${activeTask?.id === task.id ? 'bg-secondary/50' : ''}`}><div className="flex gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{task.title}</p><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{task.summary || task.goal || '来源未提供摘要。'}</p></div><span className={`h-fit shrink-0 rounded border px-1.5 py-0.5 text-xs ${statusClass(task.status)}`}>{task.status}</span></div><p className="mt-2 text-xs text-muted-foreground">{task.phase} · 来源更新 {formatTime(task.updated_at)} · {task.projectId === null ? '未归属' : task.projectOrigin === 'manual' ? '手动关联' : '来源关联'}</p></button>) : <div className="p-8 text-center"><p className="text-sm text-muted-foreground">这个筛选下没有真实任务。</p><p className="mt-1 text-xs text-muted-foreground">空项目不会填充示例数据。</p></div>}</div></div>{activeTask ? <TaskDetail task={activeTask} history={snapshot.history} projects={snapshot.projects} bindingProject={bindingProject} onBindingChange={setBindingProject} onSaveBinding={() => void saveBinding()} saving={savingBinding} /> : <aside className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">选择一项真实任务以查看来源事件、步骤与采集历史。</aside>}</section>
  </main>
}
