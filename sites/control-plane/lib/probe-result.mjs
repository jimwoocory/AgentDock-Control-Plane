const PLATFORM_CODES = new Set(['reauthentication_required', 'permission_denied', 'rate_limited', 'unavailable'])
const failed = code => ({ state: 'failed', code, count: 0, tasks: [] })
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Normalize a real Sites connector response. Native reads and fixtures do not establish hosted access. */
export function normalizeProbeResult(envelope) {
  if (!object(envelope) || envelope.status !== 'success') {
    const code = object(envelope?.error) ? envelope.error.code : null
    return failed(PLATFORM_CODES.has(code) ? code : 'connector_unavailable')
  }
  const provider = envelope.result
  if (!object(provider) || provider.isError === true) return failed('provider_error')
  const source = provider.structuredContent
  if (!object(source) || source.action !== 'list' || !Array.isArray(source.tasks) || source.tasks.length > 1) return failed('invalid_result')
  const tasks = []
  for (const value of source.tasks) {
    if (!object(value) || typeof value.id !== 'string' || !/^tsk_[a-f0-9]{16}$/.test(value.id)
      || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 1000
      || typeof value.status !== 'string' || !value.status.trim() || value.status.length > 64
      || typeof value.updated_at !== 'string' || value.updated_at.length > 128 || !Number.isFinite(Date.parse(value.updated_at))) return failed('invalid_result')
    tasks.push({ id: value.id, title: value.title, status: value.status, updated_at: value.updated_at })
  }
  return { state: tasks.length ? 'ready' : 'empty', code: null, count: tasks.length, tasks }
}
