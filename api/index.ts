// Import only the API. Local listening and Vite belong to server.ts.
// Vercel preserves the original request URL through the rewrite. Internal
// routing headers refer to the function and must not replace the public path.
export { default } from '../src/server/app';
