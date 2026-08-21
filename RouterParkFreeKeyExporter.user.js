// ==UserScript==
// @name         RouterPark Free Key Exporter
// @namespace    http://tampermonkey.net/
// @version      1.3.2
// @description  路由公园（RouterPark）免费 API Key 管理与导出面板，支持完整解密真实 Key、替换 Base URL、实时搜索筛选、自动展开分类、行末一键模拟测试连通性、一键复制详情及导出 CSV
// @author       TheodorePeng
// @match        https://routerpark.com/*/free-claude-code*
// @match        https://routerpark.com/free-claude-code*
// @match        https://routerpark.com/*/bbs*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/RouterParkFreeKeyExporter.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/RouterParkFreeKeyExporter.user.js
// ==/UserScript==

(function () {
    'use strict';

    const APP_ID = 'routerpark-freekey-exporter';
    const LOG_PREFIX = '[RouterParkExporter]';
    const PREF_AUTO_EXPAND_KEY = 'rp_auto_expand_accordions';

    // 状态管理
    const state = {
        modal: null,
        extractedKeys: [],
        filterOnlyNormal: true,
        searchQuery: '',
        autoExpand: getStoredPref(PREF_AUTO_EXPAND_KEY, true),
        isDecrypting: false,
        cancelDecryptRequested: false,
    };

    // 注册油猴菜单
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('✨ 打开免费 Key 管理面板', openModal);
        GM_registerMenuCommand('📂 展开页面所有折叠列表', async () => {
            const count = await expandAllAccordions();
            showToast(`已展开页面分类（共处理 ${count} 项）`);
            if (state.modal && state.modal.style.display !== 'none') {
                refreshDataFromDOM();
            }
        });
    }

    injectStyles();
    mountFloatingWidget();

    /**
     * 读取持久化配置
     */
    function getStoredPref(key, defaultValue) {
        if (typeof GM_getValue === 'function') {
            return GM_getValue(key, defaultValue);
        }
        try {
            const val = localStorage.getItem(key);
            return val !== null ? JSON.parse(val) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    /**
     * 写入持久化配置
     */
    function setStoredPref(key, value) {
        if (typeof GM_setValue === 'function') {
            GM_setValue(key, value);
            return;
        }
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { }
    }

    /**
     * 注入 UI 样式
     */
    function injectStyles() {
        const oldStyle = document.getElementById(`${APP_ID}-styles`);
        if (oldStyle) oldStyle.remove();

        const style = document.createElement('style');
        style.id = `${APP_ID}-styles`;
        style.textContent = `
            /* 悬浮小组件 */
            #${APP_ID}-fab-container {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }

            #${APP_ID}-fab-main {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 18px;
                background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);
                color: #ffffff;
                font-size: 13.5px;
                font-weight: 600;
                border: none;
                border-radius: 9999px;
                box-shadow: 0 8px 24px rgba(236, 72, 153, 0.35);
                cursor: pointer;
                transition: all 0.25s ease;
                outline: none;
                user-select: none;
            }

            #${APP_ID}-fab-main:hover {
                transform: translateY(-2px);
                box-shadow: 0 12px 30px rgba(236, 72, 153, 0.45);
            }

            #${APP_ID}-fab-main:active {
                transform: translateY(0);
            }

            /* 模态弹窗遮罩 */
            #${APP_ID}-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(15, 23, 42, 0.65);
                backdrop-filter: blur(6px);
                z-index: 100000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }

            #${APP_ID}-dialog {
                background: #ffffff;
                width: 100%;
                max-width: 1240px;
                max-height: 90vh;
                border-radius: 20px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid #e2e8f0;
                color: #1e293b;
            }

            .dark #${APP_ID}-dialog,
            html.dark #${APP_ID}-dialog {
                background: #1e293b;
                border-color: #334155;
                color: #f8fafc;
            }

            .rp-dialog-header {
                padding: 16px 24px;
                border-bottom: 1px solid #f1f5f9;
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: #f8fafc;
            }

            .dark .rp-dialog-header,
            html.dark .rp-dialog-header {
                background: #0f172a;
                border-color: #334155;
            }

            .rp-dialog-title {
                font-size: 16px;
                font-weight: 700;
                color: #0f172a;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .dark .rp-dialog-title,
            html.dark .rp-dialog-title {
                color: #f8fafc;
            }

            .rp-dialog-close {
                background: none;
                border: none;
                font-size: 22px;
                color: #94a3b8;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 8px;
                transition: all 0.2s;
                line-height: 1;
            }

            .rp-dialog-close:hover {
                color: #0f172a;
                background: #e2e8f0;
            }

            .dark .rp-dialog-close:hover,
            html.dark .rp-dialog-close:hover {
                color: #ffffff;
                background: #334155;
            }

            /* 工具控制栏 */
            .rp-control-bar {
                padding: 12px 24px;
                background: #ffffff;
                border-bottom: 1px solid #f1f5f9;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 12px;
            }

            .dark .rp-control-bar,
            html.dark .rp-control-bar {
                background: #1e293b;
                border-color: #334155;
            }

            .rp-control-left {
                display: flex;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }

            .rp-stats-tags {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 13px;
            }

            .rp-tag {
                padding: 3px 10px;
                border-radius: 9999px;
                font-weight: 600;
                font-size: 12px;
            }

            .rp-tag-green {
                background: #dcfce7;
                color: #15803d;
            }

            .rp-tag-gray {
                background: #f1f5f9;
                color: #475569;
            }

            .dark .rp-tag-green,
            html.dark .rp-tag-green {
                background: rgba(34, 197, 94, 0.2);
                color: #4ade80;
            }

            .dark .rp-tag-gray,
            html.dark .rp-tag-gray {
                background: #334155;
                color: #94a3b8;
            }

            .rp-search-wrapper {
                position: relative;
                display: flex;
                align-items: center;
            }

            .rp-search-input {
                padding: 6px 12px;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                font-size: 12.5px;
                width: 220px;
                outline: none;
                transition: all 0.2s;
                background: #ffffff;
                color: #1e293b;
            }

            .rp-search-input:focus {
                border-color: #8b5cf6;
                box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
                width: 260px;
            }

            .dark .rp-search-input,
            html.dark .rp-search-input {
                background: #0f172a;
                border-color: #475569;
                color: #f8fafc;
            }

            .dark .rp-search-input:focus,
            html.dark .rp-search-input:focus {
                border-color: #a78bfa;
            }

            .rp-actions-quick {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }

            /* 复选框样式 */
            .rp-checkbox-label {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12.5px;
                font-weight: 500;
                color: #475569;
                cursor: pointer;
                user-select: none;
            }

            .dark .rp-checkbox-label,
            html.dark .rp-checkbox-label {
                color: #cbd5e1;
            }

            .rp-checkbox-label input[type="checkbox"] {
                cursor: pointer;
                accent-color: #8b5cf6;
                width: 15px;
                height: 15px;
            }

            /* 弹窗主体表格 */
            .rp-dialog-body {
                padding: 16px 24px;
                overflow-y: auto;
                flex: 1;
            }

            .rp-table-container {
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                overflow: hidden;
            }

            .dark .rp-table-container,
            html.dark .rp-table-container {
                border-color: #334155;
            }

            .rp-table {
                width: 100%;
                border-collapse: collapse;
                text-align: left;
                font-size: 12.5px;
            }

            .rp-table th {
                background: #f8fafc;
                padding: 10px 12px;
                font-weight: 600;
                color: #475569;
                border-bottom: 1px solid #e2e8f0;
                white-space: nowrap;
            }

            .dark .rp-table th,
            html.dark .rp-table th {
                background: #0f172a;
                color: #94a3b8;
                border-color: #334155;
            }

            .rp-table td {
                padding: 8px 12px;
                border-bottom: 1px solid #f1f5f9;
                color: #1e293b;
                vertical-align: middle;
            }

            .dark .rp-table td,
            html.dark .rp-table td {
                border-color: #334155;
                color: #cbd5e1;
            }

            .rp-table tr:last-child td {
                border-bottom: none;
            }

            .rp-table tr:hover td {
                background: #f8fafc;
            }

            .dark .rp-table tr:hover td,
            html.dark .rp-table tr:hover td {
                background: rgba(51, 65, 85, 0.3);
            }

            /* API Key 完整显示 */
            .rp-key-code {
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                background: #f1f5f9;
                padding: 3px 6px;
                border-radius: 4px;
                font-size: 11.5px;
                color: #0f172a;
                word-break: break-all;
                white-space: normal;
                display: inline-block;
                max-width: 380px;
                line-height: 1.4;
            }

            .rp-key-code.is-full {
                background: #ecfdf5;
                color: #047857;
                border: 1px solid #a7f3d0;
            }

            .dark .rp-key-code,
            html.dark .rp-key-code {
                background: #0f172a;
                color: #e2e8f0;
            }

            .dark .rp-key-code.is-full,
            html.dark .rp-key-code.is-full {
                background: rgba(6, 78, 59, 0.3);
                color: #6ee7b7;
                border-color: rgba(52, 211, 153, 0.3);
            }

            .rp-badge-normal {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 9999px;
                background: #dcfce7;
                color: #15803d;
                font-size: 11px;
                font-weight: 600;
                white-space: nowrap;
            }

            .dark .rp-badge-normal,
            html.dark .rp-badge-normal {
                background: rgba(34, 197, 94, 0.2);
                color: #4ade80;
            }

            .rp-badge-exhausted {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 9999px;
                background: #fee2e2;
                color: #b91c1c;
                font-size: 11px;
                font-weight: 600;
                white-space: nowrap;
            }

            .dark .rp-badge-exhausted,
            html.dark .rp-badge-exhausted {
                background: rgba(239, 68, 68, 0.2);
                color: #f87171;
            }

            /* 行操作按钮容器 */
            .rp-row-actions {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                flex-wrap: nowrap;
            }

            /* 行操作按钮 */
            .rp-row-btn {
                padding: 4px 9px;
                background: #f1f5f9;
                color: #475569;
                font-size: 11.5px;
                font-weight: 600;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                user-select: none;
            }

            .rp-row-btn:hover {
                background: #e2e8f0;
                color: #0f172a;
                border-color: #94a3b8;
            }

            .rp-row-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .rp-row-btn-test {
                background: #eff6ff;
                color: #0284c7;
                border-color: #bae6fd;
            }

            .rp-row-btn-test:hover {
                background: #e0f2fe;
                color: #0369a1;
                border-color: #7dd3fc;
            }

            .dark .rp-row-btn,
            html.dark .rp-row-btn {
                background: #334155;
                color: #cbd5e1;
                border-color: #475569;
            }

            .dark .rp-row-btn:hover,
            html.dark .rp-row-btn:hover {
                background: #475569;
                color: #ffffff;
            }

            .dark .rp-row-btn-test,
            html.dark .rp-row-btn-test {
                background: rgba(2, 132, 199, 0.2);
                color: #38bdf8;
                border-color: rgba(56, 189, 248, 0.3);
            }

            .dark .rp-row-btn-test:hover,
            html.dark .rp-row-btn-test:hover {
                background: rgba(2, 132, 199, 0.35);
                color: #7dd3fc;
            }

            /* 旋转动画 */
            @keyframes rp-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            .rp-spin {
                animation: rp-spin 1s linear infinite;
            }

            /* 弹窗底部操作栏 */
            .rp-dialog-footer {
                padding: 14px 24px;
                border-top: 1px solid #f1f5f9;
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: #f8fafc;
            }

            .dark .rp-dialog-footer,
            html.dark .rp-dialog-footer {
                background: #0f172a;
                border-color: #334155;
            }

            .rp-footer-tip {
                font-size: 12.5px;
                color: #64748b;
            }

            .rp-footer-actions {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .rp-btn {
                padding: 8px 16px;
                border-radius: 10px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                border: none;
                display: flex;
                align-items: center;
                gap: 6px;
                user-select: none;
            }

            .rp-btn-sm {
                padding: 6px 12px;
                font-size: 12px;
                border-radius: 8px;
            }

            .rp-btn-success {
                background: #059669;
                color: #ffffff;
                box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);
            }
            .rp-btn-success:hover {
                background: #047857;
                transform: translateY(-1px);
            }

            .rp-btn-primary {
                background: #6366f1;
                color: #ffffff;
            }
            .rp-btn-primary:hover {
                background: #4f46e5;
                transform: translateY(-1px);
            }

            .rp-btn-secondary {
                background: #e2e8f0;
                color: #334155;
            }
            .rp-btn-secondary:hover {
                background: #cbd5e1;
                transform: translateY(-1px);
            }

            .dark .rp-btn-secondary,
            html.dark .rp-btn-secondary {
                background: #334155;
                color: #e2e8f0;
            }
            .dark .rp-btn-secondary:hover,
            html.dark .rp-btn-secondary:hover {
                background: #475569;
            }

            .rp-btn-danger {
                background: #ef4444;
                color: #ffffff;
            }
            .rp-btn-danger:hover {
                background: #dc2626;
            }

            /* Toast 提示 */
            #${APP_ID}-toast {
                position: fixed;
                top: 24px;
                left: 50%;
                transform: translateX(-50%);
                padding: 8px 18px;
                background: #0f172a;
                color: #ffffff;
                border-radius: 9999px;
                font-size: 13px;
                font-weight: 500;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
                z-index: 100001;
                display: none;
            }

            /* 静默模式下隐藏页面 Toast */
            .rp-silence-page-toasts [data-sonner-toaster],
            .rp-silence-page-toasts .toaster,
            .rp-silence-page-toasts [role="status"],
            .rp-silence-page-toasts [class*="toast"] {
                display: none !important;
                opacity: 0 !important;
                visibility: hidden !important;
                pointer-events: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * 挂载右下角悬浮按钮
     */
    function mountFloatingWidget() {
        const oldContainer = document.getElementById(`${APP_ID}-fab-container`);
        if (oldContainer) oldContainer.remove();

        const container = document.createElement('div');
        container.id = `${APP_ID}-fab-container`;

        const mainBtn = document.createElement('button');
        mainBtn.id = `${APP_ID}-fab-main`;
        mainBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>提取有效 Key</span>
        `;
        mainBtn.onclick = openModal;

        container.appendChild(mainBtn);
        document.body.appendChild(container);
    }

    /**
     * 打开弹窗
     */
    async function openModal() {
        if (!state.modal || !document.contains(state.modal)) {
            buildModal();
        }

        state.modal.style.display = 'flex';

        // 若开启自动展开，先自动展开折叠分类
        if (state.autoExpand) {
            await expandAllAccordions();
        }

        refreshDataFromDOM();
    }

    /**
     * 构建弹窗 DOM
     */
    function buildModal() {
        const oldModal = document.getElementById(`${APP_ID}-modal`);
        if (oldModal) oldModal.remove();

        const overlay = document.createElement('div');
        overlay.id = `${APP_ID}-modal`;

        const dialog = document.createElement('div');
        dialog.id = `${APP_ID}-dialog`;

        dialog.innerHTML = `
            <div class="rp-dialog-header">
                <div class="rp-dialog-title">
                    <span>✨ RouterPark 免费 API Key 管理面板</span>
                </div>
                <button class="rp-dialog-close" title="关闭">&times;</button>
            </div>
            
            <div class="rp-control-bar">
                <div class="rp-control-left">
                    <div class="rp-stats-tags">
                        <span class="rp-tag rp-tag-green" id="${APP_ID}-tag-normal">正常: 0 个</span>
                        <span class="rp-tag rp-tag-gray" id="${APP_ID}-tag-total">总计: 0 个</span>
                    </div>
                    <div class="rp-search-wrapper">
                        <input type="text" class="rp-search-input" id="${APP_ID}-input-search" placeholder="🔍 搜索厂商 / 模型 / URL / Key..." />
                    </div>
                </div>
                <div class="rp-actions-quick">
                    <label class="rp-checkbox-label" title="开启后，每次打开弹窗或切换时自动展开网页所有折叠列表">
                        <input type="checkbox" id="${APP_ID}-chk-auto-expand" ${state.autoExpand ? 'checked' : ''} />
                        <span>自动展开所有分类</span>
                    </label>
                    <button class="rp-btn rp-btn-secondary rp-btn-sm" id="${APP_ID}-btn-expand" title="单次手动展开页面所有折叠分类">📂 一键展开</button>
                    <button class="rp-btn rp-btn-secondary rp-btn-sm" id="${APP_ID}-btn-toggle-filter">切换：仅看正常</button>
                    <button class="rp-btn rp-btn-primary rp-btn-sm" id="${APP_ID}-btn-decrypt-all" title="模拟点击原网页末尾按钮，批量并发静默获取并替换完整真实 Key 与 Base URL">⚡ 静默解密完整 Key</button>
                </div>
            </div>

            <div class="rp-dialog-body">
                <div class="rp-table-container">
                    <table class="rp-table">
                        <thead>
                            <tr>
                                <th>厂商/来源</th>
                                <th>类型/模型</th>
                                <th>API 地址 (Base URL)</th>
                                <th>API Key (完整密钥)</th>
                                <th>状态</th>
                                <th>共享日期</th>
                                <th style="text-align: center;">操作</th>
                            </tr>
                        </thead>
                        <tbody id="${APP_ID}-table-body">
                            <tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 28px;">正在读取页面数据...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="rp-dialog-footer">
                <div class="rp-footer-tip" id="${APP_ID}-footer-tip">请选择操作：可导出 CSV 文件或复制到剪切板</div>
                <div class="rp-footer-actions">
                    <button class="rp-btn rp-btn-secondary" id="${APP_ID}-btn-copy-md">📋 复制 Markdown</button>
                    <button class="rp-btn rp-btn-secondary" id="${APP_ID}-btn-copy-keys">🔑 仅复制 Key</button>
                    <button class="rp-btn rp-btn-success" id="${APP_ID}-btn-export-csv">📥 导出为 CSV 表格</button>
                </div>
            </div>
        `;

        overlay.appendChild(dialog);

        // 关闭事件
        overlay.querySelector('.rp-dialog-close').onclick = () => {
            overlay.style.display = 'none';
        };
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.style.display = 'none';
        };

        // 自动展开复选框事件
        const chkAutoExpand = overlay.querySelector(`#${APP_ID}-chk-auto-expand`);
        chkAutoExpand.onchange = async (e) => {
            state.autoExpand = Boolean(e.target.checked);
            setStoredPref(PREF_AUTO_EXPAND_KEY, state.autoExpand);
            if (state.autoExpand) {
                showToast('已开启自动展开分类');
                await expandAllAccordions();
                refreshDataFromDOM();
            } else {
                showToast('已关闭自动展开分类');
            }
        };

        // 搜索输入框实时筛选
        const searchInput = overlay.querySelector(`#${APP_ID}-input-search`);
        searchInput.oninput = (e) => {
            state.searchQuery = (e.target.value || '').trim();
            renderTable();
        };

        // 手动一键展开按钮
        overlay.querySelector(`#${APP_ID}-btn-expand`).onclick = async () => {
            const count = await expandAllAccordions();
            refreshDataFromDOM();
            showToast(`已展开页面分类（共处理 ${count} 项）`);
        };

        // 切换仅看正常
        overlay.querySelector(`#${APP_ID}-btn-toggle-filter`).onclick = (e) => {
            state.filterOnlyNormal = !state.filterOnlyNormal;
            e.target.textContent = state.filterOnlyNormal ? '切换：仅看正常' : '切换：查看全部';
            renderTable();
        };

        // 批量静默解密 / 取消解密
        overlay.querySelector(`#${APP_ID}-btn-decrypt-all`).onclick = handleDecryptButtonClick;

        // 底部复制与导出
        overlay.querySelector(`#${APP_ID}-btn-export-csv`).onclick = exportCurrentKeysToCSV;
        overlay.querySelector(`#${APP_ID}-btn-copy-md`).onclick = copyAsMarkdown;
        overlay.querySelector(`#${APP_ID}-btn-copy-keys`).onclick = copyOnlyKeys;

        // 使用事件委托处理行内操作按钮点击（测试与复制详情）
        const tableBody = overlay.querySelector(`#${APP_ID}-table-body`);
        tableBody.addEventListener('click', async (e) => {
            const testBtn = e.target.closest('button[data-act="test-row"]');
            if (testBtn) {
                const sig = testBtn.getAttribute('data-sig');
                const item = state.extractedKeys.find((k) => k.sig === sig);
                if (item) {
                    await handleSingleRowTest(item, testBtn);
                }
                return;
            }

            const copyBtn = e.target.closest('button[data-act="copy-row"]');
            if (copyBtn) {
                const sig = copyBtn.getAttribute('data-sig');
                const item = state.extractedKeys.find((k) => k.sig === sig);
                if (item) {
                    await handleSingleRowCopy(item, copyBtn);
                }
                return;
            }
        });

        document.body.appendChild(overlay);
        state.modal = overlay;
    }

    /**
     * 获取页面所有非插件表格（严格排除插件自身弹窗）
     */
    function getPageTables() {
        const allTables = [...document.querySelectorAll('table')];
        return allTables.filter((table) => {
            return !table.closest(`#${APP_ID}-modal`) && !table.classList.contains('rp-table');
        });
    }

    /**
     * 纯净读取页面 DOM 数据（严格隔离自身 DOM，防止多次点击导致样式崩溃）
     */
    function refreshDataFromDOM() {
        const pageTables = getPageTables();
        const items = [];
        const seen = new Set();

        for (const table of pageTables) {
            // 只抓取包含数据按钮且不包含子 table 的行
            const rows = [...table.querySelectorAll('tr')].filter((r) => {
                return (
                    (r.querySelector('button[title*="复制"]') || r.querySelector('button[title*="测试"]')) &&
                    !r.querySelector('table')
                );
            });

            for (const row of rows) {
                const text = row.innerText.replace(/\s+/g, ' ').trim();
                const badge = row.querySelector('[data-slot="badge"], [class*="badge"]');
                const badgeText = badge ? badge.innerText.trim() : '';

                const isExhausted = badgeText.includes('耗尽') || text.includes('耗尽');
                const isNormal = badgeText.includes('正常') || badgeText.includes('有效') || (!isExhausted && text.includes('正常'));

                const tds = [...row.querySelectorAll('td')].map((td) => td.innerText.trim());
                let vendor = '',
                    typeOrModel = '',
                    baseUrl = '',
                    maskedKey = '',
                    status = isNormal ? '正常' : '耗尽',
                    contributor = '',
                    date = '';

                // 获取该行原网页中的操作按钮（倒数第 3 个为“测试”按钮，最后一个为“复制详情”按钮）
                const rowButtons = [...row.querySelectorAll('button')];
                const lastBtn = rowButtons.length > 0 ? rowButtons[rowButtons.length - 1] : null;
                const testBtn = rowButtons.find((b) => b.getAttribute('title') === '测试') ||
                    (rowButtons.length >= 3 ? rowButtons[rowButtons.length - 3] : null);

                if (tds.length >= 8) {
                    // 第三方代理表格 (来源, 类型, API地址, 模型, 密钥, 状态, 贡献者, 日期, 操作)
                    vendor = tds[0] || '第三方代理';
                    typeOrModel = (tds[1] || '') + (tds[3] ? ` (${tds[3]})` : '');
                    baseUrl = tds[2] || '';
                    maskedKey = tds[4] || '';
                    status = tds[5] || (isNormal ? '正常' : '耗尽');
                    contributor = tds[6] || '';
                    date = tds[7] || '';
                } else if (tds.length >= 5) {
                    // 官方厂商表格 (服务商, API Key, 状态, 贡献者, 日期, 操作)
                    vendor = tds[0] || '';
                    maskedKey = tds[1] || '';
                    status = tds[2] || badgeText || (isNormal ? '正常' : '耗尽');
                    contributor = tds[3] || '';
                    date = tds[4] || '';
                } else {
                    continue;
                }

                if (!maskedKey || maskedKey === '-') continue;

                const sig = `${vendor}|${baseUrl}|${typeOrModel}|${maskedKey}`;
                if (seen.has(sig)) continue;
                seen.add(sig);

                // 检查之前是否已经有解密记录，保留已解密的数据
                const existing = state.extractedKeys.find((k) => k.sig === sig);

                items.push({
                    sig,
                    vendor: existing?.vendor || vendor,
                    typeOrModel: existing?.typeOrModel || typeOrModel || '-',
                    baseUrl: existing?.baseUrl || baseUrl || '-',
                    maskedKey: maskedKey || '-',
                    fullKey: existing?.fullKey || '',
                    status,
                    isNormal,
                    contributor: contributor || '-',
                    date: date || '-',
                    lastBtn,
                    testBtn,
                });
            }
        }

        state.extractedKeys = items;
        renderTable();
    }

    /**
     * 渲染表格与统计
     */
    function renderTable() {
        const tableBody = document.getElementById(`${APP_ID}-table-body`);
        const tagNormal = document.getElementById(`${APP_ID}-tag-normal`);
        const tagTotal = document.getElementById(`${APP_ID}-tag-total`);
        const footerTip = document.getElementById(`${APP_ID}-footer-tip`);

        const totalCount = state.extractedKeys.length;
        const normalCount = state.extractedKeys.filter((i) => i.isNormal).length;

        if (tagNormal) tagNormal.textContent = `正常: ${normalCount} 个`;
        if (tagTotal) tagTotal.textContent = `总计: ${totalCount} 个`;

        // 筛选逻辑：正常状态 + 搜索关键字
        let displayItems = state.filterOnlyNormal ? state.extractedKeys.filter((i) => i.isNormal) : state.extractedKeys;

        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            displayItems = displayItems.filter((k) => {
                return (
                    (k.vendor && k.vendor.toLowerCase().includes(q)) ||
                    (k.typeOrModel && k.typeOrModel.toLowerCase().includes(q)) ||
                    (k.baseUrl && k.baseUrl.toLowerCase().includes(q)) ||
                    (k.maskedKey && k.maskedKey.toLowerCase().includes(q)) ||
                    (k.fullKey && k.fullKey.toLowerCase().includes(q)) ||
                    (k.status && k.status.toLowerCase().includes(q))
                );
            });
        }

        if (footerTip) {
            footerTip.textContent = `当前展示 ${displayItems.length} 个 Key（库中正常状态 ${normalCount} 个，总计 ${totalCount} 个）`;
        }

        if (!tableBody) return;

        if (displayItems.length === 0) {
            const hint = state.searchQuery
                ? `未找到匹配“${escapeHtml(state.searchQuery)}”的 Key`
                : '暂无数据（可点击上方“📂 一键展开”或开启“自动展开所有分类”）';
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 32px;">${hint}</td></tr>`;
            return;
        }

        tableBody.innerHTML = displayItems
            .map((k) => {
                const isDecrypted = Boolean(k.fullKey && k.fullKey.length > 5);
                const showKey = isDecrypted ? k.fullKey : k.maskedKey;
                const statusBadge = k.isNormal ? `<span class="rp-badge-normal">正常</span>` : `<span class="rp-badge-exhausted">耗尽</span>`;
                const keyClass = isDecrypted ? 'rp-key-code is-full' : 'rp-key-code';

                return `
                <tr data-sig="${escapeHtml(k.sig)}">
                    <td><strong>${escapeHtml(k.vendor)}</strong></td>
                    <td><span style="color: #64748b;">${escapeHtml(k.typeOrModel)}</span></td>
                    <td><span style="font-size: 11.5px; color: #0284c7; font-family: monospace; word-break: break-all;">${escapeHtml(k.baseUrl)}</span></td>
                    <td><span class="${keyClass}" title="${escapeHtml(showKey)}">${escapeHtml(showKey)}</span></td>
                    <td>${statusBadge}</td>
                    <td style="color: #64748b; font-size: 11.5px; white-space: nowrap;">${escapeHtml(k.date)}</td>
                    <td style="text-align: center; white-space: nowrap;">
                        <div class="rp-row-actions">
                            <button class="rp-row-btn rp-row-btn-test" data-act="test-row" data-sig="${escapeHtml(k.sig)}" title="模拟点击原网页倒数第3个“测试”按钮，测试此 API Key 有效性并弹出结果">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"></path>
                                </svg>
                                <span>测试</span>
                            </button>
                            <button class="rp-row-btn" data-act="copy-row" data-sig="${escapeHtml(k.sig)}" title="模拟点击原网页末尾按钮，复制并更新此行数据">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect width="8" height="4" x="8" y="2" rx="1" ry="1"></rect>
                                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                                </svg>
                                <span>复制详情</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            })
            .join('');
    }

    /**
     * 动态查找行对应的“测试”按钮（防止 React 虚拟 DOM 重新渲染后引用失效）
     */
    function findLiveRowTestButton(item) {
        if (item.testBtn && document.contains(item.testBtn)) {
            return item.testBtn;
        }

        const pageTables = getPageTables();
        for (const table of pageTables) {
            const rows = [...table.querySelectorAll('tr')].filter((r) => !r.querySelector('table'));
            for (const row of rows) {
                const text = row.innerText.replace(/\s+/g, ' ');
                if (text.includes(item.maskedKey) || (item.fullKey && text.includes(item.fullKey.slice(-6)))) {
                    const buttons = [...row.querySelectorAll('button')];
                    if (buttons.length > 0) {
                        const targetBtn = buttons.find((b) => b.getAttribute('title') === '测试') ||
                            (buttons.length >= 3 ? buttons[buttons.length - 3] : null);
                        if (targetBtn) {
                            item.testBtn = targetBtn;
                            return targetBtn;
                        }
                    }
                }
            }
        }
        return null;
    }

    /**
     * 单行点击“测试”：完全模拟触发原网页对应行倒数第三个“测试”按钮，并在页面弹出测试结果
     */
    async function handleSingleRowTest(item, btnElement) {
        const btn = findLiveRowTestButton(item);
        if (!btn) {
            showToast('⚠️ 未找到原网页对应的测试按钮，请先展开相应分类');
            return;
        }

        const originalHtml = btnElement ? btnElement.innerHTML : '';
        if (btnElement) {
            btnElement.disabled = true;
            btnElement.innerHTML = `
                <svg class="rp-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                </svg>
                <span>测试中...</span>
            `;
        }

        try {
            btn.click();
        } catch (err) {
            console.error(LOG_PREFIX, '单行测试出错:', err);
            showToast(`❌ 测试失败: ${err.message}`);
        } finally {
            setTimeout(() => {
                if (btnElement) {
                    btnElement.disabled = false;
                    btnElement.innerHTML = originalHtml;
                }
            }, 1800);
        }
    }

    /**
     * 动态查找行对应的“复制详情”按钮（防止 React 虚拟 DOM 重新渲染后引用失效）
     */
    function findLiveRowButton(item) {
        if (item.lastBtn && document.contains(item.lastBtn)) {
            return item.lastBtn;
        }

        const pageTables = getPageTables();
        for (const table of pageTables) {
            const rows = [...table.querySelectorAll('tr')].filter((r) => !r.querySelector('table'));
            for (const row of rows) {
                const text = row.innerText.replace(/\s+/g, ' ');
                if (text.includes(item.maskedKey) || (item.fullKey && text.includes(item.fullKey.slice(-6)))) {
                    const buttons = [...row.querySelectorAll('button')];
                    if (buttons.length > 0) {
                        const targetBtn = buttons[buttons.length - 1];
                        item.lastBtn = targetBtn;
                        return targetBtn;
                    }
                }
            }
        }
        return null;
    }

    /**
     * 单行点击“复制详情”：完全模拟触发原网页对应行的最后一个按钮，并同步更新当前行
     */
    async function handleSingleRowCopy(item, btnElement) {
        const btn = findLiveRowButton(item);
        if (!btn) {
            showToast('⚠️ 未找到原网页对应的操作按钮，请先展开相应分类');
            return;
        }

        const originalHtml = btnElement ? btnElement.innerHTML : '';
        if (btnElement) btnElement.innerHTML = `<span>⏳ 复制中...</span>`;

        try {
            const copiedText = await triggerButtonAndCapture(btn, false);

            if (copiedText) {
                parseAndUpdateItem(item, copiedText);
                renderTable();
                showToast(`✅ 已复制 ${item.vendor} 完整配置到剪切板`);
            } else {
                showToast(`⚠️ 已触发原网页复制`);
            }
        } catch (err) {
            console.error(LOG_PREFIX, '单行复制出错:', err);
            showToast(`❌ 复制失败: ${err.message}`);
        } finally {
            if (btnElement) btnElement.innerHTML = originalHtml;
        }
    }

    /**
     * 响应批量解密按钮点击（支持开始与中途取消）
     */
    async function handleDecryptButtonClick() {
        if (state.isDecrypting) {
            state.cancelDecryptRequested = true;
            const decryptBtn = document.getElementById(`${APP_ID}-btn-decrypt-all`);
            if (decryptBtn) decryptBtn.textContent = '🛑 正在取消中...';
            return;
        }

        await startSilentDecryptAll();
    }

    /**
     * 批量静默解密所有正常 Key：智能节流并发、支持取消、防卡死
     */
    async function startSilentDecryptAll() {
        state.isDecrypting = true;
        state.cancelDecryptRequested = false;

        const decryptBtn = document.getElementById(`${APP_ID}-btn-decrypt-all`);
        const originalBtnText = '⚡ 静默解密完整 Key';

        if (decryptBtn) {
            decryptBtn.className = 'rp-btn rp-btn-danger rp-btn-sm';
            decryptBtn.textContent = '🛑 点击取消解密 (0%)';
        }

        // 临时屏蔽页面 Toast 弹窗
        document.body.classList.add('rp-silence-page-toasts');

        // 仅处理未解密或未获取完整 Key 的正常条目
        const targetItems = state.extractedKeys.filter((i) => i.isNormal && (!i.fullKey || i.fullKey.length <= 5));

        if (targetItems.length === 0) {
            showToast('🎉 所有正常 Key 均已解密完成，无需重复解密');
            state.isDecrypting = false;
            if (decryptBtn) {
                decryptBtn.className = 'rp-btn rp-btn-primary rp-btn-sm';
                decryptBtn.textContent = '✅ 已全部解密';
            }
            document.body.classList.remove('rp-silence-page-toasts');
            return;
        }

        let successCount = 0;
        let processedCount = 0;

        try {
            for (let i = 0; i < targetItems.length; i++) {
                if (state.cancelDecryptRequested) {
                    showToast(`⚠️ 已停止批量解密（已完成 ${successCount} 个）`);
                    break;
                }

                const item = targetItems[i];
                const btn = findLiveRowButton(item);

                processedCount++;
                const progressPct = Math.round((processedCount / targetItems.length) * 100);

                if (decryptBtn) {
                    decryptBtn.textContent = `🛑 取消 (${processedCount}/${targetItems.length} - ${progressPct}%)`;
                }

                if (btn) {
                    const copiedText = await triggerButtonAndCapture(btn, true);
                    if (copiedText) {
                        parseAndUpdateItem(item, copiedText);
                        successCount++;
                    }
                }

                // 批次间微小延迟，释放主线程与 UI 渲染
                await sleep(40);

                // 每处理 5 个条目刷新一次表格视图
                if (processedCount % 5 === 0) {
                    renderTable();
                }
            }

            renderTable();
            if (!state.cancelDecryptRequested) {
                showToast(`🎉 成功解密 ${successCount} 个 Key 的真实密钥与 Base URL！`);
            }
        } catch (err) {
            console.error(LOG_PREFIX, '批量解密出错:', err);
            showToast(`❌ 解密过程出错: ${err.message}`);
        } finally {
            document.body.classList.remove('rp-silence-page-toasts');
            state.isDecrypting = false;
            state.cancelDecryptRequested = false;

            if (decryptBtn) {
                decryptBtn.className = 'rp-btn rp-btn-primary rp-btn-sm';
                decryptBtn.textContent = originalBtnText;
            }
        }
    }

    /**
     * 精确的 Promise 机制：模拟点击按钮并等待剪切板内容写入（带超时与状态恢复保护）
     */
    function triggerButtonAndCapture(button, isSilent = false) {
        return new Promise((resolve) => {
            let timer = null;
            const originalWriteText = navigator.clipboard ? navigator.clipboard.writeText : null;

            const cleanup = () => {
                if (timer) clearTimeout(timer);
                if (navigator.clipboard && originalWriteText) {
                    navigator.clipboard.writeText = originalWriteText;
                }
            };

            if (navigator.clipboard) {
                navigator.clipboard.writeText = async (text) => {
                    cleanup();
                    // 如果不是静默模式，真实写入系统剪切板
                    if (!isSilent && originalWriteText) {
                        try {
                            await originalWriteText.call(navigator.clipboard, text);
                        } catch (e) { }
                    }
                    resolve(text);
                    return true;
                };
            }

            // 超时兜底（若 800ms 内未响应则安全释放）
            timer = setTimeout(() => {
                cleanup();
                resolve('');
            }, 800);

            try {
                button.click();
            } catch (err) {
                cleanup();
                resolve('');
            }
        });
    }

    /**
     * 解析复制的详细内容并更新 item 对象
     */
    function parseAndUpdateItem(item, rawText) {
        if (!rawText) return;

        const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0) {
            // 第一行通常是完整 Key
            item.fullKey = lines[0];

            for (const line of lines.slice(1)) {
                if (line.toLowerCase().startsWith('url:') || line.toLowerCase().startsWith('baseurl:')) {
                    item.baseUrl = line.replace(/^(url|baseurl):\s*/i, '').trim();
                } else if (line.toLowerCase().startsWith('model:')) {
                    const m = line.replace(/^model:\s*/i, '').trim();
                    if (!item.typeOrModel.includes(m)) {
                        item.typeOrModel = item.typeOrModel !== '-' ? `${item.typeOrModel} (${m})` : m;
                    }
                } else if (line.toLowerCase().startsWith('type:')) {
                    const t = line.replace(/^type:\s*/i, '').trim();
                    if (item.typeOrModel === '-') item.typeOrModel = t;
                } else if (line.toLowerCase().startsWith('provider:')) {
                    const p = line.replace(/^provider:\s*/i, '').trim();
                    if (!item.vendor || item.vendor === '第三方代理') {
                        item.vendor = p;
                    }
                }
            }
        }
    }

    /**
     * 精确展开所有折叠分类（避免误触子表格或已展开的项）
     */
    async function expandAllAccordions() {
        let expandedCount = 0;
        const pageTables = getPageTables();

        // 1. 展开各官方厂商折叠（精确匹配顶层折叠标题行，且仅在尚未展开时点击）
        for (const table of pageTables) {
            const tbodies = [...table.querySelectorAll('tbody')];
            for (const tb of tbodies) {
                // 检查 tbody 是否为官方折叠块（包含 h3 厂商标题）
                const headerRow = tb.querySelector('tr.cursor-pointer');
                if (!headerRow) continue;

                // 若该 tbody 内的 tr 行数仅为 1，说明折叠内容尚未展开；若 > 1，则说明已处于展开状态
                const directRows = [...tb.querySelectorAll(':scope > tr')];
                const rowCount = directRows.length > 0 ? directRows.length : tb.querySelectorAll('tr').length;

                if (rowCount === 1) {
                    headerRow.click();
                    expandedCount++;
                    await sleep(40);
                }
            }
        }

        // 2. 展开第三方代理折叠（仅在尚未展开时点击）
        const proxyButtons = [...document.querySelectorAll('button')].filter((el) => {
            if (el.closest(`#${APP_ID}-modal`)) return false;
            const text = el.innerText || '';
            return text.includes('第三方代理密钥') && (el.classList.contains('cursor-pointer') || el.parentElement?.classList.contains('cursor-pointer'));
        });

        for (const pBtn of proxyButtons) {
            const parent = pBtn.parentElement;
            // 若父容器或后续兄弟节点中尚未渲染 table，才执行展开点击
            const alreadyHasTable = parent && parent.querySelector('table');
            if (!alreadyHasTable) {
                pBtn.click();
                expandedCount++;
                await sleep(100);
            }
        }

        return expandedCount;
    }

    /**
     * 导出为 CSV
     */
    function exportCurrentKeysToCSV() {
        let items = state.filterOnlyNormal ? state.extractedKeys.filter((i) => i.isNormal) : state.extractedKeys;

        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            items = items.filter((k) => {
                return (
                    (k.vendor && k.vendor.toLowerCase().includes(q)) ||
                    (k.typeOrModel && k.typeOrModel.toLowerCase().includes(q)) ||
                    (k.baseUrl && k.baseUrl.toLowerCase().includes(q)) ||
                    (k.maskedKey && k.maskedKey.toLowerCase().includes(q)) ||
                    (k.fullKey && k.fullKey.toLowerCase().includes(q))
                );
            });
        }

        if (!items || items.length === 0) {
            showToast('⚠️ 当前无数据可供导出');
            return;
        }

        const headers = ['厂商/来源', '类型/模型', 'API 地址 (Base URL)', 'API Key (完整密钥)', '状态', '贡献者', '共享日期'];
        const csvRows = [
            headers.join(','),
            ...items.map((item) =>
                [
                    csvEscape(item.vendor),
                    csvEscape(item.typeOrModel),
                    csvEscape(item.baseUrl),
                    csvEscape(item.fullKey || item.maskedKey),
                    csvEscape(item.status),
                    csvEscape(item.contributor),
                    csvEscape(item.date),
                ].join(',')
            ),
        ];

        // UTF-8 BOM
        const csvString = '\uFEFF' + csvRows.join('\r\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        const fileName = `RouterPark_API_Keys_${dateStr}.csv`;

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast(`✅ 已导出 CSV：${fileName}`);
    }

    /**
     * 复制为 Markdown 表格
     */
    function copyAsMarkdown() {
        let items = state.filterOnlyNormal ? state.extractedKeys.filter((i) => i.isNormal) : state.extractedKeys;

        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            items = items.filter((k) => {
                return (
                    (k.vendor && k.vendor.toLowerCase().includes(q)) ||
                    (k.typeOrModel && k.typeOrModel.toLowerCase().includes(q)) ||
                    (k.baseUrl && k.baseUrl.toLowerCase().includes(q)) ||
                    (k.maskedKey && k.maskedKey.toLowerCase().includes(q)) ||
                    (k.fullKey && k.fullKey.toLowerCase().includes(q))
                );
            });
        }

        if (!items || items.length === 0) {
            showToast('⚠️ 当前无数据可复制');
            return;
        }

        const headers = '| 厂商/来源 | 类型/模型 | Base URL | API Key | 状态 | 共享日期 |';
        const divider = '| :--- | :--- | :--- | :--- | :--- | :--- |';
        const rows = items.map((k) => `| ${k.vendor} | ${k.typeOrModel} | \`${k.baseUrl}\` | \`${k.fullKey || k.maskedKey}\` | ${k.status} | ${k.date} |`);

        const md = [headers, divider, ...rows].join('\n');
        copyText(md, '✅ 已复制 Markdown 表格到剪切板');
    }

    /**
     * 仅复制 Key 列表
     */
    function copyOnlyKeys() {
        let items = state.filterOnlyNormal ? state.extractedKeys.filter((i) => i.isNormal) : state.extractedKeys;

        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            items = items.filter((k) => {
                return (
                    (k.vendor && k.vendor.toLowerCase().includes(q)) ||
                    (k.typeOrModel && k.typeOrModel.toLowerCase().includes(q)) ||
                    (k.baseUrl && k.baseUrl.toLowerCase().includes(q)) ||
                    (k.maskedKey && k.maskedKey.toLowerCase().includes(q)) ||
                    (k.fullKey && k.fullKey.toLowerCase().includes(q))
                );
            });
        }

        if (!items || items.length === 0) {
            showToast('⚠️ 当前无数据可复制');
            return;
        }

        const text = items.map((k) => `${k.vendor}: ${k.fullKey || k.maskedKey}`).join('\n');
        copyText(text, '✅ 已复制 Key 列表到剪切板');
    }

    function copyText(str, successMsg) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(str);
            showToast(successMsg);
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(str).then(() => showToast(successMsg)).catch(() => {
                legacyCopy(str, successMsg);
            });
        } else {
            legacyCopy(str, successMsg);
        }
    }

    function legacyCopy(str, successMsg) {
        const textarea = document.createElement('textarea');
        textarea.value = str;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showToast(successMsg);
        } catch (e) {
            showToast('⚠️ 复制失败，请手动复制');
        }
        document.body.removeChild(textarea);
    }

    function showToast(msg) {
        let toast = document.getElementById(`${APP_ID}-toast`);
        if (!toast) {
            toast = document.createElement('div');
            toast.id = `${APP_ID}-toast`;
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.display = 'block';
        if (showToast.timer) clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => {
            toast.style.display = 'none';
        }, 2200);
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function csvEscape(val) {
        if (val === null || val === undefined) return '""';
        const str = String(val);
        if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return `"${str}"`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
})();
