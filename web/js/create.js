/* 第 3 步「製作」：選輸出格式 → 逐格畫出畫面送給 FFmpeg（桌面版）→ 存成影片檔。 */
(function () {
  const FA = window.FA;
  const { $, h } = FA;
  const S = FA.S;
  let P = null, cat = 'pc', picked = 'mp4', running = null;
  const ICON = { pc: '💻', hd: '🖥', apple: '', mobile: '📱', player: '🎮', web: '🌐', disc: '💿' };
  const SHARE = { youtube: 'https://www.youtube.com/upload', facebook: 'https://www.facebook.com/', vimeo: 'https://vimeo.com/upload', instagram: 'https://www.instagram.com/' };

  async function render() {
    if (!P) { try { P = await FA.get('presets'); } catch (e) { return FA.err(e); } }
    const cats = $('#out-cats');
    cats.innerHTML = '';
    for (const c of P.cats) cats.append(h('div', { class: 'out-cat' + (c.id === cat ? ' on' : ''), 'data-cat': c.id, onclick: () => { cat = c.id; const f = P.presets.find((p) => p.cat === cat); if (f) picked = f.id; render(); } }, (ICON[c.id] || '') + ' ' + c.name, h('small', {}, c.desc)));
    const grid = $('#out-presets');
    grid.innerHTML = '';
    for (const p of P.presets.filter((x) => x.cat === cat)) {
      grid.append(h('div', { class: 'preset' + (p.id === picked ? ' on' : ''), 'data-id': p.id, onclick: () => { picked = p.id; render(); } },
        h('b', {}, p.name), h('small', {}, p.desc), h('div', { class: 'hint', style: { padding: 0 } }, '.' + p.ext + '・' + (p.fixed && p.w ? p.w + '×' + p.h : p.h + 'p') + '・' + (+p.fps).toFixed(p.fps % 1 ? 2 : 0) + ' 格／秒')));
    }
    renderSettings();
    renderHistory();
  }
  async function renderSettings() {
    const box = $('#out-settings');
    box.innerHTML = '';
    const p = P.presets.find((x) => x.id === picked);
    if (!p) return;
    let comp = { default_out: '' };
    try { comp = await FA.get('company'); } catch (e) { /* 沒權限也沒關係 */ }
    const name = h('input', { class: 'inp', id: 'out-name', value: S.project.name });
    const folder = h('input', { class: 'inp', id: 'out-folder', value: S.outFolder || comp.default_out || '' });
    const pick = h('button', { class: 'btn', onclick: async () => { await FA.nativeReady; if (!FA.native) return; const f = await FA.native.pick_folder(folder.value); if (f) { folder.value = f; S.outFolder = f; } } }, '選擇…');
    const q = FA.selectEl(['high', '高畫質（檔案較大）'], ['normal', '標準（建議）'], ['small', '省空間'], S.outQuality || 'normal', (v) => (S.outQuality = v));
    const shows = S.project.data.shows;
    const range = FA.selectEl(['all', '全部影片段接在一起（' + shows.length + ' 段）'], ['cur', '只輸出目前這段：' + FA.show().name], S.outRange || 'all', (v) => (S.outRange = v));
    const go = h('button', { class: 'btn primary go', id: 'btn-export', disabled: !FA.can('EXPORT', 1) }, '🎬 開始製作影片');
    go.addEventListener('click', () => start(p, name.value.trim() || S.project.name, folder.value.trim(), S.outQuality || 'normal', S.outRange || 'all'));
    const prog = h('div', { class: 'progress', id: 'out-prog' }, h('div', {}));
    const msg = h('div', { class: 'hint', id: 'out-msg', style: { padding: '4px 0' } });
    box.append(h('h3', { style: { margin: '0 0 8px' } }, '輸出：' + p.name),
      h('div', { class: 'row' }, h('label', { class: 'fld' }, '檔名', name), h('label', { class: 'fld' }, '畫質', q)),
      FA.WEB ? h('p', { class: 'hint' }, window.ZMSAndroid || window.ZMSIOS ? '製作完成後會出現分享選單，可以存到相簿、檔案或傳給 LINE。' : '製作完成後會自動下載到瀏覽器的「下載」資料夾。影片在您的電腦上產生，不會上傳到網路。')
        : h('label', { class: 'fld' }, '儲存位置', h('div', { class: 'row' }, folder, h('span', { style: { flex: 'none' } }, pick))),
      h('label', { class: 'fld' }, '輸出範圍', range));
    if (p.cat === 'disc') box.append(h('p', { class: 'hint' }, '會產生符合 ' + p.name.replace('相容', '') + ' 規格的 MPEG 影片檔，可以用燒錄軟體（例如 Windows 內建的「燒錄到光碟」不支援影片光碟，建議用 ImgBurn、CDBurnerXP）燒成光碟在電視上播放。'));
    if (SHARE[p.id]) box.append(h('p', { class: 'hint' }, '製作完成後可以按「上傳到 ' + p.name + '」開啟網站，把影片拖進去上傳。'));
    if (!FA.can('EXPORT', 1)) box.append(h('p', { class: 'hint' }, '您沒有「輸出影片」的權限，請洽系統管理員。'));
    box.append(h('div', { class: 'row', style: { marginTop: '10px', alignItems: 'center' } }, h('span', { style: { flex: 'none' } }, go), h('div', { style: { flex: 1 } }, prog, msg)));
  }
  async function renderHistory() {
    const box = $('#out-history');
    box.innerHTML = '';
    box.append(h('h4', { style: { margin: '4px 0 6px' } }, '製作紀錄'));
    let rows = [];
    try { rows = await FA.get('exports', { pid: S.project.id }); } catch (e) { return; }
    if (!rows.length) box.append(h('div', { class: 'hint' }, '還沒有製作過影片。'));
    const st = { DONE: '✅ 完成', FAIL: '❌ 失敗', STOP: '⏹ 取消', RUN: '⏳ 進行中' };
    for (const r of rows) {
      const p = P && P.presets.find((x) => x.id === r.preset);
      box.append(h('div', { class: 'hist' }, h('div', {}, st[r.status] || r.status, '　', p ? p.name : r.preset, '　', r.size ? FA.fmtSize(r.size) : ''),
        h('div', { class: 'p' }, r.created_at + '　' + (r.path || '')),
        r.exists && FA.native ? h('div', { class: 'row', style: { marginTop: '3px' } }, h('button', { class: 'mini', onclick: () => FA.native.open_file(r.path) }, '▶ 播放'), h('button', { class: 'mini', onclick: () => FA.native.reveal(r.path) }, '📂 開啟資料夾')) : null));
    }
  }

  // ------------------------------------------------------------ 把多段影片接成一段
  FA.mergeShows = function (shows) {
    if (shows.length === 1) return JSON.parse(JSON.stringify(shows[0]));
    const out = FA.newShow('全部');
    let off = 0;
    shows.forEach((sh0, si) => {
      const sh = JSON.parse(JSON.stringify(sh0));
      const tm = FA.timing(sh);
      sh.items.forEach((it) => { if (it.frame === undefined && sh.frame) it.frame = sh.frame; if (it.fit === undefined && sh.fit) it.fit = sh.fit; });
      if (sh.items.length && si < shows.length - 1) { const last = sh.items[sh.items.length - 1]; if (!last.trans || last.trans.id === 'none') last.trans = { id: 'Fade', dur: 1 }; }
      // 下一段接上時，上一段最後的轉場會和下一段重疊
      const overlap = sh.items.length && si < shows.length - 1 ? Math.min(1, ((sh.items[sh.items.length - 1].trans || {}).dur || 1)) : 0;
      for (const k of ['titles', 'cliparts', 'effects', 'music', 'voice']) for (const o of sh[k]) {
        o.start = (o.start || 0) + off;
        if (o.fit) { o.fit = false; o.loop = true; o.dur = tm.total; o.fadeOut = Math.max(o.fadeOut || 0, 1.5); }
        out[k].push(o);
      }
      out.items.push(...sh.items);
      off += tm.itemsEnd - overlap;
    });
    return out;
  };

  // ------------------------------------------------------------ 輸出
  async function start(p, name, folder, quality, range) {
    if (running) return;
    await FA.saveNow();
    const shows = range === 'cur' ? [FA.show()] : S.project.data.shows.filter((s) => s.items.length);
    if (!shows.length || !shows.some((s) => s.items.length)) return FA.toast('影片裡還沒有相片或影片', 'err');
    const show = FA.mergeShows(shows);
    show.fit = show.fit || shows[0].fit; show.bg = shows[0].bg; show.frame = range === 'cur' ? shows[0].frame : undefined; show.duck = shows[0].duck;
    const tm = FA.timing(show);
    const go = $('#btn-export'), bar = $('#out-prog > div'), msg = $('#out-msg');
    FA.Player.pause();
    let job;
    try {
      job = await FA.api('export_start', { preset: p.id, aspect: FA.aspect(), name, folder, quality, project_id: S.project.id, seconds: tm.total, frames: Math.ceil(tm.total * p.fps) });
    } catch (e) { return FA.err(e); }
    running = { cancel: false, job: job.job };
    go.textContent = '⏹ 取消';
    go.onclick = async () => { if (await FA.confirm('要取消製作嗎？', '取消製作', true)) running.cancel = true; };
    const t0 = Date.now();
    try {
      const eng = new FA.Engine(job.width, job.height);
      eng.setShow(show, S.project.media);
      msg.textContent = '準備相片與影片…';
      await eng.ensureAll((f) => (bar.style.width = (f * 5).toFixed(1) + '%'));
      msg.textContent = '混合背景音樂、旁白與音效…';
      const wav = await FA.mixWav(show, eng.tm);
      if (p.audio) await FA.raw('export_audio', wav, { job: job.job });
      const fps = job.fps, n = Math.max(1, Math.ceil(eng.tm.total * fps));
      const hasVideo = show.items.some((x) => x.type === 'video');
      const inflight = new Set();
      let firstErr = null;
      const pv = $('.player canvas.view');
      for (let i = 0; i < n; i++) {
        if (running.cancel) throw new Error('已取消');
        if (firstErr) throw firstErr;
        const t = i / fps;
        if (hasVideo) await eng.seekVideos(t);
        eng.draw(t);
        if (FA.localFrame) await FA.localFrame(job.job, eng.out, i);      // 線上版／手機版：直接用 WebCodecs 編碼
        else {
          const blob = await new Promise((r) => eng.out.toBlob(r, 'image/jpeg', 0.93));
          const pr = blob.arrayBuffer().then((buf) => FA.raw('export_frame', buf, { job: job.job, i })).catch((e) => (firstErr = firstErr || e));
          inflight.add(pr);
          pr.finally(() => inflight.delete(pr));
          if (inflight.size >= 4) await Promise.race(inflight);
        }
        if (i % 6 === 0) {
          const f = (i + 1) / n, el = (Date.now() - t0) / 1000, eta = (el / f) * (1 - f);
          bar.style.width = (5 + f * 93).toFixed(1) + '%';
          msg.textContent = '製作中 ' + Math.floor(f * 100) + '%（' + FA.fmtTime(t) + ' / ' + FA.fmtTime(eng.tm.total) + '）　大約還要 ' + FA.fmtTime(eta);
          if (pv) { pv.width = 640; pv.height = Math.round(640 / FA.ar()); pv.getContext('2d').drawImage(eng.out, 0, 0, pv.width, pv.height); }
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      await Promise.all(inflight);
      if (firstErr) throw firstErr;
      msg.textContent = '最後壓縮與存檔…';
      const r = await finish(job.job);
      bar.style.width = '100%';
      msg.textContent = '完成！' + r.path + '（' + FA.fmtSize(r.size) + '，花了 ' + FA.fmtTime((Date.now() - t0) / 1000) + '）';
      done(r, p);
    } catch (e) {
      await FA.raw('export_cancel', new Uint8Array(0), { job: job.job }).catch(() => 0);
      msg.textContent = e.message === '已取消' ? '已取消' : '失敗：' + e.message;
      if (e.message !== '已取消') FA.err(e);
    } finally {
      running = null;
      go.textContent = '🎬 開始製作影片';
      go.onclick = null;
      renderHistory();
      FA.Player.refresh();
    }
  }
  async function finish(jobId) {
    return FA.raw('export_finish', new TextEncoder().encode('{}'), { job: jobId });
  }
  function done(r, p) {
    const btns = [];
    if (FA.native) btns.push({ label: '📂 開啟資料夾', onClick: () => { FA.native.reveal(r.path); return false; } }, { label: '▶ 播放影片', onClick: () => { FA.native.open_file(r.path); return false; } });
    if (SHARE[p.id]) btns.push({ label: '🌐 上傳到 ' + p.name, onClick: () => { FA.native ? FA.native.open_url(SHARE[p.id]) : window.open(SHARE[p.id]); FA.native && FA.native.reveal(r.path); return false; } });
    btns.push({ label: '關閉', primary: true, value: true });
    FA.dialog({ title: '🎉 影片製作完成', body: h('div', {}, h('p', {}, (r.web ? '已下載：' : '檔案：') + r.path), h('p', {}, '大小：' + FA.fmtSize(r.size))), buttons: btns });
  }
  FA.on('tab', (t) => { if (t === 'create') render(); });
})();
