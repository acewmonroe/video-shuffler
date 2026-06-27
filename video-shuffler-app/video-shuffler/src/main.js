const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs   = require('fs');
const { execFile } = require('child_process');
const os   = require('os');

nativeTheme.themeSource = 'dark';

let mainWindow;

// ── Persist state to userData ──────────────────────────────────
const STATE_PATH = path.join(app.getPath('userData'), 'yt-sync-state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { playlists: [] }; }
}

function saveState(state) {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); } catch {}
}

// ── Window ─────────────────────────────────────────────────────
function createWindow() {
  const isMac = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 780,
    minWidth: 900,
    minHeight: 580,
    backgroundColor: '#0f0f13',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? {} : { titleBarOverlay: { color: '#1a1a22', symbolColor: '#a78bfa', height: 38 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '..', 'assets', isMac ? 'icon.icns' : 'icon.ico'),
    show: false
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(() => {
  createWindow();
  startDailyScheduler();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC: folder picker ─────────────────────────────────────────
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return (r.canceled || !r.filePaths.length) ? null : r.filePaths[0];
});

// ── IPC: scan folder for videos ────────────────────────────────
const VIDEO_EXTS = new Set(['.mp4','.mkv','.webm','.mov','.avi','.m4v','.ogv','.ogg','.flv','.wmv','.ts','.m2ts','.mts','.3gp','.mpg','.mpeg']);

function scanDir(dirPath, depth = 0) {
  const results = [];
  if (depth > 2) return results;
  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isFile() && VIDEO_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push({ name: entry.name, fullPath });
    } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
      results.push(...scanDir(fullPath, depth + 1));
    }
  }
  return results;
}

ipcMain.handle('scan-folder', async (_, p) => scanDir(p));

// ── yt-dlp detection ───────────────────────────────────────────
function findYtDlp() {
  const isWin = process.platform === 'win32';

  if (isWin) {
    const candidates = [
      path.join(os.homedir(), 'yt-dlp', 'yt-dlp.exe'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'yt-dlp', 'yt-dlp.exe'),
      'C:\\yt-dlp\\yt-dlp.exe',
      path.join(process.env.LOCALAPPDATA || '', 'yt-dlp', 'yt-dlp.exe'),
    ];
    for (const c of candidates) {
      try { if (fs.statSync(c).isFile()) return c; } catch {}
    }
    // Also try PATH via where command
    try {
      const result = require('child_process').execSync('where yt-dlp', { encoding: 'utf8', timeout: 3000 });
      const p = result.trim().split('\n')[0].trim();
      if (p && fs.existsSync(p)) return p;
    } catch {}
    return null;
  } else {
    const candidates = [
      '/opt/homebrew/bin/yt-dlp',
      '/usr/local/bin/yt-dlp',
      '/usr/bin/yt-dlp',
      path.join(os.homedir(), '.local/bin/yt-dlp')
    ];
    for (const c of candidates) {
      try { if (fs.statSync(c).isFile()) return c; } catch {}
    }
    return null;
  }
}

ipcMain.handle('check-ytdlp', async () => {
  const bin = findYtDlp();
  return { installed: !!bin, path: bin, isWin: process.platform === 'win32' };
});

// ── IPC: load / save playlists state ──────────────────────────
ipcMain.handle('load-playlists', () => loadState());
ipcMain.handle('save-playlists', (_, state) => { saveState(state); return true; });

// ── IPC: fetch playlist metadata ───────────────────────────────
ipcMain.handle('fetch-playlist-info', async (_, url) => {
  const bin = findYtDlp();
  if (!bin) return { error: 'yt-dlp not found' };
  return new Promise(resolve => {
    execFile(bin, ['--flat-playlist','--print','%(id)s\t%(title)s','--no-warnings', url],
      { timeout: 30000 }, (err, stdout) => {
        if (err) return resolve({ error: err.message });
        const videos = [];
        for (const line of stdout.trim().split('\n')) {
          const [id, ...titleParts] = line.split('\t');
          if (id && id.length > 5) videos.push({ id, title: titleParts.join('\t') || id });
        }
        resolve({ videos });
      });
  });
});

// ── IPC: download a single video ───────────────────────────────
const activeDownloads = new Map();

