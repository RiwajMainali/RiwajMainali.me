#!/usr/bin/env node
// @ts-nocheck -- Node adapter deliberately adds the tested Next response/request interface.
// Small Node HTTP adapter: the same tested handler runs exclusively on EC2.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { isIP } = require('node:net');
const { createTrafficGuard } = require('./gym-traffic.cjs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText,
    filename
  );
};
const { db, dataDir } = require('../src/lib/gym/db.ts');
const handler = require('../src/server/gym-handler.ts').default;
db();
const guard = createTrafficGuard();
const metricsPath = path.join(dataDir(), 'traffic-metrics.json');
const rejectionWindows = [];
function publishMetrics() {
  const metrics = guard.snapshot();
  rejectionWindows.push(metrics.rejected);
  if (rejectionWindows.length > 5) rejectionWindows.shift();
  metrics.rejectedFiveMinutes = rejectionWindows.reduce((a, b) => a + b, 0);
  try {
    fs.writeFileSync(metricsPath + '.tmp', JSON.stringify(metrics), {
      mode: 0o600,
    });
    fs.renameSync(metricsPath + '.tmp', metricsPath);
  } catch {
    console.error('Gym traffic metrics write failed');
  }
  if (metrics.rejected)
    console.warn(JSON.stringify({ event: 'gym_traffic_rejected', ...metrics }));
}
publishMetrics();
const metricsTimer = setInterval(publishMetrics, 60000);
metricsTimer.unref();
function reject(req, res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Connection: 'close',
    'Retry-After': '5',
  });
  res.end(JSON.stringify({ error: message }));
}
const server = http.createServer({ maxHeaderSize: 16384 }, (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    reject(req, res, 400, 'Invalid request');
    return;
  }
  if (!url.pathname.startsWith('/api/gym/')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const peerHeader = req.headers['x-gym-peer'];
  const peer =
    typeof peerHeader === 'string' && isIP(peerHeader) ? peerHeader : 'unknown';
  const route = url.pathname.slice('/api/gym/'.length);
  const isUpload = route === 'media' && req.method === 'POST';
  const admission = guard.admit(
    peer,
    isUpload,
    ['request', 'pair/redeem', 'approve'].includes(route)
  );
  if (admission.status) {
    reject(req, res, admission.status, 'Server is busy. Try again shortly.');
    return;
  }
  res.once('finish', admission.release);
  res.once('close', admission.release);
  if (req.url.length > 4096) {
    reject(req, res, 414, 'Request URL is too long');
    return;
  }
  if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    reject(req, res, 405, 'Method not allowed');
    return;
  }
  const maxBody = isUpload ? 50 * 1024 * 1024 : 512 * 1024;
  if (Number(req.headers['content-length'] ?? 0) > maxBody) {
    reject(req, res, 413, 'Request is too large');
    return;
  }
  req.setTimeout(isUpload ? 300000 : 30000, () => req.destroy());
  req.query = Object.fromEntries(url.searchParams);
  req.query.route = url.pathname.slice('/api/gym/'.length).split('/');
  req.cookies = Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.includes('='))
      .map((s) => {
        const i = s.indexOf('=');
        return [s.slice(0, i), s.slice(i + 1)];
      })
  );
  res.status = function (status) {
    this.statusCode = status;
    return this;
  };
  res.json = function (data) {
    this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.end(JSON.stringify(data));
    return this;
  };
  void handler(req, res).catch(() => {
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Server error');
    } else res.destroy();
  });
});
server.requestTimeout = 300000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 1000;
server.maxConnections = 128;
server.maxHeadersCount = 100;
server.listen(Number(process.env.PORT ?? 3100), '127.0.0.1', () =>
  console.log('Gym backend ready on loopback')
);
process.on('SIGTERM', () =>
  server.close(() => {
    db().close();
    process.exit(0);
  })
);
