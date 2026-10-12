import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeProbeResult } from './probe-result.mjs'

const task = { id: 'tsk_0123456789abcdef', title: 'Synthetic fixture', status: 'active', updated_at: '2026-10-12T00:00:00Z' }
const success = tasks => ({ status: 'success', result: { structuredContent: { action: 'list', count: tasks.length, tasks } } })

test('retains verified operational fields and discards task body and secrets', () => {
  const result = normalizeProbeResult(success([{ ...task, goal: 'private goal', secret: 'private secret' }]))
  assert.equal(result.state, 'ready')
  assert.deepEqual(result.tasks, [task])
  assert.equal(JSON.stringify(result).includes('private'), false)
})
test('native success without a Sites success envelope is not hosted-read evidence', () => {
  assert.equal(normalizeProbeResult({ structuredContent: { tasks: [task] } }).state, 'failed')
})
test('platform failure cannot be overridden by successful-looking provider data', () => {
  const result = normalizeProbeResult({ ...success([task]), status: 'error', error: { code: 'permission_denied' } })
  assert.equal(result.state, 'failed')
  assert.equal(result.code, 'permission_denied')
  assert.deepEqual(result.tasks, [])
})
test('provider isError remains failure within a successful transport envelope', () => {
  const value = success([task]); value.result.isError = true
  assert.equal(normalizeProbeResult(value).state, 'failed')
})
test('valid empty source is distinct from failure', () => {
  assert.equal(normalizeProbeResult(success([])).state, 'empty')
})
test('missing or malformed task array is failure, not empty success', () => {
  for (const tasks of [undefined, null, {}, 'tasks']) assert.equal(normalizeProbeResult({ status: 'success', result: { structuredContent: { action: 'list', tasks } } }).state, 'failed')
})
test('one-task probe rejects over-fetching', () => {
  assert.equal(normalizeProbeResult(success([task, task])).state, 'failed')
})
test('bad IDs, blank or oversized titles, invalid times and statuses are rejected', () => {
  for (const patch of [{ id: 'other' }, { title: '' }, { title: 'x'.repeat(1001) }, { updated_at: 'invalid' }, { status: {} }, { status: '' }]) {
    assert.equal(normalizeProbeResult(success([{ ...task, ...patch }])).state, 'failed')
  }
})
test('a provider mutation result is never accepted as task list evidence', () => {
  const value = success([task]); value.result.structuredContent.action = 'create'
  assert.equal(normalizeProbeResult(value).state, 'failed')
})
test('reauthentication is accepted only from a platform failure code', () => {
  assert.equal(normalizeProbeResult({ status: 'error', error: { code: 'reauthentication_required' } }).code, 'reauthentication_required')
  assert.equal(normalizeProbeResult({ status: 'success', result: { content: [{ type: 'text', text: 'please reauthenticate' }] } }).code, 'invalid_result')
})
