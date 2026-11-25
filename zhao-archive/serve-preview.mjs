import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const mount = '/zhaodearchive/';
const root = path.join(import.meta.dirname, 'preview-dist');
const host = '127.0.0.1';
const port = Number(process.env.ZHAO_ARCHIVE_PREVIEW_PORT ?? 4173);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('ZHAO_ARCHIVE_PREVIEW_PORT must be a valid port number.');
}
if (!(await stat(path.join(root, 'index.html')).catch(() => null))?.isFile()) {
  throw new Error('Build the preview first with node zhao-archive/build.mjs --preview.');
}

const notFound = response => response.writeHead(404).end('Not found.');

createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let url;
  let relative;
  try {
    url = new URL(request.url, `http://${host}`);
    if (url.pathname === mount.slice(0, -1)) {
      response.writeHead(308, { Location: mount + url.search }).end();
      return;
    }
    if (!url.pathname.startsWith(mount)) return notFound(response);
    relative = decodeURIComponent(url.pathname.slice(mount.length));
  } catch {
    response.writeHead(400).end('Invalid URL.');
    return;
  }

  if (/[\\:\0]/.test(relative)) return notFound(response);
  const resource = relative === '' || relative.endsWith('/') ? `${relative}index.html` : relative;
  const file = path.resolve(root, resource);
  const type = types.get(path.extname(file).toLowerCase());
  if (!file.startsWith(root + path.sep) || !type) return notFound(response);

  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return notFound(response);
  response.writeHead(200, {
    'Content-Type': type,
    'Content-Length': info.size,
    'Cache-Control': 'no-store',
  });
  if (request.method === 'HEAD') return response.end();

  const stream = createReadStream(file);
  stream.on('error', error => response.destroy(error));
  stream.pipe(response);
}).listen(port, host, () => console.log(`Preview at http://${host}:${port}${mount}`));
