# P0 验收证据

日期：2026-10-11。上游固定为 Mission Control v2.3.0；独立仓库与任务分支，不修改父工作区或 AgentDock Core。

实现提交 b6a9b8f；Windows 测试修正 26be675；PowerShell 5.1 编码及非交互探测修正 ccce111 / 0d4c614。所有实现与修正均经过独立复审并合入 main。

## main 验证

- `node node_modules/vitest/vitest.mjs run src/lib/agentdock src/components/agentdock src/lib/config.test.ts src/proxy.test.ts`：7 个文件，34 项测试通过。
- `MC_AGENTDOCK_P0=1 MC_DISABLE_RUNTIME_SCAN=1 NEXT_PUBLIC_GATEWAY_OPTIONAL=true node node_modules/next/dist/bin/next build --webpack`（环境变量以 PowerShell 设置）：生产构建通过，TypeScript 检查通过。随后仅修正启动脚本与脚本解析测试，生产 Next 源码未变。
- ESLint 范围检查：0 error / 3 warning（页面 effect 依赖与两处原生 fetch 风格提醒）；不宣称零警告。
- 采集器实际运行：task-count=7，source=ok，runtime=healthy（AgentDock 1.0.1）。后台每 15 秒采集，独立于浏览器轮询。
- 真实 API 与 AgentDock task_manage 只读 list 比较：7 个任务 ID、标题、状态与更新时间完全匹配。来源明确提供的项目字段自动建立容器，另保留五个空的预置项目；共 10 个项目容器。
- 未授权 GET /api/agentdock 为 401；上游执行 POST /api/tasks 为 403；跨来源本地项目写请求为 403。
- 实际创建临时本地项目、关联来源任务并读取核对成功；来源 project 字段保持不变。验收临时 metadata 已从本原型 SQLite 清理。
- 不发浏览器请求等待后，采集时间继续前进；真实后台同步已验证。
- 浏览器已完成登录、项目筛选、空项目隔离、搜索和任务详情/步骤/来源事件/观察历史检查；未发现控制台 error。
- PowerShell stop/start 实测成功；停止原型后 AgentDock /healthz 仍返回 200。重新启动后 Web 与采集器持续运行，Web 仅监听 127.0.0.1:4310。
- 比对采集前后的 7 个任务来源文件 SHA-256，变化数量为 0。凭据、源码修改与 Core 控制均未发生。

实际快照、源哈希、接口检查结果、浏览器截图与运行日志只保存在忽略的 `.data/` 内，不进入 Git。

## 已知边界

该 P0 展示任务及步骤层级，不代表任意依赖 DAG。运行时健康探测不能代表 Agent 正在运行；Agent 身份、心跳、命令会话持续观察未采集。审批、暂停、恢复和派发未开放。

上游固定版本仍为 Alpha；本机原型不发布公网。Next start 在上游 standalone 输出模式下产生提示，但当前完整仓库运行方式已通过实际 HTTP、页面资源和登录检查；未来制作独立分发包时需采用完整 standalone 打包流程。

复审的非阻塞建议：sourceKey 目前基于配置路径，未来切换同一来源的目录别名时需要统一物理路径身份，避免形成新来源视图。
