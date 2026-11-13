/* 桌面右下角公告卡：首次访问 / 刷新时出现，超时自动关闭，也可手动关闭。
   纯前端、无依赖，样式见 /css/notice.css。 */
(function () {
  'use strict';

  // 每次加载页面都显示（不做 localStorage 记忆），刷新即再次出现。
  var AUTO_CLOSE_MS = 20000;   // 自动关闭时间；设 0 表示不自动关闭
  var TITLE = '十二条生活原则';
  var OK_TEXT = '知道了';

  // 显示时机：只在「首次访问」和「刷新」时出现。
  // 站内点击链接跳页面属于普通导航，不该每次弹（本站是静态站，每次跳页都是整页加载）。
  // 想改成"每次加载都弹"，把下面这行改成 true。
  var ALWAYS_SHOW = false;

  function firstLoadOrReload() {
    if (ALWAYS_SHOW) return true;
    var nav = window.performance && performance.getEntriesByType
      ? performance.getEntriesByType('navigation')[0] : null;
    var type = nav ? nav.type : '';
    if (type === 'reload') return true;             // 刷新
    if (type === 'back_forward') return false;      // 前进 / 后退
    if (type === 'prerender') return false;
    // navigate（或拿不到类型）：站外进入 / 直接输地址 → 弹；站内跳转 → 不弹
    var ref = document.referrer;
    if (!ref) return true;
    try {
      return new URL(ref).origin !== location.origin;
    } catch (e) {
      return true;
    }
  }

  var ITEMS = [
    '每天写作，把想法写清楚',
    '身体放在第一位：睡够、运动、定期体检',
    '只做一件能复利十年的事，并持续交付',
    '把 AI 当同事用，同时守住判断力和品味',
    '至少存够一年生活费，再去冒险',
    '长期投资低成本指数，少碰杠杆',
    '每年学一项和本行无关的硬技能',
    '维护五到十段深交，主动联系',
    '作品公开，让机会来找你',
    '少看新闻，多读原著',
    '每年复盘一次，砍掉三件不再值得做的事',
    '对家人多花时间，别等以后'
  ];

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function mount() {
    if (document.querySelector('.notice')) return; // 防止重复注入
    if (!firstLoadOrReload()) return;              // 站内跳页不打扰

    var card = el('aside', 'notice');
    card.setAttribute('role', 'complementary');
    card.setAttribute('aria-label', TITLE);

    /* ----- 标题行 ----- */
    var head = el('div', 'notice-head');
    head.appendChild(el('span', 'notice-title', TITLE));

    var timer = el('span', 'notice-timer');
    timer.setAttribute('aria-hidden', 'true');
    var close = el('button', 'notice-close', '\u00d7');
    close.type = 'button';
    close.title = '关闭';
    close.setAttribute('aria-label', '关闭公告');
    head.appendChild(timer);
    head.appendChild(close);
    card.appendChild(head);

    /* ----- 正文列表 ----- */
    var body = el('div', 'notice-body');
    var list = el('ol', 'notice-list');
    ITEMS.forEach(function (text, i) {
      var li = el('li');
      li.appendChild(el('span', 'notice-n', String(i + 1)));
      li.appendChild(el('span', 'notice-t', text));
      list.appendChild(li);
    });
    body.appendChild(list);
    card.appendChild(body);

    /* ----- 底部手动关闭 ----- */
    var foot = el('div', 'notice-foot');
    var ok = el('button', 'notice-ok', OK_TEXT);
    ok.type = 'button';
    foot.appendChild(ok);
    card.appendChild(foot);

    /* ----- 倒计时进度条 ----- */
    var bar = el('div', 'notice-progress');
    var fill = el('span', 'notice-progress-fill');
    bar.appendChild(fill);
    card.appendChild(bar);

    document.body.appendChild(card);

    /* ================= 关闭逻辑 ================= */
    var closed = false;
    var paused = false;
    var remaining = AUTO_CLOSE_MS;
    var tickId = 0;
    var tickAt = 0;

    function dismiss() {
      if (closed) return;
      closed = true;
      stopClock();
      document.removeEventListener('keydown', onKey, true);
      if (reduced.matches) {
        card.remove();
        return;
      }
      card.dataset.leaving = 'true';
      card.addEventListener('animationend', function () { card.remove(); }, { once: true });
      // 兜底：animationend 偶发不触发时也能收尾
      setTimeout(function () { if (card.isConnected) card.remove(); }, 600);
    }

    close.addEventListener('click', dismiss);
    ok.addEventListener('click', dismiss);

    // Esc 关闭。用捕获阶段 + stopPropagation，保证 Esc 先关「最上层」的这张卡，
    // 不会顺带把 window-manager 里正在打开的搜索窗口一起关掉。
    function onKey(e) {
      if (e.key !== 'Escape' || closed) return;
      e.stopPropagation();
      dismiss();
    }
    document.addEventListener('keydown', onKey, true);

    /* ================= 倒计时（可暂停） ================= */
    function paint() {
      var left = Math.max(0, remaining);
      timer.textContent = (left / 1000).toFixed(1) + 's';
      var ratio = AUTO_CLOSE_MS > 0 ? left / AUTO_CLOSE_MS : 1;
      fill.style.transform = 'scaleX(' + ratio + ')';
      card.dataset.paused = paused ? 'true' : 'false';
    }

    // 用 setInterval + performance.now() 计时，而不是 requestAnimationFrame：
    // rAF 在后台标签页/部分无头环境会被完全停掉，会让倒计时永久冻结。
    function tick() {
      if (closed) return;
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (!tickAt) { tickAt = now; return; }
      var dt = now - tickAt;
      tickAt = now;
      if (paused) return;
      remaining -= dt;
      if (remaining <= 0) { remaining = 0; paint(); dismiss(); return; }
      paint();
    }

    function startClock() {
      if (closed || AUTO_CLOSE_MS <= 0 || tickId) return;
      tickAt = 0;
      tickId = window.setInterval(tick, 100);
    }

    function stopClock() {
      if (tickId) { clearInterval(tickId); tickId = 0; }
    }

    /* 读的时候别被关掉：悬停 / 键盘焦点 / 页面隐藏 都要暂停，
       多个原因同时成立时，只有全部解除才恢复计时。 */
    var holds = { hover: false, focus: false, hidden: false };

    function syncPaused() {
      var next = holds.hover || holds.focus || holds.hidden;
      if (next === paused) return;
      paused = next;
      tickAt = 0;
      paint();
    }
    function hold(kind, on) {
      holds[kind] = on;
      syncPaused();
    }

    card.addEventListener('pointerenter', function () { hold('hover', true); });
    card.addEventListener('pointerleave', function () { hold('hover', false); });
    card.addEventListener('focusin', function () { hold('focus', true); });
    card.addEventListener('focusout', function (e) {
      if (!card.contains(e.relatedTarget)) hold('focus', false);
    });
    // 标签页切到后台时也停下，回来重新计时（避免"切回来就已关闭"）
    document.addEventListener('visibilitychange', function () {
      hold('hidden', !!document.hidden);
    });

    paint();
    if (AUTO_CLOSE_MS > 0) startClock(); else timer.textContent = '';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
