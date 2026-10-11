# P0-A 历史验收证据

日期：2026-10-11。上游固定为 Mission Control v2.3.0；独立仓库与任务分支，不修改父工作区或 AgentDock Core。

实现提交 b6a9b8f；Windows 测试修正 26be675；PowerShell 5.1 编码及非交互探测修正 ccce111 / 0d4c614。所有实现与修正均经过独立复审并合入 main。

## main 验证

- `node node_modules/vitest/vitest.mjs run src/lib/agentdock src/components/agentdock src/lib/config.test.ts src/proxy.test.ts`：7 个文件，34 项测试通过。
- `MC_AGENTDOCK_P0=1 MC_DISABLE_RUNTIME_SCAN=1 NEXT_PUBLIC_GATEWAY_OPTIONAL=true node node_modules/next/dist/bin/next build --webpack`（环境变量以 PowerShell 设置）：生产构建通过，TypeScript 检查通过。随后仅修正启动脚本与脚本解析测试，生产 Next 源码未变。
- ESLint 范围检查：0 error / 3 warning（页面 effect 依赖与两处原生 fetch 风格提醒）；不宣称零警告。
- 采集器实际运行：task-count=7，source=ok，runtime=healthy（AgentDock 1.0.1）。后台每 15 秒采集，独立于浏览器轮询。
- 真实 API 与 AgentDock task_manage 只读 list 比较：7 个任务 ID、标题、状态与更新时间完全匹配。来源明确提供的项目字段自动建立容器，另保留五个空的预置项目；共 10 个项目容器。
- 未授权 GET /api/agentdock 为 401；上游执行 POST /api/tasks 为 403；跨来源本地项目写请求为 403。
- 实际创建临时本地项目、关联来源任务并读取核对成功；来源 project 字段保持不变。验收临时 metadata 已从本原型 SQLite 清理。
- 不发浏览器请求等待后，采集时间继续前进；真实后台同步已验证。
- 浏览器已完成登录、项目筛选、空项目隔离、搜索和任务详情/步骤/来源事件/观察历史检查；未发现控制台 error。
- PowerShell stop/start 实测成功；停止原型后 AgentDock /healthz 仍返回 200。重新启动后 Web 与采集器持续运行，Web 仅监听 127.0.0.1:4310。
- 比对采集前后的 7 个任务来源文件 SHA-256，变化数量为 0。凭据、源码修改与 Core 控制均未发生。

实际快照、源哈希、接口检查结果、浏览器截图与运行日志只保存在忽略的 `.data/` 内，不进入 Git。

## 已知边界

该 P0 展示任务及步骤层级，不代表任意依赖 DAG。运行时健康探测不能代表 Agent 正在运行；Agent 身份、心跳、命令会话持续观察未采集。审批、暂停、恢复和派发未开放。

上游固定版本仍为 Alpha；本机原型不发布公网。Next start 在上游 standalone 输出模式下产生提示，但当前完整仓库运行方式已通过实际 HTTP、页面资源和登录检查；未来制作独立分发包时需采用完整 standalone 打包流程。

复审的非阻塞建议：sourceKey 目前基于配置路径，未来切换同一来源的目录别名时需要统一物理路径身份，避免形成新来源视图。

---

# 完整 P0 验收证据

日期：2026-10-12。以下记录取代上述 P0-A 功能边界；历史记录保留用于追溯。

实现均在独立 `codex/CP-02-full-p0` 分支与 worktree 完成，经过独立代码审查并合入 main。主要提交：04f44ae（任务图模型/API）、b0a850b（图、树、编辑与监控界面）、443ee20（真实 Agent 只读监控）、5511709（测试隔离）、e073ba2（同列依赖箭头可见性）。

## 原始 P0 验收矩阵

