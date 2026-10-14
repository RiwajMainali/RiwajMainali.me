// @ts-nocheck -- Runtime CommonJS harness deliberately mocks Next request/response streams.
const {test, after}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Readable,Writable}=require('node:stream');
const {randomUUID}=require('node:crypto');
const folder=mkdtempSync(path.join(os.tmpdir(),'gym-tests-'));
process.env.GYM_DATA_DIR=folder;
process.env.GYM_ORIGIN='http://localhost:3000';
process.env.NODE_ENV='test';
delete process.env.GYM_SMTP_HOST;
const {db}=require('../src/lib/gym/db.ts');
const {digest}=require('../src/lib/gym/server.ts');
const {progression,estimatedMax,historyPoints,kg}=require('../src/lib/gym/progress.ts');
const {draftSchema}=require('../src/lib/gym/validation.ts');
const {emptyDraft}=require('../src/lib/gym/types.ts');
const handler=require('../src/server/gym-handler.ts').default;
const catalogue=require('../src/data/gym-exercises.json');
const alice=randomUUID(),bob=randomUUID(),pending=randomUUID();
const cookies={alice:'a'.repeat(64),bob:'b'.repeat(64),pending:'c'.repeat(64)};
for(const [uid,email,status,raw] of [[alice,'alice@test.com','approved',cookies.alice],[bob,'bob@test.com','approved',cookies.bob],[pending,'pending@test.com','pending',cookies.pending]]){
 db().prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(uid,email,email,status,new Date().toISOString());
 db().prepare('INSERT INTO devices VALUES(?,?,?)').run(digest(raw),uid,Date.now()+86400000);
}
class Response extends Writable {
 constructor(){super();this.statusCode=200;this.headers={};this.payload=null;this.parts=[];this.headersSent=false;}
 _write(chunk,_enc,cb){this.headersSent=true;this.parts.push(Buffer.from(chunk));cb();}
 setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;}
 status(s){this.statusCode=s;return this;}
 json(p){this.payload=p;this.headersSent=true;this.end();return this;}
}
async function request(route,method='GET',body,who='alice',headers={}){
 const [name,querystr]=route.split('?');const query=Object.fromEntries(new URLSearchParams(querystr));query.route=name.split('/');
 const req=Readable.from(body===undefined?[]:[Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body))]);
 req.method=method;req.headers={origin:process.env.GYM_ORIGIN,...headers};req.cookies={gym_device:cookies[who]};req.query=query;req.socket={remoteAddress:'127.0.0.1'};
 const res=new Response();await handler(req,res);return res;
}
const bench={...catalogue.find(e=>e.name==='barbell bench press')};
function entry(date,weight,reps=8,rpe=8,unit='kg') {return {...emptyDraft(),id:randomUUID(),exerciseId:bench.id,exercise:bench.name,date,unit,bodyweight:80,sets:[{weight,reps,rpe,warmup:false}],createdAt:date+'T10:00:00Z'};}
after(()=>{db().close();rmSync(folder,{recursive:true,force:true});});
test('catalogue preserves all 5632 original IDs and meaningful equipment variants',()=>{
 assert.equal(catalogue.length,5632);assert.equal(new Set(catalogue.map(e=>e.id)).size,5632);
 for(const eq of ['barbell','dumbbell','cable','smith machine','body weight']) assert.ok(catalogue.some(e=>e.equipment===eq),eq);
 assert.ok(catalogue.some(e=>/behind.*neck/i.test(e.name)));
});
test('progress waits for three distinct dates over 14 days; repeated rows cannot bypass baseline',()=>{
 assert.equal(progression([entry('2026-01-01',50),entry('2026-01-02',55),entry('2026-01-10',60)],bench).forecast.length,0);
 assert.equal(progression([entry('2026-01-01',50),entry('2026-01-01',50),entry('2026-01-16',60)],bench).forecast.length,0);
 const ready=progression([entry('2026-01-01',50),entry('2026-01-08',55),entry('2026-01-15',60)],bench);
 assert.equal(ready.forecast.length,2);assert.equal(ready.nextReps,9);assert.ok(ready.weeklyPercent>0);
});
test('fatigue, missing effort, assistance and declining history never trigger a rep increase',()=>{
 for(const effort of [10,null]) assert.equal(progression([entry('2026-01-01',50),entry('2026-01-08',55),entry('2026-01-15',60,8,effort)],bench).nextReps,8);
 assert.equal(progression([entry('2026-01-01',60),entry('2026-01-08',55),entry('2026-01-15',50)],bench).nextReps,8);
 assert.equal(progression([entry('2026-01-01',50),entry('2026-01-08',55),entry('2026-01-15',60)],{...bench,name:'assisted pullup',equipment:'assisted'}).forecast.length,0);
});
test('unit conversion, warmups and high-rep exclusions are consistent',()=>{
 assert.equal(estimatedMax({weight:100,reps:1,warmup:false}),100);
 assert.equal(estimatedMax({weight:100,reps:13,warmup:false}),null);
 assert.equal(estimatedMax({weight:100,reps:8,warmup:true}),null);
 const points=historyPoints([entry('2026-01-01',100,8,8,'kg'),entry('2026-01-08',100/0.45359237,8,8,'lb')]);
 assert.ok(Math.abs(points[0].max-points[1].max)<0.001);
 assert.ok(Math.abs(kg(220.462262,'lb')-100)<0.001);
});
test('validation rejects impossible dates, fractional reps and invalid RPE',()=>{
 const d={...emptyDraft(),exerciseId:bench.id};
 assert.equal(draftSchema.safeParse({...d,date:'2026-02-30'}).success,false);
 assert.equal(draftSchema.safeParse({...d,sets:[{weight:100,reps:2.5,rpe:8,warmup:false}]}).success,false);
 assert.equal(draftSchema.safeParse({...d,sets:[{weight:100,reps:8,rpe:10.5,warmup:false}]}).success,false);
});
test('unauthenticated, pending and cross-origin writes are denied',async()=>{
 assert.equal((await request('draft','GET',undefined,'nobody')).statusCode,401);
 assert.equal((await request('draft','GET',undefined,'pending')).statusCode,403);
 assert.equal((await request('draft','PUT',{},'alice',{origin:'https://attacker.test'})).statusCode,403);
 assert.equal((await request('admin/users')).statusCode,403);
});
test('drafts sync across sessions, isolate users and detect concurrent modifications',async()=>{
 const a=await request('draft');assert.equal(a.payload.revision,0);
 const draft={...emptyDraft(),exerciseId:bench.id,notes:'Phone draft'};
 const saved=await request('draft','PUT',{revision:0,draft});assert.equal(saved.statusCode,200);assert.equal(saved.payload.revision,1);
 assert.equal((await request('draft')).payload.draft.notes,'Phone draft');
 assert.equal((await request('draft','GET',undefined,'bob')).payload.draft.notes,'');
 assert.equal((await request('draft','PUT',{revision:0,draft:{...draft,notes:'Stale desktop'}})).statusCode,409);
 assert.equal((await request('draft')).payload.draft.notes,'Phone draft');
});
test('entry saves are atomic and idempotent; changed revisions cannot save',async()=>{
 const draft={...emptyDraft(),exerciseId:bench.id,notes:'Completed',sets:[{weight:135,reps:12,rpe:8,warmup:false}]};
 const r=await request('draft');const update=await request('draft','PUT',{revision:r.payload.revision,draft});
 const eid=randomUUID();assert.equal((await request('entries','POST',{id:eid,revision:0})).statusCode,409);
 assert.equal((await request('entries','POST',{id:eid,revision:update.payload.revision})).statusCode,201);
 assert.equal((await request('entries','POST',{id:eid,revision:update.payload.revision})).statusCode,201);
 const entries=await request('entries');assert.equal(entries.payload.total,1);assert.equal(entries.payload.entries[0].notes,'Completed');
 assert.equal((await request('entries','GET',undefined,'bob')).payload.total,0);
 assert.equal((await request('draft')).payload.draft.notes,'');
 assert.equal((await request('entries','DELETE',{id:eid},'bob')).statusCode,404);
});
test('private custom exercises are visible only to their owner',async()=>{
 const r=await request('exercises','POST',{name:'My cable BTN press setup',equipment:'cable',muscle:'shoulders'});
 assert.equal(r.statusCode,201);
 assert.equal((await request('exercise?id='+r.payload.exercise.id)).statusCode,200);
 assert.equal((await request('exercise?id='+r.payload.exercise.id,'GET',undefined,'bob')).statusCode,404);
 const res=await request('exercises?q=bench&equipment=barbell');assert.ok(res.payload.total>0);assert.ok(res.payload.exercises.every(e=>e.equipment==='barbell'));
});
test('pairing is single-use and does not leak account identity without a code',async()=>{
 const pair=await request('pair','POST',{});assert.equal(pair.payload.code.length,64);
 const r=await request('pair/redeem','POST',{code:pair.payload.code},'nobody');assert.equal(r.statusCode,200);assert.match(r.headers['set-cookie'],/HttpOnly/);
 assert.equal((await request('pair/redeem','POST',{code:pair.payload.code},'nobody')).statusCode,410);
});
test('approval GET is read-only, POST is single-use, and rejected access cannot pair',async()=>{
 const raw='f'.repeat(64);db().prepare('INSERT INTO approvals VALUES(?,?,?)').run(digest(raw),pending,Date.now()+100000);
 assert.equal((await request('approve?token='+raw,'GET',undefined,'nobody')).statusCode,200);
 assert.equal((await request('session','GET',undefined,'pending')).payload.user.status,'pending');
 assert.equal((await request('approve','POST',{token:raw,decision:'approved'},'nobody')).statusCode,200);
 assert.equal((await request('session','GET',undefined,'pending')).payload.user.status,'approved');
 assert.equal((await request('approve','POST',{token:raw,decision:'approved'},'nobody')).statusCode,410);
});
test('upload streams to private disk, enforces ownership, validates formats and supports ranges',async()=>{
 const png=Buffer.from('89504e470d0a1a0a00000000','hex');
 const r=await request('media','POST',png,'alice',{'content-length':String(png.length),'x-file-name':'lift.png'});assert.equal(r.statusCode,201);
 const mid=r.payload.media.id;assert.equal(r.payload.media.type,'image/png');
 assert.equal((await request('media/'+mid,'GET',undefined,'bob')).statusCode,404);
 const partial=await request('media/'+mid,'GET',undefined,'alice',{range:'bytes=0-3'});assert.equal(partial.statusCode,206);assert.equal(partial.headers['content-length'],4);
 assert.equal(partial.parts[0].toString('hex'),'89504e47');
 const bad=Buffer.from('<script>alert(1)</script>');assert.equal((await request('media','POST',bad,'alice',{'content-length':String(bad.length),'x-file-name':'x.png'})).statusCode,400);
 assert.equal((await request('media/'+mid,'GET',undefined,'alice',{range:'bytes=1000-2000'})).statusCode,416);
 const draft=(await request('draft')).payload;
 assert.equal((await request('draft','PUT',{revision:draft.revision,draft:{...draft.draft,mediaIds:[mid]}})).statusCode,200);
 assert.equal((await request('media/'+mid,'DELETE',{})).statusCode,409);
 assert.equal((await request('draft','PUT',{revision:0,draft:{...emptyDraft(),mediaIds:[mid]}},'bob')).statusCode,400);
});
test('SMTP failure rolls back registration; hard 100-user capacity fails closed',async()=>{
 const res=await request('request','POST',{name:'New',email:'new@test.com'},'nobody');assert.equal(res.statusCode,503);
 assert.equal(db().prepare('SELECT id FROM users WHERE email=?').get('new@test.com'),undefined);
 const n=db().prepare("SELECT count(*) n FROM users WHERE status IN ('approved','pending')").get().n;
 db().transaction(()=>{for(let i=n;i<100;i++)db().prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(randomUUID(),`limit${i}@test.com`,'Limit','approved',new Date().toISOString());})();
 assert.equal((await request('request','POST',{name:'Overflow',email:'overflow@test.com'},'nobody')).statusCode,409);
 assert.equal(db().prepare("SELECT count(*) n FROM users WHERE status IN ('approved','pending')").get().n,100);
});

