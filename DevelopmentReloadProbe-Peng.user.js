// ==UserScript==
// @name         Peng Local Reload Probe (Test Only)
// @namespace    peng-local-reload-probe-20261008
// @version      1.0.2
// @description  Harmless local-development reload probe; displays a revision on example.com only.
// @match        https://example.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    none
// @downloadURL  none
// ==/UserScript==

(function () {
  'use strict';
  const revision = 'probe-C-20261008';
  document.querySelector('[data-peng-reload-probe]')?.remove();
  const marker = document.createElement('aside');
  marker.dataset.pengReloadProbe = revision;
  marker.textContent = `Peng reload test: ${revision}`;
  Object.assign(marker.style, {
    position: 'fixed', bottom: '16px', right: '16px', zIndex: '2147483647',
    padding: '12px 16px', background: '#17324d', color: '#fff',
    borderRadius: '8px', font: '14px system-ui',
  });
  document.body.append(marker);
})();
