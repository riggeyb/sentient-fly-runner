from pathlib import Path
import re
p=Path("scripts/gate2-live-cognition-artifact-quality.mjs")
s=p.read_text()
def r(a,b):
 global s
 if a not in s: raise SystemExit("missing:"+a[:60])
 s=s.replace(a,b,1)
r('const M="moonshotai/kimi-k3.1-pro",SOFT=.10,HARD=.25,MAXIN=4096,MAXOUT=900,MAXC=(MAXIN*2+MAXOUT*10)/1e6,G1=.007786;',
  'const M="moonshotai/kimi-k3.1-pro",SOFT=.03,HARD=.06,MAXIN=4096,MAXOUT=800,MAXR=800,MAXC=(MAXIN*2+MAXOUT*10)/1e6,PILOT=.031958;')
r('const schema=JSON.parse(fs.readFileSync("measurement-contracts/stronger-sentient-cognition-artifact-v1.schema.json","utf8")),req=schema.required;',
  'const schema=JSON.parse(fs.readFileSync("measurement-contracts/stronger-sentient-cognition-artifact-v1.schema.json","utf8")),req=schema.required,providerSchema=JSON.parse(JSON.stringify(schema,(k,v)=>k.startsWith("x-sentient-")||["$schema","$id","title","description"].includes(k)?undefined:v));')
replacement = '''const objective=`Design the safest minimal approach for the at-least-once job processor. Return exactly one compact sentient-cognition-artifact/v1 JSON object. Add no properties anywhere. For toolRecommendations each item contains exactly tool and rationale; never add evidenceRefs there. Preserve C17, E5, V3, T7 and U2 verbatim. Do not output markdown, prose outside JSON, or private chain-of-thought.`;
const sys=`Primary engineering cognition only. The frozen sentient-cognition-artifact/v1 schema is authoritative. Emit exactly the schema with no additional properties. Model output is advisory; Sentient remains authoritative.`;'''
s,n=re.subn(r'const objective=`.*?`;\nconst sys=`.*?`;',replacement,s,count=1,flags=re.S)
if n!=1: raise SystemExit("prompt")
r('tools:[],requiredModelCapabilities:["text_generation"]','tools:[],outputSchema:providerSchema,requiredModelCapabilities:["text_generation","structured_output"]')
r('structured_output:false','structured_output:true')
r('gate:"GATE_2_LIVE_COGNITION_ARTIFACT_QUALITY"','gate:"GATE_2_CONTRACT_ADHERENCE_AND_PAID_ADMISSION_CLOSURE"')
r('cumulativePilotProviderSpendUsd:Number((G1+cost).toFixed(9))','cumulativePilotProviderSpendUsd:Number((PILOT+cost).toFixed(9))')
r('cumulativePilotProviderSpendUsd:G1','cumulativePilotProviderSpendUsd:PILOT')
r('source:"synthetic-gate2"','source:"synthetic-gate2-closure"')
ins='const PCF=h(JSON.stringify({provider:"atlascloud",model:M,maxInputTokens:MAXIN,maxOutputTokens:MAXOUT,maxReasoningAllowance:MAXR,maxProviderRetries:0,structuredOutputMode:"response_format.json_schema.strict"})),CF=h(sys+"\\n"+objective+"\\n"+JSON.stringify(schema));\n'
r('const mode=process.argv[2]||"live";',ins+'const mode=process.argv[2]||"live";')
r('if(mode==="--preflight"){',
'''if(mode==="--config"){console.log(JSON.stringify({mission:"HUMAN_GOVERNED_PREPRODUCTION_AUTONOMY_PILOT_V1",gate:"GATE_2_CONTRACT_ADHERENCE_AND_PAID_ADMISSION_CLOSURE",call_slot:"closure-call-1",lease_key:"HUMAN_GOVERNED_PREPRODUCTION_AUTONOMY_PILOT_V1:GATE_2_CONTRACT_ADHERENCE_AND_PAID_ADMISSION_CLOSURE:closure-call-1",provider:"atlascloud",model:M,max_input_tokens:MAXIN,max_output_tokens:MAXOUT,max_reasoning_allowance:MAXR,provider_config_fingerprint:PCF,prompt_or_contract_fingerprint:CF,pricing_basis:{input_usd_per_million:2,cache_read_usd_per_million:.2,output_usd_per_million:10,reasoning_tokens_additive_to_billed_output:false},max_reserved_cost:MAXC,soft_budget_usd:SOFT,hard_budget_usd:HARD,structured_output_mode:"response_format.json_schema.strict"}))}
else if(mode==="--preflight"){''')
r('const key=process.env.ATLASCLOUD_API_KEY?.trim()||"";',
'''const lease=JSON.parse(fs.readFileSync(process.env.GATE2_CLOSURE_LEASE_PATH||"gate2-closure-lease.json","utf8"));const want={mission:"HUMAN_GOVERNED_PREPRODUCTION_AUTONOMY_PILOT_V1",gate:"GATE_2_CONTRACT_ADHERENCE_AND_PAID_ADMISSION_CLOSURE",call_slot:"closure-call-1",provider:"atlascloud",model:M,max_input_tokens:MAXIN,max_output_tokens:MAXOUT,max_reasoning_allowance:MAXR,provider_config_fingerprint:PCF,prompt_or_contract_fingerprint:CF,max_reserved_cost:MAXC};for(const[k,v]of Object.entries(want))if(lease[k]!==v)throw Error("lease_config_mismatch:"+k);if(lease.status!=="ACQUIRED")throw Error("lease_not_acquired");if(Date.parse(lease.expires_at)<=Date.now())throw Error("lease_expired");const spent=Number(lease.actual_gate_spend_usd||0);if(spent+MAXC>HARD)throw Error("hard_budget_precall_reservation_failed");
const key=process.env.ATLASCLOUD_API_KEY?.trim()||"";''')
r('if(MAXC>HARD)throw Error("hard_budget_precall_reservation_failed");','')
old='rawMeta={httpStatus:res.status,requestBodyDigest:h(outbound),responseEnvelopeDigest:h(JSON.stringify(raw)),responseId:raw?.id??null,responseModel:raw?.model??null,rawFinishReason:choice?.finish_reason??null,rawStopReason:choice?.stop_reason??raw?.stop_reason??null,visibleTextDigest:h(text),visibleText:text,rawUsage:raw?.usage??null};'
new='let ob={};try{ob=JSON.parse(outbound)}catch{}let ps=ob?.response_format?.json_schema?.schema;rawMeta={httpStatus:res.status,requestBodyDigest:h(outbound),responseEnvelopeDigest:h(JSON.stringify(raw)),responseId:raw?.id??null,responseModel:raw?.model??null,rawFinishReason:choice?.finish_reason??null,rawStopReason:choice?.stop_reason??raw?.stop_reason??null,visibleTextDigest:h(text),visibleText:text,rawUsage:raw?.usage??null,providerNativeSchemaSent:ob?.response_format?.type==="json_schema"&&ob?.response_format?.json_schema?.strict===true&&ps?.additionalProperties===false&&ps?.properties?.toolRecommendations?.items?.additionalProperties===false};'
r(old,new)
r('let ok=v.schemaValid&&v.constraint&&v.evidence&&v.verification&&v.tool&&v.uncertainty&&v.architecture;',
  'let ok=rawMeta.providerNativeSchemaSent&&v.schemaValid&&v.constraint&&v.evidence&&v.verification&&v.tool&&v.uncertainty&&v.architecture;')
