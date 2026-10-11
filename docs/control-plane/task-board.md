# 任务板

| ID | 任务 | 状态 | Owner | 依赖 | Allowed Paths | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| CP-01 | 本地运行与真实只读观察面板 | IN_PROGRESS | root | 上游固定基线 | src/lib/agentdock/**, src/components/agentdock/**, src/app/agentdock/**, src/app/api/agentdock/**, src/lib/db.ts, src/proxy.ts, scripts/control-plane/**, docs/control-plane/**, docs/superpowers/plans/**, package.json | P0 Gate、提交、main复验 |

Source data 与凭据不得加入 Git。控制台五个初始项目只是管理容器，没有真实数据的项目显示空；无 project 字段的真实任务放入未归属，人工关联独立保存。

