// Set platform class on body
document.body.classList.add(window.platform || "");

'use strict';

// ── State ──────────────────────────────────────────────────────
const folders   = [];
let   playlists = [];
let   queue     = [];
let   queueIdx  = -1;
let   isRunning = false;

// ── DOM ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const tabBtns          = document.querySelectorAll('.tab-btn');
const tabPanels        = document.querySelectorAll('.tab-panel');
const folderListEl     = $('folderList');
const folderCountEl    = $('folderCount');
const addFolderBtn     = $('addFolderBtn');
const startBtn         = $('startBtn');
const stopBtn          = $('stopBtn');
const ytdlpMissing     = $('ytdlpMissing');
const ytdlpReady       = $('ytdlpReady');
const setupMac         = $('setupMac');
const setupWin         = $('setupWin');
const recheckBtn       = $('recheckYtdlp');
const playlistListEl   = $('playlistList');
const playlistCount    = $('playlistCount');
const addPlaylistBtn   = $('addPlaylistBtn');
const modalBackdrop    = $('modalBackdrop');
const modalClose       = $('modalClose');
const modalCancel      = $('modalCancel');
const modalConfirm     = $('modalConfirm');
const playlistUrlInput = $('playlistUrlInput');
const playlistFolderInput = $('playlistFolderInput');
const pickPlaylistFolder  = $('pickPlaylistFolder');
const fetchStatus      = $('playlistFetchStatus');
const videoEl          = $('videoEl');
const noVideo          = $('noVideo');
const videoWrapper     = $('videoWrapper');
const prevBtn          = $('prevBtn');
const playPauseBtn     = $('playPauseBtn');
const nextBtn          = $('nextBtn');
const progressTrack    = $('progressTrack');
const progressFill     = $('progressFill');
const timeElapsed      = $('timeElapsed');
const timeTotal        = $('timeTotal');
const volumeSlider     = $('volumeSlider');
const muteBtn          = $('muteBtn');
const fullscreenBtn    = $('fullscreenBtn');
const nowPlayingName   = $('nowPlayingName');
const nowPlayingFolder = $('nowPlayingFolder');
const queueBadge       = $('queueBadge');
const overlayMsg       = $('overlayMsg');
const fsControls       = $('fsControls');
const fsTitle          = $('fsTitle');
const fsPrev           = $('fsPrev');
const fsPlayPause      = $('fsPlayPause');
const fsNext           = $('fsNext');
const fsProgressTrack  = $('fsProgressTrack');
const fsProgressFill   = $('fsProgressFill');
const fsTime           = $('fsTime');
const fsExitBtn        = $('fsExitBtn');

// ── Helpers ────────────────────────────────────────────────────
function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function showOverlay(msg) {
  overlayMsg.textContent = msg;
  overlayMsg.classList.add('show');
  clearTimeout(overlayMsg._t);
  overlayMsg._t = setTimeout(() => overlayMsg.classList.remove('show'), 1800);
}

