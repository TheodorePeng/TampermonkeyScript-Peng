// ==UserScript==
// @name         Bilibili Chapter Copier
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  在 Bilibili 视频章节面板添加“复制”按钮，一键复制所有章节的时间范围和名称。
// @author       TheodorePeng
// @match        https://www.bilibili.com/video/*
// @run-at       document-idle
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/BilibiliChapterCopier.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/BilibiliChapterCopier.user.js
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = '[BiliChapterCopier]';
    const DEBUG = false;

    const PANEL_SELECTOR = '.bpx-player-viewpoint';
    const HEADER_SELECTOR = '.bpx-player-viewpoint-header';
    const HEADER_TEXT_SELECTOR = '.bpx-player-viewpoint-header-text';
    const ITEM_SELECTOR = '.bpx-player-viewpoint-menu-item';
    const ITEM_NAME_SELECTOR = '.bpx-player-viewpoint-menu-item-content';
    const ITEM_TIME_SELECTOR = '.bpx-player-viewpoint-menu-item-time';

    const COPY_BTN_ID = 'bili-chapter-copy-btn';
    const TOAST_ID = 'bili-chapter-copier-toast';
    const STYLE_ID = 'bili-chapter-copier-style';
    const TOAST_DURATION_MS = 1800;

    function debugLog() {
        if (!DEBUG) return;
        console.log(LOG_PREFIX, ...arguments);
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        GM_addStyle(`
            #${COPY_BTN_ID} {
                margin-left: 8px;
                padding: 2px 10px;
                border: 1px solid #00a1d6;
                border-radius: 4px;
                background: transparent;
                color: #00a1d6;
                font-size: 12px;
                line-height: 1.4;
                cursor: pointer;
                transition: all 0.2s ease;
                vertical-align: middle;
            }
            #${COPY_BTN_ID}:hover {
                background: #00a1d6;
                color: #fff;
            }
            #${COPY_BTN_ID}:active {
                background: #0082b3;
                border-color: #0082b3;
            }
            #${TOAST_ID} {
                position: fixed;
                right: 18px;
                bottom: 18px;
                z-index: 2147483647;
                max-width: 320px;
                padding: 10px 14px;
                border-radius: 8px;
                background: rgba(17, 24, 39, 0.94);
                color: #fff;
                box-shadow: 0 10px 30px rgba(15, 23, 42, 0.22);
                font-size: 13px;
                line-height: 1.4;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                pointer-events: none;
                user-select: none;
                opacity: 0;
                transform: translateY(8px);
                transition: opacity 0.2s ease, transform 0.2s ease;
            }
            #${TOAST_ID}.is-visible {
                opacity: 1;
                transform: translateY(0);
            }
        `);
    }

    function showToast(message) {
        let toast = document.getElementById(TOAST_ID);
        if (!toast) {
            toast = document.createElement('div');
            toast.id = TOAST_ID;
            (document.body || document.documentElement).appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('is-visible');

        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => {
            toast.classList.remove('is-visible');
        }, TOAST_DURATION_MS);
    }

    function extractChapters() {
        const items = document.querySelectorAll(ITEM_SELECTOR);
        if (items.length === 0) return null;

        const lines = [];
        for (const item of items) {
            const timeEl = item.querySelector(ITEM_TIME_SELECTOR);
            const nameEl = item.querySelector(ITEM_NAME_SELECTOR);

            const timeRange = timeEl ? timeEl.textContent.trim() : '';
            let chapterName = '';

            if (nameEl) {
                const textNodes = Array.from(nameEl.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE)
                    .map(n => n.textContent.trim())
                    .filter(Boolean);
                chapterName = textNodes.join(' ');
            }

            if (timeRange && chapterName) {
                lines.push(`${timeRange}  ${chapterName}`);
            }
        }

        return lines.length > 0 ? lines.join('\n\n') : null;
    }

    function handleCopy(event) {
        event.stopPropagation();

        const chapters = extractChapters();

        if (!chapters) {
            showToast('未检测到章节信息');
            return;
        }

        GM_setClipboard(chapters, 'text');
        showToast('章节信息已复制到剪贴板');
    }

    function tryInjectButton() {
        const panel = document.querySelector(PANEL_SELECTOR);
        if (!panel) return;
        if (panel.querySelector('#' + COPY_BTN_ID)) return;

        const header = panel.querySelector(HEADER_SELECTOR);
        const headerText = panel.querySelector(HEADER_TEXT_SELECTOR);
        if (!header || !headerText) return;

        const copyBtn = document.createElement('button');
        copyBtn.id = COPY_BTN_ID;
        copyBtn.type = 'button';
        copyBtn.textContent = '复制';
        copyBtn.title = '复制所有章节信息';
        copyBtn.addEventListener('click', handleCopy);

        headerText.insertAdjacentElement('afterend', copyBtn);
        debugLog('Copy button injected');
    }

    function init() {
        injectStyles();

        const target = document.body || document.documentElement;
        if (!target) {
            setTimeout(init, 200);
            return;
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (
                            node.matches(PANEL_SELECTOR) ||
                            (node.querySelector && node.querySelector(PANEL_SELECTOR))
                        ) {
                            tryInjectButton();
                        }
                    }
                }
            }
        });

        observer.observe(target, { childList: true, subtree: true });

        // Try immediately in case panel is already present
        tryInjectButton();

        // SPA navigation watcher
        let lastUrl = location.href;
        const titleEl = document.querySelector('title') || document.head;
        const urlObserver = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                const oldToast = document.getElementById(TOAST_ID);
                if (oldToast) oldToast.remove();
                tryInjectButton();
            }
        });
        urlObserver.observe(titleEl, { subtree: true, childList: true });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }
})();
