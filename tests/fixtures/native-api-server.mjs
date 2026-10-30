// Run the emitted API in plain Node, without a TypeScript loader. This is the
// module resolution used by the Vercel function, not by local `tsx server.ts`.
const { default: app } = await import(process.argv[2]);
const server = app.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address === 'object') process.send?.({ port: address.port });
});
process.on('SIGTERM', () => server.close(() => process.exit()));
