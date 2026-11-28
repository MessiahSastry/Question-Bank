// Run: node --test tests/omr-subject-scans.test.cjs
// Executes the scanner's real save/report functions against an in-memory
// Firestore substitute. No school records, authentication or network are used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'../omr.html'),'utf8');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function section(start,end){
  const a=html.indexOf(start), b=html.indexOf(end,a);
  assert.ok(a>=0 && b>a,`Source section: ${start}`);
  return html.slice(a,b);
}
const functions = [
  section('function omrNorm(value){','function selectedEffectiveExam(){'),
  section('function getExamSubjectDefinition(subjectName){','function getOmrPartCandidates(subjectName){'),
  section('function getPartMaximum(subjectName, partName){','function getExamMaximum(){'),
  section('function omrKeySubjectNames(scan){','function omrCanonicalKey(key){'),
  section('function roundMark(value){','function buildQuestionDetails(out){'),
  section('function getResultCounts(questionDetails){','function studentsCollectionRef('),
  section('function omrSubjectEntry(values, subjectName){','// ===== SCAN REVIEW'),
  section('// ===== FIRESTORE REPORTS =====','// ===== BOOT =====')
].join('\n');

function deepMerge(a,b){
  const out={...a};
  for(const [key,value] of Object.entries(b)){
    out[key]=value && typeof value==='object' && !Array.isArray(value)
      ? deepMerge(a && a[key] || {},value) : clone(value);
  }
  return out;
}

