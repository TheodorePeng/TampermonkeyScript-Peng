// ==UserScript==
// @name         GET Share Note Notion Exporter
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  Extract GET share notes and appended notes into Notion-friendly Markdown with in-page preview, copy, and download.
// @author       TheodorePeng
// @match        https://www.biji.com/note/share_note/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_PREFIX = '[GET Notion Exporter]';
    const STYLE_ID = 'get-share-note-exporter-style';
    const FLOAT_BUTTON_ID = 'get-share-note-exporter-button';
    const ROOT_ID = 'get-share-note-exporter-root';
    const OVERLAY_ID = 'get-share-note-exporter-overlay';
    const BODY_LOCK_CLASS = 'get-share-note-exporter-lock';
    const MENU_LABEL = 'Open GET Notion Exporter';
    const API_BASE = 'https://get-notes.luojilab.com/voicenotes/web/share/notes';
    const CHILDREN_PAGE_SIZE = 20;
    const AUDIO_NOTE_TYPES = new Set(['meeting', 'local_audio', 'audio']);
    const SECTION_LABELS = {
        overview: '概览',
        summary: '智能总结',
        chapters: '章节摘要',
        quotes: '金句精选',
        todos: '待办事项',
        body: '正文',
        transcript: '文字记录'
    };

    const state = {
        rootShareId: '',
        rootNode: null,
        selectedShareId: '',
        noteIndex: new Map(),
        overlay: null,
        treePane: null,
        contentPane: null,
        titleEl: null,
        statusEl: null,
        isOpen: false,
        isLoading: false,
        loadingPromise: null,
        toastTimer: null
    };

    try {
        GM_registerMenuCommand(MENU_LABEL, () => {
            void openExporter();
        });
    } catch (error) {
        console.warn(SCRIPT_PREFIX, 'GM_registerMenuCommand unavailable:', error);
    }

    init();

    function init() {
        injectStyles();
        injectFloatingButton();
        ensureRoot();
        window.addEventListener('keydown', onWindowKeydown, true);
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            body.${BODY_LOCK_CLASS} {
                overflow: hidden !important;
            }
            #${FLOAT_BUTTON_ID} {
                position: fixed;
                right: 24px;
                bottom: 24px;
                z-index: 2147483000;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                min-width: 148px;
                height: 52px;
                padding: 0 18px;
                border: 0;
                border-radius: 999px;
                background: linear-gradient(135deg, #1f6fff, #2458d3);
                color: #fff;
                box-shadow: 0 18px 40px rgba(31, 111, 255, 0.28);
                cursor: pointer;
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 0.01em;
            }
            #${FLOAT_BUTTON_ID}:hover {
                transform: translateY(-1px);
                box-shadow: 0 22px 44px rgba(31, 111, 255, 0.34);
            }
            #${FLOAT_BUTTON_ID}:active {
                transform: translateY(0);
            }
            #${ROOT_ID} {
                position: fixed;
                inset: 0;
                z-index: 2147483640;
                pointer-events: none;
                font-family: "SF Pro Text", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
                color: #1e293b;
            }
            #${OVERLAY_ID} {
                position: absolute;
                inset: 0;
                display: none;
                align-items: center;
                justify-content: center;
                background: rgba(15, 23, 42, 0.46);
                backdrop-filter: blur(8px);
                pointer-events: auto;
            }
            #${OVERLAY_ID}.is-open {
                display: flex;
            }
            .gsn-modal {
                width: min(1240px, calc(100vw - 48px));
                height: min(840px, calc(100vh - 48px));
                background: #f8fafc;
                border-radius: 24px;
                box-shadow: 0 30px 80px rgba(15, 23, 42, 0.26);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            .gsn-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 16px;
                padding: 24px 28px 18px;
                background: linear-gradient(180deg, #ffffff, #f8fafc);
                border-bottom: 1px solid rgba(148, 163, 184, 0.18);
            }
            .gsn-title-group {
                min-width: 0;
                flex: 1;
            }
            .gsn-title {
                margin: 0;
                font-size: 24px;
                line-height: 1.25;
                font-weight: 800;
                color: #0f172a;
                word-break: break-word;
            }
            .gsn-status {
                margin-top: 8px;
                font-size: 13px;
                color: #475569;
            }
            .gsn-export-hint {
                margin-top: 8px;
                font-size: 12px;
                line-height: 1.55;
                color: #64748b;
                max-width: 620px;
            }
            .gsn-header-actions {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
                justify-content: flex-end;
            }
            .gsn-btn {
                border: 0;
                border-radius: 12px;
                padding: 10px 14px;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
            }
            .gsn-btn:hover {
                transform: translateY(-1px);
            }
            .gsn-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
            }
            .gsn-btn-primary {
                background: #1f6fff;
                color: #fff;
                box-shadow: 0 10px 24px rgba(31, 111, 255, 0.2);
            }
            .gsn-btn-secondary {
                background: #e2e8f0;
                color: #0f172a;
            }
            .gsn-btn-ghost {
                background: transparent;
                color: #334155;
                border: 1px solid rgba(148, 163, 184, 0.36);
            }
            .gsn-main {
                flex: 1;
                min-height: 0;
                display: grid;
                grid-template-columns: 312px minmax(0, 1fr);
                background: #f8fafc;
            }
            .gsn-sidebar {
                min-width: 0;
                display: flex;
                flex-direction: column;
                border-right: 1px solid rgba(148, 163, 184, 0.16);
                background: #f1f5f9;
            }
            .gsn-sidebar-head {
                padding: 16px 20px 12px;
                font-size: 12px;
                font-weight: 700;
                color: #475569;
                text-transform: uppercase;
                letter-spacing: 0.08em;
            }
            .gsn-tree {
                flex: 1;
                min-height: 0;
                overflow: auto;
                padding: 0 12px 20px;
            }
            .gsn-tree-item {
                margin-top: 8px;
            }
            .gsn-tree-button {
                width: 100%;
                border: 0;
                border-radius: 16px;
                background: #fff;
                color: #0f172a;
                text-align: left;
                cursor: pointer;
                padding: 12px 14px;
                box-shadow: 0 8px 24px rgba(148, 163, 184, 0.16);
            }
            .gsn-tree-button.is-selected {
                background: #e0ecff;
                box-shadow: 0 12px 26px rgba(31, 111, 255, 0.14);
            }
            .gsn-tree-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .gsn-tree-depth {
                width: 10px;
                height: 10px;
                border-radius: 999px;
                background: #94a3b8;
                flex: none;
            }
            .gsn-tree-title {
                font-size: 13px;
                font-weight: 700;
                line-height: 1.35;
                word-break: break-word;
            }
            .gsn-tree-meta {
                margin-top: 6px;
                font-size: 12px;
                color: #64748b;
                padding-left: 18px;
                word-break: break-word;
            }
            .gsn-content {
                min-width: 0;
                display: flex;
                flex-direction: column;
                min-height: 0;
            }
            .gsn-content-toolbar {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 16px;
                padding: 20px 24px 12px;
            }
            .gsn-content-title {
                margin: 0;
                font-size: 22px;
                line-height: 1.3;
                font-weight: 800;
                color: #0f172a;
                word-break: break-word;
            }
            .gsn-badges {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 10px;
            }
            .gsn-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 10px;
                border-radius: 999px;
                background: #e2e8f0;
                color: #334155;
                font-size: 12px;
                font-weight: 700;
            }
            .gsn-content-actions {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
                justify-content: flex-end;
            }
            .gsn-content-scroll {
                flex: 1;
                min-height: 0;
                overflow: auto;
                padding: 0 24px 24px;
            }
            .gsn-section {
                border: 1px solid rgba(148, 163, 184, 0.2);
                border-radius: 18px;
                background: #fff;
                box-shadow: 0 10px 28px rgba(148, 163, 184, 0.12);
                margin-top: 14px;
                overflow: hidden;
            }
            .gsn-section:first-child {
                margin-top: 0;
            }
            .gsn-section > summary {
                list-style: none;
                cursor: pointer;
                padding: 16px 20px;
                font-size: 15px;
                font-weight: 800;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                color: #0f172a;
            }
            .gsn-section > summary::-webkit-details-marker {
                display: none;
            }
            .gsn-section-summary-left {
                display: inline-flex;
                align-items: center;
                gap: 10px;
                min-width: 0;
            }
            .gsn-section-chevron {
                display: inline-block;
                width: 10px;
                height: 10px;
                border-right: 2px solid #64748b;
                border-bottom: 2px solid #64748b;
                transform: rotate(45deg);
                transition: transform 120ms ease;
                margin-top: -4px;
            }
            .gsn-section[open] .gsn-section-chevron {
                transform: rotate(225deg);
                margin-top: 4px;
            }
            .gsn-section-toolbar {
                display: flex;
                justify-content: flex-end;
                padding: 0 20px 12px;
            }
            .gsn-section-body {
                padding: 0 20px 20px;
                font-size: 14px;
                line-height: 1.72;
                color: #334155;
            }
            .gsn-markdown p,
            .gsn-markdown ul,
            .gsn-markdown ol,
            .gsn-markdown h1,
            .gsn-markdown h2,
            .gsn-markdown h3,
            .gsn-markdown h4,
            .gsn-markdown h5,
            .gsn-markdown h6 {
                margin: 0 0 12px;
            }
            .gsn-markdown ul,
            .gsn-markdown ol {
                padding-left: 22px;
            }
            .gsn-markdown li {
                margin: 0 0 8px;
            }
            .gsn-markdown a {
                color: #1d4ed8;
                text-decoration: none;
            }
            .gsn-markdown a:hover {
                text-decoration: underline;
            }
            .gsn-markdown h1,
            .gsn-markdown h2,
            .gsn-markdown h3,
            .gsn-markdown h4,
            .gsn-markdown h5,
            .gsn-markdown h6 {
                color: #0f172a;
                font-weight: 800;
            }
            .gsn-overview-list {
                display: grid;
                grid-template-columns: 140px 1fr;
                gap: 10px 16px;
                margin: 0;
            }
            .gsn-overview-list dt {
                font-size: 12px;
                color: #64748b;
                font-weight: 700;
            }
            .gsn-overview-list dd {
                margin: 0;
                word-break: break-word;
            }
            .gsn-error {
                margin-top: 12px;
                padding: 12px 14px;
                border-radius: 14px;
                background: #fff1f2;
                color: #9f1239;
                font-size: 13px;
                line-height: 1.6;
            }
            .gsn-empty,
            .gsn-placeholder {
                padding: 24px;
                border-radius: 18px;
                background: rgba(255, 255, 255, 0.72);
                color: #64748b;
                text-align: center;
                font-size: 14px;
                border: 1px dashed rgba(148, 163, 184, 0.28);
            }
            .gsn-toast {
                position: fixed;
                left: 50%;
                bottom: 32px;
                transform: translateX(-50%) translateY(12px);
                background: rgba(15, 23, 42, 0.92);
                color: #fff;
                padding: 12px 18px;
                border-radius: 999px;
                font-size: 13px;
                font-weight: 700;
                opacity: 0;
                pointer-events: none;
                transition: opacity 150ms ease, transform 150ms ease;
                z-index: 2147483647;
            }
            .gsn-toast.is-visible {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            @media (max-width: 920px) {
                .gsn-modal {
                    width: min(100vw, calc(100vw - 20px));
                    height: min(100vh, calc(100vh - 20px));
                    border-radius: 18px;
                }
                .gsn-main {
                    grid-template-columns: 1fr;
                }
                .gsn-sidebar {
                    min-height: 180px;
                    border-right: 0;
                    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
                }
                .gsn-content-toolbar,
                .gsn-header {
                    flex-direction: column;
                    align-items: stretch;
                }
                .gsn-header-actions,
                .gsn-content-actions {
                    justify-content: flex-start;
                }
                #${FLOAT_BUTTON_ID} {
                    right: 16px;
                    bottom: 16px;
                    min-width: 128px;
                    height: 46px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function injectFloatingButton() {
        if (document.getElementById(FLOAT_BUTTON_ID)) {
            return;
        }

        const button = document.createElement('button');
        button.id = FLOAT_BUTTON_ID;
        button.type = 'button';
        button.textContent = '导出 Notion';
        button.addEventListener('click', () => {
            void openExporter();
        });
        document.body.appendChild(button);
    }

    function ensureRoot() {
        if (state.overlay) {
            return;
        }

        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.innerHTML = `
            <div id="${OVERLAY_ID}">
                <div class="gsn-modal" role="dialog" aria-modal="true" aria-label="GET Notion Exporter">
                    <div class="gsn-header">
                        <div class="gsn-title-group">
                            <h1 class="gsn-title">GET Share Note Notion Exporter</h1>
                            <div class="gsn-status">等待抓取</div>
                            <div class="gsn-export-hint">导出会自动压平成 Notion 友好的 H1 / H2 / H3 + bullet 结构。主笔记与根级追加笔记为同级，超过 H3 的层级会自动转为项目符号。</div>
                        </div>
                        <div class="gsn-header-actions">
                            <button type="button" class="gsn-btn gsn-btn-primary" data-action="copy-all">复制全部</button>
                            <button type="button" class="gsn-btn gsn-btn-secondary" data-action="save-md">保存 Markdown</button>
                            <button type="button" class="gsn-btn gsn-btn-ghost" data-action="refresh">刷新</button>
                            <button type="button" class="gsn-btn gsn-btn-ghost" data-action="close">关闭</button>
                        </div>
                    </div>
                    <div class="gsn-main">
                        <aside class="gsn-sidebar">
                            <div class="gsn-sidebar-head">笔记树</div>
                            <div class="gsn-tree"></div>
                        </aside>
                        <section class="gsn-content">
                            <div class="gsn-content-toolbar">
                                <div>
                                    <h2 class="gsn-content-title">尚未抓取数据</h2>
                                    <div class="gsn-badges"></div>
                                </div>
                                <div class="gsn-content-actions">
                                    <button type="button" class="gsn-btn gsn-btn-primary" data-action="copy-current-note">复制当前笔记</button>
                                </div>
                            </div>
                            <div class="gsn-content-scroll"></div>
                        </section>
                    </div>
                </div>
                <div class="gsn-toast" aria-live="polite"></div>
            </div>
        `;

        document.body.appendChild(root);

        state.overlay = root.querySelector(`#${OVERLAY_ID}`);
        state.treePane = root.querySelector('.gsn-tree');
        state.contentPane = root.querySelector('.gsn-content-scroll');
        state.titleEl = root.querySelector('.gsn-content-title');
        state.statusEl = root.querySelector('.gsn-status');

        state.overlay.addEventListener('click', onOverlayClick);
        root.addEventListener('click', onRootClick);
    }

    async function openExporter(options = {}) {
        const shareId = getCurrentShareId();
        if (!shareId) {
            showToast('当前页面不是有效的 GET 分享页。');
            return;
        }

        ensureRoot();
        if (shareId !== state.rootShareId) {
            clearCache();
            state.rootShareId = shareId;
        }

        state.isOpen = true;
        state.overlay.classList.add('is-open');
        document.body.classList.add(BODY_LOCK_CLASS);

        if (options.refresh) {
            clearCache();
            state.rootShareId = shareId;
        }

        if (!state.rootNode) {
            await loadRootTree({ shareId });
        } else {
            render();
        }
    }

    function closeExporter() {
        if (!state.overlay) {
            return;
        }
        state.isOpen = false;
        state.overlay.classList.remove('is-open');
        document.body.classList.remove(BODY_LOCK_CLASS);
    }

    function clearCache() {
        state.rootNode = null;
        state.selectedShareId = '';
        state.noteIndex = new Map();
        state.loadingPromise = null;
        state.isLoading = false;
        setStatus('等待抓取');
    }

    async function loadRootTree({ shareId }) {
        if (state.loadingPromise) {
            await state.loadingPromise;
            return;
        }

        state.isLoading = true;
        setStatus('正在抓取分享页数据…');
        renderLoading();

        state.loadingPromise = (async () => {
            const visited = new Set();
            const rootNode = await fetchNoteTree(shareId, visited, null);
            state.rootNode = rootNode;
            state.noteIndex = buildNoteIndex(rootNode);
            state.selectedShareId = rootNode.shareId;
            setStatus(`已抓取 ${countNotes(rootNode)} 条笔记`);
        })();

        try {
            await state.loadingPromise;
            render();
        } catch (error) {
            console.error(SCRIPT_PREFIX, error);
            setStatus('抓取失败');
            renderError(error);
            showToast(error && error.message ? error.message : '抓取失败');
        } finally {
            state.isLoading = false;
            state.loadingPromise = null;
        }
    }

    async function fetchNoteTree(shareId, visited, fallbackNote) {
        const safeShareId = String(shareId || '').trim();
        if (!safeShareId) {
            throw new Error('缺少 shareId，无法抓取笔记。');
        }
        if (visited.has(safeShareId)) {
            return buildLoopNode(safeShareId, fallbackNote);
        }
        visited.add(safeShareId);

        let normalizedNote;
        try {
            const detailPayload = await fetchDetail(safeShareId);
            const merged = Object.assign({}, fallbackNote || {}, detailPayload.note || {});
            normalizedNote = normalizeNote(merged, safeShareId);
        } catch (error) {
            if (!fallbackNote) {
                throw error;
            }
            normalizedNote = normalizeNote(fallbackNote, safeShareId);
            normalizedNote.errors.push(`详情接口请求失败：${getErrorMessage(error)}`);
        }

        if (shouldFetchTranscript(normalizedNote)) {
            try {
                normalizedNote.transcriptText = await fetchTranscript(safeShareId);
            } catch (error) {
                normalizedNote.transcriptError = `文字记录抓取失败：${getErrorMessage(error)}`;
                normalizedNote.errors.push(normalizedNote.transcriptError);
            }
        }

        let children = [];
        try {
            const childSummaries = await fetchAllChildren(safeShareId);
            for (const childSummary of childSummaries) {
                const childShareId = String(childSummary.share_id || '').trim();
                if (!childShareId) {
                    children.push(buildFailedChildNode(childSummary, '缺少 share_id，无法继续递归抓取。'));
                    continue;
                }
                try {
                    const childNode = await fetchNoteTree(childShareId, visited, childSummary);
                    children.push(childNode);
                } catch (error) {
                    children.push(buildFailedChildNode(childSummary, getErrorMessage(error)));
                }
            }
        } catch (error) {
            normalizedNote.errors.push(`追加笔记抓取失败：${getErrorMessage(error)}`);
        }

        normalizedNote.children = children;
        return normalizedNote;
    }

    async function fetchDetail(shareId) {
        const url = `${API_BASE}/${encodeURIComponent(shareId)}?acode=`;
        const payload = await fetchJson(url);
        if (!payload || !payload.note) {
            throw new Error(`详情接口未返回 note：${shareId}`);
        }
        return payload;
    }

    async function fetchTranscript(shareId) {
        const url = `${API_BASE}/${encodeURIComponent(shareId)}/original`;
        const payload = await fetchJson(url);
        const rawContent = payload && payload.content;
        if (!rawContent) {
            throw new Error('原始转写接口返回为空。');
        }

        const parsed = parseMaybeJson(rawContent);
        if (parsed && Array.isArray(parsed.sentence_list)) {
            const parts = parsed.sentence_list
                .map((item) => normalizeTranscriptSentence(item && item.text))
                .filter(Boolean);
            if (parts.length > 0) {
                return parts.join('\n\n');
            }
        }

        const fallbackText = typeof rawContent === 'string' ? rawContent.trim() : '';
        if (!fallbackText) {
            throw new Error('原始转写结果为空。');
        }
        return fallbackText;
    }

    async function fetchAllChildren(parentShareId) {
        const items = [];
        let sinceId = '';
        let hasMore = true;

        while (hasMore) {
            const url = `${API_BASE}/${encodeURIComponent(parentShareId)}/children?limit=${CHILDREN_PAGE_SIZE}&since_id=${encodeURIComponent(sinceId)}&sort=create_asc`;
            const payload = await fetchJson(url);
            const list = Array.isArray(payload && payload.list) ? payload.list : [];
            items.push(...list);
            hasMore = Boolean(payload && payload.has_more && list.length > 0);
            sinceId = hasMore ? String((list[list.length - 1] && (list[list.length - 1].id || list[list.length - 1].note_id)) || '') : '';
            if (hasMore && !sinceId) {
                hasMore = false;
            }
        }

        return items;
    }

    async function fetchJson(url) {
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'omit',
            headers: {
                Accept: 'application/json, text/plain, */*'
            }
        });

        if (!response.ok) {
            throw new Error(`请求失败 (${response.status})`);
        }

        const payload = await response.json();
        if (payload && payload.h && Number(payload.h.c) !== 0) {
            throw new Error(payload.h.e || '接口返回异常。');
        }

        return payload && payload.c ? payload.c : payload;
    }

    function normalizeNote(rawNote, shareId) {
        const note = rawNote || {};
        const resolvedShareId = String(note.share_id || shareId || '').trim();
        const title = normalizeInlineText(note.title) || `未命名笔记 (${resolvedShareId || 'unknown'})`;
        const sourceUrl = resolvedShareId ? `https://www.biji.com/note/share_note/${resolvedShareId}` : location.href;
        const contentMarkdown = normalizeMarkdown(note.content || note.body_text || '');
        const parsedSections = parseAiSections(contentMarkdown);
        const hasStructuredSections = Boolean(
            parsedSections.summaryMarkdown ||
            parsedSections.chaptersMarkdown ||
            parsedSections.quotesMarkdown ||
            parsedSections.todosMarkdown
        );

        return {
            shareId: resolvedShareId,
            title,
            noteType: String(note.note_type || '').trim(),
            entryType: String(note.entry_type || '').trim(),
            sourceUrl,
            createdAt: String(note.created_at || note.edit_time || '').trim(),
            tags: Array.isArray(note.tags) ? note.tags.map((item) => normalizeInlineText(item && item.name)).filter(Boolean) : [],
            audioUrl: extractAudioUrl(note),
            summaryMarkdown: parsedSections.summaryMarkdown,
            chaptersMarkdown: parsedSections.chaptersMarkdown,
            quotesMarkdown: parsedSections.quotesMarkdown,
            todosMarkdown: parsedSections.todosMarkdown,
            transcriptText: '',
            transcriptError: '',
            bodyMarkdown: hasStructuredSections ? '' : contentMarkdown,
            children: [],
            errors: [],
            exportPath: [],
            noteDepth: 0,
            displayIndex: '',
            isRootLevelNote: false
        };
    }

    function parseAiSections(markdown) {
        if (!markdown) {
            return {
                summaryMarkdown: '',
                chaptersMarkdown: '',
                quotesMarkdown: '',
                todosMarkdown: ''
            };
        }

        const buffers = {
            summary: [],
            chapters: [],
            quotes: [],
            todos: []
        };

        let currentKey = '';
        const lines = markdown.replace(/\r\n/g, '\n').split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (/^#{1,6}\s+/.test(trimmed)) {
                const heading = trimmed.replace(/^#{1,6}\s+/, '').trim();
                if (heading.includes('智能总结')) {
                    currentKey = 'summary';
                    continue;
                }
                if (heading.includes('章节概要') || heading.includes('章节摘要')) {
                    currentKey = 'chapters';
                    continue;
                }
                if (heading.includes('金句精选')) {
                    currentKey = 'quotes';
                    continue;
                }
                if (heading.includes('待办事项')) {
                    currentKey = 'todos';
                    continue;
                }
            }

            if (currentKey) {
                buffers[currentKey].push(line);
            }
        }

        return {
            summaryMarkdown: trimMarkdownBlock(buffers.summary.join('\n')),
            chaptersMarkdown: trimMarkdownBlock(buffers.chapters.join('\n')),
            quotesMarkdown: trimMarkdownBlock(buffers.quotes.join('\n')),
            todosMarkdown: trimMarkdownBlock(buffers.todos.join('\n'))
        };
    }

    function shouldFetchTranscript(note) {
        if (!note) {
            return false;
        }
        if (AUDIO_NOTE_TYPES.has(note.noteType)) {
            return true;
        }
        if (note.audioUrl) {
            return true;
        }
        return /audio/i.test(note.noteType);
    }

    function extractAudioUrl(note) {
        const attachments = Array.isArray(note.attachments) ? note.attachments : [];
        const audioItem = attachments.find((item) => item && item.type === 'audio' && item.url);
        return audioItem && audioItem.url ? String(audioItem.url).trim() : '';
    }

    function buildNoteIndex(rootNode) {
        const index = new Map();

        function walk(node, path) {
            node.exportPath = path.slice();
            node.noteDepth = path.length;
            node.displayIndex = path.join('.');
            node.isRootLevelNote = path.length <= 1;
            index.set(node.shareId, node);
            (node.children || []).forEach((child, childIndex) => {
                walk(child, path.concat(childIndex + 1));
            });
        }

        if (rootNode) {
            walk(rootNode, []);
        }

        return index;
    }

    function render() {
        if (!state.rootNode) {
            renderLoading();
            return;
        }

        if (!state.selectedShareId || !state.noteIndex.has(state.selectedShareId)) {
            state.selectedShareId = state.rootNode.shareId;
        }

        const selectedNote = state.noteIndex.get(state.selectedShareId) || state.rootNode;
        renderTree(state.rootNode);
        renderContent(selectedNote);
    }

    function renderLoading() {
        if (state.treePane) {
            state.treePane.innerHTML = '<div class="gsn-placeholder">正在准备抓取界面…</div>';
        }
        if (state.contentPane) {
            state.titleEl.textContent = '正在抓取…';
            state.contentPane.innerHTML = '<div class="gsn-placeholder">脚本正在从公开接口抓取主笔记、原始转写和追加笔记，请稍候。</div>';
            updateContentBadges([]);
        }
    }

    function renderError(error) {
        if (state.treePane) {
            state.treePane.innerHTML = '<div class="gsn-placeholder">抓取失败</div>';
        }
        if (state.contentPane) {
            state.titleEl.textContent = '抓取失败';
            state.contentPane.innerHTML = `<div class="gsn-error">${escapeHtml(getErrorMessage(error))}</div>`;
            updateContentBadges([]);
        }
    }

    function renderTree(rootNode) {
        const rows = [];

        function walk(node, depth, indexPath) {
            const isSelected = node.shareId === state.selectedShareId;
            const pathLabel = indexPath.length ? `追加笔记 ${node.displayIndex || indexPath.join('.')}` : '主笔记';
            rows.push(`
                <div class="gsn-tree-item">
                    <button type="button" class="gsn-tree-button ${isSelected ? 'is-selected' : ''}" data-action="select-note" data-note-id="${escapeAttribute(node.shareId)}">
                        <div class="gsn-tree-row">
                            <span class="gsn-tree-depth" style="opacity:${Math.max(0.32, 1 - depth * 0.08)}"></span>
                            <span class="gsn-tree-title">${escapeHtml(node.title)}</span>
                        </div>
                        <div class="gsn-tree-meta">${escapeHtml(pathLabel)} · ${escapeHtml(describeTreeMeta(node))}</div>
                    </button>
                </div>
            `);

            (node.children || []).forEach((child, childIndex) => {
                walk(child, depth + 1, indexPath.concat(childIndex + 1));
            });
        }

        walk(rootNode, 0, []);
        state.treePane.innerHTML = rows.join('') || '<div class="gsn-empty">暂无笔记可展示。</div>';
    }

    function renderContent(note) {
        state.titleEl.textContent = note.title;
        updateContentBadges(buildContentBadges(note));

        const sections = buildUiSections(note);
        if (sections.length === 0) {
            state.contentPane.innerHTML = '<div class="gsn-empty">当前笔记没有可展示的内容。</div>';
            return;
        }

        state.contentPane.innerHTML = sections.map((section) => renderSection(note, section)).join('');
    }

    function updateContentBadges(items) {
        const badgeRoot = state.overlay.querySelector('.gsn-badges');
        badgeRoot.innerHTML = items.length
            ? items.map((item) => `<span class="gsn-badge">${escapeHtml(item)}</span>`).join('')
            : '<span class="gsn-badge">未抓取</span>';
    }

    function buildContentBadges(note) {
        const badges = [];
        badges.push(note.noteType || 'unknown');
        if (note.entryType) {
            badges.push(note.entryType);
        }
        if (note.tags.length) {
            badges.push(`${note.tags.length} 个标签`);
        }
        if (note.children.length) {
            badges.push(`${countNotes(note) - 1} 条下级笔记`);
        }
        if (note.audioUrl) {
            badges.push('含音频');
        }
        return badges;
    }

    function getNoteSections(note) {
        const sections = [];

        if (note.summaryMarkdown) {
            sections.push(['summary', note.summaryMarkdown]);
        }
        if (note.chaptersMarkdown) {
            sections.push(['chapters', note.chaptersMarkdown]);
        }
        if (note.quotesMarkdown) {
            sections.push(['quotes', note.quotesMarkdown]);
        }
        if (note.todosMarkdown) {
            sections.push(['todos', note.todosMarkdown]);
        }
        if (note.bodyMarkdown) {
            sections.push(['body', note.bodyMarkdown]);
        }
        if (note.transcriptText || note.transcriptError) {
            sections.push(['transcript', note.transcriptText || note.transcriptError]);
        }

        return sections.map(([key, content]) => ({
            key,
            label: SECTION_LABELS[key],
            content
        }));
    }

    function buildUiSections(note) {
        const sections = [];
        sections.push({
            key: 'overview',
            label: SECTION_LABELS.overview,
            open: true,
            bodyHtml: renderOverviewSection(note),
            copyText: buildMetadataMarkdown(note)
        });

        getNoteSections(note).forEach((section) => {
            const isTranscript = section.key === 'transcript';
            const bodyHtml = isTranscript && note.transcriptError && !note.transcriptText
                ? `<div class="gsn-error">${escapeHtml(note.transcriptError)}</div>`
                : isTranscript
                    ? `<div class="gsn-markdown">${String(section.content || '').split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('')}</div>`
                    : renderMarkdown(section.content);
            sections.push({
                key: section.key,
                label: section.label,
                open: section.key === 'summary',
                bodyHtml,
                copyText: buildSectionCopyText(note, section.key)
            });
        });

        return sections;
    }

    function renderSection(note, section) {
        return `
            <details class="gsn-section" ${section.open ? 'open' : ''}>
                <summary>
                    <span class="gsn-section-summary-left">
                        <span class="gsn-section-chevron"></span>
                        <span>${escapeHtml(section.label)}</span>
                    </span>
                    <span></span>
                </summary>
                <div class="gsn-section-toolbar">
                    <button type="button" class="gsn-btn gsn-btn-ghost" data-action="copy-section" data-note-id="${escapeAttribute(note.shareId)}" data-section-key="${escapeAttribute(section.key)}">复制当前块</button>
                </div>
                <div class="gsn-section-body">${section.bodyHtml}</div>
            </details>
        `;
    }

    function renderOverviewSection(note) {
        const rows = [
            ['标题', note.title],
            ['分享 ID', note.shareId],
            ['来源链接', note.sourceUrl ? `<a href="${escapeAttribute(note.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(note.sourceUrl)}</a>` : ''],
            ['创建时间', note.createdAt],
            ['标签', note.tags.join('、')],
            ['笔记类型', note.noteType || '未知'],
            ['入口类型', note.entryType || '未知'],
            ['音频链接', note.audioUrl ? `<a href="${escapeAttribute(note.audioUrl)}" target="_blank" rel="noopener noreferrer">打开音频</a>` : ''],
            ['下级笔记', String((note.children || []).length)]
        ].filter((item) => item[1]);

        const html = rows.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${value}</dd>`).join('');
        const errorsHtml = note.errors.length ? `<div class="gsn-error">${note.errors.map((item) => escapeHtml(item)).join('<br>')}</div>` : '';
        return `<dl class="gsn-overview-list">${html}</dl>${errorsHtml}`;
    }

    function onOverlayClick(event) {
        if (event.target === state.overlay) {
            closeExporter();
        }
    }

    function onRootClick(event) {
        const actionButton = event.target.closest('[data-action]');
        if (!actionButton) {
            return;
        }

        const action = actionButton.dataset.action;
        if (!action) {
            return;
        }

        event.preventDefault();

        switch (action) {
            case 'close':
                closeExporter();
                break;
            case 'refresh':
                void openExporter({ refresh: true });
                break;
            case 'copy-all':
                void handleCopyAll();
                break;
            case 'save-md':
                handleDownloadMarkdown();
                break;
            case 'select-note':
                handleSelectNote(actionButton.dataset.noteId);
                break;
            case 'copy-current-note':
                void handleCopyCurrentNote();
                break;
            case 'copy-section':
                void handleCopySection(actionButton.dataset.noteId, actionButton.dataset.sectionKey);
                break;
            default:
                break;
        }
    }

    function onWindowKeydown(event) {
        if (event.key === 'Escape' && state.isOpen) {
            closeExporter();
        }
    }

    function handleSelectNote(noteId) {
        if (!noteId || !state.noteIndex.has(noteId)) {
            return;
        }
        state.selectedShareId = noteId;
        render();
    }

    async function handleCopyAll() {
        if (!state.rootNode) {
            showToast('当前还没有可复制的数据。');
            return;
        }
        await copyText(exportTreeMarkdown(state.rootNode));
        showToast('整棵笔记树的 Markdown 已复制。');
    }

    async function handleCopyCurrentNote() {
        const note = state.noteIndex.get(state.selectedShareId);
        if (!note) {
            showToast('当前没有选中的笔记。');
            return;
        }
        await copyText(exportStandaloneNoteMarkdown(note));
        showToast('当前笔记 Markdown 已复制。');
    }

    async function handleCopySection(noteId, sectionKey) {
        const note = state.noteIndex.get(noteId);
        if (!note || !sectionKey) {
            showToast('无法复制当前块。');
            return;
        }
        const text = buildSectionCopyText(note, sectionKey);
        if (!text) {
            showToast('当前块没有可复制内容。');
            return;
        }
        await copyText(text);
        showToast(`${SECTION_LABELS[sectionKey] || '内容'}已复制。`);
    }

    function handleDownloadMarkdown() {
        if (!state.rootNode) {
            showToast('当前还没有可下载的数据。');
            return;
        }
        const markdown = exportTreeMarkdown(state.rootNode);
        const filename = `${sanitizeFilename(state.rootNode.title || 'GET Share Note')}__${state.rootNode.shareId || 'unknown'}.md`;
        downloadTextFile(markdown, filename);
        showToast('Markdown 文件已开始下载。');
    }

    async function copyText(text) {
        const value = String(text || '').trim();
        if (!value) {
            throw new Error('没有可复制的内容。');
        }

        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(value, 'text');
            return;
        }

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(value);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
    }

    function exportTreeMarkdown(rootNote) {
        const lines = [];
        renderExportNote(lines, rootNote, []);
        return finalizeMarkdown(lines);
    }

    function exportStandaloneNoteMarkdown(note) {
        const lines = [];
        renderExportNote(lines, note, [], { standaloneRoot: true });
        return finalizeMarkdown(lines);
    }

    function renderExportNote(lines, note, exportPath, options = {}) {
        const meta = buildExportMeta(exportPath, options);
        const title = buildExportTitle(note, exportPath, options);
        appendExportNoteTitle(lines, meta, title);
        appendExportMetadata(lines, meta, note);
        appendExportSections(lines, meta, note);

        (note.children || []).forEach((child, childIndex) => {
            renderExportNote(lines, child, exportPath.concat(childIndex + 1), options);
        });

        if (meta.titleMode === 'heading') {
            pushBlankLine(lines);
        }
    }

    function appendMetadataLines(lines, note) {
        const metadata = buildMetadataLines(note);
        metadata.forEach((line) => lines.push(line));
        if (metadata.length) {
            lines.push('');
        }
    }

    function appendExportNoteTitle(lines, meta, title) {
        if (meta.titleMode === 'heading') {
            lines.push(makeHeading(meta.titleLevel, title), '');
            return;
        }

        lines.push(makeBulletLine(meta.titleIndent, `**${title}**`));
    }

    function appendExportMetadata(lines, meta, note) {
        const metadata = buildMetadataLines(note).map(stripLeadingListMarker).filter(Boolean);
        if (!metadata.length) {
            return;
        }

        if (meta.titleMode === 'heading') {
            metadata.forEach((item) => lines.push(`- ${item}`));
            pushBlankLine(lines);
            return;
        }

        metadata.forEach((item) => {
            lines.push(makeBulletLine(meta.titleIndent + 1, item));
        });
    }

    function appendExportSections(lines, meta, note) {
        const sections = getNoteSections(note).map((section) => ({
            key: section.key,
            label: section.label,
            content: trimMarkdownBlock(section.content || '')
        })).filter((section) => section.content);

        sections.forEach((section) => {
            if (meta.sectionMode === 'heading') {
                lines.push(makeHeading(meta.sectionLevel, section.label), '');
                const contentLines = buildSectionContentLines(section.content, {
                    mode: 'heading',
                    sectionLevel: meta.sectionLevel
                });
                contentLines.forEach((line) => lines.push(line));
                pushBlankLine(lines);
                return;
            }

            lines.push(makeBulletLine(meta.sectionIndent, `**${section.label}**`));
            const contentLines = buildSectionContentLines(section.content, {
                mode: 'bullet',
                bulletIndent: meta.sectionIndent + 1
            });
            contentLines.forEach((line) => lines.push(line));
        });
    }

    function buildExportMeta(exportPath, options = {}) {
        const path = Array.isArray(exportPath) ? exportPath : [];
        const standaloneRoot = Boolean(options.standaloneRoot && path.length === 0);

        if (standaloneRoot || path.length === 0 || path.length === 1) {
            return {
                titleMode: 'heading',
                titleLevel: 1,
                titleIndent: 0,
                sectionMode: 'heading',
                sectionLevel: 2,
                sectionIndent: 0
            };
        }

        if (path.length === 2) {
            return {
                titleMode: 'heading',
                titleLevel: 2,
                titleIndent: 0,
                sectionMode: 'heading',
                sectionLevel: 3,
                sectionIndent: 0
            };
        }

        if (path.length === 3) {
            return {
                titleMode: 'heading',
                titleLevel: 3,
                titleIndent: 0,
                sectionMode: 'bullet',
                sectionLevel: 0,
                sectionIndent: 0
            };
        }

        return {
            titleMode: 'bullet',
            titleLevel: 0,
            titleIndent: path.length - 4,
            sectionMode: 'bullet',
            sectionLevel: 0,
            sectionIndent: path.length - 3
        };
    }

    function buildExportTitle(note, exportPath, options = {}) {
        const path = Array.isArray(exportPath) ? exportPath : [];
        const standaloneRoot = Boolean(options.standaloneRoot && path.length === 0);
        if (standaloneRoot || path.length === 0) {
            return `主笔记｜${note.title}`;
        }
        return `追加笔记 ${path.join('.')}｜${note.title}`;
    }

    function buildSectionContentLines(content, options) {
        const blocks = tokenizeMarkdownBlocks(content);
        const lines = [];

        blocks.forEach((block) => {
            if (options.mode === 'heading') {
                appendHeadingSectionBlock(lines, block, options.sectionLevel);
                return;
            }
            appendBulletSectionBlock(lines, block, options.bulletIndent);
        });

        return trimTrailingBlankLines(lines);
    }

    function appendHeadingSectionBlock(lines, block, sectionLevel) {
        if (block.type === 'heading') {
            if (sectionLevel < 3) {
                lines.push(makeHeading(sectionLevel + 1, block.text), '');
            } else {
                lines.push(makeBulletLine(0, `**${block.text}**`));
            }
            return;
        }

        if (block.type === 'list') {
            lines.push(makeListLine(block.indentLevel, block.marker, block.text));
            return;
        }

        lines.push(block.text, '');
    }

    function appendBulletSectionBlock(lines, block, bulletIndent) {
        if (block.type === 'heading') {
            lines.push(makeBulletLine(bulletIndent, `**${block.text}**`));
            return;
        }

        if (block.type === 'list') {
            lines.push(makeListLine(bulletIndent + block.indentLevel, block.marker, block.text));
            return;
        }

        lines.push(makeBulletLine(bulletIndent, block.text));
    }

    function tokenizeMarkdownBlocks(markdown) {
        const blocks = [];
        const paragraph = [];
        const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');

        function flushParagraph() {
            if (!paragraph.length) {
                return;
            }
            blocks.push({
                type: 'paragraph',
                text: paragraph.join(' ').replace(/\s+/g, ' ').trim()
            });
            paragraph.length = 0;
        }

        lines.forEach((rawLine) => {
            const line = rawLine.replace(/\t/g, '    ');
            const trimmed = line.trim();

            if (!trimmed) {
                flushParagraph();
                return;
            }

            const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
            if (headingMatch) {
                flushParagraph();
                blocks.push({ type: 'heading', text: headingMatch[1].trim() });
                return;
            }

            const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
            if (listMatch) {
                flushParagraph();
                blocks.push({
                    type: 'list',
                    indentLevel: Math.floor(listMatch[1].length / 2),
                    marker: /^\d+\.$/.test(listMatch[2]) ? '1.' : '-',
                    text: listMatch[3].trim()
                });
                return;
            }

            paragraph.push(trimmed);
        });

        flushParagraph();
        return blocks;
    }

    function buildMetadataMarkdown(note) {
        return buildMetadataLines(note).join('\n');
    }

    function buildMetadataLines(note) {
        const lines = [];
        if (note.sourceUrl) {
            lines.push(`- 来源链接：[打开原页](${note.sourceUrl})`);
        }
        if (note.shareId) {
            lines.push(`- 分享 ID：\`${note.shareId}\``);
        }
        if (note.createdAt) {
            lines.push(`- 创建时间：${note.createdAt}`);
        }
        if (note.tags.length) {
            lines.push(`- 标签：${note.tags.join('、')}`);
        }
        if (note.audioUrl) {
            lines.push(`- 音频链接：[打开音频](${note.audioUrl})`);
        }
        if (note.noteType) {
            lines.push(`- 笔记类型：${note.noteType}`);
        }
        if (note.entryType) {
            lines.push(`- 入口类型：${note.entryType}`);
        }
        return lines;
    }

    function buildSectionCopyText(note, sectionKey) {
        switch (sectionKey) {
            case 'overview':
                return buildMetadataMarkdown(note);
            case 'summary':
                return buildSingleSectionExport(SECTION_LABELS.summary, note.summaryMarkdown);
            case 'chapters':
                return buildSingleSectionExport(SECTION_LABELS.chapters, note.chaptersMarkdown);
            case 'quotes':
                return buildSingleSectionExport(SECTION_LABELS.quotes, note.quotesMarkdown);
            case 'todos':
                return buildSingleSectionExport(SECTION_LABELS.todos, note.todosMarkdown);
            case 'body':
                return buildSingleSectionExport(SECTION_LABELS.body, note.bodyMarkdown);
            case 'transcript':
                return buildSingleSectionExport(SECTION_LABELS.transcript, note.transcriptText || note.transcriptError);
            default:
                return '';
        }
    }

    function buildSingleSectionExport(label, content) {
        const text = trimMarkdownBlock(content || '');
        if (!text) {
            return '';
        }
        const lines = [makeHeading(2, label), ''];
        buildSectionContentLines(text, {
            mode: 'heading',
            sectionLevel: 2
        }).forEach((line) => lines.push(line));
        return finalizeMarkdown(lines);
    }

    function makeHeading(level, label) {
        if (level <= 6) {
            return `${'#'.repeat(Math.max(1, level))} ${label}`;
        }
        return `**${label}**`;
    }

    function makeBulletLine(indentLevel, text) {
        return `${'  '.repeat(Math.max(0, indentLevel))}- ${text}`;
    }

    function makeListLine(indentLevel, marker, text) {
        return `${'  '.repeat(Math.max(0, indentLevel))}${marker} ${text}`;
    }

    function stripLeadingListMarker(line) {
        return String(line || '').replace(/^[-*]\s+/, '').trim();
    }

    function pushBlankLine(lines) {
        if (lines.length && lines[lines.length - 1] !== '') {
            lines.push('');
        }
    }

    function trimTrailingBlankLines(lines) {
        const output = lines.slice();
        while (output.length && output[output.length - 1] === '') {
            output.pop();
        }
        return output;
    }

    function finalizeMarkdown(lines) {
        return lines
            .join('\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function renderMarkdown(markdown) {
        const source = trimMarkdownBlock(markdown || '');
        if (!source) {
            return '<div class="gsn-empty">当前区块为空。</div>';
        }

        const lines = source.split('\n');
        const html = [];
        let paragraph = [];
        let listType = '';

        function flushParagraph() {
            if (!paragraph.length) {
                return;
            }
            html.push(`<p>${paragraph.map((line) => renderInlineMarkdown(line)).join('<br>')}</p>`);
            paragraph = [];
        }

        function closeList() {
            if (!listType) {
                return;
            }
            html.push(`</${listType}>`);
            listType = '';
        }

        for (const rawLine of lines) {
            const line = rawLine.replace(/\t/g, '    ');
            const trimmed = line.trim();

            if (!trimmed) {
                flushParagraph();
                closeList();
                continue;
            }

            const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                flushParagraph();
                closeList();
                const level = Math.min(6, headingMatch[1].length);
                html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
                continue;
            }

            const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
            if (unorderedMatch) {
                flushParagraph();
                if (listType !== 'ul') {
                    closeList();
                    listType = 'ul';
                    html.push('<ul>');
                }
                html.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`);
                continue;
            }

            const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
            if (orderedMatch) {
                flushParagraph();
                if (listType !== 'ol') {
                    closeList();
                    listType = 'ol';
                    html.push('<ol>');
                }
                html.push(`<li>${renderInlineMarkdown(orderedMatch[1])}</li>`);
                continue;
            }

            closeList();
            paragraph.push(trimmed);
        }

        flushParagraph();
        closeList();

        return `<div class="gsn-markdown">${html.join('')}</div>`;
    }

    function renderInlineMarkdown(text) {
        let value = escapeHtml(text);
        value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
            return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
        });
        value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        value = value.replace(/`([^`]+)`/g, '<code>$1</code>');
        return value;
    }

    function buildLoopNode(shareId, fallbackNote) {
        const node = normalizeNote(fallbackNote || { title: `循环引用节点 ${shareId}` }, shareId);
        node.errors.push('检测到递归循环，已跳过继续抓取。');
        return node;
    }

    function buildFailedChildNode(summary, reason) {
        const shareId = String((summary && summary.share_id) || (summary && summary.note_id) || '').trim() || `failed-${Math.random().toString(36).slice(2, 8)}`;
        const node = normalizeNote(summary || { title: '抓取失败的追加笔记' }, shareId);
        node.errors.push(`抓取失败：${reason}`);
        return node;
    }

    function countNotes(node) {
        let total = 1;
        for (const child of node.children || []) {
            total += countNotes(child);
        }
        return total;
    }

    function describeTreeMeta(node) {
        const parts = [];
        if (node.noteType) {
            parts.push(node.noteType);
        }
        if (node.entryType) {
            parts.push(node.entryType);
        }
        if (node.children.length) {
            parts.push(`${node.children.length} 个子项`);
        }
        if (!parts.length) {
            parts.push(node.shareId || 'unknown');
        }
        return parts.join(' · ');
    }

    function setStatus(message) {
        if (state.statusEl) {
            state.statusEl.textContent = message || '';
        }
    }

    function showToast(message) {
        const toast = state.overlay ? state.overlay.querySelector('.gsn-toast') : null;
        if (!toast) {
            console.log(SCRIPT_PREFIX, message);
            return;
        }

        toast.textContent = message;
        toast.classList.add('is-visible');

        if (state.toastTimer) {
            clearTimeout(state.toastTimer);
        }
        state.toastTimer = window.setTimeout(() => {
            toast.classList.remove('is-visible');
        }, 2200);
    }

    function downloadTextFile(content, filename) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function getCurrentShareId() {
        const match = location.pathname.match(/\/note\/share_note\/([^/?#]+)/);
        return match ? String(match[1]).trim() : '';
    }

    function parseMaybeJson(value) {
        if (typeof value !== 'string') {
            return null;
        }
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    }

    function normalizeTranscriptSentence(text) {
        return String(text || '')
            .replace(/\s+\n/g, '\n')
            .replace(/\n+\s+/g, '\n')
            .trim();
    }

    function normalizeMarkdown(text) {
        return trimMarkdownBlock(String(text || '').replace(/\r\n/g, '\n'));
    }

    function trimMarkdownBlock(text) {
        return String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/^\n+|\n+$/g, '')
            .trim();
    }

    function normalizeInlineText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function sanitizeFilename(text) {
        const value = normalizeInlineText(text || 'GET Share Note')
            .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '')
            .slice(0, 100);
        return value || 'GET Share Note';
    }

    function getErrorMessage(error) {
        if (!error) {
            return '未知错误';
        }
        return error.message || String(error);
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttribute(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }
})();
