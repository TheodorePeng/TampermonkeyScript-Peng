// ==UserScript==
// @name         YouTube Chapter First Frame Downloader
// @namespace    http://tampermonkey.net/
// @version      0.1.3
// @description  Download the first frame of each chapter from YouTube description timestamps.
// @author       TheodorePeng
// @match        https://www.youtube.com/watch*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @updateURL    https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/YouTubeChapterFirstFrameDownloader.user.js
// @downloadURL  https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/YouTubeChapterFirstFrameDownloader.user.js
// ==/UserScript==

(function() {
    'use strict';

    const MENU_LABEL = 'Download Chapter First Frames';
    const CAPTURE_OFFSET_SEC = 2;
    const MAX_FILENAME_LENGTH = 80;
    const FRAME_WAIT_FRAMES = 3;

    let isRunning = false;

    GM_registerMenuCommand(MENU_LABEL, () => {
        if (isRunning) {
            notify('Task already running.');
            return;
        }
        isRunning = true;
        run().catch((error) => {
            console.error('[YT Chapters] Error:', error);
            if (error && error.name === 'TaintedCanvasError') {
                alertWithPrefix(error.message);
                return;
            }
            alertWithPrefix(error && error.message ? error.message : 'Unexpected error.');
        }).finally(() => {
            isRunning = false;
        });
    });

    async function run() {
        const video = await getVideoElement();
        const originalTime = video.currentTime;
        const wasPaused = video.paused;

        try {
            const descriptionText = await getDescriptionText();
            const chapters = parseChapters(descriptionText);
            if (chapters.length === 0) {
                throw new Error('No description timestamps found.');
            }

            notify(`Found ${chapters.length} chapters. Starting capture...`);

            for (let i = 0; i < chapters.length; i += 1) {
                const chapter = chapters[i];
                const paddedIndex = String(i + 1).padStart(2, '0');
                const filename = buildFilename(paddedIndex, chapter.title);

                await seekTo(video, chapter.timeSec + CAPTURE_OFFSET_SEC);
                await waitForFrame(video);
                const objectUrl = await captureFrame(video);
                try {
                    await downloadBlob(objectUrl, filename);
                } finally {
                    URL.revokeObjectURL(objectUrl);
                }
                notify(`Downloaded ${i + 1}/${chapters.length}: ${filename}`);
            }

            notify('All chapter frames downloaded.');
        } finally {
            restorePlayback(video, originalTime, wasPaused);
        }
    }

    function notify(message) {
        console.log(`[YT Chapters] ${message}`);
    }

    function alertWithPrefix(message) {
        alert(`[YT Chapters] ${message}`);
    }

    function getVideoTitle() {
        const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
            document.querySelector('h1.title yt-formatted-string') ||
            document.querySelector('h1.title') ||
            document.querySelector('title');
        if (!titleEl) return 'YouTube Video';
        const raw = titleEl.textContent || 'YouTube Video';
        return sanitizeText(raw.replace(' - YouTube', '').trim());
    }

    async function getVideoElement() {
        const video = document.querySelector('video');
        if (!video) {
            throw new Error('Video element not found.');
        }
        if (video.readyState < 2) {
            await waitForEvent(video, 'loadeddata', 5000);
        }
        return video;
    }

    async function getDescriptionText() {
        tryExpandDescription();
        await delay(100);

        const candidates = [
            'ytd-expander#description yt-formatted-string.content[slot="content"]',
            'ytd-expander#description yt-formatted-string.content',
            '#description yt-formatted-string',
            'ytd-watch-metadata #description',
            '#description'
        ];

        for (const selector of candidates) {
            const el = document.querySelector(selector);
            if (el && el.textContent) {
                const text = el.textContent.trim();
                if (text.length > 0) return text;
            }
        }
        return '';
    }

    function tryExpandDescription() {
        const expander = document.querySelector('ytd-expander#description');
        const expandButton = document.querySelector('#expand');
        const moreButton = document.querySelector('yt-formatted-string.more-button') ||
            document.querySelector('tp-yt-paper-button#more');

        if (expandButton && !expandButton.hasAttribute('hidden')) {
            expandButton.click();
            return;
        }

        if (expander && expander.hasAttribute('collapsed') && moreButton) {
            moreButton.click();
        }
    }

    function parseChapters(text) {
        const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
        const chapters = [];
        const seen = new Set();

        for (const line of lines) {
            const match = line.match(/^\s*(?:[-*•]+)?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(.*)$/);
            if (!match) continue;
            const timeSec = parseTimeToSeconds(match[1]);
            if (Number.isNaN(timeSec)) continue;
            if (seen.has(timeSec)) continue;

            let title = match[2] || '';
            title = title.replace(/^[-–—:|]+\s*/, '').trim();
            if (!title) title = match[1];

            chapters.push({ timeSec, title: sanitizeText(title) });
            seen.add(timeSec);
        }

        return chapters;
    }

    function parseTimeToSeconds(timeStr) {
        const parts = timeStr.split(':').map((part) => part.trim());
        if (parts.length === 2) {
            const m = Number(parts[0]);
            const s = Number(parts[1]);
            return (m * 60) + s;
        }
        if (parts.length === 3) {
            const h = Number(parts[0]);
            const m = Number(parts[1]);
            const s = Number(parts[2]);
            return (h * 3600) + (m * 60) + s;
        }
        return Number.NaN;
    }

    function sanitizeText(text) {
        return text
            .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_FILENAME_LENGTH);
    }

    function buildFilename(index, chapterTitle) {
        const safeChapter = sanitizeText(chapterTitle) || 'Chapter';
        return `${index}_${safeChapter}.png`;
    }

    async function seekTo(video, timeSec) {
        const target = Math.max(0, Math.min(timeSec, (video.duration || timeSec)));
        if (Number.isNaN(target)) {
            throw new Error('Invalid seek time.');
        }
        if (Math.abs(video.currentTime - target) < 0.05) return;

        const seekPromise = waitForEvent(video, 'seeked', 5000);
        video.currentTime = target;
        await seekPromise;
    }

    async function waitForFrame(video) {
        if (typeof video.requestVideoFrameCallback === 'function') {
            await new Promise((resolve) => video.requestVideoFrameCallback(() => resolve()));
            return;
        }
        await waitForAnimationFrames(FRAME_WAIT_FRAMES);
    }

    async function captureFrame(video) {
        if (!video.videoWidth || !video.videoHeight) {
            throw new Error('Video frame is not ready.');
        }

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not available.');

        try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch (error) {
            handleTaintedCanvas(error);
        }

        let blob = null;
        try {
            blob = await canvasToBlob(canvas);
        } catch (error) {
            handleTaintedCanvas(error);
        }

        if (!blob) {
            try {
                canvas.toDataURL('image/png');
            } catch (error) {
                handleTaintedCanvas(error);
            }
            throw new Error('Failed to capture video frame.');
        }

        return URL.createObjectURL(blob);
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            try {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Blob creation failed.'));
                        return;
                    }
                    resolve(blob);
                }, 'image/png');
            } catch (error) {
                reject(error);
            }
        });
    }

    async function downloadBlob(objectUrl, filename) {
        return new Promise((resolve, reject) => {
            GM_download({
                url: objectUrl,
                name: filename,
                saveAs: false,
                onload: () => resolve(),
                onerror: (error) => reject(new Error(`Download failed: ${error && error.error ? error.error : 'unknown error'}`))
            });
        });
    }

    function handleTaintedCanvas(error) {
        console.error('[YT Chapters] Tainted canvas error:', error);
        const taintedError = new Error('Capture failed due to cross-origin restrictions (tainted canvas).');
        taintedError.name = 'TaintedCanvasError';
        throw taintedError;
    }

    function restorePlayback(video, timeSec, wasPaused) {
        try {
            video.currentTime = timeSec;
            if (!wasPaused) {
                video.play().catch(() => {});
            }
        } catch (_) {
            // ignore
        }
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function waitForAnimationFrames(count) {
        return new Promise((resolve) => {
            let remaining = count;
            function tick() {
                remaining -= 1;
                if (remaining <= 0) {
                    resolve();
                    return;
                }
                requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        });
    }

    function waitForEvent(target, eventName, timeoutMs) {
        return new Promise((resolve, reject) => {
            let timeoutId;
            const handler = () => {
                cleanup();
                resolve();
            };
            const cleanup = () => {
                target.removeEventListener(eventName, handler);
                if (timeoutId) clearTimeout(timeoutId);
            };

            target.addEventListener(eventName, handler, { once: true });
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`Timeout waiting for ${eventName}.`));
            }, timeoutMs);
        });
    }
})();
