// ==UserScript==
// @name         GET Share Note Notion Exporter
// @namespace    http://tampermonkey.net/
// @version      0.2.0
// @description  Extract GET share notes into a Notion-friendly workspace with transcripts, AI summaries, sprouts, child notes, copy, and markdown download.
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
    const SPROUTS_PAGE_SIZE = 20;
    const AUDIO_NOTE_TYPES = new Set(['meeting', 'local_audio', 'audio', 'class_audio', 'recorder_card_audio', 'record']);
    const PRIMARY_TABS = {
        transcript: '文字记录',
        aiSummary: '智能总结',
        body: '正文',
        sprouts: '发芽',
        children: '追加笔记'
    };
    const SECONDARY_TABS = {
        transcript: {
            raw: '原文',
            optimized: 'AI智能优化版'
        },
        aiSummary: {
            summary: '智能总结',
            chapters: '章节概要',
            quotes: '金句精选',
            todos: '待办事项'
        }
    };
    const SECTION_LABELS = {
        summary: '智能总结',
        chapters: '章节概要',
        quotes: '金句精选',
        todos: '待办事项'
    };

    const state = {
        rootShareId: '',
        rootNode: null,
        selectedShareId: '',
        noteIndex: new Map(),
        overlay: null,
        treePane: null,
        titleEl: null,
        statusEl: null,
        badgeRoot: null,
        primaryTabsRoot: null,
        secondaryTabsRoot: null,
        workspaceBody: null,
        floatButton: null,
        isOpen: false,
        isLoading: false,
        loadingPromise: null,
        toastTimer: null,
        floatingUpdateScheduled: false,
        routeListenerInstalled: false
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
        ensureRoot();
        injectFloatingButton();
        installRouteListener();
        window.addEventListener('keydown', onWindowKeydown, true);
        window.addEventListener('resize', scheduleFloatingButtonUpdate, { passive: true });
        window.addEventListener('scroll', scheduleFloatingButtonUpdate, true);
        scheduleFloatingButtonUpdate();
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
                transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease, bottom 120ms ease;
            }
            #${FLOAT_BUTTON_ID}:hover {
                transform: translateY(-1px);
                box-shadow: 0 22px 44px rgba(31, 111, 255, 0.34);
            }
            #${FLOAT_BUTTON_ID}.is-hidden {
                opacity: 0;
                pointer-events: none;
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
                width: min(1280px, calc(100vw - 40px));
                height: min(880px, calc(100vh - 40px));
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
                max-width: 760px;
            }
            .gsn-header-actions,
            .gsn-workspace-actions {
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
            .gsn-workspace {
                min-width: 0;
                display: flex;
                flex-direction: column;
                min-height: 0;
            }
            .gsn-workspace-head {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 16px;
                padding: 20px 24px 12px;
            }
            .gsn-workspace-title {
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
            .gsn-workspace-scroll {
                flex: 1;
                min-height: 0;
                overflow: auto;
                padding: 0 24px 24px;
                position: relative;
            }
            .gsn-primary-tabs,
            .gsn-secondary-tabs {
                position: sticky;
                z-index: 3;
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
                background: rgba(248, 250, 252, 0.96);
                backdrop-filter: blur(10px);
            }
            .gsn-primary-tabs {
                top: 0;
                padding: 8px 0 12px;
                border-bottom: 1px solid rgba(148, 163, 184, 0.12);
            }
            .gsn-secondary-tabs {
                top: 56px;
                padding: 12px 0 14px;
                border-bottom: 1px solid rgba(148, 163, 184, 0.12);
            }
            .gsn-tab-btn {
                border: 0;
                border-radius: 999px;
                padding: 10px 14px;
                background: #e2e8f0;
                color: #334155;
                cursor: pointer;
                font-size: 13px;
                font-weight: 700;
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }
            .gsn-tab-btn.is-active {
                background: #0f172a;
                color: #fff;
                box-shadow: 0 12px 24px rgba(15, 23, 42, 0.18);
            }
            .gsn-tab-btn.is-sub {
                padding: 8px 12px;
                font-size: 12px;
            }
            .gsn-tab-count {
                display: inline-flex;
                min-width: 18px;
                height: 18px;
                padding: 0 6px;
                border-radius: 999px;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.22);
                font-size: 11px;
                font-weight: 800;
            }
            .gsn-panel {
                padding-top: 16px;
            }
            .gsn-panel-grid {
                display: grid;
                gap: 16px;
            }
            .gsn-card {
                border: 1px solid rgba(148, 163, 184, 0.2);
                border-radius: 18px;
                background: #fff;
                box-shadow: 0 10px 28px rgba(148, 163, 184, 0.12);
                overflow: hidden;
            }
            .gsn-card-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 16px 18px 12px;
                border-bottom: 1px solid rgba(148, 163, 184, 0.14);
            }
            .gsn-card-title {
                margin: 0;
                font-size: 15px;
                font-weight: 800;
                color: #0f172a;
            }
            .gsn-card-body {
                padding: 16px 18px 18px;
                font-size: 14px;
                line-height: 1.72;
                color: #334155;
            }
            .gsn-shortcut-bar {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
                align-items: center;
                padding: 14px 16px;
                background: #eff6ff;
                border: 1px solid rgba(59, 130, 246, 0.18);
                border-radius: 16px;
                margin-bottom: 16px;
            }
            .gsn-shortcut-title {
                font-size: 12px;
                font-weight: 800;
                color: #1d4ed8;
            }
            .gsn-link-btn {
                border: 0;
                background: rgba(29, 78, 216, 0.1);
                color: #1d4ed8;
                border-radius: 999px;
                padding: 8px 12px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
            }
            .gsn-record-info {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 12px;
                margin-bottom: 16px;
            }
            .gsn-record-info-item {
                padding: 12px 14px;
                border-radius: 14px;
                background: #f8fafc;
                border: 1px solid rgba(148, 163, 184, 0.18);
            }
            .gsn-record-info-key {
                font-size: 12px;
                font-weight: 700;
                color: #64748b;
                margin-bottom: 6px;
            }
            .gsn-record-info-value {
                font-size: 13px;
                font-weight: 700;
                color: #0f172a;
                word-break: break-word;
            }
            .gsn-transcript-list {
                display: grid;
                gap: 12px;
            }
            .gsn-transcript-item {
                display: grid;
                grid-template-columns: 40px minmax(0, 1fr);
                gap: 12px;
                align-items: flex-start;
            }
            .gsn-transcript-avatar {
                width: 40px;
                height: 40px;
                border-radius: 999px;
                background: #dbeafe;
                color: #1d4ed8;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: 800;
            }
            .gsn-transcript-main {
                min-width: 0;
                padding: 12px 14px;
                border-radius: 16px;
                background: #f8fafc;
                border: 1px solid rgba(148, 163, 184, 0.18);
            }
            .gsn-transcript-meta {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
                font-size: 12px;
                color: #64748b;
                font-weight: 700;
                margin-bottom: 8px;
            }
            .gsn-transcript-text {
                font-size: 14px;
                line-height: 1.72;
                color: #0f172a;
                word-break: break-word;
            }
            .gsn-children-list,
            .gsn-sprouts-list {
                display: grid;
                gap: 14px;
            }
            .gsn-child-card,
            .gsn-sprout-card {
                border-radius: 18px;
                border: 1px solid rgba(148, 163, 184, 0.2);
                background: #fff;
                box-shadow: 0 10px 28px rgba(148, 163, 184, 0.12);
                overflow: hidden;
            }
            .gsn-child-main {
                width: 100%;
                border: 0;
                background: transparent;
                text-align: left;
                padding: 16px 18px 12px;
                cursor: pointer;
            }
            .gsn-child-main:hover {
                background: rgba(241, 245, 249, 0.75);
            }
            .gsn-child-title {
                margin: 0;
                font-size: 15px;
                font-weight: 800;
                color: #0f172a;
                line-height: 1.45;
            }
            .gsn-child-meta {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                margin-top: 10px;
            }
            .gsn-child-chip {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                border-radius: 999px;
                background: #eef2ff;
                color: #4338ca;
                padding: 6px 10px;
                font-size: 11px;
                font-weight: 800;
            }
            .gsn-child-preview {
                margin-top: 12px;
                color: #475569;
                font-size: 13px;
                line-height: 1.7;
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }
            .gsn-child-actions {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 12px 18px 16px;
                border-top: 1px solid rgba(148, 163, 184, 0.14);
            }
            .gsn-child-status {
                font-size: 12px;
                color: #64748b;
                font-weight: 700;
            }
            .gsn-inline-link {
                color: #1d4ed8;
                text-decoration: none;
                font-size: 12px;
                font-weight: 700;
            }
            .gsn-inline-link:hover {
                text-decoration: underline;
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
            .gsn-error {
                padding: 12px 14px;
                border-radius: 14px;
                background: #fff1f2;
                color: #9f1239;
                font-size: 13px;
                line-height: 1.6;
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
            .gsn-markdown code {
                padding: 2px 5px;
                border-radius: 6px;
                background: #e2e8f0;
                color: #0f172a;
                font-size: 12px;
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
            @media (max-width: 980px) {
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
                .gsn-header,
                .gsn-workspace-head {
                    flex-direction: column;
                    align-items: stretch;
                }
                .gsn-header-actions,
                .gsn-workspace-actions {
                    justify-content: flex-start;
                }
                #${FLOAT_BUTTON_ID} {
                    right: 16px;
                    bottom: 16px;
                    min-width: 128px;
                    height: 46px;
                }
                .gsn-secondary-tabs {
                    top: 62px;
                }
            }
        `;
        document.head.appendChild(style);
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
                            <div class="gsn-export-hint">工作台会贴近 GET 原网页结构展示：主导航按模块点击跳转，导出会自动压平成 Notion 友好的 H1 / H2 / H3 + bullet 结构。</div>
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
                            <div class="gsn-sidebar-head">工作区导航</div>
                            <div class="gsn-tree"></div>
                        </aside>
                        <section class="gsn-workspace">
                            <div class="gsn-workspace-head">
                                <div>
                                    <h2 class="gsn-workspace-title">尚未抓取数据</h2>
                                    <div class="gsn-badges"></div>
                                </div>
                                <div class="gsn-workspace-actions">
                                    <button type="button" class="gsn-btn gsn-btn-primary" data-action="copy-current-note">复制当前笔记</button>
                                    <button type="button" class="gsn-btn gsn-btn-ghost" data-action="copy-current-module">复制当前模块</button>
                                </div>
                            </div>
                            <div class="gsn-workspace-scroll">
                                <div class="gsn-primary-tabs"></div>
                                <div class="gsn-secondary-tabs"></div>
                                <div class="gsn-panel"></div>
                            </div>
                        </section>
                    </div>
                </div>
                <div class="gsn-toast" aria-live="polite"></div>
            </div>
        `;
        document.body.appendChild(root);

        state.overlay = root.querySelector(`#${OVERLAY_ID}`);
        state.treePane = root.querySelector('.gsn-tree');
        state.titleEl = root.querySelector('.gsn-workspace-title');
        state.statusEl = root.querySelector('.gsn-status');
        state.badgeRoot = root.querySelector('.gsn-badges');
        state.primaryTabsRoot = root.querySelector('.gsn-primary-tabs');
        state.secondaryTabsRoot = root.querySelector('.gsn-secondary-tabs');
        state.workspaceBody = root.querySelector('.gsn-panel');

        state.overlay.addEventListener('click', onOverlayClick);
        root.addEventListener('click', onRootClick);
    }

    function injectFloatingButton() {
        if (state.floatButton && document.body.contains(state.floatButton)) {
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
        state.floatButton = button;
        scheduleFloatingButtonUpdate();
    }

    function installRouteListener() {
        if (state.routeListenerInstalled) {
            return;
        }
        state.routeListenerInstalled = true;

        const eventName = 'gsn-route-change';
        const dispatch = () => window.dispatchEvent(new CustomEvent(eventName));

        const wrapHistoryMethod = (name) => {
            const original = history[name];
            if (typeof original !== 'function' || original.__gsnWrapped) {
                return;
            }
            const wrapped = function () {
                const result = original.apply(this, arguments);
                window.setTimeout(dispatch, 0);
                return result;
            };
            wrapped.__gsnWrapped = true;
            history[name] = wrapped;
        };

        wrapHistoryMethod('pushState');
        wrapHistoryMethod('replaceState');
        window.addEventListener('popstate', dispatch);
        window.addEventListener(eventName, onRouteMaybeChanged);
    }

    function onRouteMaybeChanged() {
        scheduleFloatingButtonUpdate();
        const shareId = getCurrentShareId();
        if (!shareId || shareId === state.rootShareId) {
            return;
        }

        clearCache();
        state.rootShareId = shareId;

        if (state.isOpen) {
            showToast('已切换到新笔记，正在刷新工作台。');
            void openExporter({ refresh: true });
            return;
        }

        showToast('页面已切换到新的 GET 笔记。');
    }

    function scheduleFloatingButtonUpdate() {
        if (state.floatingUpdateScheduled) {
            return;
        }
        state.floatingUpdateScheduled = true;
        window.requestAnimationFrame(() => {
            state.floatingUpdateScheduled = false;
            updateFloatingButtonOffset();
        });
    }

    function updateFloatingButtonOffset() {
        if (!state.floatButton) {
            return;
        }

        if (state.isOpen) {
            state.floatButton.classList.add('is-hidden');
            return;
        }

        state.floatButton.classList.remove('is-hidden');
        let offset = 24 + getBottomObstructionHeight();
        if (window.innerWidth <= 980) {
            offset = Math.max(offset, 16 + getBottomObstructionHeight());
        }
        state.floatButton.style.bottom = `${offset}px`;
    }

    function getBottomObstructionHeight() {
        const button = state.floatButton;
        if (!button) {
            return 0;
        }

        const thresholdY = window.innerHeight - 240;
        const thresholdX = window.innerWidth - 360;
        let obstruction = 0;

        Array.from(document.body.querySelectorAll('*')).forEach((element) => {
            if (element === button || element.closest(`#${ROOT_ID}`)) {
                return;
            }

            const style = window.getComputedStyle(element);
            if (!style || style.display === 'none' || style.visibility === 'hidden') {
                return;
            }
            if (!['fixed', 'sticky'].includes(style.position)) {
                return;
            }

            const rect = element.getBoundingClientRect();
            if (rect.width < 40 || rect.height < 24) {
                return;
            }

            const nearBottom = rect.bottom > thresholdY;
            const affectsRight = rect.right > thresholdX || rect.width > window.innerWidth * 0.45;
            if (!nearBottom || !affectsRight) {
                return;
            }

            obstruction = Math.max(obstruction, Math.max(0, window.innerHeight - rect.top) + 8);
        });

        return obstruction;
    }

    async function openExporter(options = {}) {
        const shareId = getCurrentShareId();
        if (!shareId) {
            showToast('当前页面不是有效的 GET 分享页。');
            return;
        }

        ensureRoot();

        if (options.refresh || shareId !== state.rootShareId) {
            clearCache();
            state.rootShareId = shareId;
        }

        state.isOpen = true;
        state.overlay.classList.add('is-open');
        document.body.classList.add(BODY_LOCK_CLASS);
        scheduleFloatingButtonUpdate();

        if (!state.rootNode) {
            await loadRootWorkspace(shareId);
            return;
        }

        render();
    }

    function closeExporter() {
        if (!state.overlay) {
            return;
        }

        state.isOpen = false;
        state.overlay.classList.remove('is-open');
        document.body.classList.remove(BODY_LOCK_CLASS);
        scheduleFloatingButtonUpdate();
    }

    function clearCache() {
        state.rootNode = null;
        state.selectedShareId = '';
        state.noteIndex = new Map();
        state.loadingPromise = null;
        state.isLoading = false;
        setStatus('等待抓取');
        renderLoading();
    }

    async function loadRootWorkspace(shareId) {
        if (state.loadingPromise) {
            await state.loadingPromise;
            return;
        }

        state.isLoading = true;
        setStatus('正在抓取主笔记工作台…');
        renderLoading();

        state.loadingPromise = (async () => {
            const rootNote = createNoteNode({}, shareId);
            state.rootNode = rootNote;
            await ensureNoteLoaded(rootNote, { deep: false, silent: true });
            rebuildNoteIndex();
            state.selectedShareId = rootNote.shareId;
            setStatus(buildLoadedStatus());
        })();

        try {
            await state.loadingPromise;
            render();
        } catch (error) {
            console.error(SCRIPT_PREFIX, error);
            setStatus('抓取失败');
            renderError(error);
            showToast(getErrorMessage(error));
        } finally {
            state.isLoading = false;
            state.loadingPromise = null;
        }
    }

    async function ensureNoteLoaded(note, options = {}) {
        if (!note) {
            throw new Error('缺少待加载的笔记。');
        }

        if (note._loadingPromise) {
            await note._loadingPromise;
        }

        const cfg = {
            deep: false,
            force: false,
            silent: false,
            ancestorIds: new Set(),
            ...options
        };

        const needsBase = cfg.force || !note._loadedBase;
        const needsDeep = cfg.deep && (cfg.force || !note.childrenHydrated);
        if (!needsBase && !needsDeep) {
            return note;
        }

        note._loadingPromise = (async () => {
            if (needsBase) {
                await hydrateNoteBase(note);
            }

            if (needsDeep) {
                const ancestry = new Set(cfg.ancestorIds || []);
                ancestry.add(note.shareId);
                await hydrateChildrenDeep(note, ancestry, cfg);
            }
        })();

        try {
            await note._loadingPromise;
        } finally {
            note._loadingPromise = null;
        }

        if (!cfg.silent) {
            rebuildNoteIndex();
            setStatus(buildLoadedStatus());
            if (state.isOpen) {
                render();
            }
        }

        return note;
    }

    async function hydrateNoteBase(note) {
        const safeTitle = note.title || note.shareId || '笔记';
        setStatus(`正在抓取：${safeTitle}`);

        let detail = null;
        try {
            detail = await fetchDetail(note.shareId);
            applyNoteRawData(note, detail.note || detail, note.shareId);
        } catch (error) {
            note.errors.push(`详情接口请求失败：${getErrorMessage(error)}`);
            if (!note.shareId) {
                throw error;
            }
        }

        if (shouldFetchTranscript(note)) {
            try {
                const transcript = await fetchTranscript(note.shareId, { optimized: false });
                note.transcripts.rawText = transcript.text;
                note.transcripts.rawEntries = transcript.entries;
                note.transcripts.timelineMoments = transcript.timelineMoments;
                note.transcripts.rawError = '';
                note.transcripts.loadedRaw = true;
            } catch (error) {
                note.transcripts.rawError = `原文抓取失败：${getErrorMessage(error)}`;
            }

            try {
                const optimizedTranscript = await fetchTranscript(note.shareId, { optimized: true });
                note.transcripts.optimizedText = optimizedTranscript.text;
                note.transcripts.optimizedEntries = optimizedTranscript.entries;
                note.transcripts.hasOptimized = optimizedTranscript.hasOptimized || Boolean(optimizedTranscript.text);
                note.transcripts.optimizedError = '';
                note.transcripts.loadedOptimized = true;
            } catch (error) {
                note.transcripts.optimizedError = `AI智能优化版抓取失败：${getErrorMessage(error)}`;
            }
        }

        try {
            const childCountPayload = await fetchChildrenCount(note.shareId);
            note.childCount = Number(childCountPayload.total || 0);
            note.canAppendChildNote = typeof childCountPayload.can_add_child_note === 'boolean'
                ? childCountPayload.can_add_child_note
                : Boolean(childCountPayload.canAppendChildNote);
        } catch (error) {
            note.childrenError = `追加笔记数量抓取失败：${getErrorMessage(error)}`;
        }

        try {
            const childPayload = await fetchChildCards(note.shareId);
            note.childrenError = '';
            note.childCards = Array.isArray(childPayload.list) ? childPayload.list.slice() : [];
            mergeChildPlaceholders(note, note.childCards);
        } catch (error) {
            note.childrenError = `追加笔记抓取失败：${getErrorMessage(error)}`;
        }

        try {
            const sproutPayload = await fetchSprouts(note.shareId);
            note.sprouts.tasks = normalizeSproutTasks(sproutPayload.tasks || sproutPayload.list || []);
            note.sprouts.hasMore = Boolean(sproutPayload.has_more || sproutPayload.hasMore);
            note.sprouts.loaded = true;
            note.sprouts.error = '';
        } catch (error) {
            note.sprouts.tasks = [];
            note.sprouts.hasMore = false;
            note.sprouts.loaded = true;
            note.sprouts.error = `发芽抓取失败：${getErrorMessage(error)}`;
        }

        note.activePrimaryTab = pickDefaultPrimaryTab(note, getAvailablePrimaryTabs(note));
        note.activeSecondaryTabByPrimary = {
            transcript: note.transcripts.optimizedText ? 'optimized' : 'raw',
            aiSummary: pickDefaultAiSecondaryTab(note)
        };
        syncNoteUiState(note);
        note._loadedBase = true;
        note.childrenHydrated = note.children.length === 0;
        if (detail && detail.note && Number(detail.note.child_notes_count || 0) > note.childCount) {
            note.childCount = Number(detail.note.child_notes_count);
        }
    }

    async function hydrateChildrenDeep(note, ancestorIds, options) {
        if (!note.children.length) {
            note.childrenHydrated = true;
            return;
        }

        for (const child of note.children) {
            if (ancestorIds.has(child.shareId)) {
                child.errors.push('检测到递归循环，已跳过继续抓取。');
                continue;
            }

            const nextAncestorIds = new Set(ancestorIds);
            nextAncestorIds.add(child.shareId);
            await ensureNoteLoaded(child, {
                deep: true,
                silent: true,
                ancestorIds: nextAncestorIds,
                force: options.force
            });
        }

        note.childrenHydrated = true;
    }

    async function fetchDetail(shareId) {
        const url = `${API_BASE}/${encodeURIComponent(shareId)}?acode=`;
        const payload = await fetchJson(url);
        if (!payload || !payload.note) {
            throw new Error(`详情接口未返回 note：${shareId}`);
        }
        return payload;
    }

    async function fetchTranscript(shareId, options = {}) {
        const optimized = Boolean(options.optimized);
        const suffix = optimized ? '/original?show_opt_asr=true' : '/original';
        const payload = await fetchJson(`${API_BASE}/${encodeURIComponent(shareId)}${suffix}`);
        const rawContent = payload && payload.content;
        if (!rawContent) {
            throw new Error('转写接口返回为空。');
        }

        const parsed = parseMaybeJson(rawContent);
        const entries = parsed && Array.isArray(parsed.sentence_list)
            ? parsed.sentence_list.map((sentence, index) => normalizeTranscriptEntry(sentence, index)).filter(Boolean)
            : [];
        const text = entries.length
            ? transcriptEntriesToPlainText(entries)
            : String(rawContent || '').trim();

        if (!text) {
            throw new Error('转写内容为空。');
        }

        return {
            text,
            entries,
            hasOptimized: Boolean(payload.has_optimized_asr || payload.optimized_asr_version),
            timelineMoments: Array.isArray(payload.timeline_moments) ? payload.timeline_moments : []
        };
    }

    async function fetchChildrenCount(parentShareId) {
        return fetchJson(`${API_BASE}/${encodeURIComponent(parentShareId)}/children/count`);
    }

    async function fetchChildCards(parentShareId) {
        const url = `${API_BASE}/${encodeURIComponent(parentShareId)}/children?limit=${CHILDREN_PAGE_SIZE}&since_id=&sort=create_asc`;
        return fetchJson(url);
    }

    async function fetchSprouts(shareId) {
        const url = `${API_BASE}/${encodeURIComponent(shareId)}/sprouts?limit=${SPROUTS_PAGE_SIZE}`;
        return fetchJson(url);
    }

    async function fetchJson(url) {
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store',
            headers: {
                Accept: 'application/json, text/plain, */*',
                'x-request-id': String(Date.now() + Math.floor(Math.random() * 1000))
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

    function createNoteNode(rawNote, shareId) {
        const note = {
            shareId: String((rawNote && rawNote.share_id) || shareId || '').trim(),
            title: '',
            noteType: '',
            entryType: '',
            createdAt: '',
            sourceUrl: '',
            tags: [],
            audioUrl: '',
            contentMarkdown: '',
            bodyMarkdown: '',
            summarySections: {
                summary: '',
                chapters: '',
                quotes: '',
                todos: ''
            },
            recordInfo: {
                recordTime: '',
                duration: '',
                participants: '',
                contentType: ''
            },
            transcripts: {
                rawText: '',
                optimizedText: '',
                rawEntries: [],
                optimizedEntries: [],
                timelineMoments: [],
                hasOptimized: false,
                rawError: '',
                optimizedError: '',
                loadedRaw: false,
                loadedOptimized: false
            },
            sprouts: {
                tasks: [],
                hasMore: false,
                loaded: false,
                error: ''
            },
            childCount: null,
            canAppendChildNote: null,
            childCards: [],
            children: [],
            childrenHydrated: false,
            childrenError: '',
            errors: [],
            activePrimaryTab: '',
            activeSecondaryTabByPrimary: {
                transcript: 'optimized',
                aiSummary: 'summary'
            },
            exportPath: [],
            noteDepth: 0,
            displayIndex: '',
            isRootLevelNote: false,
            _loadedBase: false,
            _loadingPromise: null
        };

        applyNoteRawData(note, rawNote || {}, shareId);
        return note;
    }

    function applyNoteRawData(note, rawNote, shareId) {
        const raw = rawNote || {};
        note.shareId = String(raw.share_id || raw.note_id || note.shareId || shareId || '').trim();
        note.title = normalizeInlineText(raw.title) || note.title || `未命名笔记 (${note.shareId || 'unknown'})`;
        note.noteType = String(raw.note_type || note.noteType || '').trim();
        note.entryType = String(raw.entry_type || note.entryType || '').trim();
        note.createdAt = String(raw.created_at || raw.edit_time || note.createdAt || '').trim();
        note.sourceUrl = note.shareId ? `https://www.biji.com/note/share_note/${note.shareId}` : location.href;
        note.tags = normalizeTags(raw.tags || raw.tag_list || note.tags);
        note.audioUrl = extractAudioUrl(raw) || note.audioUrl;
        note.contentMarkdown = normalizeMarkdown(raw.content || raw.body_text || note.contentMarkdown);

        const parsedSections = parseAiSections(note.contentMarkdown);
        note.summarySections = {
            summary: parsedSections.summary,
            chapters: parsedSections.chapters,
            quotes: parsedSections.quotes,
            todos: parsedSections.todos
        };
        note.bodyMarkdown = parsedSections.body || (!hasAiSummaryContent(note) ? note.contentMarkdown : '');
        note.recordInfo = extractRecordInfo(note.summarySections.summary);
        syncNoteUiState(note);
        return note;
    }

    function normalizeTags(source) {
        if (!Array.isArray(source)) {
            return [];
        }
        return source
            .map((item) => normalizeInlineText(
                (item && item.name) ||
                (item && item.tag_name) ||
                (item && item.title) ||
                item
            ))
            .filter(Boolean);
    }

    function extractAudioUrl(note) {
        const attachments = Array.isArray(note && note.attachments) ? note.attachments : [];
        const audioItem = attachments.find((item) => {
            const type = String((item && item.type) || (item && item.file_type) || '').toLowerCase();
            return type.includes('audio') || type.includes('voice');
        });

        if (!audioItem) {
            return '';
        }

        return String(audioItem.url || audioItem.file_url || audioItem.resource_url || '').trim();
    }

    function parseAiSections(markdown) {
        const result = {
            summary: '',
            chapters: '',
            quotes: '',
            todos: '',
            body: ''
        };

        const source = normalizeMarkdown(markdown);
        if (!source) {
            return result;
        }

        const buffers = {
            summary: [],
            chapters: [],
            quotes: [],
            todos: [],
            body: []
        };
        let currentKey = 'body';
        const lines = source.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
            if (headingMatch) {
                const heading = headingMatch[1].trim();
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

            buffers[currentKey].push(line);
        }

        result.summary = trimMarkdownBlock(buffers.summary.join('\n'));
        result.chapters = trimMarkdownBlock(buffers.chapters.join('\n'));
        result.quotes = trimMarkdownBlock(buffers.quotes.join('\n'));
        result.todos = trimMarkdownBlock(buffers.todos.join('\n'));
        result.body = trimMarkdownBlock(buffers.body.join('\n'));
        return result;
    }

    function extractRecordInfo(summaryMarkdown) {
        const info = {
            recordTime: '',
            duration: '',
            participants: '',
            contentType: ''
        };

        const source = String(summaryMarkdown || '');
        const mappings = [
            ['recordTime', /(?:录音时间|记录时间)[：:]\s*(.+)/],
            ['duration', /(?:时长|录音时长)[：:]\s*(.+)/],
            ['participants', /(?:参与人数|参会人数|人数)[：:]\s*(.+)/],
            ['contentType', /(?:内容类型|主题类型)[：:]\s*(.+)/]
        ];

        mappings.forEach(([key, pattern]) => {
            const match = source.match(pattern);
            if (match) {
                info[key] = normalizeInlineText(match[1]);
            }
        });

        return info;
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
        return /audio|meeting|record/i.test(note.noteType);
    }

    function normalizeTranscriptEntry(rawEntry, index) {
        if (!rawEntry || !rawEntry.text) {
            return null;
        }

        const speakerNumber = Number(rawEntry.speaker_id || rawEntry.speaker || 1) || 1;
        return {
            id: String(rawEntry.id || `${speakerNumber}-${rawEntry.start_time || index}`),
            speakerId: speakerNumber,
            speakerLabel: `说话人${speakerNumber}`,
            speakerShort: `S${speakerNumber}`,
            timeLabel: formatMsToClock(rawEntry.start_time || 0),
            startTime: Number(rawEntry.start_time || 0),
            endTime: Number(rawEntry.end_time || 0),
            text: normalizeTranscriptSentence(rawEntry.text)
        };
    }

    function transcriptEntriesToPlainText(entries) {
        return entries
            .map((entry) => `[${entry.timeLabel}] ${entry.speakerLabel}\n${entry.text}`)
            .join('\n\n');
    }

    function normalizeSproutTasks(tasks) {
        if (!Array.isArray(tasks)) {
            return [];
        }

        return tasks.map((task, index) => {
            const title = normalizeInlineText(
                task.title ||
                task.note_title ||
                task.label ||
                task.name ||
                ''
            ) || `发芽内容 ${index + 1}`;

            const content = normalizeInlineText(
                task.content ||
                task.text ||
                task.summary ||
                task.desc ||
                task.description ||
                task.mark_content ||
                task.quicknote ||
                task.body_text ||
                ''
            );

            const timeText = normalizeInlineText(
                task.time_text ||
                task.created_at ||
                task.date_str ||
                task.updated_at ||
                ''
            );

            return {
                id: String(task.id || task.task_id || `${index + 1}`),
                title,
                content,
                timeText,
                raw: task
            };
        });
    }

    function mergeChildPlaceholders(note, childSummaries) {
        const existing = new Map((note.children || []).map((child) => [child.shareId, child]));
        const nextChildren = [];

        childSummaries.forEach((summary) => {
            const shareId = String((summary && summary.share_id) || (summary && summary.note_id) || '').trim();
            if (!shareId) {
                return;
            }

            const child = existing.get(shareId) || createNoteNode(summary, shareId);
            applyNoteRawData(child, summary, shareId);
            nextChildren.push(child);
        });

        note.children = nextChildren;
        note.childrenHydrated = nextChildren.length === 0;
    }

    function rebuildNoteIndex() {
        const nextIndex = new Map();

        function walk(node, path) {
            node.exportPath = path.slice();
            node.noteDepth = path.length;
            node.displayIndex = path.join('.');
            node.isRootLevelNote = path.length <= 1;
            nextIndex.set(node.shareId, node);
            (node.children || []).forEach((child, index) => {
                walk(child, path.concat(index + 1));
            });
        }

        if (state.rootNode) {
            walk(state.rootNode, []);
        }

        state.noteIndex = nextIndex;
    }

    function buildLoadedStatus() {
        if (!state.rootNode) {
            return '等待抓取';
        }

        const loaded = countLoadedNotes(state.rootNode);
        const known = countKnownNotes(state.rootNode);
        return `已抓取 ${loaded} / ${known} 条笔记`;
    }

    function countLoadedNotes(node) {
        let total = node && node._loadedBase ? 1 : 0;
        for (const child of (node && node.children) || []) {
            total += countLoadedNotes(child);
        }
        return total;
    }

    function countKnownNotes(node) {
        let total = node ? 1 : 0;
        for (const child of (node && node.children) || []) {
            total += countKnownNotes(child);
        }
        return total;
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
        renderWorkspace(selectedNote);
    }

    function renderLoading() {
        if (state.treePane) {
            state.treePane.innerHTML = '<div class="gsn-placeholder">正在准备抓取界面…</div>';
        }
        if (state.titleEl) {
            state.titleEl.textContent = '正在抓取…';
        }
        if (state.badgeRoot) {
            state.badgeRoot.innerHTML = '<span class="gsn-badge">工作台初始化中</span>';
        }
        if (state.primaryTabsRoot) {
            state.primaryTabsRoot.innerHTML = '';
        }
        if (state.secondaryTabsRoot) {
            state.secondaryTabsRoot.innerHTML = '';
        }
        if (state.workspaceBody) {
            state.workspaceBody.innerHTML = '<div class="gsn-placeholder">脚本正在从公开接口抓取主笔记、双版本转写、发芽和追加笔记摘要，请稍候。</div>';
        }
    }

    function renderError(error) {
        if (state.treePane) {
            state.treePane.innerHTML = '<div class="gsn-placeholder">抓取失败</div>';
        }
        if (state.titleEl) {
            state.titleEl.textContent = '抓取失败';
        }
        if (state.badgeRoot) {
            state.badgeRoot.innerHTML = '<span class="gsn-badge">错误</span>';
        }
        if (state.primaryTabsRoot) {
            state.primaryTabsRoot.innerHTML = '';
        }
        if (state.secondaryTabsRoot) {
            state.secondaryTabsRoot.innerHTML = '';
        }
        if (state.workspaceBody) {
            state.workspaceBody.innerHTML = `<div class="gsn-error">${escapeHtml(getErrorMessage(error))}</div>`;
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

    function renderWorkspace(note) {
        syncNoteUiState(note);
        state.titleEl.textContent = note.title;
        state.badgeRoot.innerHTML = buildWorkspaceBadges(note)
            .map((item) => `<span class="gsn-badge">${escapeHtml(item)}</span>`)
            .join('');

        const primaryTabs = getAvailablePrimaryTabs(note);
        const primaryHtml = primaryTabs.map((tabKey) => {
            const isActive = tabKey === note.activePrimaryTab;
            const countHtml = tabKey === 'children'
                ? `<span class="gsn-tab-count">${escapeHtml(String(getChildCountForUi(note)))}</span>`
                : '';
            return `
                <button type="button" class="gsn-tab-btn ${isActive ? 'is-active' : ''}" data-action="select-primary" data-tab-key="${escapeAttribute(tabKey)}">
                    <span>${escapeHtml(PRIMARY_TABS[tabKey])}</span>
                    ${countHtml}
                </button>
            `;
        }).join('');
        state.primaryTabsRoot.innerHTML = primaryHtml;

        const secondaryTabs = getSecondaryTabs(note, note.activePrimaryTab);
        state.secondaryTabsRoot.innerHTML = secondaryTabs.length
            ? secondaryTabs.map((tabKey) => {
                const isActive = tabKey === getActiveSecondaryTab(note, note.activePrimaryTab);
                const label = SECONDARY_TABS[note.activePrimaryTab][tabKey];
                return `
                    <button type="button" class="gsn-tab-btn is-sub ${isActive ? 'is-active' : ''}" data-action="select-secondary" data-tab-key="${escapeAttribute(tabKey)}">
                        ${escapeHtml(label)}
                    </button>
                `;
            }).join('')
            : '';

        state.workspaceBody.innerHTML = renderWorkspacePanel(note);
    }

    function buildWorkspaceBadges(note) {
        const badges = [];
        if (note.noteType) {
            badges.push(note.noteType);
        }
        if (note.entryType) {
            badges.push(note.entryType);
        }
        if (note.tags.length) {
            badges.push(`${note.tags.length} 个标签`);
        }
        if (note.transcripts.rawText) {
            badges.push('原文');
        }
        if (note.transcripts.optimizedText) {
            badges.push('AI优化版');
        }
        if (note.sprouts.loaded) {
            badges.push(`发芽 ${note.sprouts.tasks.length}`);
        }
        badges.push(`追加笔记 ${getChildCountForUi(note)}`);
        return badges;
    }

    function getAvailablePrimaryTabs(note) {
        const tabs = [];
        const hasTranscriptTab = shouldFetchTranscript(note) || note.transcripts.rawText || note.transcripts.optimizedText || note.transcripts.rawError || note.transcripts.optimizedError;
        if (hasTranscriptTab) {
            tabs.push('transcript');
        }

        if (hasAiSummaryContent(note)) {
            tabs.push('aiSummary');
        } else if (note.bodyMarkdown) {
            tabs.push('body');
        }

        tabs.push('sprouts');
        tabs.push('children');
        return tabs;
    }

    function hasAiSummaryContent(note) {
        return Boolean(
            note.summarySections.summary ||
            note.summarySections.chapters ||
            note.summarySections.quotes ||
            note.summarySections.todos
        );
    }

    function getSecondaryTabs(note, primaryTab) {
        if (primaryTab === 'transcript') {
            return ['raw', 'optimized'];
        }
        if (primaryTab === 'aiSummary') {
            return ['summary', 'chapters', 'quotes', 'todos'];
        }
        return [];
    }

    function syncNoteUiState(note) {
        const primaryTabs = getAvailablePrimaryTabs(note);
        if (!primaryTabs.includes(note.activePrimaryTab)) {
            note.activePrimaryTab = pickDefaultPrimaryTab(note, primaryTabs);
        }

        if (!note.activeSecondaryTabByPrimary) {
            note.activeSecondaryTabByPrimary = {};
        }

        const transcriptSecondaryTabs = getSecondaryTabs(note, 'transcript');
        if (transcriptSecondaryTabs.length) {
            if (!transcriptSecondaryTabs.includes(note.activeSecondaryTabByPrimary.transcript)) {
                note.activeSecondaryTabByPrimary.transcript = note.transcripts.optimizedText ? 'optimized' : 'raw';
            }
        }

        const aiSecondaryTabs = getSecondaryTabs(note, 'aiSummary');
        if (aiSecondaryTabs.length) {
            const preferred = pickDefaultAiSecondaryTab(note);
            if (!aiSecondaryTabs.includes(note.activeSecondaryTabByPrimary.aiSummary)) {
                note.activeSecondaryTabByPrimary.aiSummary = preferred;
            }
        }
    }

    function pickDefaultPrimaryTab(note, primaryTabs) {
        if (primaryTabs.includes('transcript')) {
            return 'transcript';
        }
        if (primaryTabs.includes('aiSummary')) {
            return 'aiSummary';
        }
        if (primaryTabs.includes('body')) {
            return 'body';
        }
        return primaryTabs[0] || 'children';
    }

    function pickDefaultAiSecondaryTab(note) {
        if (note.summarySections.summary) {
            return 'summary';
        }
        if (note.summarySections.chapters) {
            return 'chapters';
        }
        if (note.summarySections.quotes) {
            return 'quotes';
        }
        if (note.summarySections.todos) {
            return 'todos';
        }
        return 'summary';
    }

    function getActiveSecondaryTab(note, primaryTab) {
        if (primaryTab === 'transcript') {
            return note.activeSecondaryTabByPrimary.transcript || (note.transcripts.optimizedText ? 'optimized' : 'raw');
        }
        if (primaryTab === 'aiSummary') {
            return note.activeSecondaryTabByPrimary.aiSummary || pickDefaultAiSecondaryTab(note);
        }
        return '';
    }

    function renderWorkspacePanel(note) {
        switch (note.activePrimaryTab) {
            case 'transcript':
                return renderTranscriptPanel(note, getActiveSecondaryTab(note, 'transcript'));
            case 'aiSummary':
                return renderAiSummaryPanel(note, getActiveSecondaryTab(note, 'aiSummary'));
            case 'body':
                return renderBodyPanel(note);
            case 'sprouts':
                return renderSproutsPanel(note);
            case 'children':
                return renderChildrenPanel(note);
            default:
                return '<div class="gsn-empty">当前模块暂无可展示内容。</div>';
        }
    }

    function renderTranscriptPanel(note, secondaryTab) {
        const isOptimized = secondaryTab === 'optimized';
        const currentLabel = isOptimized ? SECONDARY_TABS.transcript.optimized : SECONDARY_TABS.transcript.raw;
        const entries = isOptimized ? note.transcripts.optimizedEntries : note.transcripts.rawEntries;
        const text = isOptimized ? note.transcripts.optimizedText : note.transcripts.rawText;
        const error = isOptimized ? note.transcripts.optimizedError : note.transcripts.rawError;

        let bodyHtml = '';
        if (error && !text) {
            bodyHtml = `<div class="gsn-error">${escapeHtml(error)}</div>`;
        } else if (entries.length) {
            bodyHtml = `
                <div class="gsn-transcript-list">
                    ${entries.map((entry) => `
                        <div class="gsn-transcript-item">
                            <div class="gsn-transcript-avatar">${escapeHtml(entry.speakerShort)}</div>
                            <div class="gsn-transcript-main">
                                <div class="gsn-transcript-meta">
                                    <span>${escapeHtml(entry.speakerLabel)}</span>
                                    <span>${escapeHtml(entry.timeLabel)}</span>
                                </div>
                                <div class="gsn-transcript-text">${escapeHtml(entry.text).replace(/\n/g, '<br>')}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (text) {
            bodyHtml = `<div class="gsn-markdown">${String(text).split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
        } else if (isOptimized) {
            bodyHtml = '<div class="gsn-empty">暂无 AI 智能优化版。</div>';
        } else {
            bodyHtml = '<div class="gsn-empty">暂无文字记录。</div>';
        }

        return `
            <div class="gsn-panel-grid">
                <div class="gsn-shortcut-bar">
                    <span class="gsn-shortcut-title">相关内容快捷跳转</span>
                    <button type="button" class="gsn-link-btn" data-action="select-primary" data-tab-key="aiSummary">跳到智能总结</button>
                    <span class="gsn-child-status">当前查看：${escapeHtml(currentLabel)}</span>
                </div>
                ${renderRecordInfoCard(note)}
                <div class="gsn-card">
                    <div class="gsn-card-head">
                        <h3 class="gsn-card-title">${escapeHtml(currentLabel)}</h3>
                    </div>
                    <div class="gsn-card-body">${bodyHtml}</div>
                </div>
            </div>
        `;
    }

    function renderAiSummaryPanel(note, secondaryTab) {
        const content = trimMarkdownBlock(note.summarySections[secondaryTab] || '');
        const label = SECONDARY_TABS.aiSummary[secondaryTab];
        const bodyHtml = content
            ? renderMarkdown(content)
            : '<div class="gsn-empty">当前模块暂无内容。</div>';

        return `
            <div class="gsn-panel-grid">
                ${renderRecordInfoCard(note)}
                <div class="gsn-card">
                    <div class="gsn-card-head">
                        <h3 class="gsn-card-title">${escapeHtml(label)}</h3>
                    </div>
                    <div class="gsn-card-body">${bodyHtml}</div>
                </div>
            </div>
        `;
    }

    function renderBodyPanel(note) {
        return `
            <div class="gsn-panel-grid">
                <div class="gsn-card">
                    <div class="gsn-card-head">
                        <h3 class="gsn-card-title">正文</h3>
                    </div>
                    <div class="gsn-card-body">${note.bodyMarkdown ? renderMarkdown(note.bodyMarkdown) : '<div class="gsn-empty">当前笔记暂无正文。</div>'}</div>
                </div>
            </div>
        `;
    }

    function renderSproutsPanel(note) {
        if (note.sprouts.error) {
            return `<div class="gsn-error">${escapeHtml(note.sprouts.error)}</div>`;
        }

        if (!note.sprouts.tasks.length) {
            return '<div class="gsn-empty">暂无发芽内容</div>';
        }

        return `
            <div class="gsn-sprouts-list">
                ${note.sprouts.tasks.map((task) => `
                    <div class="gsn-sprout-card">
                        <div class="gsn-card-head">
                            <h3 class="gsn-card-title">${escapeHtml(task.title)}</h3>
                            <span class="gsn-child-status">${escapeHtml(task.timeText || '')}</span>
                        </div>
                        <div class="gsn-card-body">
                            ${task.content ? `<div class="gsn-markdown"><p>${escapeHtml(task.content)}</p></div>` : '<div class="gsn-empty">该发芽项暂无可展示正文。</div>'}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderChildrenPanel(note) {
        if (note.childrenError && !note.children.length) {
            return `<div class="gsn-error">${escapeHtml(note.childrenError)}</div>`;
        }

        if (!note.children.length) {
            return '<div class="gsn-empty">暂无追加笔记</div>';
        }

        return `
            <div class="gsn-children-list">
                ${note.children.map((child) => renderChildCard(child)).join('')}
            </div>
        `;
    }

    function renderChildCard(child) {
        const chips = buildChildCardChips(child);
        const preview = buildChildCardPreview(child);
        const statusText = child._loadedBase ? '已加载完整工作台' : '点击查看完整内容';
        return `
            <div class="gsn-child-card">
                <button type="button" class="gsn-child-main" data-action="open-child" data-note-id="${escapeAttribute(child.shareId)}">
                    <h3 class="gsn-child-title">${escapeHtml(child.title)}</h3>
                    <div class="gsn-child-meta">
                        ${chips.map((chip) => `<span class="gsn-child-chip">${escapeHtml(chip)}</span>`).join('')}
                    </div>
                    <div class="gsn-child-preview">${escapeHtml(preview)}</div>
                </button>
                <div class="gsn-child-actions">
                    <span class="gsn-child-status">${escapeHtml(statusText)}</span>
                    <a class="gsn-inline-link" href="${escapeAttribute(child.sourceUrl)}" target="_blank" rel="noopener noreferrer">打开原页</a>
                </div>
            </div>
        `;
    }

    function buildChildCardChips(note) {
        const chips = [];
        if (note.recordInfo.duration) {
            chips.push(note.recordInfo.duration);
        }
        if (note.recordInfo.participants) {
            chips.push(note.recordInfo.participants);
        }
        if (note.recordInfo.contentType) {
            chips.push(note.recordInfo.contentType);
        }
        if (!chips.length && note.createdAt) {
            chips.push(note.createdAt);
        }
        if (!chips.length && note.noteType) {
            chips.push(note.noteType);
        }
        return chips.slice(0, 4);
    }

    function buildChildCardPreview(note) {
        const candidate = note.summarySections.summary || note.bodyMarkdown || note.contentMarkdown || '';
        return normalizeInlineText(candidate).slice(0, 180) || '暂无摘要，点击查看完整内容。';
    }

    function renderRecordInfoCard(note) {
        const rows = [
            ['录音时间', note.recordInfo.recordTime],
            ['时长', note.recordInfo.duration],
            ['参与人数', note.recordInfo.participants],
            ['内容类型', note.recordInfo.contentType]
        ].filter((item) => item[1]);

        if (!rows.length) {
            return '';
        }

        return `
            <div class="gsn-card">
                <div class="gsn-card-head">
                    <h3 class="gsn-card-title">录音信息</h3>
                </div>
                <div class="gsn-card-body">
                    <div class="gsn-record-info">
                        ${rows.map(([key, value]) => `
                            <div class="gsn-record-info-item">
                                <div class="gsn-record-info-key">${escapeHtml(key)}</div>
                                <div class="gsn-record-info-value">${escapeHtml(value)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    function onOverlayClick(event) {
        if (event.target === state.overlay) {
            closeExporter();
        }
    }

    function onWindowKeydown(event) {
        if (event.key === 'Escape' && state.isOpen) {
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
                void handleDownloadMarkdown();
                break;
            case 'select-note':
            case 'open-child':
                void handleSelectNote(actionButton.dataset.noteId);
                break;
            case 'select-primary':
                handleSelectPrimaryTab(actionButton.dataset.tabKey);
                break;
            case 'select-secondary':
                handleSelectSecondaryTab(actionButton.dataset.tabKey);
                break;
            case 'copy-current-note':
                void handleCopyCurrentNote();
                break;
            case 'copy-current-module':
                void handleCopyCurrentModule();
                break;
            default:
                break;
        }
    }

    async function handleSelectNote(noteId) {
        if (!noteId || !state.noteIndex.has(noteId)) {
            return;
        }

        state.selectedShareId = noteId;
        render();

        const note = state.noteIndex.get(noteId);
        if (!note._loadedBase) {
            setStatus(`正在加载：${note.title}`);
            try {
                await ensureNoteLoaded(note, { deep: false, silent: true });
                rebuildNoteIndex();
                setStatus(buildLoadedStatus());
                render();
            } catch (error) {
                setStatus(buildLoadedStatus());
                render();
                showToast(getErrorMessage(error));
            }
        }
    }

    function handleSelectPrimaryTab(tabKey) {
        const note = state.noteIndex.get(state.selectedShareId);
        if (!note || !tabKey) {
            return;
        }

        note.activePrimaryTab = tabKey;
        syncNoteUiState(note);
        render();
    }

    function handleSelectSecondaryTab(tabKey) {
        const note = state.noteIndex.get(state.selectedShareId);
        if (!note || !tabKey) {
            return;
        }

        if (note.activePrimaryTab === 'transcript') {
            note.activeSecondaryTabByPrimary.transcript = tabKey;
        } else if (note.activePrimaryTab === 'aiSummary') {
            note.activeSecondaryTabByPrimary.aiSummary = tabKey;
        }

        render();
    }

    async function handleCopyAll() {
        if (!state.rootNode) {
            showToast('当前还没有可复制的数据。');
            return;
        }

        setStatus('正在补齐整棵笔记树…');
        await ensureNoteLoaded(state.rootNode, { deep: true, silent: true });
        rebuildNoteIndex();
        await copyText(exportTreeMarkdown(state.rootNode));
        setStatus(buildLoadedStatus());
        showToast('整棵笔记树的 Markdown 已复制。');
    }

    async function handleCopyCurrentNote() {
        const note = state.noteIndex.get(state.selectedShareId);
        if (!note) {
            showToast('当前没有选中的笔记。');
            return;
        }

        setStatus(`正在补齐当前笔记：${note.title}`);
        await ensureNoteLoaded(note, { deep: true, silent: true });
        rebuildNoteIndex();
        await copyText(exportStandaloneNoteMarkdown(note));
        setStatus(buildLoadedStatus());
        showToast('当前笔记 Markdown 已复制。');
    }

    async function handleCopyCurrentModule() {
        const note = state.noteIndex.get(state.selectedShareId);
        if (!note) {
            showToast('当前没有选中的笔记。');
            return;
        }

        if (!note._loadedBase) {
            await ensureNoteLoaded(note, { deep: false, silent: true });
            rebuildNoteIndex();
        }

        const text = buildCurrentModuleCopyText(note);
        if (!text) {
            showToast('当前模块没有可复制内容。');
            return;
        }

        await copyText(text);
        showToast('当前模块已复制。');
    }

    async function handleDownloadMarkdown() {
        if (!state.rootNode) {
            showToast('当前还没有可下载的数据。');
            return;
        }

        setStatus('正在补齐整棵笔记树…');
        await ensureNoteLoaded(state.rootNode, { deep: true, silent: true });
        rebuildNoteIndex();
        const markdown = exportTreeMarkdown(state.rootNode);
        const filename = `${sanitizeFilename(state.rootNode.title || 'GET Share Note')}__${state.rootNode.shareId || 'unknown'}.md`;
        downloadTextFile(markdown, filename);
        setStatus(buildLoadedStatus());
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
        appendExportGroups(lines, meta, buildExportGroups(note));

        (note.children || []).forEach((child, childIndex) => {
            renderExportNote(lines, child, exportPath.concat(childIndex + 1), options);
        });

        if (meta.titleMode === 'heading') {
            pushBlankLine(lines);
        }
    }

    function buildExportMeta(exportPath, options = {}) {
        const path = Array.isArray(exportPath) ? exportPath : [];
        const standaloneRoot = Boolean(options.standaloneRoot && path.length === 0);

        if (standaloneRoot || path.length === 0 || path.length === 1) {
            return {
                titleMode: 'heading',
                titleLevel: 1,
                titleIndent: 0,
                groupMode: 'heading',
                groupLevel: 2,
                groupIndent: 0,
                subMode: 'heading',
                subLevel: 3,
                subIndent: 0
            };
        }

        if (path.length === 2) {
            return {
                titleMode: 'heading',
                titleLevel: 2,
                titleIndent: 0,
                groupMode: 'heading',
                groupLevel: 3,
                groupIndent: 0,
                subMode: 'bullet',
                subLevel: 0,
                subIndent: 1
            };
        }

        if (path.length === 3) {
            return {
                titleMode: 'heading',
                titleLevel: 3,
                titleIndent: 0,
                groupMode: 'bullet',
                groupLevel: 0,
                groupIndent: 0,
                subMode: 'bullet',
                subLevel: 0,
                subIndent: 1
            };
        }

        return {
            titleMode: 'bullet',
            titleLevel: 0,
            titleIndent: path.length - 4,
            groupMode: 'bullet',
            groupLevel: 0,
            groupIndent: path.length - 3,
            subMode: 'bullet',
            subLevel: 0,
            subIndent: path.length - 2
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

        metadata.forEach((item) => lines.push(makeBulletLine(meta.titleIndent + 1, item)));
    }

    function appendExportGroups(lines, meta, groups) {
        groups.forEach((group) => {
            appendExportGroupHeading(lines, meta, group.label);

            if (group.subSections && group.subSections.length) {
                group.subSections.forEach((subSection) => appendExportSubSection(lines, meta, subSection.label, subSection.content));
            } else {
                appendExportGroupContent(lines, group.content || '', meta.groupMode === 'heading'
                    ? { mode: 'heading', sectionLevel: meta.groupLevel }
                    : { mode: 'bullet', bulletIndent: meta.groupIndent + 1 });
            }

            pushBlankLine(lines);
        });
    }

    function appendExportGroupHeading(lines, meta, label) {
        if (meta.groupMode === 'heading') {
            lines.push(makeHeading(meta.groupLevel, label), '');
            return;
        }
        lines.push(makeBulletLine(meta.groupIndent, `**${label}**`));
    }

    function appendExportSubSection(lines, meta, label, content) {
        const value = trimMarkdownBlock(content || '');
        if (!value) {
            return;
        }

        if (meta.subMode === 'heading') {
            lines.push(makeHeading(meta.subLevel, label), '');
            appendExportGroupContent(lines, value, { mode: 'heading', sectionLevel: meta.subLevel });
            pushBlankLine(lines);
            return;
        }

        lines.push(makeBulletLine(meta.subIndent, `**${label}**`));
        appendExportGroupContent(lines, value, { mode: 'bullet', bulletIndent: meta.subIndent + 1 });
    }

    function appendExportGroupContent(lines, content, options) {
        buildSectionContentLines(content, options).forEach((line) => lines.push(line));
    }

    function buildExportGroups(note) {
        const groups = [];
        const transcriptSubSections = [];
        const rawTranscript = note.transcripts.rawText || note.transcripts.rawError;
        const optimizedTranscript = note.transcripts.optimizedText || note.transcripts.optimizedError || (shouldFetchTranscript(note) ? '暂无 AI智能优化版' : '');

        if (rawTranscript || optimizedTranscript) {
            if (rawTranscript) {
                transcriptSubSections.push({
                    label: SECONDARY_TABS.transcript.raw,
                    content: note.transcripts.rawText || note.transcripts.rawError
                });
            }
            if (optimizedTranscript) {
                transcriptSubSections.push({
                    label: SECONDARY_TABS.transcript.optimized,
                    content: note.transcripts.optimizedText || note.transcripts.optimizedError || '暂无 AI智能优化版'
                });
            }
            groups.push({
                label: PRIMARY_TABS.transcript,
                subSections: transcriptSubSections
            });
        }

        const aiSubSections = ['summary', 'chapters', 'quotes', 'todos']
            .map((key) => ({
                label: SECTION_LABELS[key],
                content: note.summarySections[key]
            }))
            .filter((item) => trimMarkdownBlock(item.content));

        if (aiSubSections.length) {
            groups.push({
                label: PRIMARY_TABS.aiSummary,
                subSections: aiSubSections
            });
        }

        if (note.bodyMarkdown) {
            groups.push({
                label: PRIMARY_TABS.body,
                content: note.bodyMarkdown
            });
        }

        if (note.sprouts.error || note.sprouts.tasks.length) {
            groups.push({
                label: PRIMARY_TABS.sprouts,
                content: buildSproutsMarkdown(note)
            });
        }

        return groups;
    }

    function buildSproutsMarkdown(note) {
        if (note.sprouts.error) {
            return note.sprouts.error;
        }
        if (!note.sprouts.tasks.length) {
            return '暂无发芽内容';
        }
        return note.sprouts.tasks.map((task) => {
            const lines = [`- **${task.title}**`];
            if (task.timeText) {
                lines.push(`  - 时间：${task.timeText}`);
            }
            if (task.content) {
                lines.push(`  - 内容：${task.content}`);
            }
            return lines.join('\n');
        }).join('\n');
    }

    function buildCurrentModuleCopyText(note) {
        const primary = note.activePrimaryTab;
        const lines = [];

        if (primary === 'transcript') {
            const secondary = getActiveSecondaryTab(note, primary);
            const label = secondary === 'optimized' ? SECONDARY_TABS.transcript.optimized : SECONDARY_TABS.transcript.raw;
            const content = secondary === 'optimized'
                ? (note.transcripts.optimizedText || note.transcripts.optimizedError || '暂无 AI智能优化版')
                : (note.transcripts.rawText || note.transcripts.rawError);
            if (!trimMarkdownBlock(content)) {
                return '';
            }
            lines.push(makeHeading(2, PRIMARY_TABS.transcript), '', makeHeading(3, label), '');
            appendExportGroupContent(lines, content, { mode: 'heading', sectionLevel: 3 });
            return finalizeMarkdown(lines);
        }

        if (primary === 'aiSummary') {
            const secondary = getActiveSecondaryTab(note, primary);
            const label = SECTION_LABELS[secondary];
            const content = note.summarySections[secondary];
            if (!trimMarkdownBlock(content)) {
                return '';
            }
            lines.push(makeHeading(2, PRIMARY_TABS.aiSummary), '', makeHeading(3, label), '');
            appendExportGroupContent(lines, content, { mode: 'heading', sectionLevel: 3 });
            return finalizeMarkdown(lines);
        }

        if (primary === 'body') {
            if (!trimMarkdownBlock(note.bodyMarkdown)) {
                return '';
            }
            lines.push(makeHeading(2, PRIMARY_TABS.body), '');
            appendExportGroupContent(lines, note.bodyMarkdown, { mode: 'heading', sectionLevel: 2 });
            return finalizeMarkdown(lines);
        }

        if (primary === 'sprouts') {
            const content = buildSproutsMarkdown(note);
            if (!trimMarkdownBlock(content)) {
                return '';
            }
            lines.push(makeHeading(2, PRIMARY_TABS.sprouts), '');
            appendExportGroupContent(lines, content, { mode: 'heading', sectionLevel: 2 });
            return finalizeMarkdown(lines);
        }

        if (primary === 'children') {
            const content = buildChildrenSummaryMarkdown(note);
            if (!trimMarkdownBlock(content)) {
                return '';
            }
            lines.push(makeHeading(2, PRIMARY_TABS.children), '');
            appendExportGroupContent(lines, content, { mode: 'heading', sectionLevel: 2 });
            return finalizeMarkdown(lines);
        }

        return '';
    }

    function buildChildrenSummaryMarkdown(note) {
        if (note.childrenError && !note.children.length) {
            return note.childrenError;
        }
        if (!note.children.length) {
            return '暂无追加笔记';
        }
        return note.children.map((child) => {
            const lines = [`- [${child.title}](${child.sourceUrl})`];
            const preview = buildChildCardPreview(child);
            if (preview) {
                lines.push(`  - 摘要：${preview}`);
            }
            if (child.recordInfo.duration) {
                lines.push(`  - 时长：${child.recordInfo.duration}`);
            }
            if (child.createdAt) {
                lines.push(`  - 创建时间：${child.createdAt}`);
            }
            return lines.join('\n');
        }).join('\n');
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
        if (note.recordInfo.duration) {
            lines.push(`- 时长：${note.recordInfo.duration}`);
        }
        if (note.recordInfo.participants) {
            lines.push(`- 参与人数：${note.recordInfo.participants}`);
        }
        if (note.recordInfo.contentType) {
            lines.push(`- 内容类型：${note.recordInfo.contentType}`);
        }
        if (note.noteType) {
            lines.push(`- 笔记类型：${note.noteType}`);
        }
        if (note.entryType) {
            lines.push(`- 入口类型：${note.entryType}`);
        }
        return lines;
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

    function getChildCountForUi(note) {
        if (typeof note.childCount === 'number') {
            return note.childCount;
        }
        return (note.children || []).length;
    }

    function describeTreeMeta(node) {
        const parts = [];
        if (node.noteType) {
            parts.push(node.noteType);
        }
        if (node.entryType) {
            parts.push(node.entryType);
        }
        if (node.recordInfo.duration) {
            parts.push(node.recordInfo.duration);
        }
        const childCount = getChildCountForUi(node);
        parts.push(`${childCount} 个子项`);
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
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    function formatMsToClock(ms) {
        const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
        const hh = Math.floor(seconds / 3600);
        const mm = Math.floor((seconds % 3600) / 60);
        const ss = seconds % 60;
        if (hh > 0) {
            return [hh, mm, ss].map((value) => String(value).padStart(2, '0')).join(':');
        }
        return [mm, ss].map((value) => String(value).padStart(2, '0')).join(':');
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
