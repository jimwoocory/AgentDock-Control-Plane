# 公司 Site 探测进度与证据

日期：2026-10-12。整体 CP-04 为 BLOCKED，没有托管通过，也未开始依赖它的 CP-05。

## 已确认

- 用户确认公司电脑 PC-20251130TKZA，连接 AgentDock - Company；目标 AgentDock 1.1.0-rc.2，Windows，Node 22.23.2，Git 2.54.0。
- 家庭 checkout 是 GitHub 源码工作区，不能用其中的本机 localhost、凭据或 Codex 运行记录替代公司来源。
- 公司原生只读 task_manage list(limit=1) 返回 action=list/count=1 和真实任务；结果只保存在会话内，不把任务 ID、标题、goal 或 summary 写入仓库。
- 用户确认公司 ChatGPT 工作区已启用 Sites 使用插件，不能把当前缺失接口归因为管理员禁用。
- Sites 工作流匹配返回 Nexus 404，未创建任何 AgentDock Task；普通独立任务板继续保存进度，未写 Core。

## 代码验证

`node --test sites/control-plane/lib/probe-result.test.mjs`：先出现缺失模块失败，添加实现后 10/10 通过。

验证包含平台失败、原生读取不能冒充托管证据、provider isError、非法任务 ID/状态/标题/时间、超出单任务读取、mutation 回执、reauthentication 来源、空列表与失败分开，以及字段投影不包含 goal/secret。该函数只校验已收到的响应格式，本身不证明网络调用或用户授权发生。

## 外部依赖

Sites 技能 references/app-integrations.md 要求先调用原生 list_plugin_eligibility，使用 allowed 插件和返回的准确 connector ID，不能以聊天访问、名称或市场条目代替资格。

本会话已检查 ALL_TOOLS 和 tools.mcp__codex_apps__sites_list_plugin_eligibility，均不可用。插件市场查询未提供该原生能力。已有 Site 列表可读，但不是公司 AgentDock 的 Sites 资格证明。

尚未创建新 Site、添加插件声明、获取写凭据、修改分享范围或发布部署。下一步在提供原生资格接口的公司工作区会话中恢复 CP-04，然后实测托管用户登录、首次读取、刷新和隔离。托管 Gate 未通过前，完整云端 P0/MCP 保持 BACKLOG。
