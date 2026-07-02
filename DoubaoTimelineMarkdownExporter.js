// ==UserScript==
// @name         Doubao Timeline Markdown Exporter
// @namespace    http://tampermonkey.net/
// @version      0.1.6
// @description  Extract Doubao Bilibili summary timeline notes and copy them as Markdown bullets.
// @author       TheodorePeng
// @match        https://www.doubao.com/summary/bilibili/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    const MENU_LABEL = 'Copy Doubao Timeline Markdown';
    const BUTTON_ID = 'doubao-timeline-markdown-exporter';
    const TOAST_ID = 'doubao-timeline-markdown-exporter-toast';
    const STYLE_ID = 'doubao-timeline-markdown-exporter-style';

    let isRunning = false;

    GM_registerMenuCommand(MENU_LABEL, () => {
        void copyTimelineMarkdown();
    });

    init();

    function init() {
        injectButton();
        observePageChanges();
    }

    async function copyTimelineMarkdown() {
        if (isRunning) {
            showToast('正在复制，请稍候…');
            return;
        }

        isRunning = true;
        setButtonState('loading');
        try {
            const markdown = await buildTimelineMarkdown();
            GM_setClipboard(markdown, 'text');
            showToast('已复制为 Markdown');
            setButtonState('success');
        } catch (error) {
            console.error('[Doubao Timeline] Export failed:', error);
            showToast(error && error.message ? error.message : '导出失败');
            setButtonState('idle');
        } finally {
            isRunning = false;
        }
    }

    function assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }

    function buildTimelineMarkdownFromGroups(groups) {
        const filteredGroups = groups
            .map((group) => ({
                time: group.time,
                title: normalizeText(group.title),
                items: (group.items || []).filter((item) => item.time && normalizeText(item.title))
            }))
            .filter((group) => group.time && group.title);

        assert(filteredGroups.length > 0, 'No timeline notes found.');

        return filteredGroups.map((group) => {
            const lines = [`- ${group.time} ${group.title}`];
            for (const item of group.items) {
                lines.push(`  - ${item.time} ${normalizeText(item.title)}`);
            }
            return lines.join('\n');
        }).join('\n\n');
    }

    async function buildTimelineMarkdown() {
        await waitForTimelineRoot();

        const domGroups = extractTimelineGroupsFromDom();
        if (domGroups.length > 0) {
            return buildTimelineMarkdownFromGroups(domGroups);
        }

        const fallbackGroups = extractTimelineGroupsFromText();
        if (fallbackGroups.length > 0) {
            return buildTimelineMarkdownFromGroups(fallbackGroups);
        }

        throw new Error('No timeline notes found.');
    }

    async function waitForTimelineRoot(timeoutMs = 15000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (extractTimelineGroupsFromDom().length > 0 || extractTimelineGroupsFromText().length > 0) {
                return;
            }
            await delay(250);
        }
        throw new Error('Timed out waiting for Doubao timeline notes.');
    }

    function extractTimelineGroupsFromDom() {
        const titleNodes = Array.from(document.querySelectorAll('[data-testid^="youtube-share-page-highlight-item-"]'));
        const groups = [];

        for (const titleNode of titleNodes) {
            const groupNode = titleNode.parentElement || titleNode;
            const time = extractTagTime(titleNode);
            const title = extractGroupTitle(titleNode);
            const items = extractGroupItems(groupNode, titleNode);

            if (!time || !title) {
                continue;
            }

            groups.push({
                time,
                title,
                items
            });
        }

        return dedupeGroups(groups);
    }

    function extractTagTime(node) {
        const tagNode = node.querySelector('[aria-label^="Tag:"]');
        if (!tagNode) {
            return '';
        }

        return normalizeText((tagNode.getAttribute('aria-label') || '').replace(/^Tag:\s*/, ''));
    }

    function extractGroupTitle(groupNode) {
        const titleNode = groupNode.querySelector('.breakdownContent-j6aiCu')
            || groupNode.querySelector('[class*="breakdownContent"]');

        return titleNode ? normalizeText(titleNode.textContent || '') : '';
    }

    function extractGroupItems(groupNode, titleNode) {
        const itemRoot = findItemRoot(groupNode, titleNode);
        if (!itemRoot) {
            return [];
        }

        const itemNodes = Array.from(itemRoot.querySelectorAll('.bulletPointContainer-hNNnv1, [class*="bulletPointContainer"]'));
        const items = [];

        for (const itemNode of itemNodes) {
            const time = extractTagTime(itemNode);
            const contentNode = itemNode.querySelector('.pointContent-uH9C4P')
                || itemNode.querySelector('[class*="pointContent"]');
            const title = contentNode ? normalizeText(contentNode.textContent || '') : '';

            if (!time || !title) {
                continue;
            }

            items.push({ time, title });
        }

        return dedupeItems(items);
    }

    function findItemRoot(groupNode, titleNode) {
        const directSibling = titleNode && titleNode.nextElementSibling;
        if (directSibling && directSibling.querySelector('.bulletPointContainer-hNNnv1, [class*="bulletPointContainer"]')) {
            return directSibling;
        }

        const childCandidates = Array.from(groupNode.children || []).filter((child) => child !== titleNode);
        for (const child of childCandidates) {
            if (child.querySelector('.bulletPointContainer-hNNnv1, [class*="bulletPointContainer"]')) {
                return child;
            }
        }

        return groupNode.querySelector('.bulletPointContainer-hNNnv1, [class*="bulletPointContainer"]')
            ? groupNode
            : null;
    }

    function extractTimelineGroupsFromText() {
        const lines = (document.body ? document.body.innerText || '' : '')
            .split('\n')
            .map((line) => normalizeText(line))
            .filter(Boolean);

        const entries = [];
        for (const line of lines) {
            const match = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/);
            if (!match) {
                continue;
            }
            entries.push({ time: match[1], title: match[2] });
        }

        if (entries.length < 2) {
            return [];
        }

        const groups = [];
        for (let i = 0; i < entries.length; i += 6) {
            const chunk = entries.slice(i, i + 6);
            if (chunk.length === 0) {
                continue;
            }
            const [head, ...items] = chunk;
            groups.push({
                time: head.time,
                title: head.title,
                items
            });
        }

        return dedupeGroups(groups);
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function normalizeText(text) {
        return text.replace(/\s+/g, ' ').trim();
    }

    function dedupeItems(items) {
        const seen = new Set();
        return items.filter((item) => {
            const key = `${item.time}::${item.title}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    function dedupeGroups(groups) {
        const seen = new Set();
        return groups.filter((group) => {
            const key = `${group.time}::${group.title}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    function injectButton() {
        if (!document.body || document.getElementById(BUTTON_ID)) {
            return;
        }

        injectStyles();

        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.className = 'doubao-timeline-exporter-button';
        button.setAttribute('aria-live', 'polite');
        button.setAttribute('aria-label', '复制当前时间戳 Markdown');
        button.setAttribute('data-tooltip', '复制 Markdown');
        button.innerHTML = '<span class="doubao-timeline-exporter-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M9 7a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V7Zm2 0v10h7V7h-7ZM5 9a2 2 0 0 1 2-2h1v2H7v8h7v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9Z"></path></svg></span>';
        button.addEventListener('click', () => {
            void copyTimelineMarkdown();
        });
        document.body.appendChild(button);
        setButtonState('idle');
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID) || !document.head) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${BUTTON_ID} {
                position: fixed;
                right: 16px;
                bottom: 16px;
                z-index: 2147483647;
                width: 40px;
                height: 40px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                border: 1px solid rgba(255, 255, 255, 0.16);
                border-radius: 999px;
                background: rgba(17, 24, 39, 0.76);
                color: #f9fafb;
                backdrop-filter: blur(16px) saturate(140%);
                -webkit-backdrop-filter: blur(16px) saturate(140%);
                box-shadow: 0 10px 24px rgba(15, 23, 42, 0.2);
                cursor: pointer;
                user-select: none;
                transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
            }

            #${BUTTON_ID}:hover {
                transform: translateY(-1px);
                background: rgba(17, 24, 39, 0.88);
                border-color: rgba(255, 255, 255, 0.24);
                box-shadow: 0 14px 30px rgba(15, 23, 42, 0.24);
            }

            #${BUTTON_ID}:active {
                transform: translateY(0);
                box-shadow: 0 8px 18px rgba(15, 23, 42, 0.18);
            }

            #${BUTTON_ID}:focus-visible {
                outline: none;
                box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.36), 0 14px 30px rgba(15, 23, 42, 0.24);
            }

            #${BUTTON_ID}[data-state="loading"] {
                cursor: progress;
                opacity: 0.96;
            }

            #${BUTTON_ID}[data-state="success"] {
                background: rgba(22, 101, 52, 0.84);
                border-color: rgba(134, 239, 172, 0.38);
            }

            #${BUTTON_ID}::after {
                content: attr(data-tooltip);
                position: absolute;
                right: 48px;
                top: 50%;
                transform: translateY(-50%) translateX(4px);
                padding: 6px 8px;
                border-radius: 8px;
                background: rgba(17, 24, 39, 0.92);
                color: #f9fafb;
                font-size: 12px;
                line-height: 1;
                font-weight: 500;
                white-space: nowrap;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.16s ease, transform 0.16s ease;
            }

            #${BUTTON_ID}:hover::after,
            #${BUTTON_ID}:focus-visible::after {
                opacity: 1;
                transform: translateY(-50%) translateX(0);
            }

            #${BUTTON_ID} .doubao-timeline-exporter-icon {
                width: 100%;
                height: 100%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }

            #${BUTTON_ID} .doubao-timeline-exporter-icon svg {
                width: 18px;
                height: 18px;
                fill: currentColor;
            }

            #${TOAST_ID} {
                position: fixed;
                right: 16px;
                bottom: 64px;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                min-width: 0;
                max-width: min(300px, calc(100vw - 24px));
                padding: 10px 12px;
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 12px;
                background: rgba(17, 24, 39, 0.84);
                color: #f9fafb;
                backdrop-filter: blur(16px) saturate(140%);
                -webkit-backdrop-filter: blur(16px) saturate(140%);
                box-shadow: 0 14px 30px rgba(15, 23, 42, 0.24);
                font-size: 12px;
                line-height: 1.45;
                opacity: 0;
                transform: translateY(8px);
                pointer-events: none;
                transition: opacity 0.18s ease, transform 0.18s ease;
            }

            #${TOAST_ID}[data-visible="true"] {
                opacity: 1;
                transform: translateY(0);
            }

            @media (max-width: 768px) {
                #${BUTTON_ID} {
                    right: 12px;
                    bottom: 12px;
                    width: 36px;
                    height: 36px;
                }

                #${BUTTON_ID}::after {
                    display: none;
                }

                #${BUTTON_ID} .doubao-timeline-exporter-icon svg {
                    width: 16px;
                    height: 16px;
                }

                #${TOAST_ID} {
                    right: 12px;
                    bottom: 56px;
                    max-width: calc(100vw - 20px);
                }
            }
        `;
        document.head.appendChild(style);
    }

    function setButtonState(state) {
        const button = document.getElementById(BUTTON_ID);
        if (!button) {
            return;
        }

        button.dataset.state = state;
        if (state === 'loading') {
            button.dataset.tooltip = '整理中…';
            button.setAttribute('aria-label', '正在整理并复制 Markdown');
            return;
        }

        if (state === 'success') {
            button.dataset.tooltip = '复制成功';
            button.setAttribute('aria-label', 'Markdown 已复制成功');
            clearTimeout(setButtonState.timerId);
            setButtonState.timerId = setTimeout(() => {
                if (!isRunning) {
                    setButtonState('idle');
                }
            }, 1600);
            return;
        }

        clearTimeout(setButtonState.timerId);
        button.dataset.tooltip = '复制 Markdown';
        button.setAttribute('aria-label', '复制当前时间戳 Markdown');
    }

    function observePageChanges() {
        const observer = new MutationObserver(() => {
            if (!document.getElementById(BUTTON_ID) && document.body) {
                injectButton();
            }
        });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }

        window.addEventListener('popstate', () => {
            setTimeout(() => {
                injectButton();
            }, 300);
        });
    }

    function showToast(message) {
        if (!document.body) {
            console.log('[Doubao Timeline]', message);
            return;
        }

        injectStyles();

        let toast = document.getElementById(TOAST_ID);
        if (!toast) {
            toast = document.createElement('div');
            toast.id = TOAST_ID;
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.dataset.visible = 'true';
        clearTimeout(showToast.timerId);
        showToast.timerId = setTimeout(() => {
            toast.dataset.visible = 'false';
        }, 1800);
    }
})();
