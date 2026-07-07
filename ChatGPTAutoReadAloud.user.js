// ==UserScript==
// @name         ChatGPT Auto Read Aloud
// @namespace    http://tampermonkey.net/
// @version      0.1.4
// @description  Add manual shortcuts and optional auto-read for the latest ChatGPT response via More actions -> Read aloud.
// @author       TheodorePeng
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/ChatGPTAutoReadAloud.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/ChatGPTAutoReadAloud.user.js
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_PREFIX = '[ChatGPTAutoReadAloud]';
    const SCRIPT_VERSION = '0.1.4';
    const STORAGE_AUTO_READ = 'chatgpt-auto-read-aloud:v0.1.4:autoReadEnabled';
    const STORAGE_CONTROL_POSITION = 'chatgpt-auto-read-aloud:controlPosition';

    const TURN_SELECTOR = 'section[data-testid^="conversation-turn-"]';
    const ASSISTANT_SELECTOR = '[data-message-author-role="assistant"]';
    const MORE_ACTIONS_LABEL_RE = /^(更多操作|More actions)$/i;
    const MORE_ACTIONS_FALLBACK_RE = /(更多|more actions|more)/i;
    const READ_ALOUD_LABEL_RE = /^(朗读|Read aloud)$/i;
    const STOP_GENERATING_LABEL_RE = /(停止回答|停止生成|Stop generating|Stop responding)/i;
    const VOICE_PLAY_TESTID = 'voice-play-turn-action-button';
    const CHATGPT_BLOB_AUDIO_RE = /^blob:https:\/\/chatgpt\.com\//;

    const ROOT_ID = 'cgpt-read-aloud-root';
    const STYLE_ID = 'cgpt-read-aloud-style';

    const AUTO_SAMPLE_INTERVAL_MS = 700;
    const AUTO_STABLE_SAMPLE_COUNT = 3;
    const AUTO_READY_TIMEOUT_MS = 24000;
    const AUTO_DEBOUNCE_MS = 300;
    const MENU_WAIT_TIMEOUT_MS = 3500;
    const AUDIO_DETECT_TIMEOUT_MS = 3500;
    const READ_ITEM_NATIVE_CONFIRM_MS = 1200;
    const MENU_CLOSE_DELAY_MS = 160;
    const DRAG_THRESHOLD_PX = 4;

    const processedTurns = new Set();
    const pendingTurnIds = new Set();
    const seenAssistantTurnIds = new Set();

    let autoReadEnabled = readStoredBoolean(STORAGE_AUTO_READ, false);
    let observer = null;
    let autoCheckTimer = 0;
    let autoBusy = false;
    let actionInFlight = false;
    let lastLocationHref = window.location.href;
    let controlPositionTimer = 0;
    let controlPosition = readStoredJson(STORAGE_CONTROL_POSITION, null);
    let dragState = null;
    let suppressNextClick = false;

    init();

    function init() {
        injectStyles();
        renderControls();
        registerMenuCommands();
        bindKeyboardShortcuts();
        seedProcessedTurns();
        seedSeenAssistantTurnIds();
        observePageChanges();
        observeRouteChanges();
        bindLayoutListeners();
        updateAutoButton();
        updateControlPosition();
        log('Loaded v' + SCRIPT_VERSION + '. Auto read: ' + (autoReadEnabled ? 'on' : 'off'));
    }

    function log() {
        console.log(SCRIPT_PREFIX, ...arguments);
    }

    function readStoredBoolean(key, fallback) {
        try {
            if (typeof GM_getValue === 'function') {
                return Boolean(GM_getValue(key, fallback));
            }
            const raw = window.localStorage.getItem(key);
            return raw === null ? fallback : raw === 'true';
        } catch (error) {
            console.warn(SCRIPT_PREFIX, 'Failed to read storage:', error);
            return fallback;
        }
    }

    function writeStoredBoolean(key, value) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(key, Boolean(value));
                return;
            }
            window.localStorage.setItem(key, value ? 'true' : 'false');
        } catch (error) {
            console.warn(SCRIPT_PREFIX, 'Failed to write storage:', error);
        }
    }

    function readStoredJson(key, fallback) {
        try {
            const raw = typeof GM_getValue === 'function'
                ? GM_getValue(key, null)
                : window.localStorage.getItem(key);
            if (!raw) return fallback;
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (error) {
            console.warn(SCRIPT_PREFIX, 'Failed to read JSON storage:', error);
            return fallback;
        }
    }

    function writeStoredJson(key, value) {
        try {
            const payload = JSON.stringify(value);
            if (typeof GM_setValue === 'function') {
                GM_setValue(key, payload);
                return;
            }
            window.localStorage.setItem(key, payload);
        } catch (error) {
            console.warn(SCRIPT_PREFIX, 'Failed to write JSON storage:', error);
        }
    }

    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand !== 'function') return;

        GM_registerMenuCommand('朗读 ChatGPT 最后回复', () => {
            void readLastAssistantTurn('menu');
        });
        GM_registerMenuCommand('停止 ChatGPT 朗读', () => {
            stopPlayback();
        });
        GM_registerMenuCommand('切换自动朗读', () => {
            setAutoReadEnabled(!autoReadEnabled);
        });
    }

    function bindKeyboardShortcuts() {
        window.addEventListener('keydown', (event) => {
            if (event.repeat) return;
            if (!event.altKey || !event.shiftKey) return;

            const key = String(event.key || '').toLowerCase();
            if (key === 'r') {
                event.preventDefault();
                event.stopPropagation();
                void readLastAssistantTurn('shortcut');
            } else if (key === 's') {
                event.preventDefault();
                event.stopPropagation();
                stopPlayback();
            }
        }, true);
    }

    function renderControls() {
        if (document.getElementById(ROOT_ID)) return;

        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.tabIndex = -1;
        root.innerHTML = [
            '<div class="cgpt-ra-panel" role="group" aria-label="ChatGPT 朗读控制">',
            '  <button type="button" class="cgpt-ra-btn cgpt-ra-primary" data-action="read" aria-label="朗读最后回复 (Alt+Shift+R)" title="朗读最后回复 (Alt+Shift+R)" data-tooltip="朗读最后回复">',
            '    <svg class="cgpt-ra-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4z"></path><path d="M16.2 8.2a4 4 0 0 1 0 7.6"></path><path d="M18.8 5.6a8 8 0 0 1 0 12.8"></path></svg>',
            '  </button>',
            '  <button type="button" class="cgpt-ra-btn" data-action="stop" aria-label="停止朗读 (Alt+Shift+S)" title="停止朗读 (Alt+Shift+S)" data-tooltip="停止朗读">',
            '    <svg class="cgpt-ra-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"></rect></svg>',
            '  </button>',
            '  <button type="button" class="cgpt-ra-btn cgpt-ra-toggle" data-action="toggle-auto" aria-label="自动朗读：关" title="自动朗读：关" data-tooltip="自动朗读：关">',
            '    <svg class="cgpt-ra-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17h2.1l.9-2.6h6l.9 2.6H18L13.2 6h-2.4L6 17z"></path><path d="M9.7 12.5h4.6L12 7.6l-2.3 4.9z"></path><path d="M19 8c1.3 2.4 1.3 5.6 0 8"></path></svg>',
            '  </button>',
            '</div>',
        ].join('');

        root.querySelector('[data-action="read"]').addEventListener('click', () => {
            if (consumeSuppressedClick()) return;
            void readLastAssistantTurn('button');
        });
        root.querySelector('[data-action="stop"]').addEventListener('click', () => {
            if (consumeSuppressedClick()) return;
            stopPlayback();
        });
        root.querySelector('[data-action="toggle-auto"]').addEventListener('click', () => {
            if (consumeSuppressedClick()) return;
            setAutoReadEnabled(!autoReadEnabled);
        });

        (document.body || document.documentElement).appendChild(root);
        bindControlDrag(root);
        updateAutoButton();
        updateControlPosition();
    }

    function updateControlsBusy(isBusy) {
        const root = document.getElementById(ROOT_ID);
        if (!root) return;
        const readButton = root.querySelector('[data-action="read"]');
        if (readButton) {
            readButton.disabled = Boolean(isBusy);
            const label = isBusy ? '正在处理朗读请求' : '朗读最后回复 (Alt+Shift+R)';
            readButton.setAttribute('aria-label', label);
            readButton.setAttribute('title', label);
            readButton.dataset.tooltip = isBusy ? '处理中...' : '朗读最后回复';
            readButton.classList.toggle('is-busy', Boolean(isBusy));
        }
    }

    function updateAutoButton() {
        const button = document.querySelector('#' + ROOT_ID + ' [data-action="toggle-auto"]');
        if (!button) return;
        const label = autoReadEnabled ? '自动朗读：开' : '自动朗读：关';
        button.setAttribute('aria-pressed', autoReadEnabled ? 'true' : 'false');
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.dataset.tooltip = label;
        button.classList.toggle('is-on', autoReadEnabled);
    }

    function setAutoReadEnabled(enabled) {
        autoReadEnabled = Boolean(enabled);
        writeStoredBoolean(STORAGE_AUTO_READ, autoReadEnabled);
        updateAutoButton();

        if (autoReadEnabled) {
            seedProcessedTurns();
            seedSeenAssistantTurnIds();
            scheduleAutoCheck();
        }
    }

    async function readLastAssistantTurn(source) {
        if (actionInFlight) {
            return;
        }

        actionInFlight = true;
        updateControlsBusy(true);

        try {
            const turn = getLastAssistantTurn();
            if (!turn) {
                return;
            }

            if (isGeneratingVisible()) {
                return;
            }

            await triggerReadForTurn(turn, source || 'manual');
        } catch (error) {
            console.warn(SCRIPT_PREFIX, 'Read failed:', error);
        } finally {
            actionInFlight = false;
            updateControlsBusy(false);
        }
    }

    async function triggerReadForTurn(turn, source) {
        if (!turn || !document.contains(turn)) {
            throw new Error('目标回复不存在');
        }

        stopPlayback();
        closeOpenMenus();

        turn.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        await delay(120);

        const moreButton = await waitForElement(() => findMoreActionsButton(turn), MENU_WAIT_TIMEOUT_MS);
        if (!moreButton) {
            throw new Error('未找到 More actions / 更多操作按钮');
        }

        const audioBaseline = captureAudioBaseline();
        dispatchHumanLikeClick(moreButton);

        const readItem = await waitForElement(findReadAloudMenuItem, MENU_WAIT_TIMEOUT_MS);
        if (!readItem) {
            throw new Error('未找到 Read aloud / 朗读菜单项');
        }

        let audioDetected = await clickReadAloudMenuItem(readItem, audioBaseline);
        await closeMenuAfterRead(moreButton, readItem);

        if (!audioDetected) {
            audioDetected = await waitForAudioSignal(AUDIO_DETECT_TIMEOUT_MS, audioBaseline);
        }

        const finalKey = buildTurnKey(turn);
        if (finalKey) processedTurns.add(finalKey);

        log('Triggered read aloud from ' + source + '.', { audioDetected });
        return { audioDetected };
    }

    function stopPlayback() {
        const audios = Array.from(document.querySelectorAll('audio'));
        let touched = 0;

        for (const audio of audios) {
            const src = audio.currentSrc || audio.src || '';
            const lookedRelevant = CHATGPT_BLOB_AUDIO_RE.test(src) || src === '' || audio.currentTime > 0;
            if (!lookedRelevant) continue;

            try {
                if (!audio.paused || audio.currentTime > 0) touched += 1;
                audio.pause();
                if (Number.isFinite(audio.duration) || audio.currentTime > 0) {
                    audio.currentTime = 0;
                }
            } catch (error) {
                console.warn(SCRIPT_PREFIX, 'Failed to stop audio:', error);
            }
        }

        return touched;
    }

    function getAssistantTurns() {
        return Array.from(document.querySelectorAll(TURN_SELECTOR))
            .filter((turn) => turn.querySelector(ASSISTANT_SELECTOR));
    }

    function getLastAssistantTurn() {
        const turns = getAssistantTurns();
        return turns.length ? turns[turns.length - 1] : null;
    }

    function getTurnText(turn) {
        const assistantBlocks = Array.from(turn.querySelectorAll(ASSISTANT_SELECTOR));
        if (!assistantBlocks.length) return '';
        return normalizeText(assistantBlocks.map((block) => block.innerText || block.textContent || '').join('\n'));
    }

    function getTurnId(turn) {
        return turn && turn.getAttribute('data-testid') || '';
    }

    function buildTurnKey(turn) {
        const turnId = getTurnId(turn);
        const text = getTurnText(turn);
        if (!turnId || !text) return '';
        return window.location.pathname + '::' + turnId + '::' + hashText(text);
    }

    function seedProcessedTurns() {
        for (const turn of getAssistantTurns()) {
            const key = buildTurnKey(turn);
            if (key) processedTurns.add(key);
        }
    }

    function seedSeenAssistantTurnIds() {
        for (const turn of getAssistantTurns()) {
            const turnId = getTurnId(turn);
            if (turnId) seenAssistantTurnIds.add(turnId);
        }
    }

    function observePageChanges() {
        if (observer) observer.disconnect();
        observer = new MutationObserver(() => {
            ensureControlsMounted();
            scheduleControlPositionUpdate();
            if (autoReadEnabled) scheduleAutoCheck();
        });
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    function observeRouteChanges() {
        window.setInterval(() => {
            if (window.location.href === lastLocationHref) return;
            lastLocationHref = window.location.href;
            processedTurns.clear();
            pendingTurnIds.clear();
            seenAssistantTurnIds.clear();
            seedProcessedTurns();
            seedSeenAssistantTurnIds();
            closeOpenMenus();
            scheduleControlPositionUpdate();
            if (autoReadEnabled) scheduleAutoCheck();
        }, 1000);
    }

    function bindLayoutListeners() {
        window.addEventListener('resize', scheduleControlPositionUpdate, { passive: true });
        window.addEventListener('orientationchange', scheduleControlPositionUpdate, { passive: true });
    }

    function scheduleControlPositionUpdate() {
        window.clearTimeout(controlPositionTimer);
        controlPositionTimer = window.setTimeout(updateControlPosition, 120);
    }

    function updateControlPosition() {
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const rect = root.getBoundingClientRect();
        const panelWidth = rect.width || 104;
        const panelHeight = rect.height || 34;
        let left;
        let top;

        if (isStoredPosition(controlPosition)) {
            left = clamp(controlPosition.left, 8, Math.max(8, window.innerWidth - panelWidth - 8));
            top = clamp(controlPosition.top, 8, Math.max(8, window.innerHeight - panelHeight - 8));
            if (left !== controlPosition.left || top !== controlPosition.top) {
                controlPosition = { left, top };
                writeStoredJson(STORAGE_CONTROL_POSITION, controlPosition);
            }
        } else {
            const main = document.querySelector('main');
            const mainRect = main ? main.getBoundingClientRect() : null;
            const desiredLeft = mainRect ? mainRect.left + 12 : 64;
            left = clamp(desiredLeft, 8, Math.max(8, window.innerWidth - panelWidth - 8));
            top = clamp(64, 8, Math.max(8, window.innerHeight - panelHeight - 8));
        }

        applyControlPosition(left, top);
    }

    function applyControlPosition(left, top) {
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const leftPx = Math.round(left) + 'px';
        const topPx = Math.round(top) + 'px';
        root.style.setProperty('--cgpt-ra-left', leftPx);
        root.style.setProperty('--cgpt-ra-top', topPx);
        document.documentElement.style.setProperty('--cgpt-ra-left', leftPx);
        document.documentElement.style.setProperty('--cgpt-ra-top', topPx);
    }

    function isStoredPosition(position) {
        return position
            && Number.isFinite(position.left)
            && Number.isFinite(position.top);
    }

    function bindControlDrag(root) {
        root.addEventListener('pointerdown', handleControlPointerDown);
        root.addEventListener('click', (event) => {
            if (!suppressNextClick) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            suppressNextClick = false;
        }, true);
    }

    function handleControlPointerDown(event) {
        if (event.button !== 0 || !event.isPrimary) return;

        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const rect = root.getBoundingClientRect();
        dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: rect.left,
            startTop: rect.top,
            moved: false,
            captured: false,
        };

        root.addEventListener('pointermove', handleControlPointerMove);
        root.addEventListener('pointerup', handleControlPointerEnd);
        root.addEventListener('pointercancel', handleControlPointerEnd);
        window.addEventListener('pointermove', handleControlPointerMove);
        window.addEventListener('pointerup', handleControlPointerEnd);
        window.addEventListener('pointercancel', handleControlPointerEnd);
    }

    function handleControlPointerMove(event) {
        if (!dragState || event.pointerId !== dragState.pointerId) return;

        const deltaX = event.clientX - dragState.startX;
        const deltaY = event.clientY - dragState.startY;
        if (!dragState.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;

        dragState.moved = true;
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        if (!dragState.captured) {
            try {
                root.setPointerCapture(event.pointerId);
                dragState.captured = true;
            } catch (error) {
                // Pointer capture is best-effort; window listeners keep drag usable.
            }
        }

        const rect = root.getBoundingClientRect();
        const left = clamp(dragState.startLeft + deltaX, 8, Math.max(8, window.innerWidth - rect.width - 8));
        const top = clamp(dragState.startTop + deltaY, 8, Math.max(8, window.innerHeight - rect.height - 8));
        root.classList.add('is-dragging');
        applyControlPosition(left, top);
        event.preventDefault();
    }

    function handleControlPointerEnd(event) {
        if (!dragState || event.pointerId !== dragState.pointerId) return;

        const root = document.getElementById(ROOT_ID);
        window.removeEventListener('pointermove', handleControlPointerMove);
        window.removeEventListener('pointerup', handleControlPointerEnd);
        window.removeEventListener('pointercancel', handleControlPointerEnd);

        if (root) {
            root.removeEventListener('pointermove', handleControlPointerMove);
            root.removeEventListener('pointerup', handleControlPointerEnd);
            root.removeEventListener('pointercancel', handleControlPointerEnd);
            root.classList.remove('is-dragging');

            if (dragState.captured) {
                try {
                    root.releasePointerCapture(event.pointerId);
                } catch (error) {
                    // Matching release is best-effort.
                }
            }

            if (dragState.moved) {
                const rect = root.getBoundingClientRect();
                controlPosition = {
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                };
                writeStoredJson(STORAGE_CONTROL_POSITION, controlPosition);
                suppressNextClick = true;
                window.setTimeout(() => {
                    suppressNextClick = false;
                }, 0);
            }
        }

        dragState = null;
    }

    function consumeSuppressedClick() {
        if (!suppressNextClick) return false;
        suppressNextClick = false;
        return true;
    }

    function ensureControlsMounted() {
        if (!document.getElementById(ROOT_ID)) {
            renderControls();
        } else {
            scheduleControlPositionUpdate();
        }
    }

    function scheduleAutoCheck() {
        window.clearTimeout(autoCheckTimer);
        autoCheckTimer = window.setTimeout(() => {
            void maybeAutoReadLatestTurn();
        }, AUTO_DEBOUNCE_MS);
    }

    async function maybeAutoReadLatestTurn() {
        if (!autoReadEnabled || autoBusy || actionInFlight) return;

        const turn = getLastAssistantTurn();
        if (!turn) return;

        const turnId = getTurnId(turn);
        if (!turnId || pendingTurnIds.has(turnId)) return;
        if (seenAssistantTurnIds.has(turnId)) return;

        const currentKey = buildTurnKey(turn);
        if (currentKey && processedTurns.has(currentKey)) return;

        autoBusy = true;
        pendingTurnIds.add(turnId);

        try {
            const ready = await waitForTurnReady(turn);
            if (!ready || !autoReadEnabled || !document.contains(turn)) return;

            const finalKey = buildTurnKey(turn);
            if (!finalKey || processedTurns.has(finalKey)) return;

            seenAssistantTurnIds.add(turnId);
            processedTurns.add(finalKey);

            try {
                await triggerReadForTurn(turn, 'auto');
            } catch (error) {
                console.warn(SCRIPT_PREFIX, 'Auto read failed:', error);
            }
        } finally {
            seenAssistantTurnIds.add(turnId);
            pendingTurnIds.delete(turnId);
            autoBusy = false;
        }
    }

    async function waitForTurnReady(turn) {
        const start = Date.now();
        let stableCount = 0;
        let lastText = '';

        while (Date.now() - start < AUTO_READY_TIMEOUT_MS) {
            if (!document.contains(turn)) return false;

            const text = getTurnText(turn);
            const hasMoreActions = Boolean(findMoreActionsButton(turn));
            const isGenerating = isGeneratingVisible();

            if (text && hasMoreActions && !isGenerating && text === lastText) {
                stableCount += 1;
            } else {
                stableCount = 0;
                lastText = text;
            }

            if (stableCount >= AUTO_STABLE_SAMPLE_COUNT) {
                return true;
            }

            await delay(AUTO_SAMPLE_INTERVAL_MS);
        }

        return false;
    }

    function findMoreActionsButton(turn) {
        const buttons = Array.from(turn.querySelectorAll('button[aria-label]'));
        const exact = buttons.find((button) => {
            const label = normalizeText(button.getAttribute('aria-label') || '');
            return MORE_ACTIONS_LABEL_RE.test(label) && hasElementBox(button);
        });
        if (exact) return exact;

        return buttons.find((button) => {
            const label = normalizeText(button.getAttribute('aria-label') || '');
            return MORE_ACTIONS_FALLBACK_RE.test(label) && hasElementBox(button);
        }) || null;
    }

    function findReadAloudMenuItem() {
        const candidates = collectReadAloudCandidates();
        const exact = candidates.find((item) => {
            const label = getElementLabel(item);
            return READ_ALOUD_LABEL_RE.test(label) && hasElementBox(item);
        });
        if (exact) return exact;

        const labelMatch = candidates.find((item) => {
            const label = getElementLabel(item);
            return /(朗读|read aloud)/i.test(label) && hasElementBox(item);
        });
        if (labelMatch) return labelMatch;

        return candidates.find((item) => {
            return hasElementBox(item)
                && (item.getAttribute('data-testid') === VOICE_PLAY_TESTID
                    || item.querySelector('[data-testid="' + VOICE_PLAY_TESTID + '"]'));
        }) || null;
    }

    function collectReadAloudCandidates() {
        const elements = [];
        const scopes = getOpenMenuScopes();

        if (scopes.length) {
            for (const scope of scopes) {
                for (const testIdItem of scope.querySelectorAll('[data-testid="' + VOICE_PLAY_TESTID + '"]')) {
                    elements.push(getActionableMenuItem(testIdItem));
                }

                elements.push(...Array.from(scope.querySelectorAll('[role="menuitem"], button, [role="button"]')));
            }
        } else {
            for (const testIdItem of document.querySelectorAll('[data-testid="' + VOICE_PLAY_TESTID + '"]')) {
                elements.push(getActionableMenuItem(testIdItem));
            }
        }

        return dedupeElements(elements.filter((element) => element && !isInsideOwnControls(element)));
    }

    function getOpenMenuScopes() {
        return Array.from(document.querySelectorAll('[role="menu"], [data-radix-menu-content]'))
            .filter((element) => hasElementBox(element) && !isInsideOwnControls(element));
    }

    function isInsideOwnControls(element) {
        const root = document.getElementById(ROOT_ID);
        return Boolean(root && element && root.contains(element));
    }

    function getActionableMenuItem(element) {
        if (!element) return null;
        const menuItem = element.closest('[role="menuitem"]');
        if (menuItem && hasElementBox(menuItem)) return menuItem;
        return element;
    }

    function dedupeElements(elements) {
        const seen = new Set();
        const result = [];

        for (const element of elements) {
            if (!element || seen.has(element)) continue;
            seen.add(element);
            result.push(element);
        }

        return result;
    }

    function getElementLabel(element) {
        return normalizeText([
            element && element.innerText,
            element && element.textContent,
            element && element.getAttribute && element.getAttribute('aria-label'),
        ].filter(Boolean).join(' '));
    }

    function isGeneratingVisible() {
        const buttons = Array.from(document.querySelectorAll('button[aria-label]'));
        return buttons.some((button) => {
            const label = normalizeText(button.getAttribute('aria-label') || '');
            return STOP_GENERATING_LABEL_RE.test(label) && isVisibleInViewport(button);
        });
    }

    function closeOpenMenus() {
        const ownerWindow = document.defaultView || window;
        const init = {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
            cancelable: true,
            composed: true,
            view: ownerWindow,
        };
        const targets = [document.activeElement, document, ownerWindow].filter(Boolean);

        for (const target of targets) {
            try {
                target.dispatchEvent(new ownerWindow.KeyboardEvent('keydown', init));
                target.dispatchEvent(new ownerWindow.KeyboardEvent('keyup', init));
            } catch (error) {
                console.warn(SCRIPT_PREFIX, 'Failed to close menu target:', error);
            }
        }
    }

    async function clickReadAloudMenuItem(readItem, audioBaseline) {
        if (!readItem) return false;

        try {
            readItem.focus({ preventScroll: true });
        } catch (error) {
            // Radix menu items are sometimes divs and may not be focusable.
        }

        if (typeof readItem.click === 'function') {
            readItem.click();
        } else {
            dispatchHumanLikeClick(readItem);
        }

        let audioDetected = await waitForAudioSignal(READ_ITEM_NATIVE_CONFIRM_MS, audioBaseline);
        if (audioDetected || isReadAloudMenuItemInStopState(readItem)) {
            return audioDetected;
        }

        dispatchHumanLikeClick(readItem);
        audioDetected = await waitForAudioSignal(READ_ITEM_NATIVE_CONFIRM_MS, audioBaseline);
        return audioDetected;
    }

    async function closeMenuAfterRead(moreButton, readItem) {
        await delay(MENU_CLOSE_DELAY_MS);
        closeOpenMenus();
        releaseSyntheticHover(readItem);
        releaseSyntheticHover(moreButton);
        blurActiveMenuElement();
        await delay(80);
        closeOpenMenus();
    }

    function releaseSyntheticHover(element) {
        if (!element) return;

        const ownerWindow = element.ownerDocument && element.ownerDocument.defaultView || window;
        const rect = element.getBoundingClientRect();
        const clientX = rect.left + Math.max(1, rect.width / 2);
        const clientY = rect.top + Math.max(1, rect.height / 2);
        const relatedTarget = document.body || document.documentElement;
        const events = [
            ['pointerout', 0],
            ['pointerleave', 0],
            ['mouseout', 0],
            ['mouseleave', 0],
        ];

        for (const [type, buttons] of events) {
            try {
                const event = createPointerOrMouseEvent(element, type, clientX, clientY, buttons, relatedTarget);
                element.dispatchEvent(event);
            } catch (error) {
                console.warn(SCRIPT_PREFIX, 'Synthetic ' + type + ' event failed:', error);
            }
        }

        try {
            const moveTarget = document.body || document.documentElement;
            moveTarget.dispatchEvent(new ownerWindow.MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                composed: true,
                view: ownerWindow,
                clientX: 4,
                clientY: 4,
            }));
        } catch (error) {
            console.warn(SCRIPT_PREFIX, 'Failed to release synthetic hover:', error);
        }
    }

    function blurActiveMenuElement() {
        const activeElement = document.activeElement;
        if (activeElement && typeof activeElement.blur === 'function') {
            try {
                activeElement.blur();
            } catch (error) {
                // Ignore focus cleanup failures.
            }
        }

        const root = document.getElementById(ROOT_ID);
        if (root && typeof root.focus === 'function') {
            try {
                root.focus({ preventScroll: true });
                root.blur();
            } catch (error) {
                // Ignore focus cleanup failures.
            }
        }
    }

    function dispatchHumanLikeClick(element) {
        if (!element) return;

        try {
            element.focus({ preventScroll: true });
        } catch (error) {
            // Some menuitem divs are not focusable in all states.
        }

        const rect = element.getBoundingClientRect();
        const clientX = rect.left + Math.max(1, rect.width / 2);
        const clientY = rect.top + Math.max(1, rect.height / 2);

        const events = [
            ['pointerover', 0],
            ['pointerenter', 0],
            ['mouseover', 0],
            ['mouseenter', 0],
            ['pointermove', 0],
            ['mousemove', 0],
            ['pointerdown', 1],
            ['mousedown', 1],
            ['pointerup', 0],
            ['mouseup', 0],
            ['click', 0],
        ];

        let clickDispatched = false;
        for (const [type, buttons] of events) {
            try {
                const event = createPointerOrMouseEvent(element, type, clientX, clientY, buttons);
                element.dispatchEvent(event);
                if (type === 'click') clickDispatched = true;
            } catch (error) {
                console.warn(SCRIPT_PREFIX, 'Synthetic ' + type + ' event failed:', error);
                if (type === 'click') clickDispatched = false;
            }
        }

        if (!clickDispatched && typeof element.click === 'function') {
            element.click();
        }
    }

    function createPointerOrMouseEvent(element, type, clientX, clientY, buttons, relatedTarget) {
        const ownerWindow = element && element.ownerDocument && element.ownerDocument.defaultView || window;
        const init = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: ownerWindow,
            clientX,
            clientY,
            button: 0,
            buttons,
            relatedTarget: relatedTarget || null,
        };

        if (type.startsWith('pointer') && typeof ownerWindow.PointerEvent === 'function') {
            try {
                return new ownerWindow.PointerEvent(type, Object.assign({}, init, {
                    pointerId: 1,
                    pointerType: 'mouse',
                    isPrimary: true,
                }));
            } catch (error) {
                const mouseType = type.replace(/^pointer/, 'mouse');
                return new ownerWindow.MouseEvent(mouseType, init);
            }
        }

        return new ownerWindow.MouseEvent(type.replace(/^pointer/, 'mouse'), init);
    }

    async function waitForElement(getter, timeoutMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const element = getter();
            if (element) return element;
            await delay(80);
        }
        return null;
    }

    function captureAudioBaseline() {
        return Array.from(document.querySelectorAll('audio')).map((audio, index) => ({
            audio,
            index,
            src: audio.currentSrc || audio.src || '',
            currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
            paused: audio.paused,
            duration: Number.isFinite(audio.duration) ? audio.duration : null,
        }));
    }

    async function waitForAudioSignal(timeoutMs, baseline) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const audios = Array.from(document.querySelectorAll('audio'));
            if (audios.some((audio, index) => hasNewAudioSignal(audio, index, baseline))) {
                return true;
            }
            await delay(120);
        }
        return false;
    }

    function hasNewAudioSignal(audio, index, baseline) {
        const src = audio.currentSrc || audio.src || '';
        const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        const previous = findAudioBaseline(audio, index, baseline);
        const previousTime = previous ? previous.currentTime : 0;
        const previousSrc = previous ? previous.src : '';
        const isNewBlob = CHATGPT_BLOB_AUDIO_RE.test(src) && src !== previousSrc;
        const progressed = currentTime > previousTime + 0.05;
        const becameActive = previous ? previous.paused && !audio.paused : !audio.paused;

        return isNewBlob || progressed || becameActive;
    }

    function findAudioBaseline(audio, index, baseline) {
        if (!Array.isArray(baseline)) return null;
        return baseline.find((item) => item.audio === audio) || baseline.find((item) => item.index === index) || null;
    }

    function isReadAloudMenuItemInStopState(readItem) {
        if (!readItem) return false;
        const label = getElementLabel(readItem);
        return /^(停止|Stop)$/i.test(label) || /(停止朗读|Stop read aloud|Stop reading)/i.test(label);
    }

    function delay(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function hasElementBox(element) {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0
            && rect.height > 0
            && style.display !== 'none'
            && style.visibility !== 'hidden';
    }

    function isVisibleInViewport(element) {
        if (!hasElementBox(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0
            && rect.right > 0
            && rect.top < window.innerHeight
            && rect.left < window.innerWidth;
    }

    function normalizeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function hashText(text) {
        let hash = 0;
        const source = normalizeText(text);
        for (let i = 0; i < source.length; i += 1) {
            hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
        }
        return Math.abs(hash).toString(36);
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const css = `
            #${ROOT_ID} {
                position: fixed;
                left: var(--cgpt-ra-left, 272px);
                top: var(--cgpt-ra-top, 64px);
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                color: #101828;
                touch-action: none;
                user-select: none;
            }

            #${ROOT_ID} .cgpt-ra-panel {
                display: flex;
                align-items: center;
                gap: 4px;
                width: 100px;
                height: 34px;
                padding: 3px 5px;
                border: 1px solid rgba(20, 28, 44, 0.14);
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.3);
                box-shadow: 0 8px 20px rgba(20, 28, 44, 0.1);
                backdrop-filter: blur(10px) saturate(125%);
                -webkit-backdrop-filter: blur(10px) saturate(125%);
                cursor: grab;
                opacity: 0.48;
                transition: opacity 0.16s ease, background 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
            }

            #${ROOT_ID} .cgpt-ra-panel:hover,
            #${ROOT_ID} .cgpt-ra-panel:focus-within {
                background: rgba(255, 255, 255, 0.62);
                box-shadow: 0 10px 24px rgba(20, 28, 44, 0.16);
                opacity: 0.9;
            }

            #${ROOT_ID}.is-dragging .cgpt-ra-panel {
                cursor: grabbing;
                opacity: 0.96;
                transform: scale(1.02);
            }

            #${ROOT_ID} .cgpt-ra-btn {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                min-width: 28px;
                height: 28px;
                padding: 0;
                border: 1px solid rgba(20, 28, 44, 0.14);
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.38);
                color: rgba(16, 24, 40, 0.72);
                cursor: pointer;
                user-select: none;
                transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease, opacity 0.16s ease, transform 0.16s ease;
            }

            #${ROOT_ID} .cgpt-ra-btn:hover,
            #${ROOT_ID} .cgpt-ra-btn:focus-visible {
                background: rgba(255, 255, 255, 0.82);
                border-color: rgba(20, 28, 44, 0.24);
                color: #101828;
                outline: none;
                transform: translateY(-1px);
            }

            #${ROOT_ID} .cgpt-ra-btn:disabled {
                cursor: wait;
                opacity: 0.64;
                transform: none;
            }

            #${ROOT_ID} .cgpt-ra-icon {
                width: 15px;
                height: 15px;
                fill: none;
                stroke: currentColor;
                stroke-width: 1.9;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            #${ROOT_ID} [data-action="toggle-auto"] .cgpt-ra-icon {
                stroke-width: 1.7;
            }

            #${ROOT_ID} .cgpt-ra-primary {
                border-color: rgba(31, 122, 92, 0.28);
                background: rgba(31, 122, 92, 0.12);
                color: #17694f;
            }

            #${ROOT_ID} .cgpt-ra-primary:hover {
                background: rgba(31, 122, 92, 0.22);
            }

            #${ROOT_ID} .cgpt-ra-btn.is-busy {
                color: #667085;
            }

            #${ROOT_ID} .cgpt-ra-toggle.is-on {
                border-color: rgba(36, 99, 235, 0.34);
                background: rgba(36, 99, 235, 0.16);
                color: #1d4ed8;
            }

            #${ROOT_ID} .cgpt-ra-btn::after {
                position: absolute;
                left: 50%;
                top: calc(100% + 8px);
                width: max-content;
                max-width: 190px;
                padding: 5px 7px;
                border-radius: 6px;
                background: rgba(16, 24, 40, 0.84);
                color: #fff;
                content: attr(data-tooltip);
                font-size: 11px;
                line-height: 1.3;
                opacity: 0;
                pointer-events: none;
                transform: translate(-50%, -3px);
                transition: opacity 0.14s ease, transform 0.14s ease;
                white-space: nowrap;
            }

            #${ROOT_ID} .cgpt-ra-btn:hover::after,
            #${ROOT_ID} .cgpt-ra-btn:focus-visible::after {
                opacity: 1;
                transform: translate(-50%, 0);
            }

            @media (max-width: 720px) {
                #${ROOT_ID} .cgpt-ra-panel {
                    width: 96px;
                    height: 33px;
                }
            }
        `;

        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }
})();
