import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildAesthetic } from './aesthetic.mjs';
import { photoDimensions } from './image-info.mjs';

const project = import.meta.dirname;
const workspace = path.dirname(project);
const previewMode = process.argv.includes('--preview');
const dist = path.join(project, previewMode ? 'preview-dist' : 'dist');
const edits = JSON.parse(await readFile(path.join(project, 'edits.json'), 'utf8'));
const categoryLabels = {
  ALL: '全部', STRUCTURE: '结构', LIGHT: '光线', SCALE: '尺度',
  SECTION: '剖面', PLAN: '平面', DETAIL: '构造', MATERIAL: '材料',
};
const categories = Object.keys(categoryLabels);
const translated = new Map(Object.entries(categoryLabels).slice(1).map(([en, zh]) => [zh, en]));
const imageExtension = /\.(?:jpe?g|png)$/i;
const yearPattern = /\b(?:18|19|20)\d{2}\b/;
const englishOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function parseMarkdown(markdown) {
  const sections = Object.create(null);
  for (const match of markdown.matchAll(/^##[ \t]+(.+?)\s*\r?\n([\s\S]*?)(?=^##[ \t]|(?![\s\S]))/gm)) {
    sections[match[1]] = match[2].trim();
  }
  return sections;
}

function listItems(section = '') {
  return [...section.matchAll(/^[-*][ \t]+(.+?)\s*$/gm)].map(match => match[1]);
}

function localized(value) {
  const match = value.match(/^(.*?)\s*[（(]([^()（）]+)[）)]$/);
  return match ? { local: match[1], english: match[2] } : { local: value, english: '' };
}

function sourceLinks(section = '') {
  return [...section.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)].map(([, label, url]) => {
    const { local, english } = localized(label);
    return { label: local, english, url };
  });
}

function safeName(value) {
  return value && value !== '.' && value !== '..' && !/[\\/:]/.test(value);
}

