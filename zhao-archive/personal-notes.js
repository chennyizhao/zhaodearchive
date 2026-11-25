(() => {
  'use strict';

  const form = document.querySelector('.personal-note-editor');
  const note = document.querySelector('.personal-note');
  const field = form.querySelector('textarea');
  const status = form.querySelector('[role="status"]');
  const { text } = window.archiveLocale;
  const key = `zhao-archive:personal-notes:${form.dataset.case}`;
  let savedDraft;
  let message;

  function showDraft(value) {
    note.textContent = value;
    note.hidden = !value;
  }

  function translateStatus() {
    if (message) status.textContent = text(...message);
  }

  function say(english, chinese) {
    message = [english, chinese];
    translateStatus();
  }

  try {
    savedDraft = localStorage.getItem(key);
    if (savedDraft !== null) {
      field.value = savedDraft;
      showDraft(savedDraft);
    }
  } catch {
    say('Browser storage is unavailable.', '当前浏览器无法保存草稿。');
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const draft = field.value.trim();
      const latestDraft = localStorage.getItem(key);
      if (latestDraft !== savedDraft && latestDraft !== draft) {
        say('Another tab changed this draft. Copy your text before refreshing.', '另一标签页已修改草稿。请先复制当前文字，再刷新页面。');
        return;
      }
      localStorage.setItem(key, draft);
      savedDraft = draft;
      showDraft(draft);
      say('Local draft saved.', '本机草稿已保存。');
    } catch {
      say('Could not save this draft in the browser.', '浏览器未能保存这份草稿。');
    }
  });

  document.addEventListener('archive:language', translateStatus);
  form.hidden = false;
})();
