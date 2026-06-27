# 🎬 Video Shuffler

Randomly shuffles and plays videos from local folders, with optional YouTube playlist sync.

---

## ── WINDOWS INSTALL ────────────────────────────────────

### Step 1 — Install Node.js
1. Go to https://nodejs.org
2. Click the **LTS** download button
3. Run the installer, click through all the defaults
4. When done, open **Command Prompt**: press Win+R, type `cmd`, hit Enter

### Step 2 — Run the app
1. Unzip `video-shuffler-app.zip` somewhere (e.g. your Desktop)
2. In Command Prompt, navigate to the folder:
   ```
   cd C:\Users\YourName\Desktop\video-shuffler
   ```
   (Tip: type `cd ` then drag the folder into the Command Prompt window)
3. Install dependencies:
   ```
   npm install
   ```
4. Launch the app:
   ```
   npm start
   ```

### Step 3 — Build a proper .exe installer (optional)
```
npm run build-win
```
Look in the `dist\` folder for:
- `Video Shuffler Setup 1.0.0.exe` — installer (recommended)
- `Video Shuffler 1.0.0.exe` — portable, no install needed

---

## ── MAC INSTALL ────────────────────────────────────────

### Step 1 — Install Node.js
1. Go to https://nodejs.org and download the **LTS** version
2. Run the `.pkg` installer

### Step 2 — Run the app
1. Unzip and open Terminal (`Cmd+Space` → "terminal")
2. Drag the `video-shuffler` folder into Terminal, put `cd ` before it, hit Enter
3. Run:
   ```
   npm install
   npm start
   ```

### Step 3 — Build a .app / .dmg (optional)
```
npm run build-mac
```
Open the `.dmg` in `dist/` and drag to Applications.

---

## ── YOUTUBE SYNC SETUP ─────────────────────────────────

YouTube Sync requires **yt-dlp** and **ffmpeg**.
The app will show setup instructions inside the YouTube Sync tab if they're missing.

### Windows:
1. Download `yt-dlp.exe` from:
   https://github.com/yt-dlp/yt-dlp/releases/latest
   Save it to: `C:\yt-dlp\yt-dlp.exe`

2. Download ffmpeg from:
   https://www.gyan.dev/ffmpeg/builds/
   Get "ffmpeg-release-essentials.zip", extract it,
   copy `ffmpeg.exe` into `C:\yt-dlp\`

3. Add `C:\yt-dlp` to your PATH:
   - Search "Environment Variables" in the Start menu
   - Click "Edit the system environment variables"
   - Click "Environment Variables"
   - Under "System variables", select "Path" → Edit → New
   - Type `C:\yt-dlp` → OK → OK → OK

4. Restart the app and click "Re-check" in the YouTube Sync tab

### Mac:
```
brew install yt-dlp ffmpeg
```

---

## ── HOW TO USE ─────────────────────────────────────────

**Local folders:**
1. Click ➕ Add Folder and pick a folder of videos
2. Check/uncheck folders to include or exclude from the shuffle
3. Hit ▶ Start Shuffle

**YouTube Sync:**
1. Click the YouTube Sync tab
2. Click ➕ Add Playlist
3. Paste a YouTube playlist URL (public or unlisted)
4. Choose a local download folder
5. Click Add & Sync — it downloads everything immediately
6. The app auto-checks for new videos every 24 hours
7. Already-downloaded videos are never re-downloaded

---

## ── KEYBOARD SHORTCUTS ─────────────────────────────────

| Key            | Action              |
|----------------|---------------------|
| Space          | Play / Pause        |
| ← →            | Seek ±10 seconds    |
| Shift + ← →    | Previous / Next     |
| ↑ ↓            | Volume              |
| F              | Fullscreen          |
| M              | Mute                |
| N              | Next video          |
| Double-click   | Fullscreen toggle   |

---

## ── SUPPORTED FORMATS ──────────────────────────────────

MP4, MKV, WebM, MOV, AVI, M4V, OGV, OGG, TS, M2TS, MTS, 3GP, MPG, MPEG
