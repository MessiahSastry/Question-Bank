// Run: node --test tests/omr-*.test.cjs
// Real answer-key readers, writers and UI handlers; in-memory Firestore only.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../omr.html'),'utf8');
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
function section(a,b){
  const start=html.indexOf(a),end=html.indexOf(b,start);
  assert.ok(start>=0&&end>start,'Source section: '+a);
  return html.slice(start,end);
}
const code=[
  section('function omrNorm(value){','function selectedEffectiveExam(){'),
  section('function getExamSubjectDefinition(subjectName){','function getOmrPartCandidates(subjectName){'),
  section('function getPartMaximum(subjectName, partName){','function getExamMaximum(){'),
  section('function cloneOmrData(value){','// Convert the one common physical answer grid'),
  section('function omrSectionKeyId(sectionId,context){','// One common physical OMR template'),
  section('function getOmrKeyDetails(entry){','// EvalBee-style result overlay:'),
  section('function omrKeySubjectNames(scan){','// CSV import:'),
  section('function ensureKeyEntry(secName, q){','async function buildKeyUI(){'),
  section('function scoreAnswers(answers, key, sections) {','function studentsCollectionRef('),
  section('function omrSubjectEntry(values, subjectName){','// ===== SCAN REVIEW'),
  section('// ===== FIRESTORE REPORTS =====','// ===== BOOT ====='),
  section("el('btnScan').onclick = async event => {",'// ===== SCORING')
].join('\n');

