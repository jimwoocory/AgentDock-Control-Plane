# 当前状态

用户已批准：Mission Control 本地 P0 + AgentDock 真实只读数据，不修改 Core。

上游基线：v2.3.0 / a61ebbfb5a5bf28a8d6345c4d07134a6c3beac52。

CP-01 / CP-01-UI 已实现、提交、独立复审并合入 main，在 main 上完成复验，状态 DONE。

NEXT: 用户从 http://127.0.0.1:4310/agentdock 使用 P0，验证多项目筛选与本地归属是否符合实际管理习惯；后续控制或实时会话能力须另立任务。当前无自动执行的 P1 任务。

只读来源：本机 AgentDock 1.0.1 的任务文件与 loopback /healthz；已经实际采集 7 个任务。后台采集器每 15 秒更新独立 SQLite 快照，不依赖浏览器打开。

P0 页面：/agentdock。提供五个空项目容器、未归属任务、人工本地关联、任务详情、步骤树、来源事件与观察历史。源数据中的 project 优先采用明确字段；不根据任务标题猜测。任意依赖 DAG、Agent 身份/心跳/会话持续采集、审批与执行控制留待后续验证。

2026-10-11 验收：main 34 项范围测试通过；生产 webpack 构建和 TypeScript 检查通过；真实 API 与浏览器验收通过；7 个来源任务文件哈希变化为 0；停止/启动原型后 AgentDock 健康接口仍为 200。当前 Web 与采集器在后台运行，只监听 127.0.0.1:4310。详情见 verification.md；启动方法见 run.md。
