/* Textbook SVG animation compiler for St Patrick's School. No executable pasted code. */
(function(){
"use strict";
const $=id=>document.getElementById(id),NS="http://www.w3.org/2000/svg";
const validTags=new Set(["svg","g","defs","linearGradient","radialGradient","stop","path","line","polyline","polygon","circle","ellipse","rect","text","tspan","marker","clipPath","mask","pattern","filter","feGaussianBlur","feOffset","feMerge","feMergeNode","feDropShadow"]);
let model=null,step=0,timer=null,busy=false,workerUrl=null,gifUrl=null,drawVersion=0;
const fields=["class","subject","chapter","topic","resolution"];
const preview=$("stageCanvas"),pc=preview.getContext("2d");
function status(s,type){$("status").textContent=s;$("status").dataset.state=type||"info";}
function info(strict=true){
 const o={};fields.forEach(k=>o[k]=$(k).value.trim());
 if(strict&&(!o.class||!o.subject||!o.chapter||!o.topic)){status("Complete Class, Subject, Chapter and Topic.","error");return null;}
 return o;
}
function prompt(d){
return [
"Create detailed, anatomically accurate, textbook-style VECTOR SVG ARTWORK and six to eight animated teaching stages as CODE for St. Patrick's School.",
"Class: "+d.class,"Subject: "+d.subject,"Chapter: "+d.chapter,"Topic: "+d.topic,
"",
"Return ONLY one valid JSON object, optionally inside a JSON markdown code block. Use this exact schema:",
'{"format":"school-gif-v1","title":"Lesson title","baseSvg":"<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 900 900\\" width=\\"900\\" height=\\"900\\">...FULL DETAIL...</svg>","frames":[{"stage":"Stage name","explanation":"Concise scientific explanation","overlay":"<g>...stage-specific animation overlay...</g>"}]}',
"",
"VISUAL QUALITY: This is for school lessons, not an icon set. The SVG must be a comprehensive high-detail textbook illustration. Draw accurately proportioned structures using numerous organic SVG paths, fine outlines, subtle gradients, layers and cross-sectional anatomy. Label the correct parts with legible leader lines. Every relevant internal structure must be drawn; no cartoon flowers, stick figures, emoji, crude circles, simplistic flowchart, or merely decorative shapes. For mathematics use exact geometric constructions instead.",
"The baseSvg is the original detailed illustration and stays IDENTICAL across all frames. Add motion/progression using overlay layers in each frame, with accurate position, arrows, highlights, transport paths and formation stages as scientifically applicable. Do not simply blink labels. Build 6–8 stages that actually explain the process.",
"Use professional textbook colours, sensible scale and accurate structure orientation. The full artwork should fill most of the 900x900 canvas without cramped overlapping labels. Show separate cutaway or inset illustrations within this canvas where needed. Include all stable labels in baseSvg and varying markers and arrows in each overlay. Keep the illustration stationary across frames.",
"Use only svg,g,defs,linearGradient,radialGradient,stop,path,line,polyline,polygon,circle,ellipse,rect,text,tspan,marker,clipPath,mask,pattern,filter,feGaussianBlur,feOffset,feMerge,feMergeNode,feDropShadow.",
"All gradients and marker definitions go inside baseSvg. Use url(#id) references only. No embedded images, external URLs, base64, scripts, JavaScript, CSS, foreignObject, SVG animation elements, file loading, font downloads or external assets. SVG xmlns MUST be http://www.w3.org/2000/svg, base viewBox exactly 0 0 900 900, and frame overlays must be SVG fragments (<g>...</g>).",
"Each frame has a clearly distinct accurate stage, a short title, and a scientifically correct explanation (approximately 15–35 words). No extra headings inside the SVG; the school app supplies the title, class and captions.",
"All double quotes inside SVG strings MUST be correctly escaped for valid JSON. No trailing commas or comments. Deliver self-contained original vector illustration code, not Python. The user will paste this JSON in a browser GIF creator.",
"Be candid about your illustration: this is detailed vector textbook art, not photographic AI rendering. Do not claim perfect anatomical accuracy without textbook verification.",
"Return only the JSON object."
].join("\n");
}
function withoutFence(s){
 let t=s.trim(),ticks=String.fromCharCode(96).repeat(3);
 if(t.startsWith(ticks)){t=t.slice(3);t=t.replace(/^(json|javascript|js)\s*\r?\n/i,"");const p=t.lastIndexOf(ticks);if(p>=0)t=t.slice(0,p);}
 return t.trim();
}
function xml(s){
 if(typeof s!=="string"||s.length>270000)throw Error("The diagram must contain SVG text under 270 KB.");
 const o=new DOMParser().parseFromString(s,"image/svg+xml");
 if(o.getElementsByTagName("parsererror").length)throw Error("Invalid SVG. Ask ChatGPT to fix the SVG XML.");
 return o;
}
function checkTree(root){
 const nodes=[root,...root.getElementsByTagName("*")];
 if(nodes.length>6000)throw Error("SVG is too complex for a phone.");
 for(const n of nodes){
  if(n.namespaceURI!==NS||!validTags.has(n.localName))throw Error("Unsupported SVG element: "+n.localName);
  for(const att of [...n.attributes]){
   const key=att.localName.toLowerCase(),val=att.value;
   // XML namespace declarations are metadata, not requests to fetch external SVG resources.
   // Every valid SVG needs xmlns="http://www.w3.org/2000/svg".
   if(att.namespaceURI==="http://www.w3.org/2000/xmlns/"||att.name==="xmlns"){
    if(att.name==="xmlns"&&val===NS)continue;
    if(att.name==="xmlns:xlink"&&val==="http://www.w3.org/1999/xlink")continue;
    throw Error("Unexpected SVG namespace declaration.");
   }
   if(key.startsWith("on")||key==="href"||key==="style")throw Error("SVG scripts, links and stylesheet attributes are not allowed.");
   if(att.namespaceURI&&att.namespaceURI!==NS)throw Error("Unexpected SVG attribute namespace.");
   if(/javascript:|data:|https?:|@import/i.test(val))throw Error("No external SVG resources allowed.");
   if(/url\s*\(/i.test(val) && /url\s*\(/i.test(val.replace(/url\s*\(\s*['"]?#[A-Za-z][\w-]*['"]?\s*\)/gi,"")))throw Error("Use only local SVG url(#id) markers.");
  }
 }
}
function loadCode(code){
 if(!code||code.length>450000)throw Error("Paste the complete ChatGPT SVG code (maximum 450 KB).");
 let obj;try{obj=JSON.parse(withoutFence(code));}catch(e){throw Error("ChatGPT returned invalid JSON. Ask it to fix the escaping of SVG quotes.");}
 if(!obj||obj.format!=="school-gif-v1"||!Array.isArray(obj.frames)||obj.frames.length<4||obj.frames.length>8)throw Error("Use school-gif-v1 code with 4–8 frames.");
 const base=xml(obj.baseSvg),root=base.documentElement;
 if(root.localName!=="svg"||root.namespaceURI!==NS)throw Error("baseSvg must be one complete SVG image.");
 const v=(root.getAttribute("viewBox")||"").trim().split(/[\s,]+/).map(Number);
 if(v.length!==4||v.some(x=>!Number.isFinite(x))||v[2]<=0||v[3]<=0)throw Error("SVG needs a valid viewBox.");
 checkTree(root);
 const serializer=new XMLSerializer();
 const frames=obj.frames.map((f,i)=>{
  if(!f||typeof f.stage!=="string"||typeof f.explanation!=="string"||typeof f.overlay!=="string")throw Error("Frame "+(i+1)+" needs stage, explanation, and overlay.");
  const part=xml('<svg xmlns="'+NS+'">'+f.overlay+'</svg>');
  checkTree(part.documentElement);
  const doc=base.cloneNode(true),r=doc.documentElement;
  for(const node of [...part.documentElement.childNodes])if(node.nodeType===1)r.appendChild(doc.importNode(node,true));
  r.setAttribute("width","900");r.setAttribute("height","900");
  return {name:f.stage.slice(0,110),detail:f.explanation.slice(0,500),svg:serializer.serializeToString(doc)};
 });
 return {title:String(obj.title||"Educational Animation").slice(0,200),frames};
}
function shape(c,x,y,w,h,r,fill,stroke){
 c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}
}
function label(c,s,x,y,size=27,color="#213951",bold=false,align="left"){
 c.textBaseline="middle";c.textAlign=align;c.fillStyle=color;c.font=(bold?"700 ":"400 ")+size+"px Arial,sans-serif";c.fillText(s,x,y);
}
function short(c,s,max){s=String(s);while(c.measureText(s).width>max&&s.length>5)s=s.slice(0,-2);return s;}
function wrap(c,s,x,y,max=737,sz=25,limit=4){
 c.font=sz+"px Arial,sans-serif";c.textBaseline="middle";c.textAlign="left";c.fillStyle="#263f56";
 let lines=[],current="";for(const word of String(s).split(/\s+/)){
  let next=current?current+" "+word:word;
  if(c.measureText(next).width>max&&current){lines.push(current);current=word;}else current=next;
 }
 if(current)lines.push(current);lines.slice(0,limit).forEach((v,i)=>c.fillText(v,x,y+i*40));
}
function imgFor(svg){
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml;charset=utf-8"})),img=new Image();
  img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
  img.onerror=()=>{URL.revokeObjectURL(url);reject(Error("SVG illustration did not render. Ask ChatGPT to correct the SVG."));};
  img.src=url;
 });
}
async function draw(i,c,w,h){
 const d=info(false),f=model.frames[i],img=await imgFor(f.svg);
 c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,w,h);c.save();c.scale(w/900,h/1600);
 c.fillStyle="#f3f8fd";c.fillRect(0,0,900,1600);
 const grad=c.createLinearGradient(0,0,900,238);grad.addColorStop(0,"#0e3a68");grad.addColorStop(1,"#1776a0");
 c.fillStyle=grad;c.fillRect(0,0,900,240);
 label(c,"ST. PATRICK'S SCHOOL",450,58,35,"white",true,"center");
 label(c,"EDUCATIONAL ANIMATION",450,108,19,"#c6edff",true,"center");
 c.font="700 31px Arial";label(c,short(c,d.topic||model.title,785),450,167,31,"white",true,"center");
 label(c,d.class+"  •  "+d.subject,450,211,21,"#e3f3ff",false,"center");
 shape(c,53,261,794,71,16,"#e2eef8");
 c.font="700 22px Arial";label(c,short(c,d.chapter||model.title,742),79,296,22,"#15456e",true);
 shape(c,52,354,796,796,24,"white","#d5e5f1");
 c.save();c.beginPath();c.roundRect(72,375,756,756,16);c.clip();c.drawImage(img,78,381,744,744);c.restore();
 shape(c,52,1175,796,322,22,"white","#d5e5f1");
 shape(c,76,1199,155,39,15,"#dcf3eb");label(c,"STEP "+(i+1)+" / "+model.frames.length,153,1219,18,"#13735c",true,"center");
 c.font="700 32px Arial";label(c,short(c,f.name,725),78,1291,32,"#103c6b",true);
 wrap(c,f.detail,78,1354);
 label(c,"Scientific illustration • Teacher verification required",450,1554,18,"#7289a1",false,"center");
 c.restore();
}
function stop(){if(timer){clearInterval(timer);timer=null;}}
async function show(i){const v=++drawVersion;try{await draw(i,pc,preview.width,preview.height);if(v===drawVersion)step=i;}catch(e){status("Preview error: "+e.message,"error");}}
function start(){stop();$("previewArea").hidden=false;show(0);timer=setInterval(()=>{if(!busy&&model)show((step+1)%model.frames.length);},1600);}
async function copy(s){try{await navigator.clipboard.writeText(s);return true;}catch(e){try{$("promptText").select();return document.execCommand("copy");}catch(x){return false;}}}
function lock(v){busy=v;["getPrompt","generate","previewBtn","clearCode"].forEach(id=>$(id).disabled=v);}
async function worker(){
 if(!window.GIF)throw Error("GIF library not loaded. Check internet and refresh.");
 if(workerUrl)return workerUrl;
 const r=await fetch("https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js");
 if(!r.ok)throw Error("Cannot load the GIF encoder.");
 workerUrl=URL.createObjectURL(new Blob([await r.text()],{type:"application/javascript"}));return workerUrl;
}
async function make(){
 if(busy)return;
 const d=info();if(!d)return;
 try{model=loadCode($("gifCode").value);}catch(e){status(e.message,"error");return;}
 const [w,h]=d.resolution.split("x").map(Number);
 stop();lock(true);$("download").hidden=true;
 if(gifUrl){URL.revokeObjectURL(gifUrl);gifUrl=null;}
 try{
  status("Preparing the textbook illustration...");
  const workerScript=await worker(),out=document.createElement("canvas");out.width=w;out.height=h;
  const render=out.getContext("2d");
  const gif=new GIF({workerScript,workers:1,width:w,height:h,quality:w>=1000?14:10,repeat:0});
  for(let i=0;i<model.frames.length;i++){
   await draw(i,render,w,h);
   gif.addFrame(render,{copy:true,delay:i===model.frames.length-1?1900:1300,dispose:2});
   status("Prepared animation stage "+(i+1)+" / "+model.frames.length);
   await new Promise(r=>setTimeout(r,8));
  }
  const b=await new Promise((resolve,reject)=>{
   const watchdog=setTimeout(()=>reject(Error("GIF encoding timed out. Try lower resolution.")),150000);
   gif.on("progress",v=>status("Encoding GIF: "+Math.round(v*100)+"%"));
   gif.on("finished",blob=>{clearTimeout(watchdog);resolve(blob);});
   try{gif.render();}catch(e){clearTimeout(watchdog);reject(e);}
  });
  gifUrl=URL.createObjectURL(b);
  $("download").href=gifUrl;
  $("download").download=(d.topic.replace(/[^a-z0-9 -]/gi,"").trim().replace(/\s+/g,"-").slice(0,70)||"Educational-GIF")+".gif";
  $("download").textContent="⬇ Download GIF ("+(b.size/1048576).toFixed(1)+" MB)";
  $("download").hidden=false;start();status("GIF generated from your illustration code. Review and download.","success");
 }catch(e){status("Generation error: "+e.message,"error");}
 finally{lock(false);}
}
function init(){
 try{const x=JSON.parse(localStorage.getItem("school.svg.fields")||"{}");fields.forEach(k=>{if(x[k])$(k).value=x[k];});$("gifCode").value=localStorage.getItem("school.svg.code")||"";}catch(e){}
 fields.forEach(k=>{$(k).addEventListener("change",save);$(k).addEventListener("input",save);});
 $("getPrompt").addEventListener("click",async()=>{const d=info();if(!d)return;$("promptText").value=prompt(d);$("promptArea").hidden=false;
  status(await copy($("promptText").value)?"Instructions copied. Open ChatGPT, paste the instructions, then paste the returned JSON code here.":"Instructions ready. Copy them and paste into ChatGPT.");
 });
 $("copyPrompt").addEventListener("click",async()=>status(await copy($("promptText").value)?"Instructions copied.":"Select the instructions and copy manually."));
 $("gifCode").addEventListener("input",()=>{model=null;stop();$("previewArea").hidden=true;$("download").hidden=true;try{if($("gifCode").value.length<225000)localStorage.setItem("school.svg.code",$("gifCode").value);}catch(e){}});
 $("previewBtn").addEventListener("click",()=>{try{model=loadCode($("gifCode").value);start();status("Preview ready. Check every anatomical structure and label.","success");}catch(e){status(e.message,"error");}});
 $("generate").addEventListener("click",make);
 $("clearCode").addEventListener("click",()=>{if(busy)return;$("gifCode").value="";model=null;stop();$("previewArea").hidden=true;$("download").hidden=true;try{localStorage.removeItem("school.svg.code");}catch(e){}status("Code cleared.");});
 status("Select your lesson, get the illustration code from ChatGPT, paste it here, and make the GIF.");
}
function save(){try{const d={};fields.forEach(k=>d[k]=$(k).value);localStorage.setItem("school.svg.fields",JSON.stringify(d));}catch(e){}}
init();
})();