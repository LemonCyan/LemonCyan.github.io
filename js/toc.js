/* 右侧「本页目录」：点击平滑跳转 + 滚动高亮当前章节 */
(function () {
  var rail = document.querySelector('.toc-rail');
  if (!rail) return;

  var links = Array.prototype.slice.call(rail.querySelectorAll('.toc-item'));
  if (!links.length) return;

  var scroller = document.querySelector('.reader-main');
  var content = document.querySelector('.reader-content');

  var items = links
    .map(function (a) {
      var id = a.dataset.tocTarget;
      var el = id ? document.getElementById(id) : null;
      return el ? { link: a, el: el, id: id } : null;
    })
    .filter(Boolean);

  if (!items.length) return;

  // 偏移量：window-bar(38) + 一点点留白
  var OFFSET = 56;

  function setActive(active) {
    items.forEach(function (it) {
      it.link.dataset.active = it === active ? 'true' : 'false';
    });
    if (!active) return;
    // 让高亮项在目录条内可见
    var box = active.link.getBoundingClientRect();
    var host = rail.getBoundingClientRect();
    if (box.top < host.top + 30 || box.bottom > host.bottom - 10) {
      active.link.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  // 点击
  links.forEach(function (a) {
    a.addEventListener('click', function (ev) {
      var id = a.dataset.tocTarget;
      var el = id ? document.getElementById(id) : null;
      if (!el || !scroller) return;
      ev.preventDefault();
      var top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top +
        scroller.scrollTop - OFFSET;
      scroller.scrollTo({ top: top < 0 ? 0 : top, behavior: 'smooth' });
      if (history.replaceState) history.replaceState(null, '', '#' + encodeURIComponent(id));
      setActive(items.filter(function (it) { return it.link === a; })[0]);
    });
  });

  // 滚动高亮：取最后一个已经滚过基准线的标题
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (!scroller) return;
      var base = scroller.getBoundingClientRect().top + OFFSET + 12;
      var best = null;
      for (var i = 0; i < items.length; i++) {
        var top = items[i].el.getBoundingClientRect().top;
        if (top <= base) best = items[i];
        else break;
      }
      // 滚到底时强制选中最后一项
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 8) {
        best = items[items.length - 1];
      }
      setActive(best);
    });
  }

  if (scroller) scroller.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // 首屏定位：带 hash 时直接对齐
  function init() {
    var hash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    if (hash) {
      var el = document.getElementById(hash);
      if (el && scroller) {
        var top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top +
          scroller.scrollTop - OFFSET;
        scroller.scrollTo({ top: top < 0 ? 0 : top, behavior: 'auto' });
      }
    }
    onScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
