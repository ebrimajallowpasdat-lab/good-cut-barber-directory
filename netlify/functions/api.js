const serverless = require('serverless-http');
const { server, ready } = require('../../server');

const handler = serverless(server);
const functionPrefix = '/.netlify/functions/api';

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await ready;
  let normalizedEvent = event;
  const path = typeof event.path === 'string' ? event.path : '';
  if (path === functionPrefix || path.startsWith(`${functionPrefix}/`)) {
    const suffix = path.slice(functionPrefix.length).replace(/^\/?/, '');
    normalizedEvent = { ...event, path: suffix ? `/api/${suffix}` : '/api' };
  }
  return handler(normalizedEvent, context);
};
