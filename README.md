# TampermonkeyScript-Peng

个人常用的 Tampermonkey / Greasemonkey 用户脚本合集，用于提升日常网页浏览、学习笔记和内容获取的效率。

---

## 目录

- [使用前提](#使用前提)
- [脚本列表](#脚本列表)
  - [搜索与导航](#搜索与导航)
  - [百度网盘增强](#百度网盘增强)
  - [YouTube 增强](#youtube-增强)
  - [Bilibili 增强](#bilibili-增强)
  - [英语学习与笔记导出](#英语学习与笔记导出)
  - [学术资源](#学术资源)
  - [链接与工具](#链接与工具)
- [安装方法](#安装方法)
- [更新](#更新)
- [免责声明](#免责声明)

---

## 使用前提

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Safari / Firefox 均可）
2. 点击对应脚本下方的 "Raw" 链接，Tampermonkey 会自动弹出安装对话框
3. 或在 Tampermonkey 面板中选择 "添加新脚本"，手动粘贴代码

---

## 脚本列表

### 搜索与导航

| 脚本 | 功能简介 | 适用站点 |
|------|---------|---------|
| **[SearchEngineJump.js](SearchEngineJump.js)** | 在各搜索引擎之间快捷跳转，支持可视化设置菜单，修复百度搜索样式问题 | 所有搜索引擎页面 |
| **[TextHighlightJumpURL.js](TextHighlightJumpURL.js)** | 选中文本后自动生成带 [Text Fragments](https://developer.mozilla.org/en-US/docs/Web/Text_fragments) 的高亮链接，输出 Markdown 格式，支持自定义快捷键 | 任意网页 |

### 百度网盘增强

| 脚本 | 功能简介 | 适用站点 |
|------|---------|---------|
| **[BaiduPan-AutoProcess.user.js](BaiduPan-AutoProcess.user.js)** | 批量触发百度网盘视频的文稿/课件/AI看/笔记按钮，支持按键交互控制 | `pan.baidu.com/pfile/video` |
| **[BaiduPanFloatingWindow.user.js](BaiduPanFloatingWindow.user.js)** | 将百度网盘视频播放器和播放列表转为可拖动、可调整大小的浮动窗口，位置记忆不受浏览器缩放影响 | `pan.baidu.com/pfile/video` |
| **[BaiduPanFloatingWindowsPro.user.js](BaiduPanFloatingWindowsPro.user.js)** | Pro 版双悬浮窗，支持 shell 布局控制、状态持久化和 resilient re-binding | `pan.baidu.com/pfile/video` |
| **[BaiduPanSubtitlePlayer.user.js](BaiduPanSubtitlePlayer.user.js)** | 浮动字幕面板，支持加载本地 SRT/VTT 字幕、与视频同步、点击跳转、智能滚动、双语模糊与切换 | `pan.baidu.com/pfile/video` |
| **[BaiduPan Subtitle Checker&Download](BaiduPan%20Subtitle%20Checker%26Download-1.0.user.js)** | 检测网络请求中的 `netdisk-subtitle` 关键字并自动下载字幕文件 | `pan.baidu.com/*` |
| **[Move subtitle to floating window.js](Move%20subtitle%20to%20floating%20window.js)** | 将视频字幕移动到独立的浮动窗口中显示 | 百度网盘视频页 |
| **[BaiduEasyStudySingleHtmlExporter.user.js](BaiduEasyStudySingleHtmlExporter.user.js)** | 将百度网盘「简单学习」页面导出为单个离线 HTML 文件，自动内联 CSS、JS、字体与图片，支持浮动导出按钮与进度提示 | `pan.baidu.com/embed/easy-study/detail*` |

### YouTube 增强

| 脚本 | 功能简介 | 适用站点 |
|------|---------|---------|
| **[YouTube-to-Bilibili-Jump.user.js](YouTube-to-Bilibili-Jump.user.js)** | 在 YouTube 视频页左上角添加极小半透明按钮，左键直接跳转 B 站第一个搜索结果，右键打开可编辑搜索词面板 | `youtube.com/watch*` |
| **[YouTubeChapterFirstFrameDownloader.user.js](YouTubeChapterFirstFrameDownloader.user.js)** | 根据 YouTube 视频描述中的时间戳章节，下载每个章节的首帧截图 | `youtube.com/watch*` |

### Bilibili 增强

| 脚本 | 功能简介 | 适用站点 |
|------|---------|---------|
| **[BilibiliChapterCopier.user.js](BilibiliChapterCopier.user.js)** | 在视频章节面板添加“复制”按钮，一键复制所有章节的时间范围和名称 | `bilibili.com/video/*` |

### 英语学习与笔记导出

| 脚本 | 功能简介 | 适用站点 |
|------|---------|---------|
| **[EudicTing MD Exporter.user.js](EudicTing%20MD%20Exporter.user.js)** | 导出每日英语听力（欧路词典）文章句子为 Markdown 格式，支持逐句来源链接，适配 Obsidian / Eudic 笔记 | `ting.eudic.net` / `dict.eudic.net` |
| **[EudicDictExamSentenceScraper.user.js](EudicDictExamSentenceScraper.user.js)** | 自动爬取欧路词典词条页「大学英语四级六级考研真题库」中的考研真题句子，自动点击「考研」→「查看更多」加载全部内容，输出标准 Markdown 格式（含 `e.g.` 前缀、中文翻译、出处及每日英语听力 App 链接） | `dict.eudic.net/dicts/en/*` |
| **[GetShareNoteNotionExporter.user.js](GetShareNoteNotionExporter.user.js)** | 导出 GET 分享笔记为 Notion 友好的 Markdown，支持文字记录、智能总结、 sprouts、子笔记的复制与下载 | `biji.com/note/share_note/*` |
| **[get.js](get.js)** | GET 分享笔记导出的早期版本（v0.1.0） | `biji.com/note/share_note/*` |

### 学术资源

| 脚本 | 功能简介 | 适用站点 |
|------|---------|---------|
| **[DuxiuBookEnhancer.user.js](DuxiuBookEnhancer.user.js)** | 读秀/超星图书增强：直接显示图书 SSID/DX 号，增加存货查询、部分阅读、试读跳转、封面/书名/版权/封底一键下载 | `book.duxiu.com` / `www.szlib.org.cn` / 图书馆参考联盟 |

### 链接与工具

| 脚本 | 功能简介 | 适用站点 |
|------|---------|---------|
| **[ShortLinkDirectOpener.user.js](ShortLinkDirectOpener.user.js)** | 直接打开 ShortLink Studio 包装的外部协议链接（obsidian、notion、marginnote、slack、zoom、figma、zotero 等），并自动关闭中转页 | `*.notion.site` / `shortlink.studio` |

> **注意**：`DoubaoTimelineMarkdownExporter.js` 目前为空文件，待后续开发完成。

---

## 安装方法

### 方式一：一键安装（推荐）

1. 确保已安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 在上方表格中点击你想安装的脚本文件名
3. 点击页面右上角的 **Raw** 按钮
4. Tampermonkey 会自动弹出安装确认窗口，点击 **安装** 即可

### 方式二：手动安装

1. 打开 Tampermonkey 扩展图标 → "管理面板"
2. 点击左侧 "实用工具" → "导入文件" 或 "从 URL 安装"
3. 粘贴对应脚本的 Raw URL，例如：
   ```
   https://raw.githubusercontent.com/TheodorePeng/TampermonkeyScript-Peng/main/SearchEngineJump.js
   ```

---

## 更新

脚本安装后，Tampermonkey 默认会自动检查更新（可通过脚本头部的 `@updateURL` 和 `@downloadURL` 字段控制）。

如果你想手动更新：

1. 打开 Tampermonkey 管理面板
2. 在已安装脚本列表中点击对应脚本右侧的 "🔄 检查更新"
3. 如有新版本，点击 "安装" 即可覆盖

---

## 免责声明

- 所有脚本仅供个人学习与研究使用
- 使用脚本时请遵守相关网站的服务条款
- 因使用脚本导致的任何账号异常或数据损失，作者不承担责任
- 部分脚本涉及页面 DOM 操作，可能因目标网站改版而失效，欢迎反馈 Issue

---

## License

如无特殊说明，本仓库脚本遵循 [MIT License](LICENSE)。

部分脚本包含第三方引用（如 `SearchEngineJump.js` 引用了 greasyfork 上的 toGBK.js），其许可证遵循原作者声明。

---

**Author**: [TheodorePeng](https://github.com/TheodorePeng)
