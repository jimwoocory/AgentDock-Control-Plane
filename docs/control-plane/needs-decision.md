# 待决策

无阻塞方向决策。用户已批准 Mission Control P0，默认本机 localhost、只读源同步、原型本地管理数据。

2026-10-12 用户已明确批准公司私有 Site 真实读取验证，通过后完整云端 P0 与只读 MCP。公开访问与运行时写控制仍不在范围内。

## CP-04 外部平台依赖（不要求再次授权）

公司目标与工作区均已由用户确认，无需再选择机器或修改工作区权限。当前工具清单及 tools 对象均缺少 sites_list_plugin_eligibility；不能查询具体插件的 Sites allowed 状态或准确 connector ID。不能据此宣称管理员拒绝、来源不可用或 Site 已验证。

恢复条件：在提供该原生资格查询能力的同一公司工作区会话中继续。Sites app-integrations 指令要求先资格后声明/创建插件 Site；本轮没有创建空 Site、复制凭据、读取 DPAPI、发布来源快照或改造 AgentDock Core。独立结果校验已实现并测试，托管 Gate 仍未通过。
