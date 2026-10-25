const fs=require("node:fs");
const z=require("node:zlib");
const s=fs.readFileSync("scripts/capability-tier-bootstrap-request.cjs","utf8");
const bytes=[];
for(const ch of s){
  const cp=ch.codePointAt(0);
  if(cp<=0xff){bytes.push(cp);continue;}
  if(cp<=0xffff){bytes.push((cp>>8)&255,cp&255);continue;}
  throw new Error("UNEXPECTED_CODEPOINT");
}
let src=Buffer.from(bytes).toString("utf8");
src=src.replace(/\uFFFD$/,"");
if(!src.startsWith('const { gunzipSync } = require("node:zlib");')) throw new Error("BOOTSTRAP_PAYLOAD_RECOVERY_FAILED");
const match=src.match(/const payload="([A-Za-z0-9+/=]+)";/);
if(!match) throw new Error("BOOTSTRAP_PAYLOAD_NOT_FOUND");
const request=z.gunzipSync(Buffer.from(match[1],"base64")).toString("utf8");
const parsed=JSON.parse(request);
if(parsed?.repo!=="riggeyb/sentient"||parsed?.expectedHead!=="5ce976089532a86ac262a2760367318b6f4b72a5"||!Array.isArray(parsed?.commands)) throw new Error("BOOTSTRAP_REQUEST_INVALID");
process.stdout.write(request);
