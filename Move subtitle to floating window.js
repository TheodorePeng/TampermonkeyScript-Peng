// ==UserScript==
// @name         Move subtitle to floating window
// @namespace    http://tampermonkey.net/
// @version      1.36
// @description  现代化的字幕悬浮窗口工具，支持拖拽、调整大小、折叠和透明度控制，适用于YouTube和哔哩哔哩
// @author       TheodorePeng
// @match        https://www.youtube.com/watch?v=*
// @match        https://www.bilibili.com/video/*
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/Move%20subtitle%20to%20floating%20window.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/Move%20subtitle%20to%20floating%20window.js
// ==/UserScript==

(function() {
    'use strict';

    // 添加全局样式
    const css = `
        .subtitle-float-btn {
            position: fixed;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background-color: rgba(0, 0, 0, 0.6);
            color: white;
            border: none;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            transition: all 0.2s ease;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        }
        .subtitle-float-btn:hover {
            transform: scale(1.1);
            background-color: rgba(0, 0, 0, 0.8);
        }
        .subtitle-window {
            position: fixed;
            background-color: rgba(255, 255, 255, 0.9);
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            overflow: hidden;
            transition: opacity 0.3s ease, height 0.3s ease, width 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            will-change: transform;
        }
        .subtitle-titlebar {
            height: 28px;
            background-color: rgba(30, 30, 30, 0.8);
            display: flex;
            align-items: center;
            padding: 0 8px;
            cursor: move;
            touch-action: none;
            user-select: none;
        }
        .subtitle-titlebar:hover {
            background-color: rgba(40, 40, 40, 0.9);
        }
        .subtitle-titlebar-hint {
            position: absolute;
            top: 28px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: none;
            white-space: nowrap;
            z-index: 10002;
        }
        .subtitle-titlebar:hover .subtitle-titlebar-hint {
            opacity: 1;
        }
        .subtitle-control-btn {
            width: 20px;
            height: 20px;
            border-radius: 4px;
            border: none;
            background-color: transparent;
            color: white;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 5px;
            transition: background-color 0.2s;
        }
        .subtitle-control-btn:hover {
            background-color: rgba(255, 255, 255, 0.2);
        }
        .subtitle-resize {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 16px;
            height: 16px;
            cursor: nwse-resize;
            background: linear-gradient(135deg, transparent 70%, rgba(100, 100, 100, 0.5) 70%);
        }
        .subtitle-content {
            padding: 8px;
            overflow-y: auto;
        }
        .subtitle-window.sidebar-mode {
            /* height: 80vh; This is now handled by JS for initial size */
            max-height: 95vh; /* Allow sidebar to be taller */
        }
        .subtitle-content.sidebar-mode {
            font-size: 16px;
            line-height: 1.5;
        }
    `;

    // 注入样式
    if (typeof GM_addStyle !== 'undefined') {
        GM_addStyle(css);
    } else {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // 可调整参数
    const MIN_WIDTH = 200;
    const MIN_HEIGHT = 100;
    const MAX_WIDTH_PERCENT = 0.85; // 最大宽度占视口宽度的百分比
    const DEFAULT_HEIGHT = 350; // 普通模式下的默认高度，调整为420
    const DEFAULT_SIDE_WIDTH = 435; // 侧边栏模式下的默认宽度
    const SIDE_HEIGHT = 620; // 侧边栏模式下的默认高度
    const WIDTH_THRESHOLD = 1400; // 宽屏模式阈值
    let currentWidth, currentHeight;
    let floatingWindow;
    let contentDiv;
    let targetRect = {}; // 保存视频区域信息用于比较变化
    let isVisible = false; // 默认隐藏
    let isDragging = false;
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startWidth = 0;
    let startHeight = 0;
    let opacity = 0.9; // 默认透明度
    let lastClickTime = 0; // 用于双击检测
    let isContentFolded = false; // 内容区域默认展开状态
    let isSidebarMode = false; // 是否为侧边栏模式
    let currentSideWidth = DEFAULT_SIDE_WIDTH; // 当前使用的侧边栏宽度

    // 节流函数 - 限制函数调用频率
    function throttle(func, delay) {
        let lastCall = 0;
        let timeoutId = null;

        return function(...args) {
            const now = Date.now();
            const remaining = delay - (now - lastCall);

            if (remaining <= 0) {
                // 如果距离上次调用已经超过延迟时间，立即执行
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                lastCall = now;
                func.apply(this, args);
            } else if (!timeoutId) {
                // 如果还在延迟期间且没有待执行的调用，设置一个延迟执行
                timeoutId = setTimeout(() => {
                    lastCall = Date.now();
                    timeoutId = null;
                    func.apply(this, args);
                }, remaining);
            }
        };
    }

    // 折叠或展开内容区域
    function toggleContentFold() {
        if (!contentDiv) return;

        if (isContentFolded) {
            // 展开内容
            contentDiv.style.display = 'block';
            // 展开时使用精确的计算高度或默认高度
            floatingWindow.style.height = `${currentHeight || DEFAULT_HEIGHT}px`;
            isContentFolded = false;
        } else {
            // 折叠内容
            // 在折叠前记录当前高度，确保使用parseInt避免可能的px单位问题
            currentHeight = parseInt(floatingWindow.style.height) || floatingWindow.offsetHeight;
            contentDiv.style.display = 'none';
            floatingWindow.style.height = '28px'; // 仅显示标题栏高度
            isContentFolded = true;
        }

        // 更新折叠按钮文本
        const foldButton = floatingWindow.querySelector('.subtitle-control-btn[title="折叠/展开"]');
        if (foldButton) {
            foldButton.textContent = isContentFolded ? '+' : '−';
        }
    }

    // 检查是否应该使用侧边栏模式
    function shouldUseSidebarMode(targetRect, viewportWidth) {
        // 如果视口宽度大于阈值且视频宽度占视口比例较大，则使用侧边栏模式
        // 也考虑视频右侧有足够空间放置侧边栏
        const hasEnoughSpaceOnRight = targetRect.right + currentSideWidth + 20 <= viewportWidth;
        const isWideScreen = viewportWidth > WIDTH_THRESHOLD;
        const isLargeVideo = targetRect.width > viewportWidth * 0.5;

        // 当视口足够宽且视频足够大，但右侧空间不足时，考虑是否可以缩小侧边栏宽度
        if (isWideScreen && isLargeVideo && !hasEnoughSpaceOnRight) {
            // 计算右侧可用空间
            const availableSpace = viewportWidth - targetRect.right - 20;
            // 如果可用空间大于最小宽度，仍然可以使用侧边栏模式
            if (availableSpace >= MIN_WIDTH) {
                // 动态调整侧边栏宽度使用
                currentSideWidth = Math.max(MIN_WIDTH, availableSpace);
                return true;
            }
        }

        return isWideScreen && isLargeVideo && hasEnoughSpaceOnRight;
    }

    // 计算最佳窗口宽度
    function calculateOptimalWidth(targetElement, forceSidebar = false) {
        // 获取目标元素宽度（视频播放器宽度）
        const targetRect = targetElement.getBoundingClientRect();
        // 获取视口宽度
        const viewportWidth = window.innerWidth;

        // 检查是否应该使用侧边栏模式
        isSidebarMode = forceSidebar || shouldUseSidebarMode(targetRect, viewportWidth);

        // 如果是侧边栏模式，使用预设的侧边栏宽度
        if (isSidebarMode) {
            // 计算可用空间
            const availableSpace = viewportWidth - targetRect.right - 20;
            // 如果可用空间小于预设宽度，使用可用空间
            if (availableSpace < currentSideWidth) {
                return Math.max(MIN_WIDTH, availableSpace);
            }
            return currentSideWidth;
        }

        // 普通模式 - 使用与视频播放器相同的宽度
        let optimalWidth = targetRect.width;

        // 如果太窄，确保至少MIN_WIDTH
        optimalWidth = Math.max(optimalWidth, MIN_WIDTH);

        // 如果太宽，限制为视口宽度的MAX_WIDTH_PERCENT
        const maxAllowedWidth = viewportWidth * MAX_WIDTH_PERCENT;
        optimalWidth = Math.min(optimalWidth, maxAllowedWidth);

        // 手机设备适配 - 如果是窄屏幕设备，使用接近全屏宽度
        if (viewportWidth < 768) {
            optimalWidth = viewportWidth * 0.95;
        }

        return Math.floor(optimalWidth); // 取整
    }

    // 计算最佳窗口高度
    function calculateOptimalHeight(isSidebarMode) {
        const viewportHeight = window.innerHeight;

        if (isSidebarMode) {
            // 侧边栏模式下使用默认高度，但确保不超出视口高度的80%
            const maxAllowedHeight = viewportHeight * 0.8;
            return Math.min(SIDE_HEIGHT, maxAllowedHeight);
        } else {
            // 普通模式下，确保使用精确的DEFAULT_HEIGHT值，除非受视口限制
            const maxAllowedHeight = viewportHeight * 0.7; // 增加到70%以确保不会不必要地限制高度
            return Math.min(DEFAULT_HEIGHT, maxAllowedHeight);
        }
    }

    // 创建主控制按钮
    function createToggleButton() {
        const toggleButton = document.createElement('button');
        toggleButton.textContent = '字';
        toggleButton.className = 'subtitle-float-btn';
        toggleButton.style.bottom = '15px';
        toggleButton.style.left = '15px';

        // Set initial color based on isVisible state
        toggleButton.style.backgroundColor = isVisible ? 'rgba(22, 160, 133, 0.8)' : 'rgba(0, 0, 0, 0.6)';

        toggleButton.addEventListener('click', () => {
            if (isVisible) {
                floatingWindow.style.display = 'none';
                toggleButton.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                isVisible = false;
            } else {
                floatingWindow.style.display = 'block';
                toggleButton.style.backgroundColor = 'rgba(22, 160, 133, 0.8)';
                isVisible = true;

                // 确保内容区域是展开的
                if (isContentFolded && contentDiv) {
                    contentDiv.style.display = 'block';
                    // 使用精确的高度值
                    currentHeight = isSidebarMode ? SIDE_HEIGHT : DEFAULT_HEIGHT;
                    floatingWindow.style.height = `${currentHeight}px`;
                    isContentFolded = false;

                    // 更新折叠按钮文本
                    const foldButton = floatingWindow.querySelector('.subtitle-control-btn[title="折叠/展开"]');
                    if (foldButton) {
                        foldButton.textContent = '−';
                    }
                }
            }
        });

        document.body.appendChild(toggleButton);
        return toggleButton;
    }

    // 检查是否点击在按钮上
    function isClickOnButton(e, container) {
        // 检查事件目标是否是按钮或按钮的子元素
        const buttons = container.querySelectorAll('button');
        for (const button of buttons) {
            if (button === e.target || button.contains(e.target)) {
                return true;
            }
        }
        return false;
    }

    // 计算最佳位置
    function calculateOptimalPosition(targetRect, width, height) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        let left, top;

        // 根据模式计算位置
        if (isSidebarMode) {
            // 侧边栏模式 - 放在视频右侧，距离为5像素
            left = targetRect.right + 5; // 视频右侧加5px间距

            // 顶部位置比视频播放窗口高20像素
            top = Math.max(0, targetRect.top - 30); // 比视频顶部高30px

            // 确保不超出视口右边界
            if (left + width > viewportWidth - 5) {
                // 如果右侧空间不足，调整宽度而不是位置
                currentWidth = Math.max(MIN_WIDTH, viewportWidth - left - 5);
                // 不修改left位置，保持在视频右侧5px处
            }

            // 确保不超出视口顶部
            if (top < 0) {
                top = 0;
            }

            // 确保侧边栏底部不超出视口
            if (top + height > viewportHeight) {
                // 如果高度大于视口高度减去安全边距，则调整高度
                if (height > viewportHeight - 20) {
                    // 这里不调整高度，只确保顶部不会太低
                    top = Math.max(0, viewportHeight - height - 10);
                } else {
                    // 否则调整顶部位置确保完全显示
                    top = Math.max(0, viewportHeight - height - 10);
                }
            }
        } else {
            // 默认模式 - 视频播放器下方居中，距离为5像素
            left = targetRect.left; // 与视频左侧对齐
            top = targetRect.bottom + 5; // 视频下方5px

            // 宽度应与视频宽度相同，在calculateOptimalWidth中已设置

            // 确保不超出左右边界
            if (left < 5) {
                left = 5;
            }
            if (left + width > viewportWidth - 5) {
                // 如果超出右边界，调整宽度
                currentWidth = Math.max(MIN_WIDTH, viewportWidth - left - 5);
            }

            // 如果窗口高度会超出底部视口，则考虑放置在视频上方
            if (top + height > viewportHeight - 5 && targetRect.top > height + 10) {
                top = targetRect.top - height - 5; // 视频上方5px
            }
        }

        // 最终边界检查
        left = Math.max(0, Math.min(left, viewportWidth - width));
        top = Math.max(0, Math.min(top, viewportHeight - height));

        return { left, top };
    }

    // 应用侧边栏模式样式
    function applySidebarModeStyles(enable) {
        if (!floatingWindow || !contentDiv) return;

        if (enable) {
            floatingWindow.classList.add('sidebar-mode');
            contentDiv.classList.add('sidebar-mode');
        } else {
            floatingWindow.classList.remove('sidebar-mode');
            contentDiv.classList.remove('sidebar-mode');
        }
    }

    // 创建悬浮窗口
    function createFloatingWindow(element, targetContainerSelector) {
        const targetContainer = document.querySelector(targetContainerSelector);
        if (!element || !targetContainer) return;

        const initialTargetRect = targetContainer.getBoundingClientRect();
        // 保存初始视频区域信息
        targetRect = {
            width: initialTargetRect.width,
            height: initialTargetRect.height,
            left: initialTargetRect.left,
            right: initialTargetRect.right,
            top: initialTargetRect.top,
            bottom: initialTargetRect.bottom
        };

        const viewportWidth = window.innerWidth;

        // Calculate optimal dimensions
        isSidebarMode = shouldUseSidebarMode(initialTargetRect, viewportWidth);
        currentWidth = calculateOptimalWidth(targetContainer);
        currentHeight = calculateOptimalHeight(isSidebarMode); // Use calculateOptimalHeight for initial height

        // Calculate optimal initial position
        const optimalPosition = calculateOptimalPosition(initialTargetRect, currentWidth, currentHeight);

        // Create floating window
        floatingWindow = document.createElement('div');
        floatingWindow.className = 'subtitle-window';
        if (isSidebarMode) {
            floatingWindow.classList.add('sidebar-mode');
        }

        // 确保使用准确的尺寸设置
        currentWidth = Math.floor(currentWidth); // 确保是整数
        currentHeight = isSidebarMode ? SIDE_HEIGHT : DEFAULT_HEIGHT; // 直接使用常量值以确保准确性

        // 设置初始尺寸
        floatingWindow.style.width = `${currentWidth}px`;
        floatingWindow.style.height = isContentFolded ? '28px' : `${currentHeight}px`;
        floatingWindow.style.opacity = opacity;
        floatingWindow.style.left = `${optimalPosition.left}px`;
        floatingWindow.style.top = `${optimalPosition.top}px`;
        // 设置窗口初始状态为隐藏
        floatingWindow.style.display = 'none';
        isVisible = false;
        floatingWindow.style.zIndex = '9999';

        // Create title bar
        const titleBar = document.createElement('div');
        titleBar.className = 'subtitle-titlebar';

        // Add double-click hint
        const titleBarHint = document.createElement('div');
        titleBarHint.className = 'subtitle-titlebar-hint';
        titleBarHint.textContent = '双击展开/折叠';
        titleBar.appendChild(titleBarHint);

        // Create title bar button container
        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.marginRight = 'auto';

        // Fold button
        const foldButton = document.createElement('button');
        foldButton.textContent = isContentFolded ? '+' : '−'; // Set initial text based on isContentFolded
        foldButton.className = 'subtitle-control-btn';
        foldButton.title = '折叠/展开';

        // 透明度减少按钮
        const opacityDownBtn = document.createElement('button');
        opacityDownBtn.textContent = '−';
        opacityDownBtn.className = 'subtitle-control-btn';
        opacityDownBtn.title = '降低透明度';

        // 透明度增加按钮
        const opacityUpBtn = document.createElement('button');
        opacityUpBtn.textContent = '+';
        opacityUpBtn.className = 'subtitle-control-btn';
        opacityUpBtn.title = '提高透明度';

        // 位置切换按钮
        const positionToggleBtn = document.createElement('button');
        positionToggleBtn.textContent = '↔';
        positionToggleBtn.className = 'subtitle-control-btn';
        positionToggleBtn.title = '切换位置模式';

        // Title text
        const titleText = document.createElement('span');
        titleText.textContent = isSidebarMode ? '侧边字幕' : '字幕窗口';
        titleText.style.color = 'white';
        titleText.style.fontSize = '12px';
        titleText.style.marginLeft = '5px';

        // Create content container
        contentDiv = document.createElement('div');
        contentDiv.className = 'subtitle-content';
        if (isSidebarMode) {
            contentDiv.classList.add('sidebar-mode');
        }
        // Set initial display based on isContentFolded
        contentDiv.style.display = isContentFolded ? 'none' : 'block';
        contentDiv.style.height = `calc(100% - 28px)`;

        // Create resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'subtitle-resize';

        // Add elements to title bar and floating window
        btnContainer.appendChild(foldButton);
        btnContainer.appendChild(opacityDownBtn);
        btnContainer.appendChild(opacityUpBtn);
        btnContainer.appendChild(positionToggleBtn);

        titleBar.appendChild(btnContainer);
        titleBar.appendChild(titleText);

        contentDiv.appendChild(element);

        floatingWindow.appendChild(titleBar); // Append titleBar before contentDiv
        floatingWindow.appendChild(contentDiv);
        floatingWindow.appendChild(resizeHandle);

        document.body.appendChild(floatingWindow);

        // Record initial state information
        const state = {
            defaultWidth: currentWidth,
            defaultHeight: currentHeight,
            isSidebarMode: isSidebarMode,
            currentSideWidth: currentSideWidth
        };
        floatingWindow.dataset.state = JSON.stringify(state);

        // Get boundary check limits
        function getBoundaries() {
            return {
                minX: 0,
                maxX: window.innerWidth - floatingWindow.offsetWidth, // Use offsetWidth to get actual width
                minY: 0,
                maxY: window.innerHeight - floatingWindow.offsetHeight // Use offsetHeight to get actual height
            };
        }

        // Apply boundary constraints
        function applyBoundaries(left, top) {
            const bounds = getBoundaries();
            return {
                left: Math.max(bounds.minX, Math.min(bounds.maxX, left)),
                top: Math.max(bounds.minY, Math.min(bounds.maxY, top))
            };
        }

        // 保存上一次已知的有效位置和大小
        let lastKnownGoodState = {
            left: optimalPosition.left,
            top: optimalPosition.top,
            width: currentWidth,
            height: currentHeight,
            isSidebarMode: isSidebarMode,
            currentSideWidth: currentSideWidth
        };

        // Button event handlers
        foldButton.addEventListener('click', () => {
            toggleContentFold();
        });

        opacityDownBtn.addEventListener('click', () => {
            opacity = Math.max(0.3, opacity - 0.1);
            floatingWindow.style.opacity = opacity;
        });

        opacityUpBtn.addEventListener('click', () => {
            opacity = Math.min(1, opacity + 0.1);
            floatingWindow.style.opacity = opacity;
        });

        // Position mode toggle
        positionToggleBtn.addEventListener('click', () => {
            // Toggle mode
            isSidebarMode = !isSidebarMode;

            // Update styles
            applySidebarModeStyles(isSidebarMode);

            // Update title
            const titleText = floatingWindow.querySelector('span');
            if (titleText) {
                titleText.textContent = isSidebarMode ? '侧边字幕' : '字幕窗口';
            }

            // Calculate new width, height and position
            const newWidth = isSidebarMode ? currentSideWidth : calculateOptimalWidth(targetContainer, false);
            const newHeight = calculateOptimalHeight(isSidebarMode);
            const newPosition = calculateOptimalPosition(
                targetContainer.getBoundingClientRect(),
                newWidth,
                newHeight
            );

            // Apply new dimensions and position
            currentWidth = newWidth;
            currentHeight = newHeight;
            floatingWindow.style.width = `${currentWidth}px`;
            floatingWindow.style.height = `${currentHeight}px`;
            floatingWindow.style.left = `${newPosition.left}px`;
            floatingWindow.style.top = `${newPosition.top}px`;

            // Update state
            const state = JSON.parse(floatingWindow.dataset.state);
            state.defaultWidth = currentWidth;
            state.defaultHeight = currentHeight;
            state.isSidebarMode = isSidebarMode;
            state.currentSideWidth = currentSideWidth;
            floatingWindow.dataset.state = JSON.stringify(state);
        });

        // 双击检测和处理
        titleBar.addEventListener('click', (e) => {
            // If click on button, do not handle double-click
            if (isClickOnButton(e, btnContainer)) {
                return;
            }

            const currentTime = new Date().getTime();
            const isDoubleClick = (currentTime - lastClickTime) < 300; // Consider clicks within 300ms as double-click

            if (isDoubleClick) {
                // Handle double-click event - fold or unfold content
                e.preventDefault();
                e.stopPropagation();
                toggleContentFold();
            }

            lastClickTime = currentTime;
        });

        // 拖拽功能 - 增强处理
        titleBar.addEventListener('mousedown', (e) => {
            // If click on button, do not start drag
            if (isClickOnButton(e, btnContainer)) {
                return;
            }

            // If it's a double-click, do not start drag
            const currentTime = new Date().getTime();
            if ((currentTime - lastClickTime) < 300 && lastClickTime !== currentTime) {
                return;
            }

            e.preventDefault();
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
            startLeft = floatingWindow.getBoundingClientRect().left;
            startTop = floatingWindow.getBoundingClientRect().top;

            // Add temporary cursor style to body to ensure cursor is 'move' during drag
            document.body.style.cursor = 'move';
            document.body.style.userSelect = 'none';

            // Create and add temporary mouse move handler
            const mouseMoveHandler = (moveEvent) => {
                if (!isDragging) return; // Ensure execution only in dragging state
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;

                // Apply boundary constraints
                const position = applyBoundaries(startLeft + dx, startTop + dy);
                floatingWindow.style.left = `${position.left}px`;
                floatingWindow.style.top = `${position.top}px`;
            };

            // Create and add temporary mouse up handler
            const mouseUpHandler = () => {
                if (!isDragging) return; // Ensure execution only in dragging state
                isDragging = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Remove event listeners
                document.removeEventListener('mousemove', mouseMoveHandler);
                document.removeEventListener('mouseup', mouseUpHandler);
            };

            // Add global event listeners
            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
        });

        // 调整大小功能
            resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

                isResizing = true;
                startX = e.clientX;
                startY = e.clientY;
                startWidth = floatingWindow.offsetWidth;
                startHeight = floatingWindow.offsetHeight;

            document.body.style.cursor = 'nwse-resize';
            document.body.style.userSelect = 'none';

            // Create and add temporary mouse move handler
            const mouseMoveHandler = (moveEvent) => {
                if (!isResizing) return; // Ensure execution only in resizing state
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;

                // Limit resize range
                    currentWidth = Math.max(MIN_WIDTH, startWidth + dx);
                    currentHeight = Math.max(MIN_HEIGHT, startHeight + dy);

                // Ensure window does not resize outside screen
                const newLeft = floatingWindow.getBoundingClientRect().left;
                 currentWidth = Math.min(currentWidth, window.innerWidth - newLeft - 10); // Leave 10px right margin

                const newTop = floatingWindow.getBoundingClientRect().top;
                currentHeight = Math.min(currentHeight, window.innerHeight - newTop - 10); // Leave 10px bottom margin


                    floatingWindow.style.width = `${currentWidth}px`;
                    floatingWindow.style.height = `${currentHeight}px`;
            };

             // Create and add temporary mouse up handler
            const mouseUpHandler = () => {
                 if (!isResizing) return; // Ensure execution only in resizing state
                 isResizing = false;
                 document.body.style.cursor = '';
                 document.body.style.userSelect = '';

                 // Remove event listeners
                 document.removeEventListener('mousemove', mouseMoveHandler);
                 document.removeEventListener('mouseup', mouseUpHandler);
            };


            // Add global event listeners
            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
        });

        // Prevent text selection during drag
        floatingWindow.addEventListener('selectstart', (e) => {
            if (isDragging || isResizing) {
                e.preventDefault();
            }
        });

        // 处理窗口大小变化的核心逻辑
        function handleResize() {
            if (!floatingWindow || !isVisible) return;

            try {
                // 获取最新的视频播放器尺寸
                const newTargetRect = targetContainer.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                // 检查目标元素是否有效
                if (newTargetRect.width === 0 || newTargetRect.height === 0) {
                    return; // 忽略无效尺寸
                }

                // 获取当前折叠状态
                const wasFolded = isContentFolded;

                // 检查是否应该切换模式
                const newSidebarMode = shouldUseSidebarMode(newTargetRect, viewportWidth);

                // 如果模式发生变化，或者视频大小发生变化，重新计算尺寸和位置
                const videoSizeChanged =
                    Math.abs(newTargetRect.width - targetRect.width) > 5 ||
                    Math.abs(newTargetRect.height - targetRect.height) > 5 ||
                    Math.abs(newTargetRect.left - targetRect.left) > 5 ||
                    Math.abs(newTargetRect.top - targetRect.top) > 5;

                if (newSidebarMode !== isSidebarMode || videoSizeChanged) {
                    // 更新模式
                    isSidebarMode = newSidebarMode;

                    // 更新样式
                    applySidebarModeStyles(isSidebarMode);

                    // 更新标题
                    const titleText = floatingWindow.querySelector('span');
                    if (titleText) {
                        titleText.textContent = isSidebarMode ? '侧边字幕' : '字幕窗口';
                    }

                    // 重新计算宽度 - 底部模式使用视频宽度，侧边栏使用固定宽度
                    currentWidth = calculateOptimalWidth(targetContainer);
                    // 直接使用常量确保精确高度
                    currentHeight = isSidebarMode ? SIDE_HEIGHT : DEFAULT_HEIGHT;

                    // 计算最佳位置
                    const optimalPosition = calculateOptimalPosition(
                        newTargetRect,
                        currentWidth,
                        wasFolded ? 28 : currentHeight
                    );

                    // 应用新尺寸和位置
                    floatingWindow.style.width = `${currentWidth}px`;
                    floatingWindow.style.height = wasFolded ? '28px' : `${currentHeight}px`;
                    floatingWindow.style.left = `${optimalPosition.left}px`;
                    floatingWindow.style.top = `${optimalPosition.top}px`;

                    // 更新存储的状态
                    const state = {
                        defaultWidth: currentWidth,
                        defaultHeight: currentHeight,
                        isSidebarMode: isSidebarMode,
                        currentSideWidth: currentSideWidth
                    };
                    floatingWindow.dataset.state = JSON.stringify(state);

                    // 更新已知的良好状态
                    lastKnownGoodState = {
                        left: optimalPosition.left,
                        top: optimalPosition.top,
                        width: currentWidth,
                        height: currentHeight,
                        isSidebarMode: isSidebarMode,
                        currentSideWidth: currentSideWidth
                    };
                } else {
                    // 模式没有变化，也没有视频大小变化，只进行小幅调整
                    const windowHeight = wasFolded ? 28 : parseFloat(floatingWindow.style.height) || currentHeight;
                    const windowWidth = parseFloat(floatingWindow.style.width) || currentWidth;

                    // 重新计算位置
                    const newPosition = calculateOptimalPosition(
                        newTargetRect,
                        windowWidth,
                        windowHeight
                    );

                    // 平滑过渡到新位置
                    floatingWindow.style.transition = 'left 0.2s, top 0.2s';
                    floatingWindow.style.left = `${newPosition.left}px`;
                    floatingWindow.style.top = `${newPosition.top}px`;

                    // 稍后移除过渡效果
                    setTimeout(() => {
                        floatingWindow.style.transition = '';
                    }, 200);

                    // 更新已知的良好状态
                    lastKnownGoodState.left = newPosition.left;
                    lastKnownGoodState.top = newPosition.top;
                }

                // 保存当前视频区域信息用于后续比较
                targetRect = { ...newTargetRect };
            } catch (error) {
                console.error('位置调整发生错误:', error);
                // 如果发生错误，恢复到上一个已知良好状态
                if (lastKnownGoodState) {
                    floatingWindow.style.width = `${lastKnownGoodState.width}px`;
                    floatingWindow.style.height = isContentFolded ? '28px' : `${lastKnownGoodState.height}px`;
                    floatingWindow.style.left = `${lastKnownGoodState.left}px`;
                    floatingWindow.style.top = `${lastKnownGoodState.top}px`;
                    isSidebarMode = lastKnownGoodState.isSidebarMode;
                    currentSideWidth = lastKnownGoodState.currentSideWidth || DEFAULT_SIDE_WIDTH;
                    applySidebarModeStyles(isSidebarMode);
                }
            }
        }

        // 使用节流函数包装处理函数，限制200ms内最多执行一次
        const throttledResize = throttle(handleResize, 200);

        // 添加resize事件监听器
        window.addEventListener('resize', throttledResize);

        // Create control button
        const toggleButton = createToggleButton();
    }

    // Wait for target element to load
    function waitForElement(selector, targetContainerSelector, timeout = 10000) {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            const targetContainer = document.querySelector(targetContainerSelector);
            if (element && targetContainer) {
                clearInterval(interval);
                createFloatingWindow(element, targetContainerSelector);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(interval);
                console.warn('Element not found within timeout');
            }
        }, 100);
    }

    // Detect website and execute corresponding logic
    if (location.hostname.includes("youtube.com")) {
        waitForElement('#youtube-caption-iframe', '#player');
    } else if (location.hostname.includes("bilibili.com")) {
        waitForElement('#bilibili-subtitle-iframe', '#bilibili-player');
    }
})();
