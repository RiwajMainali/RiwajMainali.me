// @ts-nocheck -- Node test harness exercises the CommonJS guard directly.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTrafficGuard } = require('./gym-traffic.cjs');

function clock() {
  let time = 0;
  return {
    now: () => time,
    advance: (milliseconds) => {
      time += milliseconds;
    },
  };
}

function releaseAll(admissions) {
  for (const admission of admissions) admission.release();
}

test('release is idempotent and decrements active and upload counts once', () => {
  const time = clock();
  const guard = createTrafficGuard({ now: time.now });
  const admission = guard.admit('peer-a', true);
  assert.equal(admission.status, 0);

  admission.release();
  admission.release();
  assert.deepEqual(guard.snapshot(), {
    time: 0,
    windowSeconds: 60,
    accepted: 1,
    rejected: 0,
    active: 0,
    uploads: 0,
  });
});

test('enforces 12 active requests per peer and 48 globally', () => {
  const guard = createTrafficGuard();
  const peerAdmissions = Array.from({ length: 12 }, () =>
    guard.admit('peer-a')
  );
  assert.ok(peerAdmissions.every((result) => result.status === 0));
  assert.equal(guard.admit('peer-a').status, 429);

  const globalGuard = createTrafficGuard();
  const admissions = Array.from({ length: 48 }, (_, index) =>
    globalGuard.admit(`peer-${index}`)
  );
  assert.ok(admissions.every((result) => result.status === 0));
  assert.equal(globalGuard.admit('one-more-peer').status, 503);
  releaseAll(admissions);
  releaseAll(peerAdmissions);
});

test('enforces four global and two per-peer concurrent uploads', () => {
  const peerGuard = createTrafficGuard();
  const peerUploads = Array.from({ length: 2 }, () =>
    peerGuard.admit('peer-a', true)
  );
  assert.ok(peerUploads.every((result) => result.status === 0));
  assert.equal(peerGuard.admit('peer-a', true).status, 429);

  const globalGuard = createTrafficGuard();
  const uploads = Array.from({ length: 4 }, (_, index) =>
    globalGuard.admit(`peer-${index}`, true)
  );
  assert.ok(uploads.every((result) => result.status === 0));
  assert.equal(globalGuard.admit('peer-extra', true).status, 503);
  releaseAll(peerUploads);
  releaseAll(uploads);
});

test('peer request bucket allows 90 immediately and refills at 30 per second', () => {
  const time = clock();
  const guard = createTrafficGuard({ now: time.now });
  for (let i = 0; i < 90; i++) {
    const admission = guard.admit('peer-a');
    assert.equal(admission.status, 0);
    admission.release();
  }
  assert.equal(guard.admit('peer-a').status, 429);
  time.advance(1000);
  const refilled = guard.admit('peer-a');
  assert.equal(refilled.status, 0);
  refilled.release();
});

test('global request bucket allows 120 immediately and refills at 60 per second', () => {
  const time = clock();
  const guard = createTrafficGuard({ now: time.now });
  for (let i = 0; i < 120; i++) {
    const admission = guard.admit(`peer-${i}`);
    assert.equal(admission.status, 0);
    admission.release();
  }
  assert.equal(guard.admit('peer-over-limit').status, 503);
  time.advance(1000);
  const refilled = guard.admit('peer-after-refill');
  assert.equal(refilled.status, 0);
  refilled.release();
});

test('sensitive bucket allows 10 immediately and refills at 0.2 per second', () => {
  const time = clock();
  const guard = createTrafficGuard({ now: time.now });
  for (let i = 0; i < 10; i++) {
    const admission = guard.admit('peer-a', false, true);
    assert.equal(admission.status, 0);
    admission.release();
  }
  assert.equal(guard.admit('peer-a', false, true).status, 429);
  time.advance(5000);
  const refilled = guard.admit('peer-a', false, true);
  assert.equal(refilled.status, 0);
  refilled.release();
});

test('bounds peer state at 4096 entries and evicts inactive state after five minutes', () => {
  const time = clock();
  const guard = createTrafficGuard({ now: time.now });
  const first = guard.admit('peer-old');
  assert.equal(first.status, 0);
  first.release();

  for (let i = 1; i < 4096; i++) {
    const admission = guard.admit(`peer-${i}`);
    assert.equal(admission.status, 0);
    admission.release();
    if (i % 60 === 0) time.advance(1000);
  }
  assert.equal(guard.admit('peer-over-capacity').status, 503);

  time.advance(300001);
  assert.equal(guard.snapshot().time, 368001);
  const afterEviction = guard.admit('peer-after-eviction');
  assert.equal(afterEviction.status, 0);
  afterEviction.release();
  const reused = guard.admit('peer-old');
  assert.equal(reused.status, 0);
  reused.release();
});
