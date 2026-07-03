// ==UserScript==
// @name         GetShareNoteAutoPublisher
// @namespace    https://github.com/peng
// @version      0.1.3
// @description  在得到大脑私有笔记页单击小图标直接打标签 + 公开分享并打开新 Tab；右键图标进入设置。v0.1.3：新 Tab 自动点「导出 Notion」（复用旧 notion-exporter 按钮）。
// @author       peng
// @match        https://www.biji.com/mine/notes/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/GetShareNoteAutoPublisher.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/GetShareNoteAutoPublisher.user.js
// ==/UserScript==

// v0.1.3: 新 Tab 自动点「导出 Notion」按钮（事件驱动跨 tab 访问）

(() => {
  'use strict';

  // ---------- 默认设置 & 持久化 ----------
  const STORAGE_KEY = 'gsap_settings_v1';
  const DEFAULT_SETTINGS = {
    addTags: true,
    sharePublic: true,
    addAutoExport: true,
    tags: 'auto-share-2026\nbiji-mine',
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (_) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (_) {
      /* 隐私模式可能写失败，忽略 */
    }
  }

  function parseTags(str) {
    return [...new Set(
      (str || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
    )];
  }

  // ---------- 工具函数 ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(predicate, { timeoutMs = 5000, intervalMs = 100 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await predicate();
      if (result) return result;
      await sleep(intervalMs);
    }
    throw new Error('waitFor: timeout');
  }

  // ---------- 流程 1：添加标签 ----------
  async function openTagPopoverIfNeeded() {
    const existing = document.querySelector('.n-popover.tag-popover');
    if (existing && existing.offsetWidth > 0) return existing;
    const trigger = document.querySelector('div.n-tag.note-tag-add');
    if (!trigger) throw new Error('添加标签入口未找到');
    trigger.click();
    return waitFor(
      () => document.querySelector('.n-popover.tag-popover input[placeholder="输入标签名"]'),
      { timeoutMs: 3000 },
    );
  }

  function getCurrentTags() {
    return [...document.querySelectorAll('.n-tag.note-tag-item')]
      .map((el) => el.textContent.trim())
      .filter(Boolean);
  }

  async function addOneTag(tag) {
    const current = getCurrentTags();
    if (current.includes(tag)) return { tag, status: 'exists' };

    await openTagPopoverIfNeeded();
    const input = await waitFor(
      () => document.querySelector('.n-popover.tag-popover input[placeholder="输入标签名"]'),
      { timeoutMs: 3000 },
    );
    input.focus();

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, tag);
    input.dispatchEvent(new Event('input', { bubbles: true }));

    ['keydown', 'keypress', 'keyup'].forEach((type) => {
      input.dispatchEvent(
        new KeyboardEvent(type, {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    const pick = await waitFor(() => {
      const popover = document.querySelector('.n-popover.tag-popover');
      if (!popover) return null;
      const createNew = popover.querySelector('.add-tag');
      if (createNew) return { kind: 'create', el: createNew };
      const existing = [...popover.querySelectorAll('.tag-item .text')].find(
        (el) => el.textContent.trim() === tag,
      );
      if (existing) return { kind: 'existing', el: existing.closest('.tag-item') || existing };
      return null;
    }, { timeoutMs: 3000 });
    pick.el.click();

    await waitFor(
      () => getCurrentTags().includes(tag),
      { timeoutMs: 3000 },
    );
    // 关闭 tag popover：再点一次 .n-tag.note-tag-add 触发 toggle 关闭
    const trigger = document.querySelector('div.n-tag.note-tag-add');
    if (trigger) trigger.click();
    return { tag, status: 'added', path: pick.kind };
  }

  async function addTags(tags) {
    const log = [];
    for (const tag of tags) {
      log.push(await addOneTag(tag));
    }
    return log;
  }

  // ---------- 流程 2：公开分享 ----------
  async function sharePublic() {
    const shareBtn = [...document.querySelectorAll('button')].find((b) => {
      const label = b.querySelector('.btn-label');
      return label && label.textContent.trim() === '分享';
    });
    if (!shareBtn) throw new Error('工具栏分享按钮未找到');
    shareBtn.click();

    await waitFor(
      () => document.querySelector('.n-popover.share-popover'),
      { timeoutMs: 3000 },
    );

    const publicOpt = [...document.querySelectorAll('.n-popover.share-popover .share-options-item')].find(
      (el) => el.querySelector('.item-text')?.textContent?.trim() === '公开',
    );
    if (!publicOpt) throw new Error('公开选项未找到');
    publicOpt.click();

    const url = await waitFor(() => {
      const v = document.querySelector('.n-popover.share-popover input.n-input__input-el')?.value;
      return v && /^https:\/\/www\.biji\.com\/note\/share_note\//.test(v) ? v : null;
    }, { timeoutMs: 5000 });

    // 关闭 share popover：直接隐藏（实测 Esc / body.click / 再点分享 都不关）
    const sharePopover = document.querySelector('.n-popover.share-popover');
    if (sharePopover) sharePopover.style.display = 'none';

    return url;
  }

  // ---------- 新 Tab 自动点「导出 Notion」按钮（复用 GetShareNoteNotionExporter 注入的 #get-share-note-exporter-button） ----------
  async function autoClickExportButton(newTab) {
    if (!newTab) return { ok: false, reason: 'no tab' };
    // 阶段 1：等新 tab readyState=complete（不阻塞太久，5s 兜底）
    await waitFor(() => {
      try { return newTab.document && newTab.document.readyState === 'complete'; }
      catch (_) { return false; }
    }, { timeoutMs: 5000, intervalMs: 100 });
    // 阶段 2：等 #get-share-note-exporter-button 出现（实测 < 100ms，慢网 5s 兜底）
    const btn = await waitFor(() => {
      try { return newTab.document.getElementById('get-share-note-exporter-button'); }
      catch (_) { return null; }
    }, { timeoutMs: 5000, intervalMs: 100 });
    if (!btn) return { ok: false, reason: 'button not found' };
    try {
      btn.click();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e) };
    }
  }

  // ---------- 主流程（按 settings 执行） ----------
  let isRunning = false;

  async function runFromSettings() {
    if (isRunning) return;
    isRunning = true;
    try {
      const settings = loadSettings();
      const tags = parseTags(settings.tags);
      const result = { addTags: null, sharePublic: null };

      if (settings.addTags && tags.length > 0) {
        result.addTags = await addTags(tags);
      } else {
        result.addTags = { skipped: true, reason: settings.addTags ? 'no tags' : 'disabled' };
      }

      if (settings.sharePublic) {
        const url = await sharePublic();
        result.sharePublic = { url };
        if (url) {
          const newTab = window.open(url, '_blank');
          // 新 Tab 自动点「导出 Notion」（异步、不阻塞主流程 ✅ 反馈）
          if (newTab && settings.addAutoExport) {
            autoClickExportButton(newTab)
              .then((r) => {
                if (!r.ok) console.warn('[GSAP] auto-click skipped:', r.reason);
                else console.log('[GSAP] auto-clicked 导出 Notion');
              })
              .catch((e) => console.warn('[GSAP] auto-click failed:', e));
          }
        }
      } else {
        result.sharePublic = { skipped: true };
      }

      console.log('[GSAP] done:', result);
      // 标签记忆：若 addTags 实际跑了，把 effective settings（含 tag 列表）写回 localStorage
      // 首次跑用 default 的 tag，跑完后 localStorage 就有这组 tag；下次直接复用
      if (settings.addTags && tags.length > 0) {
        saveSettings({
          addTags: settings.addTags,
          sharePublic: settings.sharePublic,
          addAutoExport: settings.addAutoExport,
          tags: tags.join('\n'),
        });
      }
      flashTrigger('success');
      return result;
    } catch (e) {
      console.error('[GSAP] failed:', e);
      flashTrigger('error');
      throw e;
    } finally {
      isRunning = false;
    }
  }

  // ---------- 浮动小图标按钮 ----------
  function mountTrigger() {
    if (document.getElementById('gsap-trigger-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'gsap-trigger-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'GetShareNote AutoPublisher 设置');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>
        <polyline points="16 6 12 2 8 6"/>
        <line x1="12" y1="2" x2="12" y2="15"/>
      </svg>
    `;
    btn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;width:28px;height:28px;padding:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.6);color:#292D34;border:1px solid rgba(0,0,0,0.06);border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.08);cursor:pointer;opacity:0.35;transition:opacity .2s ease, transform .2s ease, box-shadow .2s ease;user-select:none;font:inherit';
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.95'; btn.style.transform = 'scale(1.1)'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.35'; btn.style.transform = 'scale(1)'; });
    btn.addEventListener('focus', () => { btn.style.opacity = '0.95'; });
    btn.addEventListener('blur', () => { btn.style.opacity = '0.35'; });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      runFromSettings();
    });
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showPopover();
    });
    btn.setAttribute('title', '左键：运行  ·  右键：设置');
    document.body.appendChild(btn);
  }

  function flashTrigger(kind) {
    const btn = document.getElementById('gsap-trigger-btn');
    if (!btn) return;
    const orig = getComputedStyle(btn).borderColor;
    btn.style.borderColor = kind === 'success' ? '#52c41a' : '#ff4d4f';
    btn.style.opacity = '0.95';
    setTimeout(() => {
      btn.style.borderColor = orig;
      btn.style.opacity = '0.35';
    }, 1200);
  }

  // ---------- 设置面板 ----------
  let popoverOpen = false;
  let popoverEl = null;

  function ensurePopover() {
    if (popoverEl) return popoverEl;
    popoverEl = document.createElement('div');
    popoverEl.id = 'gsap-settings-popover';
    popoverEl.setAttribute('role', 'dialog');
    popoverEl.setAttribute('aria-label', 'GetShareNote AutoPublisher 设置');
    popoverEl.style.cssText = 'position:fixed;z-index:2147483647;width:280px;padding:12px;background:#ffffff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#292D34;display:none';
    popoverEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <strong style="font-size:13px;">设置</strong>
        <button type="button" data-action="close" aria-label="关闭" style="background:transparent;border:0;cursor:pointer;font-size:16px;line-height:1;padding:0 2px;color:#8A8F99;">×</button>
      </div>
      <label style="display:flex;align-items:center;gap:6px;margin:6px 0;cursor:pointer;">
        <input type="checkbox" data-key="addTags"> 添加标签
      </label>
      <label style="display:flex;align-items:center;gap:6px;margin:6px 0;cursor:pointer;">
        <input type="checkbox" data-key="sharePublic"> 公开分享并打开新 Tab
      </label>
      <label style="display:flex;align-items:center;gap:6px;margin:6px 0;cursor:pointer;">
        <input type="checkbox" data-key="addAutoExport"> 新 Tab 自动点「导出 Notion」
      </label>
      <div style="margin:8px 0 4px;">标签（每行一个或逗号分隔）</div>
      <textarea data-key="tags" rows="3" placeholder="auto-share-2026&#10;biji-mine" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #d9d9d9;border-radius:4px;resize:vertical;font:inherit;color:inherit;background:#fff;"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
        <button type="button" data-action="save" style="background:transparent;border:1px solid #d9d9d9;padding:6px 12px;border-radius:4px;cursor:pointer;font:inherit;color:inherit;">保存</button>
        <button type="button" data-action="run" style="background:#1677ff;color:#fff;border:0;padding:6px 14px;border-radius:4px;cursor:pointer;font:inherit;">运行</button>
      </div>
      <div style="margin-top:8px;font-size:11px;color:#8A8F99;">v0.1.1 · 设置自动保存到 localStorage</div>
    `;
    popoverEl.addEventListener('click', (e) => e.stopPropagation());
    popoverEl.addEventListener('input', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const key = t.getAttribute('data-key');
      if (!key) return;
      const cur = loadSettings();
      if (t.type === 'checkbox') cur[key] = t.checked;
      else cur[key] = t.value;
      saveSettings(cur);
    });
    popoverEl.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const action = t.getAttribute('data-action');
      if (action === 'close' || action === 'save') {
        hidePopover();
      } else if (action === 'run') {
        hidePopover();
        runFromSettings();
      }
    });
    document.body.appendChild(popoverEl);
    return popoverEl;
  }

  function positionPopover() {
    if (!popoverEl) return;
    const btn = document.getElementById('gsap-trigger-btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const popW = popoverEl.offsetWidth || 280;
    const popH = popoverEl.offsetHeight || 240;
    // 出现在图标左上方 8px 处
    let left = r.right - popW;
    let top = r.top - popH - 8;
    // 兜底：超出视口则反向
    if (top < 8) top = r.bottom + 8;
    if (left < 8) left = 8;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    popoverEl.style.left = `${left}px`;
    popoverEl.style.top = `${top}px`;
  }

  function showPopover() {
    const p = ensurePopover();
    const cur = loadSettings();
    p.querySelector('[data-key="addTags"]').checked = !!cur.addTags;
    p.querySelector('[data-key="sharePublic"]').checked = !!cur.sharePublic;
    p.querySelector('[data-key="addAutoExport"]').checked = !!cur.addAutoExport;
    p.querySelector('[data-key="tags"]').value = cur.tags || '';
    p.style.display = 'block';
    popoverOpen = true;
    positionPopover();
  }

  function hidePopover() {
    if (popoverEl) popoverEl.style.display = 'none';
    popoverOpen = false;
  }

  function togglePopover() {
    popoverOpen ? hidePopover() : showPopover();
  }

  // 全局 click / Esc 关闭
  document.addEventListener('click', (e) => {
    if (!popoverOpen) return;
    const t = e.target;
    if (t instanceof Node && popoverEl && popoverEl.contains(t)) return;
    if (t instanceof Node && document.getElementById('gsap-trigger-btn')?.contains(t)) return;
    hidePopover();
  });
  document.addEventListener('keydown', (e) => {
    if (popoverOpen && e.key === 'Escape') hidePopover();
  });
  window.addEventListener('resize', () => { if (popoverOpen) positionPopover(); });

  // ---------- 启动 ----------
  mountTrigger();
})();
