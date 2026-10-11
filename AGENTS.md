# AgentDock Control Plane P0

这是 Mission Control v2.3.0 的独立本地派生项目。用户已批准部署和 AgentDock 真实只读接入。

读取 docs/control-plane/status.md、roadmap.md、task-board.md、development-plan.md、needs-decision.md 后实施。原有上游文档保留。

只领取 READY 任务，唯一 Owner，明确 Allowed Paths；业务实现使用 codex/<task-id>-<slug> 和独立 worktree。禁止修改 AgentDock Core 或写入其数据目录。不得提交凭据、真实任务内容、运行数据库或依赖缓存。任务实现、测试、提交、合入 main 并复验后才标 DONE。

范围：本机 localhost 完整 P0；显示项目、任务层级与依赖图、真实 Agent 观察状态和历史；创建项目与本地任务树、优先级/负责人/验收条件/归属均在控制台独立存储。AgentDock 来源任务与步骤保持只读。P0 不向 AgentDock 发任何写操作，不自动执行任务。状态未知不得猜测，不能把 Agent 自动 review 视为人工批准。
