import { AtlasCloudClientV1 } from "../sentient/dist/src/model/providers/atlas-cloud-client.js";
import { DEEPSEEK_V3_2_MODEL_V1 as D, DEEPSEEK_COGNITION_TIMEOUT_MS_V1 as DT, DOTS3_COGNITION_TIMEOUT_MS_V1 as OT } from "../sentient/dist/src/model/providers/atlas-hybrid-router.js";
const O="dots-studio/dots-3-note-prev-free", k=process.env.ATLASCLOUD_API_KEY?.trim();
if(!k||DT!==12000||DT<=9400||OT!==9000) throw new Error("smoke_preflight");
const c=new AtlasCloudClientV1({apiKey:k});
async function go(model,timeoutMs){
  const r=await c.complete({model,systemPrompt:"Connectivity test only. Return one tiny JSON object. No tools or actions.",userPrompt:'Return exactly {"status":"ok"}.',maxOutputTokens:384,timeoutMs,requireJsonObject:true});
  if(!r.ok||(r.usage.totalTokens??0)<=0||r.structuredOutput===null) throw new Error(`provider:${model}:${r.ok?"invalid":r.reason}`);
  return r;
}
const d=await go(D,DT), o=await go(O,OT);
let seen=false;
const f=new AtlasCloudClientV1({apiKey:"synthetic",fetchImpl:async(_u,i)=>await new Promise((_r,j)=>{
  const a=()=>{seen=true;j(new Error("abort"));};
  if(i?.signal?.aborted)a();else i?.signal?.addEventListener("abort",a,{once:true});
})});
const ctl=new AbortController(); setTimeout(()=>ctl.abort(),5);
const x=await f.complete({model:D,systemPrompt:"x",userPrompt:"x",maxOutputTokens:8,timeoutMs:2000,signal:ctl.signal});
if(x.ok||x.reason!=="timeout"||!seen) throw new Error("abort_not_wired");
const pick=r=>({latencyMs:r.latencyMs,input:r.usage.inputTokens,cached:r.usage.cachedInputTokens,output:r.usage.outputTokens,reasoning:r.usage.reasoningTokens,total:r.usage.totalTokens,requestIdPresent:r.providerRequestId!==null,reportedCostUsd:r.reportedCostUsd});
console.log(JSON.stringify({ATLAS_AUTH:"PASS",DEEPSEEK_MODEL:D,DEEPSEEK_TIMEOUT_MS:DT,DOTS3_MODEL:O,DOTS3_TIMEOUT_MS:OT,DEEPSEEK:pick(d),DOTS3:pick(o),ABORT_SIGNAL_PATH:"PASS",SECRET_EXPOSED:false,REAL_ATLAS_SMOKE:"PASS",DEPLOYMENT_PERFORMED:false}));