function harness(){
  const store=new Map(), elements=new Map(), prompts=[], uploads=[], exports=[];
  let seq=0, stamp=1, beforeTransaction=null;
  const root='omrExams/SA1';
  const studentPath='years/2026-27/classes/class7/sections/A/students/student1';
  function ref(p){
    return {path:p,id:p.split('/').at(-1),get:async()=>snap(p),collection:n=>collection(p+'/'+n)};
  }
  function snap(p){
    const data=clone(store.get(p));
    return {id:p.split('/').at(-1),exists:store.has(p),ref:ref(p),data:()=>clone(data)};
  }
  function collection(p,filters=[],sort=null){
    return {
      doc:id=>ref(p+'/'+(id || 'auto'+(++seq))),
      where:(field,operator,value)=>{assert.equal(operator,'==');return collection(p,[...filters,[field,value]],sort);},
      orderBy:field=>collection(p,filters,field),
      get:async()=>{
        const docs=[...store.keys()].filter(key=>key.startsWith(p+'/') && !key.slice(p.length+1).includes('/'))
          .filter(key=>filters.every(([f,v])=>store.get(key)[f]===v)).map(snap);
        if(sort)docs.sort((a,b)=>a.data()[sort]-b.data()[sort]);
        return {docs,empty:!docs.length};
      }
    };
  }
  const db={runTransaction:async callback=>{
    if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;hook();}
    const writes=[];
    const result=await callback({
      get:async r=>{assert.equal(writes.length,0,'All reads must precede writes');return snap(r.path);},
      set:(r,data,options)=>writes.push([r.path,clone(data),!!(options && options.merge)]),
      delete:r=>writes.push([r.path,undefined,false])
    });
    for(const [p,data,merge] of writes){
      if(data===undefined)store.delete(p);
      else store.set(p,merge?deepMerge(store.get(p)||{},data):data);
    }
    return result;
  }};
  const subjects=['Math 1','Math 2','English 1','English 2','Physics','Chemistry','Telugu','Hindi','తెలుగు 1','తెలుగు 2'];
  const ctx={
    console, currentSchoolId:'school',currentTeacherId:'teacher',academicYear:'2026-27',db,
    current:{classId:'class7',sectionId:'A',examId:'SA1',className:'7th Class',sectionName:'A Section',selectedSubjects:['Math 1'],partBySubject:{'Math 1':'OMR'}},
    examSubjects:subjects.map(name=>({name,max:100,subtopicsMode:'custom',subtopics:[{name:'OMR',max:40,entryMode:'omr'},{name:'Descriptive',max:40,entryMode:'manual'},{name:'Internal',max:20,entryMode:'computed'}]})),
    examCommonSubtopics:[], tpl:{sections:[],omrPartBySubject:{}}, answerKey:{},scanReplacementApprovals:new WeakMap(),
    selectedEffectiveExam:()=>({name:'Summative Assessment 1'}),
    currentExamRef:()=>ref('omrExams/'+ctx.current.examId),
    studentsCollectionRef:()=>collection(studentPath.slice(0,studentPath.lastIndexOf('/'))),
    findStudentByRoll:async roll=>Number(roll)===1?{id:'student1',ref:ref(studentPath),roll:1,name:'Student One'}:null,
    uploadScanPreview:async out=>{uploads.push(out);return {imageUrl:null,imagePath:null};},
    storage:{ref:()=>({child:()=>({delete:async()=>{}})})},
    firebase:{firestore:{FieldValue:{serverTimestamp:()=>({seconds:1800000000+(stamp++)})}}},
    appConfirm:async options=>{prompts.push(options);return ctx.confirmResult;},confirmResult:true,
    alert:message=>{throw new Error(message);},window:{confirm:()=>true},navigator:{onLine:true},
    localStorage:{getItem:key=>ctx.localData[key] || null,setItem:(key,value)=>{ctx.localData[key]=value;}},localData:{},
    el:id=>{
      if(!elements.has(id))elements.set(id,{style:{},textContent:'',innerHTML:'',value:'',open:false,
        querySelectorAll:()=>[],showModal(){this.open=true;},close(){this.open=false;}});
      return elements.get(id);
    },
    showScanReview:(out,image)=>{ctx.lastReview={out,image};}
  };
  // This fixture isolates already-graded scan persistence. Key refresh and its
  // transaction fence are exercised with the real implementation in key tests.
  ctx.prepareOmrScanKeyGuard=async()=>null;
  ctx.window.XLSX=ctx.XLSX={utils:{
    book_new:()=>({sheets:[]}),json_to_sheet:rows=>({rows:clone(rows)}),
    book_append_sheet:(book,sheet,name)=>book.sheets.push({name,...sheet})
  },writeFile:(book,name)=>exports.push({book,name})};
  vm.createContext(ctx);vm.runInContext(functions,ctx);
  store.set(studentPath,{roll:1,name:'Student One'});
  const state=()=>vm.runInContext('reportState',ctx);
  const select=(...names)=>{
    ctx.current.selectedSubjects=names;
    ctx.current.partBySubject=Object.fromEntries(names.map(name=>[name,'OMR']));
  };
  function scan(names,total=21,correct=21,wrong=19,part='OMR'){
    if(typeof names==='string')names=[names];
    return {examId:ctx.current.examId,academicYear:ctx.academicYear,classId:ctx.current.classId,sectionId:ctx.current.sectionId,
      roll:'1',selectedSubjects:names,subjectName:names.length===1?names[0]:null,partBySubject:Object.fromEntries(names.map(name=>[name,part])),
      subtopicName:names.length===1?part:null,
      answers:Object.fromEntries(names.map(name=>[name,{1:['A'],2:['B']}])),
      score:{total:total*names.length,perSection:Object.fromEntries(names.map(name=>[name,total]))},
      questionDetails:names.flatMap(name=>Array.from({length:correct+wrong},(_,i)=>({subject:name,part,question:i+1,
        attempted:'A',correct:i<correct?'A':'B',status:i<correct?'correct':'wrong',marks:i<correct?1:0}))),
      counts:{correct:correct*names.length,wrong:wrong*names.length,unanswered:0},capturedAt:'2026-11-26T10:00:00Z'};
  }
  const marksPath=studentPath+'/marks/SA1';
  const seedLegacy=(out,id='school__2026-27__class7__A__1')=>{
    const p=root+'/results/'+id;store.set(p,{...clone(out),schemaVersion:5,studentId:'student1'});return ref(p);
  };
  const rawScans=()=>[...store.keys()].filter(p=>p.startsWith(root+'/results/')&&!p.slice((root+'/results/').length).includes('/')).map(p=>ctx.omrReportScan(snap(p)));
  return {ctx,store,select,scan,seedLegacy,marksPath,root,prompts,exports,elements,state,rawScans,ref,snap,
    beforeTransaction:hook=>{beforeTransaction=hook;},
    rows:subjects=>ctx.omrReportRow({id:'student1',roll:1,ref:ref(studentPath)},store.get(marksPath)||{},rawScans(),subjects),
    resultRef:(name,part='OMR')=>ctx.omrSubjectResultRef(scan(name),{subjectName:name,partName:part})};
}

test('all inline JavaScript parses',()=>{
  for(const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script);
});

for(const [first,second] of [['Math 1','Math 2'],['English 1','English 2'],['Physics','Chemistry'],['తెలుగు 1','తెలుగు 2']]){
  test(`${second} saves independently of legacy ${first}`,async()=>{
    const h=harness();h.select(second);
    const old=h.scan(first);old.partBySubject[second]='OMR';
    const legacy=h.seedLegacy(old),before=clone(h.store.get(legacy.path));
    h.store.set(h.marksPath,{[first]:34,__subs:{[first]:{OMR:21,Descriptive:13},[second]:{Descriptive:10}}});
    const missing=h.rows([second]);
    assert.equal(missing.counts,null);assert.equal(missing.scans.length,0);
    assert.equal((await h.ctx.findExistingOmrScan(h.scan(second))).duplicates.length,0);
    await h.ctx.saveScanToFirestore(h.scan(second,18,18,22));
    assert.equal(h.prompts.length,0);
    assert.deepEqual(h.store.get(legacy.path),before);
    assert.equal(h.store.get(h.marksPath)[first],34);
    assert.equal(h.store.get(h.marksPath)[second],28);
    assert.equal(h.rows([first]).counts.correct,21);
    assert.equal(h.rows([second]).counts.correct,18);
    assert.deepEqual(h.store.get(h.resultRef(second).path).selectedSubjects,[second]);
  });
}

