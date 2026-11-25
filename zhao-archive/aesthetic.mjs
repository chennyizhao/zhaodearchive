import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const project = import.meta.dirname;
const categories = {
  all: ['All', '全部'], analysis: ['Analysis', '分析图'],
  fragments: ['Fragments', '项目碎片'], others: ['Others', '其他'],
};
const validUrl = value => /^https?:\/\/[^\s]+$/i.test(value ?? '');
const detailPath = id => `drawings/${id}/index.html`;

export async function buildAesthetic({ dist, previewMode, shell, e, text, languageButton, photoDimensions, makePreviews }) {
  const collection = JSON.parse(await readFile(path.join(project, 'aesthetic-collection.json'), 'utf8'));
  const ids = new Set();
  const drawings = [];
  for (const entry of collection) {
    if (typeof entry.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || ids.has(entry.id) ||
      !Object.hasOwn(categories, entry.category) || entry.category === 'all' || !entry.title || !entry.titleEn ||
      !['approved', 'pending'].includes(entry.permission) || !validUrl(entry.postUrl) ||
      (entry.sourceUrl && !validUrl(entry.sourceUrl))) {
      throw new Error(`Invalid aesthetic entry: ${entry.id}`);
    }
    ids.add(entry.id);
    if (entry.permission === 'approved') {
      if (!/^[^\\/:]+\.(?:jpe?g|png)$/i.test(entry.file ?? '')) {
        throw new Error(`Missing image for approved aesthetic entry: ${entry.id}`);
      }
      const image = path.join(path.dirname(project), '档案库', '审美积累', entry.file);
      const geometry = await photoDimensions(image);
      drawings.push({ ...entry, image, ...geometry, original: `media/${entry.id}${path.extname(entry.file).toLowerCase()}` });
    } else if (previewMode) {
      drawings.push(entry);
    }
  }
  const section = path.resolve(dist, 'aesthetic');
  if (path.dirname(section) !== path.resolve(dist)) throw new Error('Invalid aesthetic output path.');
  await rm(section, { recursive: true, force: true });
  if (!drawings.length) return false;
  const media = drawings.filter(drawing => drawing.image);
  await mkdir(path.join(section, 'media'), { recursive: true });
  if (media.length) {
    await Promise.all(media.map(item => copyFile(item.image, path.join(section, item.original))));
    await makePreviews(media.map(item => ({ source: item.image, destination: path.join(section, `media/${item.id}-preview.jpg`) })));
  }

  const heading = (prefix, back) => `<header class="detail-header">
    <a class="wordmark" href="${prefix}index.html" data-page-link>Zhao Archive</a>
    <div class="detail-controls">${back}${languageButton}</div>
  </header>`;
  const page = (prefix, title, titleZh, content) => shell({
    title: `${title} — Zhao Archive`, titleZh: `${titleZh} · 建筑档案`, prefix,
    description: 'A collection of architectural drawings.', bodyClass: 'aesthetic-page',
    stylesheet: 'aesthetic.css', script: `<script src="${prefix}aesthetic.js" defer></script>`, content,
  });
  const picture = (drawing, src, extra = '') => `<img src="${src}" alt="${e(drawing.titleEn)}" data-zh-alt="${e(drawing.title)}" width="${drawing.width}" height="${drawing.height}" ${extra}>`;
  const card = drawing => `<li id="${drawing.id}" data-category="${drawing.category}"><a href="${detailPath(drawing.id)}" aria-label="${e(drawing.titleEn)}" data-zh-label="${e(drawing.title)}">
    ${drawing.image ? picture(drawing, `media/${drawing.id}-preview.jpg`, 'loading="lazy" decoding="async"') : '<span class="drawing-placeholder" aria-hidden="true"></span>'}
  </a></li>`;
  const list = heading('../', text('a', 'Index', '建筑档案', ' href="../index.html" data-page-link')) + `
  <main class="drawing-index" aria-labelledby="aesthetic-heading">
    ${text('h1', 'Aesthetic Archive', '审美积累', ' id="aesthetic-heading"')}
    <div class="drawing-filters" role="group" aria-label="Categories" data-zh-label="分类" hidden>
      ${Object.entries(categories).map(([key, labels]) => text('button', ...labels, ` type="button" data-filter="${key}" aria-pressed="${key === 'all'}"`)).join('')}
    </div>
    ${previewMode && media.length < drawings.length ? text('p', 'Preview includes drawings awaiting images.', '预览中含待上传图纸。', ' class="drawing-message"') : ''}
    <ul class="drawing-wall">${drawings.map(card).join('')}</ul>
    ${text('p', 'No drawings in this category.', '此分类暂无图纸。', ' id="drawing-empty" class="drawing-message" role="status" hidden')}
  </main>`;
  await writeFile(path.join(section, 'index.html'), page('../', 'Aesthetic Archive', '审美积累', list));

  function neighbor(items, index, offset) {
    const other = items[index + offset];
    return other ? `../${other.id}/index.html` : '';
  }

  await Promise.all(drawings.map(async (drawing, index) => {
    const category = drawings.filter(item => item.category === drawing.category);
    const position = category.indexOf(drawing);
    const stepLink = (offset, en, zh) => {
      const all = neighbor(drawings, index, offset);
      const within = neighbor(category, position, offset);
      return text('a', en, zh, ` data-all-url="${all}" data-category-url="${within}"${all ? ` href="${all}"` : ' aria-disabled="true"'}`);
    };
    const previousNext = `<nav class="drawing-steps" aria-label="Drawing navigation" data-zh-label="图纸导航">
      ${stepLink(-1, '← Previous', '← 上一张')}${stepLink(1, 'Next →', '下一张 →')}
    </nav>`;
    const output = path.join(section, 'drawings', drawing.id);
    const content = heading('../../../', text('a', 'Aesthetic Archive', '审美积累', ' href="../../index.html" data-drawing-back')) + `
    <main class="drawing-detail" data-drawing-category="${drawing.category}" data-drawing-id="${drawing.id}" aria-labelledby="drawing-heading">
      ${text('h1', drawing.titleEn, drawing.title, ' id="drawing-heading" class="sr-only"')}
      <div class="drawing-stage">
        ${drawing.image ? picture(drawing, `../../${drawing.original}`, 'id="drawing-image"') : text('p', 'Image pending. Check the shared post for the selected image.', '图纸待上传，可在分享原帖查看所选图片。', ' class="drawing-message"')}
      </div>
      <div class="drawing-actions">
        ${previousNext}
        ${drawing.image ? '<button id="drawing-zoom" type="button" aria-pressed="false" hidden>Actual size</button>' : ''}
        ${drawing.sourceUrl ? text('a', 'Original source', '原始来源', ` href="${e(drawing.sourceUrl)}"`) : ''}
        ${!drawing.sourceUrl ? text('a', 'Shared post', '分享原帖', ` href="${e(drawing.postUrl)}"`) : ''}
        ${previewMode && !drawing.image ? `<p class="drawing-message">${e(drawing.postedBy)} · ${text('span', 'Image', '图')} ${drawing.imageNumber}</p>` : ''}
        ${drawing.credit ? `<p class="drawing-message">${e(drawing.credit)}</p>` : ''}
      </div>
    </main>`;
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, 'index.html'), page('../../../', drawing.titleEn, drawing.title, content));
  }));
  return true;
}
