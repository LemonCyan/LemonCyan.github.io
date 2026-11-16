// Giscus 评论系统初始化与深浅色主题跟随
(function () {
  const cfg = window.__COMMENTS_CONFIG__;
  const container = document.getElementById('giscus-container');
  if (!cfg || !container) return;

  function getGiscusTheme() {
    const isDark =
      document.body.dataset.scheme === 'dark' ||
      localStorage.getItem('site-scheme') === 'dark';
    return isDark ? 'dark' : 'light';
  }

  const script = document.createElement('script');
  script.src = 'https://giscus.app/client.js';
  script.setAttribute('data-repo', cfg.repo);
  script.setAttribute('data-repo-id', cfg.repoId);
  script.setAttribute('data-category', cfg.category);
  script.setAttribute('data-category-id', cfg.categoryId);
  script.setAttribute('data-mapping', cfg.mapping || 'pathname');
  script.setAttribute('data-strict', '0');
  script.setAttribute('data-reactions-enabled', cfg.reactionsEnabled || '1');
  script.setAttribute('data-emit-metadata', '0');
  script.setAttribute('data-input-position', cfg.inputPosition || 'top');
  script.setAttribute('data-theme', getGiscusTheme());
  script.setAttribute('data-lang', cfg.lang || 'zh-CN');
  script.setAttribute('data-loading', 'lazy');
  script.crossOrigin = 'anonymous';
  script.async = true;

  container.appendChild(script);

  // 监听主题切换，实时通过 postMessage 通知 Giscus iframe 更新主题
  function updateGiscusTheme() {
    const theme = getGiscusTheme();
    const iframe = document.querySelector('iframe.giscus-frame');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(
        { giscus: { setConfig: { theme } } },
        'https://giscus.app'
      );
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === 'data-scheme') {
        updateGiscusTheme();
      }
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-scheme'],
  });
})();