function harness(){
  const store=new Map(),elements=new Map(),alerts=[],writes=[],loggedErrors=[],prompts=[];
  let sequence=0,clock=0,beforeTransaction=null,readFailure=null;
  const root='omrExams/SA1';
  function ref(p){return {path:p,id:p.split('/').at(-1),parent:collection(p.slice(0,p.lastIndexOf('/'))),
    get:async()=>{if(readFailure&&readFailure(p))throw Error('permission-denied');return snap(p);},
    collection:name=>collection(p+'/'+name)};}
  function snap(p){const data=clone(store.get(p));return {exists:store.has(p),id:p.split('/').at(-1),ref:ref(p),data:()=>clone(data)};}
  function collection(p,filters=[]){return {path:p,doc:id=>ref(p+'/'+(id||'auto'+(++sequence))),orderBy:()=>collection(p,filters),
    where:(field,op,value)=>{assert.equal(op,'==');return collection(p,[...filters,[field,value]]);},
    get:async()=>{
      const docs=[...store.keys()].filter(key=>key.startsWith(p+'/')&&!key.slice(p.length+1).includes('/'))
        .filter(key=>filters.every(([field,value])=>store.get(key)[field]===value)).map(snap);
      return {docs,empty:!docs.length,forEach:fn=>docs.forEach(fn)};
    }};}
  const ctx={console:{...console,error:(...args)=>loggedErrors.push(args)},academicYear:'2026-27',currentSchoolId:'school',currentTeacherId:'teacher',
    current:{classId:'class7',sectionId:'A',examId:'SA1',selectedSubjects:['Physics'],partBySubject:{Physics:'OMR'},isCustomExam:false},
    examSubjects:['Physics','Social','Math 1','Math 2','English 1','English 2'].map(name=>({name,max:100,subtopicsMode:'custom',
      subtopics:[{name:'OMR',max:40,entryMode:'omr'},{name:'Descriptive',max:40,entryMode:'manual'},{name:'Internal',max:20,entryMode:'computed'}]})),
    examCommonSubtopics:[],scanReplacementApprovals:new WeakMap(),
    answerKey:{},omrSavedKeys:{},omrLoadedKeyContext:'',
    tpl:{sections:[{name:'Physics',count:2,options:4,mark:1,negative:0}],rois:{ready:true}},
    currentExamRef:()=>ref(ctx.current.isCustomExam?'users/teacher/omrCustomExams/custom1':'omrExams/'+ctx.current.examId),
    studentsCollectionRef:(classId=ctx.current.classId,sectionId=ctx.current.sectionId)=>collection('years/2026-27/classes/'+classId+'/sections/'+sectionId+'/students'),
    selectedEffectiveExam:()=>({name:'SA1'}),
    findStudentByRoll:async(roll,classId,sectionId)=>{
      const rows=await ctx.studentsCollectionRef(classId,sectionId).where('roll','==',Number(roll)).get();
      const doc=rows.docs[0];return doc?{...doc.data(),id:doc.id,ref:doc.ref}:null;
    },
    uploadScanPreview:async()=>({imageUrl:null,imagePath:null}),storage:{ref:()=>({child:()=>({delete:async()=>{}})})},
    firebase:{firestore:{FieldValue:{serverTimestamp:()=>({seconds:1800000000+(++clock)})}}},
    alert:message=>alerts.push(String(message)),confirm:()=>true,
    appConfirm:async options=>{prompts.push(options);return ctx.confirmResult;},confirmResult:true,
    window:{},navigator:{onLine:true},localStorage:{getItem:()=>null},
    document:{createElement:()=>{throw Error('Unexpected DOM creation in storage test');}},
    el:id=>{
      if(!elements.has(id))elements.set(id,{disabled:false,open:false,style:{},textContent:'',innerHTML:'',
        selectedOptions:[{textContent:'SA1'}],querySelectorAll:()=>[],
        showModal(){this.open=true;},close(){this.open=false;}});
      return elements.get(id);
    },
    buildKeyUI:async()=>{ctx.builtKey=clone(ctx.answerKey);},
    refreshScannerReadiness:()=>true,areOmrPartsReady:()=>true,prepareOmrScanSound:()=>{},
    showScannerStartMessage:message=>alerts.push(String(message)),
    startCameraAutoScan:async()=>{ctx.cameraStarts++;},stopCameraStream:()=>{},cameraStarts:0,
    db:{runTransaction:async callback=>{
      if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;hook();}
      const staged=[];
      const result=await callback({
        get:async r=>{assert.equal(staged.length,0,'All transaction reads precede writes');return snap(r.path);},
        set:(r,data,options)=>staged.push([r.path,clone(data),!!(options&&options.merge)])
      });
      // Reproduce the failing parent record: any direct write is rejected.
      for(const [p] of staged)if(p===root)throw Error('too many index entries for entity /'+root);
      const merge=(a,b)=>Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].map(name=>[name,
        b[name]&&typeof b[name]==='object'&&!Array.isArray(b[name])?merge(a[name]||{},b[name]):name in b?clone(b[name]):clone(a[name])]));
      for(const [p,data,combined] of staged){store.set(p,combined?merge(store.get(p)||{},data):data);writes.push(p);}
      return result;
    }}
  };
  vm.createContext(ctx);vm.runInContext(code,ctx);
  function legacy(sectionId,keys){
    const p=ctx.currentExamRef().path,data=store.get(p)||{};
    const id=ctx.omrSectionKeyId(sectionId);
    store.set(p,{...data,answerKeysBySection:{...(data.answerKeysBySection||{}),[id]:clone(keys)}});
  }
  function context(sectionId){return ctx.omrPaperKeyContext(sectionId);}
  async function save(patch,options={}){
    const c=context(),previous=await ctx.readOmrPaperKeys(c,Object.keys(patch));
    return ctx.writeOmrPaperKeys(c,patch,previous,options);
  }
  function seedPaper({subject='Physics',sectionId='A',roll=1,studentId='student'+roll,answers={1:['A'],2:['B']},key=keyFor('A'),schemaVersion=6,resultPath}={}){
    const studentRef=ctx.studentsCollectionRef('class7',sectionId).doc(studentId);
    store.set(studentRef.path,{name:'Student '+roll,roll});
    const settings=ctx.tpl.sections.find(item=>item.name===subject)||{name:subject,count:2,options:4,mark:1,negative:0};
    const out={schemaVersion,schoolId:'school',academicYear:'2026-27',classId:'class7',sectionId,examId:'SA1',
      selectedSubjects:[subject],subjectName:subject,partBySubject:{[subject]:'OMR'},subtopicName:'OMR',
      studentId,roll:String(roll),answers:{[subject]:clone(answers)},capturedAt:'2026-11-26T10:00:00Z',
      imageUrl:'https://example.invalid/scan.jpg',imagePath:'saved/scan.jpg'};
    out.score=clone(ctx.scoreAnswers(out.answers,{[subject]:key},[settings]));
    out.questionDetails=clone(ctx.buildOmrQuestionDetails(out,[settings],{[subject]:key}));
    out.counts=clone(ctx.getResultCounts(out.questionDetails));out.totalMarks=out.score.total;
    const resultRef=resultPath?ref(resultPath):ctx.omrSubjectResultRef(out,{subjectName:subject,partName:'OMR'},context(sectionId));
    store.set(resultRef.path,clone(out));
    const marksPath=studentRef.collection('marks').doc('SA1').path;
    if(!store.has(marksPath))store.set(marksPath,{[subject]:out.score.total+34,__subs:{[subject]:{OMR:out.score.total,Descriptive:20,Internal:14}}});
    return {out,resultRef,marksPath,studentRef};
  }
  const keyFor=option=>({1:[option],2:['B']});
  return {ctx,store,alerts,writes,elements,prompts,ref,snap,legacy,context,save,seedPaper,root,
    reports:()=>ctx.loadReportsFromFirestore(false),
    keyPath:(name,sectionId)=>ctx.omrPaperKeyRef(context(sectionId),name).path,
    beforeTransaction:hook=>{beforeTransaction=hook;},
    failReads:predicate=>{readFailure=predicate;},
    copyTargets:ids=>{ctx.el('keyCopySections').querySelectorAll=()=>ids.map(id=>({value:id,dataset:{name:id+' Section'}}));}};
}
const key=(option='A')=>({1:{options:[option],either:false,multiple:false,addScore:false},2:['B']});

