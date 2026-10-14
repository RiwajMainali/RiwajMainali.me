#!/usr/bin/env node
// @ts-nocheck -- Node adapter deliberately adds the tested Next response/request interface.
// Small Node HTTP adapter: the same tested handler runs exclusively on EC2.
const http = require('node:http');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText, filename);
};
const {db} = require('../src/lib/gym/db.ts');
const handler = require('../src/server/gym-handler.ts').default;
db();
const server=http.createServer((req,res)=>{
  const url = new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/api/gym/')) {res.writeHead(404);res.end('Not found');return;}
  req.query = Object.fromEntries(url.searchParams);
  req.query.route = url.pathname.slice('/api/gym/'.length).split('/');
  req.cookies = Object.fromEntries((req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
  res.status = function(status){this.statusCode=status;return this;};
  res.json = function(data){this.setHeader('Content-Type','application/json; charset=utf-8');this.end(JSON.stringify(data));return this;};
  void handler(req,res).catch(()=>{if(!res.headersSent){res.writeHead(500);res.end('Server error');}else res.destroy();});
});
server.requestTimeout=120000;server.headersTimeout=15000;
server.listen(Number(process.env.PORT??3100),'127.0.0.1',()=>console.log('Gym backend ready on loopback'));
process.on('SIGTERM',()=>server.close(()=>{db().close();process.exit(0);}));