test('missing Math 2 reproducer shows Not scanned with no borrowed 21/19 or rank',async()=>{
  const h=harness();h.select('Math 2');h.seedLegacy(h.scan('Math 1'));
  h.store.set(h.marksPath,{'Math 1':34});
  const rows=await h.ctx.loadReportsFromFirestore(false);
  assert.equal(rows[0].hasData,false);assert.equal(rows[0].counts,null);assert.equal(rows[0].rank,null);
  assert.equal(h.elements.get('reportCount').textContent,'0');
  assert.match(h.elements.get('reportBody').innerHTML,/Not scanned/);
  assert.doesNotMatch(h.elements.get('reportBody').innerHTML,/>21<|>19</);
  h.ctx.openReportDetail(0);
  assert.equal(h.elements.get('btnDetailEdit').disabled,true);
  assert.equal(h.elements.get('btnDetailDelete').disabled,true);
  h.ctx.exportReportsXlsx();
  const summary=h.exports[0].book.sheets[0].rows[0];
  assert.equal(summary['Math 2 Total'],'Not scanned');assert.equal(summary.Correct,'');
  assert.equal(h.exports[0].book.sheets[1].rows.length,0);
});

test('an actual scanned zero remains a zero and is ranked',async()=>{
  const h=harness();h.select('English 2');
  await h.ctx.saveScanToFirestore(h.scan('English 2',0,0,40));
  const rows=await h.ctx.loadReportsFromFirestore(false);
  assert.equal(rows[0].hasData,true);assert.equal(rows[0].total,0);assert.equal(rows[0].rank,1);
  assert.equal(rows[0].counts.correct,0);assert.equal(rows[0].counts.wrong,40);
  assert.equal(h.elements.get('reportCount').textContent,'1');
});

test('a multi-subject scan stores isolated records and Excel counts for every paper',async()=>{
  const h=harness();h.select('Math 1','Math 2','English 1','English 2');
  await h.ctx.saveScanToFirestore(h.scan(h.ctx.current.selectedSubjects,12,12,28));
  assert.equal(h.rawScans().length,4);
  for(const name of h.ctx.current.selectedSubjects){
    const stored=h.store.get(h.resultRef(name).path);
    assert.deepEqual(stored.selectedSubjects,[name]);assert.deepEqual(Object.keys(stored.score.perSection),[name]);
    assert.equal(stored.questionDetails.length,40);assert.equal(stored.counts.correct,12);
  }
  await h.ctx.loadReportsFromFirestore(false);h.ctx.exportReportsXlsx();
  assert.match(h.elements.get('reportHead').innerHTML,/English 1 ✓/);
  assert.match(h.elements.get('reportHead').innerHTML,/English 2 ✓/);
  const summary=h.exports[0].book.sheets[0].rows[0];
  assert.equal(summary['English 1 Correct'],12);assert.equal(summary['English 2 Correct'],12);
  assert.equal(h.exports[0].book.sheets[1].rows.length,160);
});

test('only the same subject and same part requests replacement; cancellation writes nothing',async()=>{
  const h=harness();h.select('English 1');
  await h.ctx.saveScanToFirestore(h.scan('English 1'));
  const before=clone([...h.store]);h.ctx.confirmResult=false;
  const saved=await h.ctx.saveScanToFirestore(h.scan('English 1',19,19,21));
  assert.equal(saved.cancelled,true);assert.deepEqual([...h.store],before);
  assert.match(h.prompts[0].subtitle,/English 1/);
  h.select('English 2');await h.ctx.saveScanToFirestore(h.scan('English 2'));
  assert.equal(h.prompts.length,1);
});

test('replacement archives only its own paper and retains other marks and descriptive components',async()=>{
  const h=harness();h.select('English 1','English 2');
  h.store.set(h.marksPath,{__subs:{'English 1':{Descriptive:20},'English 2':{Descriptive:15}}});
  await h.ctx.saveScanToFirestore(h.scan(['English 1','English 2'],10,10,30));
  const other=clone(h.store.get(h.resultRef('English 1').path));
  h.select('English 2');await h.ctx.saveScanToFirestore(h.scan('English 2',25,25,15));
  assert.deepEqual(h.store.get(h.resultRef('English 1').path),other);
  assert.equal(h.store.get(h.marksPath)['English 1'],30);
  assert.equal(h.store.get(h.marksPath)['English 2'],40);
  const history=[...h.store.entries()].filter(([p])=>p.startsWith(h.resultRef('English 2').path+'/history/'));
  assert.equal(history.length,1);assert.deepEqual(history[0][1].selectedSubjects,['English 2']);
});

