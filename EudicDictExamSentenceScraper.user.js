// ==UserScript==
// @name         Eudic Dict Exam Sentence Scraper
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  爬取欧路词典真题库句子（大学英语四级六级考研真题库 → 考研 → 查看更多），导出为 Markdown 格式
// @author       TheodorePeng
// @match        https://dict.eudic.net/dicts/en/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/EudicDictExamSentenceScraper.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/EudicDictExamSentenceScraper.user.js
// ==/UserScript==

(function () {
    'use strict';

    const APP_ID = 'eudic-exam-sentence-scraper';
    const LOG_PREFIX = '[EudicExamScraper]';
    const SOURCE_BASE_URL = 'https://cn.eudic.net/ting/openArticle';

    const state = {
        modal: null,
        textarea: null,
        status: null,
    };

    GM_registerMenuCommand('爬取考研真题句子', openScraper);
    injectStyles();
    mountFloatingButton();

    function mountFloatingButton() {
        if (document.getElementById(`${APP_ID}-button`)) return;

        const button = document.createElement('button');
        button.id = `${APP_ID}-button`;
        button.type = 'button';
        button.textContent = '爬取真题句子';
        button.title = '自动点击真题库标签并爬取考研句子';
        button.addEventListener('click', openScraper);
        document.documentElement.appendChild(button);
    }

    function openScraper() {
        if (!state.modal) {
            state.modal = buildModal();
            document.documentElement.appendChild(state.modal);
        }
        state.modal.hidden = false;
        setStatus('正在自动导航并爬取句子，请稍候...', 'info');
        runScrapeFlow();
    }

    function buildModal() {
        const overlay = document.createElement('div');
        overlay.id = `${APP_ID}-modal`;

        const panel = document.createElement('section');
        panel.className = `${APP_ID}-panel`;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', '真题句子爬取结果');

        const header = document.createElement('div');
        header.className = `${APP_ID}-header`;

        const title = document.createElement('div');
        title.className = `${APP_ID}-title`;
        title.textContent = '考研真题句子爬取结果';

        const closeButton = makeButton('关闭', 'secondary');
        closeButton.addEventListener('click', () => {
            overlay.hidden = true;
        });

        header.append(title, closeButton);

        const toolbar = document.createElement('div');
        toolbar.className = `${APP_ID}-toolbar`;

        const refreshButton = makeButton('重新爬取', 'secondary');
        refreshButton.addEventListener('click', () => {
            setStatus('正在重新爬取...', 'info');
            runScrapeFlow();
        });

        const copyButton = makeButton('复制 Markdown', 'primary');
        copyButton.addEventListener('click', copyMarkdown);

        const downloadButton = makeButton('下载 .md', 'secondary');
        downloadButton.addEventListener('click', downloadMarkdown);

        toolbar.append(refreshButton, copyButton, downloadButton);

        state.status = document.createElement('div');
        state.status.className = `${APP_ID}-status`;

        state.textarea = document.createElement('textarea');
        state.textarea.className = `${APP_ID}-textarea`;
        state.textarea.spellcheck = false;
        state.textarea.placeholder = '点击"重新爬取"生成 Markdown...';

        panel.append(header, toolbar, state.status, state.textarea);
        overlay.appendChild(panel);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) overlay.hidden = true;
        });

        return overlay;
    }

    function makeButton(label, variant) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.className = `${APP_ID}-btn ${APP_ID}-btn-${variant}`;
        return button;
    }

    function setStatus(message, kind) {
        if (!state.status) return;
        state.status.textContent = message;
        state.status.dataset.state = kind;
    }

    async function runScrapeFlow() {
        try {
            const result = await scrapeFlow();
            if (result.lines.length === 0) {
                setStatus('未找到句子，请确认页面已加载真题库内容。', 'warn');
                state.textarea.value = '';
                return;
            }
            const separator = '\n\n';
            const markdown = result.lines.join(separator);
            state.textarea.value = markdown;
            setStatus(`已爬取 ${result.lines.length} 条句子${result.loadMoreClicks > 0 ? '（点击了 ' + result.loadMoreClicks + ' 次"查看更多"）' : ''}`, 'ok');
        } catch (error) {
            console.error(LOG_PREFIX, error);
            state.textarea.value = '';
            setStatus(error?.message || '爬取失败，请刷新页面后重试。', 'error');
        }
    }

    async function scrapeFlow() {
        // Step 1: Click main tab
        const mainTab = await waitForElement(() => findTabByHrefOrText('a[href*="tab-detail/4022"]', '大学英语四级六级考研真题库'), 10000, 5);
        if (!mainTab) throw new Error('未找到"大学英语四级六级考研真题库"标签，请刷新页面后重试。');
        mainTab.click();
        await sleep(2000);

        // Step 2: Click "考研" sub-tab
        const subTab = await waitForElement(() => findSubTabByText('考研'), 8000, 5);
        if (!subTab) throw new Error('未找到"考研"子标签，请刷新页面后重试。');
        subTab.click();
        await sleep(2000);

        // Step 3: Click "查看更多" until no more
        let loadMoreClicks = 0;
        let unchangedCount = 0;
        while (true) {
            const container = document.querySelector('.eudic_tiku_content.active');
            if (!container) break;

            const loadMoreBtn = container.querySelector('.onlineDictManagerContainer .onlineDictManager');
            if (!loadMoreBtn) break;

            const btnStyle = window.getComputedStyle(loadMoreBtn);
            const parentStyle = window.getComputedStyle(loadMoreBtn.parentElement);
            if (btnStyle.display === 'none' || btnStyle.visibility === 'hidden' || parentStyle.display === 'none') {
                break;
            }

            const currentCount = container.querySelectorAll('.lj_item').length;
            loadMoreBtn.click();
            loadMoreClicks += 1;
            await sleep(2500);

            const newCount = container.querySelectorAll('.lj_item').length;
            if (newCount === currentCount) {
                unchangedCount += 1;
                if (unchangedCount >= 2) break;
            } else {
                unchangedCount = 0;
            }

            if (loadMoreClicks >= 30) break; // safety limit
        }

        // Step 4: Extract all sentences
        const container = document.querySelector('.eudic_tiku_content.active');
        if (!container) throw new Error('未找到真题内容容器。');

        const items = Array.from(container.querySelectorAll('.lj_item'));
        const lines = items.map(item => buildSentenceLine(item)).filter(Boolean);

        return { lines, loadMoreClicks };
    }

    function findTabByHrefOrText(hrefSelector, text) {
        const byHref = document.querySelector(hrefSelector);
        if (byHref) return byHref;
        const tabs = document.querySelectorAll('a');
        for (const tab of tabs) {
            if (tab.textContent.trim() === text) return tab;
        }
        return null;
    }

    function findSubTabByText(text) {
        // Prefer the <a> element with data-pos attribute (has the actual click handler)
        const link = document.querySelector(`a[data-pos="${text}"]`);
        if (link) return link;

        // Fallback: search within tiku containers for li containing the text,
        // then return its inner <a> if present
        const allLi = document.querySelectorAll('li');
        for (const li of allLi) {
            if (li.textContent.trim() === text) {
                const parent = li.closest('[id*="tiku"], [class*="tiku"]');
                if (parent) {
                    const a = li.querySelector('a');
                    if (a) return a;
                    return li;
                }
            }
        }
        return null;
    }

    async function waitForElement(findFn, timeoutMs, retryCount) {
        for (let i = 0; i < retryCount; i++) {
            const el = findFn();
            if (el) return el;
            await sleep(timeoutMs / retryCount);
        }
        return null;
    }

    function buildSentenceLine(item) {
        const lineEl = item.querySelector('.content p.line');
        const expEl = item.querySelector('.content p.exp');
        if (!lineEl) return null;

        const en = cleanText(lineEl.textContent);
        const zh = expEl ? cleanText(expEl.textContent) : '';
        const rawSource = item.getAttribute('media_title') || '';
        const source = transformSource(rawSource);
        const media = item.getAttribute('media') || '';
        const link = buildSentenceLink(media);

        if (!en) return null;

        return `e.g. ${en} ${zh} @[${source}](${link})`;
    }

    function transformSource(raw) {
        // Input:  "2025年考研英语二、阅读"
        // Output: "2025-Text-KY2"
        const match = raw.match(/(\d{4})年考研英语(一|二)、(.+)/);
        if (!match) return raw;

        const year = match[1];
        const examCode = match[2] === '一' ? 'KY1' : 'KY2';
        const questionType = match[3].trim();

        const typeMap = {
            '阅读': 'Text',
            '翻译': 'Trans',
            '完形': 'Cloze',
        };

        const type = typeMap[questionType] || questionType;
        return `${year}-${type}-${examCode}`;
    }

    function buildSentenceLink(mediaAttr) {
        if (!mediaAttr) return window.location.href;
        // media format: {uuid}|[start],[end]
        const decoded = decodeURIComponent(mediaAttr);
        const parts = decoded.split('|');
        if (parts.length < 2) return window.location.href;
        const audioId = parts[0];
        const timePart = parts[1]; // e.g., [00:00:32.94],[00:00:42.97]
        const match = timePart.match(/\[(\d{2}):(\d{2}):(\d{2}\.\d+)\]/);
        if (!match) return window.location.href;
        const timestamp = `${match[2]}:${match[3]}`; // drop leading hour 00:
        return `${SOURCE_BASE_URL}?id=${encodeURIComponent(audioId)}&timestamp=${encodeURIComponent(timestamp)}`;
    }

    function cleanText(value) {
        return String(value || '')
            .replace(/ /g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\s+([,.;:!?，。；：！？])/g, '$1')
            .replace(/([""''()])\s+/g, '$1')
            .replace(/\s+([""''()])/g, '$1')
            .trim();
    }

    function copyMarkdown() {
        const markdown = state.textarea ? state.textarea.value : '';
        if (!markdown.trim()) {
            setStatus('没有可复制的内容。', 'warn');
            return;
        }
        try {
            GM_setClipboard(markdown, 'text');
            setStatus('已复制 Markdown。', 'ok');
        } catch (error) {
            console.error(LOG_PREFIX, error);
            copyWithClipboardApi(markdown);
        }
    }

    async function copyWithClipboardApi(text) {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            setStatus('复制失败：当前浏览器不支持剪贴板 API。', 'error');
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            setStatus('已复制 Markdown。', 'ok');
        } catch (error) {
            console.error(LOG_PREFIX, error);
            setStatus('复制失败，请手动选中预览内容复制。', 'error');
        }
    }

    function downloadMarkdown() {
        const markdown = state.textarea ? state.textarea.value : '';
        if (!markdown.trim()) {
            setStatus('没有可下载的内容。', 'warn');
            return;
        }
        const word = extractWordFromUrl();
        const fileName = `${word}_考研真题句子.md`;
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        setStatus(`已开始下载 ${fileName}。`, 'ok');
    }

    function extractWordFromUrl() {
        try {
            const url = new URL(window.location.href);
            const pathParts = url.pathname.split('/');
            return pathParts[pathParts.length - 1] || 'word';
        } catch {
            return 'word';
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function injectStyles() {
        if (document.getElementById(`${APP_ID}-styles`)) return;

        const style = document.createElement('style');
        style.id = `${APP_ID}-styles`;
        style.textContent = `
            #${APP_ID}-button {
                position: fixed;
                right: 18px;
                top: 112px;
                z-index: 2147483646;
                border: 1px solid #1d4ed8;
                border-radius: 8px;
                background: #2563eb;
                color: #fff;
                font: 600 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                padding: 9px 12px;
                box-shadow: 0 8px 24px rgba(15, 23, 42, 0.24);
                cursor: pointer;
            }
            #${APP_ID}-button:hover {
                background: #1d4ed8;
            }
            #${APP_ID}-modal {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                background: rgba(15, 23, 42, 0.55);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 28px;
            }
            #${APP_ID}-modal[hidden] {
                display: none !important;
            }
            .${APP_ID}-panel {
                width: min(980px, calc(100vw - 36px));
                height: min(760px, calc(100vh - 36px));
                display: flex;
                flex-direction: column;
                gap: 12px;
                box-sizing: border-box;
                border-radius: 8px;
                background: #fff;
                color: #111827;
                padding: 18px;
                box-shadow: 0 24px 80px rgba(15, 23, 42, 0.35);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            .${APP_ID}-header,
            .${APP_ID}-toolbar {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }
            .${APP_ID}-header {
                justify-content: space-between;
            }
            .${APP_ID}-title {
                font-size: 17px;
                font-weight: 700;
            }
            .${APP_ID}-btn {
                border: 1px solid #d1d5db;
                border-radius: 7px;
                padding: 7px 11px;
                background: #fff;
                color: #111827;
                font: 600 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                cursor: pointer;
            }
            .${APP_ID}-btn:hover {
                background: #f3f4f6;
            }
            .${APP_ID}-btn-primary {
                border-color: #1d4ed8;
                background: #2563eb;
                color: #fff;
            }
            .${APP_ID}-btn-primary:hover {
                background: #1d4ed8;
            }
            .${APP_ID}-status {
                border-radius: 7px;
                background: #f3f4f6;
                color: #374151;
                padding: 8px 10px;
                font-size: 13px;
            }
            .${APP_ID}-status[data-state="ok"] {
                background: #ecfdf5;
                color: #047857;
            }
            .${APP_ID}-status[data-state="warn"] {
                background: #fffbeb;
                color: #92400e;
            }
            .${APP_ID}-status[data-state="error"] {
                background: #fef2f2;
                color: #b91c1c;
            }
            .${APP_ID}-status[data-state="info"] {
                background: #eff6ff;
                color: #1d4ed8;
            }
            .${APP_ID}-textarea {
                flex: 1;
                min-height: 280px;
                width: 100%;
                box-sizing: border-box;
                resize: none;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                padding: 12px;
                color: #111827;
                background: #fff;
                font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
            }
            .${APP_ID}-textarea:focus {
                border-color: #2563eb;
                outline: 2px solid rgba(37, 99, 235, 0.18);
            }
        `;
        document.documentElement.appendChild(style);
    }
})();
