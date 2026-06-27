const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Folders
  pickFolder:   ()       => ipcRenderer.invoke('pick-folder'),
  scanFolder:   (p)      => ipcRenderer.invoke('scan-folder', p),

  // yt-dlp
  checkYtDlp:         ()        => ipcRenderer.invoke('check-ytdlp'),
  fetchPlaylistInfo:  (url)     => ipcRenderer.invoke('fetch-playlist-info', url),
  downloadVideo:      (opts)    => ipcRenderer.invoke('download-video', opts),
  cancelDownload:     (id)      => ipcRenderer.invoke('cancel-download', id),
  syncNow:            (plId)    => ipcRenderer.invoke('sync-now', plId),

  // Playlist state persistence
  loadPlaylists:  ()      => ipcRenderer.invoke('load-playlists'),
  savePlaylists:  (state) => ipcRenderer.invoke('save-playlists', state),

  // Events from main → renderer
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_, d) => cb(d)),
  onSyncStatus:       (cb) => ipcRenderer.on('sync-status',       (_, d) => cb(d)),
});

// Expose platform so renderer can set body class
contextBridge.exposeInMainWorld('platform', process.platform);
