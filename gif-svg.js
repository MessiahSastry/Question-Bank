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
'{"format":"school-gif-v1","title":"Lesson title","baseSvg":"<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 900 1200\\" width=\\"900\\" height=\\"1200\\">...FULL DETAIL...</svg>","frames":[{"stage":"Stage name","explanation":"Concise scientific explanation","overlay":"<g>...stage-specific animation overlay...</g>"}]}',
"",
"VISUAL QUALITY: This is for school lessons, not an icon set. The SVG must be a comprehensive high-detail textbook illustration. Draw accurately proportioned structures using numerous organic SVG paths, fine outlines, subtle gradients, layers and cross-sectional anatomy. Label the correct parts with legible leader lines. Every relevant internal structure must be drawn; no cartoon flowers, stick figures, emoji, crude circles, simplistic flowchart, or merely decorative shapes. For mathematics use exact geometric constructions instead.",
"The baseSvg is the original detailed illustration and stays IDENTICAL across all frames. Add motion/progression using overlay layers in each frame, with accurate position, arrows, highlights, transport paths and formation stages as scientifically applicable. Do not simply blink labels. Build 6–8 stages that actually explain the process.",
"Use professional textbook colours, sensible scale and accurate structure orientation. The full artwork should fill most of the 900x1200 portrait canvas without cramped overlapping labels. Show separate cutaway or inset illustrations within this canvas where needed. Include all stable labels in baseSvg and varying markers and arrows in each overlay. Keep the illustration stationary across frames.",
"Use only svg,g,defs,linearGradient,radialGradient,stop,path,line,polyline,polygon,circle,ellipse,rect,text,tspan,marker,clipPath,mask,pattern,filter,feGaussianBlur,feOffset,feMerge,feMergeNode,feDropShadow.",
"All gradients and marker definitions go inside baseSvg. Use url(#id) references only. No embedded images, external URLs, base64, scripts, JavaScript, CSS, foreignObject, SVG animation elements, file loading, font downloads or external assets. SVG xmlns MUST be http://www.w3.org/2000/svg, base viewBox exactly 0 0 900 1200, and frame overlays must be SVG fragments (<g>...</g>).",
"Each frame has a clearly distinct accurate stage, a short title, and a concise scientifically correct explanation (preferably 15–28 words) that fits in four readable lines. No extra headings inside the SVG; the school app supplies the title, class and captions.",
"All double quotes inside SVG strings MUST be correctly escaped for valid JSON. No trailing commas or comments. Deliver self-contained original vector illustration code, not Python. The user will paste this JSON in a browser GIF creator.",
"Important for mobile clarity: all SVG structure labels must use a minimum font-size of 36px, preferably 38-46px, bold or semi-bold, in high-contrast colours. Keep every label and leader line away from the outer 35px edges and do not overlap anatomy or other labels.",
"Use the full SVG canvas for the illustration, internal labels and leader lines. The app provides an entirely separate, non-overlapping explanation region INSIDE the final GIF image, below the complete SVG illustration. Do not put stage captions or the explanation inside SVG, and do not leave artificial blank margins. Place every label at least 45 SVG units inside the outer edges, with no clipping or overlap.",
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
  r.setAttribute("width",String(v[2]));r.setAttribute("height",String(v[3]));
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
function short(c,s,max){s=String(s);if(c.measureText(s).width<=max)return s;while(c.measureText(s+"…").width>max&&s.length>5)s=s.slice(0,-1);return s+"…";}
function paragraphLines(c,s,maxWidth,size){
 c.font="600 "+size+"px Arial,sans-serif";
 const rows=[];let row="";
 for(const word of String(s||"").trim().split(/\s+/)){
  if(!word)continue;
  const next=row?row+" "+word:word;
  if(c.measureText(next).width>maxWidth&&row){rows.push(row);row=word;}else row=next;
 }
 if(row)rows.push(row);
 return rows;
}
function explanation(c,s,x,top,maxWidth=745){
 // Fit long scientific captions without covering the diagram or spilling out of the GIF.
 let font=29,rows=paragraphLines(c,s,maxWidth,font);
 while(rows.length>5&&font>22){font--;rows=paragraphLines(c,s,maxWidth,font);}
 const lineHeight=font+12;
 const bottomLimit=1463;
 c.font="600 "+font+"px Arial,sans-serif";
 c.textAlign="left";c.textBaseline="middle";c.fillStyle="#173954";
 rows.slice(0,5).forEach((row,i)=>{
  if(top+i*lineHeight>bottomLimit)return;
  if(i===4&&rows.length>5)row=short(c,row+"…",maxWidth);
  c.fillText(short(c,row,maxWidth),x,top+i*lineHeight);
 });
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
 c.setTransform(1,0,0,1,0,0);
 c.clearRect(0,0,w,h);
 c.save();c.scale(w/900,h/1600);
 c.fillStyle="#f4f8fb";c.fillRect(0,0,900,1600);

 // Compact school header.
 const grad=c.createLinearGradient(0,0,900,185);
 grad.addColorStop(0,"#103c6a");grad.addColorStop(1,"#1475a1");
 c.fillStyle=grad;c.fillRect(0,0,900,187);
 label(c,"St. Patrick's School",450,56,41,"#fff",true,"center");
 label(c,(d.class||"Class")+"  •  "+(d.subject||"Subject"),450,111,25,"#deeffb",false,"center");
 c.font="700 33px Arial";
 label(c,short(c,d.topic||model.title,825),450,156,33,"#fff",true,"center");

 // The original SVG is fitted ENTIRELY within an independent scientific diagram area.
 // Neither its text nor its leaders can be covered by the explanation area.
 const fig={x:27,y:204,w:846,h:929};
 shape(c,fig.x,fig.y,fig.w,fig.h,22,"#fff","#d3e1ec");
 const inset={x:46,y:221,w:808,h:895};
 const iw=img.naturalWidth||900,ih=img.naturalHeight||1200;
 const fit=Math.min(inset.w/iw,inset.h/ih);
 const dw=iw*fit,dh=ih*fit;
 c.save();c.beginPath();c.rect(inset.x,inset.y,inset.w,inset.h);c.clip();
 c.drawImage(img,inset.x+(inset.w-dw)/2,inset.y+(inset.h-dh)/2,dw,dh);
 c.restore();

 // Explanation is within this GIF but OUTSIDE the source diagram area.
 const cap={x:27,y:1147,w:846,h:357};
 shape(c,cap.x,cap.y,cap.w,cap.h,22,"#f3faff","#d2e6ef");
 c.fillStyle="#168391";c.fillRect(49,1170,5,44);
 shape(c,65,1171,186,48,18,"#d9f0e7");
 label(c,"STAGE "+(i+1)+" / "+model.frames.length,158,1196,23,"#126b5e",true,"center");
 const name=String(f.name||"Stage").replace(/^\s*\d+\s*[.)-]\s*/,"").trim();
 c.font="700 33px Arial";
 label(c,short(c,name,568),271,1197,33,"#103b67",true);
 c.fillStyle="#cfe4ec";c.fillRect(64,1239,768,2);
 explanation(c,f.detail,70,1283,760);

 c.font="500 21px Arial";
 label(c,short(c,d.chapter||model.title,822),450,1554,21,"#516f85",false,"center");
 c.restore();
}
function stop(){if(timer){clearTimeout(timer);timer=null;}}
function speed(){const n=Number($("speed").value);return Number.isFinite(n)&&n>0?n:1;}
async function show(i){const v=++drawVersion;try{await draw(i,pc,preview.width,preview.height);if(v===drawVersion)step=i;}catch(e){status("Preview error: "+e.message,"error");}}
function start(){
 stop();$("previewArea").hidden=false;
 const schedule=()=>{if(!model)return;timer=setTimeout(async()=>{
  if(!busy&&model)await show((step+1)%model.frames.length);
  if(model)schedule();
 },Math.round((step===model.frames.length-1?4200:3500)/speed()));};
 show(0).then(()=>schedule());
}
function lock(v){busy=v;["getPrompt","generate"].forEach(id=>$(id).disabled=v);}
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
 const selectedSpeed=speed();
 stop();lock(true);$("download").hidden=true;
 if(gifUrl){URL.revokeObjectURL(gifUrl);gifUrl=null;}
 try{
  status("Preparing the textbook illustration...");
  const workerScript=await worker(),out=document.createElement("canvas");out.width=w;out.height=h;
  const render=out.getContext("2d");
  const gif=new GIF({workerScript,workers:1,width:w,height:h,quality:w>=1000?14:10,repeat:0});
  for(let i=0;i<model.frames.length;i++){
   await draw(i,render,w,h);
   gif.addFrame(render,{copy:true,delay:Math.round((i===model.frames.length-1?4200:3500)/selectedSpeed),dispose:2});
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
function enhanceSelects(){
 const selects=[...document.querySelectorAll("select[data-modern='true']")];
 let current=null;
 function close(){
  if(!current)return;
  current.root.classList.remove("open");
  current.button.setAttribute("aria-expanded","false");
  current=null;
 }
 selects.forEach(sel=>{
  const host=document.createElement("div");host.className="smart-select";
  const button=document.createElement("button");button.type="button";button.className="select-trigger";
  button.setAttribute("aria-expanded","false");button.setAttribute("aria-haspopup","listbox");
  button.id=sel.id+"-trigger";
  const fieldLabel=sel.parentNode.querySelector("label");
  if(fieldLabel)fieldLabel.htmlFor=button.id;
  const value=document.createElement("span");value.className="value";
  const chev=document.createElement("span");chev.className="chevron";chev.textContent="⌄";
  button.append(value,chev);
  const panel=document.createElement("div");panel.className="option-panel";panel.setAttribute("role","listbox");
  const options=[...sel.options],controls=[];
  let search=null;
  if(options.length>9){
   search=document.createElement("input");search.className="option-search";search.type="search";
   search.placeholder="Search…";search.setAttribute("aria-label","Search options");panel.appendChild(search);
  }
  function refresh(){
   const selected=options.find(opt=>opt.value===sel.value)||options[0];
   value.textContent=selected?selected.textContent:"Select";
   controls.forEach(item=>item.setAttribute("aria-selected",String(item.dataset.value===sel.value)));
  }
  for(const opt of options){
   const item=document.createElement("button");item.type="button";item.className="option-item";
   item.setAttribute("role","option");item.textContent=opt.textContent;item.dataset.value=opt.value;
   item.addEventListener("click",()=>{
    sel.value=opt.value;sel.dispatchEvent(new Event("change",{bubbles:true}));
    refresh();close();button.focus();
   });
   controls.push(item);panel.appendChild(item);
  }
  if(search)search.addEventListener("input",()=>{
   const q=search.value.toLocaleLowerCase();
   controls.forEach(item=>item.hidden=!item.textContent.toLocaleLowerCase().includes(q));
  });
  button.addEventListener("click",()=>{
   if(current&&current.root===host){close();return;}
   close();host.classList.add("open");button.setAttribute("aria-expanded","true");current={root:host,button};
   if(search){search.value="";controls.forEach(item=>item.hidden=false);search.focus();}
  });
  button.addEventListener("keydown",e=>{
   if(["ArrowDown","Enter"," "].includes(e.key)){
    e.preventDefault();if(!host.classList.contains("open"))button.click();
    if(!search)(controls.find(c=>c.dataset.value===sel.value)||controls[0]).focus();
   }
  });
  panel.addEventListener("keydown",e=>{
   if(e.key==="Escape"){close();button.focus();return;}
   const list=controls.filter(v=>!v.hidden),n=list.indexOf(document.activeElement);
   if((e.key==="ArrowDown"||e.key==="ArrowUp")&&list.length){
    e.preventDefault();list[(n+(e.key==="ArrowDown"?1:-1)+list.length)%list.length].focus();
   }
  });
  sel.addEventListener("change",refresh);
  sel.classList.add("enhanced-native");
  sel.parentNode.insertBefore(host,sel.nextSibling);host.append(button,panel);refresh();
 });
 document.addEventListener("pointerdown",e=>{if(current&&!current.root.contains(e.target))close();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape")close();});
}
function init(){
 try{
  const x=JSON.parse(localStorage.getItem("school.svg.fields")||"{}");
  fields.forEach(k=>{if(x[k])$(k).value=x[k];});
  $("gifCode").value=localStorage.getItem("school.svg.code")||"";
  const oldSpeed=localStorage.getItem("school.svg.speed");
  if(["0.5","0.75","1","1.5","2"].includes(oldSpeed))$("speed").value=oldSpeed;
 }catch(e){}
 fields.forEach(k=>{$(k).addEventListener("change",save);$(k).addEventListener("input",save);});
 $("speed").addEventListener("change",()=>{
  try{localStorage.setItem("school.svg.speed",$("speed").value);}catch(e){}
  if(model&&!busy)start();
  if(!$("download").hidden){
   $("download").hidden=true;
   status("Speed updated. Press Create GIF to download with the new speed.");
  }
 });
 enhanceSelects();
 $("getPrompt").addEventListener("click",()=>{
  const d=info();if(!d)return;
  const msg=prompt(d);
  // Same prefilled-prompt link pattern already used in the school's Quiz Creator.
  const url="https://chatgpt.com/?prompt="+encodeURIComponent(msg);
  window.open(url,"_blank","noopener,noreferrer");
 });
 $("gifCode").addEventListener("input",()=>{
  model=null;stop();$("previewArea").hidden=true;$("download").hidden=true;
  try{if($("gifCode").value.length<=450000)localStorage.setItem("school.svg.code",$("gifCode").value);}catch(e){}
 });
 $("generate").addEventListener("click",make);
 status("Paste the illustration code from ChatGPT, then tap Create GIF.");
}
function save(){try{const d={};fields.forEach(k=>d[k]=$(k).value);localStorage.setItem("school.svg.fields",JSON.stringify(d));}catch(e){}}
init();
})();