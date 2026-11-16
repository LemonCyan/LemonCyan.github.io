/* 侧栏目录树：从 /tree.json 客户端渲染（避免每页内嵌 2008 篇目录，省下 ~250KB/页） */
(function () {
  var host = document.getElementById('sidebar-tree');
  if (!host) return;

  // 统一在「未编码的中文路径」上做比较：
  //   - 服务端写进 data-current 的是 doc.url（未编码）
  //   - 这里拼出来的路径也保持未编码，只在写 href 时才 encodeURI
  // 否则二者永远不相等，当前文章高亮与祖先目录自动展开都会失效。
  function decodePath(p) {
    try { return decodeURI(String(p)); } catch (e) { return String(p); }
  }
  function norm(p) {
    var s = decodePath(p);
    return s.charAt(s.length - 1) === '/' ? s : s + '/';
  }
  function enc(p) {
    return p.split('/').map(function (seg) { return seg ? encodeURIComponent(seg) : ''; }).join('/');
  }

  var current = norm(host.dataset.current || location.pathname);
  var loaded = false;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function pathOf(rel) {
    return norm('/' + rel);
  }

  // 文件夹排序：中文开头的目录置顶，其余保持 tree.json 里的既有顺序。
  // 规则与 src/load.js 的 sortFolders 一致；这里再排一次是兜底，
  // 免得浏览器缓存了旧版 tree.json 时侧栏顺序回退。
  var CJK_START = /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
  function sortFolders(kids) {
    var zh = [], rest = [];
    kids.forEach(function (k) { (CJK_START.test(k.n) ? zh : rest).push(k); });
    return zh.concat(rest);
  }

  function renderNode(node) {
    var html = '';
    var kids = sortFolders(node.c || []);
    var docs = node.d || [];

    // 优先展示子目录（文件夹），再展示本目录下的文章。
    kids.forEach(function (k) {
      var p = pathOf(k.p);
      var open = current.indexOf(p) === 0 ? ' open' : '';
      html += '<details class="tree-group"' + open + '>' +
        '<summary><span class="tree-label">' + esc(k.n) + '</span>' +
        '<span class="tree-count">' + (k.t || 0) + '</span></summary>' +
        '<div class="tree-children">' + renderNode(k) + '</div></details>';
    });

    // 展示本目录下的文章文件。
    // 注意：子目录的文章由 renderNode(kid) 自己输出，这里不能再渲染一遍，
    // 否则每篇会被重复列出两次（侧栏条目数会翻倍）。
    docs.forEach(function (d) {
      html += docLink(d);
    });

    return html;
  }

  function docLink(d) {
    // 用服务端算好的真实 URL（d.u），不能用 d.p 自己拼 ——
    // 文件名里的空格在 URL 里会变成 '-'（Docker Compose → Docker-Compose），
    // 用 d.p 拼出来的地址是 404。
    var p = norm(d.u);
    var cur = p === current ? ' aria-current="page"' : '';
    return '<a class="tree-doc" href="' + enc(p) + '"' + cur +
      ' title="' + esc(d.t) + '">' + esc(d.t) + '</a>';
  }

  function render(data) {
    host.innerHTML = renderNode(data) || '<p class="search-hint">暂无内容</p>';
    // 保证当前文章的祖先目录全部展开，并把它滚进可视区
    var active = host.querySelector('[aria-current="page"]');
    if (active) {
      var el = active.parentElement;
      while (el && el !== host) {
        if (el.tagName === 'DETAILS') el.open = true;
        el = el.parentElement;
      }
      if (active.scrollIntoView) {
        try { active.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
      }
    }
  }

  function load() {
    if (loaded) return;
    loaded = true;
    // 每次构建都会重写 tree.json；这里不能用 force-cache，
    // 否则浏览器会一直复用缓存里的旧目录树，源文件怎么移动侧栏都不变。
    fetch('/tree.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () { host.innerHTML = '<p class="search-hint">目录加载失败</p>'; });
  }

  // 侧栏在视口内才加载
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); }
    }, { rootMargin: '200px' });
    io.observe(host);
  } else {
    load();
  }
})();
