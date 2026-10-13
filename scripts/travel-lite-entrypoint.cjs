'use strict';

/**
 * Container entrypoint. Runs the optional Gadotti provisioning (a no-op when
 * TRAVEL_LITE_GADOTTI_PROVISION is unset) and then starts the API exactly as
 * before. Provisioning errors are logged without data and never block start.
 */

const { runAndLog } = require('./travel-lite-gadotti-online.cjs');

runAndLog().finally(() => {
  require('../services/api-lite/dist/services/api-lite/src/server.js');
});
