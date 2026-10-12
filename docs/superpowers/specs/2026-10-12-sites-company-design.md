# 公司私有 Site 与只读 MCP 设计

用户已批准按顺序实施：先验证私有 Site 读取公司 AgentDock 的真实数据，通过后继续完整 P0 与只读 MCP，不修改 Core。公司目标已由用户确认是 PC-20251130TKZA，对应 AgentDock - Company；家庭本地 checkout 仅是源码工作区，不是公司执行目标。

## 第一阶段 CP-04

允许路径：`sites/control-plane/**`、`docs/control-plane/**`、`docs/superpowers/**`。Owner root，业务分支 `codex/CP-04-sites-company-probe`，复用独立 `.worktrees/cp-01`，基线 61a09d9。

资格前置：必须通过 Sites 原生 list_plugin_eligibility 获取 allowed 插件及准确 connector ID；聊天工具可用、名称、市场条目均不能替代资格。确认资格后才能声明 read_only 连接并创建 enable_plugins 的私有 Site。资格接口缺失时保留检查结果，继续独立准备工作，不能通过外部隧道、复制凭据、源数据快照或任意工具代理绕过。

第一版只调用服务端固定的任务 list，limit=1，并显示连接名称、来源时间、任务 ID/标题/状态和真实读取结果。请求必须有 Site 用户身份、同源 Origin 和请求级 CONNECTORS 绑定。插件 ID、connector ID 与 action 名取自资格及工具发现，不接受浏览器指定连接或工具。失败、未知、未授权、为空分别显示；只有平台 status=success 且合法任务结果才算通过。

Gate：私有访问和实际用户登录；授权返回原页；首次读取与刷新各触发真实托管调用；与公司原生只读查询的 ID/标题/状态一致；未授权调用及任何来源写操作被拒绝。原生工具读取、离线测试和成功发布都不能替代托管 Gate。

## 第二阶段 CP-05

只有 CP-04 托管 Gate 通过后领取。React 复用现有任务图/节点编辑/Agent UI，服务端改为 Sites Worker；D1 按用户及来源保存项目、任务树、依赖和管理历史。只读来源信息与管理字段分离，拒绝跨用户和跨项目引用及循环依赖。公司命令会话不等于 Codex/Claude Agent，状态证据缺失时明确 Unknown，不能云端读取家庭 Codex 状态。

Site `/mcp` 只开放 list_projects、get_task_graph、get_task、list_agents、get_execution_history；每次数据调用验证 Site 用户身份与授权。增加 hosting capabilities 的 mcp，平台负责连接认证/OAuth；发布后用 get_site 的准确 plugin_id 显示安装 UI，并以实际只读工具调用验收连接。调用方服务访问凭据不代表用户身份或连接授权。

源码与迁移中不加入公司真实任务、身份凭据或运行库。刷新失败保留最后事实并标记过期，不宣称云端定时采集已实现。私有 Site audience 保持不变；暂停/恢复/审批仍为 P1。
