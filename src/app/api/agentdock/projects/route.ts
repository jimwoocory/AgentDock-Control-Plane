import { NextResponse } from 'next/server'
import { observerAccess, readLocalBody } from '@/lib/agentdock/api'
import { openObservationStore } from '@/lib/agentdock/service'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const denied = observerAccess(request, true)
  if (denied) return denied
  try {
    const body = await readLocalBody(request)
    if (typeof body.name !== 'string' || (body.owner !== undefined && typeof body.owner !== 'string') || (body.goal !== undefined && typeof body.goal !== 'string')) throw new Error('项目字段格式无效')
    const store = openObservationStore()
    try { return NextResponse.json({ id: store.createProject(body.name, body.owner as string | undefined, body.goal as string | undefined) }, { status: 201 }) }
    finally { store.close() }
  } catch { return NextResponse.json({ error: '项目名称重复或字段无效（名称最多200字、目标最多4000字）' }, { status: 400 }) }
}
