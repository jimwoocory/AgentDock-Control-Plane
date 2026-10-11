import { readTaskFiles, probeRuntime, observerSettings } from './adapter'
import { ObservationStore } from './store'

export function openObservationStore() {
  const settings = observerSettings()
  return new ObservationStore(settings.databasePath, settings.key)
}

export async function refreshObservation() {
  const settings = observerSettings()
  const store = new ObservationStore(settings.databasePath, settings.key)
  try {
    const runtime = await probeRuntime()
    try {
      const { tasks, errors } = await readTaskFiles(settings.sourceHome)
      const now = new Date().toISOString()
      if (errors.length) store.fail(errors.join('\n'), now, runtime, true)
      else store.save(tasks, now, runtime)
    } catch {
      store.fail('AgentDock 任务目录暂不可读取；保留最后成功快照。', new Date().toISOString(), runtime)
    }
    return store.snapshot()
  } finally { store.close() }
}
