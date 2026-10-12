# 任务板

当前云端扩展（用户已批准，2026-10-12）：

用户已批准独立只读采集器替代方案以及采集器自己的 Windows 登录启动项。CP-06 采用私有 Site 服务入口，不依赖 BYOP 资格工具。

| ID | 任务 | 状态 | Owner | 依赖 | Allowed Paths | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| CP-06 | 同步独立私有云端 P0 和公司只读采集器源码 | IN_PROGRESS | root | 云端 main 已提交并通过31测试、私有发布成功、真实读取通过 | cloud/**, docs/control-plane/**, README.md | 只同步 Git 跟踪源码，不含凭据、数据、缓存；cloud 测试构建、复审、main复验及远程推送；浏览器MFA/实际MCP调用保留待验收 |

| ID | 任务 | 状态 | Owner | 依赖 | Allowed Paths | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| CP-04 | 公司私有 Site 资格与真实只读验证 | BLOCKED | root | 用户确认公司目标；Sites 插件资格接口 | sites/control-plane/**, docs/control-plane/**, docs/superpowers/** | 原生只读及10项离线校验通过；资格工具缺失，实际私有托管登录/读取/刷新未验证，不标DONE |
| CP-05 | 完整云端 P0 与只读 MCP | BACKLOG | — | CP-04 托管 Gate | 后续 Site checkout 的 app/**, components/**, db/**, migrations/**, .openai/**, docs/control-plane/** | D1/任务图/Agent与历史、5项目50任务、私有授权和实际MCP调用、审查与main复验 |

| ID | 任务 | 状态 | Owner | 依赖 | Allowed Paths | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| CP-01 | 本地运行与真实只读观察面板 | DONE | root | 上游固定基线 | src/lib/agentdock/**, src/app/api/agentdock/**, src/lib/db.ts, src/lib/config.test.ts, src/proxy.ts, scripts/control-plane/**, docs/control-plane/**, docs/superpowers/plans/** | P0 Gate、提交、main复验已通过，见 verification.md |
| CP-01-UI | 中文观察界面与本地项目关联 | DONE | chatgpt_product | CP-01 类型契约已提供 | src/components/agentdock/**, src/app/agentdock/** | UI测试、真实浏览器、随CP-01集成并复验已通过 |

Source data 与凭据不得加入 Git。控制台五个初始项目只是管理容器，没有真实数据的项目显示空；无 project 字段的真实任务放入未归属，人工关联独立保存。

| CP-02 | 完整 P0 本地任务模型、层级与依赖 API | DONE | root | CP-01 | src/lib/agentdock/**, src/app/api/agentdock/**, src/proxy.ts, scripts/control-plane/**, docs/control-plane/**, docs/superpowers/** | 创建树、循环拒绝、跨项目隔离、50任务与持久化、来源哈希不变、审查及main复验通过，见 verification.md |
| CP-02-UI | Task Graph、节点编辑与 Agent 监控界面 | DONE | p0_full_ui | CP-02 类型合同 | src/components/agentdock/**, src/app/agentdock/** | 浏览器创建四层树/查看依赖/Agent与历史；5项目50 Task可管理；审查与main生产复验通过 |
| CP-03 | AgentDock 持续只读 Agent/Session 监控 | DONE | p0_runtime | 已批准P0，实际只读能力调查 | src/lib/agentdock/runtime-*, src/lib/agentdock/monitor-*, scripts/control-plane/**, docs/control-plane/** | Codex真实生命周期状态、Claude空列表、AgentDock ACP缺口明确、过期Unknown、持续同步、无Core写入；审查与main复验通过 |


