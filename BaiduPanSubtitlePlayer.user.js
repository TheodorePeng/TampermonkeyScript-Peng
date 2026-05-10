// ==UserScript==
// @name         Baidu Pan Video Caption Helper (Local Subtitles)
// @namespace    https://example.local/
// @version      0.9.2
// @description  Floating subtitle panel for pan.baidu.com video pages. Load local SRT/VTT, sync with video, click-to-seek, smart scroll, bilingual blur & swap.
// @author       you
// @match        https://pan.baidu.com/pfile/video*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/BaiduPanSubtitlePlayer.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/BaiduPanSubtitlePlayer.user.js
// ==/UserScript==

(() => {
    "use strict";
  
    /**********************************************************************
     * Config / Storage
     **********************************************************************/
    const LS_KEY = "tm_baidu_caption_helper_state_v1";
    const DEFAULT_STATE = {
      x: null,
      y: null,
      w: 360,
      h: 520,
      collapsed: false,
      viewMode: "list",     // "list" | "article"
      scrollMode: "center", // "center" | "top"
      autoScroll: true,
      swapLines: false,
      searchOpen: false,
      mapMode: "auto",      // "auto" | "AisZh" | "BisZh"
    };
  
    const state = loadState();
    function loadState() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return { ...DEFAULT_STATE };
        const obj = JSON.parse(raw);
        return { ...DEFAULT_STATE, ...(obj || {}) };
      } catch {
        return { ...DEFAULT_STATE };
      }
    }
    function saveState() {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state));
      } catch {}
    }
  
    /**********************************************************************
     * Styles
     **********************************************************************/
    const CSS = `
    .tmch-panel {
      position: fixed;
      z-index: 2147483647;
      top: 80px;
      right: 24px;
      width: 360px;
      height: 520px;
      display: flex;
      flex-direction: column;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 16px 40px rgba(0,0,0,.22);
      border: 1px solid rgba(255,255,255,.25);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      background: rgba(18,18,18,.55);
      color: rgba(255,255,255,.92);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
    }
    @media (prefers-color-scheme: light) {
      .tmch-panel {
        background: rgba(255,255,255,.72);
        color: rgba(0,0,0,.86);
        border: 1px solid rgba(0,0,0,.10);
        box-shadow: 0 16px 40px rgba(0,0,0,.15);
      }
    }
  
    /* Compact header */
    .tmch-header {
      user-select: none;
      cursor: move;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      background: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.03));
    }
    @media (prefers-color-scheme: light) {
      .tmch-header { background: linear-gradient(180deg, rgba(0,0,0,.04), rgba(0,0,0,.02)); }
    }
  
    .tmch-title {
      font-weight: 700;
      font-size: 12px;
      opacity: .95;
      white-space: nowrap;
    }
    .tmch-spacer { flex: 1; }
  
    .tmch-btn {
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(255,255,255,.10);
      color: inherit;
      border-radius: 10px;
      padding: 5px 7px;
      font-size: 11px;
      line-height: 1;
      cursor: pointer;
      user-select: none;
    }
    @media (prefers-color-scheme: light) {
      .tmch-btn {
        border: 1px solid rgba(0,0,0,.10);
        background: rgba(0,0,0,.04);
      }
    }
    .tmch-btn:hover { filter: brightness(1.08); }
    .tmch-btn:active { transform: translateY(1px); }
  
    .tmch-toolbar {
      display: flex;
      gap: 6px;
      padding: 8px 10px;
      border-top: 1px solid rgba(255,255,255,.12);
      border-bottom: 1px solid rgba(255,255,255,.12);
      flex-wrap: wrap;
    }
    @media (prefers-color-scheme: light) {
      .tmch-toolbar {
        border-top: 1px solid rgba(0,0,0,.08);
        border-bottom: 1px solid rgba(0,0,0,.08);
      }
    }
  
    .tmch-search {
      display: none;
      padding: 8px 10px;
      border-bottom: 1px solid rgba(255,255,255,.12);
    }
    @media (prefers-color-scheme: light) {
      .tmch-search { border-bottom: 1px solid rgba(0,0,0,.08); }
    }
    .tmch-search.open { display: block; }
    .tmch-search input {
      width: 100%;
      padding: 7px 10px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.20);
      outline: none;
      background: rgba(255,255,255,.10);
      color: inherit;
      font-size: 12px;
    }
    @media (prefers-color-scheme: light) {
      .tmch-search input {
        border: 1px solid rgba(0,0,0,.12);
        background: rgba(0,0,0,.04);
      }
    }
  
    .tmch-body {
      position: relative;
      flex: 1;
      overflow: auto;
      padding: 8px;
      padding-bottom: 22px; /* avoid hiding last row under resize handle */
    }
  
    /* Collapse the whole window (everything except header) */
    .tmch-panel.tmch-collapsed .tmch-toolbar,
    .tmch-panel.tmch-collapsed .tmch-search,
    .tmch-panel.tmch-collapsed .tmch-body,
    .tmch-panel.tmch-collapsed .tmch-resize {
      display: none !important;
    }
  
    .tmch-hint {
      opacity: .8;
      font-size: 12px;
      line-height: 1.5;
      padding: 10px;
      border-radius: 12px;
      border: 1px dashed rgba(255,255,255,.25);
    }
    @media (prefers-color-scheme: light) {
      .tmch-hint { border: 1px dashed rgba(0,0,0,.18); }
    }
  
    .tmch-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  
    .tmch-item {
      border-radius: 10px;
      padding: 5px 7px;
      border: 1px solid rgba(255,255,255,.14);
      background: rgba(255,255,255,.07);
      transition: transform .08s ease, background .12s ease;
    }
    @media (prefers-color-scheme: light) {
      .tmch-item {
        border: 1px solid rgba(0,0,0,.10);
        background: rgba(0,0,0,.03);
      }
    }
    .tmch-item:hover { filter: brightness(1.05); }
    .tmch-item.current {
      background: rgba(64, 164, 255, .18);
      border-color: rgba(64, 164, 255, .55);
    }
    @media (prefers-color-scheme: light) {
      .tmch-item.current {
        background: rgba(64, 164, 255, .14);
        border-color: rgba(64, 164, 255, .40);
      }
    }
  
    /* Time inline with subtitle lines */
    .tmch-lineRow {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
  
    .tmch-time {
      flex: 0 0 auto;
      font-size: 10px;
      opacity: .82;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(0,0,0,.10);
      cursor: pointer;
      white-space: nowrap;
      transform: translateY(1px);
    }
    @media (prefers-color-scheme: light) {
      .tmch-time {
        border: 1px solid rgba(0,0,0,.10);
        background: rgba(0,0,0,.04);
      }
    }
    .tmch-time:hover { filter: brightness(1.08); }
  
    .tmch-textLine {
      position: relative;
      flex: 1;
      min-width: 0;            /* enable ellipsis */
      font-size: 12px;
      line-height: 1.25;
      word-break: break-word;
      cursor: pointer;
      padding: 2px 4px;
      padding-right: 44px;     /* space for blur hint */
      border-radius: 8px;
    }
    .tmch-textLine:hover { background: rgba(255,255,255,.06); }
    @media (prefers-color-scheme: light) {
      .tmch-textLine:hover { background: rgba(0,0,0,.04); }
    }
  
    .tmch-blur {
      /* compact when blurred */
      filter: blur(6px);
      opacity: .85;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-height: 1.35em;
      padding-top: 1px;
      padding-bottom: 1px;
    }
    .tmch-blur::after {
      content: "点击显示";
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 10px;
      opacity: .7;
      pointer-events: none; /* keep click on text line */
      filter: none;
    }
  
    .tmch-match {
      outline: 2px solid rgba(255, 196, 0, .55);
      outline-offset: 2px;
    }
  
    /* IMPORTANT: keep resize handle above body */
    .tmch-resize {
      position: absolute;
      right: 6px;
      bottom: 6px;
      width: 16px;
      height: 16px;
      border-radius: 6px;
      cursor: nwse-resize;
      background: rgba(255,255,255,.18);
      border: 1px solid rgba(255,255,255,.20);
      z-index: 50;
    }
    @media (prefers-color-scheme: light) {
      .tmch-resize {
        background: rgba(0,0,0,.06);
        border: 1px solid rgba(0,0,0,.10);
      }
    }
  
    .tmch-dropOverlay {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(64,164,255,.18);
      border: 2px dashed rgba(64,164,255,.65);
      border-radius: 16px;
      font-weight: 700;
      font-size: 14px;
      z-index: 60;
    }
    .tmch-dropOverlay.show { display: flex; }
  
    .tmch-article .tmch-para {
      border-radius: 10px;
      padding: 8px 8px;
      border: 1px solid rgba(255,255,255,.14);
      background: rgba(255,255,255,.07);
      margin-bottom: 6px;
    }
    @media (prefers-color-scheme: light) {
      .tmch-article .tmch-para {
        border: 1px solid rgba(0,0,0,.10);
        background: rgba(0,0,0,.03);
      }
    }
    .tmch-para.current {
      background: rgba(64, 164, 255, .18);
      border-color: rgba(64, 164, 255, .55);
    }
    `;
  
    injectStyle(CSS);
    function injectStyle(css) {
      const s = document.createElement("style");
      s.textContent = css;
      document.documentElement.appendChild(s);
    }
  
    /**********************************************************************
     * UI Creation
     **********************************************************************/
    const ui = createUI();
    document.documentElement.appendChild(ui.panel);
    applyPanelGeometryFromState();
  
    /**********************************************************************
     * Subtitle Data + Rendering State
     **********************************************************************/
    /** @type {{startMs:number,endMs:number,a:string,b:string,rawLines:string[], meta?:any}[]} */
    let cues = [];
    let currentIndex = -1;
    let videoEl = null;
  
    const itemBlur = new Map(); // Map<number, {A?:boolean,B?:boolean}>
    let autoScrollPausedUntil = 0;
    let listItemEls = [];
    let articleParaEls = [];
  
    /**********************************************************************
     * Video binding (supports SPA)
     **********************************************************************/
    bindVideoLoop();
  
    function bindVideoLoop() {
      const tryBind = () => {
        const v = findVideoElement();
        if (v && v !== videoEl) {
          videoEl = v;
          attachVideoListeners(videoEl);
          ui.setStatus(`已绑定视频`);
          currentIndex = -1;
          tick();
        }
      };
  
      tryBind();
  
      const mo = new MutationObserver(() => tryBind());
      mo.observe(document.documentElement, { childList: true, subtree: true });
  
      setInterval(tryBind, 1500);
    }
  
    function findVideoElement() {
      const vids = Array.from(document.querySelectorAll("video"));
      if (!vids.length) return null;
  
      const visible = vids
        .map(v => ({ v, rect: v.getBoundingClientRect() }))
        .filter(x => x.rect.width > 80 && x.rect.height > 60);
  
      if (!visible.length) return vids[0];
      visible.sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
      return visible[0].v;
    }
  
    function attachVideoListeners(v) {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.addEventListener("timeupdate", onTimeUpdate);
  
      if (!tick._started) {
        tick._started = true;
        requestAnimationFrame(tick);
      }
    }
  
    function onTimeUpdate() {}
  
    function tick() {
      if (videoEl && cues.length) {
        const tMs = Math.max(0, videoEl.currentTime * 1000);
        const idx = findCueIndex(tMs);
        if (idx !== currentIndex) setCurrentIndex(idx);
      }
      requestAnimationFrame(tick);
    }
  
    function findCueIndex(tMs) {
      let lo = 0, hi = cues.length - 1, ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (cues[mid].startMs <= tMs) { ans = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      if (ans < 0) return -1;
  
      for (let i = ans; i < cues.length && i < ans + 3; i++) {
        if (cues[i].startMs <= tMs && tMs < cues[i].endMs) return i;
      }
      for (let i = ans; i >= 0 && i > ans - 3; i--) {
        if (cues[i].startMs <= tMs && tMs < cues[i].endMs) return i;
      }
      return ans;
    }
  
    function setCurrentIndex(idx) {
      if (currentIndex >= 0) {
        const prev = state.viewMode === "list" ? listItemEls[currentIndex] : articleParaEls[currentIndex];
        if (prev) prev.classList.remove("current");
      }
  
      currentIndex = idx;
  
      if (currentIndex >= 0) {
        const el = state.viewMode === "list" ? listItemEls[currentIndex] : articleParaEls[currentIndex];
        if (el) el.classList.add("current");
        maybeAutoScrollTo(el);
      }
  
      if (videoEl) {
        ui.setStatus(`播放：${formatTimeMs(videoEl.currentTime * 1000)}${cues.length ? ` / 字幕 ${cues.length} 条` : ""}`);
      }
    }
  
    function maybeAutoScrollTo(targetEl) {
      if (!targetEl) return;
      if (!state.autoScroll) return;
      if (Date.now() < autoScrollPausedUntil) return;
  
      const container = ui.body;
      const cRect = container.getBoundingClientRect();
      const tRect = targetEl.getBoundingClientRect();
  
      const containerScrollTop = container.scrollTop;
      const offsetTopWithin = (tRect.top - cRect.top) + containerScrollTop;
  
      let desired;
      if (state.scrollMode === "top") {
        desired = offsetTopWithin - 12;
      } else {
        desired = offsetTopWithin - (cRect.height / 2) + (tRect.height / 2);
      }
      desired = Math.max(0, desired);
      container.scrollTo({ top: desired, behavior: "smooth" });
    }
  
    /**********************************************************************
     * UI Events
     **********************************************************************/
    ui.onToggleCollapse(() => {
      if (!state.collapsed) {
        const rect = ui.panel.getBoundingClientRect();
        state.w = Math.round(rect.width);
        state.h = Math.round(rect.height);
      }
      state.collapsed = !state.collapsed;
      ui.setCollapsed(state.collapsed);
      saveState();
    });
  
    ui.onToggleView(() => {
      state.viewMode = state.viewMode === "list" ? "article" : "list";
      ui.setViewMode(state.viewMode);
      renderAll();
      saveState();
      setCurrentIndex(currentIndex);
    });
  
    ui.onToggleScrollMode(() => {
      state.scrollMode = state.scrollMode === "center" ? "top" : "center";
      ui.setScrollMode(state.scrollMode);
      saveState();
      if (currentIndex >= 0) {
        const el = state.viewMode === "list" ? listItemEls[currentIndex] : articleParaEls[currentIndex];
        maybeAutoScrollTo(el);
      }
    });
  
    ui.onToggleAutoScroll(() => {
      state.autoScroll = !state.autoScroll;
      ui.setAutoScroll(state.autoScroll);
      saveState();
      if (state.autoScroll && currentIndex >= 0) {
        const el = state.viewMode === "list" ? listItemEls[currentIndex] : articleParaEls[currentIndex];
        maybeAutoScrollTo(el);
      }
    });
  
    ui.onToggleSearch(() => {
      state.searchOpen = !state.searchOpen;
      ui.setSearchOpen(state.searchOpen);
      saveState();
      if (state.searchOpen) ui.focusSearch();
    });
  
    ui.onClear(() => {
      cues = [];
      itemBlur.clear();
      currentIndex = -1;
      renderAll();
      ui.setStatus("已清空字幕");
    });
  
    ui.onSwapLines(() => {
      state.swapLines = !state.swapLines;
      ui.setSwapLines(state.swapLines);
      saveState();
      renderAll();
      setCurrentIndex(currentIndex);
    });
  
    ui.onCycleMapMode(() => {
      state.mapMode = state.mapMode === "auto" ? "AisZh" : (state.mapMode === "AisZh" ? "BisZh" : "auto");
      ui.setMapMode(state.mapMode);
      saveState();
      renderAll();
      setCurrentIndex(currentIndex);
    });
  
    ui.onGlobalBlurZh(() => {
      if (!cues.length) return;
      const allState = computeLangAllBlurState("zh");
      const setTo = allState === "allBlurred" ? false : true;
      applyGlobalBlur("zh", setTo);
      renderAll();
      setCurrentIndex(currentIndex);
      ui.setStatus(`中文：${setTo ? "已全部模糊" : "已全部显示"}`);
    });
  
    ui.onGlobalBlurEn(() => {
      if (!cues.length) return;
      const allState = computeLangAllBlurState("en");
      const setTo = allState === "allBlurred" ? false : true;
      applyGlobalBlur("en", setTo);
      renderAll();
      setCurrentIndex(currentIndex);
      ui.setStatus(`英文：${setTo ? "已全部模糊" : "已全部显示"}`);
    });
  
    ui.onSearchInput((q) => applySearch(q));
  
    ui.body.addEventListener("scroll", () => {
      autoScrollPausedUntil = Date.now() + 3000;
    }, { passive: true });
  
    // Drag & Drop subtitle file
    ui.panel.addEventListener("dragenter", (e) => { e.preventDefault(); ui.showDropOverlay(true); });
    ui.panel.addEventListener("dragover", (e) => { e.preventDefault(); ui.showDropOverlay(true); });
    ui.panel.addEventListener("dragleave", (e) => {
      if (!ui.panel.contains(e.relatedTarget)) ui.showDropOverlay(false);
    });
    ui.panel.addEventListener("drop", async (e) => {
      e.preventDefault();
      ui.showDropOverlay(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) await loadSubtitleFile(file);
    });
  
    ui.onPickFile(async (file) => {
      if (file) await loadSubtitleFile(file);
    });
  
    /**********************************************************************
     * Load & Parse
     **********************************************************************/
    async function loadSubtitleFile(file) {
      const name = (file.name || "").toLowerCase();
      const text = await file.text();
      let parsed = null;
  
      if (name.endsWith(".srt")) parsed = parseSRT(text);
      else if (name.endsWith(".vtt")) parsed = parseVTT(text);
      else {
        if (/-->\s*\d{2}:\d{2}/.test(text) && /,|\./.test(text)) {
          parsed = /WEBVTT/i.test(text.slice(0, 200)) ? parseVTT(text) : parseSRT(text);
        } else {
          ui.setStatus("不支持的字幕格式：仅支持 SRT / VTT");
          return;
        }
      }
  
      cues = parsed.filter(c => c.endMs > c.startMs && (c.a || c.b));
      itemBlur.clear();
      currentIndex = -1;
  
      renderAll();
      ui.setStatus(`已加载：${file.name}（${cues.length} 条）`);
  
      if (videoEl) setCurrentIndex(findCueIndex(videoEl.currentTime * 1000));
    }
  
    function parseSRT(input) {
      const s = normalizeText(input);
      const blocks = s.split(/\n{2,}/g);
      const out = [];
  
      for (const block of blocks) {
        const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) continue;
  
        let timeLineIdx = 0;
        if (/^\d+$/.test(lines[0]) && lines[1] && lines[1].includes("-->")) timeLineIdx = 1;
  
        const timeLine = lines[timeLineIdx];
        const m = timeLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{1,3})/);
        if (!m) continue;
  
        const startMs = parseTimeToMs(m[1]);
        const endMs = parseTimeToMs(m[2]);
  
        const textLines = lines.slice(timeLineIdx + 1).map(cleanCaptionLine).filter(Boolean);
        const { a, b, rawLines } = splitBilingual(textLines);
  
        out.push({ startMs, endMs, a, b, rawLines });
      }
      return out;
    }
  
    function parseVTT(input) {
      let s = normalizeText(input);
      s = s.replace(/^WEBVTT[^\n]*\n+/i, "");
      s = s.replace(/(^|\n)NOTE[\s\S]*?(?=\n{2,}|\n*$)/g, "\n");
  
      const blocks = s.split(/\n{2,}/g);
      const out = [];
  
      for (const block of blocks) {
        const lines = block.split("\n").map(l => l.trimEnd());
        const nonEmpty = lines.filter(l => l.trim().length > 0);
        if (nonEmpty.length < 2) continue;
  
        let timeLine = nonEmpty[0];
        if (!timeLine.includes("-->") && nonEmpty[1] && nonEmpty[1].includes("-->")) timeLine = nonEmpty[1];
  
        const m = timeLine.match(/(\d{2}:\d{2}:\d{2}\.\d{1,3}|\d{2}:\d{2}\.\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{1,3}|\d{2}:\d{2}\.\d{1,3})/);
        if (!m) continue;
  
        const startMs = parseTimeToMs(m[1]);
        const endMs = parseTimeToMs(m[2]);
  
        const idx = nonEmpty.findIndex(l => l === timeLine);
        const textLines = nonEmpty.slice(idx + 1).map(cleanCaptionLine).filter(Boolean);
        const { a, b, rawLines } = splitBilingual(textLines);
  
        out.push({ startMs, endMs, a, b, rawLines });
      }
      return out;
    }
  
    function normalizeText(s) {
      return (s || "")
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
    }
  
    function cleanCaptionLine(line) {
      let s = (line || "").replace(/<\/?[^>]+>/g, "");
      s = s
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      return s.trim();
    }
  
    function splitBilingual(lines) {
      const rawLines = lines.slice();
      const a = (lines[0] || "").trim();
      const b = lines.length >= 2 ? lines.slice(1).join("\n").trim() : "";
      return { a, b, rawLines };
    }
  
    function parseTimeToMs(ts) {
      const s = ts.replace(",", ".").trim();
      const parts = s.split(":");
      let h = 0, m = 0, sec = 0;
  
      if (parts.length === 3) {
        h = parseInt(parts[0], 10) || 0;
        m = parseInt(parts[1], 10) || 0;
        sec = parseFloat(parts[2]) || 0;
      } else if (parts.length === 2) {
        m = parseInt(parts[0], 10) || 0;
        sec = parseFloat(parts[1]) || 0;
      } else {
        sec = parseFloat(parts[0]) || 0;
      }
      return Math.max(0, Math.round(((h * 3600) + (m * 60) + sec) * 1000));
    }
  
    function formatTimeMs(ms) {
      ms = Math.max(0, Math.floor(ms));
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const pad2 = (n) => String(n).padStart(2, "0");
      return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
    }
  
    /**********************************************************************
     * Bilingual language detection & blur logic
     **********************************************************************/
    function countCJK(str) {
      const s = str || "";
      const m = s.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g);
      return m ? m.length : 0;
    }
  
    function detectZhLineForCue(cue) {
      const a = cue.a || "";
      const b = cue.b || "";
      if (!b) return countCJK(a) > 0 ? "A" : null;
      const ca = countCJK(a), cb = countCJK(b);
      if (ca === 0 && cb === 0) return null;
      return ca >= cb ? "A" : "B";
    }
  
    function isLineLang(cue, lineKey, lang /* "zh"|"en" */) {
      const hasB = !!(cue.b && cue.b.trim());
      if (!hasB) {
        const cjk = countCJK(cue.a);
        const singleLang = cjk > 0 ? "zh" : "en";
        return lang === singleLang;
      }
  
      let zhKey = "A";
      if (state.mapMode === "AisZh") zhKey = "A";
      else if (state.mapMode === "BisZh") zhKey = "B";
      else {
        const detected = detectZhLineForCue(cue);
        zhKey = detected || "A";
      }
  
      if (lang === "zh") return lineKey === zhKey;
      return lineKey !== zhKey;
    }
  
    function getItemBlur(i, lineKey) {
      const obj = itemBlur.get(i);
      return !!(obj && obj[lineKey]);
    }
    function setItemBlur(i, lineKey, val) {
      const obj = itemBlur.get(i) || {};
      obj[lineKey] = !!val;
      itemBlur.set(i, obj);
    }
  
    function computeLangAllBlurState(lang) {
      if (!cues.length) return "allClear";
      let total = 0, blurred = 0;
  
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i];
        if (!cue.b) continue;
        for (const k of ["A", "B"]) {
          if (isLineLang(cue, k, lang)) {
            total++;
            if (getItemBlur(i, k)) blurred++;
          }
        }
      }
      if (total === 0) return "allClear";
      if (blurred === 0) return "allClear";
      if (blurred === total) return "allBlurred";
      return "mixed";
    }
  
    function applyGlobalBlur(lang, val) {
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i];
        if (!cue.b) continue;
        for (const k of ["A", "B"]) {
          if (isLineLang(cue, k, lang)) setItemBlur(i, k, val);
        }
      }
    }
  
    /**********************************************************************
     * Rendering
     **********************************************************************/
    function renderAll() {
      ui.clearBody();
  
      if (!cues.length) {
        ui.renderHint(`
  拖拽字幕文件到此窗口，或点击“加载字幕”。<br/>
  支持：.srt / .vtt（仅本地）。<br/>
  已绑定视频：${videoEl ? "是" : "否（等待检测…）"}
        `.trim());
        listItemEls = [];
        articleParaEls = [];
        return;
      }
  
      if (state.viewMode === "list") renderListView();
      else renderArticleView();
  
      applySearch(ui.getSearchValue());
    }
  
    function renderListView() {
      const list = document.createElement("div");
      list.className = "tmch-list";
      listItemEls = new Array(cues.length);
  
      const frag = document.createDocumentFragment();
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i];
        const item = document.createElement("div");
        item.className = "tmch-item";
        item.dataset.idx = String(i);
  
        // Click anywhere in the box to seek, except clicking subtitle text (toggle blur)
        item.addEventListener("click", (e) => {
          const t = e.target;
          if (t && t.closest && t.closest(".tmch-textLine")) return;
          seekToCue(i);
        });
  
        const hasB = !!(cue.b && cue.b.trim());
        const timeText = formatTimeMs(cue.startMs);
  
        if (!hasB) {
          item.appendChild(buildLineRow(i, "A", cue.a, timeText, true));
        } else if (!state.swapLines) {
          item.appendChild(buildLineRow(i, "A", cue.a, timeText, true));
          item.appendChild(buildLineRow(i, "B", cue.b, timeText, false));
        } else {
          item.appendChild(buildLineRow(i, "B", cue.b, timeText, true));
          item.appendChild(buildLineRow(i, "A", cue.a, timeText, false));
        }
  
        frag.appendChild(item);
        listItemEls[i] = item;
      }
  
      list.appendChild(frag);
      ui.body.appendChild(list);
  
      if (currentIndex >= 0 && listItemEls[currentIndex]) listItemEls[currentIndex].classList.add("current");
    }
  
    function renderArticleView() {
      const wrap = document.createElement("div");
      wrap.className = "tmch-article";
      articleParaEls = new Array(cues.length);
  
      const frag = document.createDocumentFragment();
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i];
        const p = document.createElement("div");
        p.className = "tmch-para";
        p.dataset.idx = String(i);
  
        p.addEventListener("click", (e) => {
          const t = e.target;
          if (t && t.closest && t.closest(".tmch-textLine")) return;
          seekToCue(i);
        });
  
        const hasB = !!(cue.b && cue.b.trim());
        const timeText = formatTimeMs(cue.startMs);
  
        if (!hasB) {
          p.appendChild(buildLineRow(i, "A", cue.a, timeText, true));
        } else if (!state.swapLines) {
          p.appendChild(buildLineRow(i, "A", cue.a, timeText, true));
          p.appendChild(buildLineRow(i, "B", cue.b, timeText, false));
        } else {
          p.appendChild(buildLineRow(i, "B", cue.b, timeText, true));
          p.appendChild(buildLineRow(i, "A", cue.a, timeText, false));
        }
  
        frag.appendChild(p);
        articleParaEls[i] = p;
      }
  
      wrap.appendChild(frag);
      ui.body.appendChild(wrap);
  
      if (currentIndex >= 0 && articleParaEls[currentIndex]) articleParaEls[currentIndex].classList.add("current");
    }
  
    function buildTextLine(i, lineKey, text) {
      const div = document.createElement("div");
      div.className = "tmch-textLine";
      div.dataset.idx = String(i);
      div.dataset.line = lineKey;
  
      const blurred = getItemBlur(i, lineKey);
      if (blurred) div.classList.add("tmch-blur");
  
      div.textContent = text || "";
  
      div.addEventListener("click", (e) => {
        e.stopPropagation();
        const nowBlur = !getItemBlur(i, lineKey);
        setItemBlur(i, lineKey, nowBlur);
        div.classList.toggle("tmch-blur", nowBlur);
      });
  
      return div;
    }
  
    function buildLineRow(i, lineKey, text, timeText, showTime) {
      const row = document.createElement("div");
      row.className = "tmch-lineRow";
  
      const time = document.createElement("span");
      time.className = "tmch-time";
      time.textContent = timeText;
  
      if (!showTime) {
        time.style.visibility = "hidden"; // keep alignment
      } else {
        time.title = "点击跳转到此时间";
        time.addEventListener("click", (e) => {
          e.stopPropagation();
          seekToCue(i);
        });
      }
  
      const textEl = buildTextLine(i, lineKey, text);
  
      row.appendChild(time);
      row.appendChild(textEl);
      return row;
    }
  
    function seekToCue(i) {
      if (!videoEl) {
        ui.setStatus("未检测到 video 元素，无法跳转");
        return;
      }
      const cue = cues[i];
      if (!cue) return;
  
      videoEl.currentTime = cue.startMs / 1000;
      const p = videoEl.play?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
      ui.setStatus(`跳转：${formatTimeMs(cue.startMs)}`);
    }
  
    function applySearch(query) {
      const q = (query || "").trim().toLowerCase();
      const allTextLines = ui.body.querySelectorAll(".tmch-textLine");
      allTextLines.forEach(el => el.classList.remove("tmch-match"));
      if (!q) return;
  
      let firstMatchEl = null;
      for (const el of allTextLines) {
        const txt = (el.textContent || "").toLowerCase();
        if (txt.includes(q)) {
          el.classList.add("tmch-match");
          if (!firstMatchEl) firstMatchEl = el;
        }
      }
  
      if (firstMatchEl) {
        const container = ui.body;
        const cRect = container.getBoundingClientRect();
        const tRect = firstMatchEl.getBoundingClientRect();
        const offsetTopWithin = (tRect.top - cRect.top) + container.scrollTop;
        container.scrollTo({ top: Math.max(0, offsetTopWithin - 20), behavior: "smooth" });
      }
    }
  
    /**********************************************************************
     * Panel: Drag / Resize / Geometry
     **********************************************************************/
    function applyPanelGeometryFromState() {
      const panel = ui.panel;
  
      panel.style.width = clamp(state.w, 260, 720) + "px";
      panel.style.height = clamp(state.h, 220, 900) + "px";
  
      if (state.x == null || state.y == null) {
        panel.style.left = "";
        panel.style.top = "80px";
        panel.style.right = "24px";
        panel.style.bottom = "";
      } else {
        panel.style.right = "";
        panel.style.bottom = "";
        panel.style.left = state.x + "px";
        panel.style.top = state.y + "px";
      }
  
      ui.setCollapsed(state.collapsed);
      ui.setViewMode(state.viewMode);
      ui.setScrollMode(state.scrollMode);
      ui.setAutoScroll(state.autoScroll);
      ui.setSwapLines(state.swapLines);
      ui.setSearchOpen(state.searchOpen);
      ui.setMapMode(state.mapMode);
    }
  
    function clamp(n, a, b) {
      n = Number(n);
      if (Number.isNaN(n)) return a;
      return Math.max(a, Math.min(b, n));
    }
  
    // Drag move
    (() => {
      const header = ui.header;
      const panel = ui.panel;
  
      let dragging = false;
      let startX = 0, startY = 0;
      let startLeft = 0, startTop = 0;
  
      header.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        if (e.target && e.target.closest && e.target.closest(".tmch-btn")) return;
  
        dragging = true;
        const rect = panel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
  
        panel.style.left = rect.left + "px";
        panel.style.top = rect.top + "px";
        panel.style.right = "";
        panel.style.bottom = "";
  
        e.preventDefault();
      });
  
      window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const nx = clamp(startLeft + dx, 0, window.innerWidth - 80);
        const ny = clamp(startTop + dy, 0, window.innerHeight - 40);
        panel.style.left = nx + "px";
        panel.style.top = ny + "px";
      });
  
      window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        const rect = panel.getBoundingClientRect();
        state.x = Math.round(rect.left);
        state.y = Math.round(rect.top);
        saveState();
      });
  
      header.addEventListener("dblclick", (e) => {
        if (e.target && e.target.closest && e.target.closest(".tmch-btn")) return;
  
        if (!state.collapsed) {
          const rect = panel.getBoundingClientRect();
          state.w = Math.round(rect.width);
          state.h = Math.round(rect.height);
        }
  
        state.collapsed = !state.collapsed;
        ui.setCollapsed(state.collapsed);
        saveState();
      });
    })();
  
    // Resize (fixed: handle is on top + last in DOM)
    (() => {
      const handle = ui.resizeHandle;
      const panel = ui.panel;
  
      let resizing = false;
      let startX = 0, startY = 0;
      let startW = 0, startH = 0;
  
      handle.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        resizing = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        startW = rect.width;
        startH = rect.height;
        e.preventDefault();
        e.stopPropagation();
      });
  
      window.addEventListener("mousemove", (e) => {
        if (!resizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const w = clamp(startW + dx, 260, 720);
        const h = clamp(startH + dy, 220, 900);
        panel.style.width = w + "px";
        panel.style.height = h + "px";
      });
  
      window.addEventListener("mouseup", () => {
        if (!resizing) return;
        resizing = false;
        const rect = panel.getBoundingClientRect();
        state.w = Math.round(rect.width);
        state.h = Math.round(rect.height);
        saveState();
      });
    })();
  
    /**********************************************************************
     * Initial render
     **********************************************************************/
    renderAll();
    ui.setStatus("等待加载字幕（仅本地）…");
  
    /**********************************************************************
     * UI Builder
     **********************************************************************/
    function createUI() {
      const panel = document.createElement("div");
      panel.className = "tmch-panel";
  
      const header = document.createElement("div");
      header.className = "tmch-header";
  
      const title = document.createElement("div");
      title.className = "tmch-title";
      title.textContent = "字幕悬浮窗（本地字幕）";
  
      const spacer = document.createElement("div");
      spacer.className = "tmch-spacer";
  
      const btnCollapse = mkBtn("➖", "折叠/展开");
  
      const status = document.createElement("div");
      status.style.fontSize = "10px";
      status.style.opacity = ".85";
      status.style.marginLeft = "4px";
      status.style.whiteSpace = "nowrap";
      status.textContent = "";
  
      header.appendChild(title);
      header.appendChild(spacer);
      header.appendChild(btnCollapse);
      header.appendChild(status);
  
      const toolbar = document.createElement("div");
      toolbar.className = "tmch-toolbar";
  
      const btnPick = mkBtn("📁 加载字幕", "选择本地字幕文件（SRT/VTT）");
      const btnClear = mkBtn("🧹 清空", "清空已加载字幕");
      const btnView = mkBtn("📋/📄", "切换：列表/文章视图");
      const btnPos = mkBtn("🎯/⬆️", "切换：居中/顶部定位");
      const btnAuto = mkBtn("🔄/⏸️", "自动滚动：开/关");
      const btnSearch = mkBtn("🔍", "搜索");
      const btnBlurZh = mkBtn("中 模糊/显", "中文全局模糊/显示（仅双语）");
      const btnBlurEn = mkBtn("英 模糊/显", "英文全局模糊/显示（仅双语）");
      const btnSwap = mkBtn("↕️ 交换", "交换双语上下行");
      const btnMap = mkBtn("中英识别", "切换中文行识别：自动 / 上=中 / 下=中");
  
      toolbar.appendChild(btnPick);
      toolbar.appendChild(btnClear);
      toolbar.appendChild(btnView);
      toolbar.appendChild(btnPos);
      toolbar.appendChild(btnAuto);
      toolbar.appendChild(btnSearch);
      toolbar.appendChild(btnBlurZh);
      toolbar.appendChild(btnBlurEn);
      toolbar.appendChild(btnSwap);
      toolbar.appendChild(btnMap);
  
      const searchWrap = document.createElement("div");
      searchWrap.className = "tmch-search";
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "搜索字幕内容…";
      searchWrap.appendChild(searchInput);
  
      const body = document.createElement("div");
      body.className = "tmch-body";
  
      // drop overlay
      const dropOverlay = document.createElement("div");
      dropOverlay.className = "tmch-dropOverlay";
      dropOverlay.textContent = "拖拽字幕文件到这里（SRT/VTT）";
  
      // hidden file input
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".srt,.vtt,text/vtt,text/plain";
      fileInput.style.display = "none";
  
      // resize handle (append LAST to stay on top)
      const resizeHandle = document.createElement("div");
      resizeHandle.className = "tmch-resize";
  
      panel.appendChild(header);
      panel.appendChild(toolbar);
      panel.appendChild(searchWrap);
      panel.appendChild(body);
      panel.appendChild(fileInput);
      panel.appendChild(dropOverlay);
      panel.appendChild(resizeHandle);
  
      const api = {
        panel,
        header,
        body,
        resizeHandle,
        showDropOverlay(show) { dropOverlay.classList.toggle("show", !!show); },
        setStatus(msg) { status.textContent = msg || ""; },
        clearBody() { body.innerHTML = ""; },
        renderHint(html) {
          const hint = document.createElement("div");
          hint.className = "tmch-hint";
          hint.innerHTML = html;
          body.appendChild(hint);
        },
        setCollapsed(collapsed) {
          const isCollapsed = !!collapsed;
          panel.classList.toggle("tmch-collapsed", isCollapsed);
          btnCollapse.textContent = isCollapsed ? "➕" : "➖";
  
          if (isCollapsed) {
            const h = Math.ceil(header.getBoundingClientRect().height || 40);
            panel.style.height = h + "px";
          } else {
            panel.style.height = clamp(state.h, 220, 900) + "px";
          }
        },
        setViewMode(mode) { btnView.textContent = mode === "list" ? "📋 列表" : "📄 文章"; },
        setScrollMode(mode) { btnPos.textContent = mode === "center" ? "🎯 居中" : "⬆️ 顶部"; },
        setAutoScroll(on) { btnAuto.textContent = on ? "🔄 跟随" : "⏸️ 停止"; },
        setSwapLines(on) { btnSwap.textContent = on ? "↕️ 已交换" : "↕️ 交换"; },
        setSearchOpen(open) { searchWrap.classList.toggle("open", !!open); },
        focusSearch() { searchInput.focus(); },
        getSearchValue() { return searchInput.value || ""; },
        setMapMode(mode) {
          if (mode === "auto") btnMap.textContent = "中英：自动";
          else if (mode === "AisZh") btnMap.textContent = "中英：上=中";
          else btnMap.textContent = "中英：下=中";
        },
        onToggleCollapse(fn) {
          btnCollapse.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
        },
        onPickFile(fn) {
          btnPick.addEventListener("click", () => fileInput.click());
          fileInput.addEventListener("change", async () => {
            const f = fileInput.files && fileInput.files[0];
            fileInput.value = "";
            await fn(f);
          });
        },
        onClear(fn) { btnClear.addEventListener("click", fn); },
        onToggleView(fn) { btnView.addEventListener("click", fn); },
        onToggleScrollMode(fn) { btnPos.addEventListener("click", fn); },
        onToggleAutoScroll(fn) { btnAuto.addEventListener("click", fn); },
        onToggleSearch(fn) { btnSearch.addEventListener("click", fn); },
        onGlobalBlurZh(fn) { btnBlurZh.addEventListener("click", fn); },
        onGlobalBlurEn(fn) { btnBlurEn.addEventListener("click", fn); },
        onSwapLines(fn) { btnSwap.addEventListener("click", fn); },
        onCycleMapMode(fn) { btnMap.addEventListener("click", fn); },
        onSearchInput(fn) { searchInput.addEventListener("input", () => fn(searchInput.value || "")); },
      };
  
      return api;
  
      function mkBtn(text, titleText) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tmch-btn";
        b.textContent = text;
        b.title = titleText || "";
        return b;
      }
    }
  })();