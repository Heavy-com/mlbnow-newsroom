'use strict';

const { createAlertHandler } = require('../lib/alert-engine');
const { getAlertConfig } = require('../lib/alert-config');

module.exports = createAlertHandler(getAlertConfig('nba'));
