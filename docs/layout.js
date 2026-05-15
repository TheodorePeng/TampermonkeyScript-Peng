/**
 * TampermonkeyScript-Peng — Layout Framework
 *
 * Responsibilities:
 *   1. Render left sidebar navigation from window.SCRIPTS_CATALOG
 *   2. Render right TOC from page headings
 *   3. Render homepage script index (when on index.html)
 *   4. Scroll-spy, mobile menu, back-to-top
 *
 * Depends on: scripts-data.js (must be loaded before this file)
 */
(function () {
  'use strict';

  const DATA = window.SCRIPTS_CATALOG || [];
  const currentPath = location.pathname;
  const isHome =
    /index\.html$/.test(currentPath) ||
    currentPath === '/' ||
    currentPath.endsWith('/docs/');

  /* ========== 1. Left Sidebar ========== */
  function renderSidebar() {
    const sidebar = document.querySelector('.doc-sidebar-left');
    if (!sidebar) return;

    // Home link
    const homeSection = document.createElement('div');
    homeSection.className = 'sidebar-section';
    homeSection.innerHTML = `
      <ul class="sidebar-pages">
        <li><a href="${isHome ? '#' : 'index.html'}" class="${isHome ? 'active' : ''}">首页</a></li>
      </ul>
    `;
    sidebar.appendChild(homeSection);

    // Categories
    DATA.forEach((cat) => {
      const section = document.createElement('div');
      section.className = 'sidebar-section';

      const hasActive = cat.pages.some((p) => currentPath.includes(p.file));
      if (!hasActive) section.classList.add('collapsed');

      section.innerHTML = `
        <div class="sidebar-section-title">
          <span class="sidebar-toggle-icon">▼</span>
          ${escapeHtml(cat.title)}
        </div>
        <ul class="sidebar-pages">
          ${cat.pages
            .map(
              (p) =>
                `<li><a href="${isHome ? '' : '../'}${p.file}" class="${currentPath.includes(p.file) ? 'active' : ''}">${escapeHtml(p.name)}</a></li>`
            )
            .join('')}
        </ul>
      `;

      section.querySelector('.sidebar-section-title').addEventListener('click', () => {
        section.classList.toggle('collapsed');
      });

      sidebar.appendChild(section);
    });
  }

  /* ========== 2. Right TOC ========== */
  function renderTOC() {
    const tocContainer = document.querySelector('.doc-sidebar-right');
    if (!tocContainer) return;

    const content = document.querySelector('.doc-content');
    if (!content) return;

    const headings = content.querySelectorAll('h2, h3');
    if (headings.length === 0) {
      tocContainer.style.display = 'none';
      return;
    }

    const tocList = document.createElement('ul');
    tocList.className = 'toc-list';

    headings.forEach((h, idx) => {
      if (!h.id) h.id = 'heading-' + idx;

      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.className = h.tagName === 'H3' ? 'toc-h3' : '';
      a.dataset.target = h.id;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth' });
        history.pushState(null, '', '#' + h.id);
      });
      li.appendChild(a);
      tocList.appendChild(li);
    });

    tocContainer.innerHTML = '<div class="toc-title">本页目录</div>';
    tocContainer.appendChild(tocList);

    initScrollSpy(headings);
  }

  function initScrollSpy(headings) {
    const tocLinks = document.querySelectorAll('.toc-list a');
    if (!tocLinks.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            tocLinks.forEach((l) => l.classList.remove('active'));
            const link = document.querySelector(`.toc-list a[data-target="${entry.target.id}"]`);
            if (link) link.classList.add('active');
          }
        });
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );

    headings.forEach((h) => observer.observe(h));
  }

  /* ========== 3. Homepage Script Index ========== */
  function renderHomepage() {
    if (!isHome) return;
    const container = document.getElementById('scripts-index');
    if (!container) return;

    DATA.forEach((cat) => {
      const section = document.createElement('div');
      section.className = 'category';
      section.id = cat.id;

      const title = document.createElement('div');
      title.className = 'category-title';
      title.textContent = cat.title;
      section.appendChild(title);

      const list = document.createElement('ul');
      list.className = 'script-list';

      cat.pages.forEach((p) => {
        const li = document.createElement('li');
        li.className = 'script-list-item';
        li.innerHTML = `
          <a href="${p.file}">${escapeHtml(p.name)}</a>
          <div class="script-list-desc">${escapeHtml(p.desc)}</div>
          <div class="script-meta-inline">适用：${escapeHtml(p.sites)} · 版本 ${escapeHtml(p.version)}</div>
        `;
        list.appendChild(li);
      });

      section.appendChild(list);
      container.appendChild(section);
    });
  }

  /* ========== 4. Mobile Menu ========== */
  function initMobileMenu() {
    const hamburger = document.querySelector('.hamburger');
    const sidebar = document.querySelector('.doc-sidebar-left');
    if (!hamburger || !sidebar) return;

    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      document.body.appendChild(overlay);
    }

    function openMenu() {
      sidebar.classList.add('open');
      overlay.classList.add('active');
    }
    function closeMenu() {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    }

    hamburger.addEventListener('click', () => {
      sidebar.classList.contains('open') ? closeMenu() : openMenu();
    });
    overlay.addEventListener('click', closeMenu);

    sidebar.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        if (window.innerWidth <= 767) closeMenu();
      });
    });
  }

  /* ========== 5. Back to Top ========== */
  function initBackToTop() {
    const btn = document.querySelector('.back-to-top');
    if (!btn) return;

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', () => {
      btn.classList.toggle('visible', window.scrollY > 500);
    });
  }

  /* ========== Utility ========== */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ========== Bootstrap ========== */
  document.addEventListener('DOMContentLoaded', () => {
    renderSidebar();
    renderTOC();
    renderHomepage();
    initMobileMenu();
    initBackToTop();
  });
})();
