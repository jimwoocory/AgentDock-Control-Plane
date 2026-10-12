import React from 'react';
import {taskRuntime} from '../shared/task-runtime.mjs';
import {label,agentLabel} from './labels.mjs';
const date=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未知';
const bindings={MANAGEMENT:'管理关联',RUNTIME:'来源自报关联',UNBOUND:'尚未关联',CONFLICT:'关联冲突'};
const evidence={FRESH:'观测新鲜',STALE:'运行证据已过期或未发现',UNAVAILABLE:'尚无对应会话证据',CONFLICT:'会话与任务关联冲突，当前执行未知'};
const turn={Running:'本轮开始',Completed:'最近一轮已结束',Aborted:'最近一轮已中止',Unknown:'未知'};
export function TaskRuntime({state,nodeId}){
 const r=taskRuntime(state,nodeId);if(!r)return null;
 return <section className="task-runtime" aria-label="任务执行关联"><h3>任务执行关联</h3>
  <p className="muted">{bindings[r.binding]} · {evidence[r.evidence]}</p>
  <dl><dt>任务状态</dt><dd>{label(r.taskStatus)}</dd><dt>会话观测状态</dt><dd>{label(r.sessionStatus)}</dd>
   <dt>关联 Worker</dt><dd>{r.agent?agentLabel(r.agent):r.declaredAgentId||'未关联'}</dd>
   <dt>会话标识</dt><dd className="fingerprint">{r.agent?.id??r.declaredAgentId??'未知'}</dd>
   <dt>最近一轮事件</dt><dd>{turn[r.lastTurnStatus]} · {date(r.lastTurnAt)}</dd>
   <dt>当前动作</dt><dd>{r.currentAction||'来源尚未提供'}</dd><dt>最近心跳</dt><dd>{date(r.heartbeatAt)}</dd>
   <dt>来源检查点</dt><dd>{r.checkpoints.length?r.checkpoints.map(s=><p key={s.id}>{s.title} · {label(s.status)} · {date(s.updatedAt)}</p>):'没有进行中的步骤记录'}</dd>
   <dt>任务更新时间</dt><dd>{date(r.checkpointAt)}{r.sourceStale?'（来源已过期或缺失）':''}</dd>
  </dl><p className="muted">管理关联用于定位会话；检查点是来源最新记录。会话一轮结束不等于业务任务完成。</p>
 </section>;
}