test('206 aliases expand consistently; BTN and full names share the same existing IDs',()=>{
 const aliases=require('../src/data/gym-aliases.json');
 const {normalizeExerciseQuery:n,searchExercises:s}=require('../src/lib/gym/search.ts');
 assert.ok(aliases.length>=100);assert.equal(new Set(aliases.map(a=>a.alias)).size,aliases.length);
 for(const a of aliases)assert.equal(n(a.alias),n(a.expansion),a.alias);
 const a=s(catalogue,'bb seated btn ohp').exercises.map(e=>e.id);
 const b=s(catalogue,'barbell seated behind the neck overhead press').exercises.map(e=>e.id);
 assert.ok(a.includes('og-0086'));assert.deepEqual(a,b);
 assert.equal(s(catalogue,'nonsensezzzzzz').total,0);
 assert.equal(s(catalogue,'DB RDL').exercises.every(e=>e.equipment==='dumbbell'),true);
});
test('generic pulldown includes cable and machine; variant keywords remain mandatory',()=>{
 const {searchExercises:s}=require('../src/lib/gym/search.ts');
 const r=s(catalogue,'lat pulldown');
 assert.ok(r.suggested.some(e=>e.equipment==='cable'));
 assert.ok(r.suggested.some(e=>e.equipment==='leverage machine'));
 const full=[];for(let offset=0;offset<r.total;offset+=50)full.push(...s(catalogue,'lat pulldown','',offset).exercises);
 assert.ok(full.some(e=>e.equipment==='cable'));assert.ok(full.some(e=>e.equipment==='leverage machine'));
 const specific=s(catalogue,'WG LPD','cable');assert.ok(specific.total>0);
 assert.ok(specific.exercises.every(e=>e.equipment==='cable'&&/wide/.test(e.name)));
 const ambiguous=s(catalogue,'PU');assert.ok(ambiguous.exercises.some(e=>/push.up/.test(e.name)));assert.ok(ambiguous.exercises.some(e=>/pull.up/.test(e.name)));
});
test('matching personal history leads the first tier without overriding equipment or movement',()=>{
 const {searchExercises:s}=require('../src/lib/gym/search.ts');
 const used=catalogue.find(e=>e.equipment==='cable'&&e.name.includes('pulldown')&&e.name.includes('wide'));
 const usage=[{exerciseId:used.id,count:3,lastUsed:'2026-10-14T00:00:00Z'}];
 const r=s(catalogue,'lat pulldown','',0,usage);
 assert.equal(r.suggested[0].id,used.id);assert.equal(r.suggested[0].reason,'Previously logged');
 assert.ok(!s(catalogue,'DB RDL','',0,usage).suggested.some(e=>e.id===used.id));
 assert.ok(!s(catalogue,'lat pulldown','leverage machine',0,usage).suggested.some(e=>e.id===used.id));
});
test('alias-aware custom additions reuse one existing exercise instead of splitting its history',async()=>{
 const before=db().prepare('SELECT count(*) n FROM exercises').get().n;
 const r=await request('exercises','POST',{name:'BB seated BTN OHP',equipment:'barbell',muscle:'shoulders'});
 assert.equal(r.statusCode,200);assert.equal(r.payload.exercise.id,'og-0086');assert.equal(r.payload.reused,true);
 assert.equal(db().prepare('SELECT count(*) n FROM exercises').get().n,before);
 const result=await request('exercises?q=BTN%20OHP');assert.ok(result.payload.suggested.length>0);assert.equal(result.payload.aliasCount,206);
});

