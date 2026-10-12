# 当前状态

用户已批准：Mission Control 本地 P0 + AgentDock 真实只读数据，不修改 Core。

上游基线：v2.3.0 / a61ebbfb5a5bf28a8d6345c4d07134a6c3beac52。

CP-01 / CP-01-UI 已实现、提交、独立复审并合入 main，在 main 上完成复验，状态 DONE。

CP-02 / CP-02-UI / CP-03 已实现、独立复审、提交并合入 main，main 56 项范围测试、生产构建及 TypeScript 检查通过；真实接口与隔离浏览器验收通过，状态 DONE。CP-01 为历史 P0-A 基线，本轮完成完整 P0。

公司云端替代方案已实际部署：独立只读采集器 → 私有 Site 服务入口 → D1 → React 页面 / 原生只读 MCP。源码见 cloud/；部署地址 https://agentdock-control-plane.jimwoo-cory.chatgpt.site ，仅 Site 所有者可访问。PC-20251130TKZA 的119个真实任务、728个图节点和50条 Codex 会话索引已回读，匿名401；119/119任务文件哈希不变，Core1.1.0-rc.2仍响应。用户已批准独立采集器的 Windows 登录启动任务；后台运行及独立重启已验证。没有修改 Core，也无需重新授权 AgentDock。

CP-06 源码同步已完成：c13abd1提交合入main，main31测试/构建/Worker验证通过，GitHub远程SHA确认一致。只同步源码，未上传运行数据或凭据。

CP-07 中文化已部署至原私有Site第3版，源码ad8cdaf（Sites源码仓库）。任务图、层级树、字段、状态、提示、日期均为中文；33测试/构建通过，线上HTML/JS200并含中文，真实预览119任务/728节点读取正常。浏览器选择真实来源节点并确认中文优先级对应原API值low/medium/high/urgent。原始来源与后端/采集器/权限未变。GitHub任务分支197f738已合入main并复验33测试/构建通过，CP-07 DONE。

CP-08 剩余云端 P0 验收已完成：当前 ChatGPT 会话直接调用全部5个只读 MCP 工具，119来源任务/728来源节点/50会话及真实任务执行事件返回正常。浏览器创建独立验收项目、四层树和后续依赖；紧急优先级、验收条件刷新后保留并由MCP读回一致。独立5个验收节点保留在专用项目，合计28项目/733节点。33范围测试、Worker构建通过；119个源任务文件哈希变化0；Core1.1.0-rc.2响应；匿名401、私有所有者访问策略不变。d6bff7e任务提交已审查合入main，main复验33/33测试和构建通过，CP-08 DONE；证据见 cloud-p0-acceptance.md。

NEXT: 用户已批准CP-09/CP-10/CP-11：先整理明确真实项目、打磨日常任务/受阻/历史视图，再发布P1人工审批记录、决策日志、产物登记。执行合同见docs/superpowers/specs/2026-10-12-daily-governance-design.md及对应计划。现有P0线上保持运行；实现仅在独立worktree。不推断未知项目、不修改Core；审批为版本绑定的管理验收，不冒充执行链路控制。暂停/恢复/调度仍需后续能力Gate。

只读来源：本机 AgentDock 1.0.1 的任务文件与 loopback /healthz；已经实际采集 7 个任务。后台采集器在每轮结束后等待 15 秒更新独立 SQLite 快照，不依赖浏览器打开。

P0 页面：/agentdock。已补齐 SQLite 本地任务图、层级/依赖编辑、图/树视图、项目创建、真实来源详情/事件与 Agent 只读监控。Source project 优先采用明确字段，不根据标题猜测。Codex 已实测只读生命周期记录状态；Claude 官方列表接通但当前没有会话；AgentDock ACP 与真实心跳接口未暴露，明确显示能力缺口。暂停/恢复/审批为 P1。

2026-10-12 验收：main 56 项范围测试通过；生产 webpack 构建和 TypeScript 检查通过；真实 API 与浏览器验收通过；5 项目/50 Task、65 节点/45 依赖的独立夹具通过，浏览器额外验证四层树和持久化。最新复核 7 个来源任务文件哈希变化为 0，Web 与 AgentDock 健康接口均为 200。当前 Web 与采集器在后台运行，只监听 127.0.0.1:4310。详情见 verification.md；启动方法见 run.md。
