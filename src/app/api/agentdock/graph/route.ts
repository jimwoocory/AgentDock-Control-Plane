import { NextResponse } from 'next/server'
import { observerAccess, readLocalBody } from '@/lib/agentdock/api'
import { observerSettings } from '@/lib/agentdock/adapter'
import { GraphStore } from '@/lib/agentdock/graph-store'
import type { NodeInput, NodePatch } from '@/lib/agentdock/graph-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
function open() { const settings = observerSettings(); return new GraphStore(settings.databasePath, settings.key) }
export async function GET(request: Request) {
  const denied = observerAccess(request); if (denied) return denied
  const store = open(); try { return NextResponse.json(store.snapshot()) } finally { store.close() }
}
export async function POST(request: Request) {
  const denied = observerAccess(request, true); if (denied) return denied
  try { const body = await readLocalBody(request); const store = open(); try { return NextResponse.json({ id: store.create(body as unknown as NodeInput) }, { status: 201 }) } finally { store.close() } }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '节点格式无效' }, { status: 400 }) }
}
export async function PATCH(request: Request) {
  const denied = observerAccess(request, true); if (denied) return denied
  try { const { id, ...patch } = await readLocalBody(request); if (typeof id !== 'string') throw new Error('节点 ID 无效'); const store = open(); try { store.update(id, patch as NodePatch); return NextResponse.json({ ok: true }) } finally { store.close() } }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '节点格式无效' }, { status: 400 }) }
}