test('two OMR parts of one subject save independently and deletion removes only the chosen part',async()=>{
  const h=harness();h.select('English 1');
  h.ctx.examSubjects.find(s=>s.name==='English 1').subtopics=[{name:'Paper A',max:40,entryMode:'omr'},{name:'Paper B',max:40,entryMode:'omr'},{name:'Descriptive',max:20,entryMode:'manual'}];
  h.store.set(h.marksPath,{__subs:{'English 1':{Descriptive:10}}});
  await h.ctx.saveScanToFirestore(h.scan('English 1',12,12,28,'Paper A'));
  await h.ctx.saveScanToFirestore(h.scan('English 1',15,15,25,'Paper B'));
  assert.equal(h.prompts.length,0);assert.equal(h.store.get(h.marksPath)['English 1'],37);
  await h.ctx.loadReportsFromFirestore(false);
  const row=h.state().rows[0],paperA=row.scans.find(s=>s.subtopicName==='Paper A');
  await h.ctx.deleteOmrScanForReport(row,paperA);
  assert.equal(h.store.get(h.marksPath)['English 1'],25);
  assert.equal(h.rows(['English 1']).scans.length,1);
  assert.equal(h.rows(['English 1']).counts.correct,15);
});

test('legacy combined scans are projected by subject and new records do not double-count them',async()=>{
  const h=harness();h.select('Math 1','English 1');
  const legacy=h.seedLegacy(h.scan(['Math 1','English 1'],20,20,20));
  assert.equal(h.rows(['English 1']).counts.correct,20);
  h.select('English 1');await h.ctx.saveScanToFirestore(h.scan('English 1',16,16,24));
  assert.equal(h.rows(['English 1']).counts.correct,16);assert.equal(h.rows(['Math 1']).counts.correct,20);
  assert.equal(h.rows(['Math 1','English 1']).counts.correct,36);
  assert.ok(h.store.has(legacy.path));
});

test('old overwritten subject can be read from history without modifying marks or records',async()=>{
  const h=harness();h.select('Math 1');
  const legacy=h.seedLegacy(h.scan('English 1',10,10,30));
  h.store.set(legacy.path+'/history/old',{...h.scan('Math 1',21,21,19),schemaVersion:5,studentId:'student1'});
  h.store.set(h.marksPath,{'Math 1':34,'English 1':10});
  const before=clone([...h.store]);
  const lookup=await h.ctx.findExistingOmrScan(h.scan('Math 1'));
  assert.equal(lookup.duplicates.length,1);assert.match(lookup.duplicates[0].duplicateSnap.ref.path,/history/);
  const rows=await h.ctx.loadReportsFromFirestore(false);
  assert.equal(rows[0].total,21);assert.equal(rows[0].counts.correct,21);
  assert.deepEqual([...h.store],before);
});

test('deleting one paper from a legacy combined scan preserves the others and prevents resurrection',async()=>{
  const h=harness();h.select('Math 1','English 1');
  const legacy=h.seedLegacy(h.scan(['Math 1','English 1'],20,20,20));
  h.store.set(h.marksPath,{'Math 1':30,'English 1':35,__subs:{'Math 1':{OMR:20,Descriptive:10},'English 1':{OMR:20,Descriptive:15}}});
  await h.ctx.loadReportsFromFirestore(false);
  const row=h.state().rows[0],english=row.scans.find(s=>s.subjectName==='English 1');
  await h.ctx.deleteOmrScanForReport(row,english);
  assert.equal(h.store.get(h.marksPath)['Math 1'],30);assert.equal(h.store.get(h.marksPath)['English 1'],15);
  assert.equal(h.rows(['English 1']).counts,null);assert.equal(h.rows(['Math 1']).counts.correct,20);
  assert.equal((await h.ctx.findExistingOmrScan(h.scan('English 1'))).duplicates.length,0);
  assert.ok(h.store.has(legacy.path));
});

test('report edit uses the chosen paper, not the entire original multi-subject scan',async()=>{
  const h=harness();h.select('Math 1','English 1');h.seedLegacy(h.scan(['Math 1','English 1'],20,20,20));
  await h.ctx.loadReportsFromFirestore(false);
  h.ctx.openReportDetail(0,1);h.elements.get('btnDetailEdit').onclick();
  const out=h.ctx.lastReview.out;
  assert.deepEqual(clone(out.selectedSubjects),['English 1']);
  assert.deepEqual(Object.keys(out.score.perSection),['English 1']);
  assert.ok(out.questionDetails.every(q=>q.subject==='English 1'));
});

test('concurrent same-paper changes abort the whole save and retain other papers',async()=>{
  const h=harness();h.select('English 2');
  const result=h.resultRef('English 2');
  h.beforeTransaction(()=>h.store.set(result.path,{...h.scan('English 2',18,18,22),schemaVersion:6}));
  await assert.rejects(()=>h.ctx.saveScanToFirestore(h.scan('English 2')),/The saved paper changed/);
  assert.equal(h.store.has(h.marksPath),false);
  assert.equal(h.store.get(result.path).score.total,18);
});