test('Save Key works without writing the parent exam that rejects index-heavy saves',async()=>{
  const h=harness();h.legacy('A',{'Math 1':key('C')});
  const rootBefore=clone(h.store.get(h.root));
  h.ctx.answerKey={Physics:key()};
  await h.ctx.el('btnKeySave').onclick();
  assert.match(h.alerts.at(-1),/Answer key saved for Physics/);
  assert.deepEqual(h.store.get(h.root),rootBefore);
  assert.equal(h.writes.length,1);assert.equal(h.writes[0],h.keyPath('Physics'));
  const saved=h.store.get(h.keyPath('Physics'));
  assert.equal(typeof saved.keyJson,'string');assert.equal(saved.recordType,'omr-answer-key');
  assert.equal(saved.answerKeysBySection,undefined);
  assert.equal(h.ctx.omrCanonicalKey(JSON.parse(saved.keyJson)),h.ctx.omrCanonicalKey(key()));
});

test('old scoped keys and global fallback remain readable, without data migration on read',async()=>{
  const h=harness();h.store.set(h.root,{answerKey:{Physics:key('D')}});
  assert.equal((await h.ctx.readOmrPaperKeys(h.context(),['Physics'])).keys.Physics[1].options[0],'D');
  h.legacy('A',{Physics:key('C')});
  assert.equal((await h.ctx.readOmrPaperKeys(h.context(),['Physics'])).keys.Physics[1].options[0],'C');
  assert.equal((await h.ctx.readOmrPaperKeys(h.context('B'),['Physics'])).keys.Physics[1].options[0],'D');
  assert.equal(h.writes.length,0);
});

test('a new subject record takes precedence while unconverted subjects keep their legacy keys',async()=>{
  const h=harness();h.legacy('A',{Physics:key('A'),'Math 1':key('C')});
  await h.save({Physics:key('D')});
  const loaded=await h.ctx.readOmrPaperKeys(h.context(),['Physics','Math 1']);
  assert.equal(loaded.keys.Physics[1].options[0],'D');assert.equal(loaded.keys['Math 1'][1].options[0],'C');
});

test('Math 1/2 and English 1/2 get independent records',async()=>{
  const h=harness();const names=['Math 1','Math 2','English 1','English 2'];
  await h.save(Object.fromEntries(names.map((name,i)=>[name,key('ABCD'[i])])));
  const loaded=await h.ctx.readOmrPaperKeys(h.context(),names);
  assert.equal(new Set(names.map(name=>h.keyPath(name))).size,4);
  names.forEach((name,i)=>assert.equal(loaded.keys[name][1].options[0],'ABCD'[i]));
});

test('school, year, class, section, exam and Unicode subject names are part of identity',()=>{
  const h=harness(),c=h.context(),name='తెలుగు 1';
  const ids=[h.ctx.omrPaperKeyRef(c,name).path];
  for(const field of ['schoolId','year','classId','sectionId'])ids.push(h.ctx.omrPaperKeyRef({...c,[field]:c[field]+'other'},name).path);
  ids.push(h.ctx.omrPaperKeyRef({...c,examRef:h.ref('omrExams/SA2')},name).path);
  ids.push(h.ctx.omrPaperKeyRef(c,'తెలుగు 2').path,h.ctx.omrPaperKeyRef(c,'English/A').path,h.ctx.omrPaperKeyRef(c,'English A').path);
  assert.equal(new Set(ids).size,ids.length);
});

