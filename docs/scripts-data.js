/**
 * TampermonkeyScript-Peng — Script Catalog Data
 *
 * Centralized metadata for all scripts. When adding a new script:
 * 1. Add an entry to the `pages` array in the appropriate category below.
 * 2. Copy scripts/_template.html to scripts/your-script.html and fill in content.
 *
 * Fields:
 *   - id:        URL-safe identifier (used for anchor links)
 *   - name:      Display name shown in nav and cards
 *   - file:      Relative path from docs/ root to the detail page
 *   - desc:      One-line description shown on homepage
 *   - version:   Script version string
 *   - sites:     Target sites / match patterns
 */
window.SCRIPTS_CATALOG = [
  {
    id: 'search',
    title: '搜索与导航',
    pages: [
      {
        id: 'search-engine-jump',
        name: 'SearchEngineJump',
        file: 'scripts/search-engine-jump.html',
        desc: '在各搜索引擎之间快捷跳转，支持可视化设置菜单，修复百度搜索样式丢失的问题。',
        version: '5.27.2',
        sites: '所有搜索引擎页面',
      },
      {
        id: 'text-highlight-jump-url',
        name: 'TextHighlightJumpURL',
        file: 'scripts/text-highlight-jump-url.html',
        desc: '选中文本后自动生成带 Text Fragments 的高亮链接，输出 Markdown 格式，支持自定义快捷键触发。',
        version: '1.9',
        sites: '任意网页',
      },
    ],
  },
  {
    id: 'baidupan',
    title: '百度网盘增强',
    pages: [
      {
        id: 'baidupan-auto-process',
        name: 'BaiduPan AutoProcess',
        file: 'scripts/baidupan-auto-process.html',
        desc: '批量触发百度网盘视频的文稿/课件/AI看/笔记按钮，支持按键交互控制（Y/N 继续/停止）。',
        version: '1.9.3',
        sites: 'pan.baidu.com/pfile/video',
      },
      {
        id: 'baidupan-floating-window',
        name: 'BaiduPan FloatingWindow',
        file: 'scripts/baidupan-floating-window.html',
        desc: '将百度网盘视频播放器和播放列表转为可拖动、可调整大小的浮动窗口，位置记忆不受浏览器缩放影响。',
        version: '1.1',
        sites: 'pan.baidu.com/pfile/video',
      },
      {
        id: 'baidupan-floating-windows-pro',
        name: 'BaiduPan FloatingWindows Pro',
        file: 'scripts/baidupan-floating-windows-pro.html',
        desc: 'Pro 版双悬浮窗，支持 shell 布局控制、状态持久化，包含视频播放窗和资料窗，支持标签切换。',
        version: '1.0.11',
        sites: 'pan.baidu.com/pfile/video',
      },
      {
        id: 'baidupan-subtitle-player',
        name: 'BaiduPan SubtitlePlayer',
        file: 'scripts/baidupan-subtitle-player.html',
        desc: '浮动字幕面板，支持加载本地 SRT/VTT 字幕、与视频同步、点击跳转、智能滚动、双语模糊与切换。',
        version: '0.9.2',
        sites: 'pan.baidu.com/pfile/video',
      },
      {
        id: 'baidupan-subtitle-checker-download',
        name: 'BaiduPan Subtitle Checker & Download',
        file: 'scripts/baidupan-subtitle-checker-download.html',
        desc: '检测网络请求中的 netdisk-subtitle 关键字并自动下载字幕文件，在页面左下角显示绿色下载图标。',
        version: '1.0',
        sites: 'pan.baidu.com/*',
      },
      {
        id: 'move-subtitle-to-floating-window',
        name: 'Move Subtitle to Floating Window',
        file: 'scripts/move-subtitle-to-floating-window.html',
        desc: '现代化的字幕悬浮窗口工具，支持拖拽、调整大小、折叠和透明度控制，适用于 YouTube 和哔哩哔哩。',
        version: '1.36',
        sites: 'YouTube / Bilibili',
      },
      {
        id: 'baidu-easy-study-single-html-exporter',
        name: 'Baidu Easy Study Single HTML Exporter',
        file: 'scripts/baidu-easy-study-single-html-exporter.html',
        desc: '将百度网盘「简单学习」页面导出为单个离线 HTML 文件，自动内联 CSS、JS、字体与图片资源。',
        version: '0.1.0',
        sites: 'pan.baidu.com/embed/easy-study/detail*',
      },
    ],
  },
  {
    id: 'youtube',
    title: 'YouTube 增强',
    pages: [
      {
        id: 'youtube-to-bilibili-jump',
        name: 'YouTube to Bilibili Jump',
        file: 'scripts/youtube-to-bilibili-jump.html',
        desc: '在 YouTube 视频页左上角添加极小半透明按钮，左键直接跳转 B 站第一个搜索结果，右键打开可编辑搜索词面板。',
        version: '0.5.1',
        sites: 'youtube.com/watch*',
      },
      {
        id: 'youtube-chapter-firstframe-downloader',
        name: 'YouTube Chapter FirstFrame Downloader',
        file: 'scripts/youtube-chapter-firstframe-downloader.html',
        desc: '根据 YouTube 视频描述中的时间戳章节，下载每个章节的首帧截图，支持带项目符号的时间戳格式。',
        version: '0.1.3',
        sites: 'youtube.com/watch*',
      },
    ],
  },
  {
    id: 'bilibili',
    title: 'Bilibili 增强',
    pages: [
      {
        id: 'bilibili-chapter-copier',
        name: 'Bilibili Chapter Copier',
        file: 'scripts/bilibili-chapter-copier.html',
        desc: '在 B 站视频章节面板添加「复制」按钮，一键复制所有章节的时间范围与名称到剪贴板。',
        version: '0.1.1',
        sites: 'bilibili.com/video/*',
      },
    ],
  },
  {
    id: 'english',
    title: '英语学习与笔记导出',
    pages: [
      {
        id: 'eudicting-md-exporter',
        name: 'EudicTing MD Exporter',
        file: 'scripts/eudicting-md-exporter.html',
        desc: '导出每日英语听力（欧路词典）文章句子为 Markdown 格式，支持逐句来源链接，适配 Obsidian / Eudic 笔记。',
        version: '0.2.0',
        sites: 'ting.eudic.net / dict.eudic.net',
      },
      {
        id: 'eudicdict-exam-sentence-scraper',
        name: 'EudicDict Exam Sentence Scraper',
        file: 'scripts/eudicdict-exam-sentence-scraper.html',
        desc: '自动爬取欧路词典词条页「大学英语四级六级考研真题库」中的考研真题句子，输出标准 Markdown 格式。',
        version: '1.0.2',
        sites: 'dict.eudic.net/dicts/en/*',
      },
      {
        id: 'get-share-note-notion-exporter',
        name: 'GetShareNote Notion Exporter',
        file: 'scripts/get-share-note-notion-exporter.html',
        desc: '导出 GET 分享笔记为 Notion 友好的 Markdown，支持文字记录、智能总结、sprouts、子笔记的复制与下载。',
        version: '0.2.0',
        sites: 'biji.com/note/share_note/*',
      },
      {
        id: 'get-share-note-exporter-legacy',
        name: 'GetShareNote Exporter (Legacy)',
        file: 'scripts/get-share-note-exporter-legacy.html',
        desc: 'GET 分享笔记导出的早期版本（v0.1.0），功能相对简单，支持基础的文字记录和子笔记导出。',
        version: '0.1.0',
        sites: 'biji.com/note/share_note/*',
      },
    ],
  },
  {
    id: 'academic',
    title: '学术资源',
    pages: [
      {
        id: 'duxiu-book-enhancer',
        name: 'Duxiu Book Enhancer (红太狼的平底锅)',
        file: 'scripts/duxiu-book-enhancer.html',
        desc: '读秀图书增强：直接显示 SSID / DX 号，提供存货查询、部分阅读、试读跳转、一键下载四联图等快捷按钮（原作者：maer）。',
        version: '1.0.4',
        sites: 'book.duxiu.com',
      },
    ],
  },
  {
    id: 'tools',
    title: '链接与工具',
    pages: [
      {
        id: 'shortlink-direct-opener',
        name: 'ShortLink Direct Opener',
        file: 'scripts/shortlink-direct-opener.html',
        desc: '直接打开 ShortLink Studio 包装的外部协议链接（obsidian、notion、marginnote、slack、zoom、figma、zotero 等），并自动关闭中转页。',
        version: '0.1.3',
        sites: '*.notion.site / shortlink.studio',
      },
      {
        id: 'shortlink-auto-closer',
        name: 'ShortLink Auto Closer',
        file: 'scripts/shortlink-auto-closer.html',
        desc: '在 ShortLink Studio 中转页加载时自动尝试关闭当前标签页，需配合 ShortLink Direct Opener 使用。',
        version: '0.1.1',
        sites: 'shortlink.studio/1/*',
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI 助手',
    pages: [
      {
        id: 'chatgpt-auto-read-aloud',
        name: 'ChatGPT Auto Read Aloud',
        file: 'scripts/chatgpt-auto-read-aloud.html',
        desc: '配合 ChatGPT Audio Controls，在新回答完成后自动触发原生 Read Aloud，并提供可拖拽开关与低频 Tampermonkey 设置。',
        version: '1.0.0',
        sites: 'chatgpt.com/*',
      },
      {
        id: 'doubao-timeline-markdown-exporter',
        name: 'Doubao Timeline Markdown Exporter',
        file: 'scripts/doubao-timeline-markdown-exporter.html',
        desc: '提取豆包（Bilibili 视频解读页）生成的高亮时间线节点，一键复制为 Markdown bullets 便于做笔记。',
        version: '0.1.6',
        sites: 'doubao.com/summary/bilibili/*',
      },
    ],
  },
];
