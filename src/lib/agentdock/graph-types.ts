export type NodeKind = 'epic' | 'feature' | 'task' | 'subtask'
export type NodePriority = 'low' | 'medium' | 'high' | 'urgent'
export interface GraphNode {
  id: string
  projectId: number | null
  parentId: string | null
  kind: NodeKind
  title: string
  status: string
  priority: NodePriority
  owner: string
  agentId: string | null
  acceptanceCriteria: string[]
  dependencies: string[]
  origin: 'local' | 'agentdock'
  sourceTaskId: string | null
  missing: boolean
  updatedAt: string
}
export interface GraphChange { id: number; nodeId: string; action: string; summary: string; createdAt: string }
export interface GraphSnapshot { nodes: GraphNode[]; changes: GraphChange[] }
export interface NodeInput {
  projectId: number
  parentId?: string | null
  kind: NodeKind
  title: string
  status?: string
  priority?: NodePriority
  owner?: string
  agentId?: string | null
  acceptanceCriteria?: string[]
  dependencies?: string[]
}
export type NodePatch = Partial<NodeInput>