test('empty weight and reps stay blank in synced drafts but cannot become completed entries',async()=>{
 const prior=(await request('draft')).payload;
 const draft={...emptyDraft(),exerciseId:bench.id,sets:[{weight:null,reps:null,rpe:null,warmup:false}]};
 const saved=await request('draft','PUT',{revision:prior.revision,draft});assert.equal(saved.statusCode,200);
 const synced=(await request('draft')).payload;assert.equal(synced.draft.sets[0].weight,null);assert.equal(synced.draft.sets[0].reps,null);
 assert.equal((await request('entries','POST',{id:randomUUID(),revision:synced.revision})).statusCode,400);
 const filled={...draft,sets:[{weight:75,reps:12,rpe:8,warmup:false}]};
 const valid=await request('draft','PUT',{revision:synced.revision,draft:filled});assert.equal(valid.statusCode,200);
 assert.equal((await request('entries','POST',{id:randomUUID(),revision:valid.payload.revision})).statusCode,201);
 assert.equal(draftSchema.safeParse({...draft,sets:[{weight:'75',reps:12,rpe:null,warmup:false}]}).success,false);
 const {unitLabel}=require('../src/lib/gym/types.ts');assert.equal(unitLabel('lb'),'lbs');assert.equal(unitLabel('kg'),'kg');
});

