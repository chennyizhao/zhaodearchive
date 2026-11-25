(() => {
  'use strict';

  const form = document.querySelector('#draft-form');
  const input = document.querySelector('#image-file');
  const uploader = document.querySelector('#uploader');
  const preview = document.querySelector('#image-preview');
  const filename = document.querySelector('#filename');
  const status = document.querySelector('#upload-status');
  const draftStatus = document.querySelector('#draft-status');
  const list = document.querySelector('#draft-list');
  const submit = form.querySelector('button');
  const fields = form.elements;
  const categories = { analysis: '分析图', fragments: '项目碎片', others: '其他' };
  let entries = [];
  let image;
  let previewUrl;

  function choose(file) {
    if (file && (!['image/jpeg', 'image/png', ''].includes(file.type) || file.size > 20 * 1024 * 1024)) {
      input.value = '';
      choose();
      status.textContent = '请选择不超过 20 MB 的 JPG 或 PNG 图片。';
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    image = file;
    previewUrl = file ? URL.createObjectURL(file) : '';
    preview.hidden = filename.hidden = !file;
    if (file) preview.src = previewUrl;
    else preview.removeAttribute('src');
    filename.textContent = file?.name ?? '';
    status.textContent = '';
  }

  input.addEventListener('change', () => choose(input.files[0]));
  uploader.addEventListener('dragover', event => {
    event.preventDefault();
    uploader.setAttribute('data-dragging', '');
  });
  uploader.addEventListener('dragleave', () => uploader.removeAttribute('data-dragging'));
  uploader.addEventListener('drop', event => {
    event.preventDefault();
    uploader.removeAttribute('data-dragging');
    if (event.dataTransfer.files[0]) choose(event.dataTransfer.files[0]);
  });
  document.addEventListener('paste', event => {
    const item = [...(event.clipboardData?.items ?? [])].find(entry => entry.kind === 'file' && entry.type.startsWith('image/'));
    const file = item?.getAsFile() ?? [...(event.clipboardData?.files ?? [])].find(entry => entry.type.startsWith('image/'));
    if (!file) return;
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type !== 'file') return;
    event.preventDefault();
    choose(file);
  });
  preview.addEventListener('error', () => {
    if (image) status.textContent = '浏览器无法预览这张图，请检查原图格式。';
  });

  fields.entry.addEventListener('change', () => {
    const entry = entries.find(item => item.id === fields.entry.value);
    fields.title.value = entry?.title ?? '';
    fields.category.value = entry?.category ?? 'analysis';
    fields.postUrl.value = entry?.postUrl ?? '';
    fields.sourceUrl.value = entry?.sourceUrl ?? '';
    fields.credit.value = '';
    fields.rights.checked = false;
  });

  function draftRow(draft) {
    const row = document.createElement('li');
    const thumb = document.createElement('img');
    thumb.src = `api/drafts/${encodeURIComponent(draft.id)}/image`;
    thumb.alt = draft.title;
    thumb.loading = 'lazy';
    const meta = document.createElement('div');
    const label = document.createElement('p');
    label.textContent = draft.title;
    const note = document.createElement('p');
    note.textContent = `${categories[draft.category]} · ${draft.rightsConfirmed ? '已确认可公开' : '授权待确认'}`;
    const download = document.createElement('a');
    download.href = thumb.src;
    download.download = draft.filename;
    download.textContent = '下载原图';
    meta.append(label, note, download);
    row.append(thumb, meta);
    return row;
  }

  async function refresh() {
    try {
      const response = await fetch('api/state');
      if (!response.ok) throw Error();
      const data = await response.json();
      entries = data.entries;
      const value = fields.entry.value;
      fields.entry.replaceChildren(new Option('新增图纸', ''), ...entries.map(entry => new Option(entry.title, entry.id)));
      if (entries.some(entry => entry.id === value)) fields.entry.value = value;
      list.replaceChildren(...data.drafts.map(draftRow));
      draftStatus.textContent = data.drafts.length ? '' : '暂无草稿。';
    } catch {
      draftStatus.textContent = '草稿列表加载失败，可以刷新后重试。';
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!image) {
      status.textContent = '请先选择、拖入或粘贴图片。';
      uploader.focus();
      return;
    }
    if (submit.disabled) return;
    submit.disabled = true;
    const upload = image;
    const data = new FormData(form);
    data.set('image', upload);
    try {
      await preview.decode().catch(() => { throw Error('图片无法解码，请重新选择原图。'); });
      status.textContent = '正在保存…';
      const response = await fetch('api/drafts', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (image === upload) {
        input.value = '';
        choose();
      }
      status.textContent = '草稿已保存。';
      await refresh();
    } catch (error) {
      status.textContent = error.message || '草稿保存失败。';
    } finally {
      submit.disabled = false;
    }
  });
  refresh();
})();
