import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

describe('P0 runtime isolation', () => {
  afterEach(() => vi.unstubAllEnvs())
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('blocks %s to upstream task execution APIs even with a cookie', async method => {
    vi.stubEnv('MC_AGENTDOCK_P0', '1')
    const { proxy } = await import('../../proxy')
    const response = proxy(new NextRequest('http://127.0.0.1:4310/api/tasks', { method, headers: { cookie: 'mc_session=test' } }))
    expect(response.status).toBe(403)
  })
  it('keeps local project metadata writes behind normal authentication', async () => {
    vi.stubEnv('MC_AGENTDOCK_P0', '1')
    const { proxy } = await import('../../proxy')
    expect(proxy(new NextRequest('http://127.0.0.1:4310/api/agentdock/projects', { method: 'POST' })).status).toBe(401)
  })
  it.each(['POST', 'PATCH'])('keeps %s to the graph behind normal authentication', async method => {
    vi.stubEnv('MC_AGENTDOCK_P0', '1')
    const { proxy } = await import('../../proxy')
    expect(proxy(new NextRequest('http://127.0.0.1:4310/api/agentdock/graph', { method })).status).toBe(401)
    expect(proxy(new NextRequest('http://127.0.0.1:4310/api/agentdock/agents', { method })).status).toBe(403)
  })
  it('takes the default landing page to the observer panel in P0', async () => {
    vi.stubEnv('MC_AGENTDOCK_P0', '1')
    const { proxy } = await import('../../proxy')
    const request = new NextRequest('http://127.0.0.1:4310/')
    const response = proxy(request)
    expect(response.headers.get('location')).toBe(new URL('/agentdock', request.url).href)
  })
})
