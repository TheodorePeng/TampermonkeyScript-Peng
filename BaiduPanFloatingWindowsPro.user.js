// ==UserScript==
// @name         BaiduPan Floating Windows Pro
// @namespace    https://example.local/
// @version      1.0.10
// @description  Stable dual floating windows for Baidu Pan video pages with shell-based layout control, state persistence, and resilient re-binding.
// @author       TheodorePeng & Codex
// @match        *://pan.baidu.com/pfile/video*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/BaiduPanFloatingWindowsPro.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/BaiduPanFloatingWindowsPro.user.js
// ==/UserScript==

(() => {
    "use strict";

    const APP_VERSION = "1.0.10";
    const APP_KEY = "__BPFW_PRO_APP__";
    const STORAGE_KEY = "bpfw_pro_state_v1";
    const ROOT_CLASS = "bpfw-root";
    const VIEWPORT_PADDING = 0;
    const CORRECTION_DELAYS = [0, 120, 500];
    const TAB_LABELS = ["视频", "笔记", "AI看", "课件", "文稿"];
    const PILL_SIZE = 20;
    const PILL_DRAG_THRESHOLD = 4;

    const TARGETS = {
        player: {
            key: "player",
            selector: ".drager_left",
            title: "视频播放",
            minWidth: 440,
            minHeight: 280,
        },
        sidebar: {
            key: "sidebar",
            selector: ".drager_right",
            title: "视频资料",
            minWidth: 320,
            minHeight: 360,
        },
    };

    const DEFAULT_STATE = {
        enabled: false,
        playerRect: null,
        sidebarRect: null,
        playerResetRect: null,
        sidebarResetRect: null,
        playerLocked: false,
        sidebarLocked: false,
        zOrder: ["player", "sidebar"],
        pillPosition: null,
        themeModeVersion: 1,
    };

    if (window[APP_KEY] && typeof window[APP_KEY].destroy === "function") {
        try {
            window[APP_KEY].destroy({ quiet: true });
        } catch (error) {
            console.warn("[BPFW] Failed to destroy previous instance:", error);
        }
    }

    const gm = createGMBridge();
    const stateStore = createStateStore();

    cleanupOrphanedUi();

    function createGMBridge() {
        return {
            addStyle(cssText) {
                if (typeof GM_addStyle === "function") {
                    GM_addStyle(cssText);
                    return;
                }
                const style = document.createElement("style");
                style.textContent = cssText;
                document.head.appendChild(style);
            },
            getValue(key, fallback) {
                try {
                    if (typeof GM_getValue === "function") {
                        return GM_getValue(key, fallback);
                    }
                    const raw = window.localStorage.getItem(key);
                    return raw == null ? fallback : raw;
                } catch (error) {
                    console.warn("[BPFW] Failed to read state:", error);
                    return fallback;
                }
            },
            setValue(key, value) {
                try {
                    if (typeof GM_setValue === "function") {
                        GM_setValue(key, value);
                        return;
                    }
                    window.localStorage.setItem(key, value);
                } catch (error) {
                    console.warn("[BPFW] Failed to write state:", error);
                }
            },
        };
    }

    function cleanupOrphanedUi() {
        document.querySelectorAll(`.${ROOT_CLASS}, .${ROOT_CLASS}-pill, .${ROOT_CLASS}-toastStack`).forEach((node) => {
            node.remove();
        });
    }

    function createStateStore() {
        let cached = null;

        function load() {
            if (cached) {
                return { ...DEFAULT_STATE, ...cached };
            }
            const raw = gm.getValue(STORAGE_KEY, "");
            if (!raw) {
                cached = { ...DEFAULT_STATE };
                return { ...cached };
            }
            try {
                cached = { ...DEFAULT_STATE, ...JSON.parse(raw) };
                return { ...cached };
            } catch (error) {
                console.warn("[BPFW] Failed to parse stored state:", error);
                cached = { ...DEFAULT_STATE };
                return { ...cached };
            }
        }

        function save(nextState) {
            cached = { ...DEFAULT_STATE, ...nextState };
            gm.setValue(STORAGE_KEY, JSON.stringify(cached));
            return { ...cached };
        }

        function patch(partial) {
            const next = { ...load(), ...partial };
            return save(next);
        }

        return { load, save, patch };
    }

    function createElement(tagName, className, attributes = {}) {
        const element = document.createElement(tagName);
        if (className) {
            element.className = className;
        }
        Object.entries(attributes).forEach(([name, value]) => {
            if (value == null) {
                return;
            }
            if (name === "text") {
                element.textContent = value;
            } else if (name === "html") {
                element.innerHTML = value;
            } else {
                element.setAttribute(name, value);
            }
        });
        return element;
    }

    function delay(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    function raf() {
        return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    }

    function isVisibleNode(node) {
        if (!(node instanceof HTMLElement)) {
            return false;
        }
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function getDefaultPillPosition() {
        return { left: 5, top: 39 };
    }

    function isSamePoint(a, b) {
        if (!a || !b) {
            return false;
        }
        return Math.round(a.left) === Math.round(b.left) && Math.round(a.top) === Math.round(b.top);
    }

    function normalizePillPosition(position, width = PILL_SIZE, height = PILL_SIZE) {
        const fallback = getDefaultPillPosition();
        const next = position && Number.isFinite(position.left) && Number.isFinite(position.top)
            ? position
            : fallback;
        const maxLeft = Math.max(0, window.innerWidth - width);
        const maxTop = Math.max(0, window.innerHeight - height);
        return {
            left: clamp(Math.round(next.left), 0, maxLeft),
            top: clamp(Math.round(next.top), 0, maxTop),
        };
    }

    function normalizeRect(rect, minWidth, minHeight) {
        const viewportWidth = Math.max(window.innerWidth, minWidth + VIEWPORT_PADDING * 2);
        const viewportHeight = Math.max(window.innerHeight, minHeight + VIEWPORT_PADDING * 2);
        const maxWidth = Math.max(minWidth, viewportWidth - VIEWPORT_PADDING * 2);
        const maxHeight = Math.max(minHeight, viewportHeight - VIEWPORT_PADDING * 2);
        const width = clamp(Math.round(rect.width || minWidth), minWidth, maxWidth);
        const height = clamp(Math.round(rect.height || minHeight), minHeight, maxHeight);
        const left = clamp(Math.round(rect.left || VIEWPORT_PADDING), VIEWPORT_PADDING, viewportWidth - width - VIEWPORT_PADDING);
        const top = clamp(Math.round(rect.top || VIEWPORT_PADDING), VIEWPORT_PADDING, viewportHeight - height - VIEWPORT_PADDING);
        return { left, top, width, height };
    }

    function resolveRect(node, targetConfig) {
        const rect = node.getBoundingClientRect();
        const looksReal = rect.width > 40 && rect.height > 40;
        if (looksReal) {
            return normalizeRect(rect, targetConfig.minWidth, targetConfig.minHeight);
        }
        const fallbackWidth = targetConfig.key === "player"
            ? Math.round(window.innerWidth * 0.58)
            : Math.round(window.innerWidth * 0.28);
        const fallbackHeight = targetConfig.key === "player"
            ? Math.round(window.innerHeight * 0.62)
            : Math.round(window.innerHeight * 0.72);
        const fallbackLeft = targetConfig.key === "player" ? 24 : Math.round(window.innerWidth * 0.64);
        return normalizeRect({
            left: fallbackLeft,
            top: 90,
            width: fallbackWidth,
            height: fallbackHeight,
        }, targetConfig.minWidth, targetConfig.minHeight);
    }

    function getCurrentVideoTitle() {
        try {
            const url = new URL(window.location.href);
            const path = url.searchParams.get("path");
            if (path) {
                const decoded = decodeURIComponent(path);
                const basename = decoded.split("/").filter(Boolean).pop();
                if (basename) {
                    return basename;
                }
            }
        } catch (error) {
            console.warn("[BPFW] Failed to parse title from URL:", error);
        }

        return "视频播放";
    }

    function getStyleChain(node, maxDepth = 3) {
        const chain = [];
        let current = node;
        for (let depth = 0; depth < maxDepth && current instanceof HTMLElement; depth += 1) {
            chain.push(current);
            current = current.firstElementChild;
        }
        return chain;
    }

    function setImportantStyle(element, styles) {
        Object.entries(styles).forEach(([property, value]) => {
            element.style.setProperty(property, value, "important");
        });
    }

    function getActionIconMarkup(iconKey) {
        const icons = {
            lock: `
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <rect x="3.75" y="7" width="8.5" height="5.75" rx="1.8"></rect>
                    <path d="M5.5 7V5.4a2.5 2.5 0 0 1 5 0V7"></path>
                </svg>
            `,
            unlock: `
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <rect x="3.75" y="7" width="8.5" height="5.75" rx="1.8"></rect>
                    <path d="M10.5 7V5.65a2.5 2.5 0 0 0-4.6-1.35"></path>
                </svg>
            `,
            reset: `
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path d="M4.25 3.25v3h3"></path>
                    <path d="M4.55 6A4.75 4.75 0 1 1 3.3 9.5"></path>
                </svg>
            `,
        };
        return icons[iconKey] || "";
    }

    function getPillIconMarkup() {
        return "⛶";
    }

    function getFocusableTarget(target) {
        if (!(target instanceof Element)) {
            return null;
        }
        return target.closest(`.${ROOT_CLASS}-shell`);
    }

    class FloatingShell {
        constructor(app, targetConfig) {
            this.app = app;
            this.config = targetConfig;
            this.key = targetConfig.key;
            this.locked = false;
            this.rect = null;
            this.node = null;
            this.abortController = new AbortController();

            this.root = createElement("section", `${ROOT_CLASS}-shell ${ROOT_CLASS}-shell--${this.key}`, {
                "data-key": this.key,
                tabindex: "0",
            });
            this.header = createElement("header", `${ROOT_CLASS}-header`);
            this.title = createElement("div", `${ROOT_CLASS}-title`, { text: targetConfig.title });
            this.actions = createElement("div", `${ROOT_CLASS}-actions`);
            this.content = createElement("div", `${ROOT_CLASS}-content`, {
                "data-role": "content",
            });
            this.resizeHandle = createElement("button", `${ROOT_CLASS}-resize`, {
                type: "button",
                title: "拖动缩放",
                "aria-label": "拖动缩放",
            });

            this.lockButton = this.createActionButton("lock", "锁定窗口", () => {
                this.app.toggleLock(this.key);
            });
            this.resetButton = this.createActionButton("reset", "恢复默认位置和大小", () => {
                this.app.resetWindow(this.key);
            });

            this.actions.append(this.lockButton, this.resetButton);
            this.header.append(this.title, this.actions);
            this.root.append(this.header, this.content, this.resizeHandle);
            this.bindInteractions();
        }

        createActionButton(iconKey, title, onClick) {
            const button = createElement("button", `${ROOT_CLASS}-action`, {
                type: "button",
                title,
                "aria-label": title,
            });
            button.dataset.icon = iconKey;
            button.innerHTML = getActionIconMarkup(iconKey);
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                onClick();
            }, { signal: this.abortController.signal });
            return button;
        }

        setActionButtonState(button, iconKey, title) {
            button.dataset.icon = iconKey;
            button.setAttribute("title", title);
            button.setAttribute("aria-label", title);
            button.innerHTML = getActionIconMarkup(iconKey);
        }

        setTitle(text) {
            const nextTitle = text || this.config.title;
            this.title.textContent = nextTitle;
            this.title.setAttribute("title", nextTitle);
        }

        bindInteractions() {
            const signal = this.abortController.signal;

            this.root.addEventListener("pointerdown", () => {
                this.app.focusShell(this.key);
            }, { signal });

            this.root.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                    this.root.blur();
                }
            }, { signal });

            this.header.addEventListener("pointerdown", (event) => {
                if (this.locked || event.button !== 0) {
                    return;
                }
                if (event.target instanceof Element && event.target.closest(`.${ROOT_CLASS}-action`)) {
                    return;
                }
                event.preventDefault();
                this.app.focusShell(this.key);
                const startRect = { ...this.rect };
                const startX = event.clientX;
                const startY = event.clientY;
                const onMove = (moveEvent) => {
                    const nextRect = {
                        left: startRect.left + (moveEvent.clientX - startX),
                        top: startRect.top + (moveEvent.clientY - startY),
                        width: startRect.width,
                        height: startRect.height,
                    };
                    this.setRect(nextRect, { persist: false });
                };
                const onUp = () => {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                    this.commitRect();
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
            }, { signal });

            this.resizeHandle.addEventListener("pointerdown", (event) => {
                if (this.locked || event.button !== 0) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                this.app.focusShell(this.key);
                const startRect = { ...this.rect };
                const startX = event.clientX;
                const startY = event.clientY;
                const onMove = (moveEvent) => {
                    const nextRect = {
                        left: startRect.left,
                        top: startRect.top,
                        width: startRect.width + (moveEvent.clientX - startX),
                        height: startRect.height + (moveEvent.clientY - startY),
                    };
                    this.setRect(nextRect, { persist: false });
                };
                const onUp = () => {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                    this.commitRect();
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
            }, { signal });
        }

        mountNode(node) {
            this.node = node;
            this.content.replaceChildren(node);
            this.root.dataset.mounted = "true";
        }

        detachNode() {
            if (!this.node) {
                return null;
            }
            const node = this.node;
            this.node = null;
            if (node.parentElement === this.content) {
                this.content.removeChild(node);
            }
            this.root.dataset.mounted = "false";
            return node;
        }

        setLocked(locked, options = {}) {
            this.locked = Boolean(locked);
            this.root.dataset.locked = this.locked ? "true" : "false";
            this.setActionButtonState(
                this.lockButton,
                this.locked ? "unlock" : "lock",
                this.locked ? "解锁窗口" : "锁定窗口"
            );
            if (options.persist !== false) {
                this.app.persistLock(this.key, this.locked);
            }
        }

        setRect(rect, options = {}) {
            const normalized = normalizeRect(rect, this.config.minWidth, this.config.minHeight);
            this.rect = normalized;
            this.root.style.left = `${normalized.left}px`;
            this.root.style.top = `${normalized.top}px`;
            this.root.style.width = `${normalized.width}px`;
            this.root.style.height = `${normalized.height}px`;
            if (options.persist !== false) {
                this.app.persistRect(this.key, normalized);
            }
        }

        commitRect() {
            if (!this.rect) {
                return;
            }
            this.app.persistRect(this.key, this.rect);
            this.app.scheduleCorrection(`commit-${this.key}`);
        }

        focus(zIndex) {
            this.root.style.zIndex = String(zIndex);
            this.root.dataset.active = "true";
        }

        blur() {
            this.root.dataset.active = "false";
        }

        destroy() {
            this.abortController.abort();
            this.detachNode();
            this.root.remove();
        }
    }

    class FloatingWindowsApp {
        constructor() {
            this.state = this.ensurePersistedState(stateStore.load());
            this.shells = new Map();
            this.registry = new Map();
            this.portal = null;
            this.toastStack = null;
            this.pill = null;
            this.pillDragState = null;
            this.suppressNextPillClick = false;
            this.documentObserver = null;
            this.windowResizeTimer = null;
            this.pendingCorrectionTimers = [];
            this.correctionRaf = 0;
            this.correctionToken = 0;
            this.isActive = false;
            this.isCorrecting = false;
            this.visibleKeys = new Set(Object.keys(TARGETS));
            this.bootstrapAbort = new AbortController();
        }

        ensurePersistedState(state) {
            const nextState = { ...state };
            let changed = false;

            Object.keys(TARGETS).forEach((key) => {
                const resetKey = `${key}ResetRect`;
                const currentKey = `${key}Rect`;
                if (!nextState[resetKey] && nextState[currentKey]) {
                    nextState[resetKey] = normalizeRect(
                        nextState[currentKey],
                        TARGETS[key].minWidth,
                        TARGETS[key].minHeight
                    );
                    changed = true;
                }
            });

            if (nextState.pillPosition) {
                const normalizedPillPosition = normalizePillPosition(nextState.pillPosition);
                if (!isSamePoint(normalizedPillPosition, nextState.pillPosition)) {
                    nextState.pillPosition = normalizedPillPosition;
                    changed = true;
                }
            }

            return changed ? stateStore.save(nextState) : nextState;
        }

        async init() {
            gm.addStyle(this.getStyles());
            this.ensurePortal();
            this.createPill();
            this.bindGlobalEvents();

            const ready = await this.waitForVideoPageReady(20000);
            if (!ready) {
                this.showToast("未等到视频页面主体，按钮会继续待命。", "warn", 2600);
                return;
            }

            if (this.state.enabled) {
                await this.enable({ silent: true, restoreState: true });
            }
        }

        destroy(options = {}) {
            this.bootstrapAbort.abort();
            this.clearCorrectionTimers();
            this.disconnectObservers();
            if (this.isActive) {
                this.disable({ quiet: true });
            }
            if (this.pill && !options.keepUi) {
                this.pill.remove();
                this.pill = null;
            }
            if (this.toastStack && !options.keepUi) {
                this.toastStack.remove();
                this.toastStack = null;
            }
            if (this.portal && !options.keepUi) {
                this.portal.remove();
                this.portal = null;
            }
        }

        ensurePortal() {
            if (this.portal && this.portal.isConnected) {
                return this.portal;
            }
            this.portal = createElement("div", ROOT_CLASS, {
                "data-version": APP_VERSION,
            });
            document.body.appendChild(this.portal);
            return this.portal;
        }

        createPill() {
            if (this.pill) {
                return;
            }
            this.pill = createElement("button", `${ROOT_CLASS}-pill`, {
                type: "button",
                title: "切换双浮窗工作区 (Alt+Shift+W)",
                "aria-label": "切换双浮窗工作区",
            });
            const icon = createElement("span", `${ROOT_CLASS}-pillIcon`, {
                text: getPillIconMarkup(),
            });
            this.pill.append(icon);
            this.pill.addEventListener("click", (event) => {
                if (this.suppressNextPillClick) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.suppressNextPillClick = false;
                    return;
                }
                this.toggle();
            }, { signal: this.bootstrapAbort.signal });
            this.pill.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) {
                    return;
                }
                const startPosition = this.getCurrentPillPosition();
                this.pillDragState = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    startLeft: startPosition.left,
                    startTop: startPosition.top,
                    dragging: false,
                };
                this.pill.dataset.dragging = "false";
                if (typeof this.pill.setPointerCapture === "function") {
                    this.pill.setPointerCapture(event.pointerId);
                }
            }, { signal: this.bootstrapAbort.signal });
            this.pill.addEventListener("pointermove", (event) => {
                const dragState = this.pillDragState;
                if (!dragState || event.pointerId !== dragState.pointerId) {
                    return;
                }
                const deltaX = event.clientX - dragState.startX;
                const deltaY = event.clientY - dragState.startY;
                if (!dragState.dragging && Math.hypot(deltaX, deltaY) >= PILL_DRAG_THRESHOLD) {
                    dragState.dragging = true;
                    this.pill.dataset.dragging = "true";
                }
                if (!dragState.dragging) {
                    return;
                }
                event.preventDefault();
                this.applyPillPosition({
                    left: dragState.startLeft + deltaX,
                    top: dragState.startTop + deltaY,
                }, { persist: false });
            }, { signal: this.bootstrapAbort.signal });
            const finishPillPointer = (event) => {
                const dragState = this.pillDragState;
                if (!dragState || event.pointerId !== dragState.pointerId) {
                    return;
                }
                if (dragState.dragging) {
                    event.preventDefault();
                    this.suppressNextPillClick = true;
                    this.applyPillPosition({
                        left: dragState.startLeft + (event.clientX - dragState.startX),
                        top: dragState.startTop + (event.clientY - dragState.startY),
                    }, { persist: true });
                    window.setTimeout(() => {
                        this.suppressNextPillClick = false;
                    }, 0);
                }
                this.pill.dataset.dragging = "false";
                if (typeof this.pill.hasPointerCapture === "function" && this.pill.hasPointerCapture(event.pointerId)) {
                    this.pill.releasePointerCapture(event.pointerId);
                }
                this.pillDragState = null;
            };
            this.pill.addEventListener("pointerup", finishPillPointer, { signal: this.bootstrapAbort.signal });
            this.pill.addEventListener("pointercancel", finishPillPointer, { signal: this.bootstrapAbort.signal });
            document.body.appendChild(this.pill);
            this.applyPillPosition(this.state.pillPosition || getDefaultPillPosition(), {
                persist: Boolean(this.state.pillPosition),
            });
            this.updatePillState();
        }

        updatePillState() {
            if (!this.pill) {
                return;
            }
            this.pill.dataset.active = this.isActive ? "true" : "false";
            this.pill.setAttribute("aria-pressed", this.isActive ? "true" : "false");
        }

        getCurrentPillPosition() {
            if (!this.pill) {
                return normalizePillPosition(this.state.pillPosition || getDefaultPillPosition());
            }
            const left = Number.parseFloat(this.pill.style.left);
            const top = Number.parseFloat(this.pill.style.top);
            const fallback = getDefaultPillPosition();
            return normalizePillPosition({
                left: Number.isFinite(left) ? left : this.pill.offsetLeft || fallback.left,
                top: Number.isFinite(top) ? top : this.pill.offsetTop || fallback.top,
            }, this.pill.offsetWidth || PILL_SIZE, this.pill.offsetHeight || PILL_SIZE);
        }

        persistPillPosition(position) {
            const normalized = normalizePillPosition(position, this.pill?.offsetWidth || PILL_SIZE, this.pill?.offsetHeight || PILL_SIZE);
            this.state = stateStore.patch({
                pillPosition: normalized,
            });
            return normalized;
        }

        applyPillPosition(position, options = {}) {
            if (!this.pill) {
                return normalizePillPosition(position);
            }
            const normalized = normalizePillPosition(
                position,
                this.pill.offsetWidth || PILL_SIZE,
                this.pill.offsetHeight || PILL_SIZE
            );
            this.pill.style.left = `${normalized.left}px`;
            this.pill.style.top = `${normalized.top}px`;
            if (options.persist) {
                this.persistPillPosition(normalized);
            }
            return normalized;
        }

        reconcilePillPosition(options = {}) {
            const currentPosition = this.getCurrentPillPosition();
            const normalized = this.applyPillPosition(currentPosition, { persist: false });
            if (options.persist && !isSamePoint(normalized, this.state.pillPosition)) {
                this.persistPillPosition(normalized);
            }
            return normalized;
        }

        bindGlobalEvents() {
            window.addEventListener("keydown", (event) => {
                if (event.defaultPrevented) {
                    return;
                }
                if (event.altKey && event.shiftKey && event.code === "KeyW") {
                    event.preventDefault();
                    this.toggle();
                    return;
                }
                if (event.altKey && event.shiftKey && event.code === "KeyR") {
                    event.preventDefault();
                    this.resetAllWindows();
                }
            }, { signal: this.bootstrapAbort.signal });

            window.addEventListener("resize", () => {
                window.clearTimeout(this.windowResizeTimer);
                this.windowResizeTimer = window.setTimeout(() => {
                    this.reconcilePillPosition({ persist: true });
                    if (!this.isActive) {
                        return;
                    }
                    this.shells.forEach((shell) => {
                        shell.setRect(shell.rect, { persist: true });
                    });
                    this.scheduleCorrection("viewport-resize");
                }, 120);
            }, { signal: this.bootstrapAbort.signal });

            document.addEventListener("click", (event) => {
                if (!this.isActive) {
                    return;
                }
                const target = event.target;
                if (!(target instanceof Element)) {
                    return;
                }
                const compactText = (target.textContent || "").replace(/\s+/g, "");
                if (TAB_LABELS.includes(compactText)) {
                    this.scheduleCorrection(`tab-click-${compactText}`);
                }
                const shell = getFocusableTarget(target);
                if (!shell) {
                    return;
                }
                const key = shell.getAttribute("data-key");
                if (key) {
                    this.focusShell(key);
                }
            }, { signal: this.bootstrapAbort.signal, capture: true });
        }

        async waitForVideoPageReady(timeoutMs) {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                const player = this.findPageTarget("player");
                const sidebar = this.findPageTarget("sidebar");
                if (player && sidebar) {
                    return true;
                }
                await delay(250);
            }
            return false;
        }

        async toggle() {
            if (this.isActive) {
                this.disable();
                return;
            }
            await this.enable();
        }

        async enable(options = {}) {
            if (this.isActive) {
                return true;
            }
            if (this.hasOldScriptConflict()) {
                this.showToast("检测到旧版浮窗脚本已激活，请先关闭旧版。", "warn", 3200);
                return false;
            }

            const ready = await this.waitForVideoPageReady(12000);
            if (!ready) {
                this.showToast("未找到播放器或右侧面板，暂时无法启用双浮窗。", "error", 3200);
                return false;
            }

            this.ensurePortal();

            Object.values(TARGETS).forEach((config) => {
                const node = this.findPageTarget(config.key);
                if (!node) {
                    return;
                }
                const shell = this.ensureShell(config);
                const entry = this.captureTarget(config, node);
                shell.mountNode(node);
                this.normalizeManagedTree(entry);
                const rect = this.getInitialRect(config.key, node, true);
                shell.setRect(rect, { persist: !options.restoreState });
                shell.setLocked(this.state[`${config.key}Locked`], { persist: false });
            });

            this.isActive = true;
            this.state = stateStore.patch({ enabled: true });
            this.refreshShellTitles();
            this.restoreZOrder();
            this.startObservers();
            this.scheduleCorrection("enable");
            this.updatePillState();

            if (!options.silent) {
                this.showToast("双浮窗工作区已开启。", "success", 2200);
            }
            return true;
        }

        disable(options = {}) {
            if (!this.isActive) {
                return;
            }

            this.clearCorrectionTimers();
            this.disconnectObservers();

            Array.from(this.registry.values()).forEach((entry) => {
                this.restoreTarget(entry);
            });
            this.registry.clear();

            Array.from(this.shells.values()).forEach((shell) => {
                shell.destroy();
            });
            this.shells.clear();

            this.isActive = false;
            this.visibleKeys = new Set(Object.keys(TARGETS));
            this.state = stateStore.patch({ enabled: false });
            this.updatePillState();
            window.dispatchEvent(new Event("resize"));

            if (!options.quiet) {
                this.showToast("双浮窗工作区已关闭。", "info", 2000);
            }
        }

        closeWindow(key) {
            const shell = this.shells.get(key);
            const entry = this.registry.get(key);
            if (!shell || !entry) {
                return;
            }
            this.restoreTarget(entry);
            shell.destroy();
            this.shells.delete(key);
            this.registry.delete(key);
            this.visibleKeys.delete(key);
            this.showToast(`${TARGETS[key].title}已恢复到页面原位。`, "info", 1800);

            if (this.shells.size === 0) {
                this.disable({ quiet: true });
                this.showToast("所有浮窗都已关闭，页面已恢复原样。", "info", 2200);
                return;
            }

            this.scheduleCorrection(`close-${key}`);
        }

        resetWindow(key) {
            const shell = this.shells.get(key);
            const entry = this.registry.get(key);
            if (!shell || !entry) {
                return;
            }
            shell.setRect(entry.defaultRect, { persist: true });
            this.scheduleCorrection(`reset-${key}`);
            this.showToast(`${TARGETS[key].title}已复位。`, "success", 1500);
        }

        resetAllWindows() {
            if (!this.isActive) {
                return;
            }
            this.shells.forEach((shell, key) => {
                const entry = this.registry.get(key);
                if (!entry) {
                    return;
                }
                shell.setRect(entry.defaultRect, { persist: true });
            });
            this.scheduleCorrection("reset-all");
            this.showToast("两个窗口的位置和尺寸已复位。", "success", 1800);
        }

        toggleLock(key) {
            const shell = this.shells.get(key);
            if (!shell) {
                return;
            }
            shell.setLocked(!shell.locked, { persist: true });
            this.showToast(shell.locked ? `${shell.config.title}已锁定。` : `${shell.config.title}已解锁。`, "info", 1600);
        }

        persistRect(key, rect) {
            this.state = stateStore.patch({
                [`${key}Rect`]: rect,
            });
        }

        getResetRect(key, node) {
            const storedReset = this.state[`${key}ResetRect`];
            if (storedReset) {
                return normalizeRect(storedReset, TARGETS[key].minWidth, TARGETS[key].minHeight);
            }
            const storedCurrent = this.state[`${key}Rect`];
            if (storedCurrent) {
                return normalizeRect(storedCurrent, TARGETS[key].minWidth, TARGETS[key].minHeight);
            }
            return resolveRect(node, TARGETS[key]);
        }

        persistLock(key, locked) {
            this.state = stateStore.patch({
                [`${key}Locked`]: locked,
            });
        }

        focusShell(key) {
            if (!this.shells.has(key)) {
                return;
            }
            const zOrder = this.nextZOrder(key);
            this.state = stateStore.patch({ zOrder });
            zOrder.forEach((name, index) => {
                const shell = this.shells.get(name);
                if (!shell) {
                    return;
                }
                shell.focus(2147482000 + index);
            });
        }

        nextZOrder(frontKey) {
            const keys = Array.from(this.shells.keys());
            const rest = keys.filter((key) => key !== frontKey);
            return [...rest, frontKey];
        }

        restoreZOrder() {
            const keys = Array.from(this.shells.keys());
            const zOrder = Array.isArray(this.state.zOrder)
                ? this.state.zOrder.filter((key) => keys.includes(key))
                : [];
            keys.forEach((key) => {
                if (!zOrder.includes(key)) {
                    zOrder.unshift(key);
                }
            });
            const normalized = zOrder.slice(-keys.length);
            normalized.forEach((key, index) => {
                const shell = this.shells.get(key);
                if (!shell) {
                    return;
                }
                shell.focus(2147482000 + index);
            });
            this.state = stateStore.patch({ zOrder: normalized });
        }

        ensureShell(config) {
            if (this.shells.has(config.key)) {
                return this.shells.get(config.key);
            }
            const shell = new FloatingShell(this, config);
            this.portal.appendChild(shell.root);
            this.shells.set(config.key, shell);
            return shell;
        }

        refreshShellTitles() {
            const playerShell = this.shells.get("player");
            if (playerShell) {
                playerShell.setTitle(getCurrentVideoTitle());
            }
            const sidebarShell = this.shells.get("sidebar");
            if (sidebarShell) {
                sidebarShell.setTitle(TARGETS.sidebar.title);
            }
        }

        getInitialRect(key, node, preferStored = true) {
            const stored = preferStored ? this.state[`${key}Rect`] : null;
            if (stored) {
                return normalizeRect(stored, TARGETS[key].minWidth, TARGETS[key].minHeight);
            }
            return resolveRect(node, TARGETS[key]);
        }

        captureTarget(config, node) {
            const existing = this.registry.get(config.key);
            if (existing && existing.node === node) {
                return existing;
            }
            if (existing) {
                this.cleanupEntry(existing, { dropNode: true });
            }

            const placeholder = createElement("div", `${ROOT_CLASS}-anchor`, {
                "data-key": config.key,
            });
            placeholder.style.display = "none";
            const originalParent = node.parentElement;
            const originalNextSibling = node.nextSibling;
            if (originalParent) {
                originalParent.insertBefore(placeholder, node);
            }

            const entry = {
                key: config.key,
                node,
                placeholder,
                originalParent,
                originalNextSibling,
                defaultRect: this.getResetRect(config.key, node),
                originalStyles: new Map(),
                observer: null,
            };
            this.registry.set(config.key, entry);
            this.watchTarget(entry);
            return entry;
        }

        watchTarget(entry) {
            if (entry.observer) {
                entry.observer.disconnect();
            }
            entry.observer = new MutationObserver(() => {
                if (!this.isActive || this.isCorrecting) {
                    return;
                }
                this.scheduleCorrection(`target-${entry.key}`);
            });
            entry.observer.observe(entry.node, {
                attributes: true,
                attributeFilter: ["style", "class"],
                childList: true,
            });
        }

        restoreTarget(entry) {
            if (!entry) {
                return;
            }

            if (entry.observer) {
                entry.observer.disconnect();
                entry.observer = null;
            }

            const shell = this.shells.get(entry.key);
            const managedNode = shell ? shell.detachNode() : entry.node;
            const outsideNode = this.findPageTarget(entry.key);

            if (outsideNode && outsideNode !== managedNode) {
                if (managedNode && managedNode.isConnected) {
                    managedNode.remove();
                }
                if (entry.placeholder && entry.placeholder.isConnected) {
                    entry.placeholder.remove();
                }
                return;
            }

            this.restoreManagedStyles(entry);

            if (managedNode) {
                if (entry.placeholder && entry.placeholder.isConnected) {
                    entry.placeholder.replaceWith(managedNode);
                } else if (entry.originalParent && entry.originalParent.isConnected) {
                    if (entry.originalNextSibling && entry.originalNextSibling.isConnected) {
                        entry.originalParent.insertBefore(managedNode, entry.originalNextSibling);
                    } else {
                        entry.originalParent.appendChild(managedNode);
                    }
                }
            }

            if (entry.placeholder && entry.placeholder.isConnected) {
                entry.placeholder.remove();
            }
        }

        cleanupEntry(entry, options = {}) {
            if (entry.observer) {
                entry.observer.disconnect();
            }
            if (options.dropNode && entry.node && entry.node.isConnected) {
                entry.node.remove();
            }
            if (entry.placeholder && entry.placeholder.isConnected) {
                entry.placeholder.remove();
            }
            this.registry.delete(entry.key);
        }

        restoreManagedStyles(entry) {
            entry.originalStyles.forEach((styleText, element) => {
                if (!(element instanceof HTMLElement)) {
                    return;
                }
                if (styleText) {
                    element.setAttribute("style", styleText);
                } else {
                    element.removeAttribute("style");
                }
                element.classList.remove(`${ROOT_CLASS}-managed`);
            });
            entry.originalStyles.clear();
        }

        rememberStyle(entry, element) {
            if (!element || entry.originalStyles.has(element)) {
                return;
            }
            entry.originalStyles.set(element, element.getAttribute("style") || "");
        }

        normalizeManagedTree(entry) {
            if (!entry || !entry.node) {
                return;
            }
            const depth = entry.key === "player" ? 7 : 3;
            const elements = getStyleChain(entry.node, depth);
            elements.forEach((element, index) => {
                this.rememberStyle(entry, element);
                element.classList.add(`${ROOT_CLASS}-managed`);
                if (index === 0) {
                    setImportantStyle(element, {
                        position: "relative",
                        left: "auto",
                        top: "auto",
                        right: "auto",
                        bottom: "auto",
                        width: "100%",
                        height: "100%",
                        minWidth: "0",
                        minHeight: "0",
                        maxWidth: "none",
                        maxHeight: "none",
                        margin: "0",
                        transform: "none",
                        boxSizing: "border-box",
                    });
                } else {
                    setImportantStyle(element, {
                        width: "100%",
                        height: "100%",
                        minWidth: "0",
                        minHeight: "0",
                        maxWidth: "none",
                        maxHeight: "none",
                        boxSizing: "border-box",
                    });
                }
            });
            if (entry.key === "sidebar") {
                this.normalizeSidebarTabs(entry);
            }
        }

        normalizeSidebarTabs(entry) {
            const sidebarRoot = entry.node;
            if (!(sidebarRoot instanceof HTMLElement)) {
                return;
            }

            const manage = (element, styles) => {
                if (!(element instanceof HTMLElement)) {
                    return;
                }
                this.rememberStyle(entry, element);
                element.classList.add(`${ROOT_CLASS}-managed`);
                setImportantStyle(element, styles);
            };

            const aside = sidebarRoot.querySelector(".vp-aside");
            manage(aside, {
                display: "flex",
                flexDirection: "column",
                width: "100%",
                height: "100%",
                minHeight: "0",
                paddingTop: "0",
                overflow: "hidden",
            });

            const tabs = sidebarRoot.querySelector(".vp-tabs");
            if (!(tabs instanceof HTMLElement)) {
                return;
            }

            manage(tabs, {
                display: "flex",
                flexDirection: "column",
                flex: "1 1 auto",
                width: "100%",
                height: "100%",
                minHeight: "0",
                overflow: "hidden",
            });

            const headerItems = Array.from(tabs.querySelectorAll(".vp-tabs__header-item"));
            const activeHeaderIndex = headerItems.findIndex((item) => item.classList.contains("vp-tabs__header-item--active"));
            const header = tabs.querySelector(".vp-tabs__header");
            manage(header, {
                flex: "0 0 auto",
                minHeight: "48px",
                height: "48px",
                paddingTop: "8px",
                paddingBottom: "8px",
            });
            const headerBaseline = tabs.querySelector(".vp-tabs__header-item-baseline");
            manage(headerBaseline, {
                bottom: "8px",
                height: "3px",
            });
            const content = tabs.querySelector(".vp-tabs__content");
            if (!(content instanceof HTMLElement)) {
                return;
            }

            manage(content, {
                position: "relative",
                flex: "1 1 auto",
                width: "100%",
                height: "auto",
                minHeight: "0",
                overflow: "hidden",
                isolation: "isolate",
                background: "var(--bpfw-sidebar-pane-surface, rgba(248, 250, 255, 0.96))",
            });

            const panes = Array.from(content.children).filter((child) => {
                return child instanceof HTMLElement && child.classList.contains("vp-tabs-pane");
            });
            if (!panes.length) {
                return;
            }

            const classActivePane = panes.find((pane) => pane.classList.contains("is-show"));
            const indexedPane = activeHeaderIndex >= 0 ? panes[activeHeaderIndex] : null;
            const activePane = classActivePane || indexedPane || panes[0];

            panes.forEach((pane) => {
                const isActive = pane === activePane;
                manage(pane, {
                    position: "absolute",
                    left: "0",
                    top: "0",
                    right: "0",
                    bottom: "0",
                    width: "100%",
                    height: "100%",
                    overflow: "hidden",
                    visibility: isActive ? "visible" : "hidden",
                    opacity: isActive ? "1" : "0",
                    pointerEvents: isActive ? "auto" : "none",
                    zIndex: isActive ? "1" : "0",
                });
            });

            panes.forEach((pane) => {
                const box = pane.querySelector(".vp-aside-box");
                manage(box, {
                    flex: "1 1 auto",
                    width: "100%",
                    height: "100%",
                    minHeight: "0",
                    overflowY: "auto",
                });

                pane.querySelectorAll(".vp-aside-box__module").forEach((element) => {
                    manage(element, {
                        marginBottom: "6px",
                    });
                });
                const lastModule = box?.querySelector(".vp-aside-box__module:last-child");
                manage(lastModule, {
                    marginBottom: "0",
                });

                pane.querySelectorAll(".vp-aside-box__top").forEach((element) => {
                    manage(element, {
                        minHeight: "30px",
                        height: "30px",
                        marginBottom: "4px",
                        alignItems: "center",
                    });
                });
                pane.querySelectorAll(".vp-aside-box__video-card").forEach((element) => {
                    manage(element, {
                        minHeight: "68px",
                        height: "68px",
                    });
                });
                pane.querySelectorAll(".vp-video-page-card").forEach((element) => {
                    manage(element, {
                        paddingTop: "4px",
                        paddingBottom: "4px",
                    });
                });
                pane.querySelectorAll(".vp-video-page-card__image").forEach((element) => {
                    manage(element, {
                        width: "96px",
                        height: "54px",
                        flex: "0 0 96px",
                    });
                });
                pane.querySelectorAll(".vp-video-page-card__video-detail").forEach((element) => {
                    manage(element, {
                        paddingTop: "2px",
                        paddingBottom: "2px",
                        minHeight: "54px",
                    });
                });
                pane.querySelectorAll(".vp-video-page-card__video-name").forEach((element) => {
                    manage(element, {
                        marginBottom: "4px",
                    });
                });

                pane.querySelectorAll(".vp-note-iframe, .vp-ai-course, .vp-ai-draft, .vp-ai-draft__content, .ai-draft__wrap, .ai-draft__wrap-content").forEach((element) => {
                    manage(element, {
                        width: "100%",
                        height: "100%",
                        minHeight: "0",
                    });
                });
            });
        }

        hasOldScriptConflict() {
            return Boolean(document.querySelector(".ph-titlebar, .ph-resize-handle"));
        }

        startObservers() {
            this.disconnectObservers();
            this.documentObserver = new MutationObserver((mutationList) => {
                if (!this.isActive || this.isCorrecting) {
                    return;
                }
                if (!mutationList.length) {
                    return;
                }

                let sawInterestingMutation = false;
                for (const mutation of mutationList) {
                    if (this.portal && mutation.target instanceof Node && this.portal.contains(mutation.target)) {
                        continue;
                    }
                    if (mutation.type === "childList" && (mutation.addedNodes.length || mutation.removedNodes.length)) {
                        sawInterestingMutation = true;
                        break;
                    }
                    if (mutation.type === "attributes") {
                        sawInterestingMutation = true;
                        break;
                    }
                }

                if (!sawInterestingMutation) {
                    return;
                }

                this.rebindIfNeeded();
                this.scheduleCorrection("document-mutation");
            });
            this.documentObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["class", "style"],
            });
        }

        disconnectObservers() {
            if (this.documentObserver) {
                this.documentObserver.disconnect();
                this.documentObserver = null;
            }
            this.registry.forEach((entry) => {
                if (entry.observer) {
                    entry.observer.disconnect();
                    entry.observer = null;
                }
            });
        }

        rebindIfNeeded() {
            Object.values(TARGETS).forEach((config) => {
                const shell = this.shells.get(config.key);
                const entry = this.registry.get(config.key);
                if (!shell || !entry) {
                    return;
                }
                const nativeCandidate = this.findPageTarget(config.key);
                if (!nativeCandidate || nativeCandidate === entry.node) {
                    return;
                }
                const rect = shell.rect ? { ...shell.rect } : this.getInitialRect(config.key, nativeCandidate, true);
                const locked = shell.locked;
                shell.detachNode();
                this.restoreManagedStyles(entry);
                if (entry.placeholder && entry.placeholder.isConnected) {
                    entry.placeholder.remove();
                }
                const reboundEntry = this.captureTarget(config, nativeCandidate);
                shell.mountNode(nativeCandidate);
                shell.setRect(rect, { persist: false });
                shell.setLocked(locked, { persist: false });
                this.normalizeManagedTree(reboundEntry);
                this.refreshShellTitles();
                this.showToast(`${config.title}已自动重新绑定。`, "info", 1400);
            });
        }

        scheduleCorrection(reason) {
            if (!this.isActive) {
                return;
            }
            this.correctionToken += 1;
            const token = this.correctionToken;
            this.clearCorrectionTimers();

            const run = () => {
                if (token !== this.correctionToken) {
                    return;
                }
                this.runCorrectionStep(reason);
            };

            this.correctionRaf = window.requestAnimationFrame(run);
            CORRECTION_DELAYS.forEach((delayMs) => {
                const timer = window.setTimeout(run, delayMs);
                this.pendingCorrectionTimers.push(timer);
            });
        }

        clearCorrectionTimers() {
            if (this.correctionRaf) {
                window.cancelAnimationFrame(this.correctionRaf);
                this.correctionRaf = 0;
            }
            this.pendingCorrectionTimers.forEach((timer) => window.clearTimeout(timer));
            this.pendingCorrectionTimers = [];
        }

        runCorrectionStep(reason) {
            if (!this.isActive) {
                return;
            }
            this.isCorrecting = true;
            try {
                this.rebindIfNeeded();
                this.shells.forEach((shell, key) => {
                    const entry = this.registry.get(key);
                    if (!entry || !entry.node) {
                        return;
                    }
                    shell.setRect(shell.rect || this.getInitialRect(key, entry.node, true), { persist: false });
                    this.normalizeManagedTree(entry);
                });
                this.refreshShellTitles();
                this.restoreZOrder();
                window.dispatchEvent(new Event("resize"));
            } catch (error) {
                console.warn(`[BPFW] Correction failed (${reason}):`, error);
            } finally {
                window.setTimeout(() => {
                    this.isCorrecting = false;
                }, 0);
            }
        }

        findPageTarget(key) {
            const selector = TARGETS[key].selector;
            const nodes = Array.from(document.querySelectorAll(selector));
            return nodes.find((node) => !this.portal?.contains(node) && isVisibleNode(node)) || null;
        }

        showToast(message, type = "info", ttl = 2200) {
            if (!this.toastStack) {
                this.toastStack = createElement("div", `${ROOT_CLASS}-toastStack`);
                document.body.appendChild(this.toastStack);
            }
            const toast = createElement("div", `${ROOT_CLASS}-toast ${ROOT_CLASS}-toast--${type}`, {
                text: message,
            });
            this.toastStack.appendChild(toast);
            window.setTimeout(() => {
                toast.dataset.leaving = "true";
                window.setTimeout(() => toast.remove(), 240);
            }, ttl);
        }

        getStyles() {
            return `
                .${ROOT_CLASS} {
                    position: fixed;
                    inset: 0;
                    pointer-events: none;
                    z-index: 2147481900;
                }
                .${ROOT_CLASS}-pill {
                    position: fixed;
                    top: 39px;
                    left: 5px;
                    width: 20px;
                    height: 20px;
                    padding: 0;
                    border: 1px solid rgba(255, 255, 255, 0.34);
                    border-radius: 999px;
                    background: rgba(26, 115, 232, 0.52);
                    box-shadow: 0 4px 10px rgba(12, 48, 92, 0.18);
                    color: #ffffff;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    z-index: 2147482100;
                    transition: transform 0.14s ease, box-shadow 0.14s ease, background 0.14s ease, opacity 0.14s ease;
                    pointer-events: auto;
                    touch-action: none;
                    user-select: none;
                    opacity: 0.82;
                }
                .${ROOT_CLASS}-pill:hover {
                    transform: scale(1.06);
                    background: rgba(26, 115, 232, 0.68);
                    box-shadow: 0 6px 14px rgba(12, 48, 92, 0.24);
                    opacity: 1;
                }
                .${ROOT_CLASS}-pill:focus-visible {
                    outline: 2px solid rgba(17, 107, 235, 0.8);
                    outline-offset: 2px;
                }
                .${ROOT_CLASS}-pill[data-active="true"] {
                    background: rgba(26, 115, 232, 0.9);
                    border-color: rgba(255,255,255,0.46);
                    box-shadow: 0 8px 18px rgba(12, 48, 92, 0.28);
                    opacity: 1;
                }
                .${ROOT_CLASS}-pill[data-dragging="true"] {
                    cursor: grabbing;
                    transform: none;
                    transition: none;
                    opacity: 1;
                }
                .${ROOT_CLASS}-pillIcon {
                    width: 100%;
                    height: 100%;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                    font: 700 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    transform: translateY(-0.5px);
                }
                .${ROOT_CLASS}-shell {
                    --bpfw-sidebar-pane-surface: rgba(248, 250, 255, 0.96);
                    position: fixed;
                    display: flex;
                    flex-direction: column;
                    min-width: 260px;
                    min-height: 180px;
                    overflow: hidden;
                    border-radius: 20px;
                    background:
                        linear-gradient(180deg, rgba(255,255,255,0.78), rgba(250,252,255,0.66)),
                        rgba(255,255,255,0.64);
                    border: 1px solid rgba(255,255,255,0.44);
                    box-shadow:
                        0 28px 64px rgba(12, 48, 92, 0.2),
                        0 10px 24px rgba(12, 48, 92, 0.12);
                    backdrop-filter: blur(18px);
                    -webkit-backdrop-filter: blur(18px);
                    pointer-events: auto;
                    color: #10263a;
                    user-select: auto;
                }
                .${ROOT_CLASS}-shell[data-active="true"] {
                    box-shadow:
                        0 32px 72px rgba(12, 48, 92, 0.22),
                        0 12px 28px rgba(12, 48, 92, 0.16),
                        0 0 0 1px rgba(31, 111, 235, 0.18);
                }
                .${ROOT_CLASS}-shell[data-locked="true"] {
                    box-shadow:
                        0 28px 64px rgba(12, 48, 92, 0.18),
                        0 8px 20px rgba(12, 48, 92, 0.12),
                        inset 0 0 0 1px rgba(255,255,255,0.15);
                }
                .${ROOT_CLASS}-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 6px;
                    min-height: 36px;
                    padding: 0 8px 0 10px;
                    background: linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0.04));
                    border-bottom: 1px solid rgba(16, 52, 88, 0.06);
                    cursor: grab;
                    flex-shrink: 0;
                    position: relative;
                    z-index: 6;
                    user-select: none;
                }
                .${ROOT_CLASS}-shell[data-locked="true"] .${ROOT_CLASS}-header {
                    cursor: default;
                }
                .${ROOT_CLASS}-title {
                    font: 650 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    letter-spacing: 0.01em;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    min-width: 0;
                    flex: 1 1 auto;
                }
                .${ROOT_CLASS}-actions {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    flex: 0 0 auto;
                }
                .${ROOT_CLASS}-action {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 22px;
                    height: 22px;
                    min-width: 22px;
                    padding: 0;
                    border-radius: 7px;
                    border: 1px solid rgba(16, 52, 88, 0.08);
                    background: rgba(255,255,255,0.5);
                    color: #1c3552;
                    cursor: pointer;
                    transition: transform 0.14s ease, background 0.14s ease, opacity 0.14s ease;
                    user-select: none;
                }
                .${ROOT_CLASS}-action svg {
                    width: 12px;
                    height: 12px;
                    display: block;
                    fill: none;
                    stroke: currentColor;
                    stroke-linecap: round;
                    stroke-linejoin: round;
                    stroke-width: 1.65;
                    pointer-events: none;
                }
                .${ROOT_CLASS}-action:hover {
                    transform: translateY(-1px);
                    background: rgba(255,255,255,0.78);
                }
                .${ROOT_CLASS}-action:focus-visible {
                    outline: 2px solid rgba(17, 107, 235, 0.78);
                    outline-offset: 1px;
                }
                .${ROOT_CLASS}-content {
                    position: relative;
                    flex: 1 1 auto;
                    min-height: 0;
                    overflow: hidden;
                    background: rgba(255,255,255,0.1);
                    z-index: 1;
                    user-select: auto;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-ai-draft,
                .${ROOT_CLASS}-shell--sidebar .vp-ai-draft *,
                .${ROOT_CLASS}-shell--sidebar .ai-draft__wrap,
                .${ROOT_CLASS}-shell--sidebar .ai-draft__wrap *,
                .${ROOT_CLASS}-shell--sidebar .ai-draft__p-paragraph,
                .${ROOT_CLASS}-shell--sidebar .ai-draft__p-sentence {
                    -webkit-user-select: text !important;
                    user-select: text !important;
                }
                .${ROOT_CLASS}-shell--sidebar .ai-draft__operate-block {
                    pointer-events: none !important;
                    -webkit-user-select: none !important;
                    user-select: none !important;
                }
                .${ROOT_CLASS}-shell--sidebar .ai-draft__operate-block button,
                .${ROOT_CLASS}-shell--sidebar .ai-draft__operate-block [role="button"] {
                    pointer-events: auto !important;
                }
                .${ROOT_CLASS}-content > * {
                    width: 100% !important;
                    height: 100% !important;
                    min-width: 0 !important;
                    min-height: 0 !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-aside {
                    display: flex !important;
                    flex-direction: column !important;
                    width: 100% !important;
                    height: 100% !important;
                    min-height: 0 !important;
                    padding-top: 0 !important;
                    overflow: hidden !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-tabs {
                    display: flex !important;
                    flex-direction: column !important;
                    flex: 1 1 auto !important;
                    width: 100% !important;
                    height: 100% !important;
                    min-height: 0 !important;
                    overflow: hidden !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-tabs__header {
                    flex: 0 0 auto !important;
                    min-height: 48px !important;
                    height: 48px !important;
                    padding-top: 8px !important;
                    padding-bottom: 8px !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-tabs__header-item-baseline {
                    bottom: 8px !important;
                    height: 3px !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-tabs__content {
                    flex: 1 1 auto !important;
                    width: 100% !important;
                    height: auto !important;
                    min-height: 0 !important;
                    isolation: isolate !important;
                    background: var(--bpfw-sidebar-pane-surface) !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-tabs__content > .vp-tabs-pane {
                    position: absolute !important;
                    inset: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-tabs__content > .vp-tabs-pane:not(.is-show) {
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                    z-index: 0 !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-tabs__content > .vp-tabs-pane.is-show {
                    visibility: visible !important;
                    opacity: 1 !important;
                    pointer-events: auto !important;
                    z-index: 1 !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-tabs__content > .vp-tabs-pane.is-show > .vp-aside-box {
                    flex: 1 1 auto !important;
                    width: 100% !important;
                    height: 100% !important;
                    min-height: 0 !important;
                    overflow-y: auto !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-tabs__content > .vp-tabs-pane.is-show > .vp-note-iframe,
                .${ROOT_CLASS}-shell--sidebar .vp-tabs__content > .vp-tabs-pane.is-show > .vp-ai-course,
                .${ROOT_CLASS}-shell--sidebar .vp-tabs__content > .vp-tabs-pane.is-show > .vp-ai-draft {
                    width: 100% !important;
                    height: 100% !important;
                    min-height: 0 !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-ai-draft__content,
                .${ROOT_CLASS}-shell--sidebar .ai-draft__wrap,
                .${ROOT_CLASS}-shell--sidebar .ai-draft__wrap-content {
                    min-height: 0 !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-aside-box__module {
                    margin-bottom: 6px !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-aside-box__module:last-child {
                    margin-bottom: 0 !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-aside-box__top {
                    min-height: 30px !important;
                    height: 30px !important;
                    margin-bottom: 4px !important;
                    align-items: center !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-aside-box__video-card {
                    min-height: 68px !important;
                    height: 68px !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-video-page-card {
                    padding-top: 4px !important;
                    padding-bottom: 4px !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-video-page-card__image {
                    width: 96px !important;
                    height: 54px !important;
                    flex: 0 0 96px !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-video-page-card__video-detail {
                    min-height: 54px !important;
                    padding-top: 2px !important;
                    padding-bottom: 2px !important;
                }
                .${ROOT_CLASS}-shell--sidebar .vp-video-page-card__video-name {
                    margin-bottom: 4px !important;
                }
                .${ROOT_CLASS}-resize {
                    position: absolute;
                    right: 4px;
                    bottom: 4px;
                    width: 30px;
                    height: 30px;
                    border: 0;
                    border-radius: 999px;
                    background: rgba(12, 48, 92, 0.12);
                    cursor: nwse-resize;
                    z-index: 12;
                    pointer-events: auto;
                    touch-action: none;
                    user-select: none;
                    box-shadow: 0 4px 12px rgba(12, 48, 92, 0.16);
                }
                .${ROOT_CLASS}-resize::before {
                    content: "";
                    position: absolute;
                    right: 8px;
                    bottom: 8px;
                    width: 11px;
                    height: 11px;
                    border-right: 2px solid rgba(16, 52, 88, 0.7);
                    border-bottom: 2px solid rgba(16, 52, 88, 0.7);
                    border-bottom-right-radius: 4px;
                }
                .${ROOT_CLASS}-resize:hover {
                    background: rgba(12, 48, 92, 0.2);
                }
                .${ROOT_CLASS}-shell[data-locked="true"] .${ROOT_CLASS}-resize {
                    opacity: 0.18;
                    cursor: not-allowed;
                }
                .${ROOT_CLASS}-toastStack {
                    position: fixed;
                    left: 16px;
                    bottom: 18px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    z-index: 2147482150;
                    pointer-events: none;
                }
                .${ROOT_CLASS}-toast {
                    max-width: 360px;
                    padding: 10px 14px;
                    border-radius: 14px;
                    background: rgba(20, 34, 51, 0.9);
                    color: #ffffff;
                    box-shadow: 0 12px 28px rgba(10, 18, 28, 0.25);
                    font: 600 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    transform: translateY(0);
                    opacity: 1;
                    transition: transform 0.18s ease, opacity 0.18s ease;
                }
                .${ROOT_CLASS}-toast[data-leaving="true"] {
                    transform: translateY(8px);
                    opacity: 0;
                }
                .${ROOT_CLASS}-toast--success {
                    background: rgba(31, 126, 76, 0.92);
                }
                .${ROOT_CLASS}-toast--warn {
                    background: rgba(166, 104, 11, 0.94);
                }
                .${ROOT_CLASS}-toast--error {
                    background: rgba(166, 42, 42, 0.94);
                }
                @media (prefers-color-scheme: dark) {
                    .${ROOT_CLASS}-pill {
                        color: #eaf2fb;
                        border-color: rgba(255,255,255,0.18);
                        background: rgba(35, 122, 236, 0.56);
                        box-shadow: 0 6px 14px rgba(0,0,0,0.3);
                    }
                    .${ROOT_CLASS}-pill[data-active="true"] {
                        background: rgba(30, 116, 235, 0.92);
                    }
                    .${ROOT_CLASS}-shell {
                        --bpfw-sidebar-pane-surface: rgba(20, 30, 42, 0.96);
                        color: #e8eef5;
                        border-color: rgba(255,255,255,0.12);
                        background:
                            linear-gradient(180deg, rgba(26,38,52,0.82), rgba(18,28,38,0.72)),
                            rgba(18,28,38,0.72);
                        box-shadow:
                            0 30px 72px rgba(0,0,0,0.34),
                            0 10px 24px rgba(0,0,0,0.24);
                    }
                    .${ROOT_CLASS}-header {
                        background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
                        border-bottom-color: rgba(255,255,255,0.08);
                    }
                    .${ROOT_CLASS}-action {
                        color: #dce8f5;
                        border-color: rgba(255,255,255,0.1);
                        background: rgba(255,255,255,0.05);
                    }
                    .${ROOT_CLASS}-action:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .${ROOT_CLASS}-resize::before {
                        border-right-color: rgba(255,255,255,0.4);
                        border-bottom-color: rgba(255,255,255,0.4);
                    }
                }
            `;
        }
    }

    const app = new FloatingWindowsApp();
    window[APP_KEY] = app;
    app.init().catch((error) => {
        console.error("[BPFW] Initialization failed:", error);
    });
})();
