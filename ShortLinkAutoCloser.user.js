// ==UserScript==
// @name         ShortLink Auto Closer
// @namespace    http://tampermonkey.net/
// @version      0.1.1
// @description  让 Shortlink Studio 自己打开外部 URL scheme，然后自动关闭 /1/ 中转标签页。
// @author       TheodorePeng
// @match        https://www.shortlink.studio/1/*
// @match        https://shortlink.studio/1/*
// @run-at       document-start
// @grant        window.close
// @noframes
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/ShortLinkAutoCloser.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/ShortLinkAutoCloser.user.js
// ==/UserScript==

(function () {
    'use strict';

    const CLOSE_ATTEMPT_DELAYS_MS = [1200, 2500, 4000];
    const LOG_PREFIX = '[ShortLinkAutoCloser]';
    let closeScheduled = false;

    function log(message) {
        console.log(LOG_PREFIX, message);
    }

    function isShortlinkAutoPage() {
        return window.location.pathname.startsWith('/1/')
            && window.location.pathname.length > '/1/'.length;
    }

    function closeCurrentTab(delayMs) {
        log('Attempting to close the Shortlink tab after ' + delayMs + ' ms.');

        try {
            window.close();
        } catch (error) {
            log('window.close() threw an error: ' + error);
        }
    }

    function scheduleClose() {
        if (closeScheduled) return;
        closeScheduled = true;

        log('Injected. Shortlink will handle the URL scheme; close attempts are scheduled at '
            + CLOSE_ATTEMPT_DELAYS_MS.join(', ')
            + ' ms.');

        CLOSE_ATTEMPT_DELAYS_MS.forEach(function (delayMs) {
            window.setTimeout(function () {
                closeCurrentTab(delayMs);
            }, delayMs);
        });
    }

    function init() {
        if (!isShortlinkAutoPage()) return;
        scheduleClose();
    }

    init();
})();
