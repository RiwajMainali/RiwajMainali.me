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
