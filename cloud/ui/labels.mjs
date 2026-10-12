// Display labels only. Source records, IDs and API enum values remain unchanged.
const labels = {
  epic:'史诗',feature:'功能',task:'任务',subtask:'子任务',
  low:'低',medium:'中',high:'高',urgent:'紧急',
  pending:'待开始',active:'进行中',running:'运行中',planning:'规划中',
  blocked:'受阻',failed:'失败',completed:'已完成',done:'已完成',canceled:'已取消',cancelled:'已取消',
  Idle:'空闲',Planning:'规划中',Running:'运行中','Waiting Approval':'等待审批',
  Blocked:'受阻',Failed:'失败',Completed:'已完成',Unknown:'未知',unknown:'未知',
  Missing:'来源缺失',Absent:'未发现',Unsaved:'未保存',Archived:'已归档',
  'No snapshot':'暂无快照',Stale:'数据已过期','Fresh snapshot':'数据新鲜',
  Local:'本地',local:'本地',agentdock:'AgentDock',codex:'Codex',claude:'Claude',
  management:'管理记录',source:'来源记录',agent:'Agent 记录',
  approval:'验收请求',approval_review:'审批意见',decision:'决策记录',artifact:'产物登记',
  artifact_archive:'产物归档变更',project_profile:'项目资料',project_link:'项目绑定',
  unavailable:'不可用',error:'错误',ok:'可用',OK:'正常',
  task_started:'任务开始',task_complete:'任务完成',turn_aborted:'本轮中止',
  'Codex local readonly lifecycle':'Codex 本地只读生命周期',
  'No readonly runtime lifecycle source. Task status is not Agent status.':'AgentDock 尚未提供只读运行状态；任务状态不能用于判断 Agent 是否运行。',
  'Readonly SQLite metadata and bounded lifecycle records; heartbeat unavailable.':'已读取会话索引和有限生命周期记录；来源未提供心跳。',
  'Readonly session index unavailable or unsupported.':'只读会话索引不可用，或当前格式不受支持。',
  'Claude agent source unavailable on configured company machine.':'公司电脑尚无可用的 Claude Agent 数据来源。',
  task_source_read_failed:'任务来源读取失败，保留上次成功快照',
  codex_source_unavailable:'Codex 会话来源不可用',
  codex_lifecycle_unavailable:'部分 Codex 生命周期记录不可用',
  codex_invalid_thread_id:'部分 Codex 会话标识无效',
  snapshot_size_limit:'快照超过大小限制，保留上次成功数据'
};
export const label = value => Object.hasOwn(labels,value) ? labels[value] : value ?? '未知';
export const agentLabel = agent => (agent.label || agent.id).replace(/^Codex thread /,'Codex 会话 ');
