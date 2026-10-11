import { readTaskFiles, probeRuntime, observerSettings } from '../../src/lib/agentdock/adapter.ts'
import { ObservationStore } from '../../src/lib/agentdock/store.ts'

const settings = observerSettings()
const store = new ObservationStore(settings.databasePath, settings.key)
let stopped = false
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true })
console.log('AgentDock observer: read-only task files + loopback health; interval 15 seconds')
while (!stopped) {
  try {
    const runtime = await probeRuntime()
    try {
      const { tasks, errors } = await readTaskFiles(settings.sourceHome)
      const now = new Date().toISOString()
      if (errors.length) store.fail(errors.join('\n'), now, runtime, true)
      else store.save(tasks, now, runtime)
      console.log(`${now} task-count=${tasks.length} source=${errors.length ? 'partial' : 'ok'} runtime=${runtime.status}`)
    } catch {
      store.fail('任务目录暂不可读取，保留旧快照。', new Date().toISOString(), runtime)
    }
  } catch (error) {
    console.error('Observer cycle failed:', error?.code || 'unknown')
  }
  if (process.argv.includes('--once')) break
  await new Promise(resolve => setTimeout(resolve, 15000))
}
store.close()
