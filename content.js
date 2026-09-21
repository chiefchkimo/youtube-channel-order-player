// YouTube 頻道順序播放 - content script
// 原理：每個頻道都有一個「上傳清單」播放列表，ID = 頻道 ID 把 UC 換成 UU（UULF = 只有一般影片）。
// 清單依上傳時間由新到舊排列，找到目前影片的位置，前一個就是「較新的下一部」，後一個就是「較舊的上一部」。
(() => {
  'use strict';

  const DEFAULTS = {
    autoplay: true,        // 播完自動接著播
    direction: 'newer',    // 'newer' = 播較新的下一部, 'older' = 播較舊的上一部
    includeShorts: false,  // 是否把 Shorts / 直播也算進順序
    delay: 0,              // 播完後幾秒才跳（0 = 立刻）
    showPanel: true,       // 是否在影片下方顯示控制列
  };
  const MAX_PAGES = 60;            // 最多往後翻幾頁（每頁約 100 部）
  const CACHE_TTL = 15 * 60 * 1000; // 清單快取 15 分鐘

  let settings = { ...DEFAULTS };
  const state = {
    videoId: null,
    channelName: '',
    channelId: null,
    entry: null,       // 目前使用的清單快取
    index: -1,         // 目前影片在清單中的位置（0 = 最新）
    loading: false,
    error: null,
    countdownTimer: null,
    runToken: 0,
  };
  const playlistCache = new Map(); // playlistId -> entry
  const handleCache = new Map();   // '@handle' 或 'channel/UC..' -> 'UC...'

  // ---------- 小工具 ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (sel, root = document) => root.querySelector(sel);
  const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;
  const UI_LANG = chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : 'en';

  function log(...args) {
    console.debug('[頻道順序播放]', ...args);
  }

  async function waitFor(fn, timeout = 15000, interval = 250) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(interval);
    }
    return null;
  }

  function walk(node, fn) {
    if (!node || typeof node !== 'object') return;
    fn(node);
    if (Array.isArray(node)) {
      for (const v of node) walk(v, fn);
    } else {
      for (const k in node) walk(node[k], fn);
    }
  }

  function textOf(t) {
    if (!t) return '';
    if (typeof t === 'string') return t;
    if (t.simpleText) return t.simpleText;
    if (Array.isArray(t.runs)) return t.runs.map((r) => r.text).join('');
    return '';
  }

  function currentVideoId() {
    if (location.pathname !== '/watch') return null;
    return new URLSearchParams(location.search).get('v');
  }

  function inPlaylist() {
    return !!new URLSearchParams(location.search).get('list');
  }

  // ---------- 找出目前影片的頻道 ----------
  async function getChannelRef(videoId) {
    // 1. oEmbed：對應到精準的影片 ID，不會被 SPA 換頁時的舊 DOM 誤導
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`,
        { credentials: 'omit' }
      );
      if (res.ok) {
        const j = await res.json();
        if (j.author_url) {
          const u = new URL(j.author_url);
          return { path: u.pathname.replace(/^\/+|\/+$/g, ''), name: j.author_name || '' };
        }
      }
    } catch (e) {
      log('oEmbed 失敗，改用 DOM', e);
    }
    // 2. 從 DOM 讀作者連結（等到 video-id 對得上再讀）
    await waitFor(() => $('ytd-watch-flexy')?.getAttribute('video-id') === videoId, 8000);
    const a = await waitFor(
      () => $('ytd-video-owner-renderer a[href^="/@"], ytd-video-owner-renderer a[href^="/channel/"]'),
      10000
    );
    if (!a) throw new Error(t('errNoChannel'));
    return {
      path: new URL(a.href).pathname.replace(/^\/+|\/+$/g, ''),
      name: $('ytd-video-owner-renderer #channel-name')?.textContent?.trim() || '',
    };
  }

  async function resolveChannelId(path) {
    const m = path.match(/^channel\/(UC[\w-]{22})$/);
    if (m) return m[1];
    if (handleCache.has(path)) return handleCache.get(path);
    const res = await fetch(`https://www.youtube.com/${path}`, { credentials: 'include' });
    if (!res.ok) throw new Error(t('errChannelPage') + ' ' + res.status);
    const html = await res.text();
    const id =
      html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ||
      html.match(/"channelId":"(UC[\w-]{22})"/)?.[1] ||
      html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/)?.[1];
    if (!id) throw new Error(t('errChannelId'));
    handleCache.set(path, id);
    return id;
  }

  // ---------- 撈上傳清單 ----------
  // 解析清單頁 / continuation 回應。
  // 2025 年後 YouTube 改用 lockupViewModel（影片 ID 在 contentId），舊版是 playlistVideoRenderer，兩種都支援。
  function parseItems(root) {
    const videos = [];
    let token = null;
    let total = null;
    walk(root, (n) => {
      if (n.playlistVideoRenderer && n.playlistVideoRenderer.videoId) {
        const r = n.playlistVideoRenderer;
        videos.push({
          videoId: r.videoId,
          title: textOf(r.title) || t('untitled'),
          length: textOf(r.lengthText),
        });
      }
      if (n.lockupViewModel && n.lockupViewModel.contentId) {
        const l = n.lockupViewModel;
        if (l.contentType && l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return;
        let length = '';
        walk(l.contentImage, (m) => {
          if (!length && m.thumbnailBadgeViewModel && /^\d+:\d\d/.test(m.thumbnailBadgeViewModel.text || '')) {
            length = m.thumbnailBadgeViewModel.text;
          }
        });
        videos.push({
          videoId: l.contentId,
          title: l.metadata?.lockupMetadataViewModel?.title?.content || t('untitled'),
          length,
        });
      }
      if (!token && n.continuationCommand && typeof n.continuationCommand.token === 'string') {
        token = n.continuationCommand.token;
      }
      if (total == null && n.numVideosText) {
        const num = textOf(n.numVideosText).replace(/[^\d]/g, '');
        if (num) total = parseInt(num, 10);
      }
    });
    return { videos, token, total };
  }

  function extractJson(html, varName) {
    const start = html.indexOf(varName + ' = ');
    if (start < 0) return null;
    const from = start + varName.length + 3;
    const end = html.indexOf(';</script>', from);
    if (end < 0) return null;
    try {
      return JSON.parse(html.slice(from, end));
    } catch (e) {
      return null;
    }
  }

  async function loadFirstPage(playlistId) {
    const res = await fetch(`https://www.youtube.com/playlist?list=${playlistId}&hl=${encodeURIComponent(UI_LANG)}`, { credentials: 'include' });
    if (!res.ok) throw new Error(t('errList') + ' ' + res.status);
    const html = await res.text();
    const data = extractJson(html, 'ytInitialData');
    if (!data) throw new Error(t('errListParse'));
    const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || null;
    const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || '2.20250101.00.00';
    const { videos, token, total } = parseItems(data);
    const entry = {
      playlistId,
      videos: [],
      ids: new Set(),
      token,
      total,
      apiKey,
      clientVersion,
      fetchedAt: Date.now(),
      exists: videos.length > 0 || !!token,
    };
    mergeVideos(entry, videos);
    playlistCache.set(playlistId, entry);
    return entry;
  }

  function mergeVideos(entry, videos) {
    for (const v of videos) {
      if (!entry.ids.has(v.videoId)) {
        entry.ids.add(v.videoId);
        entry.videos.push(v);
      }
    }
  }

  async function loadMore(entry) {
    if (!entry.token) return false;
    const url = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false' + (entry.apiKey ? `&key=${entry.apiKey}` : '');
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: entry.clientVersion, hl: UI_LANG } },
        continuation: entry.token,
      }),
    });
    if (!res.ok) throw new Error(t('errListMore') + ' ' + res.status);
    const data = await res.json();
    const { videos, token } = parseItems(data);
    mergeVideos(entry, videos);
    entry.token = videos.length ? token : null; // 沒新資料就當作到底了
    return videos.length > 0;
  }

  async function getEntry(playlistId) {
    const cached = playlistCache.get(playlistId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached;
    return loadFirstPage(playlistId);
  }

  // 找到影片在清單中的位置；找不到就一直往後翻，直到翻完或超過上限
  async function locate(entry, videoId, onProgress) {
    let pages = 0;
    for (;;) {
      const idx = entry.videos.findIndex((v) => v.videoId === videoId);
      if (idx >= 0) return idx;
      if (!entry.token || pages >= MAX_PAGES) return -1;
      onProgress && onProgress(entry.videos.length);
      await loadMore(entry);
      pages++;
    }
  }

  // ---------- 主流程 ----------
  async function refresh() {
    const videoId = currentVideoId();
    const token = ++state.runToken;
    cancelCountdown();

    if (!videoId) {
      state.videoId = null;
      hidePanel();
      return;
    }
    if (videoId === state.videoId && state.entry && !state.error) {
      render();
      return;
    }

    state.videoId = videoId;
    state.entry = null;
    state.index = -1;
    state.error = null;
    state.loading = true;
    render(t('loadingChannel'));

    try {
      const ref = await getChannelRef(videoId);
      if (token !== state.runToken) return;
      state.channelName = ref.name;
      const channelId = await resolveChannelId(ref.path);
      if (token !== state.runToken) return;
      state.channelId = channelId;

      const base = channelId.slice(2);
      const order = settings.includeShorts ? ['UU' + base] : ['UULF' + base, 'UU' + base];
      let found = false;
      for (const pid of order) {
        render(t('loadingList'));
        let entry;
        try {
          entry = await getEntry(pid);
        } catch (e) {
          log('清單載入失敗', pid, e);
          continue;
        }
        if (token !== state.runToken) return;
        if (!entry.exists) continue;
        const idx = await locate(entry, videoId, (n) => token === state.runToken && render(t('searching', n)));
        if (token !== state.runToken) return;
        if (idx >= 0) {
          // 確保「較舊的上一部」也已載入
          if (idx === entry.videos.length - 1 && entry.token) {
            try { await loadMore(entry); } catch (_) {}
            if (token !== state.runToken) return;
          }
          state.entry = entry;
          state.index = idx;
          found = true;
          break;
        }
      }
      if (!found) state.error = t('notFound');
    } catch (e) {
      log(e);
      state.error = e.message || String(e);
    } finally {
      if (token === state.runToken) {
        state.loading = false;
        render();
      }
    }
  }

  function neighbor(dir) {
    if (!state.entry || state.index < 0) return null;
    const list = state.entry.videos;
    const i = dir === 'newer' ? state.index - 1 : state.index + 1;
    return list[i] || null;
  }

  function navigateTo(video) {
    if (!video) return;
    cancelCountdown();
    location.assign(`https://www.youtube.com/watch?v=${video.videoId}`);
  }

  function go(dir) {
    const v = neighbor(dir);
    if (v) navigateTo(v);
    else flash(dir === 'newer' ? t('atNewest') : t('atOldest'));
  }

  // ---------- 播完自動接續 ----------
  function hookVideo() {
    const v = $('#movie_player video, video.html5-main-video');
    if (v && !v.dataset.ytcoHooked) {
      v.dataset.ytcoHooked = '1';
      v.addEventListener('ended', onEnded);
    }
  }

  function onEnded() {
    if (!settings.autoplay) return;
    if (currentVideoId() !== state.videoId) return;
    if (inPlaylist()) return; // 使用者正在看播放清單，不干擾 YouTube 自己的接續
    const target = neighbor(settings.direction);
    if (!target) return;
    if (settings.delay > 0) startCountdown(target, settings.delay);
    else navigateTo(target);
  }

  function startCountdown(target, seconds) {
    cancelCountdown();
    let left = seconds;
    const panel = ensurePanel();
    panel.dataset.counting = '1';
    const tick = () => {
      panel.querySelector('.ytco-countdown-text').textContent = t('countdown', left, target.title);
      if (left <= 0) {
        navigateTo(target);
        return;
      }
      left--;
      state.countdownTimer = setTimeout(tick, 1000);
    };
    tick();
  }

  function cancelCountdown() {
    if (state.countdownTimer) clearTimeout(state.countdownTimer);
    state.countdownTimer = null;
    const p = $('#ytco-panel');
    if (p) delete p.dataset.counting;
  }

  // ---------- 畫面 ----------
  function ensurePanel() {
    let panel = $('#ytco-panel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'ytco-panel';
    panel.innerHTML = `
      <button class="ytco-btn ytco-prev" data-dir="older" title="${t('prevTip')}">
        <span class="ytco-arrow">◀</span>
        <img class="ytco-thumb" alt="" loading="lazy">
        <span class="ytco-btn-text"><span class="ytco-label">${t('prevLabel')}</span><span class="ytco-title"></span></span>
      </button>
      <div class="ytco-mid">
        <span class="ytco-status"></span>
        <label class="ytco-auto" title="${t('autoTip')}"><input type="checkbox"> ${t('autoLabel')}</label>
        <span class="ytco-countdown"><span class="ytco-countdown-text"></span><button class="ytco-cancel">${t('cancel')}</button></span>
      </div>
      <button class="ytco-btn ytco-next" data-dir="newer" title="${t('nextTip')}">
        <span class="ytco-arrow">▶</span>
        <img class="ytco-thumb" alt="" loading="lazy">
        <span class="ytco-btn-text"><span class="ytco-label">${t('nextLabel')}</span><span class="ytco-title"></span></span>
      </button>`;
    panel.querySelectorAll('.ytco-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.dir)));
    panel.querySelector('.ytco-cancel').addEventListener('click', cancelCountdown);
    const cb = panel.querySelector('.ytco-auto input');
    cb.checked = settings.autoplay;
    cb.addEventListener('change', () => {
      settings.autoplay = cb.checked;
      chrome.storage.sync.set({ autoplay: cb.checked });
    });
    mountPanel(panel);
    return panel;
  }

  function mountPanel(panel) {
    // 優先放在影片下方的資訊區；找不到就用浮動視窗
    const below = $('ytd-watch-flexy #below');
    if (below) {
      below.prepend(panel);
      delete panel.dataset.floating;
    } else {
      panel.dataset.floating = '1';
      document.body.appendChild(panel);
    }
  }

  function render(statusText) {
    if (!settings.showPanel) {
      hidePanel();
      return;
    }
    if (!currentVideoId()) return hidePanel();
    const panel = ensurePanel();
    if (!panel.isConnected || (panel.dataset.floating && $('ytd-watch-flexy #below'))) mountPanel(panel);
    panel.style.display = '';

    const prev = neighbor('older');
    const next = neighbor('newer');
    const prevBtn = panel.querySelector('.ytco-prev');
    const nextBtn = panel.querySelector('.ytco-next');
    prevBtn.disabled = !prev;
    nextBtn.disabled = !next;
    prevBtn.querySelector('.ytco-title').textContent = prev ? prev.title : state.loading ? '…' : t('noOlder');
    nextBtn.querySelector('.ytco-title').textContent = next ? next.title : state.loading ? '…' : t('noNewer');
    setThumb(prevBtn, prev);
    setThumb(nextBtn, next);
    prevBtn.title = prev ? t('olderPrefix') + prev.title + (prev.length ? ' (' + prev.length + ')' : '') : '';
    nextBtn.title = next ? t('newerPrefix') + next.title + (next.length ? ' (' + next.length + ')' : '') : '';

    const status = panel.querySelector('.ytco-status');
    status.classList.remove('ytco-error');
    if (statusText) {
      status.textContent = statusText;
    } else if (state.error) {
      status.textContent = state.error;
      status.classList.add('ytco-error');
      status.title = state.error;
    } else if (state.entry) {
      const total = state.entry.total || state.entry.videos.length + (state.entry.token ? '+' : '');
      status.textContent = (state.channelName ? state.channelName + ' · ' : '') + t('position', state.index + 1, total);
      status.title = status.textContent;
    } else {
      status.textContent = '';
    }
    panel.querySelector('.ytco-auto input').checked = settings.autoplay;
  }

  function setThumb(btn, video) {
    const img = btn.querySelector('.ytco-thumb');
    if (!img) return;
    if (video) {
      const url = `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
      if (img.getAttribute('src') !== url) img.src = url;
      img.style.display = '';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
    }
  }

  function hidePanel() {
    const p = $('#ytco-panel');
    if (p) p.style.display = 'none';
  }

  function flash(msg) {
    const panel = $('#ytco-panel');
    if (!panel) return;
    const status = panel.querySelector('.ytco-status');
    const old = status.textContent;
    status.textContent = msg;
    setTimeout(() => { if (status.textContent === msg) status.textContent = old; }, 2000);
  }

  // ---------- 事件接線 ----------
  chrome.storage.sync.get(DEFAULTS, (v) => {
    settings = { ...DEFAULTS, ...v };
    refresh();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    let needReload = false;
    for (const k in changes) {
      if (k in DEFAULTS) {
        if (k === 'includeShorts' && changes[k].newValue !== settings[k]) needReload = true;
        settings[k] = changes[k].newValue;
      }
    }
    if (needReload) {
      state.videoId = null; // 強迫重算
      refresh();
    } else {
      render();
    }
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'ytco-nav') go(msg.dir);
  });

  // YouTube 是單頁應用，換影片不會重新載入頁面
  document.addEventListener('yt-navigate-finish', () => refresh());
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      refresh();
    }
    hookVideo();
    // 面板被 YouTube 重繪掉時補回來
    if (settings.showPanel && currentVideoId() && state.entry && !$('#ytco-panel')?.isConnected) render();
  }, 1000);
  hookVideo();
})();
