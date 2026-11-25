(() => {
  'use strict';

  const { href, text } = window.archiveLocale;
  const categoryPath = (path, category) => {
    const url = new URL(path, location.href);
    if (category === 'all') url.searchParams.delete('category');
    else url.searchParams.set('category', category);
    return href(url);
  };
  const requestedCategory = new URLSearchParams(location.search).get('category');
  const filters = document.querySelector('.drawing-filters');

  if (filters) {
    const buttons = [...filters.querySelectorAll('[data-filter]')];
    const cards = [...document.querySelectorAll('.drawing-wall li')];
    const empty = document.querySelector('#drawing-empty');
    let category = buttons.some(button => button.dataset.filter === requestedCategory) ? requestedCategory : 'all';
    const links = cards.map(card => {
      const link = card.querySelector('a');
      return [link, link.getAttribute('href')];
    });

    function update() {
      for (const [link, path] of links) link.href = categoryPath(path, category);
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.filter === category));
      for (const card of cards) card.hidden = category !== 'all' && card.dataset.category !== category;
      empty.hidden = cards.some(card => !card.hidden);
    }

    for (const button of buttons) button.addEventListener('click', () => {
      category = button.dataset.filter;
      history.replaceState(history.state, '', categoryPath(location.href, category));
      update();
    });
    document.addEventListener('archive:language', update);
    filters.hidden = false;
    update();
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'nearest' });
    return;
  }

  const detail = document.querySelector('.drawing-detail');
  if (!detail) return;
  const category = requestedCategory === detail.dataset.drawingCategory ? requestedCategory : 'all';
  const back = document.querySelector('[data-drawing-back]');
  const links = document.querySelectorAll('[data-all-url]');
  const zoom = document.querySelector('#drawing-zoom');
  const root = document.querySelector('.drawing-stage');

  function updateDetail() {
    back.href = categoryPath(`../../index.html#${detail.dataset.drawingId}`, category);
    for (const link of links) {
      const path = category === 'all' ? link.dataset.allUrl : link.dataset.categoryUrl;
      if (path) link.href = categoryPath(path, category);
      else link.removeAttribute('href');
      link.setAttribute('aria-disabled', String(!path));
    }
    if (zoom) {
      const actual = root.hasAttribute('data-actual-size');
      zoom.textContent = actual ? text('Fit drawing', '适合窗口') : text('Actual size', '原始尺寸');
      zoom.setAttribute('aria-pressed', String(actual));
    }
  }

  if (zoom) {
    zoom.hidden = false;
    zoom.addEventListener('click', () => {
      root.toggleAttribute('data-actual-size');
      root.scrollTo(0, 0);
      updateDetail();
    });
  }
  document.addEventListener('archive:language', updateDetail);
  updateDetail();
})();
