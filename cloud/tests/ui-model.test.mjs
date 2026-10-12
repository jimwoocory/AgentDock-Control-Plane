import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleTree, layoutGraph, edgePath, editablePayload} from '../ui/model.mjs';
test('search retains ancestors and hierarchy tolerates a cycle',()=>{const nodes=[{id:'e',title:'Epic'},{id:'t',parentId:'e',title:'needle'},{id:'a',parentId:'b',title:'A'},{id:'b',parentId:'a',title:'B'}];assert.deepEqual(visibleTree(nodes,'needle').map(n=>n.id),['e','t']); assert.equal(visibleTree(nodes,'').length,4);});
test('same-column dependency ends outside target rectangle',()=>{const graph=layoutGraph([{id:'a'},{id:'b'}]);const edge=edgePath(graph.positions.get('a'),graph.positions.get('b'));assert.ok(edge.end.x < graph.positions.get('b').x);assert.match(edge.d,/C/);});
test('source payload excludes business fields and preserves metadata',()=>{const draft={title:'changed',kind:'task',status:'done',parentId:'x',acceptanceCriteria:'changed',priority:'high',owner:'Jim',agentId:'codex',dependencies:['x']};assert.deepEqual(editablePayload(draft,{origin:'agentdock'}),{priority:'high',owner:'Jim',agentId:'codex',dependencies:['x']});});
test('poll refresh updates immutable source facts without discarding unsaved metadata',async()=>{const {mergeEditorDraft}=await import('../ui/model.mjs');const latest={id:'s',origin:'agentdock',title:'Fresh source',status:'running',priority:'low',owner:'Original',dependencies:[]};const draft={...latest,title:'Old source',owner:'Unsaved owner',priority:'high'};const merged=mergeEditorDraft(latest,draft,true);assert.equal(merged.title,'Fresh source');assert.equal(merged.status,'running');assert.equal(merged.owner,'Unsaved owner');assert.equal(mergeEditorDraft(latest,draft,false).owner,'Original');});
test('blank local criteria serialize as an empty array',()=>{assert.deepEqual(editablePayload({acceptanceCriteria:''},null).acceptanceCriteria,[])});
test('edited local criteria serialize one nonempty trimmed item per line',()=>{assert.deepEqual(editablePayload({acceptanceCriteria:' First \n \nSecond  '},null).acceptanceCriteria,['First','Second']);assert.deepEqual(editablePayload({acceptanceCriteria:['Existing']},null).acceptanceCriteria,['Existing'])});
test('source task planning permits project and parent while source step remains fixed',()=>{const draft={projectId:'new',parentId:'feature',priority:'high'};assert.deepEqual(editablePayload(draft,{id:'src:1',origin:'agentdock'}),draft);assert.deepEqual(editablePayload(draft,{id:'step:1:2',origin:'agentdock'}),{priority:'high'})});
test('parent choices respect chosen project and kind rank',async()=>{const {parentCandidates}=await import('../ui/model.mjs');const nodes=[{id:'e',projectId:'p',kind:'epic'},{id:'f',projectId:'p',kind:'feature'},{id:'t',projectId:'p',kind:'task'},{id:'other',projectId:'q',kind:'epic'}];assert.deepEqual(parentCandidates(nodes,{projectId:'p',kind:'task',id:'t'}).map(n=>n.id),['e','f'])});

test('Chinese status search retains source facts and saving still submits API enums',()=>{
  const source={id:'src:1',title:'Original source title',status:'completed',kind:'task',priority:'high',origin:'agentdock'};
  assert.deepEqual(visibleTree([source],'已完成').map(n=>n.id),['src:1']);
  assert.equal(visibleTree([source],'已完成')[0].status,'completed');
  assert.equal(source.title,'Original source title');
  assert.deepEqual(editablePayload({status:'active',priority:'urgent'},null),{status:'active',priority:'urgent'});
});

test('unrecognized source statuses stay visible as their original strings',async()=>{
  const {label}=await import('../ui/labels.mjs');
  assert.equal(label('constructor'),'constructor');
  assert.equal(label('external-runtime-status'),'external-runtime-status');
});

test('priority-only source edit keeps reversible project alias inheritance',()=>{
 const source={id:'src:synthetic',origin:'agentdock',projectId:'preset:Target',priority:'low'};
 assert.deepEqual(editablePayload({...source,priority:'high'},source),{priority:'high'});
 assert.equal(editablePayload({...source,projectId:'preset:Other'},source).projectId,'preset:Other');
 assert.equal(editablePayload({...source,origin:'local'},null).projectId,'preset:Target');
});
test('poll keeps dirty editor if source disappears and preserves inherited alias changes',async()=>{
 const {mergeEditorDraft}=await import('../ui/model.mjs');
 const original={id:'src:synthetic',origin:'agentdock',projectId:'old',owner:'Original',dependencies:[]};
 const draft={...original,owner:'Unsaved'};
 assert.deepEqual(mergeEditorDraft(undefined,draft,true,original),draft);
 const latest={...original,projectId:'new'};
 assert.equal(mergeEditorDraft(latest,draft,true,original).projectId,'new');
 assert.equal(mergeEditorDraft(latest,{...draft,projectId:'chosen'},true,original).projectId,'chosen');
});
test('explicitly selecting original source project after inherited move survives later polls and save',async()=>{
 const {mergeEditorDraft}=await import('../ui/model.mjs');
 const opening={id:'src:synthetic',origin:'agentdock',projectId:'old',owner:'Original',dependencies:[]};
 const latest={...opening,projectId:'new'};
 const inherited=mergeEditorDraft(latest,{...opening,owner:'Unsaved'},true,opening,false);
 assert.equal(inherited.projectId,'new');
 const explicit={...inherited,projectId:'old'};
 const polled=mergeEditorDraft(latest,explicit,true,opening,true);
 assert.equal(polled.projectId,'old');
 assert.equal(mergeEditorDraft(latest,polled,true,opening,true).projectId,'old');
 assert.deepEqual(editablePayload(polled,latest),{projectId:'old',owner:'Unsaved',dependencies:[]});
});
test('governance history kinds display Chinese while record identity and source prose remain unchanged',async()=>{
 const {label}=await import('../ui/labels.mjs');
 const records=[{kind:'approval',summary:'Original source prose'},{kind:'approval_review',summary:'Review evidence'},{kind:'decision'},{kind:'artifact'},{kind:'artifact_archive'},{kind:'project_profile'},{kind:'project_link'}];
 const displayed=records.map(record=>({kind:label(record.kind),summary:record.summary}));
 assert.deepEqual(displayed.map(record=>record.kind),['验收请求','审批意见','决策记录','产物登记','产物归档变更','项目资料','项目绑定']);
 assert.equal(displayed[0].summary,'Original source prose');
 assert.equal(records[1].kind,'approval_review');
});
