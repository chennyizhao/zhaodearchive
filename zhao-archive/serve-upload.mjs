import { createServer } from 'node:http';
import { createAestheticUploadHandler, uploadMount } from './aesthetic-upload.mjs';

const origin = process.env.ZHAO_ARCHIVE_UPLOAD_ORIGIN;
const password = process.env.ZHAO_ARCHIVE_UPLOAD_PASSWORD;
const draftFolder = process.env.ZHAO_ARCHIVE_UPLOAD_DRAFT_DIR;
const port = Number(process.env.ZHAO_ARCHIVE_UPLOAD_PORT ?? process.env.PORT ?? 4174);
if (!origin?.startsWith('https://') || !password || !draftFolder) {
  throw new Error('Set the HTTPS upload origin, administrator password and persistent draft directory.');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid upload port.');

const handleUpload = createAestheticUploadHandler({ origin, password, draftFolder });
const adminRoot = uploadMount.slice(0, -1);
const source = 'https://chennyizhao.github.io/zhaodearchive.github.io/';
createServer({ requestTimeout: 30_000 }, async (request, response) => {
  if (await handleUpload(request, response)) return;
  const pathname = URL.parse(request.url, origin)?.pathname;
  if ((request.method === 'GET' || request.method === 'HEAD') && (pathname === '/' || pathname === adminRoot)) {
    response.writeHead(302, { Location: uploadMount }).end();
  } else if (request.method === 'GET' && pathname === '/zhaodearchive/aesthetic/index.html') {
    response.writeHead(302, { Location: source }).end();
  } else {
    response.writeHead(404).end();
  }
}).listen(port, '0.0.0.0', () => console.log(`Upload service listening on port ${port}.`));