test('Firestore map order and a settled server timestamp do not cause false scan conflicts',async()=>{
  const h=harness();h.select('Math 1');await h.ctx.saveScanToFirestore(h.scan('Math 1'));
  const result=h.resultRef('Math 1');
  h.beforeTransaction(()=>{
    const reverse=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(reverse):
      Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reverse(item)])):value;
    h.store.set(result.path,{...reverse(h.store.get(result.path)),updatedAt:{seconds:9999999999}});
  });
  assert.equal((await h.ctx.saveScanToFirestore(h.scan('Math 1',18,18,22))).saved,true);
  assert.equal(h.store.get(result.path).score.total,18);
});

test('a real answer change still conflicts even if the stored total is unchanged',async()=>{
  const h=harness();h.select('Math 1');await h.ctx.saveScanToFirestore(h.scan('Math 1'));
  const result=h.resultRef('Math 1');
  h.beforeTransaction(()=>{h.store.get(result.path).answers['Math 1'][1]=['D'];});
  await assert.rejects(()=>h.ctx.saveScanToFirestore(h.scan('Math 1')),/The saved paper changed/);
  assert.deepEqual(h.store.get(result.path).answers['Math 1'][1],['D']);
});

test('offline queue sends each paper to its own record and keeps unmatched exams queued',async()=>{
  const h=harness();h.select('English 2');
  const otherExam={...h.scan('Math 1'),examId:'SA2'};
  h.ctx.localData.omrOfflineQueue_school=JSON.stringify([h.scan('English 1'),h.scan('English 2'),otherExam]);
  await h.ctx.syncOfflineQueueForCurrentSelection();
  assert.equal(h.rawScans().length,2);assert.equal(h.prompts.length,0);
  assert.equal(JSON.parse(h.ctx.localData.omrOfflineQueue_school).length,1);
});

test('different sections/years and unrelated part mappings never donate counts',async()=>{
  const h=harness();h.select('English 2');
  const old=h.scan('English 1');old.partBySubject['English 2']='OMR';
  h.seedLegacy(old);h.seedLegacy({...h.scan('English 2'),sectionId:'B'},'other-section');
  h.seedLegacy({...h.scan('English 2'),academicYear:'2025-26'},'other-year');
  const rows=await h.ctx.loadReportsFromFirestore(false);
  assert.equal(rows[0].counts,null);assert.equal(rows[0].hasData,false);
});

test('identity preserves paper punctuation and Unicode rather than collapsing names',()=>{
  const h=harness();
  const names=['English 1','English 2','English/A','English A','తెలుగు 1','తెలుగు 2'];
  const refs=names.map(name=>h.resultRef(name).path);
  assert.equal(new Set(refs).size,names.length);
  assert.equal(h.resultRef('English 1','Paper A').path===h.resultRef('English 1','Paper B').path,false);
});

test('a stale delete cannot hide a newer paper saved by another device',async()=>{
  const h=harness();h.select('English 1');h.seedLegacy(h.scan('English 1'));
  await h.ctx.loadReportsFromFirestore(false);
  const row=h.state().rows[0],scan=row.scans[0];
  await h.ctx.saveScanToFirestore(h.scan('English 1',18,18,22));
  const before=clone([...h.store]);
  await assert.rejects(()=>h.ctx.deleteOmrScanForReport(row,scan),/paper changed/);
  assert.deepEqual([...h.store],before);
});

test('legacy combined totals without question details are never borrowed by a single paper',()=>{
  const h=harness();
  const old=h.scan(['Math 1','English 1'],20,20,20);delete old.questionDetails;
  h.seedLegacy(old);
  const row=h.rows(['English 1']);
  assert.equal(row.scans.length,1);assert.equal(row.counts,null);
});

test('saving after deletion creates a fresh independent scan without changing another paper',async()=>{
  const h=harness();h.select('English 1','English 2');
  h.seedLegacy(h.scan(['English 1','English 2'],20,20,20));
  await h.ctx.loadReportsFromFirestore(false);
  const row=h.state().rows[0];
  await h.ctx.deleteOmrScanForReport(row,row.scans.find(scan=>scan.subjectName==='English 2'));
  h.select('English 2');
  await h.ctx.saveScanToFirestore(h.scan('English 2',18,18,22));
  assert.equal(h.prompts.length,0);assert.equal(h.rows(['English 2']).counts.correct,18);
  assert.equal(h.rows(['English 1']).counts.correct,20);
});