test('single/multiple, either-option and grace rules survive 60-question serialization',async()=>{
  const h=harness(),paper={};
  for(let q=1;q<=60;q++)paper[q]={options:['A'],either:false,multiple:false,addScore:false};
  paper[2]={options:['B','D'],either:false,multiple:true,addScore:false};
  paper[3]={options:['A','C'],either:true,multiple:false,addScore:false};
  paper[4]={options:[],either:false,multiple:false,addScore:true};
  await h.save({Physics:paper});
  const loaded=await h.ctx.readOmrPaperKeys(h.context(),['Physics']);
  assert.deepEqual(clone(loaded.keys.Physics),paper);
  const stored=h.store.get(h.keyPath('Physics'));
  assert.ok(Object.keys(stored).length<20);assert.equal(stored.keyJson.includes('addScore'),true);
});

test('unchanged legacy keys with scans can be copied intact to their independent records',async()=>{
  const h=harness();h.legacy('A',{Physics:key()});
  h.store.set(h.root+'/results/one',{classId:'class7',sectionId:'A',academicYear:'2026-27',subjectName:'Physics'});
  const before=clone([...h.store]);await h.save({Physics:key()});
  assert.ok(h.store.has(h.keyPath('Physics')));
  for(const [p,data] of before)assert.deepEqual(h.store.get(p),data);
});

test('revised keys recover archived subject answers and preserve other subjects and manual marks',async()=>{
  const h=harness();h.legacy('A',{Physics:key(),'Math 1':key()});
  const main=h.seedPaper({subject:'Math 1',schemaVersion:5,resultPath:h.root+'/results/one'});
  const old=h.seedPaper({subject:'Physics',schemaVersion:5,resultPath:main.resultRef.path+'/history/physics'});
  h.store.set(old.marksPath,{Physics:55,'Math 1':46,__subs:{Physics:{OMR:21,Descriptive:20,Internal:14},'Math 1':{OMR:12,Descriptive:20,Internal:14}}});
  const mainBefore=clone(h.store.get(main.resultRef.path)),historyBefore=clone(h.store.get(old.resultRef.path));
  const saved=await h.save({Physics:key('D')});
  assert.equal(saved.regraded,1);assert.equal(h.prompts.length,1);
  const reports=await h.ctx.loadReportsFromFirestore(false);
  assert.equal(reports[0].total,1);assert.equal(reports[0].counts.correct,1);assert.equal(reports[0].counts.wrong,1);
  assert.equal(h.store.get(old.marksPath).Physics,35);assert.equal(h.store.get(old.marksPath)['Math 1'],46);
  assert.deepEqual(h.store.get(old.marksPath).__subs.Physics,{OMR:1,Descriptive:20,Internal:14});
  assert.deepEqual(h.store.get(main.resultRef.path),mainBefore);assert.deepEqual(h.store.get(old.resultRef.path),historyBefore);
  const paper=reports[0].scans[0];assert.equal(paper.imageUrl,old.out.imageUrl);assert.deepEqual(clone(paper.answers),old.out.answers);
  assert.ok([...h.store.values()].some(data=>data.recordType==='omr-answer-key-history'&&JSON.parse(data.keyJson)[1].options[0]==='A'));
  await h.save({'English 2':key('D')});assert.ok(h.store.has(h.keyPath('English 2')));
});

test('concurrent updates of the same subject abort without overwriting the newer key',async()=>{
  const h=harness();await h.save({Physics:key()});
  const c=h.context(),previous=await h.ctx.readOmrPaperKeys(c,['Physics']);
  h.beforeTransaction(()=>{
    const p=h.keyPath('Physics');h.store.set(p,{...h.store.get(p),keyJson:JSON.stringify(key('C')),revision:2});
  });
  await assert.rejects(()=>h.ctx.writeOmrPaperKeys(c,{Physics:key('D')},previous),/Another teacher changed/);
  assert.equal(JSON.parse(h.store.get(h.keyPath('Physics')).keyJson)[1].options[0],'C');
});

test('a selection change while a key save is pending prevents all writes',async()=>{
  const h=harness();
  h.beforeTransaction(()=>{h.ctx.current.sectionId='B';});
  await assert.rejects(()=>h.save({Physics:key()}),/Selection changed/);
  assert.equal(h.writes.length,0);
});

