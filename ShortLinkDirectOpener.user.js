// ==UserScript==
// @name         ShortLink External Scheme Opener
// @namespace    http://tampermonkey.net/
// @version      0.1.3
// @description  直接打开 ShortLink Studio 包装的外部协议链接，并自动关闭 ShortLink 中转页。
// @author       TheodorePeng
// @match        https://*.notion.site/*
// @match        https://*.notion.so/*
// @match        https://www.shortlink.studio/*
// @match        https://shortlink.studio/*
// @run-at       document-start
// @grant        window.close
// @noframes
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/ShortLinkDirectOpener.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/ShortLinkDirectOpener.user.js
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULT_ALLOWED_SCHEMES = [
        'obsidian',
        'marginnote4app',
        'notion',
        'slack',
        'zoom',
        'figma',
        'zotero',
        'kmtrigger',
        'hook',
        'things',
        'craft'
    ];
    const BLOCKED_SCHEMES = new Set(['javascript', 'data', 'file', 'chrome', 'chrome-extension', 'about']);
    const SCHEME_DISPLAY_NAMES = {
        obsidian: 'Obsidian',
        marginnote4app: 'MarginNote 4',
        notion: 'Notion',
        slack: 'Slack',
        zoom: 'Zoom',
        figma: 'Figma',
        zotero: 'Zotero',
        kmtrigger: 'Keyboard Maestro',
        hook: 'Hookmark',
        things: 'Things',
        craft: 'Craft'
    };
    const AUTO_CLOSE_DELAY_MS = 1500;
    const TOAST_DURATION_MS = 1000;
    const DEBUG = false;

    const LOG_PREFIX = '[ShortLinkExternalSchemeOpener]';
    const ALLOWED_SCHEME_SET = new Set(DEFAULT_ALLOWED_SCHEMES);
    const SHORTLINK_HOSTS = new Set(['www.shortlink.studio', 'shortlink.studio']);
    const SHORTLINK_AUTO_PATH_PREFIX = '/1/';
    const TOAST_ID = 'shortlink-direct-opener-toast';

    function debugLog() {
        if (!DEBUG) return;
        console.log(LOG_PREFIX, ...arguments);
    }

    function isShortlinkHost(hostname) {
        return SHORTLINK_HOSTS.has(String(hostname || '').toLowerCase());
    }

    function extractShortlinkTarget(href) {
        if (!href) return null;
        debugLog('Inspecting shortlink href:', href);

        let url;
        try {
            url = new URL(href, window.location.href);
        } catch (error) {
            debugLog('Invalid URL:', href, error);
            return null;
        }

        if (!isShortlinkHost(url.hostname)) return null;
        if (!url.pathname.startsWith(SHORTLINK_AUTO_PATH_PREFIX)) return null;

        const shortlinkPrefix = url.origin + SHORTLINK_AUTO_PATH_PREFIX;
        const fullHref = url.href;
        const prefixIndex = fullHref.indexOf(shortlinkPrefix);
        if (prefixIndex < 0) return null;

        const rawPayload = fullHref.slice(prefixIndex + shortlinkPrefix.length);
        if (!rawPayload) return null;

        try {
            const decodedTarget = decodeURIComponent(rawPayload);
            debugLog('Resolved shortlink target:', decodedTarget);
            return decodedTarget;
        } catch (error) {
            debugLog('Failed to decode ShortLink target:', rawPayload, error);
        }

        const fallbackScheme = getAllowedScheme(rawPayload);
        if (fallbackScheme) {
            debugLog('Using raw shortlink payload as fallback target:', rawPayload);
            return rawPayload;
        }

        return null;
    }

    function getUrlScheme(url) {
        const match = String(url || '').match(/^([a-z][a-z0-9+.-]*):/i);
        return match ? match[1].toLowerCase() : null;
    }

    function isBlockedScheme(scheme) {
        return BLOCKED_SCHEMES.has(String(scheme || '').toLowerCase());
    }

    function getAllowedScheme(url) {
        const scheme = getUrlScheme(url);
        if (!scheme) {
            debugLog('Skipped URL without scheme:', url);
            return null;
        }
        if (isBlockedScheme(scheme)) {
            debugLog('Blocked unsafe scheme:', scheme, url);
            return null;
        }
        if (!ALLOWED_SCHEME_SET.has(scheme)) {
            debugLog('Skipped unsupported scheme:', scheme, url);
            return null;
        }
        return scheme;
    }

    function getSchemeDisplayName(scheme) {
        if (!scheme) return 'App';
        if (SCHEME_DISPLAY_NAMES[scheme]) return SCHEME_DISPLAY_NAMES[scheme];
        return scheme.charAt(0).toUpperCase() + scheme.slice(1);
    }

    function resolveAllowedShortlinkTarget(href) {
        const targetUrl = extractShortlinkTarget(href);
        if (!targetUrl) return null;

        const scheme = getAllowedScheme(targetUrl);
        if (!scheme) return null;

        debugLog('Shortlink target is allowed:', { scheme: scheme, targetUrl: targetUrl });
        return { targetUrl: targetUrl, scheme: scheme };
    }

    function openExternalScheme(url) {
        try {
            window.location.assign(url);
            return true;
        } catch (error) {
            debugLog('Failed to open external scheme:', url, error);
            return false;
        }
    }

    function closestAnchor(node) {
        let element = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;

        while (element && element !== document.documentElement) {
            if (element.matches && element.matches('a[href]')) {
                return element;
            }
            element = element.parentElement;
        }

        return null;
    }

    function isPlainLeftClick(event) {
        return event
            && event.button === 0
            && !event.metaKey
            && !event.ctrlKey
            && !event.shiftKey
            && !event.altKey;
    }

    function removeToast() {
        const oldToast = document.getElementById(TOAST_ID);
        if (oldToast?.parentNode) {
            oldToast.parentNode.removeChild(oldToast);
        }
    }

    function showToast(message, isError) {
        if (!document.documentElement) return;

        removeToast();

        const toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.textContent = message;

        Object.assign(toast.style, {
            position: 'fixed',
            right: '18px',
            bottom: '18px',
            zIndex: '2147483647',
            maxWidth: '320px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: isError ? 'rgba(185, 28, 28, 0.94)' : 'rgba(17, 24, 39, 0.94)',
            color: '#fff',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.22)',
            fontSize: '13px',
            lineHeight: '1.4',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            pointerEvents: 'none',
            userSelect: 'none'
        });

        (document.body || document.documentElement).appendChild(toast);
        window.setTimeout(removeToast, TOAST_DURATION_MS);
    }

    function handleNotionClick(event) {
        if (!isPlainLeftClick(event)) return;

        const anchor = closestAnchor(event.target);
        if (!anchor) return;

        const resolved = resolveAllowedShortlinkTarget(anchor.href || anchor.getAttribute('href'));
        if (!resolved) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const appName = getSchemeDisplayName(resolved.scheme);
        showToast('正在打开 ' + appName + '...');

        if (!openExternalScheme(resolved.targetUrl)) {
            showToast('打开失败，请使用原始 ShortLink 链接。', true);
        }
    }

    function ensureFallbackBody() {
        if (!document.documentElement) return null;
        if (!document.body) {
            document.documentElement.appendChild(document.createElement('body'));
        }
        return document.body;
    }

    function renderShortlinkFallbackMessage(targetUrl, scheme) {
        const body = ensureFallbackBody();
        if (!body) return;

        const appName = getSchemeDisplayName(scheme);
        document.title = 'Opening ' + appName + '...';
        document.documentElement.style.background = '#f8fafc';

        while (body.firstChild) {
            body.removeChild(body.firstChild);
        }

        Object.assign(body.style, {
            margin: '0',
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            background: '#f8fafc',
            color: '#111827',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        });

        const panel = document.createElement('main');
        Object.assign(panel.style, {
            width: 'min(560px, calc(100vw - 32px))',
            padding: '22px 24px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            background: '#fff',
            boxShadow: '0 16px 40px rgba(15, 23, 42, 0.10)'
        });

        const title = document.createElement('h1');
        title.textContent = '正在打开 ' + appName;
        Object.assign(title.style, {
            margin: '0 0 10px',
            fontSize: '18px',
            lineHeight: '1.35'
        });

        const detail = document.createElement('p');
        detail.textContent = '如果系统已经弹出外部应用确认，请完成确认。本标签页会尝试自动关闭。';
        Object.assign(detail.style, {
            margin: '0 0 14px',
            color: '#4b5563',
            fontSize: '14px',
            lineHeight: '1.6'
        });

        const code = document.createElement('code');
        code.textContent = targetUrl;
        Object.assign(code.style, {
            display: 'block',
            overflowWrap: 'anywhere',
            padding: '10px',
            borderRadius: '6px',
            background: '#f3f4f6',
            color: '#374151',
            fontSize: '12px',
            lineHeight: '1.5'
        });

        panel.appendChild(title);
        panel.appendChild(detail);
        panel.appendChild(code);
        body.appendChild(panel);
    }

    function scheduleShortlinkTabClose() {
        window.setTimeout(function () {
            try {
                window.close();
            } catch (error) {
                debugLog('Failed to close ShortLink tab:', error);
            }
        }, AUTO_CLOSE_DELAY_MS);
    }

    function handleShortlinkRedirectPage() {
        const resolved = resolveAllowedShortlinkTarget(window.location.href);
        if (!resolved) return;

        try {
            window.stop();
        } catch (error) {
            debugLog('window.stop failed:', error);
        }

        renderShortlinkFallbackMessage(resolved.targetUrl, resolved.scheme);
        openExternalScheme(resolved.targetUrl);
        scheduleShortlinkTabClose();
    }

    function isNotionPage() {
        return /\.notion\.(site|so)$/i.test(window.location.hostname);
    }

    function init() {
        if (isNotionPage()) {
            document.addEventListener('click', handleNotionClick, true);
            return;
        }

        if (isShortlinkHost(window.location.hostname)) {
            handleShortlinkRedirectPage();
        }
    }

    init();
})();