test('cardio saves time and optional distance without lifting sets; blanks sync and resets after save',async()=>{
 const run=catalogue.find(e=>e.category==='cardio'&&/run/.test(e.name));
 const {isCardioExercise,workoutMode,cardioPace}=require('../src/lib/gym/types.ts');
 assert.equal(isCardioExercise(run),true);assert.equal(workoutMode(emptyDraft(),run),'cardio');assert.equal(workoutMode({mode:'strength'},run),'strength');
 const draft={...emptyDraft(),exerciseId:run.id,mode:'cardio',sets:[],cardio:{minutes:null,distance:null,distanceUnit:'mi',effort:null},notes:'Easy run'};
 let prior=(await request('draft')).payload;
 let saved=await request('draft','PUT',{revision:prior.revision,draft});assert.equal(saved.statusCode,200);
 assert.equal((await request('entries','POST',{id:randomUUID(),revision:saved.payload.revision})).statusCode,400);
 draft.cardio={minutes:30,distance:3,distanceUnit:'mi',effort:5};
 saved=await request('draft','PUT',{revision:saved.payload.revision,draft});assert.equal(saved.statusCode,200);
 assert.deepEqual((await request('draft')).payload.draft.cardio,draft.cardio);
 const eid=randomUUID();assert.equal((await request('entries','POST',{id:eid,revision:saved.payload.revision})).statusCode,201);
 const e=(await request('entries')).payload.entries.find(e=>e.id===eid);assert.equal(e.mode,'cardio');assert.deepEqual(e.sets,[]);assert.equal(e.cardio.minutes,30);assert.equal(cardioPace(e.cardio),'10:00 / mi');
 assert.deepEqual(historyPoints([e]),[]);
 const next=(await request('draft')).payload;assert.equal(next.draft.cardio.minutes,null);assert.equal(next.draft.cardio.distance,null);assert.equal(next.draft.notes,'');
 assert.equal(draftSchema.safeParse({...draft,cardio:{...draft.cardio,minutes:-1}}).success,false);
 assert.equal(draftSchema.safeParse({...draft,cardio:{...draft.cardio,distance:0}}).success,false);
 draft.cardio={minutes:20,distance:null,distanceUnit:'km',effort:null};
 saved=await request('draft','PUT',{revision:next.revision,draft});assert.equal(saved.statusCode,200);
 assert.equal((await request('entries','POST',{id:randomUUID(),revision:saved.payload.revision})).statusCode,201);
});

