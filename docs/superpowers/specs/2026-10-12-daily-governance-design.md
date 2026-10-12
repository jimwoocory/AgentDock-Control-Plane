# 日常工作台与P1管理记录设计

用户已批准此前路线及原始Module4/5/7/8范围，本轮持续实施，不重复授权。以现有私有React/Worker/D1为基础，新增独立管理记录；不更换底座，不修改AgentDock Core、来源任务、会话、配置或采集器。

## 项目与任务整理

保留来源明确的项目版本与外部任务ID；不根据任务标题自动猜归属。控制台提供可撤销的来源项目别名关系，目标只能为预置或独立本地项目，无别名链。明确的usvds2、us-vertical-drama-studio2归入USVDS2；google-tts-local归入Google-TTS；bmad v7 chatgpt adapter归入BMAD。其他版本继续独立；无项目字段的57个任务保持待整理，由用户人工选择项目。别名只写D1，不改变来源project；已有手动任务覆盖优先。任何导致跨项目依赖/父子关系的操作拒绝，不静默抹掉关系。

项目负责人、目标、阶段与归档在独立profile中维护，包括预置/来源项目；归档保留数据、可恢复。默认先展示有当前任务的项目，当前任务含pending/active/blocked/failed及不能归类的原始状态，completed/canceled为历史。项目卡片按根任务计数，不把步骤当任务；完成比例标注统计口径。默认显示当前任务、可切换全部/受阻/待整理/历史；搜索与原层级筛选保留祖先。Agent默认只展开有新鲜证据者，过期会话折叠，未知心跳/能力缺口保留。

## 人工审批

独立验收请求绑定项目和任务节点，含验收报告、证据产物ID及请求时内容指纹。创建请求为pending；已登录用户可approve/reject/request_change并输入意见，仅pending可审。后端记录平台用户身份与时间，不能从客户端指定审批人。审批记录不可覆盖，重复/并发审查返回409。来源业务内容、缺失状态、更新版本或本地节点验收/依赖改变后，记录显示stale，旧批准不能当新版本验收；可创建新请求。请求与审查写入历史。尚未连接执行控制，页面明确审批记录只用于验收管理，不会自动暂停或放行AgentDock。

## 决策与产物

决策记录按项目保存主题、选择、理由、备选、可选任务关联、创建人和时间。产物注册保存项目、可选任务、名称、版本、说明、https引用或本地路径引用、可选sha256、人工声明的生产Agent、注册人和时间。注册不上传/读取公司文件；本地路径仅文本展示，https链接禁用危险scheme；版本不覆盖，重复名称/版本/任务拒绝，可归档并恢复。审批证据只能引用同项目产物，跨项目关联拒绝。真实产物及验收结论由用户提供，不能生成假的审批/文件/决策。

## 接口与安全

GET /api/state保持原字段，新增projectLinks、approvals、decisions、artifacts；审批含isStale、contextDigest。POST /api/project-links保存或撤销别名；PATCH /api/projects/:id更新profile。POST /api/approvals与POST /api/approvals/:id/review；POST /api/decisions；POST /api/artifacts与PATCH /api/artifacts/:id（仅archived）。所有写操作复用平台用户身份及同Origin校验，服务密钥不具备管理写权限。限定文本、列表、记录数量；SQL参数化；新增迁移仅建表/索引，保留旧D1数据。管理与别名操作有事务和冲突校验。

GET /api/nodes/:encodedId/context只读返回nodeId/projectId/contextDigest，审批表单打开时获取并固定该指纹，创建时一并提交，避免草稿与最新来源错配；UI不调用/mcp取得指纹，以免Site登录之外另触发MCP OAuth。get_task也返回同一contextDigest供聊天查询。编辑来源任务时，仅归属实际改变才传projectId，普通优先级/负责人修改继续继承项目别名；既有显式覆盖/图引用pin保持优先。

MCP继续全部只读；原5工具保持兼容，get_task额外返回关联管理记录，执行历史按project/task正确筛选；新增list_approvals/list_decisions/list_artifacts查询工具，均readOnlyHint。不暴露approve/create/control写工具。

## UI与验收

保持中文与原颜色风格，增加工作区内任务/审批/决策/产物切换，表单有空态、错误、保存状态。项目整理可以显示来源项目和绑定目标，支持撤销；批量不猜标题。默认当前任务视图必须可找到所有历史任务。真实数据不进入测试或Git；生产验证在专用本地验收项目创建合成管理记录，不对真实任务做批准结论。测试覆盖迁移兼容、版本过期、重复/并发审查、跨项目、权限、别名关系撤销与图完整性、产物版本及危险链接、筛选；main复验后发布原私有Site，确认源文件不变。

Project Memory先由项目目标、验收记录和Decision Log承载；自动生成架构/风险/长期记忆文件不在本次交付。暂停/恢复/调度继续后续独立能力Gate。
