// Run the emitted API in plain Node, without a TypeScript loader. This is the
// module resolution used by the Vercel function, not by local `tsx server.ts`.
// Only the test fixture redirects the real mail API to a local test sink.
// Production mail endpoints remain fixed HTTPS provider URLs.
if (process.env.FAROS_TEST_EMAIL_ENDPOINT) {
  const endpoint = new URL(process.env.FAROS_TEST_EMAIL_ENDPOINT);
  if (endpoint.hostname !== '127.0.0.1') throw new Error('The email test sink must be local.');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    if (String(input) === 'https://api.brevo.com/v3/smtp/email' || String(input) === 'https://api.resend.com/emails') return originalFetch(endpoint, init);
    return originalFetch(input, init);
  };
}
const { default: app } = await import(process.argv[2]);
const server = app.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address === 'object') process.send?.({ port: address.port });
});
process.on('SIGTERM', () => server.close(() => process.exit()));
