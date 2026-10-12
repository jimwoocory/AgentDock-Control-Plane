# 私有云端入口

页面：https://agentdock-control-plane.jimwoo-cory.chatgpt.site 。Sites 列表名称为「AgentDock 工程控制台」，第3版界面已中文化。

使用创建 Site 的 ChatGPT 账号登录。私有页面首次登录可能要求 ChatGPT 双重验证；这不是重新授权 AgentDock。也可从 Sites 列表选择「编辑」进入已登录账号的实际预览。首页左侧选项目（实际来源没有项目字段的任务位于「未归属」），中间「任务图／层级树」查看图或树，右侧「节点详情」查看事实和管理字段。「Agent 状态」和「历史记录」在页面下方，来源详情中的「执行事件」为原始只读记录。来源标题和原始数据保留，不自动翻译。

只读 MCP：https://agentdock-control-plane.jimwoo-cory.chatgpt.site/mcp

Sites 私有插件已连接当前 ChatGPT 会话，五个工具均已实际调用：list_projects、get_task_graph、get_task、list_agents、get_execution_history。可直接要求 ChatGPT「查询公司 AgentDock 的任务图、Agent 状态和执行历史」。新会话若未选择插件，可在插件列表选择 AgentDock 工程控制台（旧名 AgentDock Control Plane）。/mcp 的 OAuth 由 Sites 管理，采集器服务密钥不能代替用户连接，不需要重新授权 AgentDock。

公司采集器目录 C:\Users\Administrator\Documents\AgentDock-Control-Plane-Bridge 。只在自己的 .data 存加密配置/状态，读取 .agentdock任务和 .codex会话生命周期。Windows任务 AgentDock-Control-Plane-Bridge 在登录后隐藏运行，约每20秒循环同步；停启仅针对这个命名任务：Stop-ScheduledTask / Start-ScheduledTask。没有公开 AgentDock 端口或新隧道。

云端源码位于 cloud/，与本地 Mission Control 独立。开发：cd cloud；npm ci；npm test；npm run build。保持注册的 .openai/hosting.json identity；已有站点应沿 Sites 原生精确源码打包/私有发布流程更新。Git 不包含凭据、快照、运行数据库、任务内容或node_modules。

2026-10-12 已完成公司私有 P0 实际验收：119来源任务/728来源图节点/50会话；五个 ChatGPT MCP 工具调用通过；浏览器创建项目、Epic/Feature/Task/Subtask 和后续任务依赖，紧急优先级及验收条件刷新后保留，MCP 读回一致。独立「P0 验收 · 2026-10-12」项目保留5个本地验收节点，因此当前合计28项目/733节点；它们不是公司源任务，不会执行。33范围测试与 Worker 构建通过。来源文件119哈希全部不变、Core响应、匿名401。

Sites 编辑预览的登录会话可能过期，显示401/403时重新从 Sites 列表打开该预览即可；本轮如此恢复，无需改变权限或重新授权 AgentDock。直接私有网址首次登录可能要求已有账号的双重验证。Agent 状态根据证据显示：本轮50条均为未知/过期，没有真实心跳；AgentDock Agent遥测与Claude来源缺口明确显示。暂停、恢复、审批为P1，未开放。
