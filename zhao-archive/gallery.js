(() => {
  'use strict';

  const dialog = document.querySelector('#image-viewer');
  if (!dialog?.showModal) return;
  const { text } = window.archiveLocale;

  const links = [...document.querySelectorAll('.gallery-link')];
  const image = document.querySelector('#enlarged-image');
  const counter = document.querySelector('#image-position');
  const previous = document.querySelector('#previous-image');
  const next = document.querySelector('#next-image');
  const zoom = document.querySelector('#zoom-image');
  const imageArea = dialog.querySelector('.viewer-image-area');
  let index = 0;
  let opener = null;

  function localizeZoom() {
    zoom.textContent = dialog.hasAttribute('data-actual-size')
      ? text('Fit image', '适应窗口') : text('Actual size', '原始尺寸');
  }

  function setZoom(actualSize) {
    dialog.toggleAttribute('data-actual-size', actualSize);
    zoom.setAttribute('aria-pressed', String(actualSize));
    localizeZoom();
    imageArea.scrollTo(0, 0);
  }

  function show(position) {
    const link = links[position];
    if (!link) return;
    index = position;
    image.alt = link.querySelector('img').alt;
    image.src = link.href;
    counter.textContent = `${index + 1} / ${links.length}`;
    previous.disabled = index === 0;
    next.disabled = index === links.length - 1;
    setZoom(false);
  }

  links.forEach((link, position) => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    opener = link;
    show(position);
    dialog.showModal();
  }));
  previous.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  zoom.addEventListener('click', () => setZoom(!dialog.hasAttribute('data-actual-size')));
  document.addEventListener('archive:language', () => {
    localizeZoom();
    if (dialog.open) image.alt = links[index].querySelector('img').alt;
  });
  localizeZoom();
  document.querySelector('#close-viewer').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    opener?.focus();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    show(index + (event.key === 'ArrowRight' ? 1 : -1));
  });
})();
