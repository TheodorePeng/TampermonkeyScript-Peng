// ==UserScript==
// @name         RouterPark Free Key Exporter
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  路由公园（RouterPark）免费 API Key 管理与导出面板，支持完整解密真实 Key、替换 Base URL、行末一键模拟复制详情及导出 CSV
// @author       TheodorePeng
// @match        https://routerpark.com/*/free-claude-code*
// @match        https://routerpark.com/free-claude-code*
// @match        https://routerpark.com/*/bbs*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_download
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/RouterParkFreeKeyExporter.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/RouterParkFreeKeyExporter.user.js
// ==/UserScript==

(function () {
    'use strict';

    const APP_ID = 'routerpark-freekey-exporter';
    const LOG_PREFIX = '[RouterParkExporter]';

    // 状态管理
    const state = {
        modal: null,
        extractedKeys: [],
        filterOnlyNormal: true,
        isDecrypting: false,
    };

    // 注册油猴菜单
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('✨ 打开免费 Key 管理面板', openModal);
        GM_registerMenuCommand('📂 展开页面所有折叠列表', expandAllAccordions);
    }

    injectStyles();
    mountFloatingWidget();

    /**
     * 注入 UI 样式
     */
    function injectStyles() {
        if (document.getElementById(`${APP_ID}-styles`)) return;

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
                max-width: 1200px;
                max-height: 90vh;
                border-radius: 20px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid #e2e8f0;
            }

            .dark #${APP_ID}-dialog {
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

            .dark .rp-dialog-header {
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

            .dark .rp-dialog-title {
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
            }

            .rp-dialog-close:hover {
                color: #0f172a;
                background: #e2e8f0;
            }

            .dark .rp-dialog-close:hover {
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

            .dark .rp-control-bar {
                background: #1e293b;
                border-color: #334155;
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

            .dark .rp-tag-green {
                background: rgba(34, 197, 94, 0.2);
                color: #4ade80;
            }

            .dark .rp-tag-gray {
                background: #334155;
                color: #94a3b8;
            }

            .rp-actions-quick {
                display: flex;
                align-items: center;
                gap: 8px;
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

            .dark .rp-table-container {
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

            .dark .rp-table th {
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

            .dark .rp-table td {
                border-color: #334155;
                color: #cbd5e1;
            }

            .rp-table tr:last-child td {
                border-bottom: none;
            }

            .rp-table tr:hover td {
                background: #f8fafc;
            }

            .dark .rp-table tr:hover td {
                background: rgba(51, 65, 85, 0.3);
            }

            /* API Key 完整显示，不省略截断 */
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

            .dark .rp-key-code {
                background: #0f172a;
                color: #e2e8f0;
            }

            .dark .rp-key-code.is-full {
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

            .dark .rp-badge-normal {
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

            .dark .rp-badge-exhausted {
                background: rgba(239, 68, 68, 0.2);
                color: #f87171;
            }

            /* 行操作按钮 */
            .rp-row-btn {
                padding: 4px 10px;
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
            }

            .rp-row-btn:hover {
                background: #e2e8f0;
                color: #0f172a;
                border-color: #94a3b8;
            }

            .dark .rp-row-btn {
                background: #334155;
                color: #cbd5e1;
                border-color: #475569;
            }

            .dark .rp-row-btn:hover {
                background: #475569;
                color: #ffffff;
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

            .dark .rp-dialog-footer {
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

            .dark .rp-btn-secondary {
                background: #334155;
                color: #e2e8f0;
            }
            .dark .rp-btn-secondary:hover {
                background: #475569;
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
        if (document.getElementById(`${APP_ID}-fab-container`)) return;

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
    function openModal() {
        if (!state.modal) {
            buildModal();
        }

        state.modal.style.display = 'flex';
        refreshDataFromDOM();
    }

    /**
     * 构建弹窗 DOM
     */
    function buildModal() {
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
                <div class="rp-stats-tags">
                    <span class="rp-tag rp-tag-green" id="${APP_ID}-tag-normal">正常: 0 个</span>
                    <span class="rp-tag rp-tag-gray" id="${APP_ID}-tag-total">总计: 0 个</span>
                </div>
                <div class="rp-actions-quick">
                    <button class="rp-btn rp-btn-secondary rp-btn-sm" id="${APP_ID}-btn-expand">📂 展开所有折叠分类</button>
                    <button class="rp-btn rp-btn-secondary rp-btn-sm" id="${APP_ID}-btn-toggle-filter">切换：仅看正常</button>
                    <button class="rp-btn rp-btn-primary rp-btn-sm" id="${APP_ID}-btn-decrypt-all" title="模拟点击原网页末尾按钮，批量静默获取并替换完整真实 Key 与 Base URL">⚡ 静默解密完整 Key</button>
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

        // 按钮功能绑定
        overlay.querySelector(`#${APP_ID}-btn-expand`).onclick = async () => {
            const count = await expandAllAccordions();
            refreshDataFromDOM();
            showToast(`已展开页面分类（共处理 ${count} 项）`);
        };

        overlay.querySelector(`#${APP_ID}-btn-toggle-filter`).onclick = (e) => {
            state.filterOnlyNormal = !state.filterOnlyNormal;
            e.target.textContent = state.filterOnlyNormal ? '切换：仅看正常' : '切换：查看全部';
            renderTable();
        };

        overlay.querySelector(`#${APP_ID}-btn-decrypt-all`).onclick = startSilentDecryptAll;
        overlay.querySelector(`#${APP_ID}-btn-export-csv`).onclick = exportCurrentKeysToCSV;
        overlay.querySelector(`#${APP_ID}-btn-copy-md`).onclick = copyAsMarkdown;
        overlay.querySelector(`#${APP_ID}-btn-copy-keys`).onclick = copyOnlyKeys;

        document.body.appendChild(overlay);
        state.modal = overlay;
    }

    /**
     * 纯净读取页面 DOM 数据
     */
    function refreshDataFromDOM() {
        const allTables = [...document.querySelectorAll('table')];
        const items = [];
        const seen = new Set();

        for (const table of allTables) {
            const rows = [...table.querySelectorAll('tr')].filter((r) => {
                return r.querySelector('button[title*="复制"]') && !r.querySelector('table');
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

                // 获取该行原网页中的最后一个按钮（即“复制详情”按钮）
                const rowButtons = [...row.querySelectorAll('button')];
                const lastBtn = rowButtons[rowButtons.length - 1];

                if (tds.length >= 7) {
                    // 第三方代理表格
                    vendor = tds[0] || '第三方代理';
                    typeOrModel = (tds[1] || '') + (tds[3] ? ` (${tds[3]})` : '');
                    baseUrl = tds[2] || '';
                    maskedKey = tds[4] || '';
                    status = tds[5] || (isNormal ? '正常' : '耗尽');
                    contributor = tds[6] || '';
                    date = tds[7] || '';
                } else {
                    // 官方厂商表格
                    vendor = tds[0] || '';
                    maskedKey = tds[1] || '';
                    status = tds[2] || badgeText || (isNormal ? '正常' : '耗尽');
                    contributor = tds[3] || '';
                    date = tds[4] || '';
                }

                const sig = `${vendor}|${baseUrl}|${maskedKey}`;
                if (!sig || seen.has(sig)) continue;
                seen.add(sig);

                // 检查之前是否已经有解密记录
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

        const displayItems = state.filterOnlyNormal ? state.extractedKeys.filter((i) => i.isNormal) : state.extractedKeys;

        if (footerTip) {
            footerTip.textContent = `当前展示 ${displayItems.length} 个 Key（正常状态 ${normalCount} 个）`;
        }

        if (!tableBody) return;

        if (displayItems.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 28px;">暂无数据（请先点击上方“📂 展开所有折叠分类”）</td></tr>`;
            return;
        }

        tableBody.innerHTML = displayItems
            .map((k, idx) => {
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
                        <button class="rp-row-btn" data-act="copy-row" data-idx="${idx}" title="模拟点击原网页末尾按钮，复制并更新此行数据">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect width="8" height="4" x="8" y="2" rx="1" ry="1"></rect>
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                            </svg>
                            <span>复制详情</span>
                        </button>
                    </td>
                </tr>
            `;
            })
            .join('');

        // 为每一行的“复制详情”按钮绑定精准的模拟触发事件
        tableBody.querySelectorAll('button[data-act="copy-row"]').forEach((btn) => {
            btn.onclick = async (e) => {
                const targetIdx = parseInt(btn.getAttribute('data-idx'), 10);
                const item = displayItems[targetIdx];
                if (item) {
                    await handleSingleRowCopy(item, btn);
                }
            };
        });
    }

    /**
     * 单行点击“复制详情”：完全模拟触发原网页对应行的最后一个按钮，并同步更新当前行
     */
    async function handleSingleRowCopy(item, btnElement) {
        if (!item.lastBtn) {
            showToast('⚠️ 未找到原网页对应的操作按钮');
            return;
        }

        const originalText = btnElement ? btnElement.innerHTML : '';
        if (btnElement) btnElement.innerHTML = `<span>⏳ 复制中...</span>`;

        try {
            const copiedText = await triggerButtonAndCapture(item.lastBtn, false);

            if (copiedText) {
                parseAndUpdateItem(item, copiedText);
                renderTable();
                showToast(`✅ 已复制 ${item.vendor} 完整配置到剪切板`);
            } else {
                showToast(`⚠️ 已触发原网页按钮`);
            }
        } catch (err) {
            console.error(LOG_PREFIX, '单行复制出错:', err);
            showToast(`❌ 复制失败: ${err.message}`);
        } finally {
            if (btnElement) btnElement.innerHTML = originalText;
        }
    }

    /**
     * 批量静默解密所有正常 Key：模拟点击每一行最后一个按钮，捕获解密内容并替换表格与 Base URL
     */
    async function startSilentDecryptAll() {
        if (state.isDecrypting) return;
        state.isDecrypting = true;

        const decryptBtn = document.getElementById(`${APP_ID}-btn-decrypt-all`);
        const originalBtnText = decryptBtn ? decryptBtn.textContent : '';

        // 临时屏蔽页面 Toast 弹窗
        document.body.classList.add('rp-silence-page-toasts');

        const targetItems = state.extractedKeys.filter((i) => i.isNormal && i.lastBtn);

        try {
            for (let i = 0; i < targetItems.length; i++) {
                const item = targetItems[i];
                if (decryptBtn) {
                    decryptBtn.textContent = `⏳ 解密中 (${i + 1}/${targetItems.length})...`;
                }

                const copiedText = await triggerButtonAndCapture(item.lastBtn, true);

                if (copiedText) {
                    parseAndUpdateItem(item, copiedText);
                }

                // 适度微小间隔
                await sleep(50);
            }

            renderTable();
            showToast(`🎉 成功解密 ${targetItems.length} 个 Key 的真实密钥与 Base URL！`);
            if (decryptBtn) decryptBtn.textContent = '✅ 已完成真实 Key 解密';
        } catch (err) {
            console.error(LOG_PREFIX, '批量解密出错:', err);
            showToast(`❌ 解密过程出错: ${err.message}`);
            if (decryptBtn) decryptBtn.textContent = originalBtnText;
        } finally {
            document.body.classList.remove('rp-silence-page-toasts');
            state.isDecrypting = false;
        }
    }

    /**
     * 精确的 Promise 机制：模拟点击按钮并等待剪切板内容写入
     */
    function triggerButtonAndCapture(button, isSilent = false) {
        return new Promise((resolve) => {
            let timer = null;
            const originalWriteText = navigator.clipboard.writeText;

            // 拦截当前的剪切板写入
            navigator.clipboard.writeText = async (text) => {
                clearTimeout(timer);
                if (originalWriteText) {
                    navigator.clipboard.writeText = originalWriteText;
                    // 如果不是静默模式，真实写入系统剪切板
                    if (!isSilent) {
                        try {
                            await originalWriteText.call(navigator.clipboard, text);
                        } catch (e) {}
                    }
                }
                resolve(text);
                return true;
            };

            // 超时兜底（若 1.5 秒内未响应则恢复）
            timer = setTimeout(() => {
                if (originalWriteText) {
                    navigator.clipboard.writeText = originalWriteText;
                }
                resolve('');
            }, 1500);

            // 触发原网页末尾按钮
            button.click();
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
     * 展开所有折叠分类
     */
    async function expandAllAccordions() {
        let expandedCount = 0;

        // 1. 展开各官方厂商折叠
        const tables = [...document.querySelectorAll('table')];
        for (const table of tables) {
            const tbodies = [...table.querySelectorAll('tbody')];
            for (const tb of tbodies) {
                const rows = [...tb.querySelectorAll('tr')];
                if (rows.length === 1) {
                    rows[0].click();
                    expandedCount++;
                    await sleep(60);
                }
            }
        }

        // 2. 展开第三方代理折叠
        const proxyButtons = [...document.querySelectorAll('button, div, tr')].filter((el) => {
            const text = el.innerText || '';
            return text.includes('第三方代理密钥') && (el.tagName === 'BUTTON' || el.classList.contains('cursor-pointer'));
        });

        for (const pBtn of proxyButtons) {
            const parent = pBtn.parentElement;
            if (!parent || !parent.querySelector('table')) {
                pBtn.click();
                expandedCount++;
                await sleep(150);
            }
        }

        return expandedCount;
    }

    /**
     * 导出为 CSV
     */
    function exportCurrentKeysToCSV() {
        const items = state.filterOnlyNormal ? state.extractedKeys.filter((i) => i.isNormal) : state.extractedKeys;

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
        const items = state.filterOnlyNormal ? state.extractedKeys.filter((i) => i.isNormal) : state.extractedKeys;

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
        const items = state.filterOnlyNormal ? state.extractedKeys.filter((i) => i.isNormal) : state.extractedKeys;

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
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(str).then(() => showToast(successMsg));
        }
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
        setTimeout(() => {
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