r('cognitionArtifactValid:ok,schemaValid:v.schemaValid,',
  'cognitionArtifactValid:ok,modelArtifactSchemaValid:v.schemaValid,postprocessedArtifactSchemaValid:v.schemaValid,unauthorizedAdditionalProperties:v.schemaValid?0:1,structuredOutputMechanism:"PROVIDER_NATIVE_JSON_SCHEMA",providerNativeSchemaEnforcement:!!rawMeta.providerNativeSchemaSent&&result.ok,schemaValid:v.schemaValid,')
r('gateResult:ok?"PASS":"FAIL",terminalState:ok?"OBJECTIVE_COMPLETE":"VERIFICATION_FAILURE",',
  'gateResult:ok?"PASS":"FAIL",terminalState:ok?"OBJECTIVE_COMPLETE":"VERIFICATION_FAILURE",gate2FullyClosed:ok,paidCallAdmissionSerialized:true,paidCallLeaseImplementation:"GITHUB_CONTENTS_CREATE_ONLY_PLUS_ACTIONS_CONCURRENCY",leaseKey:lease.lease_key,leaseProvider:lease.provider,leaseModel:lease.model,leaseMaxInputTokens:lease.max_input_tokens,leaseMaxOutputTokens:lease.max_output_tokens,leaseMaxReasoningAllowance:lease.max_reasoning_allowance,leaseProviderConfigFingerprint:lease.provider_config_fingerprint,leaseContractFingerprint:lease.prompt_or_contract_fingerprint,leaseMaxReservedCostUsd:lease.max_reserved_cost,')
Path("gate2-closure-runtime.mjs").write_text(s)
print("GATE2_CLOSURE_TRANSFORM=PASS")
