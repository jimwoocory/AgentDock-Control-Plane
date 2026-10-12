# CP-06 implementation contract

The UI and collector consume the API contract below. Root alone creates/publishes the Site and configures secrets. Code changes remain in this isolated worktree until reviewed and tested. Persist Site identity immediately; never create another Site on retry. Worker contains no arbitrary proxy or execution command.

## Interfaces

GET /api/state returns `{projects,nodes,tasks,agents,capabilities,history,source}`. Projects `{id,name,owner,goal,archived}`; GraphNode `{id,projectId,parentId,kind,title,status,priority,owner,agentId,acceptanceCriteria,dependencies,origin,sourceTaskId,missing}`. IDs are strings. node kind epic/feature/task/subtask, priority low/medium/high/urgent, origin local/agentdock. Source `{machine,sourceKey,capturedAt,receivedAt,stale,taskCount,warnings,taskReadOK}`. Agents follow existing P0 observed-agent fields: id/label/runtime/source/status/rawStatus/taskId/currentAction/lastActivityAt/lastHeartbeatAt/observedAt/stale/present. History `{id,kind,nodeId,summary,createdAt}`. Tasks `{id,title,status,phase,project,updated_at,summary,conditions,steps,events,final_review}` are readonly.

POST /api/projects `{name,owner,goal}`; POST /api/nodes full local GraphNode input minus id/origin; PATCH /api/nodes/:id metadata or local fields. All writes use authenticated browser identity, exact same Origin and ≤16KiB request. Source business fields and source step parent fixed. After writes UI reloads GET /api/state; JSON errors `{error}` with non-2xx status.

POST /api/ingest accepts `{sourceKey:'company:PC-20251130TKZA',machine:'PC-20251130TKZA',capturedAt,taskReadOK,tasks,agents,capabilities,warnings}` with platform service access and `X-CP-Collector-Key`. Key never enters browser. ≤4MiB, ≤2000 tasks, ≤100 agents; source validation and out-of-order rejection. Collector maintains own retries with 20-second wait after each cycle, each request ≤20 seconds. Readback with same scoped service credentials may use /api/state. Runtime statuses only actual lifecycle evidence; no invented heartbeat.

## Ordered execution

- [ ] Write failing backend tests: missing key/identity, bad source, source writes, invalid/cyclic/cross-project tree, persistence, MCP write rejection.
- [ ] Implement schema-only migration, source snapshot projection and safe management model; tests green.
- [ ] Implement independent UI and collector in their own scopes; respective tests and reviews.
- [ ] Review whole Worker/bridge, fix blockers, privately publish exact built source via Sites helper.
- [ ] Configure own protected bridge secrets, upload true company snapshot, query readback, compare source hashes; only this live gate releases full-data use.
- [ ] Verify actual graph and management operations in isolated five-project fixture and browser, verify actual MCP protocol reads and denied writes.
- [ ] Integrate and reverify, preserve production background bridge; provide actual private URL and platform MCP connection details without credential values.
