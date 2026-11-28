// Synthetic pixel fixtures and scan-review controls. No student photos/data.
// Run: node --test tests/omr-*.test.cjs
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../omr.html'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function section(a,b){const start=html.indexOf(a),end=html.indexOf(b,start);assert.ok(start>=0&&end>start,a);return html.slice(start,end);}
const source=[
  section('function omrNorm(value){','function selectedEffectiveExam(){'),
  section('const OMR_RING_DIRECTIONS =','// Average brightness in a patch'),
  section('function decodeAnswersFromFrame(','function getOmrKeyDetails(entry){'),
  section('function getOmrKeyDetails(entry){','// EvalBee-style result overlay:'),
  section('function scoreAnswers(answers, key, sections) {','function configuredPartNames(subjectName){'),
  section('function omrRecognitionReviewQuestions(out){','async function saveScanToFirestore(out) {'),
  section('function renderOmrQuestionReview(out,onScoreChanged,onReadyChanged){','async function finalizeScanSave(out) {')
].join('\n');

function harness(){
  const fixed=new Map(),openDialogs=new Set(),alerts=[],saved=[],prompts=[];
  class Element{
    constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.style={};this.listeners={};this.className='';this.id='';this.max='';this._value='';this.checked=false;this.disabled=false;this.open=false;this.innerHTML='';this.textContent='';}
    set value(v){this._value=String(v);}get value(){return this._value;}
    append(...items){this.children.push(...items);}appendChild(item){this.append(item);return item;}
    replaceChildren(...items){this.children=items;}
    addEventListener(name,callback){(this.listeners[name]||= []).push(callback);}
    async dispatch(name){const event={target:this,preventDefault(){}};for(const fn of this.listeners[name]||[])await fn(event);if(this['on'+name])await this['on'+name](event);}
    all(){return this.children.flatMap(child=>[child,...child.all()]);}
    querySelectorAll(selector){return this.all().filter(item=>selector.startsWith('.')&&item.className.split(' ').includes(selector.slice(1)));}
    querySelector(selector){if(selector==='.content')return this.content||null;return this.all().find(item=>selector==='#'+item.id)||null;}
    focus(){this.focused=true;}
    close(){this.open=false;openDialogs.delete(this);}
    showModal(){assert.equal(openDialogs.size,0,'Scan review and confirmation must not be stacked');this.open=true;openDialogs.add(this);}
    setAttribute(name){if(name==='open'){this.open=true;openDialogs.add(this);}}
  }
  for(const id of ['dlgScanReview','scanReviewRoll','scanReviewMarks','btnScanCancel','btnScanEdit','btnScanSave','btnScanReviewClose','scanReviewImageWrap','scanReviewImage','scanReviewSections','scanReviewSummary','scanReviewRollText','scanReviewMarksText','scanReviewEditFields','scanReviewWarning','scanReviewStudentText','dlgCamera','scanReviewQuestions','pickStatus','cameraHint']){
    const element=new Element(id.startsWith('dlg')?'dialog':'div');element.id=id;fixed.set(id,element);
  }
  fixed.get('dlgScanReview').content=new Element();
  const ctx={console,alerts,saved,prompts,document:{createElement:tag=>new Element(tag)},
    el:id=>fixed.get(id)||[...fixed.values()].flatMap(element=>element.all()).find(element=>element.id===id)||null,
    requestAnimationFrame:fn=>{fn();return 1;},lastScanPending:null,isScanBusy:true,isCameraOpen:false,stream:null,
    lastDeclinedSheetFingerprint:null,scanReplacementApprovals:new WeakMap(),lastBubbleRecognitionMeta:{},
    getPageScaleFromAnchors:()=>({scaleAvg:4}),mapPageMmToPixel:(x,y)=>({x:x*4,y:y*4}),
    tpl:{sections:[{name:'Biology',count:40,options:4,mark:1,negative:0}]},
    answerKey:{Biology:Object.fromEntries(Array.from({length:40},(_,i)=>[i+1,['A']]))},
    getPartMaximum:()=>40,getSubjectMaximum:()=>40,
    findStudentByRoll:async roll=>({id:'student-'+roll,name:'Student '+roll}),
    alert:message=>alerts.push(String(message)),
    finalizeScanSave:async out=>{saved.push(clone(out));return true;},
    omrDuplicateNames:()=> 'Biology — OMR',
    appConfirm:async options=>{assert.equal(fixed.get('dlgScanReview').open,false);prompts.push(options);return ctx.confirmResult;},confirmResult:false
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);
  const out=(extra={})=>({examId:'SA1',classId:'class7',sectionId:'A',roll:'46',selectedSubjects:['Biology'],subjectName:'Biology',
    partBySubject:{Biology:'OMR'},answers:{Biology:{31:['A','D']}},score:{total:0,perSection:{Biology:0}},recognitionMeta:{uncertain:[]},recognitionWarnings:[],...extra});
  return {ctx,fixed,alerts,saved,prompts,out};
}

