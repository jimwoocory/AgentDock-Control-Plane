# 公司私有 Site Implementation Plan

> **For agentic workers:** Use executing-plans in this session; follow the approved hosted-read Gate before implementing the full migration.

**Goal:** 验证私有 Site 对确认的公司 AgentDock 的真实只读访问，通过后部署完整 P0 和只读 MCP。
**Architecture:** 现有公司连接 → 请求级 Sites connector → 受保护 Worker/React 页面；后续 D1 管理数据与同一服务的只读 MCP。
**Tech Stack:** Sites Vinext starter、React/TypeScript、D1、平台 CONNECTORS 与身份；结果校验用无依赖 ESM 和 Node test。
**Spec:** docs/superpowers/specs/2026-10-12-sites-company-design.md

## Global Constraints

- 唯一公司目标 PC-20251130TKZA / AgentDock - Company。
- 不修改 AgentDock Core、配置、来源任务或凭据；不启动 Worker 工作。
- 先托管 Gate，后完整 P0/MCP；没有通过时不标 DONE。
- 原生 list_plugin_eligibility 必须返回 allowed 与准确 ID；当前缺失，不猜测 ID，不以聊天连接代替资格。
- 来源只读，私有访问，逐用户授权；真实数据不进 Git/构建。

## CP-04：资格与最小真实读取

Files: sites/control-plane/lib/probe-result.mjs, probe-result.test.mjs；资格通过后使用 starter 的 app/api/probe/route.ts、app/page.tsx、lib/connectors.ts、build/sites-worker.ts 和 .openai/hosting.json。

- [x] 核对公司实际机器身份、Node/Git 与任务目录；用户已明确确认目标。
- [x] 原生 task_manage list(limit=1) 成功，保留证据但不算托管通过。
- [x] 写结果校验测试并执行失败结果；必须拒绝平台失败、原生错误、非法任务字段和过量任务，分别保留空列表。
- [x] 实现 normalizeProbeResult(envelope)，只接受 status=success，输出已验证字段，10 项测试通过。函数成功不是托管验证证据。
- [ ] 调用 Sites list_plugin_eligibility 并记录 allowed 插件、connector ID、只读 action schema。接口不可用时记录外部依赖阻塞。
- [ ] 在空的独立 Site checkout 用 project-setup.mjs 创建 Vinext starter；使用 read_only hosting 声明后创建一次 enable_plugins 的 Site，立即持久化返回 project_id。
- [ ] app/api/probe/route.ts 固定调用 list(limit=1)，验证身份及 Origin，connectorResponse 和 normalizeProbeResult 保留失败状态；页面提供读取/刷新和顶层授权返回，不能任意工具代理。
- [ ] 按 Sites helper 同步准确源提交、构建和打包；用私有 save/deploy 验证生产成功。
- [ ] 实际用户授权后比较托管任务与公司原生查询，刷新再次触发读取；核对隔离/来源无写，再记录 Gate。

## CP-05：完整 P0 与 MCP（CP-04 Gate 通过后）

Files: Site checkout 的 db/schema.ts、db/index.ts、schema-only migrations、app/api/projects/route.ts、app/api/graph/route.ts、app/api/agents/route.ts、app/mcp/route.ts、components/control-plane/**；复用现有 src/components/agentdock 的图/编辑界面与 graph-types.ts。

- [ ] D1 以 Site 用户 ID 和来源隔离项目、节点、依赖及历史；测试创建树、重载、环/跨用户/跨项目拒绝。
- [ ] 迁移真实任务详情、Agent 明确证据和过期状态；测试读取失败保留事实，不把任务或命令会话状态猜作 Agent。
- [ ] `/mcp` 支持 initialize、tools/list、只读 tools/call；数据调用验证用户，任意写工具拒绝。离线与实际远程调用分别验收。
- [ ] 私有发布并复验原始五项基础验收及隔离五项目/50任务；获取准确 MCP plugin_id 并让用户完成安装连接，验证一次真实工具查询。
- [ ] 独立复审、提交集成、main 复验和完整托管证据后才标 DONE。
