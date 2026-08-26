// ==UserScript==
// @name         ChatGPT Auto Read Aloud
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Automatically start native ChatGPT Read Aloud for newly completed replies through ChatGPT Audio Controls.
// @author       TheodorePeng
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @noframes
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/ChatGPTAutoReadAloud.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/ChatGPTAutoReadAloud.user.js
// ==/UserScript==

(function () {
    'use strict';

    const PREFIX = '[ChatGPTAutoReadAloud]';
    const VERSION = '1.0.0';

    const STORAGE = Object.freeze({
        autoRead: 'chatgpt-auto-read-aloud:auto-read-enabled',
        hideExtensionToggle: 'chatgpt-auto-read-aloud:hide-extension-toggle',
        bareArrowSeek: 'chatgpt-auto-read-aloud:bare-arrow-seek-enabled',
        position: 'chatgpt-auto-read-aloud:floating-position',
        migration: 'chatgpt-auto-read-aloud:migration-v1',
    });

    const LEGACY_STORAGE = Object.freeze({
        autoRead: 'chatgpt-auto-read-aloud:v0.1.4:autoReadEnabled',
        position: 'chatgpt-auto-read-aloud:controlPosition',
    });

    const SELECTORS = Object.freeze({
        assistant: '[data-message-author-role="assistant"]',
        composer: '#prompt-textarea, [data-testid="composer-text-input"]',
        sendButton: 'button[data-testid="send-button"]',
        extensionRead: '.cgpt-inline-readaloud',
        extensionToggle: '#cgpt-ra-floating-toggle',
        seekBack: '.cgpt-ra-back',
        seekForward: '.cgpt-ra-forward',
        nativeRead: '[data-testid="voice-play-turn-action-button"]',
    });

    const ROOT_ID = 'cgpt-auto-read-aloud-root';
    const STYLE_ID = 'cgpt-auto-read-aloud-style';
    const HIDE_ATTRIBUTE = 'data-cgpt-ara-hide-extension-toggle';
    const MISSING = '__CGPT_ARA_MISSING__';

    const TASK_TIMEOUT_MS = 10 * 60 * 1000;
    const INTENT_TIMEOUT_MS = 30 * 1000;
    const TEXT_STABLE_MS = 1000;
    const CONTROL_WAIT_MS = 8000;
    const PLAYBACK_VERIFY_MS = 4000;
    const CHECK_DEBOUNCE_MS = 120;
    const ERROR_STATE_MS = 3000;
    const DRAG_THRESHOLD_PX = 4;

    const STOP_GENERATING_RE = /(停止回答|停止生成|停止回应|Stop generating|Stop responding)/i;
    const GENERATION_ACTION_RE = /(重新生成|重新回答|重试|继续生成|继续回答|Regenerate|Try again|Continue generating|Continue response)/i;
    const READ_ALOUD_RE = /^(朗读|Read aloud|Read out loud)$/i;
    const INTERACTIVE_SELECTOR = [
        'input',
        'textarea',
        'select',
        'button',
        'a',
        '[contenteditable="true"]',
        '[role="textbox"]',
        '[role="button"]',
        '[role="link"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[role="dialog"]',
        '[role="slider"]',
        '[role="listbox"]',
        '[role="option"]',
    ].join(',');

    let settings = null;
    let pendingTask = null;
    let taskSequence = 0;
    let generationWasActive = false;
    let observer = null;
    let checkTimer = 0;
    let errorTimer = 0;
    let visualState = 'idle';
    let dragState = null;
    let suppressNextClick = false;
    let menuIds = [];
    let stylesInstalled = false;

    init();

    function init() {
        migrateSettings();
        settings = readSettings();
        installStyles();
        applyExtensionToggleVisibility();
        ensureToggleMounted();
        registerMenuCommands();
        registerValueListeners();
        bindGlobalEvents();
        generationWasActive = isGenerationActive();
        startObserver();
        updateToggleState();
        log('Loaded v' + VERSION + '.', {
            autoRead: settings.autoRead,
            hideExtensionToggle: settings.hideExtensionToggle,
            bareArrowSeek: settings.bareArrowSeek,
        });
    }

    function log(message, details) {
        if (details === undefined) {
            console.log(PREFIX, message);
        } else {
            console.log(PREFIX, message, details);
        }
    }

    function warn(message, details) {
        if (details === undefined) {
            console.warn(PREFIX, message);
        } else {
            console.warn(PREFIX, message, details);
        }
    }

    function gmRead(key, fallback) {
        try {
            if (typeof GM_getValue === 'function') {
                return GM_getValue(key, fallback);
            }
            const raw = window.localStorage.getItem(key);
            return raw === null ? fallback : raw;
        } catch (error) {
            warn('Unable to read a saved setting.', { key, error: String(error) });
            return fallback;
        }
    }

    function gmWrite(key, value) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(key, value);
                return;
            }
            const payload = typeof value === 'string' ? value : JSON.stringify(value);
            window.localStorage.setItem(key, payload);
        } catch (error) {
            warn('Unable to save a setting.', { key, error: String(error) });
        }
    }

    function readBoolean(key, fallback) {
        const value = gmRead(key, MISSING);
        if (value === MISSING) return fallback;
        if (typeof value === 'string') return value === 'true';
        return Boolean(value);
    }

    function readPosition(key) {
        const value = gmRead(key, null);
        if (!value) return null;

        try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            if (parsed && Number.isFinite(parsed.left) && Number.isFinite(parsed.top)) {
                return { left: parsed.left, top: parsed.top };
            }
        } catch (error) {
            warn('Ignoring an invalid saved position.', { error: String(error) });
        }

        return null;
    }

    function migrateSettings() {
        if (readBoolean(STORAGE.migration, false)) return;

        if (gmRead(STORAGE.autoRead, MISSING) === MISSING) {
            const legacyAutoRead = gmRead(LEGACY_STORAGE.autoRead, MISSING);
            gmWrite(
                STORAGE.autoRead,
                legacyAutoRead === MISSING
                    ? true
                    : (typeof legacyAutoRead === 'string' ? legacyAutoRead === 'true' : Boolean(legacyAutoRead)),
            );
        }

        if (gmRead(STORAGE.position, MISSING) === MISSING) {
            const legacyPosition = readPosition(LEGACY_STORAGE.position);
            if (legacyPosition) gmWrite(STORAGE.position, legacyPosition);
        }

        if (gmRead(STORAGE.hideExtensionToggle, MISSING) === MISSING) {
            gmWrite(STORAGE.hideExtensionToggle, false);
        }

        if (gmRead(STORAGE.bareArrowSeek, MISSING) === MISSING) {
            gmWrite(STORAGE.bareArrowSeek, false);
        }

        gmWrite(STORAGE.migration, true);
    }

    function readSettings() {
        return {
            autoRead: readBoolean(STORAGE.autoRead, true),
            hideExtensionToggle: readBoolean(STORAGE.hideExtensionToggle, false),
            bareArrowSeek: readBoolean(STORAGE.bareArrowSeek, false),
            position: readPosition(STORAGE.position),
        };
    }

    function registerValueListeners() {
        if (typeof GM_addValueChangeListener !== 'function') return;

        GM_addValueChangeListener(STORAGE.autoRead, (_key, _oldValue, newValue, remote) => {
            if (!remote) return;
            applyAutoReadSetting(coerceBoolean(newValue), true);
        });

        GM_addValueChangeListener(STORAGE.hideExtensionToggle, (_key, _oldValue, newValue, remote) => {
            if (!remote) return;
            settings.hideExtensionToggle = coerceBoolean(newValue);
            applyExtensionToggleVisibility();
            registerMenuCommands();
        });

        GM_addValueChangeListener(STORAGE.bareArrowSeek, (_key, _oldValue, newValue, remote) => {
            if (!remote) return;
            settings.bareArrowSeek = coerceBoolean(newValue);
            registerMenuCommands();
        });

        GM_addValueChangeListener(STORAGE.position, (_key, _oldValue, newValue, remote) => {
            if (!remote || dragState) return;
            settings.position = parsePositionValue(newValue);
            updateTogglePosition();
        });
    }

    function parsePositionValue(value) {
        try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            return parsed && Number.isFinite(parsed.left) && Number.isFinite(parsed.top)
                ? { left: parsed.left, top: parsed.top }
                : null;
        } catch (_error) {
            return null;
        }
    }

    function coerceBoolean(value) {
        return typeof value === 'string' ? value === 'true' : Boolean(value);
    }

    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand !== 'function') return;

        if (menuIds.length && typeof GM_unregisterMenuCommand === 'function') {
            for (const id of menuIds) {
                try {
                    GM_unregisterMenuCommand(id);
                } catch (_error) {
                    // A stale menu id is harmless.
                }
            }
            menuIds = [];
        } else if (menuIds.length) {
            return;
        }

        menuIds.push(GM_registerMenuCommand(
            '自动朗读：' + (settings.autoRead ? '开（点击关闭）' : '关（点击开启）'),
            () => setAutoReadEnabled(!settings.autoRead),
        ));
        menuIds.push(GM_registerMenuCommand(
            '原扩展图标：' + (settings.hideExtensionToggle ? '隐藏（点击显示）' : '显示（点击隐藏）'),
            () => setHideExtensionToggle(!settings.hideExtensionToggle),
        ));
        menuIds.push(GM_registerMenuCommand(
            '裸方向键 ±10 秒：' + (settings.bareArrowSeek ? '开（点击关闭）' : '关（点击开启）'),
            () => setBareArrowSeekEnabled(!settings.bareArrowSeek),
        ));
        menuIds.push(GM_registerMenuCommand('重置自动朗读按钮位置', resetTogglePosition));
    }

    function setAutoReadEnabled(enabled) {
        const nextValue = Boolean(enabled);
        gmWrite(STORAGE.autoRead, nextValue);
        applyAutoReadSetting(nextValue, true);
    }

    function applyAutoReadSetting(enabled, refreshMenus) {
        settings.autoRead = Boolean(enabled);
        if (!settings.autoRead) cancelPendingTask('disabled');
        visualState = pendingTask ? 'waiting' : 'idle';
        updateToggleState();
        if (refreshMenus) registerMenuCommands();
    }

    function setHideExtensionToggle(hidden) {
        settings.hideExtensionToggle = Boolean(hidden);
        gmWrite(STORAGE.hideExtensionToggle, settings.hideExtensionToggle);
        applyExtensionToggleVisibility();
        registerMenuCommands();
    }

    function setBareArrowSeekEnabled(enabled) {
        settings.bareArrowSeek = Boolean(enabled);
        gmWrite(STORAGE.bareArrowSeek, settings.bareArrowSeek);
        registerMenuCommands();
    }

    function resetTogglePosition() {
        settings.position = null;
        gmWrite(STORAGE.position, null);
        updateTogglePosition();
    }

    function applyExtensionToggleVisibility() {
        document.documentElement.setAttribute(
            HIDE_ATTRIBUTE,
            settings.hideExtensionToggle ? 'true' : 'false',
        );
    }

    function installStyles() {
        if (stylesInstalled || document.getElementById(STYLE_ID)) return;
        stylesInstalled = true;

        const css = `
            html[${HIDE_ATTRIBUTE}="true"] ${SELECTORS.extensionToggle} {
                display: none !important;
            }

            #${ROOT_ID} {
                position: fixed;
                left: var(--cgpt-ara-left, 64px);
                top: var(--cgpt-ara-top, 64px);
                z-index: 2147483647;
                width: 34px;
                height: 34px;
                color: rgba(16, 24, 40, 0.72);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                touch-action: none;
                user-select: none;
            }

            #${ROOT_ID} .cgpt-ara-toggle {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 34px;
                height: 34px;
                padding: 0;
                border: 1px solid rgba(20, 28, 44, 0.16);
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.34);
                box-shadow: 0 8px 20px rgba(20, 28, 44, 0.1);
                backdrop-filter: blur(10px) saturate(125%);
                -webkit-backdrop-filter: blur(10px) saturate(125%);
                color: inherit;
                cursor: grab;
                opacity: 0.5;
                transition: opacity 0.16s ease, background 0.16s ease, border-color 0.16s ease,
                    color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
            }

            #${ROOT_ID} .cgpt-ara-toggle:hover,
            #${ROOT_ID} .cgpt-ara-toggle:focus-visible {
                opacity: 0.94;
                outline: none;
                transform: translateY(-1px);
                box-shadow: 0 10px 24px rgba(20, 28, 44, 0.16);
            }

            #${ROOT_ID}[data-state="on"] .cgpt-ara-toggle,
            #${ROOT_ID}[data-state="waiting"] .cgpt-ara-toggle {
                border-color: rgba(36, 99, 235, 0.34);
                background: rgba(36, 99, 235, 0.16);
                color: #1d4ed8;
            }

            #${ROOT_ID}[data-state="waiting"] .cgpt-ara-toggle {
                animation: cgpt-ara-pulse 1.15s ease-in-out infinite;
            }

            #${ROOT_ID}[data-state="error"] .cgpt-ara-toggle {
                border-color: rgba(217, 119, 6, 0.42);
                background: rgba(245, 158, 11, 0.18);
                color: #b45309;
                opacity: 0.94;
            }

            #${ROOT_ID}.is-dragging .cgpt-ara-toggle {
                cursor: grabbing;
                opacity: 0.98;
                transform: scale(1.04);
                animation: none;
            }

            #${ROOT_ID} .cgpt-ara-icon {
                width: 17px;
                height: 17px;
                fill: none;
                stroke: currentColor;
                stroke-width: 1.7;
                stroke-linecap: round;
                stroke-linejoin: round;
                pointer-events: none;
            }

            #${ROOT_ID} .cgpt-ara-toggle::after {
                position: absolute;
                left: 50%;
                top: calc(100% + 8px);
                width: max-content;
                max-width: 210px;
                padding: 5px 7px;
                border-radius: 6px;
                background: rgba(16, 24, 40, 0.86);
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

            #${ROOT_ID} .cgpt-ara-toggle:hover::after,
            #${ROOT_ID} .cgpt-ara-toggle:focus-visible::after {
                opacity: 1;
                transform: translate(-50%, 0);
            }

            @keyframes cgpt-ara-pulse {
                0%, 100% { box-shadow: 0 8px 20px rgba(37, 99, 235, 0.12); }
                50% { box-shadow: 0 8px 24px rgba(37, 99, 235, 0.34); }
            }

            @media (prefers-color-scheme: dark) {
                #${ROOT_ID} .cgpt-ara-toggle {
                    border-color: rgba(255, 255, 255, 0.18);
                    background: rgba(20, 20, 24, 0.38);
                    color: rgba(255, 255, 255, 0.72);
                }

                #${ROOT_ID}[data-state="on"] .cgpt-ara-toggle,
                #${ROOT_ID}[data-state="waiting"] .cgpt-ara-toggle {
                    border-color: rgba(96, 165, 250, 0.48);
                    background: rgba(37, 99, 235, 0.24);
                    color: #93c5fd;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                #${ROOT_ID} .cgpt-ara-toggle {
                    transition: none;
                }

                #${ROOT_ID}[data-state="waiting"] .cgpt-ara-toggle {
                    animation: none;
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
        document.documentElement.appendChild(style);
    }

    function ensureToggleMounted() {
        let root = document.getElementById(ROOT_ID);
        if (root) return root;

        root = document.createElement('div');
        root.id = ROOT_ID;
        root.dataset.version = VERSION;
        root.innerHTML = `
            <button type="button" class="cgpt-ara-toggle" aria-label="自动朗读：开"
                aria-pressed="true" aria-busy="false" data-tooltip="自动朗读：开">
                <svg class="cgpt-ara-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 17h2.1l.9-2.6h6l.9 2.6H18L13.2 6h-2.4L6 17z"></path>
                    <path d="M9.7 12.5h4.6L12 7.6l-2.3 4.9z"></path>
                    <path d="M19 8c1.3 2.4 1.3 5.6 0 8"></path>
                </svg>
            </button>
        `;

        const button = root.querySelector('.cgpt-ara-toggle');
        button.addEventListener('click', handleToggleClick);
        root.addEventListener('pointerdown', handlePointerDown);
        root.addEventListener('click', suppressDraggedClick, true);

        (document.body || document.documentElement).appendChild(root);
        updateTogglePosition();
        updateToggleState();
        return root;
    }

    function handleToggleClick() {
        if (consumeSuppressedClick()) return;
        setAutoReadEnabled(!settings.autoRead);
    }

    function updateToggleState() {
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const button = root.querySelector('.cgpt-ara-toggle');
        if (!button) return;

        const state = visualState === 'error'
            ? 'error'
            : (!settings.autoRead ? 'off' : (pendingTask ? 'waiting' : 'on'));
        const label = state === 'error'
            ? '自动朗读：触发失败'
            : (state === 'waiting' ? '自动朗读：等待回答完成' : '自动朗读：' + (settings.autoRead ? '开' : '关'));

        root.dataset.version = VERSION;
        root.dataset.state = state;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', settings.autoRead ? 'true' : 'false');
        button.setAttribute('aria-busy', state === 'waiting' ? 'true' : 'false');
        button.setAttribute('title', label);
        button.dataset.tooltip = label;
    }

    function showErrorState(message) {
        window.clearTimeout(errorTimer);
        visualState = 'error';
        updateToggleState();
        warn(message);
        errorTimer = window.setTimeout(() => {
            visualState = 'idle';
            updateToggleState();
        }, ERROR_STATE_MS);
    }

    function updateTogglePosition() {
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const rect = root.getBoundingClientRect();
        const width = rect.width || 34;
        const height = rect.height || 34;
        let left;
        let top;

        if (settings.position) {
            left = settings.position.left;
            top = settings.position.top;
        } else {
            const main = document.querySelector('main');
            const mainRect = main ? main.getBoundingClientRect() : null;
            left = mainRect ? mainRect.left + 12 : 64;
            top = 64;
        }

        left = clamp(left, 8, Math.max(8, window.innerWidth - width - 8));
        top = clamp(top, 8, Math.max(8, window.innerHeight - height - 8));
        root.style.setProperty('--cgpt-ara-left', Math.round(left) + 'px');
        root.style.setProperty('--cgpt-ara-top', Math.round(top) + 'px');

        if (settings.position && (left !== settings.position.left || top !== settings.position.top)) {
            settings.position = { left: Math.round(left), top: Math.round(top) };
            gmWrite(STORAGE.position, settings.position);
        }
    }

    function handlePointerDown(event) {
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

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerEnd);
        window.addEventListener('pointercancel', handlePointerEnd);
    }

    function handlePointerMove(event) {
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
            } catch (_error) {
                // Window listeners keep dragging usable when capture is unavailable.
            }
        }

        const rect = root.getBoundingClientRect();
        const left = clamp(
            dragState.startLeft + deltaX,
            8,
            Math.max(8, window.innerWidth - rect.width - 8),
        );
        const top = clamp(
            dragState.startTop + deltaY,
            8,
            Math.max(8, window.innerHeight - rect.height - 8),
        );

        root.classList.add('is-dragging');
        root.style.setProperty('--cgpt-ara-left', Math.round(left) + 'px');
        root.style.setProperty('--cgpt-ara-top', Math.round(top) + 'px');
        event.preventDefault();
    }

    function handlePointerEnd(event) {
        if (!dragState || event.pointerId !== dragState.pointerId) return;
        const finishedDrag = dragState;
        const root = document.getElementById(ROOT_ID);

        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerEnd);
        window.removeEventListener('pointercancel', handlePointerEnd);

        if (root) {
            root.classList.remove('is-dragging');
            if (finishedDrag.captured) {
                try {
                    root.releasePointerCapture(event.pointerId);
                } catch (_error) {
                    // Matching release is best-effort.
                }
            }

            if (finishedDrag.moved) {
                const rect = root.getBoundingClientRect();
                settings.position = {
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                };
                gmWrite(STORAGE.position, settings.position);
                suppressNextClick = true;
                window.setTimeout(() => {
                    suppressNextClick = false;
                }, 0);
            }
        }

        dragState = null;
    }

    function suppressDraggedClick(event) {
        if (!suppressNextClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressNextClick = false;
    }

    function consumeSuppressedClick() {
        if (!suppressNextClick) return false;
        suppressNextClick = false;
        return true;
    }

    function bindGlobalEvents() {
        document.addEventListener('submit', handleComposerSubmit, true);
        document.addEventListener('click', handleSendButtonClick, true);
        window.addEventListener('keydown', handleBareArrowSeek, true);
        window.addEventListener('resize', updateTogglePosition, { passive: true });
    }

    function handleComposerSubmit(event) {
        const form = event.target instanceof HTMLFormElement ? event.target : null;
        if (!form || !form.querySelector(SELECTORS.composer)) return;
        armTask('composer-submit');
    }

    function handleSendButtonClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        const button = target.closest(SELECTORS.sendButton);
        if (button) {
            const form = button.closest('form');
            if (form && form.querySelector(SELECTORS.composer)) armTask('send-button');
            return;
        }

        const generationAction = target.closest('button, [role="button"]');
        const actionLabel = generationAction && normalizeText([
            generationAction.getAttribute('aria-label'),
            generationAction.getAttribute('title'),
            generationAction.textContent,
        ].filter(Boolean).join(' '));
        if (generationAction && GENERATION_ACTION_RE.test(actionLabel)) {
            armTask('generation-action');
        }
    }

    function startObserver() {
        observer = new MutationObserver(() => {
            ensureToggleMounted();
            scheduleEvaluation();
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    function scheduleEvaluation(delayMs) {
        if (checkTimer) return;
        checkTimer = window.setTimeout(() => {
            checkTimer = 0;
            evaluatePageState();
        }, delayMs ?? CHECK_DEBOUNCE_MS);
    }

    function evaluatePageState() {
        const generationActive = isGenerationActive();

        if (generationActive && !generationWasActive && settings.autoRead) {
            if (pendingTask) {
                pendingTask.generationSeen = true;
            } else {
                armTask('generation-start');
                if (pendingTask) pendingTask.generationSeen = true;
            }
        }

        generationWasActive = generationActive;
        if (pendingTask) checkPendingTask(generationActive);
    }

    function armTask(source) {
        if (!settings.autoRead) return;

        const now = Date.now();
        if (pendingTask && now - pendingTask.createdAt < 800 && !pendingTask.clicked) {
            return;
        }

        if (pendingTask) cancelPendingTask('superseded');

        pendingTask = {
            id: ++taskSequence,
            source,
            createdAt: now,
            expiresAt: now + TASK_TIMEOUT_MS,
            conversationId: getConversationId(),
            generationSeen: isGenerationActive(),
            baseline: snapshotAssistantTurns(),
            lastText: '',
            stableSince: 0,
            controlDeadline: 0,
            clicked: false,
            cancelled: false,
        };

        visualState = 'waiting';
        updateToggleState();
        scheduleEvaluation(0);
        log('Armed for a new response.', { taskId: pendingTask.id, source });
    }

    function cancelPendingTask(reason) {
        if (!pendingTask) return;
        const cancelled = pendingTask;
        cancelled.cancelled = true;
        pendingTask = null;
        visualState = 'idle';
        updateToggleState();
        log('Pending response cancelled.', { taskId: cancelled.id, reason });
    }

    function checkPendingTask(generationActive) {
        const task = pendingTask;
        if (!task || task.cancelled || task.clicked) return;

        const now = Date.now();
        if (!settings.autoRead) {
            cancelPendingTask('disabled');
            return;
        }

        const currentConversationId = getConversationId();
        if (task.conversationId && currentConversationId !== task.conversationId) {
            cancelPendingTask('conversation-navigation');
            return;
        }
        if (!task.conversationId && currentConversationId) {
            task.conversationId = currentConversationId;
        }

        if (now >= task.expiresAt) {
            failPendingTask(task, 'Timed out waiting for the new response.');
            return;
        }

        const target = findTargetTurn(task);
        if (!target) {
            if (!generationActive && !task.generationSeen && now - task.createdAt >= INTENT_TIMEOUT_MS) {
                cancelPendingTask('no-generation-started');
                return;
            }
            scheduleEvaluation(300);
            return;
        }

        const text = getTurnText(target);
        if (!text) {
            scheduleEvaluation(250);
            return;
        }

        if (generationActive) {
            task.generationSeen = true;
            task.lastText = text;
            task.stableSince = 0;
            task.controlDeadline = 0;
            scheduleEvaluation(300);
            return;
        }

        if (text !== task.lastText) {
            task.lastText = text;
            task.stableSince = now;
            task.controlDeadline = 0;
            scheduleEvaluation(TEXT_STABLE_MS);
            return;
        }

        if (!task.stableSince) {
            task.stableSince = now;
            scheduleEvaluation(TEXT_STABLE_MS);
            return;
        }

        const remainingStableTime = TEXT_STABLE_MS - (now - task.stableSince);
        if (remainingStableTime > 0) {
            scheduleEvaluation(Math.min(remainingStableTime, 300));
            return;
        }

        const control = findReadControl(target);
        if (!control) {
            if (!task.controlDeadline) task.controlDeadline = now + CONTROL_WAIT_MS;
            if (now >= task.controlDeadline) {
                failPendingTask(task, 'No scoped Read Aloud control was found for the new response.');
                return;
            }
            scheduleEvaluation(250);
            return;
        }

        task.clicked = true;
        void triggerReadOnce(task, target, control);
    }

    function failPendingTask(task, message) {
        if (!pendingTask || pendingTask.id !== task.id) return;
        task.cancelled = true;
        pendingTask = null;
        showErrorState(message);
    }

    async function triggerReadOnce(task, target, control) {
        if (!pendingTask || pendingTask.id !== task.id || task.cancelled || !settings.autoRead) return;

        const baseline = capturePlaybackBaseline();
        try {
            control.click();
        } catch (error) {
            failPendingTask(task, 'The scoped Read Aloud control could not be clicked.');
            warn('Read Aloud click failed.', { error: String(error) });
            return;
        }

        const playbackConfirmed = await waitForPlaybackSignal(target, baseline, task);
        if (!pendingTask || pendingTask.id !== task.id || task.cancelled) return;

        pendingTask = null;
        visualState = 'idle';
        updateToggleState();

        if (playbackConfirmed) {
            log('Native Read Aloud started.', { taskId: task.id });
        } else {
            showErrorState('Read Aloud was clicked once, but playback could not be confirmed.');
        }
    }

    function snapshotAssistantTurns() {
        return getAssistantTurns().map((turn) => ({
            element: turn,
            stableId: getTurnStableId(turn),
            textHash: hashText(getTurnText(turn)),
        }));
    }

    function findTargetTurn(task) {
        const candidates = [];
        for (const turn of getAssistantTurns()) {
            const text = getTurnText(turn);
            if (!text) continue;

            const stableId = getTurnStableId(turn);
            const baseline = task.baseline.find((entry) => {
                if (entry.element === turn) return true;
                return stableId && entry.stableId && stableId === entry.stableId;
            });

            if (!baseline || baseline.textHash !== hashText(text)) candidates.push(turn);
        }

        return candidates.length ? candidates[candidates.length - 1] : null;
    }

    function getAssistantTurns() {
        const turns = [];
        const seen = new Set();

        for (const message of document.querySelectorAll(SELECTORS.assistant)) {
            const turn = message.closest('article')
                || message.closest('[data-testid^="conversation-turn"]')
                || message.parentElement;
            if (turn && !seen.has(turn)) {
                seen.add(turn);
                turns.push(turn);
            }
        }

        return turns;
    }

    function getTurnStableId(turn) {
        const message = turn.querySelector(SELECTORS.assistant);
        return normalizeText(
            (message && (message.getAttribute('data-message-id') || message.id))
            || turn.getAttribute('data-message-id')
            || turn.getAttribute('data-testid')
            || turn.id
            || '',
        );
    }

    function getTurnText(turn) {
        const message = turn && turn.querySelector(SELECTORS.assistant);
        return normalizeText(message ? (message.innerText || message.textContent || '') : '');
    }

    function getConversationId() {
        const match = window.location.pathname.match(/\/c\/([^/?]+)/);
        return match ? match[1] : '';
    }

    function findReadControl(turn) {
        const extensionControl = turn.querySelector(SELECTORS.extensionRead);
        if (isActionable(extensionControl)) return extensionControl;

        const directNative = turn.querySelector(SELECTORS.nativeRead);
        if (isActionable(directNative)) return directNative;

        const labelledControls = Array.from(turn.querySelectorAll('button[aria-label], [role="button"][aria-label]'));
        return labelledControls.find((element) => {
            const label = normalizeText(element.getAttribute('aria-label') || '');
            return READ_ALOUD_RE.test(label) && isActionable(element);
        }) || null;
    }

    function isGenerationActive() {
        const direct = document.querySelector('[data-testid="stop-button"], button[data-testid="stop-button"]');
        if (isActionable(direct)) return true;

        return Array.from(document.querySelectorAll('button[aria-label]')).some((button) => {
            const label = normalizeText(button.getAttribute('aria-label') || '');
            return STOP_GENERATING_RE.test(label) && isActionable(button);
        });
    }

    function isActionable(element) {
        return Boolean(element && !element.disabled && isVisible(element));
    }

    function isVisible(element) {
        if (!(element instanceof Element)) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0
            && rect.height > 0
            && style.display !== 'none'
            && style.visibility !== 'hidden';
    }

    function capturePlaybackBaseline() {
        return {
            media: Array.from(document.querySelectorAll('audio, video')).map((media) => ({
                element: media,
                src: media.currentSrc || media.src || '',
                paused: media.paused,
            })),
            seekEnabled: hasEnabledSeekControl(),
        };
    }

    async function waitForPlaybackSignal(target, baseline, task) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < PLAYBACK_VERIFY_MS) {
            if (task.cancelled) return false;

            const activeInline = target.querySelector(SELECTORS.extensionRead + '.cgpt-active');
            if (activeInline) return true;

            if (!baseline.seekEnabled && hasEnabledSeekControl()) return true;
            if (hasNewMediaSignal(baseline.media)) return true;
            await delay(125);
        }
        return false;
    }

    function hasEnabledSeekControl() {
        return [SELECTORS.seekBack, SELECTORS.seekForward].some((selector) => {
            const button = document.querySelector(selector);
            return isActionable(button);
        });
    }

    function hasNewMediaSignal(baseline) {
        for (const media of document.querySelectorAll('audio, video')) {
            if (media.paused || media.ended) continue;
            const previous = baseline.find((entry) => entry.element === media);
            const src = media.currentSrc || media.src || '';
            if (!previous || previous.paused || previous.src !== src) return true;
        }
        return false;
    }

    function handleBareArrowSeek(event) {
        if (!settings.bareArrowSeek || event.repeat) return;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (isInteractiveEvent(event) || hasVisibleOverlay()) return;

        const selector = event.key === 'ArrowLeft' ? SELECTORS.seekBack : SELECTORS.seekForward;
        const seekButton = document.querySelector(selector);
        if (!isActionable(seekButton)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        seekButton.click();
    }

    function isInteractiveEvent(event) {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
        const activeElement = document.activeElement;
        if (activeElement instanceof Element && isInteractiveElement(activeElement)) return true;

        return path.some((item) => item instanceof Element && isInteractiveElement(item));
    }

    function isInteractiveElement(element) {
        return element.matches(INTERACTIVE_SELECTOR)
            || element.isContentEditable
            || Boolean(element.closest(INTERACTIVE_SELECTOR));
    }

    function hasVisibleOverlay() {
        return Array.from(document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"]'))
            .some(isVisible);
    }

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function hashText(value) {
        const text = normalizeText(value);
        let hash = 0;
        for (let index = 0; index < text.length; index += 1) {
            hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
        }
        return String(hash >>> 0);
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function delay(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }
})();
