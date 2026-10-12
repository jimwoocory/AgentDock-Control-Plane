# 私有云端入口

页面：https://agentdock-control-plane.jimwoo-cory.chatgpt.site

使用创建 Site 的 ChatGPT 账号登录。私有页面首次登录可能要求 ChatGPT 双重验证；这不是重新授权 AgentDock。首页左侧选项目（实际来源没有项目字段的任务位于「未归属」），中间 Task graph/Hierarchy 查看图或树，选节点后右侧查看事实和管理字段。Agents 和 History 在页面下方，来源详情中的 Events 为原始只读执行记录。

只读 MCP：https://agentdock-control-plane.jimwoo-cory.chatgpt.site/mcp

Sites 已生成 AgentDock Control Plane 私有插件；平台报告已安装。在 ChatGPT 的 Plugins → Personal → Created by you 选择这个插件后，可以查询 list_projects、get_task_graph、get_task、list_agents、get_execution_history。/mcp 的 OAuth 由 Sites 管理，采集器服务密钥不能代替用户连接；当前开发任务尚未取得新插件工具句柄，真实客户端调用待验收。

公司采集器目录 C:\Users\Administrator\Documents\AgentDock-Control-Plane-Bridge 。只在自己的 .data 存加密配置/状态，读取 .agentdock任务和 .codex会话生命周期。Windows任务 AgentDock-Control-Plane-Bridge 在登录后隐藏运行，约每20秒循环同步；停启仅针对这个命名任务：Stop-ScheduledTask / Start-ScheduledTask。没有公开 AgentDock 端口或新隧道。

云端源码位于 cloud/，与本地 Mission Control 独立。开发：cd cloud；npm ci；npm test；npm run build。保持注册的 .openai/hosting.json identity；已有站点应沿 Sites 原生精确源码打包/私有发布流程更新。Git 不包含凭据、快照、运行数据库、任务内容或node_modules。

已验证公司119任务/728图节点/50会话，来源文件119哈希全部不变、Core响应、匿名401、独立后台和重启同步；云端31测试/Worker构建通过。浏览器创建树/依赖交互和 ChatGPT MCP 真正调用仍待所有者身份验证，不标云端全部验收完成。
