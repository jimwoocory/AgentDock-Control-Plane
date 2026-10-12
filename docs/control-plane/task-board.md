# 任务板

| ID | 任务 | 状态 | Owner | 依赖 | Allowed Paths | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| CP-15 | 任务与执行会话关联及只读运行证据展示 | IN_PROGRESS | root | CP-11；用户2026-10-12确认任务板主线并批准继续 | cloud/shared/**, cloud/worker/server.mjs, cloud/ui/**, cloud/tests/runtime*, docs/control-plane/**；真实证据仅.data/** | 明确管理关联/运行自报关联及冲突；展示会话状态与最近一轮事件、来源检查点；taskId/projectId筛选准确；过期/缺失未知，不以active冒充Running；范围测试/构建/独立审查/main复验；正常所有者关联与原私有Site发布回读 |

CP-15 不控制业务执行，不向来源任务或Core写入，不采集聊天正文、提示词或密钥。当前jimeng任务仅用于只读验收，具体ID及会话只保留私有运行证据。

2026-10-12本轮业务操作（用户已批准）：仅整理真实当前/受阻任务、输出私有行动清单、提交USVDS2真实验收；不确定归属等待用户确认，不改Core、不自动派发或代用户批准。

| ID | 任务 | 状态 | Owner | 依赖 | Allowed Paths | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| CP-14 | 所有者配置的一次性管理数据修复 | DONE | root | 用户2026-10-12明确批准一次性修复；CP-12固定映射与CP-13缺口报告 | cloud/worker/server.mjs, cloud/worker/repair.mjs, cloud/db/schema.ts, cloud/drizzle/**, cloud/tests/repair.test.mjs, docs/control-plane/**；私有修复计划仅.data/和原Site secret配置 | c5558d8已复审合入main，main78/78测试/构建；原私有Site发布及清理配置后再发布成功，27/27映射、142步骤、30审计及pending回查一致，120来源文件SHA变化0，API/MCP权限不变 |
| CP-12 | 当前任务归属核对与私有项目行动清单 | DONE | root | CP-11与本轮授权 | docs/control-plane/**；.data/**（忽略、不得提交真实内容）；原私有Site管理元数据 | 27项已确认管理归属保存并重复MCP回查；45项行动快照已私有登记，实时44当前Task均有归属、历史32项保留；来源状态不变，修复前后120源文件指纹一致 |
| CP-13 | USVDS2真实产物与验收报告提交 | BLOCKED（线上业务Gate） | root | CP-12项目事实及现有P1接口；实际owner浏览器连接 | docs/control-plane/**；.data/**（忽略）；原私有Site产物/验收记录 | 实际文件/SHA及线上D1三条快照核对，V2报告登记且pending请求已由MCP读回，未过期、未审核；当前owner写入/CAS/完整链未验证，不标完整验收DONE，最终审批由用户完成 |

当前云端扩展（用户已批准，2026-10-12）：

本轮CP-09~CP-11已由用户批准：真实项目整理、P0日常使用、P1人工审批/决策/产物管理；所有运行来源只读。

| ID | 任务 | 状态 | Owner | 依赖 | Allowed Paths | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| CP-09 | 日常项目整理与P1管理API | DONE | governance_backend | CP-08与本轮授权 | cloud/worker/**, cloud/db/**, cloud/drizzle/**, cloud/tests/backend*, cloud/tests/governance*, cloud/tests/helpers.mjs, docs/superpowers/** | dead43c/f2d2901实现与修复已独立复审；aaba5db整分支复审合入main，main70/70测试及构建通过 |
| CP-10 | 中文日常工作台与P1管理界面 | DONE | governance_ui | CP-09接口实现与复审通过 | cloud/ui/**, cloud/tests/ui*, cloud/tests/daily-model*, docs/control-plane/** | 8dfb9d7/1c4fbed/aaba5db已提交及复审；显式选择/连续继承刷新回归通过；已合入main，main70/70测试及构建通过 |
| CP-11 | 集成、真实项目整理与私有发布验收 | DONE | root | CP-09/CP-10审查与合入 | cloud/**镜像发布, docs/control-plane/**, docs/superpowers/** | 整分支及修复复审通过，已合入main；双main70/70测试/构建、原Site v4私有功能发布通过；19任务明确绑定、57未知保留、真实浏览器/MCP记录回读、源119哈希0变化、GitHub562fb76首次远程确认；完成文档最终同步另核SHA，见daily-governance-verification.md |

| ID | 任务 | 状态 | Owner | 依赖 | Allowed Paths | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| CP-08 | 公司私有页面与 ChatGPT 只读 MCP 最终验收 | DONE | root | CP-06 / CP-07；用户要求完成剩余 P0 | docs/control-plane/** | d6bff7e任务提交已审查并合入main；main33/33测试与构建通过；五个真实MCP查询、浏览器四层树/依赖/刷新保存、119源文件哈希不变与私有权限通过 |
| CP-07 | 云端中文界面修正 | DONE | root | 已批准的中文P0与英文遗漏反馈 | cloud/ui/**, cloud/tests/ui*, cloud/scripts/build.mjs, docs/control-plane/** | 已提交合入main，main33测试/构建/Worker验证通过；原私有Site第3版发布及真实预览通过，中文选项对应原API值；来源数据不变 |

用户已批准独立只读采集器替代方案以及采集器自己的 Windows 登录启动项。CP-06 采用私有 Site 服务入口，不依赖 BYOP 资格工具。

| ID | 任务 | 状态 | Owner | 依赖 | Allowed Paths | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| CP-06 | 同步独立私有云端 P0 和公司只读采集器源码 | DONE（源码同步） | root | 云端已私有发布且真实读取通过 | cloud/**, docs/control-plane/**, README.md | 已提交合入main，main31测试/构建/Worker验证通过，远程c13abd1已确认；浏览器MFA/实际MCP调用作为云端P0剩余Gate保留，未标整体验收完成 |

| ID | 任务 | 状态 | Owner | 依赖 | Allowed Paths | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| CP-04 | 公司私有 Site 资格与真实只读验证（历史路线） | SUPERSEDED | root | 用户确认公司目标；Sites 插件资格接口 | sites/control-plane/**, docs/control-plane/**, docs/superpowers/** | BYOP资格接口未取得；用户批准独立采集器路线取代此依赖，见CP-06/CP-08；不宣称资格查询通过 |
| CP-05 | 完整云端 P0 与只读 MCP（历史拆分） | SUPERSEDED | — | CP-04 托管 Gate | 后续 Site checkout 的 app/**, components/**, db/**, migrations/**, .openai/**, docs/control-plane/** | 完整实现由CP-06/CP-07交付，真实私有浏览器及ChatGPT MCP最终验收由CP-08收口 |

| ID | 任务 | 状态 | Owner | 依赖 | Allowed Paths | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| CP-01 | 本地运行与真实只读观察面板 | DONE | root | 上游固定基线 | src/lib/agentdock/**, src/app/api/agentdock/**, src/lib/db.ts, src/lib/config.test.ts, src/proxy.ts, scripts/control-plane/**, docs/control-plane/**, docs/superpowers/plans/** | P0 Gate、提交、main复验已通过，见 verification.md |
| CP-01-UI | 中文观察界面与本地项目关联 | DONE | chatgpt_product | CP-01 类型契约已提供 | src/components/agentdock/**, src/app/agentdock/** | UI测试、真实浏览器、随CP-01集成并复验已通过 |

Source data 与凭据不得加入 Git。控制台五个初始项目只是管理容器，没有真实数据的项目显示空；无 project 字段的真实任务放入未归属，人工关联独立保存。

| CP-02 | 完整 P0 本地任务模型、层级与依赖 API | DONE | root | CP-01 | src/lib/agentdock/**, src/app/api/agentdock/**, src/proxy.ts, scripts/control-plane/**, docs/control-plane/**, docs/superpowers/** | 创建树、循环拒绝、跨项目隔离、50任务与持久化、来源哈希不变、审查及main复验通过，见 verification.md |
| CP-02-UI | Task Graph、节点编辑与 Agent 监控界面 | DONE | p0_full_ui | CP-02 类型合同 | src/components/agentdock/**, src/app/agentdock/** | 浏览器创建四层树/查看依赖/Agent与历史；5项目50 Task可管理；审查与main生产复验通过 |
| CP-03 | AgentDock 持续只读 Agent/Session 监控 | DONE | p0_runtime | 已批准P0，实际只读能力调查 | src/lib/agentdock/runtime-*, src/lib/agentdock/monitor-*, scripts/control-plane/**, docs/control-plane/** | Codex真实生命周期状态、Claude空列表、AgentDock ACP缺口明确、过期Unknown、持续同步、无Core写入；审查与main复验通过 |