function pixelSheet({erase=[],filled=[],shift=0}={}){
  const width=840,height=1188,data=new Uint8ClampedArray(width*height*4);data.fill(255);
  const bubbles=[];
  for(let q=1;q<=40;q++)for(let option=0;option<4;option++){
    const xMm=18+Math.floor((q-1)/10)*45+option*6,yMm=70+((q-1)%10)*7,rMm=2.2;
    bubbles.push({q,opt:'ABCD'[option],xMm:xMm+shift,yMm,rMm});
    if(erase.includes(q+':'+option))continue;
    const cx=xMm*4,cy=yMm*4,r=rMm*4,isFilled=filled.includes(q+':'+option);
    for(let y=Math.floor(cy-r-2);y<=cy+r+2;y++)for(let x=Math.floor(cx-r-2);x<=cx+r+2;x++){
      const distance=Math.hypot(x-cx,y-cy);
      if(Math.abs(distance-r)<=.85||(isFilled&&distance<r*.85)){
        const index=(y*width+x)*4;data[index]=data[index+1]=data[index+2]=35;
      }
    }
  }
  const context={canvas:{width,height},getImageData:(x,y,w,h)=>{
    if(x===0&&y===0&&w===width&&h===height)return {data};
    const out=new Uint8ClampedArray(w*h*4);
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
      const from=((y+yy)*width+x+xx)*4,to=(yy*w+xx)*4;
      for(let c=0;c<4;c++)out[to+c]=data[from+c];
    }
    return {data:out};
  }};
  return {context,rois:{sections:[{name:'Biology',bubbles}]},anchors:{}};
}

test('two whitened outlines in one row reach review with the visible marks intact',()=>{
  const h=harness(),sheet=pixelSheet({erase:['5:1','5:2'],filled:['5:0','5:3']});
  const calibration=h.ctx.calibrateOmrBubbleCenters(sheet.context,sheet.rois,sheet.anchors,2);
  assert.equal(calibration.ok,true);assert.equal(calibration.damagedAnswerRows,1);
  const answers=h.ctx.decodeAnswersFromFrame(sheet.context,sheet.context.canvas,sheet.rois,sheet.anchors);
  assert.deepEqual(clone(answers.Biology[5]),['A','D']);
  const damaged=h.ctx.lastBubbleRecognitionMeta.uncertain.filter(item=>item.question===5);
  assert.deepEqual(clone(damaged.map(item=>item.option)),['B','C']);
  assert.ok(damaged.every(item=>item.reason==='damaged-outline'));
});

test('an entirely erased question is reviewed using intact neighbouring rows',()=>{
  const h=harness(),sheet=pixelSheet({erase:['5:0','5:1','5:2','5:3']});
  assert.equal(h.ctx.calibrateOmrBubbleCenters(sheet.context,sheet.rois,sheet.anchors,2).ok,true);
  h.ctx.decodeAnswersFromFrame(sheet.context,sheet.context.canvas,sheet.rois,sheet.anchors);
  assert.equal(h.ctx.lastBubbleRecognitionMeta.uncertain.filter(item=>item.question===5).length,4);
});

test('blank printed circles do not become answers',()=>{
  const h=harness(),sheet=pixelSheet();
  assert.equal(h.ctx.calibrateOmrBubbleCenters(sheet.context,sheet.rois,sheet.anchors,2).ok,true);
  const answers=h.ctx.decodeAnswersFromFrame(sheet.context,sheet.context.canvas,sheet.rois,sheet.anchors);
  assert.equal(Object.keys(answers.Biology).length,0);
  assert.equal(h.ctx.lastBubbleRecognitionMeta.uncertainCount,0);
});

