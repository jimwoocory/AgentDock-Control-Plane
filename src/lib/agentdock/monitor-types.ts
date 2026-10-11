export type AgentStatus = 'Idle' | 'Planning' | 'Running' | 'Waiting Approval' | 'Blocked' | 'Failed' | 'Completed' | 'Unknown'
export interface ObservedAgent {
  id: string
  label: string
  runtime: 'codex' | 'claude' | 'agentdock'
  source: string
  status: AgentStatus
  rawStatus: string
  taskId: string | null
  currentAction: string | null
  lastActivityAt: string | null
  lastHeartbeatAt: string | null
  observedAt: string
  stale: boolean
  present: boolean
}
export interface MonitorCapability {
  id: string
  label: string
  status: 'ok' | 'unavailable' | 'error'
  description: string
  observedAt: string | null
}
export interface AgentEvent { id: number; agentId: string; status: AgentStatus; action: string; observedAt: string }
export interface AgentMonitorSnapshot {
  capabilities: MonitorCapability[]
  agents: ObservedAgent[]
  events: AgentEvent[]
  collectedAt: string | null
  stale: boolean
  warnings: string[]
}
