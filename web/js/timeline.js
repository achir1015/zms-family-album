/* 下方面板：腳本（相片＋轉場）與時間軸（音樂、旁白音效、文字、相片影片、場景特效、剪貼畫 六條軌）。 */
(function () {
  const FA = window.FA;
  const { $, h } = FA;
  const S = FA.S;
  let view = 'story';
  const sb = $('#storyboard'), tl = $('#timeline');

  $('#view-story').addEventListener('click', () => setView('story'));
  $('#view-time').addEventListener('click', () => setView('time'));
  function setView(v) {
    view = v;
    $('#view-story').classList.toggle('on', v === 'story');
    $('#view-time').classList.toggle('on', v === 'time');
    sb.classList.toggle('hidden', v !== 'story');
    tl.classList.toggle('hidden', v !== 'time');
    $('.zoomlbl').style.visibility = v === 'time' ? 'visible' : 'hidden';
    render();
  }
  FA.setBottomView = setView;
  $('#tl-zoom').addEventListener('input', () => render());

  // ------------------------------------------------------------ 腳本
  let dragId = null;
  function renderStory() {
    const sh = FA.show();
    sb.innerHTML = '';
    if (!sh.items.length) { sb.append(h('div', { class: 'hint', style: { margin: 'auto' } }, '還沒有相片。請到「1 整理」加入相片或影片。')); return; }
    const tm = FA.timing(sh);
    sh.items.forEach((it, i) => {
      const im = h('div', { class: 'im' });
      FA.itemThumb(it, 160).then((u) => { if (u) im.style.backgroundImage = 'url("' + u + '")'; });
      const el = h('div', { class: 'sb-item' + (S.sel && S.sel.kind === 'item' && S.sel.id === it.id ? ' sel' : ''), draggable: 'true', 'data-id': it.id, title: '點一下選取；按兩下編輯；拖曳調整順序' },
        im, h('div', { class: 'cap' }, h('span', {}, (i + 1) + (it.type === 'video' ? ' 🎬' : it.type === 'card' ? ' T' : '')), h('span', {}, FA.itemDur(it).toFixed(1) + '″')));
      el.addEventListener('click', () => FA.select('item', it.id, { seek: tm.starts[i] + 0.3 }));
      el.addEventListener('dblclick', () => FA.Editor.open(it));
      el.addEventListener('dragstart', (e) => { dragId = it.id; e.dataTransfer.setData('fa/item', it.id); });
      el.addEventListener('dragover', (e) => { if (dragId) { e.preventDefault(); el.classList.add('dragover'); } });
      el.addEventListener('dragleave', () => el.classList.remove('dragover'));
      el.addEventListener('drop', (e) => {
        el.classList.remove('dragover');
        if (!dragId || dragId === it.id) return;
        e.preventDefault();
        const from = dragId; dragId = null;
        FA.edit((s) => { const a = s.items.findIndex((x) => x.id === from); const [x] = s.items.splice(a, 1); let b = s.items.findIndex((y) => y.id === it.id); if (a <= b) b++; s.items.splice(b, 0, x); });
      });
      el.addEventListener('dragend', () => (dragId = null));
      sb.append(el);
      if (i < sh.items.length - 1) {
        const tr = it.trans && it.trans.id !== 'none' ? FA.TRANSITION_BY[it.trans.id] : null;
        const slot = h('div', { class: 'sb-trans' + (S.sel && S.sel.kind === 'trans' && S.sel.id === it.id ? ' sel' : ''), title: (tr ? tr.zh : '無轉場') + '\n點一下選取；可以把左邊的轉場拖到這裡' }, tr ? tr.zh : '—');
        slot.addEventListener('click', () => FA.select('trans', it.id, { seek: Math.max(0, tm.starts[i + 1] - 0.3) }));
        slot.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('fa/trans')) { e.preventDefault(); slot.classList.add('dragover'); } });
        slot.addEventListener('dragleave', () => slot.classList.remove('dragover'));
        slot.addEventListener('drop', (e) => {
          const id = e.dataTransfer.getData('fa/trans');
          if (!id) return;
          e.preventDefault();
          FA.edit(() => (it.trans = { id, dur: (it.trans && it.trans.dur) || 1 }));
          FA.select('trans', it.id); FA.Player.playFrom(Math.max(0, tm.starts[i + 1] - 0.8));
        });
        sb.append(slot);
      }
    });
  }

  // ------------------------------------------------------------ 時間軸
  const TRACKS = [
    ['music', '♫ 音樂'], ['voice', '🎤 旁白音效'], ['title', 'T 文字'], ['item', '▣ 相片影片'], ['effect', '✦ 場景特效'], ['clip', '☺ 剪貼畫'],
  ];
  let head = null, inner = null;
  function pps() { return +$('#tl-zoom').value; }
  const LBL = 74;
  function audioLen(A) {
    const total = A.sfx ? FA.SFX_BY[A.sfx].dur : (FA.media(A.media) || {}).duration || 3;
    if (A.fit) return Math.max(0.5, FA.timing(FA.show()).total - (A.start || 0));
    return Math.max(0.3, (A.out || total) - (A.in || 0));
  }
  function renderTime() {
    const sh = FA.show(), tm = FA.timing(sh), k = pps();
    const width = LBL + Math.max(tm.total + 10, 30) * k;
    const sl = tl.scrollLeft;
    tl.innerHTML = '';
    inner = h('div', { class: 'tl-inner', style: { width: width + 'px' } });
    const ruler = h('div', { class: 'tl-ruler' });
    const step = k > 80 ? 1 : k > 30 ? 2 : k > 15 ? 5 : 10;
    for (let s = 0; s * k + LBL < width; s += step) {
      ruler.append(h('i', { style: { left: LBL + s * k + 'px' } }), h('span', { style: { left: LBL + s * k + 'px' } }, FA.fmtTime(s)));
    }
    ruler.addEventListener('pointerdown', (e) => {
      const r = FA.rect(inner);
      const mv = (ev) => FA.Player.seek(Math.max(0, (FA.cx(ev) - r.left - LBL) / k));
      mv(e);
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    inner.append(ruler);
    for (const [kind, label] of TRACKS) {
      const tr = h('div', { class: 'tl-track' + (kind === 'item' ? ' main' : ''), 'data-kind': kind }, h('div', { class: 'tl-label' }, label));
      const list = kind === 'item' ? sh.items : FA.listOf(kind);
      if (!list.length) tr.append(h('div', { class: 'tl-empty' }, { music: '按兩下加入音樂', voice: '按兩下錄旁白', title: '按兩下加入文字', item: '到「整理」加入相片', effect: '從左邊「場景特效」加入', clip: '從左邊「剪貼畫」加入' }[kind]));
      list.forEach((o, i) => {
        let start, dur, name;
        if (kind === 'item') { start = tm.starts[i]; dur = FA.itemDur(o); const m = FA.media(o.media); name = o.type === 'card' ? ((o.texts || [])[0] || {}).text || '文字卡' : (m && m.name) || ''; }
        else if (kind === 'music' || kind === 'voice') { start = o.start || 0; dur = audioLen(o); const m = FA.media(o.media); name = o.sfx ? FA.SFX_BY[o.sfx].name : (m && m.name) || ''; }
        else { start = o.start || 0; dur = o.dur || 1; name = kind === 'title' ? o.text : kind === 'effect' ? (FA.SCENE_BY[o.kind] || {}).name : kind === 'clip' ? ((window.FA_CLIPART || []).find((c) => c.id === o.art) || { name: '圖片' }).name : ''; }
        const cls = kind === 'item' ? o.type : kind;
        const el = h('div', { class: 'tl-clip ' + cls + (S.sel && S.sel.kind === kind && S.sel.id === o.id ? ' sel' : ''), style: { left: LBL + start * k + 'px', width: Math.max(6, dur * k) + 'px' }, title: (name || '') + '\n' + FA.fmtTime(start, true) + '，' + dur.toFixed(1) + ' 秒' },
          h('span', { class: 'lbl' }, String(name || '').replace(/\n/g, ' ')));
        if (kind === 'item') {
          FA.itemThumb(o, 120).then((u) => { if (u) el.style.backgroundImage = 'url("' + u + '")'; });
          const td = tm.tds[i];
          if (td > 0) el.append(h('div', { class: 'tr', style: { width: td * k + 'px' } }));
        }
        el.append(h('div', { class: 'rz', title: '拖曳調整長度' }));
        el.addEventListener('dblclick', () => (kind === 'item' ? FA.Editor.open(o) : null));
        el.addEventListener('pointerdown', (e) => dragClip(e, kind, o, start, dur, el));
        tr.append(el);
      });
      tr.addEventListener('dblclick', (e) => {
        if (e.target !== tr) return;
        const t = Math.max(0, (FA.cx(e) - FA.rect(inner).left - LBL) / k);
        FA.Player.seek(t);
        if (kind === 'title') FA.addTitle({ start: t });
        else if (kind === 'music') FA.importFiles({ kind: 'audio' }).then(FA.addMusic);
        else if (kind === 'voice') FA.recordVoice();
      });
      inner.append(tr);
    }
    head = h('div', { class: 'tl-head' });
    inner.append(head);
    tl.append(inner);
    tl.scrollLeft = sl;
    placeHead();
  }
  function dragClip(e, kind, o, start, dur, el) {
    e.preventDefault();
    e.stopPropagation();
    const k = pps(), sx = FA.cx(e), resize = e.target.classList.contains('rz');
    let moved = false;
    FA.select(kind, o.id);
    const mv = (ev) => {
      const dx = (FA.cx(ev) - sx) / k;
      if (!moved && Math.abs(FA.cx(ev) - sx) < 3) return;
      moved = true;
      if (kind === 'item') {
        if (resize) { el.style.width = Math.max(6, (dur + dx) * k) + 'px'; }
        else { el.style.transform = 'translateX(' + dx * k + 'px)'; el.style.zIndex = 5; }
        return;
      }
      FA.edit(() => {
        if (resize) {
          if (kind === 'music' || kind === 'voice') { const total = o.sfx ? FA.SFX_BY[o.sfx].dur : (FA.media(o.media) || {}).duration || dur; o.fit = false; o.out = Math.min(total, Math.max((o.in || 0) + 0.3, (o.in || 0) + dur + dx)); }
          else o.dur = Math.max(0.3, Math.round((dur + dx) * 10) / 10);
        } else o.start = Math.max(0, Math.round((start + dx) * 10) / 10);
      }, 'tl-' + o.id);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (!moved) { FA.Player.seek(kind === 'item' ? start + 0.3 : start + 0.1); return; }
      if (kind === 'item') {
        const dx = (FA.cx(ev) - sx) / k;
        if (resize) {
          FA.edit(() => {
            o.dur = Math.max(0.5, Math.round((dur + dx) * 10) / 10);
            if (o.type === 'video') { const m = FA.media(o.media); if (m) o.dur = Math.min(o.dur, (m.duration - (o.in || 0)) / (o.speed || 1)); }
          });
        } else {
          // 依放開的位置決定新順序
          const sh = FA.show(), tm = FA.timing(sh), t = start + dur / 2 + dx;
          FA.edit((s) => {
            const a = s.items.indexOf(o);
            s.items.splice(a, 1);
            let b = tm.starts.findIndex((st, i) => i !== a && st + FA.itemDur(sh.items[i]) / 2 > t);
            if (b < 0) b = s.items.length; else if (b > a) b--;
            s.items.splice(Math.max(0, Math.min(s.items.length, b)), 0, o);
          });
        }
      } else FA.emit('inspector');
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }
  function placeHead() {
    if (!head || view !== 'time') return;
    const x = LBL + (S.t || 0) * pps();
    head.style.left = x + 'px';
    if (FA.Player.playing && (x > tl.scrollLeft + tl.clientWidth - 40 || x < tl.scrollLeft + LBL)) tl.scrollLeft = x - LBL - 40;
  }
  function markStory() {
    if (view !== 'story') return;
    const sh = FA.show();
    if (!sh) return;
    const loc = FA.locate(sh, FA.timing(sh), S.t || 0);
    sb.querySelectorAll('.sb-item').forEach((el, i) => el.classList.toggle('playing', !!loc && (loc.a === i || loc.b === i)));
  }

  // ------------------------------------------------------------ 下方工具列
  $('#tl-add-music').addEventListener('click', async () => FA.addMusic(await FA.importFiles({ kind: 'audio' })));
  $('#tl-add-voice').addEventListener('click', () => FA.recordVoice());
  $('#tl-add-title').addEventListener('click', () => FA.addTitle({}));
  $('#tl-del').addEventListener('click', () => delSel());
  FA.on('delete-key', () => { if (S.tab === 'personalize') delSel(); });
  function delSel() {
    if (!S.sel) return FA.toast('請先點選要刪除的東西');
    if (S.sel.kind === 'trans') { FA.edit((sh) => { const it = sh.items.find((x) => x.id === S.sel.id); if (it) it.trans = { id: 'none', dur: 0 }; }); return; }
    const L = FA.listOf(S.sel.kind), o = FA.selected();
    if (!L || !o) return;
    FA.edit(() => L.splice(L.indexOf(o), 1));
    FA.select(null);
  }
  $('#tl-split').addEventListener('click', () => {
    const sh = FA.show(), tm = FA.timing(sh), t = S.t || 0;
    const loc = FA.locate(sh, tm, t);
    if (!loc) return;
    const i = loc.b >= 0 ? loc.b : loc.a, it = sh.items[i];
    const lt = t - tm.starts[i];
    if (lt < 0.5 || lt > FA.itemDur(it) - 0.5) return FA.toast('請把播放頭移到相片或影片中間再分割');
    FA.edit((s) => {
      const a = s.items[i], b = JSON.parse(JSON.stringify(a));
      b.id = FA.uid();
      const d = FA.itemDur(a);
      a.dur = Math.round(lt * 100) / 100;
      b.dur = Math.round((d - lt) * 100) / 100;
      if (a.type === 'video') b.in = (a.in || 0) + lt * (a.speed || 1);
      a.trans = { id: 'none', dur: 0 };
      s.items.splice(i + 1, 0, b);
    });
    FA.toast('已分割成兩段');
  });

  function render() {
    if (!FA.show() || S.tab === 'create') return;
    if (view === 'story') renderStory(); else renderTime();
  }
  FA.on('change', (what) => { if (String(what).startsWith('tl-') && view === 'time') { clearTimeout(render.t); render.t = setTimeout(render, 16); return; } render(); });
  FA.on('select', render);
  FA.on('tab', render);
  FA.on('time', () => { placeHead(); markStory(); });
})();
