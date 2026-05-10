// ==UserScript==
// @name         BaiduPan Floating Windows (位置记忆优化)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  将百度网盘视频播放器和播放列表创建为可拖动、可调整大小的浮动窗口。优化后窗口位置和大小不再受浏览器窗口缩放影响。
// @author       TheodorePeng & Gemini
// @match        *://pan.baidu.com/pfile/video*
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/BaiduPanFloatingWindow.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/BaiduPanFloatingWindow.user.js
// ==/UserScript==

(function () {
    'use strict';

    // --- 样式定义 ---
    const css = `
        .ph-toggle-button {
            /* 悬浮窗口按钮 */
            position: fixed;
            top: 5px;
            left: 5px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background-color: #1a73e8;
            color: white;
            border: none;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            transition: all 0.2s ease-in-out;
        }
        .ph-toggle-button:hover {
            transform: scale(1.1);
            background-color: #1b65c7;
        }
        .ph-floating-window {
            position: fixed;
            background-color: rgba(255, 255, 255, 0.98);
            border: 1px solid #dcdcdc;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
            overflow: visible; /* Allow content to overflow if needed, but handle content size */
            display: flex;
            flex-direction: column;
            transition: opacity 0.3s ease, transform 0.3s ease;
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
        }
        .ph-titlebar {
            height: 32px;
            background-color: rgba(240, 240, 240, 0.9);
            cursor: move;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 10px;
            border-top-left-radius: 12px;
            border-top-right-radius: 12px;
            border-bottom: 1px solid #e0e0e0;
            user-select: none;
        }
        .ph-titlebar-title {
            font-weight: bold;
            color: #333;
            font-size: 14px;
        }
        .ph-content-wrapper {
            flex-grow: 1;
            overflow: hidden; /* Hide scrollbars of the wrapper */
            padding: 0;
            position: relative;
            display: flex;
        }
        .ph-resize-handle {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 16px;
            height: 16px;
            cursor: nwse-resize;
            background: linear-gradient(135deg, transparent 75%, rgba(100, 100, 100, 0.3) 75%);
            z-index: 1;
        }
        /* Make sure the wrapped content fills the container */
        .ph-content-wrapper > * {
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
        }
    `;
    GM_addStyle(css);

    // --- 核心：可拖动窗口类 ---
    class DraggableWindow {
        constructor(targetElement, options) {
            this.targetElement = targetElement;
            this.originalStyle = this.targetElement.getAttribute('style') || '';
            this.options = Object.assign({
                title: '悬浮窗口',
                initialWidth: targetElement.offsetWidth,
                initialHeight: targetElement.offsetHeight,
                initialLeft: 100,
                initialTop: 100,
                minWidth: 300,
                minHeight: 200,
            }, options);

            this.windowElement = null;
            this.titlebar = null;
            this.resizeHandle = null;

            this.init();
        }

        init() {
            // 1. "Hijack" the target element
            this.windowElement = this.targetElement;
            this.windowElement.style.cssText += `
                position: fixed !important;
                left: ${this.options.initialLeft}px !important;
                top: ${this.options.initialTop}px !important;
                width: ${this.options.initialWidth}px !important;
                height: ${this.options.initialHeight}px !important;
                z-index: 99997 !important;
            `;

            // 2. Create titlebar and append to body
            this.titlebar = document.createElement('div');
            this.titlebar.className = 'ph-titlebar';
            this.titlebar.style.cssText = `
                position: fixed;
                left: ${this.options.initialLeft}px;
                top: ${this.options.initialTop - 32}px; /* 32px is titlebar height */
                width: ${this.options.initialWidth}px;
                height: 32px;
                z-index: 99998;
            `;
            const titleText = document.createElement('span');
            titleText.className = 'ph-titlebar-title';
            titleText.textContent = this.options.title;
            this.titlebar.appendChild(titleText);
            document.body.appendChild(this.titlebar);

            // 3. Create resize handle and append to body
            this.resizeHandle = document.createElement('div');
            this.resizeHandle.className = 'ph-resize-handle';
            this.resizeHandle.style.cssText = `
                position: fixed;
                left: ${this.options.initialLeft + this.options.initialWidth - 16}px;
                top: ${this.options.initialTop + this.options.initialHeight - 16}px;
                z-index: 99999;
            `;
            document.body.appendChild(this.resizeHandle);

            // 4. Bind events
            this.addDragListeners(this.titlebar);
            this.addResizeListeners(this.resizeHandle);
        }

        addDragListeners(dragHandle) {
            let isDragging = false;
            let startX, startY, startLeft, startTop;

            dragHandle.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;

                const currentWinRect = this.windowElement.getBoundingClientRect();
                startLeft = currentWinRect.left;
                startTop = currentWinRect.top;

                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                const newLeft = startLeft + dx;
                const newTop = startTop + dy;

                this.windowElement.style.left = `${newLeft}px`;
                this.windowElement.style.top = `${newTop}px`;
                this.titlebar.style.left = `${newLeft}px`;
                this.titlebar.style.top = `${newTop - 32}px`;
                this.resizeHandle.style.left = `${newLeft + this.windowElement.offsetWidth - 16}px`;
                this.resizeHandle.style.top = `${newTop + this.windowElement.offsetHeight - 16}px`;
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
            });
        }

        addResizeListeners(resizeHandle) {
            let isResizing = false;
            let startX, startY, startWidth, startHeight, startLeft, startTop;

            resizeHandle.addEventListener('mousedown', (e) => {
                isResizing = true;
                startX = e.clientX;
                startY = e.clientY;

                const currentWinRect = this.windowElement.getBoundingClientRect();
                startWidth = currentWinRect.width;
                startHeight = currentWinRect.height;
                startLeft = currentWinRect.left;
                startTop = currentWinRect.top;

                e.preventDefault();
                e.stopPropagation();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                const newWidth = Math.max(this.options.minWidth, startWidth + dx);
                const newHeight = Math.max(this.options.minHeight, startHeight + dy);

                this.windowElement.style.width = `${newWidth}px`;
                this.windowElement.style.height = `${newHeight}px`;
                this.titlebar.style.width = `${newWidth}px`;
                this.resizeHandle.style.left = `${startLeft + newWidth - 16}px`;
                this.resizeHandle.style.top = `${startTop + newHeight - 16}px`;
            });

            document.addEventListener('mouseup', () => {
                isResizing = false;
                // Trigger a resize event for internal components like video players to adapt
                window.dispatchEvent(new Event('resize'));
            });
        }

        destroy() {
            this.targetElement.setAttribute('style', this.originalStyle);
            if (this.titlebar && this.titlebar.parentElement) {
                this.titlebar.parentElement.removeChild(this.titlebar);
            }
            if (this.resizeHandle && this.resizeHandle.parentElement) {
                this.resizeHandle.parentElement.removeChild(this.resizeHandle);
            }
        }
    }

    // --- 主逻辑 ---
    let windowsActive = false;
    let windowLeft = null;
    let windowRight = null;

    function toggleFloatingWindows() {
        if (windowsActive) {
            if (windowLeft) windowLeft.destroy();
            if (windowRight) windowRight.destroy();
            windowLeft = null;
            windowRight = null;
            windowsActive = false;
        } else {
            const dragerLeft = document.querySelector('.drager_left');
            const dragerRight = document.querySelector('.drager_right');

            if (dragerLeft && dragerRight) {

                // 获取视频播放器和列表的实际尺寸 ** 需要根据实际情况调整 ** #Peng//
                const leftWidth = 570, leftHeight = 650;
                const rightWidth = 410, rightHeight = 815;
                const gap = 10;
                const startPadding = 0;
                const initialTop = 100;

                windowLeft = new DraggableWindow(dragerLeft, {
                    title: '视频播放',
                    initialWidth: leftWidth,
                    initialHeight: leftHeight,
                    initialLeft: startPadding,
                    initialTop: initialTop
                });

                windowRight = new DraggableWindow(dragerRight, {
                    title: '视频列表',
                    initialWidth: rightWidth,
                    initialHeight: rightHeight,
                    initialLeft: startPadding + leftWidth + gap,
                    initialTop: initialTop
                });
                windowsActive = true;
                setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
            } else {
                alert('未找到视频播放器或列表元素。');
            }
        }
    }

    // --- 初始化 ---
    function init() {
        const toggleButton = document.createElement('button');
        toggleButton.className = 'ph-toggle-button';
        toggleButton.innerHTML = '&#x26F6;';
        toggleButton.title = '切换悬浮窗口模式';
        document.body.appendChild(toggleButton);

        toggleButton.addEventListener('click', toggleFloatingWindows);
    }

    setTimeout(init, 2000);

})();