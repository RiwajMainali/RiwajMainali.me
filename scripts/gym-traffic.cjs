'use strict';

/** @typedef {{ tokens: number, capacity: number, rate: number, at: number }} Bucket */

// In-memory admission happens before auth/database work. Peer identity is set
// by Caddy, which overwrites the incoming header rather than trusting XFF.
/** @param {{ now?: () => number }} [options] */
function createTrafficGuard(options = {}) {
  const now = options.now ?? Date.now;
  const peers = new Map();
  /** @param {number} capacity @param {number} rate @returns {Bucket} */
  const bucket = (capacity, rate) => ({
    tokens: capacity,
    capacity,
    rate,
    at: now(),
  });
  const global = bucket(120, 60);
  let active = 0,
    uploads = 0,
    accepted = 0,
    rejected = 0;
  /** @param {Bucket} b */
  function take(b) {
    const time = now();
    b.tokens = Math.min(
      b.capacity,
      b.tokens + (Math.max(0, time - b.at) * b.rate) / 1000
    );
    b.at = time;
    if (b.tokens < 1) return false;
    b.tokens--;
    return true;
  }
  /** @param {string} peer */
  function admit(peer, isUpload = false, sensitive = false) {
    /** @param {number} status */
    const deny = (status) => {
      rejected++;
      return { status };
    };
    if (!take(global)) return deny(503);
    let state = peers.get(peer);
    if (!state) {
      if (peers.size >= 4096) return deny(503);
      state = {
        requests: bucket(90, 30),
        sensitive: bucket(10, 0.2),
        active: 0,
        uploads: 0,
        at: now(),
      };
      peers.set(peer, state);
    }
    state.at = now();
    if (!take(state.requests) || (sensitive && !take(state.sensitive)))
      return deny(429);
    if (active >= 48 || (isUpload && uploads >= 4)) return deny(503);
    if (state.active >= 12 || (isUpload && state.uploads >= 2))
      return deny(429);
    active++;
    state.active++;
    accepted++;
    if (isUpload) {
      uploads++;
      state.uploads++;
    }
    let released = false;
    return {
      status: 0,
      release() {
        if (released) return;
        released = true;
        active--;
        state.active--;
        if (isUpload) {
          uploads--;
          state.uploads--;
        }
      },
    };
  }
  function snapshot() {
    const time = now();
    for (const [peer, state] of peers)
      if (!state.active && time - state.at > 300000) peers.delete(peer);
    const result = {
      time,
      windowSeconds: 60,
      accepted,
      rejected,
      active,
      uploads,
    };
    accepted = 0;
    rejected = 0;
    return result;
  }
  return { admit, snapshot };
}
module.exports = { createTrafficGuard };