for(const subject of ['Math 1','Math 2','English 1','English 2']){
  test(`${subject}: a stored 1.00 without an OMR scan is not a result`,async()=>{
    const h=harness();h.select(subject);
    h.store.set(h.marksPath,{[subject]:1,__subs:{[subject]:{Descriptive:1}}});
    const before=clone([...h.store]);
    const rows=await h.ctx.loadReportsFromFirestore(false),row=rows[0];
    assert.equal(row.hasData,false);
    assert.equal(row.isComplete,false);
    assert.equal(row.total,null);
    assert.equal(row.rank,null);
    assert.equal(row.counts,null);
    assert.equal(row.breakdown[subject].total,null);
    assert.equal(h.elements.get('reportCount').textContent,'0');
    assert.equal(h.elements.get('reportAverage').textContent,'—');
    assert.match(h.elements.get('reportBody').innerHTML,/Not scanned/);
    assert.doesNotMatch(h.elements.get('reportBody').innerHTML,/1\.00/);
    h.ctx.openReportDetail(0);
    assert.match(h.elements.get('detailSummary').innerHTML,/<strong>Not scanned<\/strong><span>TOTAL MARKS/);
    assert.equal(h.elements.get('btnDetailEdit').disabled,true);
    assert.equal(h.elements.get('btnDetailDelete').disabled,true);
    h.ctx.exportReportsXlsx();
    const summary=h.exports[0].book.sheets[0].rows[0];
    assert.equal(summary[`${subject} Total`],'Not scanned');
    assert.equal(summary[`${subject} - Descriptive`],undefined);
    assert.equal(summary['Total Marks'],'Not scanned');
    assert.equal(summary.Percentage,'');
    assert.equal(summary.Rank,'');
    assert.deepEqual([...h.store],before);
  });
}

test('unscanned stored marks are excluded from report count, class average, highest and ranking',async()=>{
  const h=harness();h.select('Math 1');
  const students='years/2026-27/classes/class7/sections/A/students/';
  h.store.set(h.marksPath,{'Math 1':34});
  h.seedLegacy(h.scan('Math 1',34,21,19));
  h.store.set(students+'student2',{roll:2,name:'Student Two'});
  h.store.set(students+'student2/marks/SA1',{'Math 1':31});
  h.store.set(h.root+'/results/student-two',{
    ...h.scan('Math 1',31,18,22),schemaVersion:5,roll:'2',studentId:'student2'
  });
  // A high unscanned mark makes a highest/rank regression visible too.
  h.store.set(students+'student3',{roll:3,name:'Student Three'});
  h.store.set(students+'student3/marks/SA1',{'Math 1':99});
  const before=clone([...h.store]);
  const rows=await h.ctx.loadReportsFromFirestore(false);
  assert.equal(rows[0].rank,1);assert.equal(rows[1].rank,2);assert.equal(rows[2].rank,null);
  assert.equal(h.elements.get('reportCount').textContent,'2');
  assert.equal(h.elements.get('reportAverage').textContent,'32.50');
  assert.equal(h.elements.get('reportHighest').textContent,'34.00');
  assert.match(h.elements.get('reportStatus').textContent,/1 not scanned/);
  assert.doesNotMatch(h.elements.get('reportBody').innerHTML,/99\.00/);
  assert.deepEqual([...h.store],before);
});

test('an incomplete multi-paper report has no final total, percentage or rank',async()=>{
  const h=harness();h.select('Math 1','English 2');
  h.store.set(h.marksPath,{'Math 1':34,'English 2':1});
  h.seedLegacy(h.scan('Math 1',34,21,19));
  const rows=await h.ctx.loadReportsFromFirestore(false),row=rows[0];
  assert.equal(row.hasData,true);assert.equal(row.isComplete,false);
  assert.equal(row.total,null);assert.equal(row.rank,null);
  assert.equal(row.breakdown['Math 1'].total,34);
  assert.equal(row.breakdown['English 2'].total,null);
  assert.match(h.elements.get('reportBody').innerHTML,/<strong>Incomplete<\/strong>/);
  assert.doesNotMatch(h.elements.get('reportBody').innerHTML,/35\.00|1\.00/);
  assert.equal(h.elements.get('reportCount').textContent,'0');
  assert.match(h.elements.get('reportStatus').textContent,/1 partially scanned/);
  h.ctx.exportReportsXlsx();
  const summary=h.exports[0].book.sheets[0].rows[0];
  assert.equal(summary['English 2 Total'],'Not scanned');
  assert.equal(summary['Total Marks'],'Incomplete');
  assert.equal(summary.Percentage,'');assert.equal(summary.Rank,'');
});

