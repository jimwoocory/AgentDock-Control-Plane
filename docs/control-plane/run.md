# 本地运行

要求：Windows、Node.js >=22.18（建议24及以上）、pnpm。第一次构建需要网络下载依赖和上游字体。

在本仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/control-plane/start.ps1
```

打开 http://127.0.0.1:4310/agentdock。首次启动生成独立的本地 operator 账户，用户名和密码保存在 `.data/登录信息.txt`。服务仅绑定 loopback，不发布公网地址。

重新构建或停止：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/control-plane/start.ps1 -Build
powershell -ExecutionPolicy Bypass -File scripts/control-plane/stop.ps1
```

启动脚本只停止记录中 PID 与创建时间仍匹配的本项目 Node 进程，不关闭 AgentDock。关闭网页后后台采集仍然运行；停止脚本关闭 Web 和采集器。

默认只读 `%USERPROFILE%\.agentdock\tasks\tsk_*.json`，只访问 `http://127.0.0.1:8765/healthz`。不读取 DPAPI 凭据、不调用执行控制、不修改 Core 或来源文件。源数据、独立 SQLite 数据库、登录信息、进程记录和日志均在 Git 忽略目录内。

可在 `.env.local` 指定 `AGENTDOCK_HOME`、`AGENTDOCK_HEALTH_URL` 或 `AGENTDOCK_OBSERVER_DB`。数据库不得位于 AgentDock 来源目录（包含目录链接解析后的实际路径）。只允许本机 HTTP /healthz 地址。采集失败保留上次快照并标记过期，任务消失显示来源缺失而不是自动完成。

任务图可创建本地 Epic、Feature、Task、Subtask，选择父级、依赖、负责人、Agent 标识、优先级和验收条件；图/树视图可切换、缩放与搜索。父级与依赖分别建模，禁止循环依赖与跨项目关联。AgentDock 任务及步骤投影为只读节点，业务状态、标题与验收条件来自原始文件；管理字段只写本地 SQLite。来源步骤不能改父级，来源消失不等于完成。

Agent 监控与任务状态分开：优先以 Codex 已运行 app-server proxy 查询线程元数据；不可用时只读 Codex 本地 state_5.sqlite 和有界会话生命周期事件。只保留身份、状态与时间，过期或未来时间记录显示 Unknown，不输出或保存标题、提示词、预览或凭据。文件尾部读取的其他事件仅在内存中丢弃。本机已验证 Codex CLI 0.155.1 / state_5 格式，其他版本不兼容时明确报告能力不可用。Claude 使用官方 `agents --json`；本机 Windows 采用已安装的官方原生可执行文件。AgentDock 连接没有暴露 ACP Agent 会话接口，会明确显示不可用。来源未提供真实心跳与具体当前动作时显示未知，采集时间不冒充心跳。

后台采集每轮完成后等待 15 秒；网页也每 15 秒刷新。失败保留上次事实并标记过期，已消失的 Agent 显示当前未观察到。本地管理变更、任务来源观察、来源执行事件与 Agent 观察历史分开显示。最近的有效 Agent 记录优先展示，列表可滚动查看。

P0 禁用上游调度器和其他执行写 API；仅提供独立项目、任务图与归属管理。暂停、恢复、重试和人工审批执行链为 P1；本地优先级更新不会调度 Worker。

`scripts/control-plane/validate-p0.mjs` 仅对 127.0.0.1:4320 的独立验收实例操作，并要求 `MC_P0_VALIDATION=1`。它建立五个项目的 50 个 Task，加上 Epic/Feature/Subtask 共 65 个节点和 45 条依赖；不会向实际来源或正式观察数据库注入夹具。验收实例应使用单独的 `MISSION_CONTROL_DATA_DIR`、`AGENTDOCK_HOME` 与 `AGENTDOCK_OBSERVER_DB`。隔离测试可设 `MC_RUNTIME_MONITOR_DISABLED=1` 禁止探测本机运行时。

排错日志：`.data/web.err.log`、`.data/collector.err.log`、`.data/collector.out.log`。采集日志只记数量和状态。
