// ==UserScript==
// @name         GetShareNoteAutoPublisher
// @namespace    https://github.com/peng
// @version      0.1.0
// @description  在得到大脑私有笔记页一键打预设标签 + 公开分享并打开新 Tab。仅 @match /mine/notes/*，不影响公开页旧脚本。
// @author       peng
// @match        https://www.biji.com/mine/notes/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // 硬编码测试标签（按需修改）
  const TAGS = ['auto-share-2026', 'biji-mine'];

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

  // 触发"添加标签" popover（如果还没开）
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

  // 读取当前笔记已添加的标签文本
  function getCurrentTags() {
    return [...document.querySelectorAll('.n-tag.note-tag-item')]
      .map((el) => el.textContent.trim())
      .filter(Boolean);
  }

  // 添加单个 tag（若已存在则跳过）
  async function addOneTag(tag) {
    const current = getCurrentTags();
    if (current.includes(tag)) return { tag, status: 'exists' };

    await openTagPopoverIfNeeded();
    const input = await waitFor(
      () => document.querySelector('.n-popover.tag-popover input[placeholder="输入标签名"]'),
      { timeoutMs: 3000 },
    );
    input.focus();

    // 用 native setter 写值（兼容 React/Vue 受控组件）
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, tag);
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Enter → 弹出"创建标签..."选项
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

    // 等候两条路径之一：
    //  (a) .add-tag — 用户 tag 库里没有，需要创建
    //  (b) .tag-item (text === tag) — 用户 tag 库里已有，直接复用
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

    // 等 tag chip 出现在笔记上
    await waitFor(
      () => getCurrentTags().includes(tag),
      { timeoutMs: 3000 },
    );
    return { tag, status: 'added' };
  }

  async function addTags() {
    const log = [];
    for (const tag of TAGS) {
      log.push(await addOneTag(tag));
    }
    return log;
  }

  // ---------- 流程 2：公开分享 ----------
  async function sharePublic() {
    // 1. 找工具栏的分享按钮
    const shareBtn = [...document.querySelectorAll('button')].find((b) => {
      const label = b.querySelector('.btn-label');
      return label && label.textContent.trim() === '分享';
    });
    if (!shareBtn) throw new Error('工具栏分享按钮未找到');
    shareBtn.click();

    // 2. 等 share popover 出现
    await waitFor(
      () => document.querySelector('.n-popover.share-popover'),
      { timeoutMs: 3000 },
    );

    // 3. 点"公开"选项
    const publicOpt = [...document.querySelectorAll('.n-popover.share-popover .share-options-item')].find(
      (el) => el.querySelector('.item-text')?.textContent?.trim() === '公开',
    );
    if (!publicOpt) throw new Error('公开选项未找到');
    publicOpt.click();

    // 4. 等 URL 生成（input.value 变成 https://www.biji.com/note/share_note/...）
    const url = await waitFor(() => {
      const v = document.querySelector('.n-popover.share-popover input.n-input__input-el')?.value;
      return v && /^https:\/\/www\.biji\.com\/note\/share_note\//.test(v) ? v : null;
    }, { timeoutMs: 5000 });

    return url;
  }

  // ---------- 主入口 ----------
  function injectButton() {
    if (document.getElementById('gsap-trigger-btn')) return;
    const btn = document.createElement('div');
    btn.id = 'gsap-trigger-btn';
    btn.textContent = '🏷️➤ 一键公开';
    btn.style.cssText = [
      'position: fixed',
      'right: 20px',
      'bottom: 20px',
      'z-index: 2147483647',
      'padding: 10px 14px',
      'background: #1677ff',
      'color: #fff',
      'font-size: 14px',
      'border-radius: 6px',
      'cursor: pointer',
      'box-shadow: 0 4px 12px rgba(0,0,0,.2)',
      'user-select: none',
      'font-family: -apple-system, BlinkMacSystemFont, sans-serif',
    ].join(';');
    btn.addEventListener('click', async () => {
      if (btn.dataset.busy === '1') return;
      btn.dataset.busy = '1';
      btn.textContent = '处理中…';
      try {
        const tagLog = await addTags();
        console.log('[GetShareNoteAutoPublisher] tags:', tagLog);
        const url = await sharePublic();
        console.log('[GetShareNoteAutoPublisher] share url:', url);
        if (url) window.open(url, '_blank');
        btn.textContent = '✅ 完成';
      } catch (e) {
        console.error('[GetShareNoteAutoPublisher] failed:', e);
        btn.textContent = '❌ 失败（看 console）';
      } finally {
        delete btn.dataset.busy;
      }
    });
    document.body.appendChild(btn);
  }

  injectButton();
})();
