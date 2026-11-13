/* 站内搜索：Pagefind（构建后索引，中文按 zh-cn 分词，按需分片加载） */
(function () {
  var input = document.getElementById('search-input');
  var box = document.getElementById('search-results');
  if (!input || !box) return;

  var MAX = 40;
  var pf = null;
  var loading = null;
  var seq = 0;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Pagefind 返回的 url 是百分号编码的（/A.%E5%B9%B3%E5%8F%B0…），
  // 展示时解码回中文更易读；href 仍用编码版本，避免浏览器对中文再编码出错。
  function prettyPath(url) {
    try {
      var s = decodeURI(url);
      return s.length > 2 && s.charAt(s.length - 1) === '/' ? s.slice(0, -1) : s;
    } catch (e) {
      return url;
    }
  }

  function loadPagefind() {
    if (pf) return Promise.resolve(pf);
    if (loading) return loading;
    loading = import('/pagefind/pagefind.js')
      .then(function (mod) {
        return mod.options({ excerptLength: 30 }).then(function () { return mod; });
      })
      .then(function (mod) { pf = mod; return mod; })
      .catch(function () { loading = null; return null; });
    return loading;
  }

  function renderIdle() {
    box.innerHTML = '<p class="search-hint">共 ' + (window.__SITE__ ? window.__SITE__.total : 0) +
      ' 篇笔记。输入关键词开始搜索，支持中文分词与多词匹配。</p>';
  }

  function renderHits(list, q) {
    if (!q) return renderIdle();
    if (!list.length) {
      box.innerHTML = '<p class="search-hint">没有找到匹配「' + esc(q) + '」的笔记。</p>';
      return;
    }
    var html = '<p class="search-hint">找到 ' + list.length + ' 条结果</p>';
    list.slice(0, MAX).forEach(function (r) {
      var sub = '';
      if (r.sub_results && r.sub_results.length) {
        sub = '<div class="search-hit-excerpt">' + r.sub_results[0].excerpt + '</div>';
      } else if (r.excerpt) {
        sub = '<div class="search-hit-excerpt">' + r.excerpt + '</div>';
      }
      html += '<a class="search-hit" href="' + r.url + '">' +
        '<div class="search-hit-title">' + (r.meta && r.meta.title ? esc(r.meta.title) : esc(r.url)) + '</div>' +
        '<div class="search-hit-path">' + esc(prettyPath(r.url)) + '</div>' +
        sub +
        '</a>';
    });
    box.innerHTML = html;
  }

  function run(q) {
    var my = ++seq;
    var query = q.trim();
    if (!query) { renderIdle(); return; }
    loadPagefind().then(function (mod) {
      if (my !== seq) return;
      if (!mod) {
        box.innerHTML = '<p class="search-hint">搜索索引还没生成（本地开发请先运行 npm run build）。</p>';
        return;
      }
      return mod.search(query).then(function (res) {
        if (my !== seq) return;
        return Promise.all(res.results.slice(0, MAX).map(function (r) { return r.data(); }))
          .then(function (data) { if (my === seq) renderHits(data, query); });
      });
    }).catch(function (e) {
      if (my === seq) box.innerHTML = '<p class="search-hint">搜索出错：' + esc(e.message) + '</p>';
    });
  }

  var timer = null;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    var q = input.value;
    timer = setTimeout(function () { run(q); }, 160);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { clearTimeout(timer); run(input.value); }
  });

  input.addEventListener('focus', function () {
    if (!input.value) renderIdle();
  });

  // 预热：打开页面后空闲时加载索引模块（不下载分片）
  if ('requestIdleCallback' in window) requestIdleCallback(function () { loadPagefind(); }, { timeout: 4000 });
  else setTimeout(function () { loadPagefind(); }, 2500);
})();
