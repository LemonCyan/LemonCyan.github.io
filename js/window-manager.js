/* 窗口管理器：拖拽 / 缩放 / 聚焦 / 最小化 / 展开 */
(function () {
  const list = document.getElementById('window-list');
  if (!list) return;

  let zTop = 10;
  let lastFocused = null;

  function windows() {
    return Array.from(list.querySelectorAll('.app-window'));
  }

  function focus(win) {
    lastFocused = win;
    if (win.dataset.focused === 'true') return;
    windows().forEach((w) => (w.dataset.focused = 'false'));
    win.dataset.focused = 'true';
    win.style.zIndex = String(++zTop);
  }

  function openApp(id) {
    const win = list.querySelector(`.app-window[data-app="${id}"]`);
    if (!win) return null;
    win.classList.remove('app-window--hidden');
    win.dataset.minimized = 'false';
    focus(win);
    return win;
  }

  function closeApp(win) {
    win.classList.add('app-window--hidden');
    win.dataset.minimized = 'false';
    syncMaxState();
  }

  function toggleExpand(win) {
    setExpanded(win, win.dataset.expanded !== 'true');
    if (win.dataset.app === 'reader') {
      try { localStorage.setItem('reader-max', win.dataset.expanded === 'true' ? '1' : '0'); } catch (e) {}
    }
  }

  function setExpanded(win, max) {
    const was = win.dataset.expanded === 'true';
    if (max === was) {
      win.dataset.expanded = max ? 'true' : 'false';
      syncMaxState();
      return;
    }
    // 几何必须在改 data-expanded **之前**量：CSS 一挂上 [data-expanded="true"]
    // 窗口立刻被 !important 拉成满屏，那时再 getGeo 记下的就是全屏矩形，
    // 还原出来会变成一个「看着像全屏的窗口」。
    const geo = max ? getGeo(win) : null;
    win.dataset.expanded = max ? 'true' : 'false';
    if (max) {
      if (!was) win.__geo = geo;
      win.style.left = '';
      win.style.top = '';
      win.style.width = '';
      win.style.height = '';
      win.style.transform = '';
      win.dataset.normalized = 'false';
    } else {
      // 还原：有记录的位置就回到原位，否则回到 CSS 默认的居中窗口。
      // 居中态是靠 transform: translate(-50%,-50%) 摆出来的，
      // 所以这里必须把 normalized 清掉，让下一次拖拽重新走归一化。
      win.style.left = '';
      win.style.top = '';
      win.style.width = '';
      win.style.height = '';
      win.style.transform = '';
      win.dataset.normalized = 'false';
      if (win.__geo) applyGeo(win, win.__geo);
    }
    syncMaxState();
  }

  // 任意窗口最大化时都让桌面让位（去掉留白、隐藏图标栏）。
  // 只要还有窗口处于 expanded 就保持让位，全部还原后才恢复。
  function syncMaxState() {
    const anyMax = windows().some(
      (w) => w.dataset.expanded === 'true' && !w.classList.contains('app-window--hidden')
    );
    document.body.dataset.winMax = anyMax ? 'true' : 'false';
  }

  // 关键：win.style.left/top 的参照是最近的定位祖先 .window-list 的 padding box，
  // 而 getBoundingClientRect() 给的是**视口**坐标，两者差一个 list 原点
  // （左边 8px 的 desktop 内缩 + 顶栏 44px 上下偏移）。
  // 以前直接把视口坐标写进 left/top，所以一按下窗口就整体跳一段、拖起来也不跟手。
  function box() {
    return list.getBoundingClientRect();
  }

  // 返回窗口在 .window-list 坐标系里的几何（和 style.left/top 同一套坐标）
  function getGeo(win) {
    const r = win.getBoundingClientRect();
    const l = box();
    return {
      left: r.left - l.left,
      top: r.top - l.top,
      width: r.width,
      height: r.height,
    };
  }

  function applyGeo(win, g) {
    win.style.transform = 'none';
    win.style.left = g.left + 'px';
    win.style.top = g.top + 'px';
    win.style.width = g.width + 'px';
    win.style.height = g.height + 'px';
  }

  // 拖拽 / 缩放期间临时关掉过渡。.app-window 上有
  // transition: transform 180ms，normalize() 把 translate(-50%,-50%) 改成 none
  // 时会补间 180ms：既让第一次读数变成「动画中间态」，也让拖拽看起来像在慢慢飘。
  function freeze(win, on) {
    win.style.transition = on ? 'none' : '';
  }

  // 首次拖拽前把 translate(-50%,-50%) 居中态换成等价的绝对 left/top，避免跳变。
  // 调用方必须已经 freeze(win, true)，否则这里读到的 rect 是过渡动画的中间位置。
  function normalize(win) {
    if (win.dataset.normalized === 'true') return;
    const g = getGeo(win);
    applyGeo(win, g);
    win.dataset.normalized = 'true';
  }

  function startDrag(win, ev) {
    if (win.dataset.expanded === 'true') return;
    if (ev.button !== 0) return;
    if (ev.target.closest('button')) return;
    // 先掐掉过渡，再归一化坐标，保证这一帧读到的 rect 就是最终位置
    freeze(win, true);
    normalize(win);
    focus(win);

    // 直接用 .window-list 坐标系做增量，全程只跟鼠标偏移走，
    // 不再拿视口坐标和 left/top 混用。
    const startX = ev.clientX;
    const startY = ev.clientY;
    const rect = win.getBoundingClientRect();
    const originLeft = rect.left - box().left;
    const originTop = rect.top - box().top;

    let pending = null;
    let raf = 0;

    function paint() {
      raf = 0;
      if (!pending) return;
      const e = pending;
      pending = null;

      const l = box();
      const w = rect.width;
      // 边界：至少留 90px 在 list 内可见，标题栏不许被人拖到看不到
      const minLeft = 90 - w;
      const maxLeft = l.width - 90;
      const minTop = 0;
      const maxTop = Math.max(0, l.height - 44);

      let left = originLeft + (e.clientX - startX);
      let top = originTop + (e.clientY - startY);
      left = Math.max(minLeft, Math.min(left, maxLeft));
      top = Math.max(minTop, Math.min(top, maxTop));

      win.style.left = left + 'px';
      win.style.top = top + 'px';
    }

    function move(e) {
      // 只留最后一次事件，避免 rAF 里排队积压造成的滞后感
      pending = { clientX: e.clientX, clientY: e.clientY };
      if (!raf) raf = requestAnimationFrame(paint);
    }

    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pending = null;
      document.body.style.userSelect = '';
      // 松手后再恢复过渡，避免影响下一次交互的视觉反馈
      freeze(win, false);
    }

    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function startResize(win, dir, ev) {
    if (win.dataset.expanded === 'true') return;
    if (ev.button !== 0) return;
    ev.stopPropagation();
    ev.preventDefault();
    freeze(win, true);
    normalize(win);
    focus(win);

    const startX = ev.clientX;
    const startY = ev.clientY;
    const rect = win.getBoundingClientRect();
    const w0 = rect.width;
    const h0 = rect.height;
    const l = box();
    // 右/下边缩放时，左上角必须钉死不动，否则窗口会往左上「长」
    const left0 = rect.left - l.left;
    const top0 = rect.top - l.top;
    const maxW = l.width - left0;
    const maxH = l.height - top0;

    let pending = null;
    let raf = 0;

    function paint() {
      raf = 0;
      if (!pending) return;
      const e = pending;
      pending = null;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (dir.includes('e')) {
        const w = Math.max(420, Math.min(w0 + dx, maxW));
        win.style.width = w + 'px';
      }
      if (dir.includes('s')) {
        const h = Math.max(280, Math.min(h0 + dy, maxH));
        win.style.height = h + 'px';
      }
    }

    function move(e) {
      pending = { clientX: e.clientX, clientY: e.clientY };
      if (!raf) raf = requestAnimationFrame(paint);
    }

    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pending = null;
      document.body.style.userSelect = '';
      freeze(win, false);
    }

    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function initWindow(win) {
    win.addEventListener('pointerdown', () => focus(win), true);

    const bar = win.querySelector('.window-bar');
    if (bar) bar.addEventListener('pointerdown', (ev) => startDrag(win, ev));

    const close = win.querySelector('.wdot-close');
    if (close) close.addEventListener('click', (ev) => { ev.stopPropagation(); closeApp(win); });

    const min = win.querySelector('.wdot-min');
    if (min) min.addEventListener('click', (ev) => { ev.stopPropagation(); win.dataset.minimized = 'true'; syncMaxState(); });

    const max = win.querySelector('.wdot-max');
    if (max) max.addEventListener('click', (ev) => { ev.stopPropagation(); toggleExpand(win); });

    const expandBtn = win.querySelector('[data-act="expand"]');
    if (expandBtn) expandBtn.addEventListener('click', (ev) => { ev.stopPropagation(); toggleExpand(win); });

    // 边缘缩放手柄
    ['e', 's', 'se'].forEach((dir) => {
      const h = document.createElement('div');
      h.className = 'resize-handle';
      h.dataset.dir = dir;
      h.addEventListener('pointerdown', (ev) => startResize(win, dir, ev));
      win.appendChild(h);
    });

    // 双击标题栏 = 展开/还原
    if (bar) {
      bar.addEventListener('dblclick', (ev) => {
        if (ev.target.closest('button')) return;
        toggleExpand(win);
      });
    }
  }

  windows().forEach(initWindow);
  syncMaxState();

  // 阅读窗口的初始最大化状态：
  //   只有文章页默认最大化（模板写了 data-max-default="true"）；
  //   首页/目录页保持窗口化。
  //   用户手动切换后记在 localStorage，下次访问沿用他的选择。
  const readerWin = list.querySelector('.app-window[data-app="reader"]');
  if (readerWin) {
    let saved = null;
    try { saved = localStorage.getItem('reader-max'); } catch (e) {}
    const wantMax = saved === null ? readerWin.dataset.maxDefault === 'true' : saved === '1';
    setExpanded(readerWin, wantMax);
  }

  // 主题切换
  const themeBtn = document.getElementById('btn-theme');
  const saved = localStorage.getItem('site-scheme');
  if (saved) document.body.dataset.scheme = saved;
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = document.body.dataset.scheme === 'dark' ? 'light' : 'dark';
      document.body.dataset.scheme = next;
      localStorage.setItem('site-scheme', next);
    });
  }

  // 恢复窗口：把被关闭 / 最小化的窗口重新显示出来并聚焦。
  // 优先恢复最近聚焦过的那个；都没有隐藏时，聚焦当前最上层窗口。
  function restore() {
    const hidden = windows().filter(
      (w) => w.classList.contains('app-window--hidden') || w.dataset.minimized === 'true'
    );
    if (!hidden.length) {
      const visible = windows().filter((w) => !w.classList.contains('app-window--hidden'));
      const top = visible.sort(
        (a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0)
      )[0];
      if (top) focus(top);
      return;
    }
    const target = hidden.includes(lastFocused) ? lastFocused : hidden[hidden.length - 1];
    target.classList.remove('app-window--hidden');
    target.dataset.minimized = 'false';
    focus(target);
    syncMaxState();
  }

  const restoreBtn = document.getElementById('btn-restore');
  if (restoreBtn) restoreBtn.addEventListener('click', restore);

  // 桌面图标点击：<a data-open="id"> 不跳转，直接打开对应窗口；
  // 其它桌面图标是普通链接（app 之间的跳转）。
  document.addEventListener('click', (ev) => {
    const trigger = ev.target.closest('[data-open]');
    if (!trigger) return;
    const win = openApp(trigger.dataset.open);
    if (win) ev.preventDefault();
  });

  // 打开搜索窗口
  const searchBtn = document.getElementById('btn-search');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const w = openApp('search');
      const input = document.getElementById('search-input');
      if (input) input.focus();
      if (w) w.classList.remove('app-window--hidden');
    });
  }

  const sidebarSearch = document.getElementById('sidebar-search-input');
  if (sidebarSearch) {
    sidebarSearch.addEventListener('focus', () => {
      openApp('search');
      const input = document.getElementById('search-input');
      if (input) {
        input.value = sidebarSearch.value;
        input.focus();
      }
    });
  }

  // 键盘：/ 或 Ctrl+K 打开搜索（仅当页面存在搜索窗口）；Esc 关闭最上层搜索
  document.addEventListener('keydown', (ev) => {
    if ((ev.key === '/' || (ev.key.toLowerCase() === 'k' && (ev.metaKey || ev.ctrlKey))) &&
        !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) &&
        list.querySelector('.app-window[data-app="search"]')) {
      ev.preventDefault();
      openApp('search');
      const input = document.getElementById('search-input');
      if (input) input.focus();
    }
    if (ev.key === 'Escape') {
      const top = windows()
        .filter((w) => !w.classList.contains('app-window--hidden') && w.dataset.minimized !== 'true')
        .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
      if (top && top.dataset.app === 'search') closeApp(top);
    }
  });

  window.__WM__ = { openApp, closeApp, focus };
})();