for(const subject of ['Math 1','Math 2','English 1','English 2']){
  test(`${subject}: MCQ report uses 21/40 even when the full subject mark is 51/100`,async()=>{
    const h=harness();h.select(subject);
    h.seedLegacy(h.scan(subject,21,21,19));
    h.store.set(h.marksPath,{[subject]:51,__subs:{[subject]:{OMR:21,Descriptive:20,Internal:10}}});
    const before=clone([...h.store]);
    const rows=await h.ctx.loadReportsFromFirestore(false),row=rows[0];
    assert.equal(row.total,21);
    assert.equal(row.breakdown[subject].total,21);
    assert.equal(h.elements.get('reportMax').textContent,'40.00');
    assert.equal(h.elements.get('reportAverage').textContent,'21.00');
    assert.equal(h.elements.get('reportHighest').textContent,'21.00');
    assert.doesNotMatch(h.elements.get('reportBody').innerHTML,/51\.00/);
    h.ctx.openReportDetail(0);
    assert.match(h.elements.get('detailSummary').innerHTML,/21\.00 \/ 40\.00/);
    assert.match(h.elements.get('detailSummary').innerHTML,/52\.5%/);
    assert.doesNotMatch(h.elements.get('detailSummary').innerHTML,/Descriptive|Internal|51\.00|100\.00/);
    h.ctx.exportReportsXlsx();
    const summary=h.exports[0].book.sheets[0].rows[0];
    assert.equal(summary[`${subject} Total`],21);
    assert.equal(summary['Total Marks'],21);
    assert.equal(summary['Maximum Marks'],40);
    assert.equal(summary.Percentage,52.5);
    assert.equal(summary[`${subject} - Descriptive`],undefined);
    assert.equal(summary[`${subject} - Internal`],undefined);
    assert.deepEqual([...h.store],before);
  });
}

test('MCQ ranks, average and highest ignore the ordering of overall subject marks',async()=>{
  const h=harness();h.select('Math 1');
  const students='years/2026-27/classes/class7/sections/A/students/';
  h.seedLegacy(h.scan('Math 1',21,21,19));
  h.store.set(h.marksPath,{'Math 1':51,__subs:{'Math 1':{OMR:21,Descriptive:20,Internal:10}}});
  h.store.set(students+'student2',{roll:2,name:'Student Two'});
  h.store.set(students+'student2/marks/SA1',{'Math 1':45,__subs:{'Math 1':{OMR:38,Descriptive:3,Internal:4}}});
  h.store.set(h.root+'/results/student-two',{
    ...h.scan('Math 1',38,38,2),roll:'2',studentId:'student2',schemaVersion:5
  });
  const before=clone([...h.store]);
  const rows=await h.ctx.loadReportsFromFirestore(false);
  assert.equal(rows[0].total,21);assert.equal(rows[0].rank,2);
  assert.equal(rows[1].total,38);assert.equal(rows[1].rank,1);
  assert.equal(h.elements.get('reportMax').textContent,'40.00');
  assert.equal(h.elements.get('reportAverage').textContent,'29.50');
  assert.equal(h.elements.get('reportHighest').textContent,'38.00');
  assert.deepEqual([...h.store],before);
});

for(const maximum of [30,60]){
  test(`an exam configured for ${maximum} MCQ marks uses ${maximum} automatically`,async()=>{
    const h=harness();h.select('Physics');
    const subject=h.ctx.examSubjects.find(s=>s.name==='Physics');
    subject.subtopics[0].max=maximum;
    subject.subtopics[1].max=100-maximum-20;
    h.ctx.tpl.sectionConfigs={Physics:{name:'Physics',count:maximum,mark:1}};
    h.seedLegacy(h.scan('Physics',maximum/2,maximum/2,maximum/2));
    h.store.set(h.marksPath,{Physics:70});
    await h.ctx.loadReportsFromFirestore(false);h.ctx.exportReportsXlsx();
    assert.equal(h.elements.get('reportMax').textContent,maximum.toFixed(2));
    const record=h.exports[0].book.sheets[0].rows[0];
    assert.equal(record['Maximum Marks'],maximum);
    assert.equal(record['Physics Maximum'],maximum);
    assert.equal(record['Total Marks'],maximum/2);
    assert.equal(record.Percentage,50);
  });
}

test('two selected subjects aggregate their MCQ scores and MCQ maxima independently',async()=>{
  const h=harness();h.select('English 1','English 2');
  h.ctx.examSubjects.find(s=>s.name==='English 2').subtopics[0].max=30;
  h.seedLegacy(h.scan('English 1',21,21,19),'english-one');
  h.seedLegacy(h.scan('English 2',15,15,15),'english-two');
  h.store.set(h.marksPath,{'English 1':51,'English 2':70});
  const rows=await h.ctx.loadReportsFromFirestore(false);h.ctx.exportReportsXlsx();
  assert.equal(rows[0].total,36);
  assert.equal(h.elements.get('reportMax').textContent,'70.00');
  const record=h.exports[0].book.sheets[0].rows[0];
  assert.equal(record['English 1 Total'],21);assert.equal(record['English 2 Total'],15);
  assert.equal(record['Maximum Marks'],70);assert.equal(record['Total Marks'],36);
});

test('a reviewed MCQ score is retained without recomputing it from the number correct',async()=>{
  const h=harness();h.select('Math 1');
  const scan=h.scan('Math 1',24,21,19);scan.manualScoreAdjustment=true;
  h.seedLegacy(scan);h.store.set(h.marksPath,{'Math 1':54});
  const rows=await h.ctx.loadReportsFromFirestore(false);
  assert.equal(rows[0].total,24);assert.equal(rows[0].counts.correct,21);
  assert.equal(h.elements.get('reportMax').textContent,'40.00');
});

