/* 第 1 步「整理」：影片段清單、加入相片影片、排列順序、旋轉、移除、每張秒數。 */
(function () {
  const FA = window.FA;
  const { $, h } = FA;
  const S = FA.S;
  let multi = new Set();       // 多選的項目 id

  // ------------------------------------------------------------ 影片段
  function renderShows() {
    const list = $('#show-list');
    list.innerHTML = '';
    const shows = S.project.data.shows;
    shows.forEach((sh, i) => {
      const tm = FA.timing(sh);
      const acts = h('div', { class: 'acts' },
        h('button', { class: 'mini', title: '改名', onclick: async (e) => { e.stopPropagation(); const n = await FA.prompt('影片段改名', sh.name); if (n) FA.edit(() => (sh.name = n)); } }, '改名'),
        h('button', { class: 'mini', title: '往上', onclick: (e) => { e.stopPropagation(); if (i > 0) { FA.edit(() => { shows.splice(i - 1, 0, shows.splice(i, 1)[0]); }); S.showIdx = i - 1; FA.changed('show'); } } }, '▲'),
        h('button', { class: 'mini', title: '往下', onclick: (e) => { e.stopPropagation(); if (i < shows.length - 1) { FA.edit(() => { shows.splice(i + 1, 0, shows.splice(i, 1)[0]); }); S.showIdx = i + 1; FA.changed('show'); } } }, '▼'),
        h('button', { class: 'mini', title: '複製', onclick: (e) => { e.stopPropagation(); FA.edit(() => { const c = JSON.parse(JSON.stringify(sh)); c.id = FA.uid(); c.name += '（複製）'; shows.splice(i + 1, 0, c); }); } }, '複製'),
        h('button', { class: 'mini', title: '刪除', onclick: async (e) => { e.stopPropagation(); if (shows.length < 2) return FA.toast('至少要保留一段影片'); if (await FA.confirm('刪除影片段「' + sh.name + '」？', '刪除', true)) { FA.edit(() => shows.splice(i, 1)); S.showIdx = Math.max(0, i - 1); FA.changed('show'); } } }, '🗑'));
      list.append(h('div', { class: 'show-it' + (i === S.showIdx ? ' on' : ''), onclick: () => { if (S.showIdx !== i) { S.showIdx = i; S.sel = null; multi.clear(); FA.Player.pause(); FA.Player.t = 0; FA.changed('show'); } } },
        h('div', { class: 't' }, (i + 1) + '. ' + sh.name), h('div', { class: 'm' }, sh.items.length + ' 個・' + FA.fmtTime(tm.total)), acts));
    });
  }
  $('#show-add').addEventListener('click', () => {
    const n = S.project.data.shows.length + 1;
    FA.edit(() => S.project.data.shows.push(FA.newShow('影片 ' + n)));
    S.showIdx = S.project.data.shows.length - 1;
    FA.changed('show');
  });

  // ------------------------------------------------------------ 相片格子
  let dragFrom = null;
  function renderGrid() {
    const grid = $('#org-grid'), sh = FA.show();
    grid.innerHTML = '';
    $('#drop-hint').style.display = sh.items.length ? 'none' : '';
    const tm = FA.timing(sh);
    sh.items.forEach((it, i) => {
      const m = FA.media(it.media);
      const im = h('div', { class: 'im' }, h('span', { class: 'num' }, String(i + 1)),
        h('span', { class: 'kind' }, it.type === 'video' ? '🎬 影片' : it.type === 'card' ? 'T 文字卡' : '📷'));
      FA.itemThumb(it, 240).then((u) => { if (u) im.style.backgroundImage = 'url("' + u + '")'; });
      const name = it.type === 'card' ? ((it.texts || [])[0] || {}).text || '文字卡' : (m && m.name) || '';
      const tile = h('div', { class: 'tile' + (multi.has(it.id) ? ' sel' : ''), draggable: 'true', 'data-id': it.id, title: name + '\n按兩下：編輯；拖曳：調整順序' },
        im, h('div', { class: 'cap' }, h('span', { class: 'n' }, name), h('span', {}, FA.itemDur(it).toFixed(1) + ' 秒')));
      tile.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) { multi.has(it.id) ? multi.delete(it.id) : multi.add(it.id); }
        else if (e.shiftKey && S.sel && S.sel.kind === 'item') {
          const a = sh.items.findIndex((x) => x.id === S.sel.id);
          const [lo, hi] = a < i ? [a, i] : [i, a];
          for (let k = lo; k <= hi; k++) multi.add(sh.items[k].id);
        } else { multi = new Set([it.id]); }
        FA.select('item', it.id, { seek: tm.starts[i] + Math.min(0.5, FA.itemDur(it) / 3) });
      });
      tile.addEventListener('dblclick', () => FA.Editor.open(it));
      tile.addEventListener('dragstart', (e) => { dragFrom = it.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.id); });
      tile.addEventListener('dragover', (e) => { if (dragFrom) { e.preventDefault(); tile.classList.add('dragover'); } });
      tile.addEventListener('dragleave', () => tile.classList.remove('dragover'));
      tile.addEventListener('drop', (e) => {
        tile.classList.remove('dragover');
        if (!dragFrom || dragFrom === it.id) return;
        e.preventDefault(); e.stopPropagation();
        const from = dragFrom;
        dragFrom = null;
        FA.edit((s) => { const a = s.items.findIndex((x) => x.id === from); const [x] = s.items.splice(a, 1); const b = s.items.findIndex((y) => y.id === it.id); s.items.splice(a < b + 1 && a <= b ? b + 1 : b, 0, x); });
      });
      tile.addEventListener('dragend', () => (dragFrom = null));
      grid.append(tile);
    });
  }

  // 從檔案總管拖進來
  const grid = $('#org-grid');
  grid.addEventListener('dragover', (e) => { if (!dragFrom && e.dataTransfer.types.includes('Files')) { e.preventDefault(); grid.classList.add('drag'); } });
  grid.addEventListener('dragleave', () => grid.classList.remove('drag'));
  grid.addEventListener('drop', async (e) => {
    grid.classList.remove('drag');
    if (dragFrom || !e.dataTransfer.files.length) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => /^(image|video)\//.test(f.type) || /\.(heic|tif|tiff|avi|wmv|mpg|mpeg|3gp|mkv|flv|mts|m2ts)$/i.test(f.name));
    const audio = Array.from(e.dataTransfer.files).filter((f) => /^audio\//.test(f.type));
    addMedia(await FA.uploadFiles(files));
    if (audio.length) FA.addMusic(await FA.uploadFiles(audio, 'audio'));
  });

  function addMedia(list) {
    const ms = (list || []).filter((m) => m.kind === 'photo' || m.kind === 'video');
    if (!ms.length) return;
    FA.edit((sh) => {
      let at = sh.items.length;
      if (S.sel && S.sel.kind === 'item') { const k = sh.items.findIndex((x) => x.id === S.sel.id); if (k >= 0) at = k + 1; }
      // 依拍攝時間排序後插入
      ms.sort((a, b) => String(a.taken_at || '').localeCompare(String(b.taken_at || '')));
      sh.items.splice(at, 0, ...ms.map(FA.itemFromMedia));
    });
    FA.toast('已加入 ' + ms.length + ' 個素材', 'ok');
  }
  FA.addMedia = addMedia;
  $('#btn-add-files').addEventListener('click', async () => addMedia(await FA.importFiles()));

  function targets() {
    const sh = FA.show();
    const ids = multi.size ? multi : new Set(S.sel && S.sel.kind === 'item' ? [S.sel.id] : []);
    return sh.items.filter((x) => ids.has(x.id));
  }
  $('#btn-rot-l').addEventListener('click', () => { const t = targets(); if (!t.length) return FA.toast('請先點選相片'); FA.edit(() => t.forEach((x) => (x.rot = ((x.rot || 0) + 270) % 360))); });
  $('#btn-rot-r').addEventListener('click', () => { const t = targets(); if (!t.length) return FA.toast('請先點選相片'); FA.edit(() => t.forEach((x) => (x.rot = ((x.rot || 0) + 90) % 360))); });
  $('#btn-edit').addEventListener('click', () => { const t = targets(); if (!t.length) return FA.toast('請先點選要編輯的相片或影片'); FA.Editor.open(t[0]); });
  $('#btn-del').addEventListener('click', () => removeSel());
  function removeSel() {
    const t = new Set(targets().map((x) => x.id));
    if (!t.size) return FA.toast('請先點選要移除的相片');
    FA.edit((sh) => { sh.items = sh.items.filter((x) => !t.has(x.id)); });
    multi.clear(); FA.select(null);
  }
  FA.on('delete-key', () => { if (S.tab === 'organize') removeSel(); });
  $('#sort-by').addEventListener('change', (e) => {
    const how = e.target.value;
    e.target.value = '';
    if (!how) return;
    FA.edit((sh) => {
      const key = (it) => { const m = FA.media(it.media) || {}; return how === 'taken' ? (m.taken_at || m.created_at || '') : (m.name || ''); };
      if (how === 'random') sh.items.sort(() => Math.random() - 0.5);
      else if (how === 'reverse') sh.items.reverse();
      else sh.items.sort((a, b) => String(key(a)).localeCompare(String(key(b)), 'zh-Hant', { numeric: true }));
    });
  });
  $('#btn-all-dur').addEventListener('click', () => {
    const d = Math.max(1, +$('#all-dur').value || 5);
    FA.edit((sh) => sh.items.forEach((x) => { if (x.type !== 'video') x.dur = d; }));
    FA.toast('所有相片都改成每張 ' + d + ' 秒');
  });

  // ------------------------------------------------------------ 右側：選取項目的設定
  FA.itemProps = function (box) {
    box.innerHTML = '';
    const it = FA.selected();
    if (!it || S.sel.kind !== 'item') {
      const sh = FA.show();
      box.append(h('h4', {}, '這段影片'), h('p', { class: 'hint' }, '點一下相片可以設定秒數與轉場；按兩下可以裁切、加特效、修紅眼。'),
        h('div', {}, '共 ' + sh.items.length + ' 個素材，長度 ' + FA.fmtTime(FA.timing(sh).total)),
        h('label', { class: 'fld' }, '相片擺放', sel(['fit', '完整顯示（空白處用模糊背景）'], ['fill', '填滿畫面（可能裁掉邊緣）'], sh.fit || 'fit', (v) => FA.edit((s) => (s.fit = v)))),
        h('label', { class: 'fld' }, '空白背景', sel(['blur', '模糊的相片'], ['color', '純色'], (sh.bg && sh.bg.type) || 'blur', (v) => FA.edit((s) => (s.bg = Object.assign(s.bg || {}, { type: v }))))),
        h('label', { class: 'fld' }, h('input', { type: 'checkbox', checked: sh.fadeEnds !== false, onchange: (e) => FA.edit((s) => (s.fadeEnds = e.target.checked)) }), ' 開頭與結尾淡入淡出'));
      return;
    }
    const sh = FA.show(), idx = sh.items.indexOf(it), m = FA.media(it.media);
    box.append(h('h4', {}, '第 ' + (idx + 1) + ' 個：' + (it.type === 'card' ? '文字卡' : m ? m.name : '')));
    if (m) box.append(h('div', { class: 'hint' }, (m.width ? m.width + '×' + m.height : '') + (m.taken_at ? '　拍攝 ' + m.taken_at : '') + (m.kind === 'video' ? '　原長 ' + m.duration.toFixed(1) + ' 秒' : '')));
    const dur = h('input', { type: 'number', class: 'num', min: 0.5, max: 600, step: 0.5, value: FA.itemDur(it).toFixed(1) });
    dur.addEventListener('change', () => FA.edit(() => { it.dur = Math.max(0.5, +dur.value || 5); if (it.type === 'video' && m) it.dur = Math.min(it.dur, (m.duration - (it.in || 0)) / (it.speed || 1)); }));
    box.append(h('label', { class: 'fld' }, '顯示秒數 ', dur));
    const tsel = h('select', {}, h('option', { value: 'none' }, '（無轉場）'), ...(window.FA_TRANSITIONS || []).map((t) => h('option', { value: t.id, selected: it.trans && it.trans.id === t.id }, t.zh)));
    if (!it.trans || it.trans.id === 'none') tsel.value = 'none';
    tsel.addEventListener('change', () => FA.edit(() => (it.trans = { id: tsel.value, dur: (it.trans && it.trans.dur) || 1 })));
    const td = h('input', { type: 'number', class: 'num', min: 0.2, max: 5, step: 0.1, value: (it.trans && it.trans.dur) || 1 });
    td.addEventListener('change', () => FA.edit(() => (it.trans = { id: (it.trans && it.trans.id) || 'Fade', dur: +td.value || 1 })));
    if (idx < sh.items.length - 1) box.append(h('label', { class: 'fld' }, '接到下一張的轉場', tsel), h('label', { class: 'fld' }, '轉場秒數 ', td));
    if (it.type !== 'card') {
      box.append(h('label', { class: 'fld' }, '動態（鏡頭移動）', sel(...FA.MOTIONS.filter((x) => x.id !== 'custom' || (it.motion && it.motion.kind === 'custom')).map((x) => [x.id, x.name]), (it.motion && it.motion.kind) || (it.type === 'video' ? 'none' : 'auto'), (v) => FA.edit(() => (it.motion = { kind: v })))));
      box.append(h('label', { class: 'fld' }, '相片特效', sel(...FA.FX.map((x) => [x.id, x.name]), it.fx || 'none', (v) => FA.edit(() => (it.fx = v)))));
    }
    box.append(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn', onclick: () => FA.Editor.open(it) }, it.type === 'card' ? '✎ 編輯文字卡' : '✎ 進階編輯（裁切、紅眼、調色…）')));
  };
  function sel(...args) {
    const onchange = args.pop(), value = args.pop();
    const s = h('select', { class: 'inp' }, args.map(([v, t]) => h('option', { value: v }, t)));
    s.value = value;
    s.addEventListener('change', () => onchange(s.value));
    return s;
  }
  FA.selectEl = sel;

  FA.on('change', (what) => { if (!FA.show()) return; renderShows(); if (S.tab === 'organize') { renderGrid(); FA.itemProps($('#org-props')); } });
  FA.on('select', () => { if (S.tab === 'organize') { renderGrid(); FA.itemProps($('#org-props')); } });
  FA.on('tab', (t) => { if (t === 'organize') { renderGrid(); FA.itemProps($('#org-props')); } });
})();
