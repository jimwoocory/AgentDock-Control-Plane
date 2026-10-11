'use client'

import { useState } from 'react'
import type { GraphNode } from '@/lib/agentdock/graph-types'

function dependencyAttachment(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x; const dy = to.y - from.y
  const distance = Math.hypot(dx, dy)
  const boundary = Math.min(dx ? 80 / Math.abs(dx) : Infinity, dy ? 34 / Math.abs(dy) : Infinity)
  // Keep the arrow outside the filled target rectangle, including dependencies in the same column.
  const target = boundary + 4 / distance
  return { x1: from.x + 80 + boundary * dx, y1: from.y + 34 + boundary * dy,
    x2: to.x + 80 - target * dx, y2: to.y + 34 - target * dy }
}

export function TaskGraph({ nodes, selectedId, onSelect }: { nodes: GraphNode[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [zoom, setZoom] = useState(1)
  const columns = ['epic', 'feature', 'task', 'subtask'] as const
  const placed = new Map<string, { x: number; y: number }>()
  columns.forEach((kind, column) => nodes.filter(node => node.kind === kind).forEach((node, row) => placed.set(node.id, { x: 20 + column * 205, y: 45 + row * 86 })))
  const height = Math.max(240, ...[...placed.values()].map(point => point.y + 76))
  const width = 850
  return <div className="max-h-[500px] overflow-auto rounded-md border border-border bg-[#0b101a]" aria-label="任务关系图"><div className="sticky left-0 top-0 z-10 flex justify-end gap-1 bg-[#0b101a]/90 p-1"><button type="button" aria-label="缩小图谱" className="rounded border border-slate-600 px-2 text-xs text-slate-200" onClick={() => setZoom(value => Math.max(.6, value - .2))}>−</button><span className="px-1 text-xs text-slate-300">{Math.round(zoom * 100)}%</span><button type="button" aria-label="放大图谱" className="rounded border border-slate-600 px-2 text-xs text-slate-200" onClick={() => setZoom(value => Math.min(1.8, value + .2))}>+</button></div>
    <svg width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} className="min-w-full" role="img" aria-label="任务图谱 SVG">
      <defs><marker id="dependency-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" /></marker></defs>
      {nodes.map((node, index) => {
        const point = placed.get(node.id)!; const x = point.x; const y = point.y
        return <g key={`links-${node.id}`}>{node.parentId && placed.has(node.parentId) && (() => { const parent = placed.get(node.parentId)!; return <line x1={x} y1={y + 34} x2={parent.x + 160} y2={parent.y + 34} stroke="#64748b" strokeWidth="2" strokeDasharray="5 4" /> })()}{node.dependencies.filter(id => placed.has(id)).map(dependency => { const prerequisite = placed.get(dependency)!; return <line key={dependency} {...dependencyAttachment(prerequisite, point)} stroke="#f59e0b" strokeWidth="2" markerEnd="url(#dependency-arrow)" /> })}</g>
      })}
      {nodes.map(node => { const { x, y } = placed.get(node.id)!; const active = node.id === selectedId; return <g key={node.id} onClick={() => onSelect(node.id)} className="cursor-pointer" role="button" aria-label={node.title} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') onSelect(node.id) }}><rect x={x} y={y} width="160" height="68" rx="7" fill={active ? '#1d4ed8' : node.origin === 'agentdock' ? '#334155' : '#172033'} stroke={node.origin === 'agentdock' ? '#94a3b8' : '#38bdf8'} /><text x={x + 10} y={y + 21} fill="white" fontSize="10">{node.kind.toUpperCase()}</text><text x={x + 10} y={y + 43} fill="white" fontSize="13">{node.title.slice(0, 18)}</text><text x={x + 10} y={y + 59} fill="#cbd5e1" fontSize="10">{node.status}</text></g> })}
      <text x="20" y="22" fill="#94a3b8" fontSize="11">列：Epic → Feature → Task → Subtask　虚线：父子　橙色箭头：前置依赖 → 后续任务</text>
    </svg>
  </div>
}
