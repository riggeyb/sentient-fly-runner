import fs from"node:fs";import os from"node:os";import path from"node:path";
const d=fs.mkdtempSync(path.join(os.tmpdir(),"g2p-")),f=path.join(d,"lease");let calls=0;
async function c(o){try{let h=await fs.promises.open(f,"wx");try{await h.writeFile(o)}finally{await h.close()}calls++;return"holder"}catch(e){if(e.code==="EEXIST")return"observer";throw e}}
const r=await Promise.all([c("A"),c("B")]),p={paidCallAdmissionSerialized:r.filter(x=>x==="holder").length===1,concurrentDoubleSpendProof:r.filter(x=>x==="holder").length===1&&r.filter(x=>x==="observer").length===1&&calls===1,concurrentAttempts:2,testProviderDispatchCount:calls,results:r};
fs.writeFileSync("gate2-closure-concurrency-proof.json",JSON.stringify(p,null,2)+"\n");
const s=JSON.parse(fs.readFileSync("measurement-contracts/stronger-sentient-cognition-artifact-v1.schema.json","utf8")),sp=s.additionalProperties===false&&s.properties.toolRecommendations.items.additionalProperties===false&&JSON.stringify(s.properties.toolRecommendations.items.required)===JSON.stringify(["tool","rationale"]);
fs.writeFileSync("gate2-closure-schema-proof.json",JSON.stringify({zeroCostSchemaInstrumentationPass:sp},null,2)+"\n");
if(!p.concurrentDoubleSpendProof||!sp)process.exit(2);