test('copy uses saved source keys and writes separate destination records only',async()=>{
  const h=harness();await h.save({Physics:key('A')});
  h.ctx.answerKey={Physics:key('D')};h.copyTargets(['B','C']);
  await h.ctx.el('btnKeyCopyConfirm').onclick();
  assert.match(h.alerts.at(-1),/copied to B Section.*C Section/);
  for(const id of ['B','C'])assert.equal(JSON.parse(h.store.get(h.keyPath('Physics',id)).keyJson)[1].options[0],'A');
  assert.equal(JSON.parse(h.store.get(h.keyPath('Physics')).keyJson)[1].options[0],'A');
  assert.ok(!h.writes.includes(h.root));
});

test('copy re-evaluates destination scans using the saved source key and keeps manual marks',async()=>{
  const h=harness();h.ctx.tpl.sections=[{name:'Physics',count:2,options:4,mark:1},{name:'Math 1',count:2,options:4,mark:1}];
  h.legacy('A',{Physics:key('A'),'Math 1':key('A')});
  h.legacy('B',{Physics:key('D'),'Math 1':key('D')});
  const paper=h.seedPaper({sectionId:'B',key:key('D')});
  const beforeAnswers=clone(paper.out.answers);
  h.copyTargets(['B']);await h.ctx.el('btnKeyCopyConfirm').onclick();
  assert.match(h.alerts.at(-1),/1 saved paper\(s\) re-evaluated/);
  assert.equal(JSON.parse(h.store.get(h.keyPath('Physics','B')).keyJson)[1].options[0],'A');
  assert.equal(JSON.parse(h.store.get(h.keyPath('Math 1','B')).keyJson)[1].options[0],'A');
  assert.equal(h.store.get(paper.resultRef.path).score.total,2);assert.equal(h.store.get(paper.marksPath).Physics,36);
  assert.deepEqual(h.store.get(paper.resultRef.path).answers,beforeAnswers);
  assert.deepEqual(h.store.get(paper.marksPath).__subs.Physics,{OMR:2,Descriptive:20,Internal:14});
});

test('copy detects source changes before writing a destination',async()=>{
  const h=harness();await h.save({Physics:key()});
  const source=h.context(),loaded=await h.ctx.readOmrPaperKeys(source,['Physics']);
  const target={...source,sectionId:'B'},previous=await h.ctx.readOmrPaperKeys(target,['Physics']);
  h.beforeTransaction(()=>{const p=h.keyPath('Physics');h.store.set(p,{...h.store.get(p),keyJson:JSON.stringify(key('D'))});});
  await assert.rejects(()=>h.ctx.writeOmrPaperKeys(target,{Physics:key()},previous,{selectionContext:source,sourceGuard:{context:source,keys:loaded.keys}}),/source key changed/);
  assert.equal(h.store.has(h.keyPath('Physics','B')),false);
});

test('custom exam keys stay under the teacher and do not appear as custom exams',async()=>{
  const h=harness();h.ctx.current.isCustomExam=true;h.ctx.current.examId='custom__custom1';
  await h.save({Physics:key()});
  const p=h.keyPath('Physics');assert.match(p,/^users\/teacher\/omrCustomExams\/__omr_key_v2__/);
  assert.equal(h.ctx.isOmrPaperKeyRecord(h.snap(p)),true);
  assert.equal(h.ctx.isOmrPaperKeyRecord(h.snap('users/teacher/omrCustomExams/custom1')),false);
  assert.match(html,/if \(isOmrPaperKeyRecord\(doc\)\) return;/);
});

test('corrupt or mismatched new records fail safely instead of silently using an old key',async()=>{
  const h=harness();h.legacy('A',{Physics:key()});await h.save({Physics:key('D')});
  const p=h.keyPath('Physics'),good=clone(h.store.get(p));
  h.store.set(p,{...good,keyJson:'broken'});
  await assert.rejects(()=>h.ctx.readOmrPaperKeys(h.context(),['Physics']),/could not be read/);
  h.store.set(p,{...good,classId:'class8'});
  await assert.rejects(()=>h.ctx.readOmrPaperKeys(h.context(),['Physics']),/different class/);
});

test('fresh key loading ignores results from a selection that has changed',async()=>{
  const h=harness();const old=h.context();h.ctx.current.sectionId='B';
  assert.equal(h.ctx.applyLoadedOmrPaperKeys(old,{Physics:key('D')}),false);
  assert.deepEqual(h.ctx.answerKey,{});
});

