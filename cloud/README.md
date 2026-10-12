# AgentDock Control Plane — private daily workspace

This independent Sites Worker receives bounded read-only snapshots from a separate collector on company PC-20251130TKZA. It never calls an AgentDock mutation or executes agent work. It exposes a private dashboard and read-only MCP at `/mcp`.

`npm install`, `npm test`, `npm run build`. Sites identity stays in `.openai/hosting.json`; migrations are schema-only Drizzle files. Runtime secrets and bridge configuration never enter Git. See docs/status.md for the current Gate.

The Chinese workspace keeps current, blocked, unassigned and historical tasks separate. Counts use root tasks rather than source steps. Source project aliases and project profiles are reversible management metadata; source files remain untouched. Old/absent Agent sessions are retained in a collapsed section, with freshness and capability gaps visible.

After selecting a task, use **人工审批**, **决策日志** or **产物**. Approval requests retain the opening task-content fingerprint and evidence references; reviewers record approve, reject or request-change with a required comment. Changed/stale source context cannot be reviewed. These are management acceptance records and do not pause or advance an AgentDock execution pipeline.

Artifacts register a version, originating task, optional agent declaration, HTTPS URL or local path, and optional SHA-256. Paths are text references: the Worker never reads or uploads a local file. Decisions and reviewed requests remain auditable history. All mutations require the existing same-origin authenticated Site user; service ingestion credentials remain read-only outside snapshot ingestion.

The existing five read-only MCP tools remain compatible. Discovery also exposes `list_approvals`, `list_decisions` and `list_artifacts`; `get_task` returns associated records and context digest. There are no MCP mutation tools. The additive `0001_daily_governance.sql` migration preserves the original schema and source snapshot. Apply migrations through the existing Sites deployment workflow, rather than ad hoc runtime DDL.

Canonical implementation and live verification: `docs/control-plane/daily-governance-verification.md` in the GitHub repository. No new package dependency, paid service subscription or artifact upload store is introduced in this release; existing ChatGPT/Sites account limits still apply.
