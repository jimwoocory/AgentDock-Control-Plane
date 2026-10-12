# Daily workspace and P1 governance implementation plan

> For agentic workers: use subagent-driven-development task by task; user has authorized this whole route, implementation, existing private publication and GitHub sync.

Goal: organize explicit real company projects, improve everyday task visibility, and deliver human approval records, decisions and artifact registry in the existing private Site.

Architecture: existing readonly collector -> D1 snapshot; separate project profiles/links and append-only governance records -> authenticated React UI + readonly MCP. No runtime control.

Tech Stack: React19, ESM Worker, D1 SQLite, existing esbuild/Drizzle, Node test. No new dependencies.

Spec: docs/superpowers/specs/2026-10-12-daily-governance-design.md.

## Global Constraints

- No AgentDock Core/source/config/session/collector changes. Never commit real task bodies, secrets or runtime databases.
- Private owner-only audience and same-origin user write authentication stay intact. Service keys cannot write management records.
- Only explicit source project evidence is aliased; unknown remains unassigned. Local metadata does not dispatch workers.
- Approval is an auditable management record; does not stop/advance runtime. Real decisions/approvals are never invented.
- Windows compatible; no new dependencies; old state and five MCP tools remain compatible, MCP stays readonly.
- Business code in isolated codex/CP-09-daily-governance worktree. No main code edits. Tests/commit/review/main reverify before DONE.

### Task 1: CP-09 backend project organization and P1 records

Files: cloud/worker/server.mjs; new cloud/worker/governance.mjs and project-management.mjs as useful; cloud/db/schema.ts; new additive cloud/drizzle migration and metadata; cloud/tests/backend.test.mjs; new cloud/tests/governance.test.mjs. Reuse test SQLite setup or extract cloud/tests/helpers.mjs.

Consumes: existing state(db), validateGraph, readAccess/writeAccess, DB prepare/batch, snapshot and cp_control revision.

Produces: /api/state adds projectLinks [{sourceProjectId,targetProjectId,reason}], approvals [{id,projectId,nodeId,report,artifactIds,contextDigest,status,createdAt,reviewedAt,reviewComment,isStale,actorId,reviewerId}], decisions [{id,projectId,nodeId,title,choice,reason,alternatives,createdAt,actorId}], artifacts [{id,projectId,nodeId,name,version,description,referenceType,reference,sha256,agentId,archived,createdAt,actorId}]. Project profile owner/goal/phase/status/archived fields merged for all project kinds.

Write contracts:
POST /api/project-links {sourceProjectId,targetProjectId: string|null,reason}; target null revokes relation; current graph must remain valid, explicit local overrides win; no source alias chains.
PATCH /api/projects/:encodedId {owner?,goal?,phase?,status?,archived?}; status active/paused/completed; these are project management fields.
POST /api/approvals {projectId,nodeId,report,artifactIds:[]}; optional expected contextDigest may be sent by UI; response request with current digest. POST /api/approvals/:id/review {decision:'approved'|'rejected'|'changes_requested',comment}; pending only, reject stale with409, actor from platform header.
POST /api/decisions {projectId,nodeId:null|string,title,choice,reason,alternatives:[]}; immutable records.
POST /api/artifacts {projectId,nodeId:null|string,name,version,description,referenceType:'url'|'path',reference,sha256:'',agentId:''}; PATCH /api/artifacts/:id {archived:boolean}; no file upload or filesystem read.
MCP adds list_approvals/list_decisions/list_artifacts with existing projectId/taskId/limit schema; taskId uses rawsourceID for source nodes and local ID for local; get_task returns source task or local node plus associated records. project filter works for history and governance. Discovery now8 readonly tools.