test('opening Set Answer Key reads the independent subject key',async()=>{
  const h=harness();await h.save({Physics:key('C')});
  await h.ctx.el('btnKey').onclick();
  assert.equal(h.ctx.builtKey.Physics[1].options[0],'C');assert.equal(h.ctx.el('dlgKey').open,true);
});

test('scanning loads the saved subject key from its independent record',async()=>{
  const h=harness();await h.save({Physics:key('C')});
  await h.ctx.el('btnScan').onclick({preventDefault(){}});
  assert.equal(h.ctx.cameraStarts,1);assert.equal(h.ctx.answerKey.Physics[1].options[0],'C');
});

test('scanning rejects unsaved edits and a failed answer-key read',async()=>{
  const h=harness();await h.save({Physics:key('A')});
  const c=h.context(),saved=await h.ctx.readOmrPaperKeys(c,['Physics']);h.ctx.applyLoadedOmrPaperKeys(c,saved.keys);
  h.ctx.answerKey.Physics=key('D');
  await h.ctx.el('btnScan').onclick({preventDefault(){}});
  assert.equal(h.ctx.cameraStarts,0);assert.match(h.alerts.at(-1),/current edits have not been saved/);
  h.ctx.answerKey.Physics=key('A');h.failReads(p=>p===h.keyPath('Physics'));
  await h.ctx.el('btnScan').onclick({preventDefault(){}});
  assert.equal(h.ctx.cameraStarts,0);assert.match(h.alerts.at(-1),/permission-denied/);
});

test('loading the new format retains scoring for single, multiple, either and grace answers',async()=>{
  const h=harness();
  const paper={1:['A'],2:{options:['A','C'],multiple:true},3:{options:['B','D'],either:true},4:{options:[],addScore:true}};
  const answers={Physics:{1:['A'],2:['A','C'],3:['D'],4:[]}};
  const sections=[{name:'Physics',count:4,mark:2,negative:-0.5}];
  const original=h.ctx.scoreAnswers(answers,{Physics:paper},sections);
  assert.equal(original.total,8);
  await h.save({Physics:paper});
  const loaded=await h.ctx.readOmrPaperKeys(h.context(),['Physics']);
  const scored=h.ctx.scoreAnswers(answers,loaded.keys,sections);
  assert.deepEqual(clone(scored),clone(original));
});

for(const subject of ['Math 1','Math 2','English 1','English 2','Social']){
  test(subject+': revised key updates only this subject and its ranks',async()=>{
    const h=harness();h.ctx.tpl.sections=[{name:subject,count:2,options:4,mark:1,negative:0}];
    h.ctx.current.selectedSubjects=[subject];h.ctx.current.partBySubject={[subject]:'OMR'};
    h.legacy('A',{[subject]:key()});
    const first=h.seedPaper({subject}),second=h.seedPaper({subject,roll:2,answers:{1:['D'],2:['B']}});
    const other=h.seedPaper({subject:subject==='English 2'?'English 1':'English 2'});
    const otherBefore=clone(h.store.get(other.resultRef.path));
    const pending=h.ctx.studentsCollectionRef('class7','A').doc('student3');
    h.store.set(pending.path,{roll:3,name:'Not scanned'});h.store.set(pending.path+'/marks/SA1',{[subject]:1});
    const saved=await h.save({[subject]:key('D')});assert.equal(saved.regraded,2);
    const rows=await h.reports();
    assert.deepEqual(rows.map(row=>row.total).slice(0,2),[1,2]);
    assert.deepEqual(rows.map(row=>row.rank),[2,1,null]);
    assert.equal(rows[2].hasData,false);assert.equal(h.elements.get('reportCount').textContent,'2');
    assert.equal(h.elements.get('reportAverage').textContent,'1.50');assert.equal(h.elements.get('reportHighest').textContent,'2.00');
    assert.equal(h.store.get(first.marksPath)[subject],35);assert.equal(h.store.get(second.marksPath)[subject],36);
    assert.deepEqual(h.store.get(other.resultRef.path),otherBefore);
  });
}

test('cancelled revision closes stacked key dialogs for confirmation and writes nothing',async()=>{
  const h=harness();h.legacy('A',{Physics:key()});h.seedPaper();
  h.ctx.el('dlgKey').showModal();h.ctx.el('dlgKeyCopy').showModal();
  const before=clone([...h.store]);
  h.ctx.appConfirm=async()=>{
    assert.equal(h.ctx.el('dlgKey').open,false);assert.equal(h.ctx.el('dlgKeyCopy').open,false);return false;
  };
  const result=await h.save({Physics:key('D')});
  assert.equal(result.cancelled,true);assert.deepEqual([...h.store],before);
  assert.equal(h.ctx.el('dlgKey').open,true);assert.equal(h.ctx.el('dlgKeyCopy').open,true);
});

