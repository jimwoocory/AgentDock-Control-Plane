# Task board

| ID | Status | Owner | Allowed Paths | Acceptance |
| --- | --- | --- | --- | --- |
| CLOUD-API | IN_PROGRESS | root | worker/**, tests/backend*, scripts/build.mjs, package*, drizzle/**, .openai/**, docs/**, AGENTS.md, README.md | Private deployment/119task readback passed; OAuth MCP client call pending |
| CLOUD-UI | IN_PROGRESS | cloud_ui | ui/**, tests/ui* | Dashboard/graph/detail/Agents/history implemented;8model tests pass; browser MFA and interaction gate pending |
| CLOUD-COLLECTOR | DONE | root (integration) | bridge/**, tests/collector* |12tests pass;119hashes unchanged; real source sync, authorized own startup,1process/restart verified; source committed/merged and main31tests/build pass |

Task branch merged main a9862b1; main31tests/build reverified. Deployment alone does not satisfy remaining browser/client P0 gates.
