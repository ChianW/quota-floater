'use strict';

// Stub: Token Monitor's outboundFetch pulls `undici` for proxy support.
// Quota Floater only needs the official probe URLs; Node 24 global fetch is enough.

function createOutboundFetch(env = process.env, deps = {}) {
  if (deps.fetch) return deps.fetch;
  return globalThis.fetch;
}

module.exports = { createOutboundFetch };