test('one missing saved answer aborts the entire revision without changing any key or marks',async()=>{
  const h=harness();h.legacy('A',{Physics:key()});h.seedPaper();
  const broken=h.seedPaper({roll:2});
  const data=h.store.get(broken.resultRef.path);delete data.answers.Physics[2];data.questionDetails=[];
  const before=clone([...h.store]);
  await assert.rejects(()=>h.save({Physics:key('D')}),/Roll 2, Q2: saved answer choices are missing/);
  assert.deepEqual([...h.store],before);assert.equal(h.prompts.length,0);
});

test('saved question details can recover choices when a legacy answers map is absent',async()=>{
  const h=harness();h.legacy('A',{Physics:key()});const paper=h.seedPaper();
  delete h.store.get(paper.resultRef.path).answers;
  await h.save({Physics:key('D')});
  assert.equal(h.store.get(paper.resultRef.path).score.total,1);
  assert.deepEqual(h.store.get(paper.resultRef.path).answers,{Physics:{1:['A'],2:['B']}});
});

test('incomplete revised keys leave all existing papers and keys intact',async()=>{
  const h=harness();h.legacy('A',{Physics:key()});h.seedPaper();const before=clone([...h.store]);
  await assert.rejects(()=>h.save({Physics:{1:['D']}}),/Q2: complete the revised answer key/);
  assert.deepEqual([...h.store],before);
});

test('deleted papers remain deleted and archived versions are not regraded or resurrected',async()=>{
  const h=harness();h.legacy('A',{Physics:key()});
  const old=h.seedPaper({schemaVersion:5,resultPath:h.root+'/results/legacy'}),tombstone=h.seedPaper();
  h.store.get(tombstone.resultRef.path).isDeleted=true;
  const before=clone(h.store.get(tombstone.resultRef.path));
  const saved=await h.save({Physics:key('D')});
  assert.equal(saved.regraded,0);assert.deepEqual(h.store.get(tombstone.resultRef.path),before);
  assert.deepEqual(h.store.get(old.resultRef.path).answers,old.out.answers);
});

test('a paper edited during revision aborts without changing the key or other papers',async()=>{
  const h=harness();await h.save({Physics:key()});const paper=h.seedPaper();
  h.beforeTransaction(()=>{h.store.get(paper.resultRef.path).answers.Physics[1]=['D'];});
  await assert.rejects(()=>h.save({Physics:key('D')}),/saved paper changed during re-evaluation/);
  assert.equal(JSON.parse(h.store.get(h.keyPath('Physics')).keyJson)[1].options[0],'A');
  assert.equal(h.store.get(paper.marksPath).Physics,36);
});

test('a newly arriving scan fences the key revision so no paper is left with old-key marks',async()=>{
  const h=harness();await h.save({Physics:key()});const first=h.seedPaper();
  h.beforeTransaction(()=>{
    h.seedPaper({roll:2});const p=h.keyPath('Physics');h.store.set(p,{...h.store.get(p),scanVersion:1});
  });
  await assert.rejects(()=>h.save({Physics:key('D')}),/New scans were saved/);
  assert.equal(JSON.parse(h.store.get(h.keyPath('Physics')).keyJson)[1].options[0],'A');
  assert.equal(h.store.get(first.resultRef.path).score.total,2);
  const retry=await h.save({Physics:key('D')});assert.equal(retry.regraded,2);
});

test('manual marks changed during a revision are read fresh and retained',async()=>{
  const h=harness();h.legacy('A',{Physics:key()});const paper=h.seedPaper();
  h.beforeTransaction(()=>h.store.set(paper.marksPath,{Physics:51,English:78,__subs:{Physics:{OMR:2,Descriptive:31,Internal:18}}}));
  await h.save({Physics:key('D')});
  assert.equal(h.store.get(paper.marksPath).Physics,50);assert.equal(h.store.get(paper.marksPath).English,78);
  assert.deepEqual(h.store.get(paper.marksPath).__subs.Physics,{OMR:1,Descriptive:31,Internal:18});
});

