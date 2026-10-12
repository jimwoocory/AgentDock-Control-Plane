import test from 'node:test';
import assert from 'node:assert/strict';
const client=await import('../ui/api.mjs').catch(()=>({}));
test('authenticated UI request reports Sites re-open for 401/403, conflicts retain server explanation',async()=>{
 assert.equal(typeof client.api,'function');
 for(const status of [401,403])await assert.rejects(client.api('/api/state',undefined,'GET',async()=>new Response('{}',{status})),/Sites.*重新打开/);
 await assert.rejects(client.api('/api/approvals',{report:'draft'},'POST',async()=>new Response(JSON.stringify({error:'版本已变化'}),{status:409})),/版本已变化/);
});
test('approval context pin uses normal encoded REST node route and returns original digest',async()=>{
 assert.equal(typeof client.pinApprovalContext,'function');
 let route;
 const result=await client.pinApprovalContext('src:synthetic/id',async path=>{route=path;return {projectId:'p',nodeId:'src:synthetic/id',contextDigest:'pinned'};});
 assert.equal(route,'/api/nodes/src%3Asynthetic%2Fid/context');
 assert.equal(result.contextDigest,'pinned');
});
