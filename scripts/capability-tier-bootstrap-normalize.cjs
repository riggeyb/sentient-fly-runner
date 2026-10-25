const fs=require("node:fs");
const [input,output]=process.argv.slice(2);
let text=fs.readFileSync(input,"utf8");
function parse(v){try{return JSON.parse(v)}catch{return null}}
let parsed=parse(text);
if(parsed===null){
  const bytes=[];
  for(const ch of text){
    const cp=ch.codePointAt(0);
    if(cp<=0xff){bytes.push(cp);continue}
    if(cp<=0xffff){bytes.push((cp>>8)&255,cp&255);continue}
    throw new Error("BOOTSTRAP_REQUEST_UNEXPECTED_CODEPOINT");
  }
  text=Buffer.from(bytes).toString("utf8").replace(/\uFFFD$/,"");
  parsed=parse(text);
}
if(parsed===null)throw new Error("BOOTSTRAP_REQUEST_JSON_INVALID_AFTER_NORMALIZATION");
fs.writeFileSync(output,JSON.stringify(parsed));
