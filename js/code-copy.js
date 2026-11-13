/* 代码块复制按钮 */
(function () {
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.code-copy');
    if (!btn) return;
    var block = btn.closest('.code-block');
    var code = block && block.querySelector('pre code');
    if (!code) return;
    var text = code.innerText;

    function done(ok) {
      btn.textContent = ok ? '已复制' : '失败';
      btn.dataset.done = ok ? 'true' : 'false';
      setTimeout(function () {
        btn.textContent = '复制';
        btn.dataset.done = 'false';
      }, 1600);
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      done(ok);
    }
  });
})();
