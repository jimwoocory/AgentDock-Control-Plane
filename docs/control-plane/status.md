# 当前状态

用户已批准：Mission Control 本地 P0 + AgentDock 真实只读数据，不修改 Core。

上游基线：v2.3.0 / a61ebbfb5a5bf28a8d6345c4d07134a6c3beac52。

CP-01 / CP-01-UI 已实现、提交、独立复审并合入 main，在 main 上完成复验，状态 DONE。

CP-02 / CP-02-UI / CP-03 已实现、独立复审、提交并合入 main，main 56 项范围测试、生产构建及 TypeScript 检查通过；真实接口与隔离浏览器验收通过，状态 DONE。CP-01 为历史 P0-A 基线，本轮完成完整 P0。

NEXT: 用户使用本机 P0 验收；暂停/恢复/审批与远程访问列入 P1，尚未领取实施任务。

只读来源：本机 AgentDock 1.0.1 的任务文件与 loopback /healthz；已经实际采集 7 个任务。后台采集器在每轮结束后等待 15 秒更新独立 SQLite 快照，不依赖浏览器打开。

P0 页面：/agentdock。已补齐 SQLite 本地任务图、层级/依赖编辑、图/树视图、项目创建、真实来源详情/事件与 Agent 只读监控。Source project 优先采用明确字段，不根据标题猜测。Codex 已实测只读生命周期记录状态；Claude 官方列表接通但当前没有会话；AgentDock ACP 与真实心跳接口未暴露，明确显示能力缺口。暂停/恢复/审批为 P1。

2026-10-12 验收：main 56 项范围测试通过；生产 webpack 构建和 TypeScript 检查通过；真实 API 与浏览器验收通过；5 项目/50 Task、65 节点/45 依赖的独立夹具通过，浏览器额外验证四层树和持久化。最新复核 7 个来源任务文件哈希变化为 0，Web 与 AgentDock 健康接口均为 200。当前 Web 与采集器在后台运行，只监听 127.0.0.1:4310。详情见 verification.md；启动方法见 run.md。
