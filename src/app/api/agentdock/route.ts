import { NextResponse } from 'next/server'
import { observerAccess } from '@/lib/agentdock/api'
import { openObservationStore } from '@/lib/agentdock/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const denied = observerAccess(request)
  if (denied) return denied
  const store = openObservationStore()
  try { return NextResponse.json({ ...store.snapshot(), validationFixture: process.env.MC_P0_VALIDATION === '1' }, { headers: { 'Cache-Control': 'no-store' } }) }
  finally { store.close() }
}
