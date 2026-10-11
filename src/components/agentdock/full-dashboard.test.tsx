import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FullDashboard } from './full-dashboard'
import { AgentMonitor } from './agent-monitor'
import { NodeEditor } from './node-editor'
import type { GraphSnapshot } from '@/lib/agentdock/graph-types'
import type { AgentMonitorSnapshot } from '@/lib/agentdock/monitor-types'

const graph: GraphSnapshot = { nodes: [
  { id: 'local:1', projectId: 1, parentId: null, kind: 'epic', title: '本地 Epic', status: 'planned', priority: 'high', owner: 'Lee', agentId: null, acceptanceCriteria: ['可验证'], dependencies: [], origin: 'local', sourceTaskId: null, missing: false, updatedAt: '2026-10-11T10:00:00Z' },
  { id: 'task:source', projectId: 1, parentId: null, kind: 'task', title: '来源任务', status: 'running', priority: 'medium', owner: '', agentId: null, acceptanceCriteria: [], dependencies: [], origin: 'agentdock', sourceTaskId: 'task:source', missing: false, updatedAt: '2026-10-11T10:00:00Z' },
  { id: 'local:2', projectId: 2, parentId: null, kind: 'epic', title: '另一个项目', status: 'planned', priority: 'low', owner: '', agentId: null, acceptanceCriteria: [], dependencies: [], origin: 'local', sourceTaskId: null, missing: false, updatedAt: '2026-10-11T10:00:00Z' },
], changes: [{ id: 1, nodeId: 'local:1', action: 'created', summary: '本地创建', createdAt: '2026-10-11T10:00:00Z' }] }

const monitor: AgentMonitorSnapshot = { capabilities: [{ id: 'runtime', label: '本机运行时', status: 'ok', description: '只读发现', observedAt: '2026-10-11T10:00:00Z' }], agents: [{ id: 'codex:1', label: 'Codex', runtime: 'codex', source: '本地记录', status: 'Unknown', rawStatus: '', taskId: null, currentAction: null, lastActivityAt: null, lastHeartbeatAt: null, observedAt: '2026-10-11T10:00:00Z', stale: true, present: true }], events: [{ id: 1, agentId: 'codex:1', status: 'Unknown', action: '采集', observedAt: '2026-10-11T10:00:00Z' }], collectedAt: '2026-10-11T10:00:00Z', stale: true, warnings: ['采集已过期'] }

describe('FullDashboard', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })
  it('隔离项目、标注来源节点只读，并显示 Agent 未知与过期', async () => {
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve({ ok: true, status: 200, json: async () => path === '/api/agentdock/graph' ? graph : path === '/api/agentdock/agents' ? monitor : { projects: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }] } })))
    render(<FullDashboard />)
    expect(await screen.findByText('任务图谱')).toBeInTheDocument()
    expect(screen.getAllByText('采集已过期').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /来源任务/ }))
    expect(await screen.findByText(/来源投影：业务字段只读/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }))
    expect(screen.queryByText('本地 Epic')).not.toBeInTheDocument()
    expect(screen.getAllByText('另一个项目').length).toBeGreaterThan(0)
  })
  it('创建本地节点向 Graph API 发请求', async () => {
    const fetchMock = vi.fn((path: string, init?: RequestInit) => Promise.resolve({ ok: true, status: 200, json: async () => init?.method === 'POST' ? { id: 'local:created' } : path === '/api/agentdock/graph' ? graph : path === '/api/agentdock/agents' ? monitor : { projects: [{ id: 1, name: 'Alpha' }] } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<FullDashboard />)
    await screen.findByText('任务图谱')
    fireEvent.click(screen.getByRole('button', { name: '新建节点' }))
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '新任务' } })
    fireEvent.click(screen.getByRole('button', { name: '创建节点' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/agentdock/graph', expect.objectContaining({ method: 'POST' })))
  })
  it('来源节点仅提交本地可管理字段，且可立即切换到新建本地节点', async () => {
    const fetchMock = vi.fn((path: string, init?: RequestInit) => Promise.resolve({ ok: true, status: 200, json: async () => path === '/api/agentdock/graph' ? graph : path === '/api/agentdock/agents' ? monitor : { projects: [{ id: 1, name: 'Alpha' }] } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<FullDashboard />)
    await screen.findByText('任务图谱')
    fireEvent.click(screen.getByRole('button', { name: /来源任务/ }))
    const title = await screen.findByLabelText('标题')
    expect(title).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存本地管理信息' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/agentdock/graph', expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"id":"task:source"') })))
    const patchCall = fetchMock.mock.calls.find(call => (call[1] as RequestInit | undefined)?.method === 'PATCH')
    const patchBody = ((patchCall?.[1] as RequestInit | undefined)?.body ?? '') as string
    expect(patchBody).not.toContain('acceptanceCriteria')
    expect(patchBody).not.toContain('"title"')
    fireEvent.click(screen.getByRole('button', { name: '新建节点' }))
    expect(screen.getByLabelText('标题')).not.toBeDisabled()
  })
  it('未观察到的 Agent 只展示最后已知状态，不伪装为当前运行', () => {
    render(<AgentMonitor snapshot={{ ...monitor, agents: [{ ...monitor.agents[0], present: false, status: 'Running', currentAction: '旧动作' }] }} />)
    expect(screen.getByText('当前未观察到')).toBeInTheDocument()
    expect(screen.getByText(/最后已知状态：Running/)).toBeInTheDocument()
    expect(screen.queryByText(/动作：旧动作/)).not.toBeInTheDocument()
  })
  it('单个 Agent 记录过期时，不将最后状态显示为当前状态', () => {
    render(<AgentMonitor snapshot={{ ...monitor, stale: false, agents: [{ ...monitor.agents[0], present: true, stale: true, status: 'Running', currentAction: '旧动作' }] }} />)
    expect(screen.getByText('记录已过期')).toBeInTheDocument()
    expect(screen.getByText(/最后已知状态：Running/)).toBeInTheDocument()
    expect(screen.queryByText(/动作：旧动作/)).not.toBeInTheDocument()
  })
  it('创建 Feature 时可选择当前 Epic，且同一节点刷新不会重置草稿', () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<NodeEditor node={graph.nodes[0]} nodes={graph.nodes} projectId={1} onCreate={onCreate} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: '新建节点' }))
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'feature' } })
    expect(screen.getByRole('option', { name: /epic · 本地 Epic/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '未保存 Feature' } })
    rerender(<NodeEditor node={{ ...graph.nodes[0] }} nodes={graph.nodes.map(node => ({ ...node }))} projectId={1} onCreate={onCreate} onSave={onSave} />)
    expect(screen.getByLabelText('标题')).toHaveValue('未保存 Feature')
  })
})