test('a real MCQ zero stays zero even when descriptive and internal marks exist',async()=>{
  const h=harness();h.select('Math 1');h.seedLegacy(h.scan('Math 1',0,0,40));
  h.store.set(h.marksPath,{'Math 1':30,__subs:{'Math 1':{OMR:0,Descriptive:20,Internal:10}}});
  const rows=await h.ctx.loadReportsFromFirestore(false);
  assert.equal(rows[0].total,0);assert.equal(rows[0].rank,1);
  assert.equal(h.elements.get('reportHighest').textContent,'0.00');
});

test('whole-paper custom OMR uses its template maximum when it has no split components',async()=>{
  const h=harness();h.select('Physics');
  h.ctx.examSubjects.find(s=>s.name==='Physics').subtopics=[];
  h.ctx.tpl.sectionConfigs={Physics:{name:'Physics',count:25,mark:2}};
  h.seedLegacy(h.scan('Physics',20,10,15,''));h.store.set(h.marksPath,{Physics:80});
  const rows=await h.ctx.loadReportsFromFirestore(false);
  assert.equal(rows[0].total,20);assert.equal(h.elements.get('reportMax').textContent,'50.00');
});

test('a descriptive scan is excluded while the archived MCQ scan is restored',async()=>{
  const h=harness();h.select('Math 1');
  const legacy=h.seedLegacy(h.scan('Math 1',20,20,20,'Descriptive'));
  h.store.set(legacy.path+'/history/mcq',{...h.scan('Math 1',21,21,19),schemaVersion:5,studentId:'student1'});
  h.store.set(h.marksPath,{'Math 1':51,__subs:{'Math 1':{OMR:21,Descriptive:20,Internal:10}}});
  const rows=await h.ctx.loadReportsFromFirestore(false);
  assert.equal(rows[0].total,21);assert.equal(rows[0].counts.correct,21);
  assert.equal(rows[0].scans.length,1);
  assert.equal(rows[0].scans[0].subtopicName,'OMR');
  assert.equal(h.elements.get('reportMax').textContent,'40.00');
});

test('custom named MCQ components use their configured maximum',async()=>{
  const h=harness();h.select('Physics');
  h.ctx.examSubjects.find(s=>s.name==='Physics').subtopics=[{name:'Part A',max:60,entryMode:'manual'},{name:'Written',max:40,entryMode:'manual'}];
  h.ctx.current.partBySubject.Physics='Part A';
  h.seedLegacy(h.scan('Physics',30,30,30,'Part A'));
  h.store.set(h.marksPath,{Physics:75});
  const rows=await h.ctx.loadReportsFromFirestore(false);
  assert.equal(rows[0].total,30);assert.equal(h.elements.get('reportMax').textContent,'60.00');
});

test('a corrected roll saves to the new student without replacing the mistakenly bubbled roll',async()=>{
  const h=harness();h.select('English 2');
  const original=h.seedLegacy(h.scan('English 2',18,18,22));
  const originalData=clone(h.store.get(original.path));
  h.store.set(h.marksPath,{'English 2':18});
  const secondPath=h.marksPath.split('/marks/')[0].replace('student1','student2');
  h.ctx.findStudentByRoll=async roll=>Number(roll)===2
    ? {id:'student2',ref:h.ref(secondPath),roll:2,name:'Student Two'}
    : {id:'student1',ref:h.ref(h.marksPath.split('/marks/')[0]),roll:1,name:'Student One'};
  const out=h.scan('English 2',21,21,19);
  assert.equal((await h.ctx.findExistingOmrScan(out)).duplicates.length,1);
  out.roll='2';
  await h.ctx.saveScanToFirestore(out);
  assert.equal(h.prompts.length,0);
  assert.deepEqual(h.store.get(original.path),originalData);
  assert.equal(h.store.get(h.marksPath)['English 2'],18);
  assert.equal(h.store.get(secondPath+'/marks/SA1')['English 2'],21);
  const record=h.store.get(h.ctx.omrSubjectResultRef(out,{subjectName:'English 2',partName:'OMR'}).path);
  assert.equal(record.studentId,'student2');assert.equal(record.roll,'2');
});

test('unclear answers cannot be saved until explicitly reviewed and confirmed',async()=>{
  const h=harness();h.select('Math 1');
  const out=h.scan('Math 1');
  out.recognitionMeta={uncertain:[{section:'Math 1',question:31,option:'C',reason:'damaged-outline'}]};
  const before=clone([...h.store]);
  await assert.rejects(()=>h.ctx.saveScanToFirestore(out),/Check and confirm/);
  assert.deepEqual([...h.store],before);
  out.recognitionReviewConfirmed=true;
  out.reviewedQuestions=[{subject:'Math 1',question:31,selected:['A','D']}];
  await h.ctx.saveScanToFirestore(out);
  const record=h.store.get(h.resultRef('Math 1').path);
  assert.equal(record.recognitionReviewConfirmed,true);
  assert.deepEqual(record.reviewedQuestions,out.reviewedQuestions);
});
