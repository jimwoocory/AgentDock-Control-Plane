# 日常使用与 P1 验收记录

2026-10-12 用户批准：整理真实项目任务、打磨P0、加入人工审批/决策日志/产物管理，不修改AgentDock Core。以下为实际实现、审查、main复验和原私有Site的验收记录。

基线main a9372ce；独立codex/CP-09-daily-governance，33/33基线测试通过。真实源119任务（采样25active/20blocked/74completed），57任务来源project为空。统计会随源端变化，生产数据及指纹只在忽略目录/会话内保存。

## 已核对

- [x] 后端CP-09独立复审通过，dead43c/f2d2901提交；新增迁移只建5表/3索引，0000迁移及旧数据保留。采集年龄与已删除步骤的历史关联已补回归并修复。
- [x] 中文界面CP-10及整分支复审通过；8dfb9d7、1c4fbed、aaba5db包含日常筛选、草稿保留及连续来源归属变化回归，未知/历史保留，旧Agent会话折叠。所有审查阻断问题已关闭。
- [x] GitHub main aaba5db和Sites镜像main5943039分别70/70范围测试及构建通过；原私有Site第4版按5943039精确源码、官方包发布成功。后续只同步完成文档，无业务代码变化。
- [x] 实际登录用户保存四个来源绑定：usvds2和us-vertical-drama-studio2→USVDS2，google-tts-local→Google-TTS，bmad v7 chatgpt adapter→BMAD。分别14、4、1个Task；原始字段不变，其他版本不合并，57未知不按标题猜测。
- [x] 专用合成验收项目登记v1文本路径及64位SHA-256、1条含2个备选方案的决策、3条分别approved/rejected/changes_requested的请求。审批评论、服务端身份、时间、内容指纹与证据版本由浏览器和真实ChatGPT MCP读回。真实来源任务没有审批记录。
- [x] 浏览器核对当前、受阻、历史（USVDS2完成10/14，当前4个受阻）、项目目标编辑、Google-TTS绑定撤销/恢复、54条过期或未知会话默认折叠、真实已完成任务7条执行事件展开。产物归档/恢复成功；专用验收项目管理已完成并可逆归档，任务本身仍pending。
- [x] 自动测试覆盖服务密钥拒绝管理写、过期/并发审查、跨项目证据和非法URL；发现8个MCP工具均只读。实际匿名API401，服务访问/mcp401，没有借服务凭据冒充用户OAuth。
- [x] 本聊天现有5个原生MCP工具仍可调用；get_task实际返回审批/决策/产物和contextDigest，get_task_graph回读USVDS2的14个根任务/89节点，list_agents回读54条Unknown，来源任务原始project仍为us-vertical-drama-studio2、events=7。新增3个列表工具的客户端绑定尚未刷新，未宣称它们已在当前聊天直接调用通过；服务配置和自动测试的8工具证据单独记录。
- [x] 最终重新采集119任务，文件哈希变化0、新增0、删除0。Core context为PC-20251130TKZA Windows、1.1.0-rc.2。独立采集器代码未改；真实API200/119任务/733图节点/54会话，fresh，匿名401。
- [x] GitHub第一次集成同步远程main562fb76与本机一致，代码对应已复验aaba5db；后续完成文档的最终同步另以Git远程SHA复核。

集成前另外使用独立loopback内存SQLite、双迁移、无公司连接/凭据的“合成 P1 验收（本地）”验证表单。该证据与上述真实私有Site浏览器/MCP证据分开；测试预览已停止，临时浏览器页已关闭。

首次功能发布：Site appgprj_6acc5f77970081918ac7980a051bb770，v4 appgver_312dfb3ae848819196d7f922e6264640，deployment appgdep_6acc9226fe5c8191a457f98f6febaeb9（succeeded，has_mcp=true，env revision2）。私有audience仍为原custom单所有者、0群组，未扩大权限。URL https://agentdock-control-plane.jimwoo-cory.chatgpt.site/ 。原MCP连接保留，没有重新安装或重新授权。

冲突行为也已实测：后台同步与两次管理保存竞争时返回409，保留表单草稿；刷新事实后重试成功，没有静默覆盖。报告提交固定打开表单时的REST内容指纹，不用Site cookie代替MCP OAuth。最终截图保存在忽略的.data/daily-dashboard-live.png和.data/daily-p1-live.png，不上传公司数据或截图到Git。

本轮决定：只合并四个明确来源，其他版本保留（若业务归属不符，可撤销绑定）；审批先做版本绑定的管理验收（若要自动运行Gate，需后续接执行层）；只审批专用合成验收（真实业务结论仍须用户实际审查）。

成本与能力边界：本控制台不增加第三方依赖、付费服务订购或业务模型调用；已有ChatGPT/Sites账户限额仍适用。产物管理为版本化登记和引用，不搬运公司文件或配置R2上传。人工审批记录不自动放行/暂停AgentDock。自动长期记忆文件生成、运行控制、调度在后续范围。57项未知归属保留为后续业务核对工作。
