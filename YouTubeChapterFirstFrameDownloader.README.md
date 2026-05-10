# YouTube Chapter First Frame Downloader

Tampermonkey userscript that reads chapter timestamps from the YouTube video description, seeks to each chapter start (+2s), captures the first frame, and downloads the images sequentially.

## Requirements

- Tampermonkey extension
- YouTube watch page with description timestamps

## Installation

1. Open Tampermonkey dashboard.
2. Create a new script.
3. Paste contents of `YouTubeChapterFirstFrameDownloader.user.js`.
4. Save and enable the script.

## Usage

1. Open a YouTube watch page.
2. Open Tampermonkey menu.
3. Click **Download Chapter First Frames**.
4. Images download one by one.

## Timestamp Format Examples

The script only parses timestamps in the description, such as:

```
0:00 Intro
1:23 Chapter A
12:34 Chapter B
```

Bullet or dash prefixes are also supported:

```
- 0:00 Intro
* 1:23 Chapter A
• 12:34 Chapter B
```

## Output

- Filename format: `01_Chapter Name.png`
- Capture offset: `+2s` from the chapter timestamp

## Notes

- Only description timestamps are used (no auto chapters).
- If canvas capture is blocked by cross-origin restrictions, the script aborts with a message.
- To change the offset, edit `CAPTURE_OFFSET_SEC` in `YouTubeChapterFirstFrameDownloader.user.js`.
