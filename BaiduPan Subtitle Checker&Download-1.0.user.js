// ==UserScript==
// @name         BaiduPan Subtitle Checker&Download
// @namespace    http://yourwebsite.com
// @version      1.0
// @description  Check if there is a network request containing a specific keyword "netdisk-subtitle".
// @author       Your Name
// @match        https://pan.baidu.com/*
// @grant        GM_openInTab
// @grant        window.close
// @grant        window.focus
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // URL中的字幕请求地址
    let subtitleUrl = '';
    // 标记是否已经下载过字幕文件
    let alreadyDownloaded = false;

    // 创建一个图标
    var icon = document.createElement('div');
    icon.style.position = 'fixed';
    icon.style.bottom = '10px';
    icon.style.left = '10px';
    icon.style.width = '20px';
    icon.style.height = '20px';
    icon.style.background = 'green';
    icon.style.borderRadius = '50%';
    icon.style.cursor = 'pointer';
    icon.style.textAlign = 'center';
    icon.style.lineHeight = '20px';
    icon.style.color = '#fff';
    icon.innerText = '↓';
    icon.style.zIndex = '9999';
    document.body.appendChild(icon);

    // 创建一个状态提示框
    var statusBox = document.createElement('div');
    statusBox.style.position = 'fixed';
    statusBox.style.bottom = '40px';
    statusBox.style.left = '10px';
    statusBox.style.padding = '5px 10px';
    statusBox.style.background = 'rgba(0,0,0,0.7)';
    statusBox.style.color = 'white';
    statusBox.style.borderRadius = '3px';
    statusBox.style.fontSize = '12px';
    statusBox.style.display = 'none';
    statusBox.style.zIndex = '9999';
    document.body.appendChild(statusBox);

    // 创建一个隐藏的下载链接
    var downloadLink = document.createElement('a');
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);

    // 显示状态信息
    function showStatus(message, duration = 3000) {
        statusBox.textContent = message;
        statusBox.style.display = 'block';
        setTimeout(() => {
            statusBox.style.display = 'none';
        }, duration);
    }

    // 标记是否正在检查链接的状态
    var checking = false;
    var foundSubtitle = false;

    // 点击图标时的处理函数
    icon.addEventListener('click', function() {
        if (!checking) {
            if (subtitleUrl) {
                // 如果已经找到字幕URL，直接下载
                // 每次点击都重置下载状态，允许重新下载
                alreadyDownloaded = false;
                icon.innerText = '↓';
                icon.style.background = 'green';
                downloadSubtitle(subtitleUrl);
            } else {
                icon.innerText = ''; // 清空文本，使图标变为空白的红色圆点
                icon.style.background = 'red'; // 变为红色，表示检查状态
                showStatus('开始检测字幕...');
                startChecking();
            }
        } else {
            // 如果正在检查且已找到字幕URL，则下载
            if (subtitleUrl) {
                // 每次点击都重置下载状态，允许重新下载
                alreadyDownloaded = false;
                icon.innerText = '↓';
                icon.style.background = 'green';
                downloadSubtitle(subtitleUrl);
            }
        }
    });

    // 下载字幕文件函数
    function downloadSubtitle(url) {
        // 如果已经下载过，显示正在重新下载的提示
        if (alreadyDownloaded) {
            showStatus('正在重新下载字幕文件...');
            return;
        }

        showStatus('正在下载字幕文件...');
        
        // 尝试方法1：直接使用Fetch API下载
        fetch(url, {
            headers: {
                'Accept': '*/*',
                'User-Agent': navigator.userAgent,
                'Referer': 'https://pan.baidu.com/'
            },
            mode: 'cors',
            credentials: 'include'
        })
        .then(response => {
            if (!response.ok) throw new Error('网络请求失败');
            return response.blob();
        })
        .then(blob => {
            // 提取文件名
            let filename = 'subtitle.srt'; // 默认文件名
            // 尝试从URL中提取文件名
            const urlParts = url.split('/');
            const possibleFilename = urlParts[urlParts.length - 1];
            if (possibleFilename && possibleFilename.includes('.')) {
                filename = decodeURIComponent(possibleFilename);
            }
            
            // 创建Blob URL并触发下载
            const blobUrl = URL.createObjectURL(blob);
            downloadLink.href = blobUrl;
            downloadLink.download = filename;
            downloadLink.click();
            URL.revokeObjectURL(blobUrl);
            
            // 标记已经下载过
            alreadyDownloaded = true;
            
            // 更新图标状态，表示已下载
            icon.innerText = '✓';
            icon.style.background = '#4CAF50';
            
            showStatus('字幕文件下载完成！', 2000);
        })
        .catch(error => {
            console.error('下载失败:', error);
            showStatus('下载失败，尝试备用方法...', 1500);
            
            // 尝试方法2：直接打开链接，让浏览器处理下载
            try {
                // 创建一个带download属性的链接
                const directLink = document.createElement('a');
                directLink.href = url;
                directLink.download = 'subtitle.srt'; // 强制下载而非打开
                directLink.target = '_blank';
                directLink.click();
                
                // 标记已经下载过
                alreadyDownloaded = true;
                
                // 更新图标状态，表示已下载
                icon.innerText = '✓';
                icon.style.background = '#4CAF50';
                
                showStatus('字幕文件下载完成！', 2000);
                
                // 尝试方法3：打开新窗口，仅在方法2也失败时尝试
                setTimeout(() => {
                    if (!alreadyDownloaded) {
                        window.open(url, '_blank');
                        showStatus('已在新窗口打开字幕，请手动保存', 3000);
                        // 标记已经下载过
                        alreadyDownloaded = true;
                    }
                }, 2000);
            } catch (e) {
                console.error('备用下载方法失败:', e);
                showStatus('所有下载方法均失败，请检查浏览器设置', 3000);
            }
        });
    }

    // 拦截XMLHttpRequest
    function interceptXHR() {
        var origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function() {
            this.addEventListener('load', function() {
                try {
                    if (this.responseURL && this.responseURL.includes('netdisk-subtitle')) {
                        subtitleUrl = this.responseURL;
                        foundSubtitle = true;
                        showStatus('已检测到字幕文件！');
                        icon.style.background = 'green'; // 检查到请求后恢复为绿色
                        icon.innerText = '↓'; // 恢复为表示下载的箭头
                        checking = false; // 设置检查状态为false
                        
                        // 自动触发下载，但只在尚未下载时触发
                        if (!alreadyDownloaded) {
                            setTimeout(() => downloadSubtitle(subtitleUrl), 500);
                        }
                    }
                } catch (e) {
                    console.error('XHR拦截出错:', e);
                }
            });
            origOpen.apply(this, arguments);
        };
    }

    // 拦截Fetch API
    function interceptFetch() {
        const originalFetch = window.fetch;
        window.fetch = function() {
            const url = arguments[0];
            if (typeof url === 'string' && url.includes('netdisk-subtitle')) {
                subtitleUrl = url;
                foundSubtitle = true;
                showStatus('已检测到字幕文件！');
                icon.style.background = 'green';
                icon.innerText = '↓';
                checking = false;
                
                // 自动触发下载，但只在尚未下载时触发
                if (!alreadyDownloaded) {
                    setTimeout(() => downloadSubtitle(subtitleUrl), 500);
                }
            }
            return originalFetch.apply(this, arguments).then(response => {
                if (response.url && response.url.includes('netdisk-subtitle')) {
                    subtitleUrl = response.url;
                    foundSubtitle = true;
                    showStatus('已检测到字幕文件！');
                    icon.style.background = 'green';
                    icon.innerText = '↓';
                    checking = false;
                    
                    // 自动触发下载，但只在尚未下载时触发
                    if (!alreadyDownloaded) {
                        setTimeout(() => downloadSubtitle(subtitleUrl), 500);
                    }
                }
                return response;
            });
        };
    }

    // 开始检查网络请求函数
    function startChecking() {
        checking = true; // 设置检查状态为true
        foundSubtitle = false;
        subtitleUrl = '';
        
        // 同时使用多种方法拦截请求，以提高兼容性
        interceptXHR();
        interceptFetch();
        
        // 监控网络请求
        var interval = setInterval(function() {
            if (foundSubtitle) {
                clearInterval(interval);
                return;
            }
            
            try {
                var requests = performance.getEntriesByType('resource');
                for (var i = 0; i < requests.length; i++) {
                    if (requests[i].name.includes('netdisk-subtitle')) {
                        subtitleUrl = requests[i].name;
                        clearInterval(interval);
                        showStatus('已检测到字幕文件！');
                        icon.style.background = 'green'; // 检查到请求后恢复为绿色
                        icon.innerText = '↓'; // 恢复为表示下载的箭头
                        checking = false; // 设置检查状态为false
                        
                        // 自动触发下载，但只在尚未下载时触发
                        if (!alreadyDownloaded) {
                            setTimeout(() => downloadSubtitle(subtitleUrl), 500);
                        }
                        break;
                    }
                }
            } catch (e) {
                console.log('Performance API不可用，使用其他拦截模式');
            }
        }, 600); // 每隔600毫秒检查一次
    }

    // 打开URL scheme函数，使用多种方式尝试打开
    function openURLScheme() {
        if (!subtitleUrl) {
            showStatus('未找到字幕URL，无法下载', 2000);
            return;
        }
        
        showStatus('已找到字幕URL，但URL scheme触发已被禁用');
        console.log('找到字幕URL:', subtitleUrl);
        
        // 直接将图标变为下载按钮，并自动触发下载
        icon.removeEventListener('click', startChecking);
        icon.addEventListener('click', function() {
            // 每次点击都重置下载状态，允许重新下载
            alreadyDownloaded = false;
            icon.innerText = '↓';
            icon.style.background = 'green';
            downloadSubtitle(subtitleUrl);
        });
        
        // 自动触发下载，但只在尚未下载时触发
        if (!alreadyDownloaded) {
            setTimeout(() => {
                downloadSubtitle(subtitleUrl);
                // 下载完成后，触发自定义URL scheme
                setTimeout(() => {
                    tryOpenCustomURLScheme();
                }, 1000);
            }, 500);
        }
    }
    
    // 尝试打开自定义URL scheme
    function tryOpenCustomURLScheme() {
        const customURL = 'kmtrigger://macro=661A5858-FF43-48F2-B7CD-DCCF40F83BDA';
        showStatus('正在尝试触发自动化操作...');
        
        try {
            // 方法1：直接修改location.href
            window.location.href = customURL;
            
            // 方法2：使用iframe
            setTimeout(() => {
                var iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = customURL;
                document.body.appendChild(iframe);
                
                // 方法3：使用a标签点击
                setTimeout(() => {
                    var a = document.createElement('a');
                    a.href = customURL;
                    a.target = '_blank';
                    a.click();
                }, 300);
            }, 300);
        } catch (e) {
            console.error('URL scheme打开失败:', e);
            showStatus('自动化操作触发失败', 2000);
        }
    }
    
    // 在找到字幕后也触发一次自定义URL
    function onSubtitleFound() {
        if (subtitleUrl) {
            // 已经找到字幕，可以触发自动化操作
            setTimeout(() => {
                tryOpenCustomURLScheme();
            }, 1500);
        }
    }
    
    // 修改所有检测到字幕的地方，增加自定义URL触发
    const originalDownloadSubtitle = downloadSubtitle;
    downloadSubtitle = function(url) {
        // 防止递归调用和重复下载
        // 设置一个标记表示正在下载中
        if (window._isDownloading) {
            console.log('已有下载任务正在进行中，跳过');
            return;
        }
        
        window._isDownloading = true;
        
        // 使用原始函数执行下载
        originalDownloadSubtitle(url);
        
        // 下载完成后延迟一段时间再触发URL，并允许再次下载
        setTimeout(() => {
            onSubtitleFound();
            // 重置下载状态
            window._isDownloading = false;
        }, 1000);
    }
    
    // 修改开始检查网络请求函数，防止重复触发自动下载
    const originalStartChecking = startChecking;
    startChecking = function() {
        // 确保已清除任何可能存在的下载状态
        alreadyDownloaded = false;
        window._isDownloading = false;
        
        // 清除可能正在运行的其他检查任务
        if (window._checkInterval) {
            clearInterval(window._checkInterval);
            window._checkInterval = null;
        }
        
        // 调用原始函数
        originalStartChecking();
    }
    
    // 修改拦截XHR函数，防止多次触发下载
    const originalInterceptXHR = interceptXHR;
    interceptXHR = function() {
        // 确保只监听一次XHR事件
        if (window._xhrIntercepted) {
            return;
        }
        window._xhrIntercepted = true;
        
        // 调用原始函数
        originalInterceptXHR();
    }
    
    // 修改拦截Fetch API函数，防止多次触发下载
    const originalInterceptFetch = interceptFetch;
    interceptFetch = function() {
        // 确保只监听一次Fetch事件
        if (window._fetchIntercepted) {
            return;
        }
        window._fetchIntercepted = true;
        
        // 调用原始函数
        originalInterceptFetch();
    }
    
    // 初始化全局状态
    window._isDownloading = false;
    window._xhrIntercepted = false;
    window._fetchIntercepted = false;
    window._checkInterval = null;
})();
