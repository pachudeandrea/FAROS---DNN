// Run the emitted API in plain Node, without a TypeScript loader. This is the
// module resolution used by the Vercel function, not by local `tsx server.ts`.
// Test-only transport replacement: still build the real encrypted Web Push
// request, but never contact a device or a push provider from tests.
if (process.env.FAROS_TEST_PUSH === '1') {
  const { default: webPush } = await import('web-push');
  const failures = new Set();
  webPush.sendNotification = async (subscription, payload, options) => {
    const request = webPush.generateRequestDetails(subscription, payload, options);
    const path = new URL(subscription.endpoint).pathname;
    const status = path.includes('expired') ? 410 : path.includes('temporary') && !failures.has(path) ? 503 : 201;
    failures.add(path);
    process.send?.({ type: 'test-push', endpoint: subscription.endpoint, payload: JSON.parse(payload), status, encrypted: Buffer.isBuffer(request.body) && request.body.length > 0 });
    if (status !== 201) throw Object.assign(new Error('Test push transport'), { statusCode: status });
    return { statusCode: 201, body: '', headers: {} };
  };
  process.on('message', async message => {
    if (message?.type !== 'notification-test-command') return;
    try {
      const service = await import(new URL('../src/server/notifications.js', process.argv[2]).href);
      const adapter = await import(new URL('../src/server/dbAdapter.js', process.argv[2]).href);
      let result;
      if (message.action === 'daily') result = await service.runDailyNotifications(new Date(message.now), async () => message.news || []);
      if (message.action === 'publish') result = await service.publishNews(await adapter.getUserFromDbById(message.userId), message.news);
      if (message.action === 'drain') result = await service.sendPendingPush(message.userId);
      process.send?.({ type: 'notification-test-result', id: message.id, result });
    } catch (error) { process.send?.({ type: 'notification-test-result', id: message.id, error: error.code || 'TEST_COMMAND_FAILED' }); }
  });
}

const { default: app } = await import(process.argv[2]);
const server = app.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address === 'object') process.send?.({ port: address.port });
});
process.on('SIGTERM', () => server.close(() => process.exit()));
