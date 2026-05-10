// ==UserScript==
// @name         YouTube to Bilibili Jump
// @namespace    http://tampermonkey.net/
// @version      0.5.1
// @description  在 YouTube 左上角添加极小半透明按钮，左键直接跳 B 站第一个结果，右键打开面板（搜索词可编辑）。
// @author       TheodorePeng
// @match        https://www.youtube.com/watch*
// @run-at       document-end
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = '[YT->Bili]';
    const BTN_ID = 'yt-to-bili-btn';
    const PANEL_ID = 'yt-to-bili-panel';
    const INPUT_ID = 'yt-to-bili-input';
    const STYLE_ID = 'yt-to-bili-style';
    // --------------------------------------------------
    // Utilities
    // --------------------------------------------------
    function log() {
        console.log(LOG_PREFIX, Array.from(arguments).join(' '));
    }

    function err(msg) {
        console.error(LOG_PREFIX, msg);
    }

    // --------------------------------------------------
    // Video info extraction (robust selectors)
    // --------------------------------------------------
    function getVideoTitle() {
        // Try multiple selectors for YouTube's current DOM
        const selectors = [
            'h1.ytd-video-primary-info-renderer',
            'h1.ytd-watch-metadata yt-formatted-string',
            'h1.ytd-watch-metadata',
            '#title h1 yt-formatted-string',
            'yt-formatted-string.ytd-video-primary-info-renderer',
            '[itemprop="name"]'
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) {
                return el.textContent.trim();
            }
        }
        // Fallback: parse from page title "Video Title - YouTube"
        const pageTitle = document.title.replace(/\s+- YouTube$/, '').trim();
        return pageTitle;
    }

    function getChannelName() {
        const selectors = [
            '#channel-name yt-formatted-string',
            '#channel-name a',
            'ytd-video-owner-renderer #channel-name yt-formatted-string',
            'ytd-video-owner-renderer a#channel-link yt-formatted-string',
            '[itemprop="author"] [itemprop="name"]',
            '#owner-name yt-formatted-string'
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) {
                return el.textContent.trim();
            }
        }
        return '';
    }

    function buildSearchQuery() {
        const title = getVideoTitle();
        const channel = getChannelName();
        log('Extracted title:', title, '| channel:', channel);
        let query = title;
        if (channel && !title.toLowerCase().includes(channel.toLowerCase())) {
            query = channel + ' ' + title;
        }
        return query;
    }

    // --------------------------------------------------
    // CSS injection (external stylesheet approach)
    // --------------------------------------------------
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = [
            '#' + BTN_ID + ' {',
            '  position: fixed !important;',
            '  left: 3px !important;',
            '  top: 40px !important;',
            '  z-index: 9999 !important;',
            '  width: 20px !important;',
            '  height: 20px !important;',
            '  background: rgba(0, 161, 214, 0.45) !important;',
            '  color: #fff !important;',
            '  border: none !important;',
            '  border-radius: 50% !important;',
            '  padding: 0 !important;',
            '  font-size: 10px !important;',
            '  font-weight: 700 !important;',
            '  cursor: pointer !important;',
            '  line-height: 20px !important;',
            '  text-align: center !important;',
            '  font-family: "YouTube Sans", "Segoe UI", sans-serif !important;',
            '  user-select: none !important;',
            '  opacity: 0.5 !important;',
            '  transition: opacity 0.2s ease, background 0.2s ease !important;',
            '}',
            '#' + BTN_ID + ':hover {',
            '  opacity: 1 !important;',
            '  background: #00A1D6 !important;',
            '}',
            '#' + BTN_ID + ':active { background: #0082B3 !important; }',
            '#' + PANEL_ID + ' {',
            '  position: fixed !important;',
            '  bottom: 130px !important;',
            '  right: 24px !important;',
            '  z-index: 10000 !important;',
            '  background: #1e1e1e !important;',
            '  color: #fff !important;',
            '  border-radius: 8px !important;',
            '  padding: 16px !important;',
            '  width: 340px !important;',
            '  box-shadow: 0 4px 24px rgba(0,0,0,0.5) !important;',
            '  display: none !important;',
            '  flex-direction: column !important;',
            '  gap: 12px !important;',
            '  font-family: "YouTube Sans", "Segoe UI", sans-serif !important;',
            '  box-sizing: border-box !important;',
            '}',
            '#' + PANEL_ID + '.visible { display: flex !important; }',
            '.ytbili-ptitle { font-size: 14px; font-weight: 700; color: #00A1D6; }',
            '.ytbili-label { font-size: 11px; color: #aaa; margin-bottom: 4px; }',
            '#' + INPUT_ID + ' {',
            '  width: 100% !important;',
            '  background: #2a2a2a !important;',
            '  color: #fff !important;',
            '  border: 1px solid #444 !important;',
            '  border-radius: 4px !important;',
            '  padding: 8px 10px !important;',
            '  font-size: 13px !important;',
            '  outline: none !important;',
            '  box-sizing: border-box !important;',
            '}',
            '#' + INPUT_ID + ':focus { border-color: #00A1D6 !important; }',
            '.ytbili-brow { display: flex !important; gap: 8px !important; }',
            '.ytbili-btn {',
            '  flex: 1 !important;',
            '  border-radius: 4px !important;',
            '  padding: 8px !important;',
            '  font-size: 13px !important;',
            '  cursor: pointer !important;',
            '  font-weight: 600 !important;',
            '  border: none !important;',
            '}',
            '.ytbili-primary { background: #00A1D6 !important; color: #fff !important; }',
            '.ytbili-secondary { background: #2a2a2a !important; color: #ccc !important; border: 1px solid #444 !important; }',
            '.ytbili-cancel { background: transparent !important; color: #888 !important; border: 1px solid #444 !important; }',
            '.ytbili-auto {',
            '  background: linear-gradient(135deg, #FF6A00, #FF1E8A) !important;',
            '  color: #fff !important;',
            '  border: none !important;',
            '  border-radius: 4px !important;',
            '  padding: 8px !important;',
            '  font-size: 13px !important;',
            '  font-weight: 700 !important;',
            '  cursor: pointer !important;',
            '  width: 100% !important;',
            '  text-align: center !important;',
            '}',
            '.ytbili-auto:hover { opacity: 0.9 !important; }',
            '.ytbili-auto:active { opacity: 0.8 !important; }',
            '.ytbili-auto:disabled { opacity: 0.5 !important; cursor: not-allowed !important; }'
        ].join('\n');
        document.head.appendChild(s);
        log('Styles injected');
    }

    // --------------------------------------------------
    // Panel
    // --------------------------------------------------
    function buildPanel() {
        var exist = document.getElementById(PANEL_ID);
        if (exist) exist.remove();

        var panel = document.createElement('div');
        panel.id = PANEL_ID;

        var title = document.createElement('div');
        title.className = 'ytbili-ptitle';
        title.textContent = '在 B 站搜索此视频';

        var label = document.createElement('div');
        label.className = 'ytbili-label';
        label.textContent = '搜索词（可编辑）';

        var input = document.createElement('input');
        input.id = INPUT_ID;
        input.type = 'text';
        input.placeholder = '正在提取视频信息...';

        // Auto-jump button (full width, above the row)
        var autoBtn = document.createElement('button');
        autoBtn.id = 'yt-to-bili-auto-btn';
        autoBtn.className = 'ytbili-auto';
        autoBtn.textContent = '自动跳转 B 站视频';
        autoBtn.addEventListener('click', function () {
            jumpAuto(input.value, autoBtn);
        });

        var row = document.createElement('div');
        row.className = 'ytbili-brow';

        var searchBtn = document.createElement('button');
        searchBtn.className = 'ytbili-btn ytbili-primary';
        searchBtn.textContent = 'B站搜索';
        searchBtn.addEventListener('click', function () {
            doSearch(input.value);
        });

        var copyBtn = document.createElement('button');
        copyBtn.className = 'ytbili-btn ytbili-secondary';
        copyBtn.textContent = '复制';
        copyBtn.addEventListener('click', function () {
            if (!input.value) return;
            GM_setClipboard(input.value);
            copyBtn.textContent = '已复制!';
            setTimeout(function () { copyBtn.textContent = '复制'; }, 1500);
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'ytbili-btn ytbili-cancel';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', closePanel);

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') doSearch(input.value);
            if (e.key === 'Escape') closePanel();
        });

        row.appendChild(searchBtn);
        row.appendChild(copyBtn);
        row.appendChild(cancelBtn);

        panel.appendChild(title);
        panel.appendChild(label);
        panel.appendChild(input);
        panel.appendChild(autoBtn);
        panel.appendChild(row);

        document.body.appendChild(panel);
        log('Panel built');
    }

    // --------------------------------------------------
    // Floating button
    // --------------------------------------------------
    function buildButton() {
        const exist = document.getElementById(BTN_ID);
        if (exist) exist.remove();

        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.textContent = 'B';
        btn.title = '左键：直接跳 B 站 | 右键：打开面板';

        // Left click: direct auto-jump (no panel)
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const q = buildSearchQuery();
            if (q) {
                jumpAuto(q, {
                    get textContent() { return '跳转中'; },
                    set textContent(v) { },
                    get disabled() { return false; },
                    set disabled(v) { }
                });
            }
        });

        // Right click: open panel as backup
        btn.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const input = document.getElementById(INPUT_ID);
            if (input) input.value = buildSearchQuery();
            openPanel();
        });

        document.body.appendChild(btn);
        log('Button built, appended to body');
    }

    // --------------------------------------------------
    // Panel toggle
    // --------------------------------------------------
    function togglePanel() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        if (panel.classList.contains('visible')) {
            closePanel();
        } else {
            openPanel();
        }
    }

    function openPanel() {
        const panel = document.getElementById(PANEL_ID);
        const input = document.getElementById(INPUT_ID);
        if (!panel || !input) return;
        input.value = buildSearchQuery();
        panel.classList.add('visible');
        log('Panel opened');
        setTimeout(function () { input.focus(); }, 50);
    }

    function closePanel() {
        const panel = document.getElementById(PANEL_ID);
        if (panel) panel.classList.remove('visible');
    }

    // --------------------------------------------------
    // Actions
    // --------------------------------------------------
    function doSearch(query) {
        if (!query || !query.trim()) {
            err('Empty query, skipping');
            return;
        }
        const url = 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(query.trim());
        log('Opening Bilibili search:', url);
        GM_openInTab(url, { active: true });
        closePanel();
    }

    function jumpDirect() {
        const q = buildSearchQuery();
        if (q) doSearch(q);
    }

    function jumpAuto(query, btnEl) {
        if (!query || !query.trim()) {
            err('Empty query for auto jump');
            return;
        }
        var originalText = btnEl.textContent;
        btnEl.textContent = '搜索中...';
        btnEl.disabled = true;
        closePanel();

        var encoded = encodeURIComponent(query.trim());
        var apiUrl = 'https://api.bilibili.com/x/web-interface/search/all/v2?keyword=' + encoded + '&page=1';

        log('Auto-jump API:', apiUrl);

        GM_xmlhttpRequest({
            method: 'GET',
            url: apiUrl,
            headers: {
                'Referer': 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0'
            },
            onload: function (response) {
                btnEl.textContent = originalText;
                btnEl.disabled = false;
                try {
                    var data = JSON.parse(response.responseText);
                    if (data.code !== 0 || !data.data || !data.data.result) {
                        err('API error:', data.message);
                        // Fallback to search page
                        doSearch(query);
                        return;
                    }
                    var results = data.data.result;
                    // Find first video type result
                    var videoResult = null;
                    for (var i = 0; i < results.length; i++) {
                        if (results[i].result_type === 'video') {
                            videoResult = results[i].data[0];
                            break;
                        }
                    }
                    if (!videoResult) {
                        log('No video result found, falling back to search page');
                        doSearch(query);
                        return;
                    }
                    var bvid = videoResult.bvid;
                    var biliUrl = 'https://www.bilibili.com/video/' + bvid;
                    log('Found BV:', bvid, '->', biliUrl);
                    GM_openInTab(biliUrl, { active: true });
                } catch (e) {
                    err('Parse error:', e.message);
                    doSearch(query);
                }
            },
            onerror: function () {
                btnEl.textContent = originalText;
                btnEl.disabled = false;
                err('Network error, falling back to search page');
                doSearch(query);
            }
        });
    }

    // --------------------------------------------------
    // SPA navigation guard — only run on actual watch pages
    // --------------------------------------------------
    function isWatchPage() {
        return /^\/watch/.test(window.location.pathname);
    }

    function cleanup() {
        var btn = document.getElementById(BTN_ID);
        var panel = document.getElementById(PANEL_ID);
        if (btn) btn.remove();
        if (panel) panel.remove();
        state.initialized = false;
        log('Cleaned up (left watch page)');
    }

    var state = { initialized: false };

    function tryInit() {
        if (!isWatchPage()) {
            cleanup();
            return;
        }
        if (state.initialized) return;
        state.initialized = true;
        log('Watch page confirmed, initializing...');
        injectStyles();
        buildButton();
        buildPanel();
        GM_registerMenuCommand('YT->Bili: 跳转 B 站搜索', jumpDirect);
        GM_registerMenuCommand('YT->Bili: 自动跳转 B 站视频', function () {
            var q = buildSearchQuery();
            if (q) jumpAuto(q, { textContent: '自动跳转 B 站视频', disabled: false });
        });
        log('Init complete');
    }

    // --------------------------------------------------
    // Bootstrap
    // --------------------------------------------------
    function bootstrap() {
        log('Bootstrap, readyState:', document.readyState, '| pathname:', window.location.pathname);
        if (document.body) {
            setTimeout(tryInit, 1200);
        } else {
            setTimeout(bootstrap, 200);
        }
    }

    // Watch for SPA navigation (YouTube changes URL without full page reload)
    function setupSPAWatcher() {
        // Listen for URL changes via MutationObserver on <yt-page-navigation优先级_传递-ve-root>
        // or simply on title changes (YouTube updates title on navigation)
        var lastUrl = window.location.href;
        var observer = new MutationObserver(function () {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                log('URL changed to:', window.location.pathname);
                if (isWatchPage()) {
                    // Re-init on watch page navigation
                    state.initialized = false;
                    tryInit();
                } else {
                    cleanup();
                }
            }
        });

        // Also listen to popstate for back/forward navigation
        window.addEventListener('popstate', function () {
            log('popstate, pathname:', window.location.pathname);
            if (isWatchPage()) {
                state.initialized = false;
                tryInit();
            } else {
                cleanup();
            }
        });

        // Observe the document title — YouTube updates it on navigation
        observer.observe(document.querySelector('title') || document.head, {
            subtree: true,
            characterData: true,
            childList: true
        });
        log('SPA watcher active');
    }

    // Kick off
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        bootstrap();
        setupSPAWatcher();
    } else {
        window.addEventListener('load', function () {
            setTimeout(function () {
                bootstrap();
                setupSPAWatcher();
            }, 1000);
        });
    }
})();
