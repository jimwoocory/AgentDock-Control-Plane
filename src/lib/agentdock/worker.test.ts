// @vitest-environment node
import { it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

it.skipIf(process.platform !== 'win32')('parses Windows PowerShell 5.1 startup and stop scripts', async () => {
  for (const name of ['start', 'stop', 'processes']) {
    const filename = path.resolve('scripts/control-plane', `${name}.ps1`).replace(/'/g, "''")
    const result = await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command',
      `$errors=$null; [System.Management.Automation.Language.Parser]::ParseFile('${filename}', [ref]$null, [ref]$errors) | Out-Null; if ($errors.Count) { throw 'Script parse failed' }; Write-Output 'parsed'`], { timeout: 10000 })
    expect(result.stdout).toContain('parsed')
  }
})

it('runs the actual collector under Node and persists a real file observation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cp-worker-test-'))
  try {
    await mkdir(path.join(root, 'source', 'tasks'), { recursive: true })
    await writeFile(path.join(root, 'source', 'tasks', 'tsk_3333333333333333.json'), JSON.stringify({ schema_version: 1,
      id: 'tsk_3333333333333333', title: 'Worker fixture', status: 'active', phase: 'execute',
      created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z', steps: [], events: [], conditions: [] }))
    const result = await promisify(execFile)(process.execPath, ['scripts/control-plane/collector.mjs', '--once'], {
      env: { ...process.env, AGENTDOCK_HOME: path.join(root, 'source'), AGENTDOCK_OBSERVER_DB: path.join(root, 'observer.db'), AGENTDOCK_HEALTH_URL: 'http://127.0.0.1:1/healthz' },
      timeout: 10000,
    })
    expect(result.stdout).toContain('task-count=1 source=ok runtime=unreachable')
  } finally { await rm(root, { recursive: true, force: true }) }
})
