// ==UserScript==
// @name         EudicTingMarkdownExporter
// @namespace    http://tampermonkey.net/
// @version      0.2.0
// @description  Export Daily English Listening article sentences as Obsidian/Eudic note example Markdown with per-sentence source links.
// @author       TheodorePeng
// @match        https://ting.eudic.net/webting/*
// @match        https://dict.eudic.net/webting/*
// @match        https://cn.eudic.net/ting/openArticle*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/EudicTingMarkdownExporter.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/EudicTingMarkdownExporter.user.js
// ==/UserScript==

(function () {
    'use strict';

    const APP_ID = 'eudic-ting-md-exporter';
    const SOURCE_BASE_URL = 'https://cn.eudic.net/ting/openArticle';
    const BROWSER_ARTICLE_BASE_URL = 'https://ting.eudic.net/webting/desktopplay';
    const DOWNLOAD_MIME_TYPE = 'text/markdown;charset=utf-8';
    const LOG_PREFIX = '[EudicTingMarkdownExporter]';

    const state = {
        modal: null,
        textarea: null,
        status: null,
        sourceLabelInput: null,
        sourceLabelOverride: '',
        sourceLabelManuallyEdited: false,
        lastAutoSourceLabel: '',
        currentArticleId: '',
        skipMeta: true,
        includeEgPrefix: true,
        blankLineBetween: true,
    };

    const STORAGE_KEYS = {
        skipMeta: `${APP_ID}_skipMeta`,
        includeEgPrefix: `${APP_ID}_includeEgPrefix`,
        blankLineBetween: `${APP_ID}_blankLineBetween`,
    };

    function loadPersistedState() {
        try {
            state.skipMeta = GM_getValue(STORAGE_KEYS.skipMeta, true);
            state.includeEgPrefix = GM_getValue(STORAGE_KEYS.includeEgPrefix, true);
            state.blankLineBetween = GM_getValue(STORAGE_KEYS.blankLineBetween, true);
        } catch (error) {
            console.warn(LOG_PREFIX, 'Failed to load persisted state:', error);
        }
    }

    function persistState(key, value) {
        try {
            GM_setValue(STORAGE_KEYS[key], value);
        } catch (error) {
            console.warn(LOG_PREFIX, 'Failed to persist state:', error);
        }
    }

    loadPersistedState();

    GM_registerMenuCommand('Export Eudic Ting examples as Markdown', openPreview);
    injectStyles();
    mountFloatingButton();

    function mountFloatingButton() {
        if (document.getElementById(`${APP_ID}-button`)) return;

        const button = document.createElement('button');
        button.id = `${APP_ID}-button`;
        button.type = 'button';
        button.textContent = '导出例句 MD';
        button.title = '将每日英语听力当前文章导出为 Eudic 词条例句 Markdown';
        button.addEventListener('click', openPreview);
        document.documentElement.appendChild(button);
    }

    function openPreview() {
        if (!state.modal) {
            state.modal = buildModal();
            document.documentElement.appendChild(state.modal);
        }

        syncAutoSourceLabelInput();
        state.modal.hidden = false;
        refreshPreview();
    }

    function buildModal() {
        const overlay = document.createElement('div');
        overlay.id = `${APP_ID}-modal`;

        const panel = document.createElement('section');
        panel.className = `${APP_ID}-panel`;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Eudic Ting Markdown preview');

        const header = document.createElement('div');
        header.className = `${APP_ID}-header`;

        const title = document.createElement('div');
        title.className = `${APP_ID}-title`;
        title.textContent = '每日英语听力例句 Markdown';

        const closeButton = makeButton('关闭', 'secondary');
        closeButton.addEventListener('click', () => {
            overlay.hidden = true;
        });

        header.append(title, closeButton);

        const sourceLabelRow = buildSourceLabelRow();

        const controls = document.createElement('div');
        controls.className = `${APP_ID}-controls`;
        controls.append(
            makeCheckbox('跳过章节标题', state.skipMeta, (checked) => {
                state.skipMeta = checked;
                persistState('skipMeta', checked);
                refreshPreview();
            }),
            makeCheckbox('添加 e.g. 前缀', state.includeEgPrefix, (checked) => {
                state.includeEgPrefix = checked;
                persistState('includeEgPrefix', checked);
                refreshPreview();
            }),
            makeCheckbox('每句之间空一行', state.blankLineBetween, (checked) => {
                state.blankLineBetween = checked;
                persistState('blankLineBetween', checked);
                refreshPreview();
            }),
        );

        const toolbar = document.createElement('div');
        toolbar.className = `${APP_ID}-toolbar`;

        const refreshButton = makeButton('刷新预览', 'secondary');
        refreshButton.addEventListener('click', refreshPreview);

        const copyButton = makeButton('复制 Markdown', 'primary');
        copyButton.addEventListener('click', copyMarkdown);

        const downloadButton = makeButton('下载 .md', 'secondary');
        downloadButton.addEventListener('click', downloadMarkdown);

        toolbar.append(refreshButton, copyButton, downloadButton);

        state.status = document.createElement('div');
        state.status.className = `${APP_ID}-status`;

        state.textarea = document.createElement('textarea');
        state.textarea.className = `${APP_ID}-textarea`;
        state.textarea.spellcheck = false;
        state.textarea.placeholder = '点击“刷新预览”生成 Markdown...';

        panel.append(header, sourceLabelRow, controls, toolbar, state.status, state.textarea);
        overlay.appendChild(panel);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) overlay.hidden = true;
        });

        return overlay;
    }

    function buildSourceLabelRow() {
        const row = document.createElement('div');
        row.className = `${APP_ID}-source-row`;

        const label = document.createElement('label');
        label.className = `${APP_ID}-source-label`;
        label.htmlFor = `${APP_ID}-source-label-input`;
        label.textContent = '出处文字';

        state.sourceLabelInput = document.createElement('input');
        state.sourceLabelInput.id = `${APP_ID}-source-label-input`;
        state.sourceLabelInput.className = `${APP_ID}-source-input`;
        state.sourceLabelInput.type = 'text';
        state.sourceLabelInput.placeholder = '自动生成，如 2012-Text1-KY';
        state.sourceLabelInput.spellcheck = false;
        state.sourceLabelInput.addEventListener('input', () => {
            state.sourceLabelManuallyEdited = true;
            state.sourceLabelOverride = state.sourceLabelInput.value;
        });
        state.sourceLabelInput.addEventListener('blur', () => {
            syncSourceLabelOverrideFromInput();
            refreshPreview();
        });
        state.sourceLabelInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                state.sourceLabelInput.blur();
            }
        });

        const autoFillButton = makeButton('自动填充', 'secondary');
        autoFillButton.addEventListener('click', () => {
            applyAutoSourceLabelToInput();
            refreshPreview();
        });

        row.append(label, state.sourceLabelInput, autoFillButton);
        return row;
    }

    function makeButton(label, variant) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.className = `${APP_ID}-btn ${APP_ID}-btn-${variant}`;
        return button;
    }

    function makeCheckbox(label, checked, onChange) {
        const wrapper = document.createElement('label');
        wrapper.className = `${APP_ID}-check`;

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.addEventListener('change', () => onChange(input.checked));

        const text = document.createElement('span');
        text.textContent = label;

        wrapper.append(input, text);
        return wrapper;
    }

    function refreshPreview() {
        try {
            syncAutoSourceLabelInput();
            syncSourceLabelOverrideFromInput();
            const result = buildMarkdownExport();
            state.textarea.value = result.markdown;
            state.status.textContent = result.message;
            state.status.dataset.state = result.lines.length > 0 ? 'ok' : 'warn';
        } catch (error) {
            console.error(LOG_PREFIX, error);
            state.textarea.value = '';
            state.status.textContent = error && error.message ? error.message : '导出失败。';
            state.status.dataset.state = 'error';
        }
    }

    function copyMarkdown() {
        syncSourceLabelOverrideFromInput();
        refreshPreview();
        const markdown = state.textarea ? state.textarea.value : '';
        if (!markdown.trim()) {
            setStatus('没有可复制的 Markdown。', 'warn');
            return;
        }

        try {
            GM_setClipboard(markdown, 'text');
            setStatus('已复制 Markdown。', 'ok');
        } catch (error) {
            console.error(LOG_PREFIX, error);
            copyWithClipboardApi(markdown);
        }
    }

    function copyWithClipboardApi(markdown) {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            setStatus('复制失败：当前浏览器不支持剪贴板 API。', 'error');
            return;
        }

        navigator.clipboard.writeText(markdown)
            .then(() => setStatus('已复制 Markdown。', 'ok'))
            .catch((error) => {
                console.error(LOG_PREFIX, error);
                setStatus('复制失败，请手动选中预览内容复制。', 'error');
            });
    }

    function downloadMarkdown() {
        syncSourceLabelOverrideFromInput();
        refreshPreview();
        const markdown = state.textarea ? state.textarea.value : '';
        if (!markdown.trim()) {
            setStatus('没有可下载的 Markdown。', 'warn');
            return;
        }

        const blob = new Blob([markdown], { type: DOWNLOAD_MIME_TYPE });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `${getDownloadFileNameBase()}.md`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        setStatus('已开始下载 Markdown。', 'ok');
    }

    function setStatus(message, kind) {
        if (!state.status) return;
        state.status.textContent = message;
        state.status.dataset.state = kind;
    }

    function buildMarkdownExport() {
        const articleId = getArticleId();
        if (!articleId) {
            throw new Error('无法从当前 URL 获取文章 id。');
        }

        const autoLabel = getAutoSourceLabel();
        const label = getEffectiveSourceLabel(autoLabel);
        const translations = getTranslationMap();
        const articleTitle = getArticleDisplayTitle();
        const articleSourceUrl = buildArticleSourceUrl(articleId);
        const sentenceNodes = Array.from(document.querySelectorAll('#article .sentence[data-starttime], .article .sentence[data-starttime]'));
        const sourceRecords = translations.sourceRecords
            .map((sourceRecord) => buildSentenceRecordFromSource(sourceRecord, articleId, label));
        const domRecords = sentenceNodes
            .map((node, index) => buildSentenceRecordFromDom(node, index, translations, articleId, label));
        const rawRecords = sourceRecords.length > 0 ? sourceRecords : domRecords;
        const records = rawRecords
            .filter((record) => shouldKeepRecord(record));
        const rawCount = rawRecords.length > 0 ? rawRecords.length : sentenceNodes.length;

        const separator = state.blankLineBetween ? '\n\n' : '\n';
        const lines = records.map((record) => record.markdown);
        const sourceLine = `[${articleTitle}](${articleSourceUrl})`;

        return {
            lines,
            markdown: lines.length > 0 ? `${sourceLine}\n\n${lines.join(separator)}` : sourceLine,
            message: buildStatusMessage(records, rawCount, label, articleTitle, autoLabel),
        };
    }

    function buildSentenceRecordFromDom(node, index, translations, articleId, label) {
        const timestamp = normalizeTimestamp(node.dataset.starttime || '');
        const english = normalizeText(node.textContent || '');
        const translation = findTranslationText(translations, timestamp, english, index);
        return buildMarkdownRecord({ timestamp, english, translation }, articleId, label);
    }

    function buildSentenceRecordFromSource(sourceRecord, articleId, label) {
        const timestamp = normalizeTimestamp(sourceRecord.timestamp);
        const english = normalizeText(sourceRecord.english);
        const translation = normalizeText(sourceRecord.translation);
        return buildMarkdownRecord({ timestamp, english, translation }, articleId, label);
    }

    function buildMarkdownRecord(record, articleId, label) {
        const timestamp = normalizeTimestamp(record.timestamp);
        const english = normalizeText(record.english);
        const translation = normalizeText(record.translation);
        const sourceUrl = buildSourceUrl(articleId, timestamp);
        const prefix = state.includeEgPrefix ? 'e.g. ' : '';
        const chinesePart = translation ? ` ${translation}` : '';

        return {
            timestamp,
            english,
            translation,
            markdown: `${prefix}${english}${chinesePart} @[${label}](${sourceUrl}) `,
        };
    }

    function shouldKeepRecord(record) {
        if (!record.timestamp || !record.english) return false;
        if (!state.skipMeta) return true;
        if (isLikelyMetaSentence(record.english)) return false;
        return true;
    }

    function isLikelyMetaSentence(text) {
        const normalized = normalizeText(text);
        return /^Section\s+[IVX]+\s+Reading\s+Comprehension\b/i.test(normalized) ||
            /^Part\s+[A-Z]\.?$/i.test(normalized) ||
            /^Text\s+\d+\b/i.test(normalized) ||
            /^文章\s*\d+$/i.test(normalized);
    }

    function buildStatusMessage(records, rawCount, label, articleTitle, autoLabel) {
        if (records.length === 0) {
            return `未生成句子。页面中检测到 ${rawCount} 个带时间戳的句子，请确认文章已加载完成。`;
        }

        const missingTranslationCount = records.filter((record) => !record.translation).length;
        const translationHint = missingTranslationCount > 0
            ? `；${missingTranslationCount} 条未提取到可复制中文翻译`
            : '';
        const labelHint = !normalizeText(state.sourceLabelOverride) && label === autoLabel
            ? '；出处文字为空时已使用自动值'
            : '';
        return `已生成 ${records.length} 条例句。标题：${articleTitle}。出处标签：${label}。每条链接使用该句开始时间${translationHint}${labelHint}。`;
    }

    function getArticleId() {
        const current = new URL(window.location.href);
        const directId = current.searchParams.get('id');
        if (directId) return directId.trim();

        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical && canonical.href) {
            try {
                const canonicalUrl = new URL(canonical.href, window.location.href);
                return (canonicalUrl.searchParams.get('id') || '').trim();
            } catch (error) {
                console.debug(LOG_PREFIX, 'Invalid canonical URL:', canonical.href, error);
            }
        }

        return '';
    }

    function buildSourceUrl(articleId, timestamp) {
        return `${SOURCE_BASE_URL}?id=${encodeURIComponent(articleId)}&timestamp=${timestamp || '00:00.00'}`;
    }

    function buildArticleSourceUrl(articleId) {
        return `${BROWSER_ARTICLE_BASE_URL}?id=${encodeURIComponent(articleId)}&st=00:00:00.00`;
    }

    function getArticleDisplayTitle() {
        const candidates = [
            getArticleTitle(),
            getCurrentPlayTitle(),
            parseTitleFromMetaDescription(),
            document.title || '',
        ].filter(Boolean);

        return chooseArticleTitleCandidate(candidates) || getAutoSourceLabel() || '每日英语听力文章';
    }

    function getDownloadFileNameBase() {
        return sanitizeFileNameForDownload(getArticleDisplayTitle()) || sanitizeFileNameForDownload(getAutoSourceLabel()) || '每日英语听力例句';
    }

    function syncAutoSourceLabelInput() {
        const articleId = getArticleId();
        const autoLabel = getAutoSourceLabel();
        const articleChanged = articleId !== state.currentArticleId;

        if (articleChanged) {
            state.currentArticleId = articleId;
            state.sourceLabelManuallyEdited = false;
        }

        const shouldFollowAuto = !state.sourceLabelManuallyEdited && autoLabel !== state.lastAutoSourceLabel;
        if (articleChanged || shouldFollowAuto) {
            applyAutoSourceLabelToInput(autoLabel);
        }
    }

    function resetSourceLabelInputIfNeeded() {
        syncAutoSourceLabelInput();
    }

    function applyAutoSourceLabelToInput(autoLabel = getAutoSourceLabel()) {
        state.sourceLabelManuallyEdited = false;
        state.lastAutoSourceLabel = autoLabel;
        state.sourceLabelOverride = autoLabel;
        if (state.sourceLabelInput) {
            state.sourceLabelInput.value = autoLabel;
        }
    }

    function syncSourceLabelOverrideFromInput() {
        if (!state.sourceLabelInput) return;
        state.sourceLabelOverride = state.sourceLabelInput.value;
    }

    function getEffectiveSourceLabel(autoLabel) {
        return normalizeText(state.sourceLabelOverride) || autoLabel || 'DailyTing';
    }

    function getAutoSourceLabel() {
        const titleCandidates = getTitleCandidates();

        for (const title of titleCandidates) {
            const kyLabel = extractKaoYanLabel(title);
            if (kyLabel) return kyLabel;
        }

        const englishTitleLabel = chooseBestSourceLabel(
            titleCandidates.map((title) => extractSpecialEnglishLabel(title)).filter(Boolean),
        );
        if (englishTitleLabel) return englishTitleLabel;

        const articleTitle = chooseArticleTitleCandidate([
            getArticleTitle(),
            getCurrentPlayTitle(),
            parseTitleFromMetaDescription(),
            document.title || '',
        ]);
        if (articleTitle) return articleTitle;

        const compactTitle = sanitizeLabel(titleCandidates[0] || 'DailyTing');
        return compactTitle || 'DailyTing';
    }

    function getTitleCandidates() {
        return uniqueNonEmpty([
            getArticleTitle(),
            getCurrentPlayTitle(),
            ...getCurrentPlayTitleCandidates(),
            ...getElementAttributeCandidates(),
            document.title || '',
            document.querySelector('meta[name="description"]')?.content || '',
        ]);
    }

    function getCurrentPlayTitle() {
        return chooseBestTitleCandidate(getCurrentPlayTitleCandidates());
    }

    function getCurrentPlayTitleCandidates() {
        const heading = Array.from(document.querySelectorAll('h2'))
            .find((node) => normalizeText(node.textContent || '') === '当前播放');
        const container = heading?.closest('div')?.parentElement;
        if (!container) return [];

        return Array.from(container.querySelectorAll('.contentInfo > p.title, .playContent > p.title, p.title'))
            .map((node) => normalizeText(node.textContent || node.getAttribute('title') || node.getAttribute('aria-label') || ''))
            .filter(isUsableArticleTitleCandidate);
    }

    function getArticleTitle() {
        return chooseArticleTitleCandidate([
            ...getStructuredArticleTitleCandidates(),
            getArticleHeadingTitle(),
        ]);
    }

    function getStructuredArticleTitleCandidates() {
        const selector = [
            '.contentInfo > p.title',
            '.playInfo .playContent > p.title',
            '#play .contentInfo p.title',
            '.contentInfo p.title',
            '.playContent p.title',
        ].join(', ');

        return Array.from(document.querySelectorAll(selector))
            .map((node) => normalizeText(node.textContent || ''))
            .filter(isUsableArticleTitleCandidate);
    }

    function getArticleHeadingTitle() {
        const articleRoot = document.getElementById('article');
        const h1 = articleRoot
            ? articleRoot.querySelector('h1')
            : Array.from(document.querySelectorAll('h1'))
                .find((node) => !node.classList.contains('logo'));
        return normalizeText(h1 ? h1.textContent || '' : '');
    }

    function parseTitleFromMetaDescription() {
        const description = document.querySelector('meta[name="description"]')?.content || '';
        const normalized = normalizeText(description).replace(/^\+?\s*/, '');
        const match = normalized.match(/^(.+?)收录在每日英语听力/);
        return normalizeText(match ? match[1] : '');
    }

    function chooseArticleTitleCandidate(candidates) {
        for (const candidate of candidates) {
            const title = normalizeArticleTitle(candidate);
            if (isUsableArticleTitleCandidate(title)) return title;
        }

        return '';
    }

    function isUsableArticleTitleCandidate(text) {
        const normalized = normalizeArticleTitle(text);
        if (!normalized) return false;
        return !/^(每日英语听力|当前播放|下载.*客户端.*|上一句.*|下一句.*|播放\/暂停.*|重复播放.*)$/i.test(normalized);
    }

    function extractKaoYanLabel(text) {
        const normalized = normalizeText(text);
        const match = normalized.match(/(\d{4})\s*Text\s*([1-4])/i);
        if (!match) return '';
        return `${match[1]}-Text${match[2]}-KY`;
    }

    function extractLeadingEnglishLabel(text) {
        const normalized = normalizeLeadingEnglishTitle(text);
        const match = normalized.match(/^[A-Za-z0-9]+(?:[ ._'’/-]+[A-Za-z0-9]+)*/);
        if (!match) return '';
        return sanitizeLabel(match[0]);
    }

    function extractSpecialEnglishLabel(text) {
        const normalized = normalizeLeadingEnglishTitle(text);
        if (!/\bS\d+E\d+\b/i.test(normalized)) return '';
        return extractLeadingEnglishLabel(normalized);
    }

    function normalizeLeadingEnglishTitle(text) {
        return normalizeText(text)
            // Normalize common episode separators so titles like
            // "Avatar S3/E05" and "Avatar S3 · E05" produce "Avatar-S3E05".
            .replace(/\b(S\d+)\s*[/.:：·•\-]\s*(E\d+)\b/gi, '$1$2')
            .replace(/\b(S\d+)\s+(E\d+)\b/gi, '$1$2');
    }

    function getElementAttributeCandidates() {
        const selector = [
            '#article h1',
            'h1',
            'h2',
            '[title]',
            '[aria-label]',
            'img[alt]',
        ].join(', ');

        return Array.from(document.querySelectorAll(selector))
            .flatMap((node) => [
                node.textContent || '',
                node.getAttribute('title') || '',
                node.getAttribute('aria-label') || '',
                node.getAttribute('alt') || '',
            ])
            .map(normalizeText)
            .filter(Boolean);
    }

    function chooseBestTitleCandidate(candidates) {
        return chooseBestSourceText(candidates) || '';
    }

    function chooseBestSourceLabel(labels) {
        return chooseBestSourceText(labels) || '';
    }

    function chooseBestSourceText(items) {
        return uniqueNonEmpty(items).sort((left, right) => {
            const leftScore = scoreSourceText(left);
            const rightScore = scoreSourceText(right);
            if (rightScore !== leftScore) return rightScore - leftScore;
            return right.length - left.length;
        })[0] || '';
    }

    function scoreSourceText(text) {
        const normalized = normalizeLeadingEnglishTitle(text);
        let score = 0;
        if (/\bS\d+E\d+\b/i.test(normalized)) score += 1000;
        if (/\b\d{4}\s*Text\s*[1-4]\b/i.test(normalized)) score += 900;
        if (/^[A-Za-z0-9]/.test(normalized)) score += 100;
        score += Math.min(normalized.length, 120);
        return score;
    }

    function uniqueNonEmpty(items) {
        const seen = new Set();
        const result = [];

        for (const item of items) {
            const value = normalizeText(item);
            if (!value || seen.has(value)) continue;
            seen.add(value);
            result.push(value);
        }

        return result;
    }

    function sanitizeLabel(text) {
        return normalizeText(text)
            .replace(/[()[\]{}'"“”‘’]/g, '')
            .replace(/\s+/g, '-')
            .replace(/[^\w.\-一-鿿]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60);
    }

    function sanitizeFileName(text) {
        return normalizeText(text)
            .replace(/[\\/:*?<>|]+/g, '-')
            .replace(/[ -]+/g, '')
            .replace(/\s+/g, ' ')
            .replace(/-+/g, '-')
            .replace(/^\.+|\.+$/g, '')
            .trim()
            .slice(0, 120);
    }

    function sanitizeFileNameForDownload(text) {
        return sanitizeFileName(normalizeDownloadFileNameQuotes(text));
    }

    function normalizeDownloadFileNameQuotes(text) {
        let opening = true;
        return normalizeText(text).replace(/"/g, () => {
            const quote = opening ? '“' : '”';
            opening = !opening;
            return quote;
        });
    }

    function getTranslationMap() {
        const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const translationItems = getTranslationItems(pageWindow);
        const byTimestamp = new Map();
        const byEnglish = new Map();
        const byIndex = [];
        const sourceRecords = [];

        translationItems.forEach((item, index) => {
            const originText = normalizeText(readTranslationOriginText(item));
            const text = normalizeText(stripHtml(readTranslationText(item)));
            const english = normalizeLookupText(originText);
            const record = {
                timestamp: readTranslationTimestamp(item),
                english,
                text,
            };

            byIndex[index] = record;
            addTranslationRecord(byTimestamp, record.timestamp, record);
            addTranslationRecord(byEnglish, record.english, record);

            if (originText && record.timestamp) {
                sourceRecords.push({
                    timestamp: record.timestamp,
                    english: originText,
                    translation: text,
                });
            }
        });

        return {
            byTimestamp,
            byEnglish,
            byIndex,
            sourceRecords,
        };
    }

    function getTranslationItems(pageWindow) {
        if (Array.isArray(pageWindow.translate?.subtitles) && pageWindow.translate.subtitles.length > 0) {
            return pageWindow.translate.subtitles;
        }

        if (Array.isArray(pageWindow.translate?.translation)) {
            return pageWindow.translate.translation;
        }

        for (const script of document.scripts) {
            const text = script.textContent || '';
            const objectSource = extractJsonObjectAfter(text, /var\s+translate\s*=/);
            if (!objectSource) continue;

            try {
                const parsed = JSON.parse(objectSource);
                if (Array.isArray(parsed.subtitles) && parsed.subtitles.length > 0) return parsed.subtitles;
                if (Array.isArray(parsed.translation)) return parsed.translation;
            } catch (error) {
                console.debug(LOG_PREFIX, 'Failed to parse translate script:', error);
            }
        }

        return [];
    }

    function extractJsonObjectAfter(text, markerPattern) {
        const match = text.match(markerPattern);
        if (!match) return '';

        const start = text.indexOf('{', match.index + match[0].length);
        if (start < 0) return '';

        let depth = 0;
        let quote = '';
        let escaped = false;

        for (let index = start; index < text.length; index += 1) {
            const char = text[index];

            if (quote) {
                if (escaped) {
                    escaped = false;
                } else if (char === '\\') {
                    escaped = true;
                } else if (char === quote) {
                    quote = '';
                }
                continue;
            }

            if (char === '"' || char === "'") {
                quote = char;
            } else if (char === '{') {
                depth += 1;
            } else if (char === '}') {
                depth -= 1;
                if (depth === 0) return text.slice(start, index + 1);
            }
        }

        return '';
    }

    function readTranslationText(item) {
        if (!item) return '';
        const value = item.translation ?? item.text ?? '';
        return String(value || '');
    }

    function readTranslationOriginText(item) {
        if (!item) return '';
        const value = item.origintext ?? item.originText ?? item.origin ?? item.english ?? '';
        return String(value || '');
    }

    function readTranslationTimestamp(item) {
        if (!item) return '';
        if (item.timestamp) return normalizeTimestamp(item.timestamp);

        if (Array.isArray(item.timestamps) && item.timestamps.length > 0) {
            return normalizeTimestamp(String(item.timestamps[0]).replace(/^\[|\]$/g, ''));
        }

        const sentId = item.words?.[0]?.sent_id || '';
        return normalizeTimestamp(String(sentId).replace(/^J_/, ''));
    }

    function addTranslationRecord(map, key, record) {
        if (!key) return;
        const existing = map.get(key);
        if (!existing || (!existing.text && record.text)) {
            map.set(key, record);
        }
    }

    function findTranslationText(translations, timestamp, english, index) {
        const byTimestamp = translations.byTimestamp.get(timestamp);
        if (byTimestamp && byTimestamp.text) return byTimestamp.text;

        const byEnglish = translations.byEnglish.get(normalizeLookupText(english));
        if (byEnglish && byEnglish.text) return byEnglish.text;

        const byIndex = translations.byIndex[index];
        if (byIndex && byIndex.text) return byIndex.text;

        return '';
    }

    function stripHtml(html) {
        if (!html) return '';
        const template = document.createElement('template');
        template.innerHTML = html;
        return template.content.textContent || '';
    }

    function normalizeTimestamp(value) {
        const raw = String(value || '').trim().replace(/^\[|\]$/g, '');
        const match = raw.match(/^0+:(\d{2}:\d{2}(?:\.\d+)?)$/);
        if (match) return match[1];
        return raw;
    }

    function normalizeText(value) {
        return String(value || '')
            .replace(/ /g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\s+([,.;:!?，。；：！？])/g, '$1')
            .replace(/([“‘(（])\s+/g, '$1')
            .replace(/\s+([”’）)])/g, '$1')
            .trim();
    }

    function normalizeLookupText(value) {
        return normalizeText(value)
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'")
            .replace(/\s+/g, ' ')
            .toLowerCase();
    }

    function normalizeArticleTitle(value) {
        return normalizeText(value)
            .replace(/^\+?\s*/, '')
            .replace(/\s*\|\s*每日英语听力.*$/i, '')
            .replace(/\s*_欧路词典\s*$/i, '')
            .trim();
    }

    function injectStyles() {
        if (document.getElementById(`${APP_ID}-styles`)) return;

        const style = document.createElement('style');
        style.id = `${APP_ID}-styles`;
        style.textContent = `
            #${APP_ID}-button {
                position: fixed;
                right: 18px;
                top: 112px;
                z-index: 2147483646;
                border: 1px solid #1d4ed8;
                border-radius: 8px;
                background: #2563eb;
                color: #fff;
                font: 600 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                padding: 9px 12px;
                box-shadow: 0 8px 24px rgba(15, 23, 42, 0.24);
                cursor: pointer;
            }
            #${APP_ID}-button:hover {
                background: #1d4ed8;
            }
            #${APP_ID}-modal {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                background: rgba(15, 23, 42, 0.55);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 28px;
            }
            #${APP_ID}-modal[hidden] {
                display: none !important;
            }
            .${APP_ID}-panel {
                width: min(980px, calc(100vw - 36px));
                height: min(760px, calc(100vh - 36px));
                display: flex;
                flex-direction: column;
                gap: 12px;
                box-sizing: border-box;
                border-radius: 8px;
                background: #fff;
                color: #111827;
                padding: 18px;
                box-shadow: 0 24px 80px rgba(15, 23, 42, 0.35);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            .${APP_ID}-header,
            .${APP_ID}-toolbar,
            .${APP_ID}-controls {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }
            .${APP_ID}-header {
                justify-content: space-between;
            }
            .${APP_ID}-title {
                font-size: 17px;
                font-weight: 700;
            }
            .${APP_ID}-source-row {
                display: grid;
                grid-template-columns: auto minmax(220px, 1fr) auto;
                align-items: center;
                gap: 10px;
            }
            .${APP_ID}-source-label {
                color: #374151;
                font-size: 13px;
                font-weight: 600;
                white-space: nowrap;
            }
            .${APP_ID}-source-input {
                min-width: 0;
                width: 100%;
                box-sizing: border-box;
                border: 1px solid #d1d5db;
                border-radius: 7px;
                padding: 7px 9px;
                color: #111827;
                background: #fff;
                font: 13px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
            }
            .${APP_ID}-source-input:focus {
                border-color: #2563eb;
                outline: 2px solid rgba(37, 99, 235, 0.18);
            }
            .${APP_ID}-check {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 13px;
                color: #374151;
                user-select: none;
            }
            .${APP_ID}-btn {
                border: 1px solid #d1d5db;
                border-radius: 7px;
                padding: 7px 11px;
                background: #fff;
                color: #111827;
                font: 600 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                cursor: pointer;
            }
            .${APP_ID}-btn:hover {
                background: #f3f4f6;
            }
            .${APP_ID}-btn-primary {
                border-color: #1d4ed8;
                background: #2563eb;
                color: #fff;
            }
            .${APP_ID}-btn-primary:hover {
                background: #1d4ed8;
            }
            .${APP_ID}-status {
                border-radius: 7px;
                background: #f3f4f6;
                color: #374151;
                padding: 8px 10px;
                font-size: 13px;
            }
            .${APP_ID}-status[data-state="ok"] {
                background: #ecfdf5;
                color: #047857;
            }
            .${APP_ID}-status[data-state="warn"] {
                background: #fffbeb;
                color: #92400e;
            }
            .${APP_ID}-status[data-state="error"] {
                background: #fef2f2;
                color: #b91c1c;
            }
            .${APP_ID}-textarea {
                flex: 1;
                min-height: 280px;
                width: 100%;
                box-sizing: border-box;
                resize: none;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                padding: 12px;
                color: #111827;
                background: #fff;
                font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
            }
            .${APP_ID}-textarea:focus {
                border-color: #2563eb;
                outline: 2px solid rgba(37, 99, 235, 0.18);
            }
        `;
        document.documentElement.appendChild(style);
    }
})();
