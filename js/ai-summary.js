// AI 文章摘要前端交互脚本
document.addEventListener('DOMContentLoaded', () => {
  const card = document.getElementById('ai-summary-card');
  const textEl = document.getElementById('ai-summary-text');
  if (!card || !textEl) return;

  const WORKER_URL = 'https://ai-summary.liuluhua7.workers.dev/';
  const postId = decodeURIComponent(location.pathname);

  // 提取文章正文纯文本（字数过少则隐藏卡片不触发生成）
  const bodyEl = document.querySelector('.article-body');
  const rawText = bodyEl ? bodyEl.innerText.replace(/\s+/g, ' ').trim() : '';
  if (rawText.length < 50) {
    card.style.display = 'none';
    return;
  }

  fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: postId, content: rawText }),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Worker HTTP status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      // 1. 若命中 Cloudflare KV 缓存，直接返回 JSON 摘要
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data.summary) {
          textEl.textContent = data.summary;
        } else {
          card.style.display = 'none';
        }
        return;
      }

      // 2. 首次访问未命中缓存，走 SSE 流式打字机效果
      textEl.textContent = '';
      textEl.classList.add('ai-typing');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const char = json.choices?.[0]?.delta?.content || '';
              if (char) {
                textEl.textContent += char;
              }
            } catch (e) {
              // 忽略单行 JSON 格式异常
            }
          }
        }
      }

      textEl.classList.remove('ai-typing');

      // 若流式结束但无有效内容，隐藏卡片
      if (!textEl.textContent.trim()) {
        card.style.display = 'none';
      }
    })
    .catch((err) => {
      console.warn('[AI Summary]', err);
      // 网络异常或 Worker 离线时静默隐藏，不破坏阅读体验
      card.style.display = 'none';
    });
});

