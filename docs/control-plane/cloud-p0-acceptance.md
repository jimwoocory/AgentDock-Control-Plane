# 公司私有 P0 最终验收

日期：2026-10-12（Asia/Shanghai）。任务 CP-08，Owner root；分支 codex/CP-08-p0-acceptance。只更新验收与使用文档，生产代码、权限与原私有 Site 第3版保持不变。

页面：https://agentdock-control-plane.jimwoo-cory.chatgpt.site

MCP：https://agentdock-control-plane.jimwoo-cory.chatgpt.site/mcp

平台确认原站点 active、所有者可管理、custom仅1名用户/0组；当前ChatGPT实际提供全部5个查询工具。没有创建重复Site、公开地址隧道、Core修改或新的AgentDock授权。

| P0 Gate | 实际结果 |
| --- | --- |
| 创建项目 | 已登录ChatGPT → Sites → 编辑原站点 → 创建专用验收项目，负责人和目标保存成功 |
| 创建任务树 | 浏览器创建史诗 → 功能 → 任务A → 子任务，另有同功能下任务B；重新打开预览及刷新后保留 |
| 查看任务依赖 | B依赖A，图中4条父子连线和1条依赖线；MCP按验收项目读回一致 |
| 优先级与验收条件 | A改为urgent（显示紧急），两条验收条件分别保存；刷新后与MCP结果一致 |
| 拒绝循环与非法关联 | 浏览器尝试A依赖B，Worker日志对应PATCH返回400，已保存图无循环；范围测试另覆盖非法父级与跨项目关联 |
| 真实任务 | get_task_graph返回119来源任务及步骤组成的728节点，get_task返回真实来源事件；来源任务数量不包含验收节点 |
| Agent状态 | list_agents返回50条真实Codex会话索引，本轮均Unknown/过期；心跳为null，采集时间与生命周期证据分开；AgentDock遥测、Claude来源不可用明确返回 |
| 执行历史 | get_task返回来源执行事件；get_execution_history返回真实Agent Running/Completed/Unknown观察及本轮项目/节点管理记录 |
| 五项目50任务隔离 | backend测试在独立内存SQLite中创建5项目各10个任务并验证依赖持久化；不会向生产或源端添加50个假任务 |
| 私有与只读边界 | 实际匿名读取401；5个MCP工具均查询用途；测试拒绝MCP执行命令、无用户身份写请求和跨Origin写请求 |
| 来源不变 | 本轮前后119任务文件SHA-256逐项相同，变化0；公司Core上下文1.1.0-rc.2仍响应；无Core写操作 |

真实MCP调用通过平台已连接的用户工具执行，未通过服务密钥绕过OAuth。采集器持续同步，最终查询capturedAt/receivedAt前进，source.stale=false。

保留专用「P0 验收 · 2026-10-12」项目和5个本地节点供检查；因此列表当前28个项目、总图733个节点。验收记录没有被派发到AgentDock，也没有改变119个来源任务。Git仅保存统计与步骤，不保存源任务正文、用户凭据、快照、运行数据库或截图。

验证：`cd cloud; npm test` 为33/33通过，`npm run build`退出0。首次受限沙箱执行为30/33：hardlink、junction和隐藏进程测试夹具被权限限制；获准的同一测试命令全部通过，无产品代码修改。

浏览器预览出现过401/403，重新从已登录Sites列表打开后合法优先级保存成功，MCP读回urgent；没有减弱登录、Origin校验或私有访问策略。循环拒绝以Worker日志400及存储图未改变为证据，不以暂态前端提示替代业务结果。

截图保存在忽略目录 `.data/cloud-p0-acceptance.png`，显示私有Site公司来源、四层图及依赖。P1暂停/恢复/审批未实现，未将原始控制验收全部标记通过。

合入前文档复审：统计区分来源与本地验收；Unknown不宣称在线Worker；访问范围未扩大；未包含秘密或来源正文；历史CP-04平台资格路线保留为追溯，当前独立采集器路线不依赖该资格。任务提交d6bff7e合入main后，Integrator实际复验33/33测试与生产构建退出0，关闭CP-08。此次仅文档变化，未重发生产Site或修改采集器。
