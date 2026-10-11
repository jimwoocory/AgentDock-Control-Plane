# 本地运行

要求：Windows、Node.js >=22.18（建议24及以上）、pnpm。第一次构建需要网络下载依赖和上游字体。

在本仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/control-plane/start.ps1
```

打开 http://127.0.0.1:4310/agentdock。首次启动生成独立的本地 operator 账户，用户名和密码保存在 `.data/登录信息.txt`。服务仅绑定 loopback，不发布公网地址。

重新构建或停止：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/control-plane/start.ps1 -Build
powershell -ExecutionPolicy Bypass -File scripts/control-plane/stop.ps1
```

启动脚本只停止记录中 PID 与创建时间仍匹配的本项目 Node 进程，不关闭 AgentDock。关闭网页后后台采集仍然运行；停止脚本关闭 Web 和采集器。

默认只读 `%USERPROFILE%\.agentdock\tasks\tsk_*.json`，只访问 `http://127.0.0.1:8765/healthz`。不读取 DPAPI 凭据、不调用执行控制、不修改 Core 或来源文件。源数据、独立 SQLite 数据库、登录信息、进程记录和日志均在 Git 忽略目录内。

可在 `.env.local` 指定 `AGENTDOCK_HOME`、`AGENTDOCK_HEALTH_URL` 或 `AGENTDOCK_OBSERVER_DB`。数据库不得位于 AgentDock 来源目录（包含目录链接解析后的实际路径）。只允许本机 HTTP /healthz 地址。采集失败保留上次快照并标记过期，任务消失显示来源缺失而不是自动完成。

任务树展示实际任务与步骤层级。步骤顺序不等于依赖关系；源文件未提供任意依赖 DAG。运行时健康是 /healthz 的结果，不能据此宣称 Agent 正在执行；Agent 身份、心跳和命令会话显示未采集。

P0 禁用上游调度器和其他执行写 API；仅提供独立项目元数据及任务归属关联。关联保存在本地观察数据库，不写回 AgentDock。

排错日志：`.data/web.err.log`、`.data/collector.err.log`、`.data/collector.out.log`。采集日志只记数量和状态。
