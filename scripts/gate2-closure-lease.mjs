import fs from"node:fs";
const c=JSON.parse(fs.readFileSync("gate2-closure-config.json","utf8")),repo=process.env.GITHUB_REPOSITORY,p=process.env.LEASE_PATH,t=process.env.GH_TOKEN;
const H={Accept:"application/vnd.github+json",Authorization:`Bearer ${t}`,"X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"};
async function q(method,url,body){let r=await fetch("https://api.github.com"+url,{method,headers:H,body:body?JSON.stringify(body):undefined}),j=null;try{j=await r.json()}catch{}return{r,j}}
const url=`/repos/${repo}/contents/${p}?ref=main`,g=await q("GET",url);
if(g.r.status===200){fs.appendFileSync(process.env.GITHUB_OUTPUT,"acquired=false\n");console.log("PAID_CALL_LEASE=OBSERVER_EXISTING");process.exit(0)}
if(g.r.status!==404)throw Error("lease_lookup_http_"+g.r.status);
let now=new Date(),lease={...c,status:"ACQUIRED",owner:`${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`,created_at:now.toISOString(),expires_at:new Date(now.getTime()+30*60*1000).toISOString(),actual_gate_spend_usd:0};
let put=await q("PUT",`/repos/${repo}/contents/${p}`,{message:"gate: acquire Gate 2 closure paid-call lease",content:Buffer.from(JSON.stringify(lease,null,2)+"\n").toString("base64"),branch:"main"});
if([409,422].includes(put.r.status)){fs.appendFileSync(process.env.GITHUB_OUTPUT,"acquired=false\n");console.log("PAID_CALL_LEASE=OBSERVER_RACE_LOST");process.exit(0)}
if(put.r.status!==201)throw Error("lease_create_http_"+put.r.status);
let r=await q("GET",url);if(r.r.status!==200)throw Error("lease_reread_http_"+r.r.status);
let remote=JSON.parse(Buffer.from(String(r.j.content).replace(/\n/g,""),"base64").toString("utf8"));
for(const k of["mission","gate","call_slot","lease_key","provider","model","max_input_tokens","max_output_tokens","max_reasoning_allowance","provider_config_fingerprint","prompt_or_contract_fingerprint","pricing_basis","max_reserved_cost","structured_output_mode"])if(JSON.stringify(c[k])!==JSON.stringify(remote[k]))throw Error("lease_mismatch_"+k);
if(remote.status!=="ACQUIRED"||Date.parse(remote.expires_at)<=Date.now())throw Error("lease_not_live");
if(Number(remote.actual_gate_spend_usd)+Number(remote.max_reserved_cost)>Number(remote.hard_budget_usd))throw Error("BUDGET_EXHAUSTED");
fs.writeFileSync("gate2-closure-lease.json",JSON.stringify(remote,null,2)+"\n");fs.appendFileSync(process.env.GITHUB_OUTPUT,"acquired=true\n");console.log("PAID_CALL_LEASE=ACQUIRED");
