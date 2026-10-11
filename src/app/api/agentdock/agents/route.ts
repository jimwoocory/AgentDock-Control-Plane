import { NextResponse } from 'next/server'
import { observerAccess } from '@/lib/agentdock/api'
import { observerSettings } from '@/lib/agentdock/adapter'
import { MonitorStore } from '@/lib/agentdock/monitor-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const denied = observerAccess(request); if (denied) return denied
  const settings = observerSettings(); const store = new MonitorStore(settings.databasePath, settings.key)
  try { return NextResponse.json(store.snapshot(), { headers: { 'Cache-Control': 'no-store' } }) } finally { store.close() }
}
