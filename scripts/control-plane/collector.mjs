import { readTaskFiles, probeRuntime, observerSettings } from '../../src/lib/agentdock/adapter.ts'
import { ObservationStore } from '../../src/lib/agentdock/store.ts'
import { MonitorStore } from '../../src/lib/agentdock/monitor-store.ts'
import { collectRuntimeMonitor } from '../../src/lib/agentdock/runtime-monitor.ts'

const settings = observerSettings()
const store = new ObservationStore(settings.databasePath, settings.key)
const monitorStore = new MonitorStore(settings.databasePath, settings.key)
let stopped = false
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true })
console.log('AgentDock observer: read-only task files + loopback health; interval 15 seconds')
while (!stopped) {
  try {
    if (process.env.MC_RUNTIME_MONITOR_DISABLED !== '1') {
      const monitor = await collectRuntimeMonitor()
      if (monitor.capabilities.some(capability => capability.id !== 'agentdock' && capability.status === 'ok')) monitorStore.save(monitor)
      else monitorStore.fail('运行时只读采集不可用，保留上次 Agent 快照。', new Date().toISOString(), monitor.capabilities)
    }
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
monitorStore.close()
