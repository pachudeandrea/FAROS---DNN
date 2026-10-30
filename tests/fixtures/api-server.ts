import app from '../../api/index';
import { closeDatabase } from '../../src/server/database';

// This exercises the exact Vercel entry, with an ephemeral local HTTP listener.
const server = app.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address === 'object') process.send?.({ port: address.port });
});
process.on('SIGTERM', () => server.close(() => { void closeDatabase().then(() => process.exit()); }));