test('widespread missing rings or a wrong layout still reject the capture',()=>{
  const h=harness();
  const erased=Array.from({length:20},(_,i)=>Array.from({length:4},(_,o)=>(i+1)+':'+o)).flat();
  const bad=pixelSheet({erase:erased});bad.anchors.bubbleCenters=new Map([['stale',{x:1,y:1}]]);
  assert.equal(h.ctx.calibrateOmrBubbleCenters(bad.context,bad.rois,bad.anchors,2).ok,false);
  assert.equal(bad.anchors.bubbleCenters,undefined);
  const shifted=pixelSheet({shift:3});
  assert.equal(h.ctx.calibrateOmrBubbleCenters(shifted.context,shifted.rois,shifted.anchors,2).ok,false);
});

test('an unverified dark bubble is sent to review instead of silently scored',()=>{
  const h=harness(),sheet=pixelSheet({filled:['5:2']});
  h.ctx.calibrateOmrBubbleCenters(sheet.context,sheet.rois,sheet.anchors,2);
  const bubble=sheet.rois.sections[0].bubbles.find(b=>b.q===5&&b.opt==='C');
  const id=h.ctx.omrBubbleKey(bubble.xMm,bubble.yMm),point=sheet.anchors.bubbleCenters.get(id);
  sheet.anchors.bubbleCenters.set(id,{...point,verified:false});
  const answers=h.ctx.decodeAnswersFromFrame(sheet.context,sheet.context.canvas,sheet.rois,sheet.anchors);
  assert.equal(answers.Biology[5],undefined);
  assert.ok(h.ctx.lastBubbleRecognitionMeta.uncertain.some(item=>item.question===5&&item.option==='C'&&item.detectedFilled));
});

test('uncertainty seen during any matching capture is retained and deduplicated',()=>{
  const h=harness(),history=[],candidate={fingerprint:'same',total:21};
  assert.equal(h.ctx.registerVerifiedOmrRead(history,candidate,1,100),false);
  assert.equal(h.ctx.registerVerifiedOmrRead(history,candidate,1,110),false);
  assert.equal(h.ctx.registerVerifiedOmrRead(history,candidate,2,120),false);
  assert.equal(h.ctx.registerVerifiedOmrRead(history,candidate,3,130),true);
  const merged=h.ctx.mergeOmrUncertainBubbles([
    [{section:'Biology',question:31,option:'C',reason:'light-mark'}],
    [{section:'Biology',question:31,option:'C',reason:'damaged-outline'}],[]
  ]);
  assert.equal(merged.length,1);assert.equal(merged[0].reason,'damaged-outline');
});

test('review questions are grouped and restricted to the selected subject',()=>{
  const h=harness(),out=h.out({recognitionMeta:{uncertain:[
    {section:'Biology',question:31,option:'B'},{section:'Biology',question:31,option:'C'},
    {section:'English 2',question:31,option:'A'}
  ]}});
  const questions=h.ctx.omrRecognitionReviewQuestions(out);
  assert.equal(questions.length,1);assert.deepEqual(clone(questions[0].uncertainOptions),['B','C']);
});

test('a duplicate roll is editable in the first review without a replacement prompt',()=>{
  const h=harness(),out=h.out({duplicateRollDetected:true});
  h.ctx.showScanReview(out,null);
  assert.equal(h.fixed.get('dlgScanReview').open,true);
  assert.equal(h.fixed.get('scanReviewRoll').disabled,false);
  assert.equal(h.fixed.get('scanReviewEditFields').style.display,'grid');
  assert.equal(h.prompts.length,0);
  const early=section('// Report a possible duplicate in review','showScanReview(out, previewDataUrl);');
  assert.equal(early.includes('appConfirm('),false);
});

test('Save uses the edited roll and clears stale replacement approval',async()=>{
  const h=harness(),out=h.out({duplicateRollDetected:true});
  h.ctx.scanReplacementApprovals.set(out,'approval-for-46');
  h.ctx.showScanReview(out,null);
  const input=h.fixed.get('scanReviewRoll');input.value='47';await input.dispatch('input');
  await h.fixed.get('btnScanSave').onclick();
  assert.equal(h.saved.length,1);assert.equal(h.saved[0].roll,'47');
  assert.equal(h.ctx.scanReplacementApprovals.has(out),false);
  assert.equal(h.fixed.get('dlgScanReview').open,false);
});

