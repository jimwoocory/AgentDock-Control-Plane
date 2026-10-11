# 任务板

| ID | 任务 | 状态 | Owner | 依赖 | Allowed Paths | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| CP-01 | 本地运行与真实只读观察面板 | DONE | root | 上游固定基线 | src/lib/agentdock/**, src/app/api/agentdock/**, src/lib/db.ts, src/lib/config.test.ts, src/proxy.ts, scripts/control-plane/**, docs/control-plane/**, docs/superpowers/plans/** | P0 Gate、提交、main复验已通过，见 verification.md |
| CP-01-UI | 中文观察界面与本地项目关联 | DONE | chatgpt_product | CP-01 类型契约已提供 | src/components/agentdock/**, src/app/agentdock/** | UI测试、真实浏览器、随CP-01集成并复验已通过 |

Source data 与凭据不得加入 Git。控制台五个初始项目只是管理容器，没有真实数据的项目显示空；无 project 字段的真实任务放入未归属，人工关联独立保存。

| CP-02 | 完整 P0 本地任务模型、层级与依赖 API | DONE | root | CP-01 | src/lib/agentdock/**, src/app/api/agentdock/**, src/proxy.ts, scripts/control-plane/**, docs/control-plane/**, docs/superpowers/** | 创建树、循环拒绝、跨项目隔离、50任务与持久化、来源哈希不变、审查及main复验通过，见 verification.md |
| CP-02-UI | Task Graph、节点编辑与 Agent 监控界面 | DONE | p0_full_ui | CP-02 类型合同 | src/components/agentdock/**, src/app/agentdock/** | 浏览器创建四层树/查看依赖/Agent与历史；5项目50 Task可管理；审查与main生产复验通过 |
| CP-03 | AgentDock 持续只读 Agent/Session 监控 | DONE | p0_runtime | 已批准P0，实际只读能力调查 | src/lib/agentdock/runtime-*, src/lib/agentdock/monitor-*, scripts/control-plane/**, docs/control-plane/** | Codex真实生命周期状态、Claude空列表、AgentDock ACP缺口明确、过期Unknown、持续同步、无Core写入；审查与main复验通过 |


