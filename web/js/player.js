/* 預覽播放器（三個分頁共用一個，切換分頁時搬到該分頁的位置）。 */
(function () {
  const FA = window.FA;
  const { $, h } = FA;
  const S = FA.S;

  // ------------------------------------------------------------ 縮圖快取
  const TH = new Map();
  FA.thumb = function (mid, w) {
    w = w || 240;
    const key = mid + '@' + w;
    if (TH.has(key)) return TH.get(key);
    const m = FA.media(mid);
    const p = (async () => {
      const c = FA.mkCanvas(w, Math.round(w * 0.6));
      if (m && m.kind === 'video') {
        const v = document.createElement('video');
        v.muted = true; v.preload = 'auto'; v.src = FA.mediaURL(mid);
        await new Promise((res) => { v.onloadeddata = res; v.onerror = res; setTimeout(res, 6000); });
        await new Promise((res) => { v.onseeked = res; v.currentTime = Math.min(1, (v.duration || 2) / 3); setTimeout(res, 4000); });
        if (!v.videoWidth) return '';
        c.height = Math.round((w * v.videoHeight) / v.videoWidth);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        v.removeAttribute('src'); v.load();
      } else {
        const im = await FA.loadImage(FA.mediaURL(mid));
        c.height = Math.max(8, Math.round((w * im.naturalHeight) / im.naturalWidth));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      }
      return c.toDataURL('image/jpeg', 0.8);
    })().catch(() => '');
    TH.set(key, p);
    return p;
  };
  // 項目縮圖（套用旋轉、裁切、特效）
  FA.itemThumb = async function (it, w) {
    if (it.type === 'card') {
      const c = FA.mkCanvas(w, Math.round(w / FA.ar()));
      const e = new FA.Engine(c.width, c.height);
      e.setShow({ items: [it], fadeEnds: false }, {});
      await e.ensureItem(it);
      e.draw(Math.min(1.5, FA.itemDur(it) - 0.1));
      c.getContext('2d').drawImage(e.out, 0, 0);
      return c.toDataURL('image/jpeg', 0.8);
    }
    if (it.type === 'video' || !(it.rot || it.crop || it.fx || it.flip || it.adj || (it.redeye && it.redeye.length))) return FA.thumb(it.media, w);
    const b = await FA.bakePhoto(FA.mediaURL(it.media), it, w * 2);
    const c = FA.mkCanvas(w, Math.round((w * b.h) / b.w));
    const x = c.getContext('2d');
    const fx = FA.FX_BY[it.fx || 'none'];
    x.filter = (fx && fx.filter) || 'none';
    x.drawImage(b.canvas, 0, 0, c.width, c.height);
    if (fx && fx.tint) { x.filter = 'none'; x.fillStyle = fx.tint; x.fillRect(0, 0, c.width, c.height); }
    return c.toDataURL('image/jpeg', 0.8);
  };

  // ------------------------------------------------------------ 播放器
  const P = (FA.Player = {
    t: 0, playing: false, engine: null, audio: new FA.AudioPlayer(), ready: Promise.resolve(),
  });
  const view = h('canvas', { class: 'view' });
  const seek = h('input', { type: 'range', class: 'seek', min: 0, max: 1000, value: 0, title: '拖曳到想看的位置' });
  const time = h('span', { class: 'time' }, '00:00.0 / 00:00');
  const playBtn = h('button', { title: '播放／暫停（空白鍵）', onclick: () => P.toggle() }, '▶');
  const overlay = h('div', { class: 'overlay' });
  const stage = h('div', { class: 'stage' }, view, overlay);
  P.root = h('div', { class: 'player' }, stage,
    h('div', { class: 'ctrl' }, playBtn, h('button', { title: '停止（回到開頭）', onclick: () => { P.pause(); P.seek(0); } }, '■'), seek, time,
      h('button', { title: '全螢幕預覽', onclick: () => P.fullscreen() }, '⛶')));

  P.mount = function (slot) { if (slot && P.root.parentNode !== slot) slot.append(P.root); P.fit(); };
  P.fit = function () {
    const show = FA.show();
    if (!show) return;
    const H = 540, W = Math.round(H * FA.ar() / 2) * 2;
    if (!P.engine) P.engine = new FA.Engine(W, H);
    P.engine.resize(W, H);
    view.width = W; view.height = H;
    requestAnimationFrame(layoutOverlay);
  };
  new ResizeObserver(() => layoutOverlay()).observe(stage);

  let prepToken = 0;
  P.refresh = function () {
    const show = FA.show();
    if (!show) return;
    P.fit();
    P.engine.setShow(show, S.project.media);
    P.total = P.engine.tm.total;
    const token = ++prepToken;
    P.ready = (async () => {
      await P.engine.ensureAll();
      if (token !== prepToken) return;
      if (!P.playing) { await P.engine.seekVideos(P.t); P.render(); }
    })().catch(FA.err);
    P.render();
  };
  P.render = function () {
    if (!P.engine || !P.engine.show) return;
    if (P.t > P.total) P.t = P.total;
    P.engine.draw(P.t, !P.playing);
    view.getContext('2d').drawImage(P.engine.out, 0, 0);
    seek.value = Math.round((P.t / Math.max(P.total, 0.01)) * 1000);
    time.textContent = FA.fmtTime(P.t, true) + ' / ' + FA.fmtTime(P.total);
    S.t = P.t;
    FA.emit('time', P.t);
    layoutOverlay();
  };
  P.seek = async function (t) {
    P.t = Math.max(0, Math.min(t, P.total || 0));
    if (P.playing) { P.audio.start(P.t); syncVideos(true); return; }
    P.render();
    await P.engine.seekVideos(P.t);
    P.render();
  };
  seek.addEventListener('input', () => P.seek((seek.value / 1000) * (P.total || 0)));

  function syncVideos(force) {
    const e = P.engine, show = e.show;
    const loc = FA.locate(show, e.tm, P.t);
    const active = new Set();
    if (loc) for (const k of [loc.a, loc.b]) if (k >= 0 && show.items[k].type === 'video') active.add(show.items[k].id);
    show.items.forEach((it, k) => {
      if (it.type !== 'video') return;
      const v = e.videos.get(it.id);
      if (!v) return;
      if (!active.has(it.id)) { if (!v.paused) v.pause(); return; }
      const target = e.videoTime(it, P.t - e.tm.starts[k]);
      v.playbackRate = +it.speed || 1;
      if (force || Math.abs(v.currentTime - target) > 0.25) v.currentTime = target;
      if (v.paused) v.play().catch(() => 0);
    });
  }
  P.play = async function () {
    if (!FA.show() || P.playing) return;
    if (P.t >= P.total - 0.05) P.t = 0;
    playBtn.textContent = '⏳';
    await P.ready;
    await P.audio.prepare(P.engine.show, P.engine.tm).catch((e) => console.warn(e));
    P.playing = true;
    playBtn.textContent = '⏸';
    P.audio.start(P.t);
    syncVideos(true);
    const loop = () => {
      if (!P.playing) return;
      P.t = P.audio.now();
      if (P.t >= P.total) { P.t = P.total; P.render(); P.pause(); return; }
      syncVideos(false);
      P.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  P.pause = function () {
    P.playing = false;
    playBtn.textContent = '▶';
    P.audio.stop();
    if (P.engine) for (const v of P.engine.videos.values()) v.pause();
  };
  P.stop = () => P.pause();
  P.toggle = () => (P.playing ? P.pause() : P.play());
  P.fullscreen = function () {
    if (document.fullscreenElement) return document.exitFullscreen();
    P.root.requestFullscreen && P.root.requestFullscreen();
  };
  // 預覽單一片段（例如在轉場清單上按兩下）
  P.playFrom = function (t) { P.pause(); P.t = t; P.play(); };

  // ------------------------------------------------------------ 在預覽畫面上拖曳文字、剪貼畫
  let handle = null;
  function layoutOverlay() {
    const r = FA.rect(view), sr = FA.rect(stage);
    overlay.style.left = r.left - sr.left + 'px'; overlay.style.top = r.top - sr.top + 'px';
    overlay.style.width = r.width + 'px'; overlay.style.height = r.height + 'px';
    overlay.innerHTML = '';
    handle = null;
    const sel = FA.selected();
    if (!sel || !S.sel || !['title', 'clip'].includes(S.sel.kind) || S.tab !== 'personalize') return;
    if (P.t < sel.start || P.t > sel.start + sel.dur) return;
    const k = r.width / view.width;
    let box;
    if (S.sel.kind === 'title') box = FA.textBox(view.getContext('2d'), sel, view.width, view.height);
    else { const s = (sel.w || 0.18) * view.height; box = { x: sel.x * view.width - s / 2, y: sel.y * view.height - s / 2, w: s, h: s }; }
    handle = h('div', { class: 'handle', style: { left: box.x * k + 'px', top: box.y * k + 'px', width: box.w * k + 'px', height: box.h * k + 'px' }, title: '拖曳移動；拉右下角圓點調整大小' }, h('div', { class: 'rs' }));
    overlay.append(handle);
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const resize = e.target.classList.contains('rs');
      const sx = FA.cx(e), sy = FA.cy(e), ox = sel.x ?? 0.5, oy = sel.y ?? 0.5, os = S.sel.kind === 'title' ? sel.size || 0.08 : sel.w || 0.18;
      const id = sel.id, kind = S.sel.kind;
      const mv = (ev) => {
        const dx = (FA.cx(ev) - sx) / r.width, dy = (FA.cy(ev) - sy) / r.height;
        FA.edit(() => {
          const o = FA.listOf(kind).find((x) => x.id === id);
          if (!o) return;
          if (resize) { const f = Math.max(0.2, 1 + (dx + dy) * 2); if (kind === 'title') o.size = Math.max(0.02, Math.min(0.4, os * f)); else o.w = Math.max(0.03, Math.min(1, os * f)); }
          else { o.x = Math.max(0, Math.min(1, ox + dx)); o.y = Math.max(0, Math.min(1, oy + dy)); }
        }, 'drag-' + id);
      };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); FA.emit('inspector'); };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    });
  }

  FA.on('change', (what) => { if (what === 'aspect') P.engine = null; P.refresh(); });
  FA.on('select', () => layoutOverlay());
  FA.on('tab', () => { P.fit(); P.render(); });
})();