test('legacy overall marks without their manual component breakdown are never silently erased',async()=>{
  const h=harness();h.legacy('A',{Physics:key()});const paper=h.seedPaper();
  h.store.set(paper.marksPath,{Physics:36});const before=clone([...h.store]);
  await assert.rejects(()=>h.save({Physics:key('D')}),/stored total includes marks without a component breakdown/);
  assert.deepEqual([...h.store],before);
});

test('a 60-question paper uses its marking settings rather than a fixed 40 or 100',async()=>{
  const h=harness();h.ctx.tpl.sections=[{name:'Physics',count:60,options:4,mark:1,negative:0}];
  h.ctx.examSubjects.find(item=>item.name==='Physics').subtopics[0].max=60;
  const paperKey=Object.fromEntries(Array.from({length:60},(_,i)=>[i+1,['A']]));
  h.legacy('A',{Physics:paperKey});
  const paper=h.seedPaper({answers:paperKey,key:paperKey});
  const revised=clone(paperKey);revised[60]=['D'];await h.save({Physics:revised});
  assert.equal(h.store.get(paper.resultRef.path).score.total,59);assert.equal(h.store.get(paper.marksPath).Physics,93);
  await h.reports();assert.equal(h.elements.get('reportMax').textContent,'60.00');
});

test('re-evaluation applies multiple, either, grace and negative marking to stored choices',async()=>{
  const h=harness();h.ctx.tpl.sections=[{name:'Physics',count:4,options:4,mark:2,negative:-0.5}];
  const old={1:['D'],2:['D'],3:['A'],4:['C']};h.legacy('A',{Physics:old});
  const paper=h.seedPaper({answers:{1:['A','C'],2:['D'],3:[],4:['A']},key:old});
  const revised={1:{options:['A','C'],multiple:true},2:{options:['B','D'],either:true},3:{options:[],addScore:true},4:['B']};
  await h.save({Physics:revised});
  assert.equal(h.store.get(paper.resultRef.path).score.total,5.5);
  assert.deepEqual(h.store.get(paper.resultRef.path).counts,{correct:3,wrong:1,unanswered:0});
});

test('a pending review graded with an old key is recalculated and needs review before saving',async()=>{
  const h=harness();await h.save({Physics:key()});const paper=h.seedPaper();
  const pending=clone(paper.out);h.ctx.captureOmrGradingContext(pending,h.ctx.tpl.sections,{Physics:key()});
  await h.save({Physics:key('D')});
  const before=clone([...h.store]);const result=await h.ctx.saveScanToFirestore(pending);
  assert.equal(result.needsReview,true);assert.equal(result.saved,false);assert.equal(pending.score.total,1);
  assert.deepEqual([...h.store],before);assert.match(pending.recognitionWarnings.at(-1),/answer key was revised/);
  assert.equal((await h.ctx.saveScanToFirestore(pending)).saved,true);
  assert.equal(h.store.get(paper.resultRef.path).score.total,1);
  assert.equal(h.store.get(h.keyPath('Physics')).scanVersion,1);
});

test('a key revised during the scan transaction refreshes review and never saves stale marks',async()=>{
  const h=harness();await h.save({Physics:key()});const paper=h.seedPaper();
  h.store.delete(paper.resultRef.path);h.store.delete(paper.marksPath);
  const pending=clone(paper.out);h.ctx.captureOmrGradingContext(pending,h.ctx.tpl.sections,{Physics:key()});
  h.beforeTransaction(()=>{
    const p=h.keyPath('Physics');h.store.set(p,{...h.store.get(p),keyJson:JSON.stringify(key('D')),revision:2});
  });
  const saved=await h.ctx.saveScanToFirestore(pending);
  assert.equal(saved.needsReview,true);assert.equal(pending.score.total,1);
  assert.equal(h.store.has(paper.resultRef.path),false);assert.equal(h.store.has(paper.marksPath),false);
  assert.equal((await h.ctx.saveScanToFirestore(pending)).saved,true);
  assert.equal(h.store.get(paper.resultRef.path).keyRevision,2);
});

test('old key histories are excluded from the teacher custom exam list',async()=>{
  const h=harness();await h.save({Physics:key()});await h.save({Physics:key('D')});
  const histories=[...h.store.keys()].filter(p=>(h.store.get(p)||{}).recordType==='omr-answer-key-history');
  assert.equal(histories.length,1);assert.equal(h.ctx.isOmrPaperKeyRecord(h.snap(histories[0])),true);
});
