# 当前状态

用户已批准：Mission Control 本地 P0 + AgentDock 真实只读数据，不修改 Core。

上游基线：v2.3.0 / a61ebbfb5a5bf28a8d6345c4d07134a6c3beac52。

CP-01 / CP-01-UI 已实现、提交、独立复审并合入 main，在 main 上完成复验，状态 DONE。

NEXT: CP-02 / CP-02-UI / CP-03 IN_PROGRESS，执行最终浏览器验收、合入 main 后复验与真实来源哈希对比。实现与独立复审已完成；50 项范围测试通过。CP-01 是 P0-A 只读接入基线；完整 P0 的 DONE 以最终验收记录为准。

只读来源：本机 AgentDock 1.0.1 的任务文件与 loopback /healthz；已经实际采集 7 个任务。后台采集器每 15 秒更新独立 SQLite 快照，不依赖浏览器打开。

P0 页面：/agentdock。已补齐 SQLite 本地任务图、层级/依赖编辑、图/树视图、项目创建、真实来源详情/事件与 Agent 只读监控。Source project 优先采用明确字段，不根据标题猜测。Codex 已实测只读生命周期记录状态；Claude 官方列表接通但当前没有会话；AgentDock ACP 与真实心跳接口未暴露，明确显示能力缺口。暂停/恢复/审批为 P1。

2026-10-11 验收：main 34 项范围测试通过；生产 webpack 构建和 TypeScript 检查通过；真实 API 与浏览器验收通过；7 个来源任务文件哈希变化为 0；停止/启动原型后 AgentDock 健康接口仍为 200。当前 Web 与采集器在后台运行，只监听 127.0.0.1:4310。详情见 verification.md；启动方法见 run.md。