for(const result of [false,true]){
  test(`duplicate confirmation suspends review and restores its fields (${result?'replace':'keep/edit'})`,async()=>{
    const h=harness(),out=h.out();h.ctx.confirmResult=result;
    h.ctx.showScanReview(out,null);h.fixed.get('scanReviewRoll').value='47';
    const answer=await h.ctx.confirmOmrScanReplacement(out,{});
    assert.equal(answer,result);assert.equal(h.prompts.length,1);
    assert.equal(h.fixed.get('dlgScanReview').open,true);
    assert.equal(h.fixed.get('scanReviewRoll').value,'47');
    assert.equal(h.ctx.lastScanPending,out);
  });
}

test('unclear questions require confirmation; changing a selection recalculates marks and counts',async()=>{
  const h=harness();h.ctx.answerKey.Biology[31]=['C'];
  const out=h.out({recognitionMeta:{uncertain:[{section:'Biology',question:31,option:'C',reason:'damaged-outline'}]}});
  h.ctx.showScanReview(out,null);
  assert.equal(h.fixed.get('btnScanSave').disabled,true);
  await h.fixed.get('btnScanSave').onclick();assert.equal(h.saved.length,0);
  const inputs=h.fixed.get('scanReviewQuestions').querySelectorAll('.scan-review-answer');
  inputs.forEach(input=>{input.checked=input.value==='C';});await inputs.find(input=>input.value==='C').dispatch('change');
  assert.equal(out.score.total,1);assert.equal(out.manualAnswerCorrection,true);
  assert.equal(h.ctx.getResultCounts(out.questionDetails).correct,1);
  const confirmation=h.ctx.el('scanReviewConfirmAnswers');confirmation.checked=true;await confirmation.dispatch('change');
  assert.equal(h.fixed.get('btnScanSave').disabled,false);
  await h.fixed.get('btnScanSave').onclick();
  assert.deepEqual(h.saved[0].answers.Biology[31],['C']);
  assert.equal(h.saved[0].recognitionReviewConfirmed,true);
  assert.deepEqual(h.saved[0].reviewedQuestions[0].detected,['A','D']);
  assert.deepEqual(h.saved[0].reviewedQuestions[0].selected,['C']);
});

test('changing answers after confirmation requires confirmation again',async()=>{
  const h=harness(),out=h.out({recognitionMeta:{uncertain:[{section:'Biology',question:31,option:'C'}]}});
  h.ctx.showScanReview(out,null);
  const confirmation=h.ctx.el('scanReviewConfirmAnswers');confirmation.checked=true;await confirmation.dispatch('change');
  const option=h.fixed.get('scanReviewQuestions').querySelectorAll('.scan-review-answer')[0];
  option.checked=false;await option.dispatch('change');
  assert.equal(out.recognitionReviewConfirmed,false);assert.equal(confirmation.checked,false);
  assert.equal(h.fixed.get('btnScanSave').disabled,true);
});

test('cancel skips the held sheet and a following clear sheet has Save enabled',()=>{
  const h=harness(),out=h.out({scanFingerprint:'physical-sheet',recognitionMeta:{uncertain:[{section:'Biology',question:31,option:'C'}]}});
  h.ctx.showScanReview(out,null);h.fixed.get('btnScanCancel').onclick();
  assert.equal(h.ctx.lastDeclinedSheetFingerprint,'physical-sheet');
  h.ctx.showScanReview(h.out(),null);
  assert.equal(h.fixed.get('btnScanSave').disabled,false);
});

test('reviewing one paper does not add another selected template subject to its score or details',()=>{
  const h=harness(),out=h.out();
  h.ctx.tpl.sections.push({name:'English 2',count:40,options:4,mark:1,negative:0});
  h.ctx.answerKey.Biology[31]=['C'];
  h.ctx.applyOmrQuestionReview(out,{section:'Biology',question:31},['C']);
  assert.deepEqual(Object.keys(out.score.perSection),['Biology']);
  assert.ok(out.questionDetails.every(item=>item.subject==='Biology'));
});
