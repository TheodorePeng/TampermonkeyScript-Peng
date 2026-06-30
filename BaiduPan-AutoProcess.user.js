// ==UserScript==
// @name         Baidupan 批量触发AI内容生成
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  批量点击百度网盘视频的文稿/课件/AI看按钮，支持按键交互控制
// @author       TheodorePeng
// @match        *://pan.baidu.com/pfile/video*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/BaiduPan-AutoProcess.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/BaiduPan-AutoProcess.user.js
// ==/UserScript==

(() => {
    "use strict";

    // ============================================================
    // 1. 配置区 (Config)
    // ============================================================
    const DEFAULT_CONFIG = {
        loopCount: 14,
        pageLoadDelaySec: 2,
        continueKey: 'Y',
        stopKey: 'N',
        keyTimeoutSec: 30,
        delays: {
            '文稿': 1,
            '课件': 1,
            'AI看': 1,
            '笔记': 1,
        },
    };

    const LS_KEY = "bap_settings";
    const PROCESS_KEY = "bap_processed_videos";

    // ============================================================
    // 2. 样式 (CSS)
    // ============================================================
    const CSS = `
        .bap-modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            z-index: 99998;
            display: flex; align-items: center; justify-content: center;
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            pointer-events: none;
        }
        .bap-modal {
            background: rgba(255,255,255,0.97); border-radius: 16px; width: 400px;
            max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; color: #333;
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.6);
            pointer-events: all;
        }
        .bap-modal-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 16px 20px;
            background: linear-gradient(135deg, #4a90e2, #357abd); color: #fff;
        }
        .bap-modal-header h2 { margin: 0; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
        .bap-modal-close { background: none; border: none; color: rgba(255,255,255,.8); font-size: 20px; cursor: pointer; padding: 0; line-height: 1; transition: color .2s; }
        .bap-modal-close:hover { color: #fff; }
        .bap-modal-body { padding: 20px; }
        .bap-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .bap-row label { font-size: 14px; color: #555; font-weight: 500; }
        .bap-row .bap-input { width: 60px; padding: 6px 10px; border: 1.5px solid #ddd; border-radius: 8px; font-size: 14px; text-align: center; outline: none; transition: border-color .2s; }
        .bap-row .bap-input:focus { border-color: #4a90e2; }
        .bap-row .bap-input-wide { width: 80px; }
        .bap-row .bap-hint { font-size: 11px; color: #999; margin-top: 3px; }
        .bap-modal-footer { padding: 0 20px 20px; }
        .bap-btn-primary {
            width: 100%; padding: 12px;
            background: linear-gradient(135deg, #4a90e2, #357abd);
            color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 600;
            cursor: pointer; transition: all .2s;
            display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .bap-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(74,144,226,.4); }
        .bap-btn-primary:active { transform: translateY(0); }

        /* Toast */
        .bap-toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 99999; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
        .bap-toast {
            padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 500; color: #fff;
            box-shadow: 0 4px 12px rgba(0,0,0,.15); animation: bap-toast-in .3s ease;
            display: flex; align-items: center; gap: 8px; max-width: 300px;
        }
        .bap-toast.bap-toast-success { background: #34a853; }
        .bap-toast.bap-toast-error   { background: #ea4335; }
        .bap-toast.bap-toast-warn    { background: #fbbc04; color: #333; }
        .bap-toast.bap-toast-info    { background: #4a90e2; }
        @keyframes bap-toast-in { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes bap-toast-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(20px); } }

        /* Status Card */
        .bap-status-card {
            position: fixed; top: 80px; right: 24px; z-index: 99997;
            background: rgba(255,255,255,.95); border: 1px solid rgba(0,0,0,.1);
            border-radius: 14px; padding: 14px 16px; min-width: 200px;
            box-shadow: 0 8px 24px rgba(0,0,0,.12);
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #333; display: none;
        }
        .bap-status-card.bap-visible { display: block; }
        .bap-status-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; color: #222; }
        .bap-status-spinner { width: 14px; height: 14px; border: 2px solid #e0e0e0; border-top-color: #4a90e2; border-radius: 50%; animation: bap-spin .8s linear infinite; }
        @keyframes bap-spin { to { transform: rotate(360deg); } }
        .bap-status-item { display: flex; align-items: center; gap: 6px; font-size: 13px; padding: 3px 0; color: #555; }
        .bap-status-item.bap-done { color: #34a853; }
        .bap-status-item.bap-waiting { color: #fbbc04; }
        .bap-status-item.bap-stopped { color: #ea4335; }
        .bap-key-hint-box { margin-top: 10px; padding: 8px 10px; background: #f8f8f8; border-radius: 8px; font-size: 12px; color: #666; text-align: center; }
        .bap-key-hint-box strong { color: #333; }
        .bap-progress-bar { width: 100%; height: 4px; background: #e0e0e0; border-radius: 2px; margin-top: 10px; overflow: hidden; }
        .bap-progress-fill { height: 100%; background: linear-gradient(90deg, #4a90e2, #34a853); border-radius: 2px; transition: width .4s ease; }

        /* Confirm Overlay */
        .bap-confirm-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            z-index: 99998;
            display: flex; align-items: center; justify-content: center;
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: none;
            pointer-events: none;
        }
        .bap-confirm-overlay.bap-visible { display: flex; }
        .bap-confirm-box {
            background: rgba(255,255,255,0.97); border-radius: 16px; padding: 24px; width: 320px;
            text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.2);
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.6);
            pointer-events: all;
        }
        .bap-confirm-box h3 { margin: 0 0 8px; font-size: 16px; color: #222; }
        .bap-confirm-box p { margin: 0 0 16px; font-size: 13px; color: #666; }
        .bap-confirm-keys { display: flex; gap: 12px; justify-content: center; }
        .bap-confirm-key { padding: 8px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; border: none; cursor: pointer; transition: all .2s; }
        .bap-confirm-key.bap-key-continue { background: #34a853; color: #fff; }
        .bap-confirm-key.bap-key-continue:hover { background: #2d9147; }
        .bap-confirm-key.bap-key-stop { background: #ea4335; color: #fff; }
        .bap-confirm-key.bap-key-stop:hover { background: #d33828; }

        /* Trigger Button */
        .bap-trigger-btn {
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 99996;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: rgba(74, 144, 226, 0.75);
            border: 1.5px solid rgba(255,255,255,0.5);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 12px rgba(74,144,226,.3);
            transition: transform .2s, background .2s, box-shadow .2s;
            color: #fff;
            font-size: 14px;
        }
        .bap-trigger-btn:hover {
            transform: scale(1.15);
            background: rgba(74, 144, 226, 0.9);
            box-shadow: 0 4px 18px rgba(74,144,226,.45);
        }
        .bap-trigger-btn:active { transform: scale(0.92); }
        /* Tooltip */
        .bap-trigger-btn::after {
            content: attr(data-tip);
            position: absolute;
            right: calc(100% + 8px);
            top: 50%;
            transform: translateY(-50%);
            background: rgba(0,0,0,.82);
            color: #fff;
            font-size: 12px;
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            white-space: nowrap;
            padding: 5px 10px;
            border-radius: 6px;
            pointer-events: none;
            opacity: 0;
            transition: opacity .2s;
        }
        .bap-trigger-btn:hover::after { opacity: 1; }
    `;

    // ============================================================
    // 3. 状态
    // ============================================================
    let config = { ...DEFAULT_CONFIG };
    let isRunning = false;
    let currentVideoIndex = 0;
    let currentVideoName = '';
    let currentUrl = '';
    let statusCard = null;
    let confirmOverlay = null;
    let toastContainer = null;
    let keyResolve = null;  // 全局按键 resolver，供 waitForKey 使用
    let keyTimer = null;   // waitForKey 的超时 timer
    let gInterruptKey = null; // 全局中断按键：在任意 sleep 期间也可设置，优先被 waitForKey 消费

    // ============================================================
    // 4. 工具函数
    // ============================================================
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function isVisibleNode(node) {
        if (!(node instanceof HTMLElement)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function isControlBarVisible(node) {
        if (!isVisibleNode(node)) return false;
        const bar = node.closest('.vp-video__control-bar');
        if (!bar) return isVisibleNode(node);
        const op = parseFloat(window.getComputedStyle(bar).opacity || '1');
        return op > 0.5;
    }

    function findPlayerVideoElement() {
        const scope = document.querySelector('.drager_left') || document;
        const videos = Array.from(scope.querySelectorAll('video'));
        const visible = videos.filter(isVisibleNode);
        const candidates = visible.length ? visible : videos;
        candidates.sort((a, b) => {
            const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
            return (rb.width * rb.height) - (ra.width * ra.height);
        });
        return candidates[0] || null;
    }

    async function waitForElement(predicate, options = {}) {
        const { timeoutMs = 5000, intervalMs = 200, description = 'element' } = options;
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const el = predicate();
            if (el) return el;
            await delay(intervalMs);
        }
        return null;
    }

    function loadSettings() {
        try {
            const raw = GM_getValue(LS_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                config = {
                    ...DEFAULT_CONFIG,
                    ...saved,
                    delays: { ...DEFAULT_CONFIG.delays, ...(saved.delays || {}) }
                };
            }
        } catch (e) { config = { ...DEFAULT_CONFIG }; }
    }

    function saveSettings() {
        try { GM_setValue(LS_KEY, JSON.stringify(config)); } catch (e) {}
    }

    function getProcessedVideos() {
        try {
            const raw = localStorage.getItem(PROCESS_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    }

    function markVideoProcessed(path) {
        try {
            const map = getProcessedVideos();
            map[path] = Date.now();
            localStorage.setItem(PROCESS_KEY, JSON.stringify(map));
        } catch {}
    }

    /**
     * 获取元素的第一层文字（不包含子元素文字）
     * @param {Element} el
     * @returns {string}
     */
    function getDirectText(el) {
        if (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE) {
            return el.firstChild.textContent.trim();
        }
        return '';
    }

    /**
     * 通过第一层文字精确匹配并点击元素
     * @param {string} text
     * @returns {boolean}
     */
    function clickByText(text) {
        const all = document.querySelectorAll('*');
        for (const el of all) {
            if (getDirectText(el) === text) {
                el.click();
                return true;
            }
        }
        return false;
    }

    /**
     * 查找第一层文字匹配的元素
     * @param {string} text
     * @returns {Element|null}
     */
    function findElementContaining(text) {
        const all = document.querySelectorAll('*');
        for (const el of all) {
            if (getDirectText(el) === text) return el;
        }
        return null;
    }

    // ============================================================
    // 5. UI
    // ============================================================
    function injectStyles() { GM_addStyle(CSS); }

    function buildToastContainer() {
        const c = document.createElement('div');
        c.className = 'bap-toast-container';
        c.id = 'bap-toast-container';
        document.body.appendChild(c);
        return c;
    }

    function showToast(msg, type, duration) {
        type = type || 'info';
        duration = duration || 1500;
        if (!toastContainer) toastContainer = buildToastContainer();
        const t = document.createElement('div');
        t.className = 'bap-toast bap-toast-' + type;
        const icons = { success: '&#10004;', error: '&#10060;', warn: '&#9888;', info: '&#8505;' };
        t.innerHTML = '<span>' + icons[type] + '</span><span>' + msg + '</span>';
        toastContainer.appendChild(t);
        setTimeout(() => {
            t.style.animation = 'bap-toast-out .3s ease forwards';
            setTimeout(() => t.remove(), 300);
        }, duration);
    }

    function updateStatusCard(items, progress) {
        if (!statusCard) return;
        const body = statusCard.querySelector('.bap-status-body');
        if (!body) return;
        let html = '<div class="bap-status-title"><div class="bap-status-spinner"></div><span>第 ' + (currentVideoIndex + 1) + ' / ' + config.loopCount + ' 个视频</span></div>';
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            let cls = 'bap-status-item';
            let icon = '&#8987;';
            if (item.status === 'done') { cls += ' bap-done'; icon = '&#10004;'; }
            else if (item.status === 'waiting') { cls += ' bap-waiting'; icon = '&#8987;'; }
            else if (item.status === 'stopped') { cls += ' bap-stopped'; icon = '&#9940;'; }
            html += '<div class="' + cls + '"><span class="bap-icon">' + icon + '</span>' + item.label + '</div>';
        }
        if (progress !== undefined) {
            html += '<div class="bap-progress-bar"><div class="bap-progress-fill" style="width:' + progress + '%"></div></div>';
        }
        body.innerHTML = html;
    }

    function buildStatusCard() {
        const card = document.createElement('div');
        card.className = 'bap-status-card';
        card.id = 'bap-status-card';
        card.innerHTML = '<div class="bap-status-body"></div><div class="bap-key-hint-box">按 <strong>' + config.continueKey + '</strong> 继续到下一集 &middot; 按 <strong>' + config.stopKey + '</strong> 停止</div>';
        document.body.appendChild(card);
        return card;
    }

    /**
     * 全局按键等待 — 在整个脚本运行期间随时可响应按键
     * @param {string} message - 弹窗中显示的消息
     * @param {number} timeoutMs - 超时毫秒数
     * @returns {Promise<string>} 'continue' | 'stop' | 'timeout'
     */
    function waitForKey(message, timeoutMs) {
        return new Promise((resolve) => {
            // 优先检查 sleep 期间记录的按键
            if (gInterruptKey) {
                const r = gInterruptKey;
                gInterruptKey = null;
                resolve(r);
                return;
            }
            keyResolve = resolve;
            clearTimeout(keyTimer);

            if (!confirmOverlay) {
                confirmOverlay = document.createElement('div');
                confirmOverlay.className = 'bap-confirm-overlay';
                confirmOverlay.innerHTML =
                    '<div class="bap-confirm-box">' +
                    '<h3>&#9208; 等待确认</h3>' +
                    '<p id="bap-confirm-msg">' + (message || '') + '</p>' +
                    '<div class="bap-confirm-keys">' +
                    '<button class="bap-confirm-key bap-key-continue" id="bap-btn-continue">' + config.continueKey + ' 继续</button>' +
                    '<button class="bap-confirm-key bap-key-stop" id="bap-btn-stop">' + config.stopKey + ' 停止</button>' +
                    '</div>' +
                    '<p id="bap-confirm-timeout" style="margin-top:12px;font-size:11px;color:#999;">超时 ' + config.keyTimeoutSec + ' 秒后自动停止</p>' +
                    '</div>';
                document.body.appendChild(confirmOverlay);

                document.getElementById('bap-btn-continue').addEventListener('click', function() {
                    confirmOverlay.classList.remove('bap-visible');
                    keyResolve = null;
                    resolve('continue');
                });
                document.getElementById('bap-btn-stop').addEventListener('click', function() {
                    confirmOverlay.classList.remove('bap-visible');
                    keyResolve = null;
                    resolve('stop');
                });
            } else {
                document.getElementById('bap-confirm-msg').textContent = message || '';
            }

            confirmOverlay.classList.add('bap-visible');

            // 超时自动 resolve
            keyTimer = setTimeout(() => {
                if (keyResolve === resolve) {
                    keyResolve = null;
                    confirmOverlay.classList.remove('bap-visible');
                    resolve('timeout');
                }
            }, timeoutMs);
        });
    }

    /**
     * 全局按键监听器 — 在 run() 期间始终生效
     * - keyResolve 有值时（waitForKey 等待中）：立即 resolve
     * - keyResolve 为 null 时（sleep 等任意时刻）：存入 gInterruptKey，由下次 waitForKey 消费
     */
    function onKeydown(e) {
        const key = e.key.toUpperCase();
        const isContinue = key === config.continueKey.toUpperCase();
        const isStop = key === config.stopKey.toUpperCase();
        if (!isContinue && !isStop) return;

        if (keyResolve) {
            // waitForKey 等待中，立即中断
            clearTimeout(keyTimer);
            keyResolve(isContinue ? 'continue' : 'stop');
            keyResolve = null;
            if (confirmOverlay) confirmOverlay.classList.remove('bap-visible');
        } else {
            // 任意时刻按下，记录到 gInterruptKey
            gInterruptKey = isContinue ? 'continue' : 'stop';
        }
    }

    function buildSettingsPanel() {
        const existing = document.getElementById('bap-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'bap-modal-overlay';
        overlay.id = 'bap-modal-overlay';

        overlay.innerHTML =
            '<div class="bap-modal">' +
            '<div class="bap-modal-header">' +
            '<h2>&#9881; 批量自动生成设置</h2>' +
            '<button class="bap-modal-close" id="bap-modal-close">&#10005;</button>' +
            '</div>' +
            '<div class="bap-modal-body">' +
            '<div class="bap-row"><div><label>循环次数</label><div class="bap-hint">要处理多少个视频</div></div><input type="number" class="bap-input bap-input-wide" id="bap-loop-count" value="' + config.loopCount + '" min="1" max="999"></div>' +
            '<div class="bap-row"><div><label>下一集后等待</label><div class="bap-hint">点击下一集后等多久(秒)</div></div><input type="number" class="bap-input" id="bap-page-delay" value="' + config.pageLoadDelaySec + '" min="0" max="30" step="0.5"></div>' +
            '<div class="bap-row"><div><label>继续 / 停止 按键</label><div class="bap-hint">按键控制是否跳到下一集</div></div><div style="display:flex;align-items:center;gap:6px;"><input type="text" class="bap-input" id="bap-continue-key" value="' + config.continueKey + '" maxlength="1" style="width:40px;"><span style="color:#999;font-size:13px;">/</span><input type="text" class="bap-input" id="bap-stop-key" value="' + config.stopKey + '" maxlength="1" style="width:40px;"></div></div>' +
            '<div class="bap-row"><div><label>按键超时</label><div class="bap-hint">等待按键的超时时间(秒)</div></div><input type="number" class="bap-input" id="bap-key-timeout" value="' + config.keyTimeoutSec + '" min="5" max="300" step="5"></div>' +
            '<div style="margin: 16px 0 8px; font-size:12px; color:#555; font-weight:600;">各按钮点击后等待(秒)</div>' +
            '<div class="bap-row"><div><label>文稿</label></div><input type="number" class="bap-input" id="bap-delay-doc" value="' + (config.delays['文稿'] || 1) + '" min="0" max="30" step="0.5"></div>' +
            '<div class="bap-row"><div><label>课件</label></div><input type="number" class="bap-input" id="bap-delay-ppt" value="' + (config.delays['课件'] || 1) + '" min="0" max="30" step="0.5"></div>' +
            '<div class="bap-row"><div><label>AI看</label></div><input type="number" class="bap-input" id="bap-delay-ai" value="' + (config.delays['AI看'] || 1) + '" min="0" max="30" step="0.5"></div>' +
            '<div class="bap-row"><div><label>笔记</label></div><input type="number" class="bap-input" id="bap-delay-note" value="' + (config.delays['笔记'] || 1) + '" min="0" max="30" step="0.5"></div>' +
            '</div>' +
            '<div class="bap-modal-footer"><button class="bap-btn-primary" id="bap-start-btn">&#128640; 开始运行</button></div>' +
            '</div>';

        document.body.appendChild(overlay);

        document.getElementById('bap-modal-close').addEventListener('click', function() { overlay.remove(); });

        document.getElementById('bap-start-btn').addEventListener('click', function() {
            config.loopCount = parseInt(document.getElementById('bap-loop-count').value) || 14;
            config.pageLoadDelaySec = parseFloat(document.getElementById('bap-page-delay').value) || 2;
            config.continueKey = document.getElementById('bap-continue-key').value.toUpperCase() || 'Y';
            config.stopKey = document.getElementById('bap-stop-key').value.toUpperCase() || 'N';
            config.keyTimeoutSec = parseInt(document.getElementById('bap-key-timeout').value) || 30;
            config.delays = {
                '文稿': parseFloat(document.getElementById('bap-delay-doc').value) || 1,
                '课件': parseFloat(document.getElementById('bap-delay-ppt').value) || 1,
                'AI看': parseFloat(document.getElementById('bap-delay-ai').value) || 1,
                '笔记': parseFloat(document.getElementById('bap-delay-note').value) || 1,
            };
            saveSettings();
            overlay.remove();
            run();
        });

        const escHandler = function(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
        document.addEventListener('keydown', escHandler);
    }

    function showStatusCard() {
        if (!statusCard) statusCard = buildStatusCard();
        statusCard.classList.add('bap-visible');
    }

    function hideStatusCard() {
        if (statusCard) statusCard.classList.remove('bap-visible');
    }

    // ============================================================
    // 6. 核心逻辑
    // ============================================================
    async function expandPlaylist() {
        showToast('正在展开播放列表...', 'info');
        // 第一步：点击"视频" tab 切换到视频列表
        const videoTabClicked = clickByText('视频');
        if (videoTabClicked) {
            showToast('已点击"视频"tab，切换中...', 'info');
            await sleep(1500);
        } else {
            showToast('未找到"视频"tab，将直接尝试展开', 'warn');
        }
        // 第二步：点击"查看全部"展开完整播放列表
        const expanded = clickByText('查看全部');
        if (expanded) {
            await sleep(1000);
            showToast('播放列表已展开', 'success');
        } else {
            showToast('未找到"查看全部"按钮', 'warn');
        }
    }

    function getCurrentVideoName() {
        const all = document.querySelectorAll('*');
        for (const el of all) {
            const text = el.textContent.trim();
            if ((text.match(/^\d+\s*-\s*第\d+课/) || text.match(/\.mp4$/)) && el.children.length === 0 && text.length < 100) {
                return text;
            }
        }
        try {
            const params = new URLSearchParams(window.location.search);
            const path = decodeURIComponent(params.get('path') || '');
            return path.split('/').pop().replace('.mp4', '') || '未知视频';
        } catch { return '未知视频'; }
    }

    /**
     * 可被按键中断的 sleep — 期间按 Y/N 会设置 gInterruptKey，调用方检测后自行处理
     */
    function interruptibleSleep(ms) {
        const start = Date.now();
        return new Promise((resolve) => {
            const check = () => {
                if (gInterruptKey) {
                    resolve(); // 被按键中断
                } else if (Date.now() - start >= ms) {
                    resolve(); // 时间到
                } else {
                    setTimeout(check, 80);
                }
            };
            check();
        });
    }

    async function clickThreeButtons() {
        const labels = ['文稿', '课件', 'AI看', '笔记'];
        for (let i = 0; i < labels.length; i++) {
            if (gInterruptKey) break; // 外部已收到停止信号，直接退出
            const label = labels[i];
            const status = labels.map((_, idx) => {
                if (idx < i) return 'done';
                if (idx === i) return 'waiting';
                return '';
            });
            updateStatusCard(
                labels.map((l, idx) => ({ label: l, status: status[idx] })),
                (i / labels.length) * 100
            );
            const delaySec = config.delays[label] || 1;
            const clicked = clickByText(label);
            showToast(
                (clicked ? '&#10004; ' : '&#9888; ') + label + (clicked ? ' 已点击，停留 ' + delaySec + 's' : ' 未找到'),
                clicked ? 'success' : 'warn', 1000
            );
            await interruptibleSleep(delaySec * 1000);
        }
        updateStatusCard(
            labels.map(l => ({ label: l, status: 'done' })),
            100
        );
    }

    async function goToNextVideo() {
        await sleep(config.pageLoadDelaySec * 1000);
        const prevUrl = window.location.href;

        // 1) 先暂停视频，确保控制条不会因 hover 状态变化而 opacity=0
        const video = findPlayerVideoElement();
        const wasPaused = !!(video && video.paused);
        if (video && !wasPaused) {
            try { video.pause(); } catch (e) {}
        }

        // 2) 用属性选择器找"下一集"按钮（不依赖动态 vjs_video_* ID）
        const nextBtn = await waitForElement(
            () => document.querySelector('[title="下一集"]'),
            { timeoutMs: 5000, intervalMs: 200, description: '下一集按钮' }
        );

        if (!nextBtn) {
            showToast('&#10060; 未找到"下一集"按钮（已等 5s）', 'error');
            return false;
        }

        // 3) 等待控制条可见（opacity > 0.5），最多 3s
        await waitForElement(
            () => (isControlBarVisible(nextBtn) ? nextBtn : null),
            { timeoutMs: 3000, intervalMs: 150, description: '控制条可见' }
        );

        // 4) 点击（最多 2 次尝试，第二次前 hover 触发控制条显示）
        let clicked = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                nextBtn.click();
                clicked = true;
                break;
            } catch (e) {
                if (attempt === 1) {
                    nextBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                    if (nextBtn.parentElement) {
                        nextBtn.parentElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                    }
                    await delay(300);
                } else {
                    showToast('&#10060; 点击"下一集"失败：' + e.message, 'error');
                    return false;
                }
            }
        }
        if (!clicked) return false;
        showToast('&#9167; 已点击"下一集"', 'info', 1000);

        // 5) 等待 URL 实际变更（取代固定 sleep）
        const urlChanged = await waitForElement(
            () => (window.location.href !== prevUrl ? true : null),
            { timeoutMs: 8000, intervalMs: 250, description: 'URL 变更' }
        );
        if (!urlChanged) {
            showToast('&#9888; 已停在最后一集，无法继续', 'warn');
            return false;
        }

        // 6) 等新页面加载（DOM ready + 视频元素就位）
        await waitForElement(() => findPlayerVideoElement(), {
            timeoutMs: 5000,
            intervalMs: 200,
            description: '新视频元素',
        });

        // 7) 恢复原播放状态（如果原本在播放）
        if (video && !wasPaused) {
            try { await video.play(); } catch (e) {}
        }
        return true;
    }

    // ============================================================
    // 7. 主流程
    // ============================================================
    async function run() {
        if (isRunning) { showToast('脚本已在运行中...', 'warn'); return; }
        isRunning = true;
        document.addEventListener('keydown', onKeydown);
        currentVideoName = getCurrentVideoName();
        showToast('&#128640; 开始运行: ' + currentVideoName, 'info');
        await expandPlaylist();
        await sleep(1000);
        showStatusCard();

        for (let i = 0; i < config.loopCount; i++) {
            currentVideoIndex = i;
            currentVideoName = getCurrentVideoName();
            currentUrl = window.location.href;
            const progress = (i / config.loopCount) * 100;
            updateStatusCard([
                { label: '文稿', status: '' },
                { label: '课件', status: '' },
                { label: 'AI看', status: '' },
                { label: '笔记', status: '' },
            ], progress);
            showToast('&#128449; 第 ' + (i + 1) + ' / ' + config.loopCount + ': ' + currentVideoName, 'info', 2000);
            await clickThreeButtons();
            markVideoProcessed(currentUrl);
            updateStatusCard([
                { label: '文稿', status: 'done' },
                { label: '课件', status: 'done' },
                { label: 'AI看', status: 'done' },
                { label: '笔记', status: 'done' },
            ], 100);
            showToast('&#9208; 第 ' + (i + 1) + ' 个完成，等待确认...', 'warn');
            const result = await waitForKey(
                '第 ' + (i + 1) + ' / ' + config.loopCount + ' 已完成\n' + currentVideoName + '\n\n按 Y 继续下一集 · 按 N 停止',
                config.keyTimeoutSec * 1000
            );
            if (result === 'continue') {
                const hasNext = await goToNextVideo();
                if (!hasNext) {
                    showToast('&#9940; 已达最后一集，脚本结束', 'error');
                    break;
                }
                await sleep(1500);
            } else {
                const msg = result === 'timeout' ? '&#9203; 按键超时，脚本结束' : '&#9940; 用户停止，脚本结束';
                showToast(msg, result === 'timeout' ? 'warn' : 'warn');
                break;
            }
        }

        document.removeEventListener('keydown', onKeydown);
        hideStatusCard();
        isRunning = false;
        showToast('&#127881; 全部处理完成！', 'success', 3000);
    }

    // ============================================================
    // 8. 悬浮触发按钮
    // ============================================================
    function buildTriggerButton() {
        const btn = document.createElement('button');
        btn.className = 'bap-trigger-btn';
        btn.id = 'bap-trigger-btn';
        btn.setAttribute('data-tip', '批量自动生成');
        btn.innerHTML = '&#9881;';
        btn.addEventListener('click', function() {
            buildSettingsPanel();
        });
        document.body.appendChild(btn);
    }

    // ============================================================
    // 8. 启动
    // ============================================================
    injectStyles();
    loadSettings();
    if (document.readyState === 'complete') {
        setTimeout(buildTriggerButton, 800);
    } else {
        window.addEventListener('load', function() { setTimeout(buildTriggerButton, 800); });
    }

})();
