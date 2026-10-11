import { NextResponse } from 'next/server'
import { observerAccess, readLocalBody } from '@/lib/agentdock/api'
import { openObservationStore } from '@/lib/agentdock/service'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const denied = observerAccess(request, true)
  if (denied) return denied
  try {
    const body = await readLocalBody(request)
    if (typeof body.taskId !== 'string' || !/^tsk_[a-f0-9]{16}$/.test(body.taskId) || (body.projectId !== null && !Number.isSafeInteger(body.projectId))) throw new Error('任务或项目格式无效')
    const store = openObservationStore()
    try { store.bind(body.taskId, body.projectId as number | null); return NextResponse.json({ ok: true }) }
    finally { store.close() }
  } catch { return NextResponse.json({ error: '任务或项目不存在，关联未修改' }, { status: 400 }) }
}
