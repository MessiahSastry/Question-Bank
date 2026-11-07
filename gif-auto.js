/* St. Patrick's School: zero-upload educational animation engine.
   Browser-only authored vector templates; not a general-purpose AI image model. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const C={navy:"#123a66",blue:"#2169a6",teal:"#0c9b99",ink:"#1b354f",muted:"#647990",line:"#d8e5f1"};
const W=900,H=1600;
let active=null,frame=0,timer=null,url=null,busy=false,blobWorker=null;
const cvs=$("stageCanvas"),ctx=cvs.getContext("2d");
function text(c,x,y,s,size=26,color=C.ink,bold=false,align="left"){
  c.fillStyle=color;c.textAlign=align;c.textBaseline="middle";
  c.font=(bold?"700 ":"400 ")+size+"px Arial, sans-serif";c.fillText(s,x,y);
}
function round(c,x,y,w,h,r,fill,stroke){
 c.beginPath();c.roundRect(x,y,w,h,r);
 if(fill){c.fillStyle=fill;c.fill();} if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}
}
function line(c,x,y,X,Y,color=C.ink,width=5,dash=[]){
 c.save();c.beginPath();c.moveTo(x,y);c.lineTo(X,Y);c.strokeStyle=color;c.lineWidth=width;c.lineCap="round";c.setLineDash(dash);c.stroke();c.restore();
}
function oval(c,x,y,rx,ry,fill,stroke=null,sw=3){
 c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);
 if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=sw;c.stroke();}
}
function arrow(c,x,y,X,Y,color=C.blue,size=16,width=6){
 line(c,x,y,X,Y,color,width);const a=Math.atan2(Y-y,X-x),l=size;
 c.beginPath();c.moveTo(X,Y);c.lineTo(X-l*Math.cos(a-.52),Y-l*Math.sin(a-.52));
 c.lineTo(X-l*Math.cos(a+.52),Y-l*Math.sin(a+.52));c.closePath();c.fillStyle=color;c.fill();
}
function curve(c,pts,color=C.blue,width=5,dash=[]){
 c.save();c.beginPath();c.moveTo(pts[0],pts[1]);
 for(let i=2;i<pts.length;i+=6)c.bezierCurveTo(...pts.slice(i,i+6));
 c.strokeStyle=color;c.lineWidth=width;c.lineCap="round";c.setLineDash(dash);c.stroke();c.restore();
}
function label(c,x,y,s,color=C.ink){
 round(c,x-8,y-18,Math.min(s.length*14+18,360),38,12,"#ffffffed",C.line);
 text(c,x,y,s,20,color,true);
}
function dot(c,x,y,r,color){oval(c,x,y,r,r,color);}
function wrap(c,s,x,y,maxWidth=735,size=28,lh=41,color=C.ink){
 c.fillStyle=color;c.font="400 "+size+"px Arial, sans-serif";c.textAlign="left";c.textBaseline="middle";
 const words=String(s).split(/\s+/);let row="",yy=y;
 for(const word of words){
  const test=row?row+" "+word:word;
  if(c.measureText(test).width>maxWidth&&row){c.fillText(row,x,yy);yy+=lh;row=word;}else row=test;
 }
 if(row)c.fillText(row,x,yy);
}
function poly(c,pts,fill,stroke=null,sw=3){
 c.beginPath();c.moveTo(pts[0][0],pts[0][1]);
 for(const p of pts.slice(1))c.lineTo(p[0],p[1]);c.closePath();
 if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=sw;c.stroke();}
}
function sun(c,x,y,r=51){
 for(let i=0;i<12;i++){const a=i*Math.PI/6;line(c,x+Math.cos(a)*(r+9),y+Math.sin(a)*(r+9),x+Math.cos(a)*(r+29),y+Math.sin(a)*(r+29),"#efae30",6);}
 oval(c,x,y,r,r,"#ffe59a","#ebae39",4);
}
function cloud(c,x,y,s=1){
 c.save();c.translate(x,y);c.scale(s,s);oval(c,-45,10,58,30,"#e4f2fc","#a5c6de",2);oval(c,0,-10,53,40,"#e4f2fc","#a5c6de",2);oval(c,58,10,56,32,"#e4f2fc","#a5c6de",2);round(c,-92,4,202,39,19,"#e4f2fc");c.restore();
}
function leaf(c,x,y,rx,ry,rot=0){
 c.save();c.translate(x,y);c.rotate(rot);
 c.beginPath();c.moveTo(-rx,0);c.quadraticCurveTo(-rx/3,-ry*1.35,rx,0);c.quadraticCurveTo(-rx/3,ry*1.35,-rx,0);c.closePath();
 c.fillStyle="#83c981";c.fill();c.strokeStyle="#329368";c.lineWidth=4;c.stroke();
 line(c,-rx+5,0,rx-7,0,"#277d53",3);
 for(let i=-2;i<=2;i++){let x0=i*rx/4;line(c,x0,0,x0+32,-ry*.65,"#438f66",2);line(c,x0,0,x0+32,ry*.65,"#438f66",2);}
 c.restore();
}
function flower(c,i){
 const cy=820;
 // petals in an anatomically schematic longitudinal section
 c.save();c.translate(450,cy);
 for(let a=-2;a<=2;a++){
  c.save();c.rotate(a*.38);
  c.beginPath();c.moveTo(0,70);c.bezierCurveTo(-95,-75,-135,-235,-48,-270);
  c.bezierCurveTo(31,-293,70,-95,0,70);c.closePath();c.fillStyle=a%2?"#f8a5bf":"#f7bfd0";c.fill();c.strokeStyle="#d36e93";c.lineWidth=3;c.stroke();c.restore();
 }
 c.restore();
 line(c,450,1010,450,1115,"#34845b",19);
 leaf(c,378,1058,71,23,-.35);leaf(c,522,1072,68,25,.35);
 // stamens and anthers
 curve(c,[437,962,354,886,326,736,315,654],"#47855b",9);
 curve(c,[461,963,535,882,558,734,576,665],"#47855b",9);
 oval(c,315,655,23,45,"#edba51","#aa7b20");oval(c,575,664,23,45,"#edba51","#aa7b20");
 // stigma / style / ovary cross-section
 oval(c,450,600,37,16,"#50a36a","#256f4a");
 line(c,450,613,450,944,"#eff6a0",20);
 oval(c,450,946,57,69,"#82b87e","#3d845e",5);
 oval(c,450,958,28,35,"#faf2c6","#b6ab65",3);
 oval(c,450,969,11,15,"#f4a84b","#a96c26",2);
 // process movements
 if(i>=1){
  for(let k=0;k<5;k++){let p=Math.min(1,(i===1?.22:.98));dot(c,322+(122*p)+k*6,615+(k%2)*12,6,"#e7a932");}
  arrow(c,346,565,424,592,"#dc8c20",13,5);
 }
 if(i>=2){dot(c,450,599,11,"#e6a328");}
 if(i>=3){const e=i===3?755:943;line(c,452,617,452,e,"#e68b31",10);dot(c,452,e,10,"#e68b31");}
 if(i>=4){dot(c,452,854,8,"#6c69b8");dot(c,452,903,8,"#6c69b8");}
 if(i>=5){dot(c,450,967,14,"#7762c4");}
 label(c,115,540,"Anther");line(c,236,545,300,637,C.muted,2);
 label(c,616,560,"Stigma");line(c,620,579,487,599,C.muted,2);
 label(c,615,792,"Style");line(c,605,799,470,786,C.muted,2);
 label(c,615,973,"Ovary");line(c,606,977,508,954,C.muted,2);
 label(c,102,1000,"Ovule");line(c,209,1005,424,964,C.muted,2);
}
function waterCycle(c,i){
 sun(c,185,503,51);cloud(c,580,531,1);
 // mountain / land / reservoir
 poly(c,[[90,905],[285,652],[421,858],[520,759],[768,924],[790,1090],[90,1090]],"#a5bf9f","#6e9e74");
 poly(c,[[239,708],[285,652],[341,745],[284,732]],"#f4fbff");
 round(c,92,985,705,117,25,"#78c1e0");
 for(let k=0;k<9;k++){const x=114+k*73;curve(c,[x,1024,x+13,1009,x+32,1036,x+56,1023],"#e5f6fc",3);}
 // evaporate
 for(let k=0;k<3;k++){
  let x=207+k*80;
  curve(c,[x,980,x-26,898,x+38,804,x+15,731],"#d28d2d",5,[8,8]);
  if(i===0||i===1)arrow(c,x+15,781,x+15,731,"#dc9a36",13,5);
 }
 if(i>=2){cloud(c,661,596,.7);label(c,472,460,"Condensation");}
 if(i>=3){for(let k=0;k<12;k++){const x=540+(k%6)*29,y=652+Math.floor(k/6)*48+(i===3?0:36);line(c,x,y,x-12,y+31,"#338fca",5);}}
 if(i>=4){arrow(c,640,905,498,1036,C.blue,15,8);}
 if(i>=5){for(let k=0;k<4;k++)arrow(c,325+k*42,1070,325+k*42,1100,"#3c819c",10,3);}
 label(c,94,610,"Sun");label(c,548,418,"Clouds");
 label(c,105,1122,"Surface water");
}
function photosynthesis(c,i){
 sun(c,177,535,54);
 // mature plant stem, leaves and roots
 line(c,452,768,452,1030,"#448d5f",15);
 leaf(c,355,753,117,64,-.26);
 leaf(c,544,708,125,63,.25);
 leaf(c,375,890,95,48,.3);
 leaf(c,531,892,91,49,-.23);
 round(c,125,1030,650,40,8,"#aa815c");
 for(let k=-2;k<=2;k++){curve(c,[451,1041,451+k*13,1087,455+k*36,1101,452+k*51,1140],"#98704c",7);}
 cloud(c,662,546,.5);
 if(i>=1){arrow(c,216,614,353,710,"#e8aa2b");label(c,104,650,"Light energy");}
 if(i>=2){arrow(c,685,625,581,708,C.teal);label(c,614,612,"CO2");}
 if(i>=3){arrow(c,297,1057,424,973,C.blue);label(c,143,989,"Water (H2O)");}
 if(i>=4){arrow(c,607,755,710,812,"#2b8eaf");label(c,615,846,"Oxygen (O2)");}
 if(i>=5){arrow(c,456,832,454,991,"#a36626");label(c,493,952,"Sugar (glucose)");}
 label(c,352,645,"Leaves");
}
function circuit(c,i){
 const lit=i>=2,wire=lit?"#da922c":"#63849b";
 // rectangle schematic: cell lower left, switch upper, lamp at right
 line(c,240,605,420,605,wire,9);
 line(c,516,605,678,605,wire,9);
 line(c,678,605,678,760,wire,9);line(c,678,924,678,1002,wire,9);
 line(c,678,1002,259,1002,wire,9);
 line(c,259,1002,259,853,wire,9);line(c,259,754,259,605,wire,9);
 // switch with 2 contacts
 dot(c,422,605,9,C.ink);dot(c,516,605,9,C.ink);
 line(c,422,605,i<2?487:516,i<2?555:605,C.ink,8);
 // battery vertical diagram on left
 line(c,230,810,288,810,"#184268",7);line(c,244,847,272,847,"#184268",6);
 text(c,190,809,"+",25,C.ink,true);text(c,195,854,"−",28,C.ink,true);
 // bulb at right; glass, socket, filament
 oval(c,678,833,57,67,lit?"#fff0a1":"#f1f7fb","#66859d",5);
 line(c,678,901,678,923,"#476c88",6);
 curve(c,[658,832,668,814,676,858,683,832,692,810,699,836],"#b68e32",5);
 for(let k=0;k<9&&lit;k++){const a=(k/9)*Math.PI*2;line(c,678+Math.cos(a)*82,833+Math.sin(a)*86,678+Math.cos(a)*104,833+Math.sin(a)*109,"#efae42",4);}
 if(lit){for(let k=0;k<8;k++){const t=(k+i*.14)/8;let x,y;if(t<.25){x=259+(678-259)*t*4;y=1002;}else if(t<.5){x=678;y=1002-(1002-605)*(t-.25)*4;}else if(t<.75){x=678-(678-259)*(t-.5)*4;y=605;}else{x=259;y=605+(1002-605)*(t-.75)*4;}dot(c,x,y,8,"#e99e20");}}
 label(c,170,701,"Battery");label(c,354,529,"Switch");label(c,642,755,"Bulb");
 label(c,402,1060,lit?"Closed circuit":"Open circuit",lit?"#217e58":"#9b6447");
}
function germination(c,i){
 round(c,110,946,680,160,18,"#c99c6b");
 for(let k=0;k<35;k++)dot(c,145+(k*67)%600,967+(k*29)%118,2.5,"#b78955");
 const grow=[0,.16,.40,.65,.85,1][i],stem=205*grow,root=172*grow;
 if(i>=1){curve(c,[455,961,469,996+root*.2,439,992+root*.7,450,976+root],"#faf6d7",13);}
 if(i>=3){
  line(c,450,955,450,955-stem,"#469965",11);
  if(i>=4){leaf(c,410,850-stem+120,53,27,-.4);leaf(c,486,840-stem+120,54,28,.4);}
  if(i>=5){leaf(c,400,777,75,34,-.3);leaf(c,502,778,75,34,.3);}
 }
 // seed and coat at surface
 oval(c,452,961,37,25,"#e7bd7e","#a7773b",4);
 oval(c,463,958,13,11,"#f7e1b6");
 if(i>=2){curve(c,[465,947,453,938,448,920,450,902],"#5d935d",7);}
 label(c,112,870,"Soil");
 if(i>=1){label(c,530,1038,"Radicle (root)");arrow(c,532,1055,469,1005+root*.6,C.muted,12,3);}
 if(i>=3){label(c,526,760,"Plumule (shoot)");arrow(c,538,778,451,955-stem,C.muted,12,3);}
}
function mitosis(c,i){
 const n=i===5?2:1,cy=794;
 function cell(cx,cy,rx,ry){oval(c,cx,cy,rx,ry,"#eaf4fc","#5b9abc",7);}
 if(n===1)cell(451,cy,235,235);
 else{cell(318,cy,145,185);cell(588,cy,145,185);}
 if(i===0){
  oval(c,450,cy,112,112,"#d4e5fa","#7798be",5);
  for(let k=0;k<14;k++){const a=k*2.399,r=28+(k%5)*15;curve(c,[450+Math.cos(a)*r,cy+Math.sin(a)*r,440+Math.cos(a+.2)*(r+26),cy+Math.sin(a+.2)*(r+30),465+Math.cos(a+1)*(r+5),cy+Math.sin(a+1)*r,450+Math.cos(a+.7)*r,cy+Math.sin(a+.7)*r],"#9671b4",3);}
 }else if(i===1){
  for(let k=0;k<5;k++)chrom(c,375+k*37,699+(k%3)*83,"#9370b6");
 }else if(i===2){
  for(let k=0;k<5;k++){const y=663+k*67;line(c,230,794,451,y,"#9dc3ae",2);line(c,671,794,451,y,"#9dc3ae",2);chrom(c,451,y,"#9165b4");}
 }else if(i===3){
  for(let k=0;k<5;k++){const y=648+k*73;line(c,220,794,356,y,"#a2bda7",2);line(c,676,794,547,y,"#a2bda7",2);smallV(c,356,y,false);smallV(c,547,y,true);}
 }else{
  for(let x of (i===4?[357,544]:[318,588])){
   oval(c,x,794,85,132,"#d4e5fa","#7798be",3);
   for(let k=0;k<5;k++)smallV(c,x+(k-2)*18,754+(k%3)*30,k%2===0);
  }
  if(i===4)line(c,451,578,451,1010,"#5b9abc",5,[12,10]);
 }
 label(c,106,1121,"Cell division");
}
function chrom(c,x,y,col){
 line(c,x-12,y-19,x+12,y+19,col,9);line(c,x+12,y-19,x-12,y+19,col,9);
 dot(c,x,y,5,"#584582");
}
function smallV(c,x,y,right){const t=right?1:-1;line(c,x+t*15,y-19,x,y,"#9165b4",7);line(c,x,y,x+t*15,y+19,"#9165b4",7);}
function fractions(c,i){
 const models=[[1,2],[2,4],[3,6],[4,8]],idx=Math.min(3,Math.floor(i*4/6)),b=models[idx];
 text(c,450,535,"Equivalent Fractions",36,C.navy,true,"center");
 for(let r=0;r<4;r++){
  const [part,tot]=models[r],y=630+r*132;
  round(c,143,y,555,91,8,"#fff","#8ba8c1");
  for(let k=0;k<tot;k++){
   const xx=145+k*551/tot,ww=551/tot-2;
   round(c,xx+1,y+3,ww,85,2,k<part?"#82c8be":"#eff5f9");
   if(k>0)line(c,xx,y+3,xx,y+88,"#7ea3b8",2);
  }
  text(c,733,y+44,part+"/"+tot,30,r===idx?"#116a88":C.ink,true);
  if(r===idx)round(c,130,y-11,674,110,12,null,"#208a9a");
 }
 text(c,450,1193,"Each shaded region is ONE HALF",27,C.ink,true,"center");
}
function reflection(c,i){
 // plane mirror with parallel hatch
 line(c,160,969,756,969,"#345f7d",10);
 for(let k=0;k<17;k++)line(c,175+k*34,982,160+k*34,1006,"#a2bacb",3);
 line(c,453,558,453,966,"#8cabbc",4,[12,10]);
 label(c,455,1090,"Plane mirror");
 label(c,463,529,"Normal");
 // incident and reflected rays
 arrow(c,195,591,452,968,"#cf7d42",19,8);
 if(i>=2)arrow(c,452,968,713,591,"#369bb9",19,8);
 if(i>=3){
  c.beginPath();c.arc(453,968,105,-Math.PI*.7,-Math.PI*.5);c.strokeStyle="#d08343";c.lineWidth=5;c.stroke();
  c.beginPath();c.arc(453,968,120,-Math.PI*.5,-Math.PI*.3);c.strokeStyle="#369bb9";c.lineWidth=5;c.stroke();
  text(c,364,805,"i",29,"#aa643b",true);text(c,541,805,"r",29,"#257b9d",true);
 }
 label(c,148,536,"Incident ray");
 if(i>=2)label(c,592,536,"Reflected ray");
}
function earthSun(c,i){
 sun(c,443,772,80);
 c.beginPath();c.ellipse(450,777,289,214,0,0,Math.PI*2);c.strokeStyle="#95b3c9";c.lineWidth=4;c.setLineDash([12,11]);c.stroke();c.setLineDash([]);
 const a=-1.55+i*Math.PI*2/6,ex=450+289*Math.cos(a),ey=777+214*Math.sin(a);
 oval(c,ex,ey,46,46,"#3f9fce","#2a79ad",3);
 poly(c,[[ex-14,ey-30],[ex+9,ey-23],[ex+19,ey-5],[ex-2,ey+8],[ex-17,ey+3]],"#55ad77");
 poly(c,[[ex+8,ey+10],[ex+30,ey+15],[ex+13,ey+39],[ex-6,ey+25]],"#55ad77");
 arrow(c,ex-12,ey-53,ex+23,ey-53,"#386e98",11,4);
 label(c,118,547,"Orbit (not to scale)");
 label(c,516,711,"Sun");label(c,Math.min(ex+48,679),ey+64,"Earth");
}
const scenes=[
 {id:"flower",name:"Sexual Reproduction in Flowering Plants",subject:"Biology",match:/pollination|fertili[sz]ation.*flower|sexual reproduction.*flower|reproduction.*flower|pollen tube/i,draw:flower,steps:[
 ["Flower structure","The stamen produces pollen. The pistil contains the stigma, style, ovary and ovules."],
 ["Pollination","Pollen is transferred from an anther to a stigma."],
 ["Germination of pollen","A compatible pollen grain germinates on the stigma."],
 ["Pollen tube growth","The pollen tube grows through the style towards an ovule."],
 ["Male gametes travel","Male gametes move through the pollen tube into the ovule."],
 ["Fertilisation","One male gamete fuses with the egg to form a zygote. Flowering plants also undergo a second fusion to form endosperm."]
 ]},
 {id:"water",name:"The Water Cycle",subject:"Science",match:/water cycle|hydrologic|evaporation.*condensation/i,draw:waterCycle,steps:[
 ["Water on Earth","Water is stored in rivers, lakes, oceans, soil and ice."],
 ["Evaporation","Solar heat changes liquid water to water vapour."],
 ["Condensation","Cooling water vapour condenses into small droplets that form clouds."],
 ["Precipitation","Water falls from clouds as rain, snow or hail."],
 ["Runoff","Water flows over land into rivers, lakes and oceans."],
 ["Infiltration","Some water seeps into the soil and groundwater. The cycle continues."]
 ]},
 {id:"photo",name:"Photosynthesis",subject:"Biology",match:/photosynthesis|how plants make food|plants make food/i,draw:photosynthesis,steps:[
 ["Green leaves","Leaves contain chlorophyll, which absorbs light for photosynthesis."],
 ["Light energy","Sunlight provides the energy needed for the process."],
 ["Carbon dioxide","Carbon dioxide enters leaves, mainly through stomata."],
 ["Water","Roots absorb water, which is transported through the plant."],
 ["Oxygen","Oxygen is released during photosynthesis."],
 ["Glucose","The plant produces sugars. Overall: carbon dioxide + water → glucose + oxygen, using light energy."]
 ]},
 {id:"circuit",name:"Electric Circuit",subject:"Physics",match:/electric circuit|simple circuit|open.*closed.*circuit|current electricity|battery.*bulb/i,draw:circuit,steps:[
 ["Components","A simple circuit needs a source, conducting wires, a switch and a lamp."],
 ["Open switch","When the switch is open, the conducting path is broken."],
 ["Close the switch","Closing the switch completes the conducting path."],
 ["Current flows","Conventional current flows around a complete circuit from positive to negative externally."],
 ["Bulb lights","Electrical energy is transferred to light and thermal energy."],
 ["Switch off / on","Opening the switch breaks the circuit. Closing it allows current to flow again."]
 ]},
 {id:"seed",name:"Seed Germination",subject:"Biology",match:/seed germination|germination of seed|seed to plant|sprouting/i,draw:germination,steps:[
 ["Dry seed","A seed contains an embryo and a food reserve, protected by a seed coat."],
 ["Water absorption","The seed absorbs water and begins metabolic activity."],
 ["Radicle emerges","The embryonic root (radicle) emerges first."],
 ["Shoot grows","The embryonic shoot grows upward towards light."],
 ["First leaves","The young shoot develops leaves as food reserves are used."],
 ["Seedling","The seedling continues growing, and photosynthesis supports further growth."]
 ]},
 {id:"mitosis",name:"Mitosis — Cell Division",subject:"Biology",match:/mitosis|mitotic cell|cell division/i,draw:mitosis,steps:[
 ["Interphase (before mitosis)","DNA is replicated before mitosis; it remains largely uncondensed."],
 ["Prophase","Chromosomes condense and spindle structures begin to form."],
 ["Metaphase","Chromosomes align at the cell's equator."],
 ["Anaphase","Sister chromatids separate towards opposite poles."],
 ["Telophase","Two new nuclei form around the separated chromosomes."],
 ["Cytokinesis","The cytoplasm divides, yielding two genetically similar daughter cells (in this animal-cell diagram)."]
 ]},
 {id:"frac",name:"Equivalent Fractions",subject:"Mathematics",match:/equivalent fraction|one half|fractions?|fractional/i,draw:fractions,steps:[
 ["One half","Shading one of two equal parts gives 1/2."],
 ["Two quarters","Shading two of four equal parts gives 2/4."],
 ["Three sixths","Shading three of six equal parts gives 3/6."],
 ["Four eighths","Shading four of eight equal parts gives 4/8."],
 ["Same value","The shaded area stays the same even though the parts are smaller."],
 ["Equivalent fractions","1/2 = 2/4 = 3/6 = 4/8."]
 ]},
 {id:"light",name:"Reflection of Light",subject:"Physics",match:/reflection of light|laws? of reflection|plane mirror/i,draw:reflection,steps:[
 ["Plane mirror","A plane mirror has a reflecting surface."],
 ["Incident ray","The incoming light ray reaches the mirror at the point of incidence."],
 ["Reflected ray","Light changes direction and travels away from the mirror."],
 ["Normal","The normal is perpendicular to the mirror at the point of incidence."],
 ["Angles","Measure the angle of incidence and reflection relative to the normal."],
 ["Law of reflection","Angle of incidence (i) equals angle of reflection (r). Both rays and normal lie in one plane."]
 ]},
 {id:"orbit",name:"Earth's Revolution Around the Sun",subject:"Science",match:/earth.*revolution|revolution.*earth|earth.*orbit|earth around sun|planetary revolution/i,draw:earthSun,steps:[
 ["Sun and Earth","Earth is a planet orbiting the Sun. The illustration is not to scale."],
 ["Orbit","Earth travels around the Sun in an approximately elliptical orbit."],
 ["Revolution","A complete revolution takes about 365.25 days."],
 ["Axial tilt","Earth's tilted axis causes changes in solar illumination over the year."],
 ["Seasons","Earth's axial tilt, together with revolution, produces seasons."],
 ["One year","After one complete orbit, approximately one year has passed."]
 ]}
];
function identify(s){
 const t=(s||"").trim();
 return scenes.find(p=>p.match.test(t))||null;
}
function render(p,i,c,w,h,cl,sub,chapter,topic){
 c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,w,h);c.save();c.scale(w/W,h/H);
 c.fillStyle="#f2f7fc";c.fillRect(0,0,W,H);
 const grad=c.createLinearGradient(0,0,900,220);grad.addColorStop(0,"#113c6c");grad.addColorStop(1,"#1674a2");
 c.fillStyle=grad;c.fillRect(0,0,900,250);
 text(c,450,61,"ST. PATRICK'S SCHOOL",38,"white",true,"center");
 text(c,450,112,"EDUCATIONAL ANIMATION",20,"#bde7f3",true,"center");
 text(c,450,167,topic.length>44?topic.slice(0,41)+"…":topic,32,"white",true,"center");
 text(c,450,211,cl+"  •  "+sub,21,"#e0f0fa",false,"center");
 round(c,56,274,788,66,17,"#e3effa");
 text(c,78,305,(chapter||p.name).slice(0,57),22,C.navy,true);
 round(c,55,367,790,865,23,"white",C.line);
 // top-right scene badge and progress bars
 text(c,94,407,p.name.length>37?p.name.slice(0,34)+"…":p.name,25,C.navy,true);
 for(let j=0;j<6;j++)round(c,91+j*120,438,107,8,4,j<=i?C.teal:"#e2ebf2");
 c.save();c.beginPath();c.rect(69,474,761,718);c.clip();p.draw(c,i);c.restore();
 round(c,55,1252,790,255,21,"white",C.line);
 round(c,76,1272,146,37,16,"#e1f4ee");
 text(c,149,1290,"STEP "+(i+1)+" / 6",18,"#136b60",true,"center");
 text(c,78,1350,p.steps[i][0],31,C.navy,true);
 wrap(c,p.steps[i][1],78,1402,720,27,41,C.ink);
 text(c,450,1559,"St. Patrick's School  •  Concept animations",18,C.muted,false,"center");
 c.restore();
}
function fillFields(p){
 if(!$("topic").value)$("topic").value=p.name;
 if(!$("subject").value)$("subject").value=p.subject;
}
function stopPreview(){if(timer){clearInterval(timer);timer=null;}}
function setStatus(msg,state){const el=$("status");el.textContent=msg;el.dataset.state=state||"info";}
function displayPreview(p){
 stopPreview();active=p;frame=0;
 const data=details(false);render(p,frame,ctx,cvs.width,cvs.height,data.cl,data.sub,data.chapter,data.topic||p.name);
 timer=setInterval(()=>{if(busy)return;frame=(frame+1)%6;const d=details(false);render(p,frame,ctx,cvs.width,cvs.height,d.cl,d.sub,d.chapter,d.topic||p.name);},1250);
 $("previewArea").hidden=false;
}
function details(validate=true){
 const cl=$("class").value,sub=$("subject").value,chapter=$("chapter").value.trim(),topic=$("topic").value.trim();
 if(validate&&(!cl||!sub||!topic)){setStatus("Select Class and Subject, and enter a Topic.","error");return null;}
 return {cl,sub,chapter,topic};
}
function choose(s){
 const p=identify(s);
 if(!p){active=null;$("previewArea").hidden=true;stopPreview();return null;}
 displayPreview(p);return p;
}
function filename(s){return (s.replace(/[^a-z0-9 ]/gi," ").trim().replace(/\s+/g,"-").slice(0,72)||"Educational-GIF")+".gif";}
async function ensureEncoder(){
 if(!window.GIF)throw Error("The free GIF encoder could not load. Check your internet connection and reload.");
 if(blobWorker)return blobWorker;
 const response=await fetch("https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js");
 if(!response.ok)throw Error("Cannot load GIF encoder worker.");
 const js=await response.text();
 blobWorker=URL.createObjectURL(new Blob([js],{type:"application/javascript"}));return blobWorker;
}
async function generate(){
 const d=details();if(!d||busy)return;
 const p=identify(d.topic+" "+d.chapter);
 if(!p){setStatus("This topic is not supported yet. Select one of the available textbook-style animations below. Generating arbitrary topics would require an AI model or a prepared diagram.","error");$("previewArea").hidden=true;stopPreview();return;}
 const vals=$("resolution").value.split("x").map(Number),w=vals[0],h=vals[1];
 busy=true;$("generate").disabled=true;stopPreview();$("download").hidden=true;
 if(url){URL.revokeObjectURL(url);url=null;}
 try{
  setStatus("Preparing the 6 scientific animation stages...");
  const worker=await ensureEncoder();
  const gif=new GIF({workers:1,quality:w>=1000?13:9,repeat:0,width:w,height:h,workerScript:worker});
  const out=document.createElement("canvas");out.width=w;out.height=h;const c=out.getContext("2d",{willReadFrequently:true});
  for(let i=0;i<6;i++){
   render(p,i,c,w,h,d.cl,d.sub,d.chapter,d.topic);
   gif.addFrame(c,{copy:true,delay:i===5?1800:1200,dispose:2});
   setStatus("Prepared stage "+(i+1)+" of 6. Encoding GIF...");
   await new Promise(r=>setTimeout(r,12));
  }
  await new Promise((resolve,reject)=>{
   const watchdog=setTimeout(()=>reject(Error("GIF encoding took too long. Try a smaller resolution.")),150000);
   gif.on("progress",v=>setStatus("Encoding animated GIF: "+Math.round(v*100)+"%"));
   gif.on("finished",blob=>{
    clearTimeout(watchdog);
    url=URL.createObjectURL(blob);
    $("preview").src=url;$("download").href=url;$("download").download=filename(d.topic);
    $("download").hidden=false;
    $("download").textContent="Download GIF ("+(blob.size/1048576).toFixed(1)+" MB)";
    resolve();
   });
   try{gif.render();}catch(err){clearTimeout(watchdog);reject(err);}
  });
  setStatus("GIF ready! All 6 stages are animated. Download the result.","success");
  displayPreview(p);
 }catch(e){setStatus("Could not generate GIF: "+(e&&e.message||e),"error");}
 finally{busy=false;$("generate").disabled=false;}
}
function init(){
 $("availableTopics").innerHTML=scenes.map(p=>'<button type="button" class="topicChip" data-topic="'+p.id+'">'+p.name+'</button>').join("");
 $("availableTopics").addEventListener("click",e=>{
  const chip=e.target.closest("[data-topic]");if(!chip)return;
  const p=scenes.find(p=>p.id===chip.dataset.topic);
  if(!p)return;
  $("topic").value=p.name;$("subject").value=p.subject;
  if(!$("class").value)$("class").value="10th Class";
  displayPreview(p);setStatus("Ready to create: "+p.name+". Select Create GIF.");
 });
 $("topic").addEventListener("input",()=>{
  const p=identify($("topic").value);if(p){fillFields(p);choose($("topic").value);}
  else {active=null;$("previewArea").hidden=true;stopPreview();}
 });
 $("generate").addEventListener("click",generate);
 $("resolution").addEventListener("change",()=>{
  if($("resolution").value==="1080x1920")setStatus("Full HD portrait uses more memory on mobile devices. If generation fails, choose 540 × 960.");
 });
 $("class").value="10th Class";
 setStatus("Choose a supported topic below, or enter one in the Topic field.");
}
init();
})();