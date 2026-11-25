import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { imageInfo } from './image-info.mjs';

const project = import.meta.dirname;
export const uploadMount = '/zhaodearchive/aesthetic/upload/';
const maxImage = 20 * 1024 * 1024;
const maxRequest = maxImage + 128 * 1024;
const draftId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const categories = ['analysis', 'fragments', 'others'];
const pages = new Map([
  ['', ['aesthetic-upload.html', 'text/html; charset=utf-8']],
  ['upload.js', ['aesthetic-upload.js', 'text/javascript; charset=utf-8']],
  ['upload.css', ['aesthetic-upload.css', 'text/css; charset=utf-8']],
]);
const headers = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; img-src 'self' blob:; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

class UploadError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const digest = value => createHash('sha256').update(value).digest();
const json = (response, status, data, extra = {}) => response
  .writeHead(status, { ...headers, ...extra, 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(data));

function field(form, name, max) {
  const value = form.get(name) ?? '';
  if (typeof value !== 'string' || value.length > max) throw new UploadError(400, '资料字段无效或过长。');
  return value.trim();
}

function link(form, name) {
  const value = field(form, name, 2048);
  if (!value) return '';
  const url = URL.parse(value);
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new UploadError(400, '来源地址需为网页链接。');
  }
  return url.href;
}

async function readUpload(request) {
  const type = request.headers['content-type'];
  if (!type?.startsWith('multipart/form-data;')) throw new UploadError(415, '请选择或粘贴图片。');
  const size = Number(request.headers['content-length']);
  if (size > maxRequest) throw new UploadError(413, '单张图片上限为 20 MB。');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > maxRequest) throw new UploadError(413, '单张图片上限为 20 MB。');
    chunks.push(chunk);
  }
  return new Response(Buffer.concat(chunks), { headers: { 'Content-Type': type } }).formData()
    .catch(() => { throw new UploadError(400, '图片表单未完整收到，请重新上传。'); });
}

export function createAestheticUploadHandler({ origin, password, draftFolder = path.join(project, '.aesthetic-drafts') }) {
  const address = new URL(origin);
  const local = address.protocol === 'http:' && address.hostname === '127.0.0.1';
  if (address.origin !== origin || (!local && (address.protocol !== 'https:' || typeof password !== 'string' || password.length < 24))) {
    throw new Error('An HTTPS origin and administrator password of at least 24 characters are required for online uploads.');
  }
  const root = path.resolve(draftFolder);
  const authorization = password ? digest(`Basic ${Buffer.from(`admin:${password}`, 'utf8').toString('base64')}`) : null;
  const entries = async () => JSON.parse(await readFile(path.join(project, 'aesthetic-collection.json'), 'utf8'));
  const draft = async id => JSON.parse(await readFile(path.join(root, id, 'draft.json'), 'utf8'));

  async function state() {
    const dirs = await readdir(root, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const drafts = await Promise.all(dirs.filter(dir => dir.isDirectory() && draftId.test(dir.name)).map(dir => draft(dir.name)));
    return { entries: (await entries()).map(({ id, title, category, sourceUrl, postUrl }) => ({ id, title, category, sourceUrl, postUrl })),
      drafts: drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  }

  async function save(request) {
    const form = await readUpload(request);
    const file = form.get('image');
    if (!(file instanceof File) || !file.size) throw new UploadError(400, '请先选择图片。');
    if (file.size > maxImage) throw new UploadError(413, '单张图片上限为 20 MB。');
    const bytes = Buffer.from(await file.arrayBuffer());
    const info = imageInfo(bytes);
    if (!info?.width || !info.height) throw new UploadError(415, '请上传可读取的 JPG 或 PNG 图片。');
    if (info.width * info.height > 80_000_000) throw new UploadError(413, '图片超过 8000 万像素，请缩小后重试。');
    const entryId = field(form, 'entry', 100);
    if (entryId && !(await entries()).some(entry => entry.id === entryId)) throw new UploadError(400, '原收藏条目已变化，请刷新后重试。');
    const title = field(form, 'title', 150);
    const category = field(form, 'category', 30);
    if (!title || !categories.includes(category)) throw new UploadError(400, '请填写名称并选择分类。');
    const data = {
      id: randomUUID(), entryId, title, category,
      postUrl: link(form, 'postUrl'), sourceUrl: link(form, 'sourceUrl'),
      credit: field(form, 'credit', 180), rightsConfirmed: form.get('rights') === 'yes',
      filename: file.name.slice(0, 180), size: file.size, ...info, createdAt: new Date().toISOString(),
    };

    await mkdir(root, { recursive: true });
    const incoming = await mkdtemp(path.join(root, '.incoming-'));
    const destination = path.join(root, data.id);
    if (path.dirname(incoming) !== root || path.dirname(destination) !== root) throw new Error('Invalid draft storage path.');
    try {
      await writeFile(path.join(incoming, 'image'), bytes);
      await writeFile(path.join(incoming, 'draft.json'), JSON.stringify(data, null, 2));
      await rename(incoming, destination);
    } finally {
      await rm(incoming, { recursive: true, force: true });
    }
    return data;
  }

  return async (request, response) => {
    const url = URL.parse(request.url, origin);
    if (!url || !url.pathname.startsWith(uploadMount)) return false;
    if (request.headers.host !== address.host) {
      json(response, 403, { error: '上传地址不匹配。' });
      return true;
    }
    if (authorization && !timingSafeEqual(authorization, digest(request.headers.authorization ?? ''))) {
      json(response, 401, { error: '请用管理员账号登录。' }, { 'WWW-Authenticate': 'Basic realm="Zhao Archive uploads", charset="UTF-8"' });
      return true;
    }

    const route = url.pathname.slice(uploadMount.length);
    const { method } = request;
    try {
      if (route === 'api/drafts' && method === 'POST') {
        if (request.headers.origin !== origin) throw new UploadError(403, '请从本上传页面提交图片。');
        json(response, 201, { draft: await save(request) });
      } else if (method !== 'GET' && method !== 'HEAD') {
        json(response, 405, { error: '请求方式不支持。' });
      } else if (pages.has(route)) {
        const [filename, type] = pages.get(route);
        const body = await readFile(path.join(project, filename));
        response.writeHead(200, { ...headers, 'Content-Type': type }).end(method === 'HEAD' ? undefined : body);
      } else if (route === 'api/state') {
        json(response, 200, await state());
      } else {
        const id = route.match(/^api\/drafts\/([^/]+)\/image$/)?.[1];
        if (!id || !draftId.test(id)) throw new UploadError(404, '找不到该草稿。');
        const data = await draft(id);
        response.writeHead(200, { ...headers, 'Content-Type': data.type, 'Content-Length': data.size });
        if (method === 'HEAD') response.end();
        else createReadStream(path.join(root, id, 'image')).on('error', error => response.destroy(error)).pipe(response);
      }
    } catch (error) {
      if (response.headersSent) response.destroy();
      else if (error instanceof UploadError) json(response, error.status, { error: error.message }, error.status === 413 ? { Connection: 'close' } : {});
      else if (error.code === 'ENOENT') json(response, 404, { error: '找不到该草稿。' });
      else {
        console.error('Aesthetic upload failed:', error.code ?? error.name);
        json(response, 500, { error: '草稿保存或读取失败，请重试。' });
      }
    }
    return true;
  };
}
