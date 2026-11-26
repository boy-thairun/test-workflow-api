import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { createAuth } from './auth/session.ts';

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 3001);
const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
const email = process.env.DEMO_EMAIL ?? 'player@example.test';
const initialPassword = process.env.DEMO_PASSWORD;
const password = initialPassword ?? randomBytes(12).toString('base64url');
const auth = createAuth({ origin, account: { email, password } });

async function readBody(request: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 8_192) return null;
    chunks.push(bytes);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const method = incoming.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(incoming);
    if (body === null) {
      outgoing.writeHead(413, { Connection: 'close' }).end();
      return;
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    }
    const request = new Request(new URL(incoming.url ?? '/', 'http://' + host + ':' + port), { method, headers, body });
    const response = await auth.handle(request);
    outgoing.writeHead(response.status, { 'Cache-Control': 'no-store', ...Object.fromEntries(response.headers) });
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'application/json' });
    outgoing.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Request failed' } }));
  }
});

server.on('close', auth.close);
server.listen(port, host, () => {
  console.log('Virtual Room API: http://' + host + ':' + port);
  console.log('Demo email: ' + email);
  if (initialPassword === undefined) console.log('Demo password for this run: ' + password);
});