| 原始要求 | 结果与证据 |
| --- | --- |
| 创建项目 | 通过：实际浏览器创建“P0 浏览器验收”，保存负责人及目标 |
| 创建任务树 | 通过：实际浏览器创建 Epic → Feature → Task → Subtask，刷新页面后保留 |
| 查看任务依赖 | 通过：实际浏览器创建后续任务并绑定前置任务；图与详情展示；循环、跨项目与非法父节点返回 400 |
| 查看 Agent 状态 | 通过：真实 Codex 只读生命周期记录已观察到 Running / Completed；过期记录明确变为 Unknown。Claude 官方只读列表当前为空 |
| 查看执行历史 | 通过：来源任务事件与 finalReview 只读展示；独立保存本地管理变更、来源观察与 Agent 状态变化 |
| 多项目互不混乱 | 通过：独立数据库创建 USVDS2、BMAD、Toonflow、Google-TTS、Research Lab，每项目 10 个 Task，共 50 个 Task、65 个节点、45 条依赖；逐项目隔离和持久化验证通过 |
| SQLite、持续同步、Windows 本地运行 | 通过：任务图及观察表独立保存；浏览器不发请求时，后台任务与 Agent 采集时间仍前进；本机生产 Web 与采集器运行 |
| 不修改 AgentDock Core | 通过：7 个来源任务文件 SHA-256 变化为 0；Core /healthz 返回 200；来源业务字段写入拒绝，执行控制 API 返回 403 |

多项目夹具通过实际 HTTP API 运行，不混入真实观察数据库。之后浏览器额外创建第六个验收项目及 5 个节点，验证四层树、依赖、urgent 优先级、刷新保留草稿和重新加载后的持久化。当前夹具合计 70 个节点，初始五项目的 50 个 Task 保留。生产页面接入 7 个真实任务及 38 个来源步骤，共 45 个来源节点。

## 验证命令与实测

- main 范围测试：`node node_modules/vitest/vitest.mjs run src/lib/agentdock src/components/agentdock src/lib/config.test.ts src/proxy.test.ts`，11 个文件、56 项测试通过。
- 本轮新增/修改的 TypeScript 文件 ESLint 范围检查为 0 error / 0 warning；main 生产 webpack 构建通过，TypeScript 检查通过，119 个页面生成完成。
- 最终生产构建的隔离浏览器页面已验证：四层结构、urgent 优先级及保存的前置依赖保留；同列依赖橙色箭头位于目标卡片外，实际截图 `.data/full-p0-fixture.png`。
- 用户随后要求打开页面时，自动浏览器导航被安全策略拦截，因此没有绕过该限制。原型已重新启动，并提供本机 URL 与登录文件供用户手动打开；启动后再次确认 Web /health 与 AgentDock /healthz 均为 200，7 个来源文件变化为 0，采集日志为 task-count=7/source=ok/runtime=healthy。隔离验收页面已结束，不作为用户的真实数据入口。
- 实际接口：未登录查询返回 401；外部 Origin 的本地管理写请求返回 403；来源状态和固定步骤父节点写入返回 400；上游任务执行 POST 返回 403。
- 本地优先级保存后读取一致，真实库验收用修改已恢复 medium，操作历史仍可追溯；来源文件没有修改。
- 不发浏览器请求观察 35 秒，任务与 Agent 的采集时间继续前进。后台每次采集结束后等待 15 秒，不宣称严格固定周期或真实心跳。
- Agent 记录上限实测 50 条；Codex、Claude 只读能力状态为 ok，AgentDock ACP 状态接口标记 unavailable。采集时间、生命周期事件时间与心跳分开，心跳没有来源时为 null。
- 真实接口报告：忽略目录 `.data/full-p0-live-verification.json`；隔离夹具报告：`.worktrees/cp-01/.data/p0-validation/acceptance.json`。来源数据、凭据、截图与日志均不进入 Git。

## 能力边界

暂停、恢复、派发、人工审批属于 P1，未开放，本次没有将原始“控制验收”全部标记通过。优先级与 Agent 关联仅是本地管理元数据，不会向 Worker 发命令。

AgentDock 当前未暴露 ACP Agent/Session 状态和真实心跳；控制台明确显示不可用或未知，不以任务 active 或 Core 健康代替 Agent 正在运行。Codex CLI 既有 daemon 在本次探测中连接不可用，实际监控使用只读的本地 SQLite 会话索引及限定生命周期记录；读取有版本/模式检查、50 条上限、每条 1 MiB 尾部限制和超时保护。超过 60 秒没有可证实的当前活动则标记 Unknown，并保留最后观察与历史。日志提示词和消息正文不输出、不持久化。

当前是仅监听 `127.0.0.1:4310` 的本机独立 Web 应用；ChatGPT 网页嵌入与远程访问尚未包含。上游 standalone 提示与未来分发打包边界仍适用。