function fmtDate(ts) {
  if (!ts) return 'Never';
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

function genId() { return Math.random().toString(36).slice(2,10); }

// ── Tabs ───────────────────────────────────────────────────────
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Folders ────────────────────────────────────────────────────
addFolderBtn.addEventListener('click', async () => {
  const p = await window.electronAPI.pickFolder();
  if (!p) return;
  if (folders.find(f => f.path === p)) { showOverlay('Folder already added'); return; }
  const files = await window.electronAPI.scanFolder(p);
  const name  = p.replace(/\\/g,'/').split('/').pop() || p;
  folders.push({ path: p, name, files, enabled: true });
  renderFolders();
  rebuildQueue();
});

function removeFolder(i) { folders.splice(i,1); renderFolders(); rebuildQueue(); }
function toggleFolder(i) { folders[i].enabled = !folders[i].enabled; renderFolders(); rebuildQueue(); }

function renderFolders() {
  folderCountEl.textContent = folders.length;
  startBtn.disabled = !folders.some(f => f.enabled && f.files.length > 0);
  if (!folders.length) {
    folderListEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><p>Add folders below, then check<br>the ones to shuffle.</p></div>`;
    return;
  }
  folderListEl.innerHTML = '';
  folders.forEach((f, i) => {
    const el = document.createElement('div');
    el.className = `folder-item${f.enabled?' enabled':''}`;
    el.innerHTML = `
      <div class="folder-checkbox">${f.enabled?'✓':''}</div>
      <div class="folder-icon">📁</div>
      <div class="folder-info">
        <div class="folder-name" title="${f.name}">${f.name}</div>
        <div class="folder-path" title="${f.path}">${f.path}</div>
        <div class="folder-meta">${f.files.length} video${f.files.length!==1?'s':''}</div>
      </div>
      <div class="folder-remove" title="Remove">✕</div>`;
    el.querySelector('.folder-remove').addEventListener('click', e => { e.stopPropagation(); removeFolder(i); });
    el.addEventListener('click', () => toggleFolder(i));
    folderListEl.appendChild(el);
  });
}

// ── Queue ──────────────────────────────────────────────────────
function rebuildQueue() {
  const all = [];
  folders.filter(f => f.enabled).forEach(f =>
    f.files.forEach(file => all.push({...file, folderName: f.name}))
  );
  queue    = shuffle(all);
  queueIdx = -1;
  updateQueueBadge();
}

function updateQueueBadge() {
  queueBadge.textContent = `${queueIdx>=0?queueIdx+1:0} / ${queue.length}`;
}

// ── Playback ───────────────────────────────────────────────────
function loadAndPlay(index) {
  if (!queue.length) return;
  if (index >= queue.length) {
    const all = [];
    folders.filter(f => f.enabled).forEach(f =>
      f.files.forEach(file => all.push({...file, folderName: f.name}))
    );
    queue = shuffle(all); index = 0;
  }
  if (index < 0) index = queue.length - 1;
  queueIdx = index;
  updateQueueBadge();

  const entry   = queue[queueIdx];
  // Handle both Mac (/) and Windows (\) paths
  const fileUrl = 'file:///' + entry.fullPath.replace(/\\/g, '/');
  videoEl.src   = fileUrl;
  videoEl.style.display = 'block';
  noVideo.style.display  = 'none';
  nowPlayingName.textContent   = entry.name;
  nowPlayingFolder.textContent = `📁 ${entry.folderName}`;
  fsTitle.textContent          = entry.name;
  playPauseBtn.disabled = false; prevBtn.disabled = false; nextBtn.disabled = false;
  videoEl.play()
    .then(() => { playPauseBtn.textContent='⏸'; fsPlayPause.textContent='⏸'; })
    .catch(()  => { playPauseBtn.textContent='▶'; fsPlayPause.textContent='▶'; });
}

function startShuffle() {
  isRunning = true;
  startBtn.style.display='none'; stopBtn.style.display='';
  rebuildQueue(); loadAndPlay(0);
}

function stopShuffle() {
  isRunning = false;
  videoEl.pause(); videoEl.src=''; videoEl.style.display='none'; noVideo.style.display='';
  startBtn.style.display=''; stopBtn.style.display='none';
  playPauseBtn.textContent='▶'; fsPlayPause.textContent='▶';
  playPauseBtn.disabled=true; prevBtn.disabled=true; nextBtn.disabled=true;
  nowPlayingName.textContent='—'; nowPlayingFolder.textContent='—';
  progressFill.style.width='0%'; fsProgressFill.style.width='0%';
  timeElapsed.textContent='0:00'; timeTotal.textContent='0:00';
  queueIdx=-1; updateQueueBadge();
}

startBtn.addEventListener('click', startShuffle);
stopBtn.addEventListener('click',  stopShuffle);

videoEl.addEventListener('ended', () => { if(isRunning) loadAndPlay(queueIdx+1); });
videoEl.addEventListener('timeupdate', () => {
  const pct = videoEl.duration ? (videoEl.currentTime/videoEl.duration)*100 : 0;
  progressFill.style.width   = pct+'%';
  fsProgressFill.style.width = pct+'%';
  timeElapsed.textContent = fmtTime(videoEl.currentTime);
  timeTotal.textContent   = fmtTime(videoEl.duration);
  fsTime.textContent      = `${fmtTime(videoEl.currentTime)} / ${fmtTime(videoEl.duration)}`;
});
videoEl.addEventListener('error', () => {
  showOverlay('Cannot play file — skipping');
  if(isRunning) setTimeout(()=>loadAndPlay(queueIdx+1), 1000);
});

function seekFromTrack(track, e) {
  if (!videoEl.duration) return;
  const r = track.getBoundingClientRect();
  videoEl.currentTime = Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)) * videoEl.duration;
}
progressTrack.addEventListener('click',   e=>seekFromTrack(progressTrack,e));
fsProgressTrack.addEventListener('click', e=>seekFromTrack(fsProgressTrack,e));

volumeSlider.addEventListener('input', () => {
  videoEl.volume = parseFloat(volumeSlider.value);
  videoEl.muted  = videoEl.volume===0;
  muteBtn.textContent = videoEl.muted?'🔇':'🔊';
});
muteBtn.addEventListener('click', () => { videoEl.muted=!videoEl.muted; muteBtn.textContent=videoEl.muted?'🔇':'🔊'; });

function togglePlayPause() {
  if (!isRunning) return;
  if (videoEl.paused) { videoEl.play(); playPauseBtn.textContent='⏸'; fsPlayPause.textContent='⏸'; }
  else                { videoEl.pause(); playPauseBtn.textContent='▶'; fsPlayPause.textContent='▶'; }
}
function goNext() { if(isRunning) loadAndPlay(queueIdx+1); }
function goPrev() {
  if(!isRunning) return;
  videoEl.currentTime>5 ? (videoEl.currentTime=0) : loadAndPlay(queueIdx-1);
}

playPauseBtn.addEventListener('click', togglePlayPause);
fsPlayPause.addEventListener('click',  togglePlayPause);
nextBtn.addEventListener('click', goNext); fsNext.addEventListener('click', goNext);
prevBtn.addEventListener('click', goPrev); fsPrev.addEventListener('click', goPrev);

function toggleFullscreen() {
  document.fullscreenElement ? document.exitFullscreen() : videoWrapper.requestFullscreen().catch(()=>{});
}
fullscreenBtn.addEventListener('click', toggleFullscreen);
fsExitBtn.addEventListener('click', ()=>document.exitFullscreen());
videoEl.addEventListener('dblclick', toggleFullscreen);

document.addEventListener('keydown', e => {
  if (e.target.tagName==='INPUT') return;
  switch(e.key) {
    case ' ': e.preventDefault(); togglePlayPause(); break;
    case 'ArrowRight': e.preventDefault();
      e.shiftKey ? goNext() : (videoEl.duration && (videoEl.currentTime=Math.min(videoEl.duration,videoEl.currentTime+10))); break;
    case 'ArrowLeft': e.preventDefault();
      e.shiftKey ? goPrev() : (videoEl.currentTime=Math.max(0,videoEl.currentTime-10)); break;
    case 'ArrowUp': e.preventDefault();
      videoEl.volume=Math.min(1,videoEl.volume+.05); volumeSlider.value=videoEl.volume;
      showOverlay(`Volume: ${Math.round(videoEl.volume*100)}%`); break;
    case 'ArrowDown': e.preventDefault();
      videoEl.volume=Math.max(0,videoEl.volume-.05); volumeSlider.value=videoEl.volume;
      showOverlay(`Volume: ${Math.round(videoEl.volume*100)}%`); break;
    case 'f': case 'F': toggleFullscreen(); break;
    case 'm': case 'M': muteBtn.click(); break;
    case 'n': case 'N': goNext(); break;
  }
});

// ── YouTube Sync ───────────────────────────────────────────────
async function checkYtDlp() {
  const res = await window.electronAPI.checkYtDlp();
  ytdlpMissing.style.display = res.installed ? 'none' : '';
  ytdlpReady.style.display   = res.installed ? ''     : 'none';
  if (!res.installed) {
    setupMac.style.display = res.isWin ? 'none' : '';
    setupWin.style.display = res.isWin ? ''     : 'none';
  }
}

recheckBtn.addEventListener('click', checkYtDlp);

async function loadPersistedPlaylists() {
  const state = await window.electronAPI.loadPlaylists();
  playlists = (state.playlists || []).map(p => ({
    ...p,
    downloadedIds: new Set(p.downloadedIds || []),
    status: 'idle'
  }));
  renderPlaylists();
}

function persistPlaylists() {
  window.electronAPI.savePlaylists({
    playlists: playlists.map(p => ({ ...p, downloadedIds: [...p.downloadedIds] }))
  });
}

// ── Modal ──────────────────────────────────────────────────────
function openModal() {
  playlistUrlInput.value    = '';
  playlistFolderInput.value = '';
  fetchStatus.style.display = 'none';
  modalConfirm.disabled     = true;
  modalBackdrop.style.display = 'flex';
  setTimeout(()=>playlistUrlInput.focus(), 50);
}
function closeModal() { modalBackdrop.style.display='none'; }

addPlaylistBtn.addEventListener('click', openModal);
modalClose.addEventListener('click',  closeModal);
modalCancel.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => { if(e.target===modalBackdrop) closeModal(); });

pickPlaylistFolder.addEventListener('click', async () => {
  const p = await window.electronAPI.pickFolder();
  if (p) { playlistFolderInput.value=p; validateModal(); }
});

function validateModal() {
  const urlOk    = playlistUrlInput.value.trim().includes('youtube.com') || playlistUrlInput.value.trim().includes('youtu.be');
  const folderOk = playlistFolderInput.value.trim().length > 0;
  modalConfirm.disabled = !(urlOk && folderOk);
}
playlistUrlInput.addEventListener('input', validateModal);

modalConfirm.addEventListener('click', async () => {
  const url    = playlistUrlInput.value.trim();
  const folder = playlistFolderInput.value.trim();
  if (!url || !folder) return;

  if (playlists.find(p => p.url === url)) {
    fetchStatus.textContent   = 'This playlist has already been added.';
    fetchStatus.className     = 'fetch-status error';
    fetchStatus.style.display = '';
    return;
  }

  modalConfirm.disabled     = true;
  fetchStatus.textContent   = '⏳ Fetching playlist info…';
  fetchStatus.className     = 'fetch-status';
  fetchStatus.style.display = '';

  const info = await window.electronAPI.fetchPlaylistInfo(url);
  if (info.error) {
    fetchStatus.textContent = '❌ ' + info.error;
    fetchStatus.className   = 'fetch-status error';
    modalConfirm.disabled   = false;
    return;
  }

  fetchStatus.textContent = `✅ Found ${info.videos.length} videos — starting download…`;
  fetchStatus.className   = 'fetch-status ok';

  const pl = {
    id:            genId(),
    url,
    folder,
    name:          (() => { try { return new URL(url).searchParams.get('list') || url; } catch { return url; } })(),
    enabled:       true,
    downloadedIds: new Set(),
    downloadCount: 0,
    lastChecked:   null,
    status:        'downloading',
    syncTotal:     info.videos.length,
    syncDone:      0
  };

  playlists.push(pl);
  persistPlaylists();
  renderPlaylists();
  closeModal();

  await downloadNewVideos(pl.id, info.videos);
});

// ── Download logic ─────────────────────────────────────────────
async function downloadNewVideos(plId, allVideos) {
  const pl = playlists.find(p=>p.id===plId);
  if (!pl) return;

  const toDownload = allVideos.filter(v => !pl.downloadedIds.has(v.id));
  if (!toDownload.length) {
    pl.status      = 'idle';
    pl.lastChecked = Date.now();
    persistPlaylists();
    renderPlaylists();
    return;
  }

  pl.status    = 'downloading';
  pl.syncTotal = toDownload.length;
  pl.syncDone  = 0;
  renderPlaylists();

  let done = 0;
  for (const video of toDownload) {
    pl.currentVideo = video.title || video.id;
    renderPlaylists();

    const result = await window.electronAPI.downloadVideo({
      videoId:    video.id,
      destFolder: pl.folder,
      playlistId: plId
    });

    if (result && result.success) {
      pl.downloadedIds.add(video.id);
      pl.downloadCount = (pl.downloadCount||0) + 1;
      done++;
    }
    pl.syncDone = done;
    persistPlaylists();
    renderPlaylists();
  }

  pl.status       = 'idle';
  pl.lastChecked  = Date.now();
  pl.currentVideo = null;
  pl.syncProgress = 0;
  persistPlaylists();
  renderPlaylists();

  // Refresh folder list if this download folder is already added
  const matchingFolder = folders.find(f => f.path === pl.folder);
  if (matchingFolder) {
    matchingFolder.files = await window.electronAPI.scanFolder(pl.folder);
    renderFolders();
    rebuildQueue();
  }
}

// ── Playlist render ────────────────────────────────────────────
function renderPlaylists() {
  playlistCount.textContent = playlists.length;
  if (!playlists.length) {
    playlistListEl.innerHTML = `<div class="empty-state"><div class="empty-icon">▶</div><p>Add a YouTube playlist below.<br>Works with public or unlisted.</p></div>`;
    return;
  }
  playlistListEl.innerHTML = '';
  playlists.forEach((pl, i) => {
    const statusDot = `<span class="status-dot ${pl.status||'idle'}"></span>`;
    let statusLabel = '';
    if      (pl.status==='downloading') statusLabel = `Downloading ${pl.syncDone||0}/${pl.syncTotal||'?'}…`;
    else if (pl.status==='checking')    statusLabel = 'Checking for new videos…';
    else if (pl.status==='error')       statusLabel = 'Error — check URL';
    else                                statusLabel = `Last synced: ${fmtDate(pl.lastChecked)}`;

    const pct         = pl.syncTotal ? Math.round(((pl.syncDone||0)/pl.syncTotal)*100) : 0;
    const showProgress = pl.status==='downloading';

    const el = document.createElement('div');
    el.className = `playlist-item${pl.enabled?' enabled':''}`;
    el.innerHTML = `
      <div class="playlist-item-header">
        <div class="pl-checkbox">${pl.enabled?'✓':''}</div>
        <div class="pl-info">
          <div class="pl-name" title="${pl.url}">${pl.name}</div>
          <div class="pl-folder" title="${pl.folder}">📁 ${pl.folder.replace(/\\/g,'/').split('/').pop()}</div>
          <div class="pl-meta">
            ${statusDot}${statusLabel}
            &nbsp;·&nbsp; ${pl.downloadCount||0} downloaded
          </div>
        </div>
        <div class="pl-actions">
          <button class="icon-btn sync-btn" title="Sync now">🔄</button>
          <button class="icon-btn danger remove-btn" title="Remove">✕</button>
        </div>
      </div>
      ${showProgress ? `
      <div class="pl-progress">
        <div class="pl-progress-bar"><div class="pl-progress-fill" style="width:${pct}%"></div></div>
        <div class="pl-progress-label">${pl.currentVideo ? pl.currentVideo.substring(0,50) : ''}</div>
      </div>` : ''}`;

    el.querySelector('.pl-checkbox').addEventListener('click', e => { e.stopPropagation(); togglePlaylist(i); });
    el.querySelector('.pl-info').addEventListener('click', ()=>togglePlaylist(i));
    el.querySelector('.sync-btn').addEventListener('click', e => { e.stopPropagation(); manualSync(pl.id); });
    el.querySelector('.remove-btn').addEventListener('click', e => { e.stopPropagation(); removePlaylist(i); });
    playlistListEl.appendChild(el);
  });
}

function togglePlaylist(i) { playlists[i].enabled=!playlists[i].enabled; persistPlaylists(); renderPlaylists(); }
function removePlaylist(i) { playlists.splice(i,1); persistPlaylists(); renderPlaylists(); }

async function manualSync(plId) {
  const pl = playlists.find(p=>p.id===plId);
  if (!pl || pl.status==='downloading') return;
  pl.status = 'checking';
  renderPlaylists();
  const info = await window.electronAPI.fetchPlaylistInfo(pl.url);
  if (info.error) { pl.status='error'; renderPlaylists(); return; }
  await downloadNewVideos(plId, info.videos);
}

// ── Main process events ────────────────────────────────────────
window.electronAPI.onDownloadProgress(({ videoId, playlistId, percent }) => {
  const pl = playlists.find(p=>p.id===playlistId);
  if (pl) { pl.syncProgress=percent; renderPlaylists(); }
});

window.electronAPI.onSyncStatus(({ playlistId, status, total, done }) => {
  const pl = playlists.find(p=>p.id===playlistId);
  if (!pl) return;
  pl.status = status;
  if (total!==undefined) pl.syncTotal=total;
  if (done!==undefined)  pl.syncDone=done;
  renderPlaylists();
});

// ── Init ───────────────────────────────────────────────────────
checkYtDlp();
loadPersistedPlaylists();
