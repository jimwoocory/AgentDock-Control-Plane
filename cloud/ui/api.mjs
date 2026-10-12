export async function api(path,body,method='POST',request=fetch){
 const response=await request(path,{method:body===undefined?'GET':method,credentials:'same-origin',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if([401,403].includes(response.status))throw Error('登录或写入权限已失效，请从 Sites 重新打开此私有页面。');
 let data;try{data=await response.json()}catch{throw Error(`请求失败（${response.status}），请重试。`)}
 if(!response.ok)throw Error(`${data.error||'请求失败'}（${response.status}）${response.status===409?'；请刷新事实后重新检查草稿。':''}`);
 return data;
}
export async function pinApprovalContext(nodeId,request=api){return request(`/api/nodes/${encodeURIComponent(nodeId)}/context`);}
