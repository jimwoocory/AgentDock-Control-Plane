import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ObserverDashboard } from './observer-dashboard'
import type { ObserverSnapshot } from '@/lib/agentdock/types'

const snapshot: ObserverSnapshot = {
  source: {
    key: 'agentdock-local', transport: 'filesystem-readonly', status: 'ok',
    observedAt: '2026-10-11T10:00:00.000Z', attemptedAt: '2026-10-11T10:00:00.000Z', stale: false,
    runtime: { status: 'healthy', version: '1.0.1', checkedAt: '2026-10-11T10:00:00.000Z' },
    warnings: [], sessions: { status: 'not-collected', description: '命令会话尚未采集。' },
  },
  projects: [{ id: 1, name: '控制台', owner: 'Jim', goal: '只读观察' }],
  tasks: [{
    id: 'task-1', title: '核对采集', goal: '显示真实状态', project: null, device: null,
    status: 'running', phase: 'execute', created_at: '2026-10-11T09:00:00.000Z', updated_at: '2026-10-11T10:00:00.000Z', summary: '正在采集。',
    steps: [{ id: 'step-1', title: '读取文件', phase: 'execute', status: 'done', updated_at: '2026-10-11T10:00:00.000Z' }],
    conditions: [{ id: 'condition-1', text: '源数据不写入' }], events: [{ type: 'source', summary: '发现任务', created_at: '2026-10-11T10:00:00.000Z' }], final_review: null,
    sourceKey: 'agentdock-local', projectId: null, projectOrigin: 'unassigned', present: true,
    firstSeenAt: '2026-10-11T09:00:00.000Z', lastSeenAt: '2026-10-11T10:00:00.000Z',
  }],
  history: [{ id: 1, taskId: 'task-1', status: 'running', phase: 'execute', sourceUpdatedAt: '2026-10-11T10:00:00.000Z', observedAt: '2026-10-11T10:00:00.000Z' }],
}

describe('ObserverDashboard', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('显示只读来源、未采集会话与未归属真实任务详情', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }))
    render(<ObserverDashboard />)

    expect(await screen.findByText('AgentDock 观察面板')).toBeInTheDocument()
    expect(screen.getByText('文件系统只读来源')).toBeInTheDocument()
    expect(screen.getByText('命令会话尚未采集。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /核对采集/ }))
    expect(screen.getByText('步骤树（非依赖关系）')).toBeInTheDocument()
    expect(screen.getByText(/源数据不写入/)).toBeInTheDocument()
    expect(screen.getByText(/未知（来源未报告 agent/)).toBeInTheDocument()
  })

  it('刷新失败时保留已加载快照并提示错误', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => snapshot })
      .mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    render(<ObserverDashboard />)
    await screen.findByRole('button', { name: /核对采集/ })
    fireEvent.click(screen.getByRole('button', { name: '重新采集' }))
    await waitFor(() => expect(screen.getByText(/保留上次成功采集的数据/)).toBeInTheDocument())
    expect(screen.getAllByText('核对采集').length).toBeGreaterThan(0)
  })

  it('保存本地归属后按项目筛选，且不修改来源项目字段', async () => {
    const boundSnapshot: ObserverSnapshot = {
      ...snapshot,
      tasks: snapshot.tasks.map(task => ({ ...task, projectId: 1, projectOrigin: 'manual' as const })),
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => snapshot })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => boundSnapshot })
    vi.stubGlobal('fetch', fetchMock)
    render(<ObserverDashboard />)
    await screen.findByRole('button', { name: /核对采集/ })

    fireEvent.change(screen.getByLabelText('本地项目归属'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: '保存归属' }))
    await waitFor(() => expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/agentdock/bindings', expect.objectContaining({ method: 'POST' })))
    await waitFor(() => expect(screen.getByText((content) => content.endsWith('手动关联'))).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /控制台/ }))
    expect(screen.getAllByText('核对采集').length).toBeGreaterThan(0)
    expect(boundSnapshot.tasks[0].project).toBeNull()
  })
})
