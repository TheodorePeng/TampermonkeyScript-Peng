// ==UserScript==
// @name         HighlightJump URL
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  选中文本后生成带有文本片段(Text Fragments)参数的URL，输出为Markdown格式，支持自定义快捷键触发
// @author       TheodorePeng
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/PengCode/main/TampermonkeyScript-Peng/TextHighlightJumpURL.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/PengCode/main/TampermonkeyScript-Peng/TextHighlightJumpURL.js
// ==/UserScript==

(function() {
    'use strict';

    // 检测操作系统类型
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    // 默认设置
    const DEFAULT_SETTINGS = {
        ctrlKey: true,    // Windows: Ctrl, Mac: Control
        shiftKey: true,
        altKey: false,    // Windows: Alt, Mac: Option
        metaKey: false,   // Mac: Command
        key: 'H',
        notificationEnabled: true,
        notificationDuration: 2000 // 默认通知显示时间(毫秒)
    };

    // 从存储中获取设置，如不存在则使用默认设置
    let userSettings = GM_getValue('highlightJumpSettings', DEFAULT_SETTINGS);

    // 如果是从旧版本升级，确保有metaKey属性
    if (userSettings.metaKey === undefined) {
        userSettings.metaKey = false;
    }

    // 创建设置界面的样式
    GM_addStyle(`
        #highlightjump-settings {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0,0,0,0.3);
            z-index: 9999;
            font-family: Arial, sans-serif;
            max-width: 400px;
            width: 90%;
        }
        #highlightjump-settings h2 {
            margin-top: 0;
            color: #333;
        }
        #highlightjump-settings .setting-row {
            margin: 15px 0;
            display: flex;
            align-items: center;
        }
        #highlightjump-settings label {
            margin-right: 10px;
            flex: 1;
        }
        #highlightjump-settings .key-input {
            padding: 5px;
            border: 1px solid #ccc;
            border-radius: 4px;
            width: 40px;
            text-align: center;
            font-weight: bold;
        }
        #highlightjump-settings .duration-input {
            padding: 5px;
            border: 1px solid #ccc;
            border-radius: 4px;
            width: 60px;
            text-align: center;
        }
        #highlightjump-settings .button-group {
            display: flex;
            justify-content: flex-end;
            margin-top: 20px;
            gap: 10px;
        }
        #highlightjump-settings button {
            padding: 8px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        #highlightjump-settings #save-settings {
            background: #4CAF50;
            color: white;
        }
        #highlightjump-settings #cancel-settings {
            background: #f44336;
            color: white;
        }
        #highlightjump-settings #reset-settings {
            background: #2196F3;
            color: white;
        }
        #highlightjump-settings .os-specific {
            display: none;
        }
        #highlightjump-settings .os-specific.show {
            display: block;
        }

        /* 小型通知样式 - 改为顶部中央 */
        #highlightjump-toast {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px 15px;
            border-radius: 4px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none; /* 避免干扰鼠标点击 */
            max-width: 300px;
            text-align: center;
        }
        #highlightjump-toast.show {
            opacity: 1;
        }
        #highlightjump-toast.success {
            background: rgba(76, 175, 80, 0.9);
        }
        #highlightjump-toast.error {
            background: rgba(244, 67, 54, 0.9);
        }

        /* 右键菜单自定义样式 */
        .highlightjump-menu-item {
            display: flex;
            align-items: center;
        }
        .highlightjump-menu-icon {
            margin-right: 5px;
        }
    `);

    // 创建toast通知元素
    function createToastElement() {
        if (!document.getElementById('highlightjump-toast')) {
            const toast = document.createElement('div');
            toast.id = 'highlightjump-toast';
            document.body.appendChild(toast);
        }
    }

    // 显示轻量级通知
    function showToast(message, type = 'default', duration = userSettings.notificationDuration) {
        if (!userSettings.notificationEnabled) return;
        
        createToastElement();
        const toast = document.getElementById('highlightjump-toast');
        
        // 设置消息和类型
        toast.textContent = message;
        toast.className = type === 'success' ? 'success' : type === 'error' ? 'error' : '';
        
        // 显示通知
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // 自动隐藏
        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }

    // 1. 生成带有文本片段(Text Fragments)的Markdown格式的URL
    function generateHighlightURL() {
        const selectedText = window.getSelection().toString().trim();

        if (!selectedText) {
            if (userSettings.notificationEnabled) {
                showToast("请先选中要高亮的文本", "error");
            }
            return;
        }

        // 使用Text Fragments格式对选中的文本进行编码
        const encodedText = encodeURIComponent(selectedText);
        const currentURL = window.location.origin + window.location.pathname + window.location.search;
        // 生成Text Fragments格式的URL
        const highlightURL = `${currentURL}#:~:text=${encodedText}`;

        // 生成Markdown格式的链接
        const markdownLink = `[🌐 ${selectedText}](${highlightURL})`;

        // 复制到剪贴板
        GM_setClipboard(markdownLink);

        // 通知用户
        showToast("已复制高亮链接到剪贴板", "success");
    }

    // 在Tampermonkey菜单中注册命令
    GM_registerMenuCommand("生成高亮文本的Markdown URL", generateHighlightURL);
    GM_registerMenuCommand("设置", showSettingsPanel);

    // 添加右键菜单选项
    document.addEventListener('contextmenu', function(e) {
        // 检查是否有选中的文本
        const selectedText = window.getSelection().toString().trim();
        if (!selectedText) return; // 没有选中文本，不添加右键菜单项
        
        // 等待浏览器原生上下文菜单完成创建
        setTimeout(() => {
            addContextMenuItem();
        }, 10);
    });

    // 添加自定义右键菜单项
    function addContextMenuItem() {
        // 如果已经存在我们的菜单项，则不重复添加
        if (document.querySelector('.highlightjump-context-menu')) return;
        
        // 观察DOM变化，寻找右键菜单
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // 尝试识别右键菜单元素
                            const isContextMenu = isContextMenuElement(node);
                            if (isContextMenu) {
                                injectMenuItem(node);
                                observer.disconnect();
                                return;
                            }
                        }
                    }
                }
            }
        });
        
        // 观察document.body的子元素变化
        observer.observe(document.body, { childList: true, subtree: true });
        
        // 5秒后停止观察，避免无限等待
        setTimeout(() => {
            observer.disconnect();
        }, 5000);
    }
    
    // 尝试识别右键菜单元素
    function isContextMenuElement(element) {
        // 通用特征检测：
        // 1. 位置是fixed或absolute
        // 2. z-index较高
        // 3. 最近出现的元素
        const style = window.getComputedStyle(element);
        const position = style.position;
        const zIndex = parseInt(style.zIndex) || 0;
        
        return (position === 'fixed' || position === 'absolute') && 
               zIndex > 100 &&
               element.getBoundingClientRect().width > 50 && 
               element.getBoundingClientRect().height > 50;
    }
    
    // 向右键菜单中注入我们的菜单项
    function injectMenuItem(menuElement) {
        try {
            // 创建我们的菜单项容器
            const menuItemContainer = document.createElement('div');
            menuItemContainer.className = 'highlightjump-context-menu';
            
            // 尝试模仿原生菜单项的样式
            const existingMenuItems = menuElement.querySelectorAll('div, li, a');
            if (existingMenuItems.length > 0) {
                // 获取第一个菜单项作为参考
                const referenceItem = existingMenuItems[0];
                const refStyle = window.getComputedStyle(referenceItem);
                
                // 复制关键样式属性
                menuItemContainer.style.padding = refStyle.padding;
                menuItemContainer.style.cursor = 'pointer';
                menuItemContainer.style.fontSize = refStyle.fontSize;
                menuItemContainer.style.fontFamily = refStyle.fontFamily;
                menuItemContainer.style.color = refStyle.color;
            } else {
                // 默认样式
                menuItemContainer.style.padding = '6px 10px';
                menuItemContainer.style.cursor = 'pointer';
            }
            
            // 创建菜单项内容
            menuItemContainer.innerHTML = `
                <div class="highlightjump-menu-item">
                    <span class="highlightjump-menu-icon">🔗</span>
                    <span>复制高亮文本链接</span>
                </div>
            `;
            
            // 添加鼠标悬停效果
            menuItemContainer.addEventListener('mouseover', function() {
                this.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
            });
            
            menuItemContainer.addEventListener('mouseout', function() {
                this.style.backgroundColor = '';
            });
            
            // 添加点击事件
            menuItemContainer.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // 关闭右键菜单
                document.body.click();
                
                // 生成并复制高亮链接
                generateHighlightURL();
            });
            
            // 将菜单项添加到右键菜单中
            // 尝试不同的插入策略以适应不同网站的菜单结构
            if (menuElement.firstChild) {
                // 有些网站的菜单是有分组的，尝试在第一组中插入
                const firstGroup = menuElement.firstChild;
                if (firstGroup.nodeType === Node.ELEMENT_NODE) {
                    firstGroup.appendChild(menuItemContainer);
                } else {
                    menuElement.appendChild(menuItemContainer);
                }
            } else {
                menuElement.appendChild(menuItemContainer);
            }
        } catch (e) {
            console.error('HighlightJump: 添加右键菜单项失败', e);
        }
    }

    // 2. 添加快捷键触发生成URL
    window.addEventListener('keydown', function(e) {
        // 检查是否匹配用户设置的快捷键
        const matchCriteria = (
            // Mac键盘上的Control键与用户设置匹配
            (userSettings.ctrlKey === e.ctrlKey) &&
            // Shift键匹配
            (userSettings.shiftKey === e.shiftKey) && 
            // Alt/Option键匹配
            (userSettings.altKey === e.altKey) &&
            // 在Mac上，Command/Meta键匹配
            (!isMac || userSettings.metaKey === e.metaKey) &&
            // 字母数字键匹配（忽略大小写）
            (e.key.toUpperCase() === userSettings.key.toUpperCase())
        );
        
        if (matchCriteria) {
            e.preventDefault(); // 防止默认行为
            generateHighlightURL();
        }
    });

    // 显示设置面板
    function showSettingsPanel() {
        // 检查面板是否已存在
        if (document.getElementById('highlightjump-settings')) {
            return;
        }

        // 创建设置面板
        const settingsPanel = document.createElement('div');
        settingsPanel.id = 'highlightjump-settings';
        
        // 准备特定于操作系统的键名
        const altKeyName = isMac ? 'Option (⌥)' : 'Alt';
        
        settingsPanel.innerHTML = `
            <h2>HighlightJump URL 设置</h2>
            ${isMac ? `
                <div class="setting-row">
                    <label>
                        <input type="checkbox" id="setting-meta" ${userSettings.metaKey ? 'checked' : ''}>
                        Command (⌘) 键
                    </label>
                </div>
            ` : ''}
            <div class="setting-row">
                <label>
                    <input type="checkbox" id="setting-ctrl" ${userSettings.ctrlKey ? 'checked' : ''}>
                    ${isMac ? 'Control (⌃)' : 'Ctrl'} 键
                </label>
            </div>
            <div class="setting-row">
                <label>
                    <input type="checkbox" id="setting-shift" ${userSettings.shiftKey ? 'checked' : ''}>
                    Shift (⇧) 键
                </label>
            </div>
            <div class="setting-row">
                <label>
                    <input type="checkbox" id="setting-alt" ${userSettings.altKey ? 'checked' : ''}>
                    ${altKeyName} 键
                </label>
            </div>
            <div class="setting-row">
                <label>按键：</label>
                <input type="text" id="setting-key" class="key-input" maxlength="1" value="${userSettings.key}">
            </div>
            <div class="setting-row">
                <span>当前快捷键: ${getHotkeyDisplayText()}</span>
            </div>
            <div class="setting-row">
                <label>
                    <input type="checkbox" id="setting-notification" ${userSettings.notificationEnabled ? 'checked' : ''}>
                    启用通知提示
                </label>
            </div>
            <div class="setting-row">
                <label>通知显示时间(毫秒)：</label>
                <input type="number" id="setting-duration" class="duration-input" min="500" max="10000" step="500" value="${userSettings.notificationDuration}">
            </div>
            <div class="button-group">
                <button id="reset-settings">重置</button>
                <button id="cancel-settings">取消</button>
                <button id="save-settings">保存</button>
            </div>
        `;

        // 添加到文档
        document.body.appendChild(settingsPanel);

        // 添加事件处理
        document.getElementById('setting-key').addEventListener('keydown', function(e) {
            e.preventDefault();
            this.value = e.key.toUpperCase();
        });

        document.getElementById('save-settings').addEventListener('click', saveSettings);
        document.getElementById('cancel-settings').addEventListener('click', closeSettingsPanel);
        document.getElementById('reset-settings').addEventListener('click', resetSettings);
    }

    // 保存设置
    function saveSettings() {
        const durationValue = parseInt(document.getElementById('setting-duration').value);
        
        const newSettings = {
            // 在Mac上，分别保存Control键和Command键的状态
            ctrlKey: document.getElementById('setting-ctrl').checked,
            metaKey: isMac ? document.getElementById('setting-meta').checked : false,
            shiftKey: document.getElementById('setting-shift').checked,
            altKey: document.getElementById('setting-alt').checked,
            key: document.getElementById('setting-key').value.toUpperCase(),
            notificationEnabled: document.getElementById('setting-notification').checked,
            notificationDuration: isNaN(durationValue) ? DEFAULT_SETTINGS.notificationDuration : 
                                  Math.max(500, Math.min(10000, durationValue)) // 限制范围500-10000
        };

        // 至少需要选择一个修饰键和一个按键
        if (!(newSettings.ctrlKey || newSettings.metaKey || 
             newSettings.shiftKey || newSettings.altKey)) {
            showToast("请至少选择一个修饰键", "error");
            return;
        }

        if (!newSettings.key) {
            showToast("请指定一个按键", "error");
            return;
        }

        // 保存设置
        userSettings = newSettings;
        GM_setValue('highlightJumpSettings', newSettings);
        
        // 通知用户
        showToast("设置已保存", "success");

        closeSettingsPanel();
    }

    // 关闭设置面板
    function closeSettingsPanel() {
        const panel = document.getElementById('highlightjump-settings');
        if (panel) {
            panel.remove();
        }
    }

    // 重置设置为默认值
    function resetSettings() {
        document.getElementById('setting-ctrl').checked = DEFAULT_SETTINGS.ctrlKey;
        if (isMac) {
            document.getElementById('setting-meta').checked = DEFAULT_SETTINGS.metaKey;
        }
        document.getElementById('setting-shift').checked = DEFAULT_SETTINGS.shiftKey;
        document.getElementById('setting-alt').checked = DEFAULT_SETTINGS.altKey;
        document.getElementById('setting-key').value = DEFAULT_SETTINGS.key;
        document.getElementById('setting-notification').checked = DEFAULT_SETTINGS.notificationEnabled;
        document.getElementById('setting-duration').value = DEFAULT_SETTINGS.notificationDuration;
    }

    // 获取快捷键的显示文本
    function getHotkeyDisplayText() {
        let text = '';
        
        if (isMac) {
            if (userSettings.metaKey) text += '⌘ + ';
            if (userSettings.ctrlKey) text += '⌃ + ';
        } else {
            if (userSettings.ctrlKey) text += 'Ctrl + ';
        }
        
        if (userSettings.shiftKey) text += '⇧ + ';
        if (userSettings.altKey) text += isMac ? '⌥ + ' : 'Alt + ';
        text += userSettings.key;
        
        return text;
    }

    /**
     * 功能 3：解析URL参数并高亮显示指定文本（仅支持Text Fragments）
     */
    function highlightText(text) {
        if (!text) return;

        // 创建一个正则表达式，忽略大小写，并处理特殊字符
        const regex = new RegExp(`(${escapeRegExp(text)})`, 'gi');

        // 使用TreeWalker遍历所有文本节点，避免破坏HTML结构
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        let firstMatchElement = null;
        let matchCount = 0;

        while (node = walker.nextNode()) {
            const parent = node.parentNode;
            if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') { // 排除脚本和样式
                const nodeValue = node.nodeValue;
                const match = regex.exec(nodeValue);
                if (match) {
                    // 创建一个span元素来包裹匹配的文本
                    const span = document.createElement('span');
                    span.innerHTML = nodeValue.replace(regex, '<mark>$1</mark>');

                    // 替换原文本节点
                    parent.replaceChild(span, node);
                    matchCount++;

                    // 记录第一个匹配的元素以便滚动到该位置
                    if (!firstMatchElement) {
                        firstMatchElement = span.querySelector('mark');
                    }
                }
            }
        }

        // 如果找到匹配的元素，滚动到该位置
        if (firstMatchElement) {
            firstMatchElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 仅在找到匹配项时显示通知
            if (userSettings.notificationEnabled && matchCount > 0) {
                showToast(`找到 ${matchCount} 处匹配文本`, "success", 1500);
            }
        }
    }

    /**
     * 辅助函数：转义正则表达式中的特殊字符
     */
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 页面加载时检查URL参数并执行高亮（仅支持Text Fragments）
     */
    function checkURLForHighlight() {
        const hash = window.location.hash;
        
        // 仅支持Text Fragments格式
        if (hash.includes(':~:text=')) {
            const textMatch = hash.match(/:~:text=([^&]+)/);
            if (textMatch && textMatch[1]) {
                const decodedText = decodeURIComponent(textMatch[1]);
                highlightText(decodedText);
            }
        }
    }

    // 创建toast元素
    createToastElement();

    // 页面加载完成后执行检查
    window.addEventListener('load', checkURLForHighlight);

})();
