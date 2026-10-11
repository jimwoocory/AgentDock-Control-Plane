import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'

export function observerAccess(request: Request, write = false) {
  const auth = requireRole(request, write ? 'operator' : 'viewer')
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  // The host observer is explicitly local to the primary workspace, not a tenant-wide runtime feed.
  if (auth.user.workspace_id !== 1) return NextResponse.json({ error: '仅主工作区可访问本机观察器' }, { status: 403 })
  return null
}

export async function readLocalBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('请求正文为空')
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 16384) { await reader.cancel(); throw new Error('请求正文过大') }
    chunks.push(value)
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求正文格式无效')
  return body
}
