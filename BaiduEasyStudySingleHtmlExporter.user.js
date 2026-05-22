// ==UserScript==
// @name         Baidu Easy Study Single HTML Exporter
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  Export Baidu Pan Easy Study pages into one standalone offline HTML file.
// @author       TheodorePeng
// @match        *://pan.baidu.com/embed/easy-study/detail*
// @match        *://wenku-strategy-ppt-sdpic.bj.bcebos.com/simplelearn/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/BaiduEasyStudySingleHtmlExporter.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/BaiduEasyStudySingleHtmlExporter.user.js
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_PREFIX = "[BES Single Exporter]";
  const MENU_LABEL = "导出单 HTML";
  const REQUEST_TYPE = "BES_EASY_STUDY_EXPORT_REQUEST";
  const RESPONSE_TYPE = "BES_EASY_STUDY_EXPORT_RESPONSE";
  const FLOAT_BUTTON_ID = "bes-single-exporter-float-button";
  const ROOT_ID = "bes-single-exporter-root";
  const TOAST_ID = "bes-single-exporter-toast";
  const OUTER_PAGE_RE = /pan\.baidu\.com\/embed\/easy-study\/detail/i;
  const INNER_PAGE_RE = /wenku-strategy-ppt-sdpic\.bj\.bcebos\.com\/simplelearn\//i;
  const FONT_AWESOME_CSS_URL = "https://edu-wenku.bdimg.com/v1/genflow2025/report_resource/font-awesome/6.4.0/css/font-awesome_all.min_6.4.0.css";
  const ECHARTS_JS_URL = "https://edu-wenku.bdimg.com/v1/genflow2025/report_resource/echarts.min_5.4.3.js";

  const REPLICA_SHELL_CSS = `
:root {
  --replica-header-height: 61px;
  --replica-border: #e5e7eb;
  --replica-text: #111827;
  --replica-muted: #6b7280;
}

body.has-local-shell {
  padding-top: var(--replica-header-height);
  background: #f8fafc;
}

.replica-topbar {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 80;
  height: var(--replica-header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.96);
  border-bottom: 1px solid var(--replica-border);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
  backdrop-filter: blur(14px);
}

.replica-topbar__left,
.replica-topbar__actions {
  display: flex;
  align-items: center;
}

.replica-topbar__left {
  min-width: 0;
  gap: 16px;
}

.replica-topbar__actions {
  gap: 8px;
}

.replica-topbar__icon-button {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  color: #475569;
  background: transparent;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.replica-topbar__icon-button:hover {
  background: #eef2ff;
  color: #2563eb;
  transform: translateY(-1px);
}

.replica-topbar__title-block {
  min-width: 0;
}

.replica-topbar__title {
  margin: 0;
  max-width: 520px;
  overflow: hidden;
  color: var(--replica-text);
  font-size: 15px;
  font-weight: 650;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.replica-topbar__subtitle {
  margin: 1px 0 0;
  color: var(--replica-muted);
  font-size: 12px;
  line-height: 1.2;
}

.has-local-shell .sticky-sidebar {
  top: var(--replica-header-height) !important;
  height: calc(100vh - var(--replica-header-height)) !important;
}

.has-local-shell #story-modal {
  top: var(--replica-header-height) !important;
  height: calc(100vh - var(--replica-header-height)) !important;
}

.has-local-shell .content-section {
  scroll-margin-top: calc(var(--replica-header-height) + 16px);
}

.replica-toast {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 120;
  max-width: min(360px, calc(100vw - 36px));
  padding: 11px 14px;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  color: #1e3a8a;
  background: #eff6ff;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.15);
  font-size: 13px;
  line-height: 1.45;
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.replica-toast.is-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 840px) {
  .replica-topbar {
    gap: 10px;
    padding: 0 10px;
  }

  .replica-topbar__title {
    max-width: 58vw;
  }

  .replica-topbar__subtitle {
    display: none;
  }
}
`.trim();

  const REPLICA_SHELL_JS = `
(function () {
  function ensureOfflineRuntime() {
    if (!window.MathJax || typeof window.MathJax !== "object") {
      window.MathJax = {};
    }

    if (typeof window.MathJax.typesetPromise !== "function") {
      window.MathJax.typesetPromise = function () {
        return Promise.resolve();
      };
    }
  }

  function showToast(message) {
    var toast = document.querySelector(".replica-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "replica-toast";
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 1800);
  }

  function bindShellActions() {
    var messages = {
      share: "分享入口已复刻为本地提示，后续可接入真实批量导出逻辑。",
      export: "导出入口已保留；当前脚本会输出单个离线 HTML。",
      feedback: "提建议入口已保留为本地交互占位。"
    };

    document.querySelectorAll("[data-replica-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var action = button.getAttribute("data-replica-action");
        showToast(messages[action] || "本地复刻交互已触发。");
      });
    });
  }

  function patchModalBehavior() {
    var originalToggle = window.toggleModal;

    window.toggleModal = function () {
      if (typeof window.updateOrigin === "function") {
        window.updateOrigin();
      }

      var modal = document.getElementById("story-modal");
      if (!modal) return;

      if (typeof originalToggle === "function") {
        originalToggle();
      } else {
        modal.classList.toggle("active");
        document.body.style.overflow = modal.classList.contains("active") ? "hidden" : "auto";
      }
    };

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;

      var modal = document.getElementById("story-modal");
      if (modal && modal.classList.contains("active")) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto";
      }
    });
  }

  function bindRoadmapShortcuts() {
    document.querySelectorAll("#story-modal h5").forEach(function (heading) {
      var match = heading.textContent.match(/B[1-4]/);
      if (!match) return;

      heading.closest(".grid")?.setAttribute("data-roadmap-target", match[0]);
    });

    document.querySelectorAll("[data-roadmap-target]").forEach(function (card) {
      card.style.cursor = "pointer";
      card.addEventListener("click", function () {
        var target = card.getAttribute("data-roadmap-target");
        if (typeof window.switchTab === "function") {
          window.switchTab(target);
        }

        var modal = document.getElementById("story-modal");
        if (modal) modal.classList.remove("active");
        document.body.style.overflow = "auto";
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    ensureOfflineRuntime();
    bindShellActions();
    patchModalBehavior();
    bindRoadmapShortcuts();
  });
})();
`.trim();

  const uiState = {
    root: null,
    button: null,
    toast: null,
    busy: false,
  };

  const isStudyOuterPage = OUTER_PAGE_RE.test(location.href);
  const isStudyInnerPage = INNER_PAGE_RE.test(location.href);
  const isTopWindow = window.top === window;
  const isCollectorContext = isStudyInnerPage && !isTopWindow;

  if (isCollectorContext) {
    installCollectorBridge();
    return;
  }

  if (!isStudyOuterPage && !isStudyInnerPage) {
    return;
  }

  initExporterUi();

  function initExporterUi() {
    injectStyles();
    ensureUi();

    if (typeof GM_registerMenuCommand === "function") {
      try {
        GM_registerMenuCommand(MENU_LABEL, () => {
          void exportCurrentPage();
        });
      } catch (error) {
        console.warn(SCRIPT_PREFIX, "menu registration failed:", error);
      }
    }
  }

  function injectStyles() {
    const css = `
      #${ROOT_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      }
      #${FLOAT_BUTTON_ID} {
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, #2563eb, #1d4ed8);
        color: #fff;
        box-shadow: 0 14px 30px rgba(37, 99, 235, 0.28);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        line-height: 1;
        transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
      }
      #${FLOAT_BUTTON_ID}:hover {
        transform: translateY(-1px);
        box-shadow: 0 18px 36px rgba(37, 99, 235, 0.34);
      }
      #${FLOAT_BUTTON_ID}:disabled {
        opacity: 0.65;
        cursor: wait;
        transform: none;
      }
      #${FLOAT_BUTTON_ID}::after {
        content: attr(data-tip);
        position: absolute;
        right: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
        white-space: nowrap;
        padding: 5px 10px;
        border-radius: 6px;
        background: rgba(17, 24, 39, 0.9);
        color: #fff;
        font-size: 12px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease;
      }
      #${FLOAT_BUTTON_ID}:hover::after {
        opacity: 1;
      }
      #${TOAST_ID} {
        position: fixed;
        right: 18px;
        bottom: 70px;
        z-index: 2147483645;
        max-width: min(420px, calc(100vw - 36px));
        padding: 10px 14px;
        border-radius: 10px;
        color: #0f172a;
        background: rgba(255, 255, 255, 0.97);
        border: 1px solid rgba(148, 163, 184, 0.28);
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
        font-size: 13px;
        line-height: 1.5;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.18s ease, transform 0.18s ease;
        pointer-events: none;
      }
      #${TOAST_ID}.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
    `;

    if (typeof GM_addStyle === "function") {
      GM_addStyle(css);
      return;
    }

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensureUi() {
    if (uiState.root && document.body.contains(uiState.root)) {
      return;
    }

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <button id="${FLOAT_BUTTON_ID}" type="button" data-tip="导出单 HTML" aria-label="导出单 HTML">⇩</button>
      <div id="${TOAST_ID}" role="status" aria-live="polite"></div>
    `;
    document.body.appendChild(root);

    uiState.root = root;
    uiState.button = root.querySelector(`#${FLOAT_BUTTON_ID}`);
    uiState.toast = root.querySelector(`#${TOAST_ID}`);

    uiState.button.addEventListener("click", () => {
      void exportCurrentPage();
    });
  }

  function setBusy(busy, message) {
    uiState.busy = busy;
    if (uiState.button) {
      uiState.button.disabled = busy;
    }
    if (message) {
      showToast(message);
    }
  }

  function showToast(message) {
    if (!uiState.toast) {
      console.log(SCRIPT_PREFIX, message);
      return;
    }

    uiState.toast.textContent = message;
    uiState.toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      uiState.toast.classList.remove("is-visible");
    }, 2200);
  }

  async function exportCurrentPage() {
    if (uiState.busy) {
      return;
    }

    setBusy(true, "正在抓取当前简单学习页...");

    try {
      const snapshot = await collectRuntimeSnapshot();
      setBusy(true, "正在内联外部资源...");

      const html = await buildSingleHtml(snapshot);
      const filename = buildFilename(snapshot.title || document.title || "baidu-easy-study") + ".html";

      downloadTextFile(html, filename);
      showToast(`已开始下载：${filename}`);
    } catch (error) {
      console.error(SCRIPT_PREFIX, error);
      showToast(`导出失败：${error && error.message ? error.message : "未知错误"}`);
    } finally {
      setBusy(false);
    }
  }

  async function collectRuntimeSnapshot() {
    if (isStudyInnerPage && isTopWindow) {
      return collectDirectSnapshot();
    }

    if (isStudyOuterPage) {
      const frame = await waitForStudyFrame();
      if (!frame) {
        throw new Error("未找到简单学习页 iframe。");
      }
      return await requestFrameSnapshot(frame);
    }

    if (isStudyInnerPage) {
      return collectDirectSnapshot();
    }

    throw new Error("当前页面不是百度简单学习页。");
  }

  function collectDirectSnapshot() {
    return {
      html: document.documentElement.outerHTML,
      title: document.title || "",
      url: location.href,
      capturedAt: Date.now(),
      modalOpen: isModalOpen(),
      activeSection: getActiveSectionId(),
    };
  }

  function getActiveSectionId() {
    const visibleSection = Array.from(document.querySelectorAll(".content-section")).find((section) => !section.classList.contains("hidden"));
    return visibleSection ? visibleSection.id || "" : "";
  }

  function isModalOpen() {
    const modal = document.getElementById("story-modal");
    return !!(modal && modal.classList.contains("active"));
  }

  async function waitForStudyFrame(timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const frame = findStudyFrame();
      if (frame) {
        return frame;
      }
      await sleep(250);
    }
    return null;
  }

  function findStudyFrame() {
    const frames = Array.from(document.querySelectorAll("iframe"));
    return frames.find((frame) => {
      const src = frame.getAttribute("src") || frame.src || "";
      return INNER_PAGE_RE.test(src);
    }) || null;
  }

  function requestFrameSnapshot(frame) {
    return new Promise((resolve, reject) => {
      const id = `bes-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      let settled = false;
      let intervalId = null;
      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error("等待 iframe 响应超时。"));
      }, 20000);

      function cleanup() {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        if (intervalId) {
          window.clearInterval(intervalId);
        }
        window.removeEventListener("message", onMessage);
      }

      function onMessage(event) {
        const data = event.data;
        if (!data || data.type !== RESPONSE_TYPE || data.id !== id) {
          return;
        }

        cleanup();
        if (data.ok) {
          resolve(data.payload);
        } else {
          reject(new Error(data.error || "iframe returned an error."));
        }
      }

      window.addEventListener("message", onMessage);

      const sendRequest = () => {
        try {
          if (frame.contentWindow) {
            frame.contentWindow.postMessage(
              {
                type: REQUEST_TYPE,
                id,
                from: location.href,
                requestedAt: Date.now(),
              },
              "*"
            );
          }
        } catch (error) {
          // keep retrying until timeout
        }
      };

      sendRequest();
      intervalId = window.setInterval(sendRequest, 350);
    });
  }

  function installCollectorBridge() {
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.type !== REQUEST_TYPE || !data.id) {
        return;
      }

      const payload = collectDirectSnapshot();
      payload.source = "iframe";
      payload.requestedAt = data.requestedAt || Date.now();

      try {
        if (event.source && typeof event.source.postMessage === "function") {
          event.source.postMessage(
            {
              type: RESPONSE_TYPE,
              id: data.id,
              ok: true,
              payload,
            },
            event.origin || "*"
          );
        }
      } catch (error) {
        console.warn(SCRIPT_PREFIX, "failed to post collector response:", error);
      }
    });
  }

  async function buildSingleHtml(snapshot) {
    const sourceHtml = String(snapshot.html || "");
    const parts = extractHtmlParts(sourceHtml);
    let head = parts.head;
    let body = parts.body;

    head = cleanFragment(head);
    body = cleanFragment(body);

    const displayTitle = normalizeDisplayTitle(snapshot.title || document.title || "百度简单学习页");
    const fontAwesomeCss = await inlineCssFromUrl(FONT_AWESOME_CSS_URL, FONT_AWESOME_CSS_URL);
    const echartsJs = await fetchTextResource(ECHARTS_JS_URL);

    head = head.replace(
      /<link\b[^>]*href=["']https?:\/\/edu-wenku\.bdimg\.com\/v1\/genflow2025\/report_resource\/font-awesome\/6\.4\.0\/css\/font-awesome_all\.min_6\.4\.0\.css["'][^>]*>/i,
      `<style id="bes-font-awesome-inline">\n${fontAwesomeCss}\n</style>`
    );

    head = head.replace(
      /<script\b[^>]*src=["']https?:\/\/edu-wenku\.bdimg\.com\/v1\/genflow2025\/report_resource\/echarts\.min_5\.4\.3\.js["'][^>]*><\/script>/i,
      `<script>\n${escapeScriptContent(echartsJs)}\n</script>`
    );

    head = head.replace(
      /<script\b[^>]*id=["']MathJax-script["'][\s\S]*?<\/script>/i,
      ""
    );

    const topbar = buildTopbarMarkup(displayTitle);
    const shellStyle = `<style id="bes-replica-shell-style">\n${REPLICA_SHELL_CSS}\n</style>`;
    const shellScript = `<script>\n${escapeScriptContent(REPLICA_SHELL_JS)}\n</script>`;

    head = appendToHead(head, [
      '<link rel="icon" href="data:,">',
      shellStyle,
    ]);

    body = injectAfterBodyOpen(body, topbar);
    body = `${body}\n${shellScript}`;

    const bodyAttrs = addBodyClass(parts.bodyAttrs, "has-local-shell");
    let html = `<!doctype html>\n<html${parts.htmlAttrs}>\n<head>\n${head}\n</head>\n<body${bodyAttrs}>\n${body}\n</body>\n</html>`;
    html = await inlineRemoteCssUrlsInStyleTags(html, snapshot.url || location.href);
    return html;
  }

  function buildTopbarMarkup(displayTitle) {
    return `
  <header class="replica-topbar" aria-label="百度网盘简单学习复刻顶栏">
    <div class="replica-topbar__left">
      <button class="replica-topbar__icon-button" type="button" data-replica-action="menu" aria-label="导航按钮">
        <i class="fa-solid fa-bars"></i>
      </button>
      <div class="replica-topbar__title-block">
        <p class="replica-topbar__title">${escapeHtml(displayTitle)}</p>
        <p class="replica-topbar__subtitle">单 HTML 导出版</p>
      </div>
    </div>
    <div class="replica-topbar__actions" aria-label="页面操作">
      <button class="replica-topbar__icon-button" type="button" data-replica-action="share" aria-label="分享">
        <i class="fa-solid fa-share-nodes"></i>
      </button>
      <button class="replica-topbar__icon-button" type="button" data-replica-action="export" aria-label="导出">
        <i class="fa-solid fa-file-export"></i>
      </button>
      <button class="replica-topbar__icon-button" type="button" data-replica-action="feedback" aria-label="提建议">
        <i class="fa-regular fa-comment-dots"></i>
      </button>
    </div>
  </header>
`.trim();
  }

  function cleanFragment(fragment) {
    return String(fragment || "")
      .replace(/<script\b[^>]*src=["']https?:\/\/edu-wenku\.bdimg\.com\/v1\/genflow2025\/report_resource\/tailwindcss_3\.4\.16\.js["'][\s\S]*?<\/script>/gi, "")
      .replace(/<script\b[^>]*src=["']chrome-extension:\/\/[^"']+["'][\s\S]*?<\/script>/gi, "")
      .replace(/<input\b[^>]*id=["']_o_[^"']+["'][^>]*>/gi, "")
      .replace(/<script\b[^>]*id=["']MathJax-script["'][\s\S]*?<\/script>/gi, "")
      .replace(/<script>\s*tailwind\.config\s*=[\s\S]*?<\/script>/gi, "")
      .replace(/<div id=["']notab-shadow-host["'][\s\S]*?<\/div>/gi, "")
      .replace(/ data-ries-content-script=["'][^"']*["']/gi, "")
      .replace(/<!--[\s\S]*?https?:\/\/[\s\S]*?-->/gi, "")
      .replace(/\/\* ! tailwindcss v3\.4\.16 \| MIT License \| https:\/\/tailwindcss\.com \*\//g, "/* tailwindcss v3.4.16 runtime utilities */");
  }

  function extractHtmlParts(sourceHtml) {
    const htmlMatch = sourceHtml.match(/<html\b([^>]*)>/i);
    const headMatch = sourceHtml.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
    const bodyMatch = sourceHtml.match(/<body\b([^>]*)>([\s\S]*?)<\/body>/i);

    if (!headMatch || !bodyMatch) {
      throw new Error("Runtime snapshot does not contain a normal head/body pair.");
    }

    return {
      htmlAttrs: htmlMatch?.[1] || ' lang="zh-CN"',
      head: headMatch[1],
      bodyAttrs: bodyMatch[1] || "",
      body: bodyMatch[2],
    };
  }

  function appendToHead(head, fragments) {
    const addition = fragments.filter(Boolean).join("\n");
    return `${head}\n${addition}`;
  }

  function injectAfterBodyOpen(body, html) {
    return `${html}\n${body}`;
  }

  function addBodyClass(bodyAttrs, className) {
    const attrs = String(bodyAttrs || "");
    const classRe = /\bclass=(["'])([^"']*)\1/i;
    const match = attrs.match(classRe);
    if (!match) {
      return `${attrs} class="${className}"`;
    }

    const existing = match[2].split(/\s+/).filter(Boolean);
    if (!existing.includes(className)) {
      existing.push(className);
    }

    return attrs.replace(classRe, `class=${match[1]}${existing.join(" ")}${match[1]}`);
  }

  async function inlineRemoteCssUrlsInStyleTags(html, baseUrl) {
    const styleRe = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
    let cursor = 0;
    let result = "";
    let match;

    while ((match = styleRe.exec(html))) {
      result += html.slice(cursor, match.index);
      const attrs = match[1];
      const css = match[2];
      const nextCss = await inlineCssUrls(css, baseUrl);
      result += `<style${attrs}>${nextCss}</style>`;
      cursor = styleRe.lastIndex;
    }

    result += html.slice(cursor);
    return result;
  }

  async function inlineCssFromUrl(cssUrl, baseUrl) {
    const cssText = await fetchTextResource(cssUrl);
    return await inlineCssUrls(cssText, baseUrl || cssUrl);
  }

  async function inlineCssUrls(cssText, baseUrl) {
    const source = String(cssText || "");
    const urlRe = /url\((['"]?)([^'")]+)\1\)/g;
    const pending = [];
    const uniqueUrls = new Map();
    let match;

    while ((match = urlRe.exec(source))) {
      const rawUrl = String(match[2] || "").trim();
      if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:") || rawUrl.startsWith("#") || rawUrl.startsWith("var(")) {
        continue;
      }
      const absUrl = resolveUrl(rawUrl, baseUrl);
      if (!uniqueUrls.has(absUrl)) {
        uniqueUrls.set(absUrl, null);
        pending.push(absUrl);
      }
    }

    const resolved = new Map();
    await Promise.all(pending.map(async (url) => {
      const dataUrl = await fetchAsDataUrl(url);
      resolved.set(url, dataUrl);
    }));

    return source.replace(urlRe, (fullMatch, quote, rawUrl) => {
      const normalized = String(rawUrl || "").trim();
      if (!normalized || normalized.startsWith("data:") || normalized.startsWith("blob:") || normalized.startsWith("#") || normalized.startsWith("var(")) {
        return fullMatch;
      }
      const absUrl = resolveUrl(normalized, baseUrl);
      const dataUrl = resolved.get(absUrl);
      if (!dataUrl) {
        return fullMatch;
      }
      return `url("${dataUrl}")`;
    });
  }

  function resolveUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl || location.href).href;
    } catch (error) {
      return url;
    }
  }

  async function fetchTextResource(url) {
    const response = await gmRequest({ method: "GET", url, responseType: "text" });
    if (typeof response.responseText === "string") {
      return response.responseText;
    }
    if (typeof response.response === "string") {
      return response.response;
    }
    throw new Error(`Unable to load text resource: ${url}`);
  }

  async function fetchAsDataUrl(url) {
    const response = await gmRequest({ method: "GET", url, responseType: "arraybuffer" });
    const buffer = response.response;
    if (!(buffer instanceof ArrayBuffer)) {
      throw new Error(`Unable to load binary resource: ${url}`);
    }
    const contentType = parseContentType(response.responseHeaders) || guessMimeType(url);
    return await arrayBufferToDataUrl(buffer, contentType);
  }

  function gmRequest(options) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("GM_xmlhttpRequest is unavailable."));
        return;
      }

      GM_xmlhttpRequest({
        method: options.method || "GET",
        url: options.url,
        responseType: options.responseType || "text",
        timeout: options.timeout || 30000,
        onload: resolve,
        onerror: (error) => reject(new Error(`Request failed: ${options.url}`)),
        ontimeout: () => reject(new Error(`Request timed out: ${options.url}`)),
      });
    });
  }

  function parseContentType(responseHeaders) {
    const match = /content-type:\s*([^\r\n;]+)/i.exec(String(responseHeaders || ""));
    return match ? match[1].trim() : "";
  }

  function guessMimeType(url) {
    const lower = String(url || "").toLowerCase();
    if (lower.endsWith(".woff2")) return "font/woff2";
    if (lower.endsWith(".woff")) return "font/woff";
    if (lower.endsWith(".ttf")) return "font/ttf";
    if (lower.endsWith(".otf")) return "font/otf";
    if (lower.endsWith(".css")) return "text/css;charset=utf-8";
    if (lower.endsWith(".js")) return "application/javascript;charset=utf-8";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    return "application/octet-stream";
  }

  function arrayBufferToDataUrl(buffer, contentType) {
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([buffer], { type: contentType || "application/octet-stream" });
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Failed to convert binary data to data URL."));
        reader.readAsDataURL(blob);
      } catch (error) {
        reject(error);
      }
    });
  }

  function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function normalizeDisplayTitle(title) {
    return String(title || "")
      .replace(/\s*-\s*学习笔记\s*$/g, "")
      .replace(/\s*\|\s*.*$/g, "")
      .trim() || "百度简单学习页";
  }

  function buildFilename(title) {
    return String(title || "baidu-easy-study")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
      .replace(/\.$/, "");
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeScriptContent(text) {
    return String(text || "").replace(/<\/script/gi, "<\\/script");
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
})();