async function loadCase(slug) {
  const sections = parseMarkdown(await readFile(path.join(workspace, `${slug}.md`), 'utf8'));
  if (!sections.项目基本信息) return null;

  const fields = new Map(listItems(sections.项目基本信息).map(line => {
    const separator = line.search(/[:：]/);
    if (separator < 1) throw new Error(`${slug}: 项目信息缺少字段名或冒号。`);
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
  const title = localized(fields.get('项目名称') ?? '');
  const architect = localized(fields.get('设计机构') ?? fields.get('建筑设计') ?? fields.get('建筑师') ?? fields.get('主持建筑师') ?? '');
  const location = fields.get('项目地点');
  const author = fields.get('主持建筑师') ?? '';
  const designPeriod = fields.get('设计周期') ?? fields.get('设计年份') ?? '';
  const designYear = designPeriod.match(yearPattern)?.[0];
  const completion = fields.get('建成年份') ?? fields.get('建设周期') ?? fields.get('年份');
  const sources = sourceLinks(sections.源网站网址);
  const mediaReferences = sourceLinks(sections.图纸与照片索引);
  const notes = sections.笔记?.split(/\r?\n\s*\r?\n/).map(line => line.trim()).filter(Boolean);

  if (!title.local || !architect.local || !location || !sources.length || !notes?.length) {
    throw new Error(`${slug}: 请补全项目名称、建筑师、地点、原网站链接和笔记。`);
  }
  if ([...notes.join('').replace(/\s/g, '')].length > 200) {
    throw new Error(`${slug}: 学习笔记超过 200 字。`);
  }

  const edit = edits[slug] ?? {};
  if (edit.sourceEn) sources[0].english = edit.sourceEn;
  const details = listItems(sections.项目数据).map(line => {
    const separator = line.indexOf('：');
    if (separator < 1) throw new Error(`${slug}: 项目数据缺少字段或冒号。`);
    return [localized(line.slice(0, separator).trim()), localized(line.slice(separator + 1).trim())];
  });
  const rawTags = listItems(sections.项目分类);
  const tags = [...new Set([...rawTags.map(tag => translated.get(tag) ?? tag), ...(edit.extraCategories ?? [])])]
    .filter(tag => categories.slice(1).includes(tag));
  const localTags = rawTags.filter(tag => !translated.has(tag) && !categories.includes(tag));
  const folder = edit.folder ?? fields.get('素材目录') ?? slug;
  if (!safeName(folder)) throw new Error(`${slug}: 素材目录需为档案库下的单个文件夹名。`);
  const assets = path.join(workspace, '档案库', folder);
  const assetEntries = await readdir(assets, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT' && mediaReferences.length) return [];
    throw error;
  });
  const files = assetEntries
    .filter(file => file.isFile() && imageExtension.test(file.name)).map(file => file.name)
    .sort(englishOrder.compare);
  const listed = listItems(sections.图库).map(line => {
    const [file, ...caption] = line.split('｜');
    return { file: file.trim(), alt: caption.join('｜').trim() };
  });
  const ordered = new Map((edit.gallery ?? listed).map(image => [image.file, image]));
  const missing = [...ordered.keys()].find(file => !files.includes(file));
  if (missing) throw new Error(`${slug}: 素材目录中找不到图库指定的图片「${missing}」。`);
  for (const file of files) {
    if (!ordered.has(file)) ordered.set(file, { file });
  }
  const preview = fields.get('首页图片') ?? ordered.keys().next().value;
  if (preview ? !files.includes(preview) : !mediaReferences.length) {
    throw new Error(`${slug}: 请在素材目录中提供有效的 JPG 或 PNG 首页图片。`);
  }
  const gallery = await Promise.all([...ordered.values()].map(async image => ({
    ...image, ...await photoDimensions(path.join(assets, image.file)),
  })));

  const artist = architect.english || architect.local;
  return {
    slug, title: title.english || edit.titleEn || title.local,
    localTitle: title.local, artist, artistKey: artist.toLowerCase(), architect, author, authorEn: edit.authorEn,
    location, locationEn: edit.locationEn, designYear, designPeriod, completion,
    tags, localTags, sources, mediaReferences, details,
    notes, notesEn: edit.notesEn ?? [], personalNote: sections.个人笔记 ?? '',
    assets, gallery, preview,
    position: edit.position ?? '50% 50%',
  };
}

const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const urlPart = value => encodeURIComponent(value);
const text = (tag, english, chinese, attributes = '') =>
  `<${tag}${attributes} data-zh="${e(chinese)}">${e(english)}</${tag}>`;
const languageButton = '<button class="language-switch" type="button" lang="zh-CN" aria-label="切换到中文" hidden>中文</button>';

const monthFormat = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
function dateInEnglish(value) {
  return (value ?? '')
    .replace(/(?:(\d{4})\s*年)?\s*(\d{1,2})\s*月/g, (_, year, month) => {
      const monthName = monthFormat.format(new Date(Date.UTC(2000, Number(month) - 1)));
      return year ? `${monthName} ${year}` : monthName;
    })
    .replace(/\s*至\s*/g, ' – ')
    .replace(/(\d{4})\s*年/g, '$1');
}

function shell({ title, titleZh, description, prefix, bodyClass, content, script = '', stylesheet = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${e(description)}">
  ${text('title', title, titleZh)}
  <link rel="stylesheet" href="${prefix}styles.css">
  ${stylesheet ? `<link rel="stylesheet" href="${prefix}${stylesheet}">` : ''}
  <script src="${prefix}locale.js" defer></script>
  ${script}
</head>
<body class="${bodyClass}">
${content}
</body>
</html>
`;
}

function home(cases, showAesthetic) {
  const data = cases.map(item => ({
    slug: item.slug, title: item.title, localTitle: item.localTitle,
    artist: item.artist, localArtist: item.architect.local, artistKey: item.artistKey, year: item.designYear ?? '',
    search: [item.title, item.localTitle, item.artist, item.architect.local, item.author, item.authorEn, item.slug.replaceAll('-', ' ')]
      .filter(Boolean).join(' '),
    tags: item.tags, position: item.position,
    image: item.preview ? `assets/previews/${urlPart(item.slug)}.jpg` : null,
    href: `cases/${urlPart(item.slug)}/index.html`,
  }));
  return shell({
    title: 'Zhao Archive', titleZh: 'Zhao Archive · 建筑档案', description: 'A personal archive of architectural projects and drawings.',
    prefix: '', bodyClass: 'home-page',
    stylesheet: showAesthetic ? 'aesthetic.css' : '',
    script: '<script src="archive.js" defer></script>',
    content: `  <header class="home-header">
    <a class="wordmark" href="./index.html" data-page-link>Zhao Archive</a>
    <div class="controls">
      <input id="case-search" type="search" placeholder="Search projects or architects" aria-label="Search projects or architects" data-zh-placeholder="搜索案例或建筑师" data-zh-label="搜索案例或建筑师" autocomplete="off">
      <div class="control-row">
        <label class="category-control">
          ${text('span', 'Project category', '案例分类', ' class="sr-only"')}
          <select id="category">${categories.map(category => text('option', category, categoryLabels[category], ` value="${category}"`)).join('')}</select>
        </label>
        ${showAesthetic ? text('a', 'Aesthetic Archive', '审美积累', ' class="aesthetic-entry" href="aesthetic/index.html" data-page-link') : ''}
        ${languageButton}
      </div>
    </div>
  </header>
  <main class="archive" aria-labelledby="archive-title">
    <div class="archive-heading">
      ${text('h1', 'Archive', '建筑档案', ' id="archive-title"')}<span id="result-count" class="result-count" aria-live="polite">(${cases.length})</span>
    </div>
    <div id="preview-stage" class="preview-stage" aria-label="Project preview" data-zh-label="案例预览">
      <div id="preview-stack" class="preview-stack"></div>
    </div>
    <nav id="projects" class="index project-index" aria-label="Projects" data-zh-label="案例索引"></nav>
    <div id="architects" class="index architect-index" aria-label="Architects and design years" data-zh-label="建筑师与设计年份"></div>
    ${text('p', 'No matching projects.', '没有找到匹配的案例。', ' id="empty-state" class="empty-state" hidden')}
    <button id="clear-architect" class="clear-architect" type="button" hidden></button>
    <noscript><ul class="no-script">
      ${data.map(item => `<li><a href="${item.href}">${e(item.title)}</a></li>`).join('')}
    </ul></noscript>
  </main>
  <script type="application/json" id="case-data">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`,
  });
}

function personalNotes(item) {
  if (!item.personalNote && !previewMode) return '';

  return `
    <section id="personal-notes" class="record-section notes" aria-labelledby="personal-notes-heading">
      ${text('h2', 'Personal notes', '个人笔记', ' id="personal-notes-heading"')}
      <p class="personal-note" lang="zh-CN"${item.personalNote ? '' : ' hidden'}>${e(item.personalNote)}</p>
      ${previewMode ? `<form class="personal-note-editor" data-case="${e(item.slug)}" hidden>
        ${text('label', 'Edit personal notes', '编辑个人笔记', ' for="personal-note-draft"')}
        <textarea id="personal-note-draft" rows="5" aria-describedby="personal-note-help">\n${e(item.personalNote)}</textarea>
        ${text('p', 'Drafts are saved in this browser.', '草稿保存在当前浏览器。', ' id="personal-note-help"')}
        ${text('button', 'Save local draft', '保存本机草稿', ' type="submit"')}
        <p class="draft-status" role="status"></p>
      </form>` : ''}
    </section>`;
}

function sourceLink({ label, english, url }) {
  return text('a', english || label, label, ` href="${e(url)}"${english ? '' : ' lang="zh-CN"'}`);
}

function referenceList(links) {
  return `<ul class="reference-list">${links.map(link => `<li>${sourceLink(link)}</li>`).join('')}</ul>`;
}

function detail(item) {
  const prefix = '../../';
  const filePrefix = `${prefix}assets/${urlPart(item.slug)}/`;
  const architectEn = [item.artist, item.authorEn ?? item.author].filter(Boolean).join(' · ');
  const architectZh = [item.architect.local, item.author].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(' · ');
  const facts = [
    ['Architect', '建筑师', architectEn, architectZh],
    ['Location', '地点', item.locationEn ?? item.location, item.location],
    ['Design', '设计', dateInEnglish(item.designPeriod), item.designPeriod],
    ['Completion / Construction', '建成／建设', dateInEnglish(item.completion), item.completion],
    ...item.details.map(([label, value]) => [label.english || label.local, label.local, value.english || value.local, value.local]),
    ['Categories', '分类', [...item.tags, ...item.localTags.map(tag => tag === '地形' ? 'TOPOGRAPHY' : tag)].join(' / '),
      [...item.tags.map(tag => categoryLabels[tag]), ...item.localTags].join(' / ')],
  ];
  const figures = item.gallery.map((image, index) => {
    const alt = image.altEn || image.alt || `${item.title} — Project image ${index + 1}`;
    const altZh = image.alt || `${item.localTitle} — 项目资料 ${index + 1}`;
    const href = filePrefix + urlPart(image.file);
    return `      <figure class="drawing">
        <a class="gallery-link" href="${e(href)}" aria-label="${e(`Enlarge: ${alt}`)}" data-zh-label="${e(`放大图片：${altZh}`)}">
          <img src="${e(href)}" alt="${e(alt)}" data-zh-alt="${e(altZh)}" width="${image.width}" height="${image.height}" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">
        </a>
        ${image.alt ? text('figcaption', alt, altZh, image.altEn ? '' : ' lang="zh-CN"') : ''}
      </figure>`;
  });
  return shell({
    title: `${item.title} — Zhao Archive`, titleZh: `${item.localTitle} — Zhao Archive`, description: item.notesEn[0] ?? item.notes[0],
    prefix, bodyClass: 'detail-page',
    script: [item.gallery.length ? 'gallery.js' : '', previewMode ? 'personal-notes.js' : '']
      .filter(Boolean).map(file => `<script src="${prefix}${file}" defer></script>`).join('\n  '),
    content: `  <header class="detail-header">
    <a class="wordmark" href="../../index.html" data-page-link>Zhao Archive</a>
    <div class="detail-controls">
      ${text('a', 'Index', '返回索引', ' href="../../index.html" data-page-link')}
      ${languageButton}
    </div>
  </header>
  <main class="record">
    <header class="record-intro">
      ${text('h1', item.title, item.localTitle)}
      ${item.title !== item.localTitle ? text('p', item.localTitle, item.title, ' class="local-title" lang="zh-CN" data-zh-lang="en"') : ''}
      <dl class="facts">${facts.filter(([, , value]) => value).map(([labelEn, labelZh, valueEn, valueZh]) =>
        `<div>${text('dt', labelEn, labelZh)}${text('dd', valueEn, valueZh)}</div>`).join('')}</dl>
    </header>
    <section class="record-section" aria-labelledby="gallery-heading">
      ${text('h2', 'Drawings & photographs', '图纸与照片', ' id="gallery-heading"')}
${figures.join('\n')}
      ${item.mediaReferences.length ? `${text('p', 'View the credited photographs and drawings at their original source.', '以下为原站照片和图纸索引，点击查看原文。')}
      ${referenceList(item.mediaReferences)}` : ''}
    </section>
    <section class="record-section source" aria-labelledby="source-heading">
      ${text('h2', 'Original project', '项目来源', ' id="source-heading"')}
      ${item.sources.length === 1 ? sourceLink(item.sources[0]) : referenceList(item.sources)}
    </section>
    <section class="record-section notes" aria-labelledby="notes-heading">
      ${text('h2', 'Project features', '案例特点', ' id="notes-heading"')}
      ${item.notes.map((note, index) => text('p', item.notesEn[index] ?? note, note,
        item.notesEn[index] ? '' : ' lang="zh-CN"')).join('\n      ')}
    </section>${personalNotes(item)}
  </main>
  ${item.gallery.length ? `<dialog id="image-viewer" class="image-viewer" aria-label="Enlarged image" data-zh-label="图片放大查看">
    <div class="viewer-toolbar">
      ${text('button', 'Previous', '上一张', ' type="button" id="previous-image"')}
      <span id="image-position" aria-live="polite"></span>
      ${text('button', 'Next', '下一张', ' type="button" id="next-image"')}
      <button type="button" id="zoom-image" aria-pressed="false">Actual size</button>
      ${text('button', 'Close', '关闭', ' type="button" id="close-viewer" autofocus')}
    </div>
    <div class="viewer-image-area"><img id="enlarged-image" alt=""></div>
  </dialog>` : ''}`,
  });
}

async function makePreviews(jobs) {
  if (process.platform === 'win32') {
    const script = await readFile(path.join(project, 'preview.ps1'), 'utf8');
    const command = Buffer.from(script, 'utf16le').toString('base64');
    const input = JSON.stringify(jobs).replace(/[^\x00-\x7f]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', command], { input, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Preview creation failed.');
    return;
  }
  for (const job of jobs) {
    const args = [job.source, '-auto-orient', '-resize', '680x680>', '-strip', '-quality', '83', job.destination];
    let result = spawnSync('magick', args, { encoding: 'utf8' });
    if (result.error?.code === 'ENOENT') result = spawnSync('convert', args, { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Preview creation failed.');
  }
}

const files = await readdir(workspace);
const slugs = files.filter(file => /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file)).map(file => file.slice(0, -3));
const cases = (await Promise.all(slugs.map(loadCase))).filter(Boolean);
const preferredOrder = Object.keys(edits);
const rank = new Map(preferredOrder.map((slug, index) => [slug, index]));
cases.sort((a, b) => (rank.get(a.slug) ?? rank.size) - (rank.get(b.slug) ?? rank.size) || englishOrder.compare(a.title, b.title));
if (!cases.length) throw new Error('No case Markdown files were found.');

const previews = path.join(dist, 'assets', 'previews');
await mkdir(previews, { recursive: true });
const jobs = [];
for (const item of cases) {
  const output = path.join(dist, 'cases', item.slug);
  const assets = path.join(dist, 'assets', item.slug);
  await Promise.all([mkdir(output, { recursive: true }), mkdir(assets, { recursive: true })]);
  await Promise.all([
    writeFile(path.join(output, 'index.html'), detail(item)),
    ...item.gallery.map(image => copyFile(path.join(item.assets, image.file), path.join(assets, image.file))),
  ]);
  if (item.preview) {
    jobs.push({ source: path.join(item.assets, item.preview), destination: path.join(previews, `${item.slug}.jpg`) });
  }
}
if (jobs.length) await makePreviews(jobs);
const clientFiles = ['styles.css', 'locale.js', 'archive.js', 'gallery.js'];
if (previewMode) clientFiles.push('personal-notes.js');
const showAesthetic = await buildAesthetic({ dist, previewMode, shell, e, text, languageButton, photoDimensions, makePreviews });
if (showAesthetic) clientFiles.push('aesthetic.css', 'aesthetic.js');
await Promise.all([
  writeFile(path.join(dist, 'index.html'), home(cases, showAesthetic)),
  ...clientFiles.map(file => copyFile(path.join(project, file), path.join(dist, file))),
]);
console.log(`Built ${cases.length} cases at ${path.join(dist, 'index.html')}`);