ipcMain.handle('download-video', async (_, { videoId, destFolder, playlistId }) => {
  const bin = findYtDlp();
  if (!bin) return { error: 'yt-dlp not found' };
  try { fs.mkdirSync(destFolder, { recursive: true }); } catch {}

  return new Promise(resolve => {
    const args = [
      `https://www.youtube.com/watch?v=${videoId}`,
      '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]',
      '--merge-output-format', 'mp4',
      '-o', path.join(destFolder, '%(title)s [%(id)s].%(ext)s'),
      '--no-playlist', '--no-warnings', '--newline'
    ];
    const child = execFile(bin, args, { timeout: 600000 }, (err) => {
      activeDownloads.delete(videoId);
      if (err && err.killed) return resolve({ cancelled: true });
      if (err) return resolve({ error: err.message });
      resolve({ success: true });
    });
    activeDownloads.set(videoId, child);
    child.stdout.on('data', data => {
      const pctMatch = data.toString().match(/(\d+\.?\d*)%/);
      if (pctMatch && mainWindow) {
        mainWindow.webContents.send('download-progress', { videoId, playlistId, percent: parseFloat(pctMatch[1]) });
      }
    });
  });
});

ipcMain.handle('cancel-download', (_, videoId) => {
  const child = activeDownloads.get(videoId);
  if (child) { child.kill(); activeDownloads.delete(videoId); }
  return true;
});

// ── IPC: manual sync ───────────────────────────────────────────
ipcMain.handle('sync-now', async (_, playlistId) => {
  await syncPlaylist(playlistId);
  return true;
});

// ── Daily scheduler ────────────────────────────────────────────
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;

function startDailyScheduler() {
  setInterval(async () => {
    const state = loadState();
    for (const pl of state.playlists) {
      if (pl.enabled) await syncPlaylist(pl.id);
    }
  }, CHECK_INTERVAL);
}

async function syncPlaylist(playlistId) {
  const state = loadState();
  const pl    = state.playlists.find(p => p.id === playlistId);
  if (!pl || !pl.enabled) return;
  const bin = findYtDlp();
  if (!bin) return;

  if (mainWindow) mainWindow.webContents.send('sync-status', { playlistId, status: 'checking' });

  const info = await new Promise(resolve => {
    execFile(bin, ['--flat-playlist','--print','%(id)s\t%(title)s','--no-warnings', pl.url],
      { timeout: 30000 }, (err, stdout) => {
        if (err) return resolve({ error: err.message });
        const videos = [];
        for (const line of stdout.trim().split('\n')) {
          const [id, ...titleParts] = line.split('\t');
          if (id && id.length > 5) videos.push({ id, title: titleParts.join('\t') || id });
        }
        resolve({ videos });
      });
  });

  if (info.error) {
    if (mainWindow) mainWindow.webContents.send('sync-status', { playlistId, status: 'error', message: info.error });
    return;
  }

  const downloaded = new Set(pl.downloadedIds || []);
  const toDownload = info.videos.filter(v => !downloaded.has(v.id));

  if (!toDownload.length) {
    pl.lastChecked = Date.now();
    saveState(state);
    if (mainWindow) mainWindow.webContents.send('sync-status', { playlistId, status: 'idle', newCount: 0 });
    return;
  }

  if (mainWindow) mainWindow.webContents.send('sync-status', { playlistId, status: 'downloading', total: toDownload.length, done: 0 });

  let done = 0;
  for (const video of toDownload) {
    const result = await new Promise(resolve => {
      const args = [
        `https://www.youtube.com/watch?v=${video.id}`,
        '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]',
        '--merge-output-format', 'mp4',
        '-o', path.join(pl.folder, '%(title)s [%(id)s].%(ext)s'),
        '--no-playlist', '--no-warnings', '--newline'
      ];
      const child = execFile(bin, args, { timeout: 600000 }, (err) => {
        if (err && err.killed) return resolve({ cancelled: true });
        if (err) return resolve({ error: err.message });
        resolve({ success: true });
      });
      activeDownloads.set(video.id, child);
      child.stdout.on('data', data => {
        const pctMatch = data.toString().match(/(\d+\.?\d*)%/);
        if (pctMatch && mainWindow) {
          mainWindow.webContents.send('download-progress', { videoId: video.id, playlistId, percent: parseFloat(pctMatch[1]) });
        }
      });
    });

    activeDownloads.delete(video.id);

    if (result.success) {
      const freshState = loadState();
      const freshPl    = freshState.playlists.find(p => p.id === playlistId);
      if (freshPl) {
        freshPl.downloadedIds = [...new Set([...(freshPl.downloadedIds || []), video.id])];
        freshPl.downloadCount = (freshPl.downloadCount || 0) + 1;
        saveState(freshState);
      }
      done++;
      if (mainWindow) mainWindow.webContents.send('sync-status', { playlistId, status: 'downloading', total: toDownload.length, done });
    }
  }

  const finalState = loadState();
  const finalPl    = finalState.playlists.find(p => p.id === playlistId);
  if (finalPl) { finalPl.lastChecked = Date.now(); saveState(finalState); }
  if (mainWindow) mainWindow.webContents.send('sync-status', { playlistId, status: 'idle', newCount: done });
}