- [ ] Write meaningful failing tests using synthetic data; example:
```js
const req = await createApproval({projectId:p.id,nodeId:a.id,report:'Synthetic acceptance',artifactIds:[]});
assert.equal(req.status,'pending');
assert.equal((await review(req.id,{decision:'approved',comment:'Fixture reviewed'},service)).status,401);
assert.equal((await review(req.id,{decision:'approved',comment:'Fixture reviewed'},user)).status,200);
assert.equal((await review(req.id,{decision:'rejected',comment:'Duplicate'},user)).status,409);
await patchNode(a.id,{acceptanceCriteria:['Changed']});
assert.equal((await state()).approvals[0].isStale,true);
```
- [ ] Verify red; implement bounded modules with additive migrations, transaction/CAS review/alias behavior, server-authored audit actors, required fields. Reject unknown fields to prevent spoofing.
- [ ] Test old DB upgraded with old snapshots/nodes preserved, alias unlink/project refs safety, source fields unchanged, stale request review, competing review, unauthorized writes, foreign artifact refs, unique versions, javascript URLs, >limit inputs, project scoped history/MCP.
- [ ] Run npm test and npm run build from cloud; commit only owned files; write report and interface notes. Preserve source reader and original source contents.

### Task 2: CP-10 daily workspace and governance UI

Files: cloud/ui/app.jsx; new cloud/ui/governance.jsx, daily-model.mjs, api.mjs as useful; cloud/ui/model.mjs/labels.mjs/styles.css; cloud/tests/ui-model.test.mjs or daily-model.test.mjs. Do not change backend.

Consumes: exact Task1 endpoints/state fields; profiles and alias link contract; approvals stale/status/report/artifactIds; decisions and artifacts arrays. Actor identity never submitted in forms.

Produces: Chinese daily task filters current/all/blocked/unassigned/history plus project statistics rooted at task kind, source updated/management activity sort; graph/ancestor search still works. Old/stale Agent records collapsed with explicit count and capability gaps. Workspace tabs 任务/人工审批/决策日志/产物; authenticated forms create records, review pending (意见required), stale warns and blocks review; artifact archive/restore. Selected task and project context drives governance filters; show full report and evidence refs. Project profile edit and explicit source alias bind/revoke UI; clear user errors and save states, background polling preserves unsaved drafts. Login401/403提示从Sites重新打开，no bypass.

- [ ] Write failing pure model tests; example:
```js
assert.deepEqual(filterDailyNodes(nodes,'current').map(n=>n.id),['active','blocked','unknown']);
assert.equal(projectTaskStats(nodes).total,3); // source steps do not inflate root tasks
assert.deepEqual(filterDailyNodes(nodes,'history').map(n=>n.id),['completed']);
```
- [ ] Implement components using existing palette, accessible labelled controls and semantically separate local review/source status. Keep all terminal tasks reachable in历史/全部.
- [ ] Validate blank inputs before send, render empty and HTTP errors, allow source details/events when original task selected; https artifacts use safe links, paths text only.
- [ ] Run npm test/npm run build; check no client runtime execution/approval MCP calls; commit owned files and provide report incl UI selectors for browser acceptance.

### Task 3: CP-11 integration, real organization, private production verification

Files: docs/control-plane/** and source mirror cloud/**; no Core edits. Controller handles this task, authorized publication and repository sync.

Consumes: reviewed backend/UI commits. Produces: main verified implementation, original private Site publication, genuine browser evidence and real-source readonly proofs.

- [ ] Whole branch review; fix mandatory findings through implementer, run final tests/build, merge main then reverify and mark respective tasks DONE.
- [ ] Open existing Sites source using official helper and fresh credential; mirror reviewed cloud source only, additive migrations. Source Git verified exact SHA, official package with bundled Node24, Git Bash and TAR_OPTIONS force-local; native private publish; await succeeded.
- [ ] Browser use legitimate existing login: apply four explicit source project links, preserve other versions and unknown; read back real counts/MCP after sync. Do not invent source owner/deps/agent.
- [ ] On labelled local acceptance project create synthetic artifact+decision+approval, user-agent browser verification uses test-only pending/review actions; no real source acceptance is approved. Refresh persists, stale version tested automated.
- [ ] Compare119source hashes before/after, fresh source, capabilities and private access, readonly discovery; actualMCP query original tools and new ones only when available.
- [ ] Record evidence, limitations and recoverable alias mappings; GitHub main push+remote SHA; show deployed result. Maintain ledger across compaction; no false completion.
