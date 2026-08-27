// themes/stellar/source/js/ai_summary.js
document.addEventListener('DOMContentLoaded', () => {
    const postArticle = document.querySelector('article.content') || document.querySelector('.post-content') || document.querySelector('#article-container');
    if (!postArticle) return;

    // 1. Worker 地址配置
    const WORKER_URL = 'https://ai-summary.liuluhua7.workers.dev/';

    // 2. 获取当前文章唯一标识与纯文本内容
    const postId = location.pathname;
    const rawText = postArticle.innerText.replace(/\s+/g, ' ').trim();
    if (rawText.length < 50) return; // 字数太少不生成

    // 3. 在文章正文前插入 AI 摘要卡片容器
    const aiBox = document.createElement('div');
    aiBox.className = 'custom-ai-box';
    aiBox.innerHTML = `
    <div class="ai-header">
      <div class="ai-title">🤖 <span>AI 摘要</span></div>
      <div class="ai-tag">OpenRouter</div>
    </div>
    <div class="ai-content" id="ai-summary-text">
      <span class="ai-loading">正在思考并提取文章核心...</span>
    </div>
  `;
    postArticle.parentNode.insertBefore(aiBox, postArticle);

    const textEl = document.getElementById('ai-summary-text');

    // 4. 发起请求
    fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, content: rawText })
    }).then(async (response) => {
        const contentType = response.headers.get('content-type') || '';

        // 如果返回 JSON 说明命中了 KV 缓存
        if (contentType.includes('application/json')) {
            const data = await response.json();
            if (data.summary) {
                textEl.innerText = data.summary;
            } else {
                textEl.innerText = '暂无摘要生成。';
            }
            return;
        }

        // 否则为 SSE 流式响应，打字机实时展示
        textEl.innerText = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
                    try {
                        const json = JSON.parse(line.slice(6));
                        const char = json.choices?.[0]?.delta?.content || '';
                        textEl.innerText += char;
                    } catch (e) { }
                }
            }
        }
    }).catch((err) => {
        console.error('AI Summary Error:', err);
        textEl.innerText = 'AI 摘要服务暂时离线。';
    });
});
