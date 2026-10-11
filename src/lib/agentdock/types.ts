export interface SourceTask {
  id: string
  title: string
  goal: string
  project: string | null
  device: string | null
  status: string
  phase: string
  created_at: string
  updated_at: string
  summary: string
  steps: Array<{ id: string; title: string; phase: string; status: string; updated_at: string }>
  conditions: Array<{ id: string; text: string }>
  events: Array<{ type: string; summary: string; created_at: string }>
  final_review: { status: string; summary: string; verified_facts: string[] } | null
}

export interface ObservedTask extends SourceTask {
  sourceKey: string
  projectId: number | null
  projectOrigin: 'source' | 'manual' | 'unassigned'
  present: boolean
  firstSeenAt: string
  lastSeenAt: string
}

export interface Project {
  id: number
  name: string
  owner: string
  goal: string
}

export interface Observation {
  id: number
  taskId: string
  status: string
  phase: string
  sourceUpdatedAt: string
  observedAt: string
}

export interface ObserverSnapshot {
  source: {
    key: string
    transport: 'filesystem-readonly'
    status: 'ok' | 'partial' | 'unavailable' | 'never'
    observedAt: string | null
    attemptedAt: string | null
    stale: boolean
    runtime: { status: 'healthy' | 'unreachable' | 'unknown'; version: string | null; checkedAt: string | null }
    warnings: string[]
    sessions: { status: 'not-collected'; description: string }
  }
  projects: Project[]
  tasks: ObservedTask[]
  history: Observation[]
}
