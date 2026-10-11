import { NextResponse } from 'next/server'
import { observerAccess } from '@/lib/agentdock/api'
import { refreshObservation } from '@/lib/agentdock/service'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const denied = observerAccess(request, true)
  if (denied) return denied
  const snapshot = await refreshObservation()
  return NextResponse.json(snapshot, { status: snapshot.source.status === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
