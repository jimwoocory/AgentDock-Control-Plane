# 当前状态

用户已批准：Mission Control 本地 P0 + AgentDock 真实只读数据，不修改 Core。

上游基线：v2.3.0 / a61ebbfb5a5bf28a8d6345c4d07134a6c3beac52。

CP-01 / CP-01-UI 已实现、提交、独立复审并合入 main，在 main 上完成复验，状态 DONE。

CP-02 / CP-02-UI / CP-03 已实现、独立复审、提交并合入 main，main 56 项范围测试、生产构建及 TypeScript 检查通过；真实接口与隔离浏览器验收通过，状态 DONE。CP-01 为历史 P0-A 基线，本轮完成完整 P0。

公司云端替代方案已实际部署：独立只读采集器 → 私有 Site 服务入口 → D1 → React 页面 / 原生只读 MCP。源码见 cloud/；部署地址 https://agentdock-control-plane.jimwoo-cory.chatgpt.site ，仅 Site 所有者可访问。PC-20251130TKZA 的119个真实任务、728个图节点和50条 Codex 会话索引已回读，匿名401；119/119任务文件哈希不变，Core1.1.0-rc.2仍响应。用户已批准独立采集器的 Windows 登录启动任务；后台运行及独立重启已验证。没有修改 Core，也无需重新授权 AgentDock。

NEXT: CP-06 源码同步/主分支复验，以及所有者完成 ChatGPT 双重验证后的浏览器交互和实际 MCP 工具调用。MCP 已由 Sites 托管，/mcp网关正确要求 OAuth；平台报告新插件已安装，但当前任务无新工具句柄，客户端调用不能标通过。云端31测试/构建通过；本地完整P0的既有56测试结果保留。暂停/恢复/审批仍为P1。

只读来源：本机 AgentDock 1.0.1 的任务文件与 loopback /healthz；已经实际采集 7 个任务。后台采集器在每轮结束后等待 15 秒更新独立 SQLite 快照，不依赖浏览器打开。

P0 页面：/agentdock。已补齐 SQLite 本地任务图、层级/依赖编辑、图/树视图、项目创建、真实来源详情/事件与 Agent 只读监控。Source project 优先采用明确字段，不根据标题猜测。Codex 已实测只读生命周期记录状态；Claude 官方列表接通但当前没有会话；AgentDock ACP 与真实心跳接口未暴露，明确显示能力缺口。暂停/恢复/审批为 P1。

2026-10-12 验收：main 56 项范围测试通过；生产 webpack 构建和 TypeScript 检查通过；真实 API 与浏览器验收通过；5 项目/50 Task、65 节点/45 依赖的独立夹具通过，浏览器额外验证四层树和持久化。最新复核 7 个来源任务文件哈希变化为 0，Web 与 AgentDock 健康接口均为 200。当前 Web 与采集器在后台运行，只监听 127.0.0.1:4310。详情见 verification.md；启动方法见 run.md。
