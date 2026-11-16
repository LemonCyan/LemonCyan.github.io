/* Mermaid 渲染：页面里存在 mermaid 源码块时才按需加载 CDN 模块 */
(function () {
  var blocks = Array.prototype.slice.call(document.querySelectorAll('[data-mermaid]'));
  if (!blocks.length) return;

  var CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

  var lastTheme = '';

  function render(mod) {
    var theme = document.body.dataset.scheme === 'dark' ? 'dark' : 'default';
    if (theme === lastTheme) return;
    lastTheme = theme;

    mod.initialize({
      startOnLoad: false,
      theme: theme,
      securityLevel: 'loose',
      fontFamily: 'inherit'
    });
    blocks.forEach(function (el, i) {
      if (el.dataset.src === undefined) el.dataset.src = el.textContent.trim();
      var src = el.dataset.src;
      if (!src) return;
      mod.render('mmd-' + i + '-' + Date.now(), src).then(function (res) {
        el.innerHTML = res.svg;
        el.dataset.rendered = 'true';
        el.removeAttribute('data-error');
        var svg = el.querySelector('svg');
        if (svg) {
          svg.removeAttribute('height');
          svg.style.maxWidth = '100%';
          svg.style.height = 'auto';
        }
      }).catch(function (e) {
        el.dataset.error = 'true';
        el.setAttribute('title', 'Mermaid 渲染失败：' + e.message);
      });
    });
  }

  import(CDN).then(function (m) {
    var mod = m.default || m;
    window.mermaid = mod;
    render(mod);
    if ('MutationObserver' in window) {
      new MutationObserver(function () { render(mod); }).observe(document.body, {
        attributes: true,
        attributeFilter: ['data-scheme']
      });
    }
  }).catch(function () {
    blocks.forEach(function (el) {
      el.dataset.error = 'true';
      el.setAttribute('title', 'Mermaid 脚本加载失败（网络或 CDN 不可达）');
    });
  });
})();