test('users can export all their records and synced draft, with no other users or credentials',async()=>{
 const secretId=randomUUID();const secret={...entry('2026-01-01',99),notes:'BOB_PRIVATE'};
 db().prepare('INSERT INTO entries VALUES(?,?,?,?,?)').run(secretId,bob,bench.id,JSON.stringify(secret),new Date().toISOString());
 const before=db().prepare('SELECT count(*) n FROM entries WHERE user_id=?').get(alice).n;
 db().transaction(()=>{for(let i=0;i<205;i++)db().prepare('INSERT INTO entries VALUES(?,?,?,?,?)').run(randomUUID(),alice,bench.id,JSON.stringify({...entry('2026-01-01',75),notes:'=HYPERLINK("bad")\nquoted, note'}),new Date().toISOString());})();
 const exported=await request('export?userId='+bob);assert.equal(exported.statusCode,200);assert.equal(exported.payload.user.id,alice);assert.equal(exported.payload.entries.length,before+205);assert.ok(exported.payload.draft);
 const serialized=JSON.stringify(exported.payload);assert.equal(serialized.includes('BOB_PRIVATE'),false);assert.equal(serialized.includes(cookies.alice),false);assert.match(exported.headers['content-disposition'],/attachment/);
 assert.equal((await request('export','GET',undefined,'nobody')).statusCode,401);
 const own=await request('export','GET',undefined,'bob');assert.equal(own.payload.entries.length,1);assert.equal(own.payload.entries[0].notes,'BOB_PRIVATE');
 const csv=await request('export?format=csv');assert.equal(csv.statusCode,200);const text=Buffer.concat(csv.parts).toString();assert.match(text,/duration_minutes/);assert.match(text,/cardio/);assert.match(text,/'=HYPERLINK/);assert.equal(text.includes('BOB_PRIVATE'),false);
 assert.equal((await request('export?format=html')).statusCode,400);
});


test('rep-max prediction preserves 1RM and decreases consistently through 15RM',()=>{
 const {predictedRepMax,estimatedMax}=require('../src/lib/gym/progress.ts');
 assert.equal(predictedRepMax(150,1),150);
 assert.equal(predictedRepMax(150,15),100);
 const baseline=estimatedMax({weight:100,reps:8,warmup:false});
 assert.ok(Math.abs(predictedRepMax(baseline,8)-100)<1e-9);
 for(let reps=2;reps<=15;reps++)assert.ok(predictedRepMax(150,reps)<predictedRepMax(150,reps-1));
 assert.throws(()=>predictedRepMax(150,0),RangeError);
 assert.throws(()=>predictedRepMax(150,16),RangeError);
 assert.throws(()=>predictedRepMax(150,2.5),RangeError);
});

test('volume aggregates exercise, whole-day and primary-muscle daily totals with consistent units',()=>{
 const {volumeRows,dailyVolume}=require('../src/lib/gym/volume.ts');
 const a={...entry('2026-01-01',100),exerciseId:'bench',exercise:'Bench',muscle:'pectorals'};
 const b={...entry('2026-01-01',100/0.45359237,8,8,'lb'),exerciseId:'incline',exercise:'Incline',muscle:'pectorals'};
 const c={...entry('2026-01-01',50),exerciseId:'row',exercise:'Row',muscle:'lats'};
 const d={...a,date:'2026-01-02'};
 const warm={...a,sets:[{weight:500,reps:8,rpe:6,warmup:true}]};
 const cardio={...a,mode:'cardio',sets:[]};
 const legacyCardio={...a,mode:undefined,category:'cardio'};
 const rows=volumeRows([a,b,c,d,warm,cardio,legacyCardio,a]);
 assert.equal(rows.length,4);
 const exercise=dailyVolume(rows,'exercise','bench');assert.equal(exercise.length,2);assert.equal(exercise[0].volume,1600);assert.equal(exercise[0].sets,2);
 const days=dailyVolume(rows,'day','');assert.ok(Math.abs(days[0].volume-2800)<1e-6);assert.equal(days[0].sets,4);assert.equal(days[1].volume,800);
 const chest=dailyVolume(rows,'muscle','Chest');assert.ok(Math.abs(chest[0].volume-2400)<1e-6);assert.equal(chest[0].sets,3);
 assert.equal(dailyVolume(rows,'muscle','Lats')[0].volume,400);
 assert.deepEqual(dailyVolume(rows,'exercise','not-logged'),[]);
});

test('volume endpoint uses full owned history, including records beyond the recent 200',async()=>{
 const res=await request('volume?userId='+bob);assert.equal(res.statusCode,200);assert.equal(res.payload.unit,'kg');
 const sets=res.payload.rows.reduce((n,r)=>n+r.sets,0);assert.ok(sets>200);
 assert.equal((await request('volume','GET',undefined,'nobody')).statusCode,401);
 const other=await request('volume','GET',undefined,'bob');assert.equal(other.payload.rows.length,1);assert.equal(other.payload.rows[0].volume,99*8);assert.equal(other.payload.rows[0].muscle,'Chest');assert.equal(other.payload.rows[0].sets,1);
});


test('hard sets start at RPE 7; default 6 and missing effort do not count toward volume',()=>{
 const {isHardSet,DEFAULT_RPE}=require('../src/lib/gym/types.ts');
 const {volumeRows,dailyVolume}=require('../src/lib/gym/volume.ts');
 assert.equal(DEFAULT_RPE,6);assert.equal(emptyDraft().sets[0].rpe,6);
 for(const rpe of [null,6,6.5])assert.equal(isHardSet({rpe,warmup:false}),false);
 for(const rpe of [7,7.5,10])assert.equal(isHardSet({rpe,warmup:false}),true);
 assert.equal(isHardSet({rpe:10,warmup:true}),true);
 const e={...entry('2026-01-01',100),muscle:'pectorals',sets:[6,6.5,7,8,null].map(rpe=>({weight:100,reps:8,rpe,warmup:false}))};
 e.sets.push({weight:500,reps:8,rpe:10,warmup:true});
 const rows=volumeRows([e]);assert.equal(rows[0].sets,3);assert.equal(rows[0].volume,5600);assert.equal(rows[0].reps,24);
 const easy={...e,sets:[{weight:100,reps:8,rpe:6,warmup:false}]};
 assert.equal(volumeRows([easy])[0].sets,0);assert.equal(dailyVolume(volumeRows([easy]),'day','')[0].volume,0);
 assert.equal(e.sets[4].rpe,null);
});

test('saved hard-set effort stays in history while next-session sets default to RPE 6',async()=>{
 const prior=(await request('draft')).payload;
 const draft={...emptyDraft(),exerciseId:bench.id,sets:[{weight:100,reps:8,rpe:7,warmup:false}]};
 const saved=await request('draft','PUT',{revision:prior.revision,draft});assert.equal(saved.statusCode,200);
 const id=randomUUID();assert.equal((await request('entries','POST',{id,revision:saved.payload.revision})).statusCode,201);
 assert.equal((await request('entries')).payload.entries.find(e=>e.id===id).sets[0].rpe,7);
 assert.equal((await request('draft')).payload.draft.sets[0].rpe,6);
});
