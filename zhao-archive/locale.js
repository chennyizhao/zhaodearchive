(() => {
  'use strict';

  let language = new URLSearchParams(location.search).get('lang') === 'zh' ? 'zh' : 'en';
  const buttons = document.querySelectorAll('.language-switch');
  const pageLinks = [...document.querySelectorAll('[data-page-link]')].map(link => [link, link.getAttribute('href')]);
  const translations = [
    ['data-zh', null], ['data-zh-placeholder', 'placeholder'],
    ['data-zh-label', 'aria-label'], ['data-zh-alt', 'alt'], ['data-zh-lang', 'lang'],
  ].flatMap(([key, attribute]) => [...document.querySelectorAll(`[${key}]`)].map(element => ({
    element, attribute, chinese: element.getAttribute(key),
    english: attribute ? element.getAttribute(attribute) : element.textContent,
  })));

  const text = (english, chinese) => language === 'zh' ? chinese : english;

  function href(path) {
    const url = new URL(path, location.href);
    if (language === 'zh') url.searchParams.set('lang', 'zh');
    else url.searchParams.delete('lang');
    return url.href;
  }

  function applyLanguage() {
    document.documentElement.lang = text('en', 'zh-CN');
    for (const { element, attribute, english, chinese } of translations) {
      const value = text(english, chinese);
      if (attribute) element.setAttribute(attribute, value);
      else element.textContent = value;
    }
    for (const [link, path] of pageLinks) link.href = href(path);
    for (const button of buttons) {
      button.hidden = false;
      button.lang = text('zh-CN', 'en');
      button.textContent = text('中文', 'EN');
      button.setAttribute('aria-label', text('切换到中文', 'Switch to English'));
    }
    document.dispatchEvent(new Event('archive:language'));
  }

  window.archiveLocale = { text, href };
  for (const button of buttons) {
    button.addEventListener('click', () => {
      language = text('zh', 'en');
      try {
        history.replaceState(history.state, '', href(location.href));
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'SecurityError') throw error;
        // Some file viewers prohibit URL changes. Internal links still carry the choice.
      }
      applyLanguage();
    });
  }
  applyLanguage();
})();
