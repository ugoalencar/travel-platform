// The API workspace is type-checked and compiled by the configured build
// command. Export its request handler so Vercel can route each invocation
// through the compiled Fastify app.
require('fastify');
module.exports = require('./services/api/dist/services/api/src/server.js').handler;
