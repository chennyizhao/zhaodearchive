(() => {
  'use strict';

  const cases = JSON.parse(document.querySelector('#case-data').textContent);
  const bySlug = new Map(cases.map(item => [item.slug, item]));
  const { text, href } = window.archiveLocale;
  const projects = document.querySelector('#projects');
  const architects = document.querySelector('#architects');
  const stage = document.querySelector('#preview-stage');
  const stack = document.querySelector('#preview-stack');
  const search = document.querySelector('#case-search');
  const category = document.querySelector('#category');
  const count = document.querySelector('#result-count');
  const empty = document.querySelector('#empty-state');
  const clearArchitect = document.querySelector('#clear-architect');
  const cards = new Map();
  let results = [];
  let artistFilter = null;
  let artistPreview = null;
  let active = null;
  let wheelDelta = 0;
  let lastStep = -Infinity;

  function normalize(value) {
    return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }

  for (const item of cases) item.searchKey = normalize(item.search);

  function node(tag, className, label) {
    const element = document.createElement(tag);
    element.className = className;
    if (label) element.textContent = label;
    return element;
  }

  function activate(item, artist = null) {
    if (active === item && artistPreview === artist) return;
    active = item;
    artistPreview = artist;
    wheelDelta = 0;
    refreshPreview();
  }

  function projectRow(item) {
    const row = node('a', 'index-row project-row');
    row.dataset.slug = item.slug;
    row.append(node('span', 'index-name'));
    row.addEventListener('mouseenter', () => activate(item));
    row.addEventListener('focus', () => activate(item));
    return row;
  }

  function architectRow(item) {
    const row = node('button', 'index-row architect-row');
    row.type = 'button';
    row.dataset.slug = item.slug;
    row.dataset.artist = item.artistKey;
    row.setAttribute('aria-pressed', String(artistFilter === item.artistKey));
    const year = node('span', 'year', item.year || '—');
    const divider = node('span', 'year-divider');
    divider.setAttribute('aria-hidden', 'true');
    row.append(node('span', 'index-name'), divider, year);
    row.addEventListener('mouseenter', () => activate(item, item.artistKey));
    row.addEventListener('focus', () => activate(item, item.artistKey));
    row.addEventListener('click', () => {
      artistFilter = item.artistKey;
      search.value = '';
      category.value = 'ALL';
      render(item);
      clearArchitect.focus({ preventScroll: true });
    });
    return row;
  }

  function localizePreview(card, item) {
    card.href = href(item.href);
    card.setAttribute('aria-label', text(`Open ${item.title}`, `打开${item.localTitle}`));
  }

  function localizeIndex() {
    for (const row of projects.children) {
      const item = bySlug.get(row.dataset.slug);
      row.href = href(item.href);
      row.title = text(item.title, item.localTitle);
      row.firstElementChild.textContent = row.title;
    }
    for (const row of architects.children) {
      const item = bySlug.get(row.dataset.slug);
      const artist = text(item.artist, item.localArtist);
      const year = item.year ? text(`Design ${item.year}`, `设计年份 ${item.year}`) : text('Design year unavailable', '设计年份未注明');
      row.title = `${artist} · ${year}`;
      row.firstElementChild.textContent = artist;
    }
    const filteredArtist = cases.find(item => item.artistKey === artistFilter);
    clearArchitect.hidden = !filteredArtist;
    clearArchitect.textContent = filteredArtist ? text(
      `Clear ${filteredArtist.artist} filter`, `清除「${filteredArtist.localArtist}」筛选`,
    ) : '';
    for (const [slug, card] of cards) localizePreview(card, bySlug.get(slug));
  }

  function render(preferred = null) {
    const tokens = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    results = cases.filter(item => {
      if (tokens.length) return tokens.every(token => item.searchKey.includes(token));
      return (!artistFilter || item.artistKey === artistFilter) &&
        (category.value === 'ALL' || item.tags.includes(category.value));
    });
    active = results.includes(preferred) ? preferred : results[0] ?? null;
    artistPreview = null;
    wheelDelta = 0;
    count.textContent = `(${results.length})`;
    empty.hidden = results.length > 0;
    projects.replaceChildren(...results.map(projectRow));
    architects.replaceChildren(...results.map(architectRow));
    projects.scrollTop = 0;
    architects.scrollTop = 0;
    localizeIndex();
    refreshPreview();
  }

  function sequence() {
    return artistPreview ? cases.filter(item => item.artistKey === artistPreview) : results;
  }

  function previewCard(item, depth, priority = false) {
    let card = cards.get(item.slug);
    if (!card) {
      card = node('a', 'preview-card');
      localizePreview(card, item);
      const image = new Image();
      image.alt = '';
      image.decoding = 'async';
      image.fetchPriority = priority ? 'high' : 'low';
      image.style.objectPosition = item.position;
      image.src = item.image;
      card.append(image);
      stack.append(card);
      cards.set(item.slug, card);
    }
    card.dataset.depth = depth;
    card.tabIndex = priority ? 0 : -1;
    card.setAttribute('aria-hidden', String(!priority));
  }

  function refreshPreview() {
    const items = sequence();
    const index = items.indexOf(active);
    const visible = new Set();
    if (index >= 0) {
      const previous = items[index - 1] ?? (index === 0 ? items[2] : undefined);
      const next = items[index + 1] ?? (index === items.length - 1 ? items[index - 2] : undefined);
      previewCard(active, 'current', true);
      visible.add(active.slug);
      for (const [item, depth] of [[previous, 'before'], [next, 'after']]) {
        if (!item || visible.has(item.slug)) continue;
        previewCard(item, depth);
        visible.add(item.slug);
      }
    }

    for (const [slug, card] of cards) {
      if (visible.has(slug)) continue;
      card.remove();
      cards.delete(slug);
    }
    for (const row of projects.children) {
      row.toggleAttribute('data-active', row.dataset.slug === active?.slug);
    }
    for (const row of architects.children) {
      row.toggleAttribute('data-active', row.dataset.slug === active?.slug);
    }
    stage.hidden = !active;
  }

  function step(direction) {
    const items = sequence();
    const next = items[items.indexOf(active) + direction];
    if (next) activate(next, artistPreview);
  }

  stage.addEventListener('wheel', event => {
    if (!artistPreview || event.ctrlKey || !event.deltaY) return;
    event.preventDefault();
    const now = performance.now();
    if (now - lastStep < 280) return;
    wheelDelta += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
    if (Math.abs(wheelDelta) < 24) return;
    step(Math.sign(wheelDelta));
    wheelDelta = 0;
    lastStep = now;
  }, { passive: false });
  stage.addEventListener('keydown', event => {
    if (!artistPreview || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    step(event.key === 'ArrowDown' ? 1 : -1);
    stack.querySelector('[data-depth="current"]')?.focus({ preventScroll: true });
  });

  search.addEventListener('input', () => {
    category.value = 'ALL';
    artistFilter = null;
    render();
  });
  category.addEventListener('change', () => {
    search.value = '';
    render();
  });
  clearArchitect.addEventListener('click', () => {
    artistFilter = null;
    render();
    category.focus({ preventScroll: true });
  });
  document.addEventListener('archive:language', localizeIndex);
  render();
})();
