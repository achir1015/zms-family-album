/* 第 2 步「個人化」：左邊素材庫（風格、轉場、動態、文字、剪貼畫、場景特效、相片特效、相框、音樂音效、片頭片尾），右邊屬性。 */
(function () {
  const FA = window.FA;
  const { $, h } = FA;
  const S = FA.S;
  const TABS = [
    ['style', '影片風格'], ['trans', '轉場'], ['motion', '動態'], ['text', '文字'], ['clip', '剪貼畫'], ['scene', '場景特效'],
    ['fx', '相片特效'], ['frame', '相框'], ['audio', '音樂音效'], ['intro', '片頭片尾'],
  ];
  let lib = 'style', filt = {};
  FA.libTab = (k) => { lib = k; renderLib(); };

  function renderTabs() {
    const box = $('#lib-tabs');
    box.innerHTML = '';
    for (const [k, t] of TABS) box.append(h('button', { class: k === lib ? 'on' : '', 'data-lib': k, onclick: () => { lib = k; renderTabs(); renderLib(); } }, t));
  }
  function chipsFor(key, cats, all) {
    const cur = filt[key] ?? (all ? '' : cats[0].id);
    const box = h('div', { class: 'chips' });
    if (all) box.append(h('span', { class: 'chip' + (cur === '' ? ' on' : ''), onclick: () => { filt[key] = ''; renderLib(); } }, '全部'));
    for (const c of cats) box.append(h('span', { class: 'chip' + (cur === c.id ? ' on' : ''), onclick: () => { filt[key] = c.id; renderLib(); } }, c.name));
    return [box, cur];
  }
  // 目前要套用的對象：選取的項目（可多選在整理頁），沒有就問要不要全部
  function selItems() {
    const sh = FA.show();
    if (S.sel && (S.sel.kind === 'item' || S.sel.kind === 'trans')) return sh.items.filter((x) => x.id === S.sel.id);
    return [];
  }
  function applyBar(label, fnSel, fnAll) {
    return h('div', { class: 'lib-actions' },
      h('button', { class: 'btn', onclick: () => { const t = selItems(); if (!t.length) return FA.toast('請先在下方點選一張相片（或轉場）'); FA.edit(() => fnSel(t)); } }, '套用到選取的'),
      h('button', { class: 'btn primary', onclick: () => FA.edit((sh) => fnAll(sh)) }, label || '套用到全部'));
  }

  // ------------------------------------------------------------ 範例圖（轉場、風格縮圖用）
  let SAMPLE = null;
  function samples() {
    if (SAMPLE) return SAMPLE;
    const a = FA.mkCanvas(192, 108), b = FA.mkCanvas(192, 108);
    let x = a.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 108);
    g.addColorStop(0, '#ff9a5a'); g.addColorStop(1, '#ffd36e'); x.fillStyle = g; x.fillRect(0, 0, 192, 108);
    x.fillStyle = '#fff5c0'; x.beginPath(); x.arc(140, 40, 16, 0, 7); x.fill();
    x.fillStyle = '#6b3e75'; x.beginPath(); x.moveTo(0, 108); x.lineTo(60, 50); x.lineTo(110, 90); x.lineTo(150, 60); x.lineTo(192, 108); x.fill();
    x = b.getContext('2d'); g = x.createLinearGradient(0, 0, 0, 108);
    g.addColorStop(0, '#4fb3ff'); g.addColorStop(1, '#bfe6ff'); x.fillStyle = g; x.fillRect(0, 0, 192, 108);
    x.fillStyle = '#5cbf5c'; x.fillRect(0, 80, 192, 28);
    x.fillStyle = '#e57373'; x.fillRect(70, 50, 50, 32); x.fillStyle = '#8d4f3a'; x.beginPath(); x.moveTo(62, 52); x.lineTo(95, 28); x.lineTo(128, 52); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(40, 25, 10, 0, 7); x.arc(52, 22, 12, 0, 7); x.arc(64, 26, 9, 0, 7); x.fill();
    return (SAMPLE = [a, b]);
  }
  const TRTH = new Map();
  function transThumb(id, p) {
    const key = id + '@' + p.toFixed(2);
    if (TRTH.has(key)) return TRTH.get(key);
    const [a, b] = samples();
    const glt = FA.sharedGLT || (FA.sharedGLT = new FA.GLT());
    let url = '';
    if (glt.draw(id, a, b, p, 192, 108)) url = glt.canvas.toDataURL('image/jpeg', 0.75);
    TRTH.set(key, url);
    return url;
  }

  // ------------------------------------------------------------ 各分頁
  function renderLib() {
    const box = $('#lib-body');
    box.innerHTML = '';
    if (lib !== 'audio') FA.stopMusicPreview();
    if (!FA.show()) return;
    const editable = S.project.editable;
    const R = LIB[lib];
    if (R) R(box);
    if (!editable) box.querySelectorAll('button').forEach((b) => (b.disabled = true));
  }
  const LIB = {};

  LIB.style = function (box) {
    const [chips, cat] = chipsFor('style', FA.STYLE_CATS, true);
    box.append(h('p', { class: 'hint' }, '好萊塢式影片風格：一鍵套好轉場、動態、相框、特效、片頭片尾。點一下看預覽，再按「套用」。'), chips);
    const grid = h('div', { class: 'cards' });
    const sh = FA.show();
    let picked = sh.style || '';
    for (const st of FA.STYLES.filter((s) => !cat || s.cat === cat)) {
      const c = FA.mkCanvas(192, 108), x = c.getContext('2d');
      const [a] = samples();
      x.drawImage(a, 0, 0);
      FA.drawFrame(x, st.frame, 192, 108);
      if (FA.SCENE_BY[st.scene]) FA.SCENE_BY[st.scene].draw(x, 192, 108, 3, 6, 0.6);
      FA.drawText(x, { text: st.intro || st.name, preset: st.text, size: 0.17, x: 0.5, y: 0.5, anim: 'none', animOut: 'none' }, 1, 2, 192, 108);
      grid.append(h('div', { class: 'card' + (picked === st.id ? ' on' : ''), title: st.name, onclick: (e) => { picked = st.id; grid.querySelectorAll('.card').forEach((k) => k.classList.remove('on')); e.currentTarget.classList.add('on'); previewStyle(st); } },
        c, st.three ? h('span', { class: 'tag3d' }, '3D') : null, h('div', { class: 'nm' }, st.name)));
    }
    box.append(grid);
    const withCards = h('input', { type: 'checkbox', checked: true }), withFx = h('input', { type: 'checkbox', checked: true });
    box.append(h('div', { class: 'lib-actions', style: { flexDirection: 'column', alignItems: 'stretch' } },
      h('label', { class: 'inline' }, withCards, '加上片頭、片尾文字卡'), h('label', { class: 'inline' }, withFx, '套用風格的相片特效與相框'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => FA.edit((s) => clearStyle(s)) }, '清除風格'),
        h('button', { class: 'btn primary', onclick: () => { const st = FA.STYLE_BY[picked]; if (!st) return FA.toast('請先點選一種風格'); FA.edit((s) => applyStyle(s, st, withCards.checked, withFx.checked)); FA.toast('已套用「' + st.name + '」風格', 'ok'); FA.Player.playFrom(0); } }, '套用風格'))));
  };
  function previewStyle(st) {
    // 預覽：在副本上套用，播放 8 秒（不影響相簿）
    const copy = JSON.parse(JSON.stringify(FA.show()));
    applyStyle(copy, st, true, true);
    const P = FA.Player;
    P.pause();
    P.engine.setShow(copy, S.project.media);
    P.total = P.engine.tm.total;
    P.ready = P.engine.ensureAll();
    P.t = 0;
    P.previewing = true;
    P.play();
  }
  FA.on('change', () => { FA.Player.previewing = false; });
  function clearStyle(sh) {
    sh.items = sh.items.filter((x) => !x.fromStyle);
    sh.cliparts = sh.cliparts.filter((x) => !x.fromStyle);
    sh.effects = sh.effects.filter((x) => !x.fromStyle);
    sh.titles = sh.titles.filter((x) => !x.fromStyle);
    delete sh.frame; delete sh.style;
    sh.items.forEach((x) => { delete x.fx; x.motion = { kind: 'auto' }; x.trans = { id: 'Fade', dur: 1 }; });
  }
  function applyStyle(sh, st, withCards, withFx) {
    sh.items = sh.items.filter((x) => !x.fromStyle);
    sh.cliparts = sh.cliparts.filter((x) => !x.fromStyle);
    sh.effects = sh.effects.filter((x) => !x.fromStyle);
    sh.style = st.id;
    const tr = st.trans.filter((id) => FA.TRANSITION_BY[id]);
    sh.items.forEach((it, i) => {
      it.trans = { id: tr[i % tr.length] || 'Fade', dur: st.td };
      if (it.type === 'photo') { it.dur = st.dur; it.motion = { kind: st.motion }; if (withFx) it.fx = st.fx; }
    });
    if (withFx) sh.frame = st.frame; else delete sh.frame;
    if (withCards && (st.intro || st.credit)) {
      const company = (S.state && S.state.company) || '';
      const intro = { id: FA.uid(), type: 'card', fromStyle: true, dur: 5, card: { bg: st.card }, trans: { id: tr[0] || 'Fade', dur: st.td },
        texts: [{ id: FA.uid(), text: st.intro || S.project.name, preset: st.text, size: 0.11, x: 0.5, y: 0.45, anim: st.anim, animOut: 'none' },
          { id: FA.uid(), text: S.project.name !== st.intro ? S.project.name : new Date().getFullYear() + '', preset: 'plain', size: 0.045, x: 0.5, y: 0.62, anim: 'fade', start: 1, animOut: 'none' }] };
      const credit = { id: FA.uid(), type: 'card', fromStyle: true, dur: 7, card: { bg: st.card }, trans: { id: 'Fade', dur: 1 },
        texts: [{ id: FA.uid(), text: (st.credit || 'The End') + '\n\n' + (company ? company + '\n' : '') + new Date().toLocaleDateString('zh-TW'), preset: st.text, size: 0.07, x: 0.5, y: 0.5, anim: 'fade', loop: 'scroll', animOut: 'none' }] };
      sh.items.unshift(intro);
      sh.items.push(credit);
      const [ca, cb] = st.clip || [];
      if (ca) sh.cliparts.push({ id: FA.uid(), fromStyle: true, art: ca, start: 0.6, dur: 4.2, x: 0.2, y: 0.72, w: 0.22, anim: 'float' });
      if (cb) sh.cliparts.push({ id: FA.uid(), fromStyle: true, art: cb, start: 1, dur: 3.8, x: 0.8, y: 0.28, w: 0.2, anim: 'swing' });
    }
    if (st.scene) {
      const tm = FA.timing(sh);
      sh.effects.push({ id: FA.uid(), fromStyle: true, kind: st.scene, start: 0, dur: Math.max(1, tm.itemsEnd), amount: 0.8 });
    }
  }
  FA.applyStyle = applyStyle;

  LIB.trans = function (box) {
    const cats = window.FA_TRANSITION_CATS || [];
    const [chips, cat] = chipsFor('trans', cats.concat([{ id: '__3d', name: '只看 3D' }]), false);
    box.append(h('p', { class: 'hint' }, '共 ' + (window.FA_TRANSITIONS || []).length + ' 種 2D／3D 轉場。滑鼠移上去會播放；可以直接拖到下方兩張相片中間的方塊。'), chips);
    const grid = h('div', { class: 'cards' });
    const list = (window.FA_TRANSITIONS || []).filter((t) => (cat === '__3d' ? t.three : t.cat === cat));
    const cur = selItems()[0];
    let picked = cur && cur.trans ? cur.trans.id : '';
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { const im = en.target; im.src = transThumb(im.dataset.id, 0.5) || ''; io.unobserve(im); } }), { root: box });
    for (const t of list) {
      const im = h('img', { class: 'pv', 'data-id': t.id, alt: '' });
      io.observe(im);
      let timer = null;
      const card = h('div', { class: 'card' + (picked === t.id ? ' on' : ''), title: t.zh + '（' + t.id + '）', draggable: 'true',
        onclick: () => { picked = t.id; grid.querySelectorAll('.card').forEach((k) => k.classList.toggle('on', k === card)); const s = selItems(); if (s.length) FA.edit(() => s.forEach((x) => (x.trans = { id: t.id, dur: (x.trans && x.trans.dur) || 1 }))); },
        onmouseenter: () => { let p = 0; timer = setInterval(() => { p = (p + 0.06) % 1.3; im.src = transThumb(t.id, Math.min(1, p)) || im.src; }, 60); },
        onmouseleave: () => { clearInterval(timer); im.src = transThumb(t.id, 0.5); } }, im, t.three ? h('span', { class: 'tag3d' }, '3D') : null, h('div', { class: 'nm' }, t.zh));
      card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('fa/trans', t.id); });
      grid.append(card);
    }
    box.append(grid);
    const td = h('input', { type: 'number', class: 'num', min: 0.2, max: 5, step: 0.1, value: 1 });
    box.append(h('div', { class: 'lib-actions', style: { flexWrap: 'wrap' } }, h('label', { class: 'inline' }, '轉場秒數', td),
      h('button', { class: 'btn', onclick: () => FA.edit((sh) => { const all = (window.FA_TRANSITIONS || []).filter((t) => t.cat === cat || (cat === '__3d' && t.three)); sh.items.forEach((x) => (x.trans = { id: all[Math.floor(Math.random() * all.length)].id, dur: +td.value || 1 })); }) }, '這類隨機'),
      h('button', { class: 'btn primary', onclick: () => { if (!picked) return FA.toast('請先點選一種轉場'); FA.edit((sh) => sh.items.forEach((x) => (x.trans = { id: picked, dur: +td.value || 1 }))); } }, '全部套用')));
  };

  LIB.motion = function (box) {
    box.append(h('p', { class: 'hint' }, '動態＝相片播放時鏡頭慢慢推近、拉遠或平移（Ken Burns 效果）。自訂起點終點請在相片上按兩下。'));
    const grid = h('div', { class: 'cards' });
    let picked = 'auto';
    for (const m of FA.MOTIONS.filter((x) => x.id !== 'custom')) {
      const c = FA.mkCanvas(192, 108);
      const [a] = samples();
      const draw = (p) => { const mm = m.from ? m : FA.MOTION_BY.zoomin; const z = mm.from.z + (mm.to.z - mm.from.z) * p, ox = mm.from.x + (mm.to.x - mm.from.x) * p, oy = mm.from.y + (mm.to.y - mm.from.y) * p; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 192, 108); x.drawImage(a, 96 - 96 * z - ox * 192 * z, 54 - 54 * z - oy * 108 * z, 192 * z, 108 * z); };
      draw(0.5);
      let timer;
      grid.append(h('div', { class: 'card', onclick: (e) => { picked = m.id; grid.querySelectorAll('.card').forEach((k) => k.classList.remove('on')); e.currentTarget.classList.add('on'); const s = selItems(); if (s.length) FA.edit(() => s.forEach((x) => (x.motion = { kind: m.id }))); },
        onmouseenter: () => { let p = 0; timer = setInterval(() => { p = (p + 0.03) % 1; draw(p); }, 40); }, onmouseleave: () => { clearInterval(timer); draw(0.5); } }, c, h('div', { class: 'nm' }, m.name)));
    }
    box.append(grid, applyBar('全部相片套用', (t) => t.forEach((x) => (x.motion = { kind: picked })), (sh) => sh.items.forEach((x) => { if (x.type === 'photo') x.motion = { kind: picked }; })));
  };

  LIB.text = function (box) {
    box.append(h('p', { class: 'hint' }, '點一種文字效果，就會在播放頭的位置加一段文字（可以拖到畫面上任何地方）。'));
    const grid = h('div', { class: 'cards' });
    for (const p of FA.TEXT_PRESETS) {
      const c = FA.mkCanvas(192, 70), x = c.getContext('2d');
      x.fillStyle = '#4a5a6d'; x.fillRect(0, 0, 192, 70);
      FA.drawText(x, { text: '家庭相簿', preset: p.id, size: 0.38, x: 0.5, y: 0.5, anim: 'none', animOut: 'none' }, 1, 2, 192, 70);
      grid.append(h('div', { class: 'card', title: '加入「' + p.name + '」文字', onclick: () => addTitle({ preset: p.id }) }, c, h('div', { class: 'nm' }, p.name)));
    }
    box.append(grid);
    box.append(h('h5', {}, '常用字幕'), h('div', { class: 'cards' },
      [['subtitle', '下方字幕', { y: 0.86, size: 0.055, preset: 'subtitle', text: '在這裡輸入字幕' }], ['bar', '黑底字幕條', { y: 0.86, size: 0.05, preset: 'bar', text: '地點／日期' }],
        ['title', '大標題', { y: 0.3, size: 0.1, preset: 'gold', anim: 'pop' }], ['date', '日期標記', { x: 0.82, y: 0.1, size: 0.04, preset: 'whitebar', text: new Date().toLocaleDateString('zh-TW') }]]
        .map(([k, n, o]) => h('button', { class: 'btn', onclick: () => addTitle(o) }, n))));
  };
  function addTitle(o) {
    const t = FA.S.t || 0;
    const T = Object.assign({ id: FA.uid(), text: '在這裡輸入文字', preset: 'plain', size: 0.08, x: 0.5, y: 0.5, start: Math.max(0, t), dur: 4, anim: 'fade', animOut: 'fade' }, o);
    FA.edit((sh) => sh.titles.push(T));
    FA.select('title', T.id);
    FA.Player.seek(T.start + 1);
  }
  FA.addTitle = addTitle;

  LIB.clip = function (box) {
    const cats = [...new Set((window.FA_CLIPART || []).map((c) => c.cat))].map((c) => ({ id: c, name: c }));
    const [chips, cat] = chipsFor('clip', cats, false);
    box.append(h('p', { class: 'hint' }, '點一下就會加在播放頭的位置，可以在畫面上拖曳、拉大小。'), chips);
    const anim = FA.selectEl(...FA.CLIP_ANIMS.map((a) => [a.id, a.name]), filt.clipAnim || 'float', (v) => (filt.clipAnim = v));
    box.append(h('label', { class: 'inline', style: { marginBottom: '6px' } }, '動畫 ', anim));
    const grid = h('div', { class: 'clipgrid' });
    for (const c of (window.FA_CLIPART || []).filter((x) => x.cat === cat)) {
      grid.append(h('div', { class: 'card', title: c.name, onclick: () => {
        const C = { id: FA.uid(), art: c.id, start: Math.max(0, FA.S.t || 0), dur: 4, x: 0.2 + Math.random() * 0.6, y: 0.25 + Math.random() * 0.5, w: 0.2, anim: anim.value };
        FA.edit((sh) => sh.cliparts.push(C)); FA.select('clip', C.id); FA.Player.seek(C.start + 0.8);
      } }, h('img', { src: FA.clipartURL(c.id), loading: 'lazy', alt: c.name }), h('div', { class: 'nm' }, c.name)));
    }
    box.append(grid);
    box.append(h('div', { class: 'lib-actions' }, h('button', { class: 'btn', onclick: async () => {
      const ms = (await FA.importFiles({ kind: 'photo' })).filter((m) => m.kind === 'photo');
      for (const m of ms) { const C = { id: FA.uid(), art: m.id, start: Math.max(0, FA.S.t || 0), dur: 4, x: 0.75, y: 0.7, w: 0.3, anim: 'none' }; FA.edit((sh) => sh.cliparts.push(C)); FA.select('clip', C.id); }
    } }, '＋ 用自己的去背圖（PNG）')));
  };

  LIB.scene = function (box) {
    box.append(h('p', { class: 'hint' }, '場景特效會疊在相片上方。點一下加在播放頭位置（預設 6 秒），也可以按「整段影片」。'));
    const grid = h('div', { class: 'cards' });
    const [a] = samples();
    for (const sc of FA.SCENES) {
      const c = FA.mkCanvas(192, 108), x = c.getContext('2d');
      const draw = (t) => { x.drawImage(a, 0, 0); sc.draw(x, 192, 108, t, 10, 1); };
      draw(2.5);
      let timer;
      grid.append(h('div', { class: 'card', title: sc.name,
        onmouseenter: () => { let t = 0; timer = setInterval(() => { t += 0.05; draw(t); }, 50); }, onmouseleave: () => { clearInterval(timer); draw(2.5); } },
        c, h('div', { class: 'nm' }, sc.name),
        h('div', { class: 'row', style: { padding: '2px' } },
          h('button', { class: 'mini', onclick: () => addScene(sc.id, false) }, '加入'), h('button', { class: 'mini', onclick: () => addScene(sc.id, true) }, '整段影片'))));
    }
    box.append(grid);
  };
  function addScene(kind, whole) {
    const sh = FA.show(), tm = FA.timing(sh);
    const E = whole ? { id: FA.uid(), kind, start: 0, dur: Math.max(2, tm.itemsEnd), amount: 1 } : { id: FA.uid(), kind, start: Math.max(0, FA.S.t || 0), dur: 6, amount: 1 };
    FA.edit((s) => s.effects.push(E));
    FA.select('effect', E.id);
    FA.Player.seek(E.start + 1);
  }

  LIB.fx = function (box) {
    box.append(h('p', { class: 'hint' }, '舊照片、森林、反向等特效。點選後按「套用到選取的」或「全部」。'));
    const grid = h('div', { class: 'cards c3' });
    const [a, b] = samples();
    let picked = 'none';
    for (const fx of FA.FX) {
      const c = FA.mkCanvas(120, 68), x = c.getContext('2d');
      x.filter = fx.filter || 'none'; x.drawImage(b, 0, 0, 120, 68); x.filter = 'none';
      if (fx.tint) { x.fillStyle = fx.tint; x.fillRect(0, 0, 120, 68); }
      grid.append(h('div', { class: 'card', onclick: (e) => { picked = fx.id; grid.querySelectorAll('.card').forEach((k) => k.classList.remove('on')); e.currentTarget.classList.add('on'); const s = selItems(); if (s.length) FA.edit(() => s.forEach((x2) => (x2.fx = fx.id))); } }, c, h('div', { class: 'nm' }, fx.name)));
    }
    box.append(grid, applyBar('全部套用', (t) => t.forEach((x) => (x.fx = picked)), (sh) => sh.items.forEach((x) => { if (x.type !== 'card') x.fx = picked; })));
  };

  LIB.frame = function (box) {
    box.append(h('p', { class: 'hint' }, '幫相片加上相框。選取一張相片時只套用那一張，否則整段影片都套用。'));
    const grid = h('div', { class: 'cards' });
    const [, b] = samples();
    for (const f of FA.FRAMES) {
      const c = FA.mkCanvas(192, 108), x = c.getContext('2d');
      x.drawImage(b, 0, 0); FA.drawFrame(x, f.id, 192, 108);
      grid.append(h('div', { class: 'card', onclick: () => { const s = selItems(); FA.edit((sh) => { if (s.length) s.forEach((it) => (it.frame = f.id)); else { sh.frame = f.id; sh.items.forEach((it) => delete it.frame); } }); } }, c, h('div', { class: 'nm' }, f.name)));
    }
    box.append(grid);
  };

  LIB.audio = function (box) {
    const sh = FA.show();
    box.append(h('h5', {}, '背景音樂（MP3、WAV、OGG、M4A、WMA）'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: async () => FA.addMusic(await FA.importFiles({ kind: 'audio' })) }, '♫ 加入音樂檔'), h('button', { class: 'btn', onclick: () => FA.recordVoice() }, '🎤 錄旁白')));
    const list = h('div', {});
    for (const A of sh.music.concat(sh.voice)) {
      const m = FA.media(A.media);
      list.append(h('div', { class: 'show-it', onclick: () => FA.select(sh.music.includes(A) ? 'music' : 'voice', A.id) }, h('div', { class: 't' }, (sh.music.includes(A) ? '♫ ' : '🎤 ') + (A.sfx ? FA.SFX_BY[A.sfx].name : m ? m.name : '')), h('div', { class: 'm' }, '從 ' + FA.fmtTime(A.start) + ' 開始' + (A.fit ? '・配合影片長度' : ''))));
    }
    box.append(list);
    box.append(musicLibrary());
    box.append(h('h5', {}, '音效（點一下加在播放頭）'), h('div', { class: 'chips' }, FA.SFX.map((s) => h('span', { class: 'chip', onclick: async () => {
      const A = { id: FA.uid(), sfx: s.id, start: Math.max(0, FA.S.t || 0), vol: 1 };
      FA.edit((x) => x.voice.push(A)); FA.select('voice', A.id);
      const ac = new AudioContext(); const src = ac.createBufferSource(); src.buffer = await FA.sfxBuffer(s.id); src.connect(ac.destination); src.start();
    } }, '🔔 ' + s.name))));
    box.append(h('label', { class: 'fld' }, h('input', { type: 'checkbox', checked: sh.duck !== false, onchange: (e) => FA.edit((x) => (x.duck = e.target.checked)) }), ' 有旁白時自動把音樂調小'));
  };
  // ------------------------------------------------ 內附背景音樂（Kevin MacLeod，CC BY 4.0）
  let musicList = null, musicGroup = '溫馨抒情', musicAudio = null, musicPlaying = '';
  FA.loadMusicLib = async function () {
    if (!musicList) {
      try { musicList = await (await fetch('assets/music/music.json')).json(); } catch (e) { musicList = []; }
    }
    return musicList;
  };
  FA.stopMusicPreview = function () { if (musicAudio) musicAudio.pause(); musicPlaying = ''; };
  FA.musicCredit = function (m) {
    if (!m || !musicList) return '';
    const x = musicList.find((t) => m.name === t.name + '.m4a');
    return x ? x.credit : '';
  };
  function musicLibrary() {
    const wrap = h('div', { class: 'music-lib' });
    FA.loadMusicLib().then((ls) => {
      if (!ls.length) return;
      const groups = [...new Set(ls.map((m) => m.group))];
      const body = h('div', {});
      const tabs = h('div', { class: 'chips' });
      const draw = () => {
        tabs.innerHTML = ''; body.innerHTML = '';
        groups.forEach((g) => tabs.append(h('span', { class: 'chip' + (g === musicGroup ? ' on' : ''), onclick: () => { musicGroup = g; draw(); } }, g)));
        for (const m of ls.filter((x) => x.group === musicGroup)) {
          const playing = musicPlaying === m.file;
          body.append(h('div', { class: 'music-row' + (playing ? ' on' : '') },
            h('button', { class: 'btn sm', title: playing ? '停止試聽' : '試聽', onclick: () => {
              if (playing) { FA.stopMusicPreview(); draw(); return; }
              if (!musicAudio) { musicAudio = new Audio(); musicAudio.onended = () => { musicPlaying = ''; draw(); }; }
              musicAudio.src = 'assets/music/' + m.file; musicAudio.currentTime = 0; musicAudio.play();
              musicPlaying = m.file; draw();
            } }, playing ? '■' : '▶'),
            h('div', { class: 'mi' }, h('div', { class: 't' }, m.name), h('div', { class: 'm' }, FA.fmtTime(m.dur) + '・' + m.title)),
            h('button', { class: 'btn sm primary', onclick: async () => {
              FA.stopMusicPreview();
              const b = FA.busy('加入音樂…');
              try { const r = await FA.api('music_import', { file: m.file }); FA.S.project.media[r.id] = r; FA.addMusic([r]); }
              catch (e) { FA.toast(e.message, 'err'); } finally { b.close(); }
            } }, '＋ 加入')));
        }
      };
      draw();
      wrap.append(h('h5', {}, '內附背景音樂（' + ls.length + ' 首，點 ▶ 試聽）'), tabs, body,
        h('p', { class: 'hint' }, '音樂作者 Kevin MacLeod（incompetech.com），以創用 CC 姓名標示 4.0 授權。影片放到網路分享時，請在說明欄註明曲名與作者（選取音樂後右邊可以複製標示文字）。'));
    });
    return wrap;
  }
  FA.addMusic = function (ms) {
    const list = (ms || []).filter((m) => m.kind === 'audio');
    if (!list.length) return;
    FA.edit((sh) => {
      let at = sh.music.reduce((t, A) => Math.max(t, (A.start || 0) + (A.dur || FA.media(A.media)?.duration || 0)), 0);
      for (const m of list) {
        const A = { id: FA.uid(), media: m.id, start: sh.music.length ? at : 0, vol: 0.8, fadeIn: 1, fadeOut: 2, fit: !sh.music.length && list.length === 1 };
        sh.music.push(A);
        at += m.duration;
      }
    });
    FA.toast('已加入音樂。預設會配合影片長度重複播放並在結尾淡出，可以在右邊修改。', 'ok');
  };

  LIB.intro = function (box) {
    box.append(h('p', { class: 'hint' }, '片頭、片尾與段落標題文字卡。點一下加入，按兩下文字卡可以修改文字與背景。'));
    const tpl = [
      ['片頭：大標題', 'start', { bg: 'night', texts: [['我們的家庭相簿', 'gold', 0.11, 0.45, 'pop'], [new Date().getFullYear() + '', 'plain', 0.05, 0.62, 'fade', 1]] }],
      ['片頭：浪漫', 'start', { bg: 'love', texts: [['我們的故事', 'love', 0.11, 0.45, 'letters'], ['Our Story', 'script', 0.06, 0.62, 'fade', 1]] }],
      ['片頭：寶寶', 'start', { bg: 'baby', texts: [['寶貝成長日記', 'bubble', 0.11, 0.45, 'popchars']] }],
      ['片頭：旅行', 'start', { bg: 'ocean', texts: [['旅行回憶', 'ocean', 0.11, 0.42, 'left'], ['地點・日期', 'bar', 0.05, 0.62, 'fade', 1]] }],
      ['片頭：復古', 'start', { bg: 'vintage', texts: [['那些年', 'retro', 0.12, 0.45, 'type']] }],
      ['片頭：喜慶', 'start', { bg: 'red', texts: [['新年快樂', 'red', 0.13, 0.45, 'pop']] }],
      ['段落標題', 'here', { bg: 'black', texts: [['第一章', 'elegant', 0.09, 0.5, 'blur']] }],
      ['片尾：感謝名單（捲動）', 'end', { bg: 'black', dur: 9, texts: [['感謝觀賞\n\n攝影：爸爸\n剪輯：媽媽\n主角：寶貝\n\n' + new Date().toLocaleDateString('zh-TW'), 'plain', 0.06, 0.5, 'fade', 0, 'scroll']] }],
      ['片尾：The End', 'end', { bg: 'night', texts: [['The End', 'elegant', 0.12, 0.5, 'blur'], ['謝謝觀賞', 'plain', 0.05, 0.65, 'fade', 1.2]] }],
    ];
    const grid = h('div', { class: 'cards' });
    for (const [name, where, o] of tpl) {
      const card = { type: 'card', dur: o.dur || 5, card: { bg: o.bg }, texts: o.texts.map(([text, preset, size, y, anim, start, loop]) => ({ text, preset, size, x: 0.5, y, anim, animOut: 'none', start: start || 0, loop: loop || 'none' })) };
      const c = FA.mkCanvas(192, 108), x = c.getContext('2d');
      FA.drawCardBg(x, card.card, 1, 192, 108);
      card.texts.forEach((T) => FA.drawText(x, Object.assign({}, T, { anim: 'none', loop: 'none' }), 2, 4, 192, 108));
      grid.append(h('div', { class: 'card', onclick: () => {
        const it = JSON.parse(JSON.stringify(card)); it.id = FA.uid(); it.trans = { id: 'Fade', dur: 1 }; it.texts.forEach((T) => (T.id = FA.uid()));
        FA.edit((sh) => {
          if (where === 'start') sh.items.unshift(it);
          else if (where === 'end') sh.items.push(it);
          else { const k = S.sel && S.sel.kind === 'item' ? sh.items.findIndex((y) => y.id === S.sel.id) : -1; sh.items.splice(k >= 0 ? k + 1 : sh.items.length, 0, it); }
        });
        FA.select('item', it.id);
      } }, c, h('div', { class: 'nm' }, name)));
    }
    box.append(grid);
  };

  // ------------------------------------------------------------ 錄旁白
  FA.recordVoice = async function () {
    // 錄音方式：瀏覽器麥克風（Windows WebView2、Chrome）；Mac 版 WKWebView 沒有 getUserMedia → 改用程式內建 FFmpeg 錄音
    const useNative = !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && FA.native && FA.native.mic_start;
    let stream = null, rec = null;
    const chunks = [];
    if (!useNative) {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { return FA.toast('無法使用麥克風：請確認電腦有麥克風，並允許本程式使用。', 'err'); }
      rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '' });
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    }
    const at = Math.max(0, FA.S.t || 0);
    const timer = h('div', { style: { fontSize: '34px', textAlign: 'center', fontFamily: 'Consolas, Menlo, monospace' } }, '00:00');
    const status = h('p', { style: { textAlign: 'center' } }, '按「開始錄音」後，畫面會從播放頭位置（' + FA.fmtTime(at) + '）開始播放（靜音），您可以邊看邊說。');
    let t0 = 0, iv = null, recording = false, nativePath = '';
    const stopAll = async () => {
      clearInterval(iv); FA.Player.pause(); FA.Player.audio.muted = false;
      if (useNative) { if (recording) nativePath = await FA.native.mic_stop(); }
      else if (rec.state === 'recording') rec.stop();
      recording = false;
    };
    const res = await FA.dialog({ title: '🎤 錄旁白', body: h('div', {}, status, timer), esc: false, buttons: [
      { label: '取消', value: null, onClick: async () => { await stopAll(); if (stream) stream.getTracks().forEach((t) => t.stop()); } },
      { label: '開始錄音', primary: true, onClick: async () => {
        if (recording) { await stopAll(); return 'done'; }
        if (useNative) {
          const ok = await FA.native.mic_start();
          if (!ok || ok.error) { FA.toast('無法使用麥克風：' + ((ok && ok.error) || '請在「系統設定 → 隱私權與安全性 → 麥克風」允許本程式'), 'err'); return false; }
        } else rec.start();
        recording = true; t0 = Date.now(); status.textContent = '錄音中…說完請按「停止」';
        FA.Player.audio.muted = true; FA.Player.playFrom(at);
        iv = setInterval(() => (timer.textContent = FA.fmtTime((Date.now() - t0) / 1000)), 200);
        document.querySelector('.dlg .btn.primary').textContent = '■ 停止';
        return false;
      } }] });
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (res !== 'done') return;
    const name = '旁白 ' + new Date().toLocaleTimeString('zh-TW', { hour12: false }).replace(/:/g, '');
    let m;
    if (useNative) {
      if (!nativePath) return FA.toast('沒有錄到聲音：第一次錄音時 macOS 會詢問是否允許使用麥克風，請按「允許」；若已拒絕，請到「系統設定 → 隱私權與安全性 → 麥克風」打開本程式。', 'err');
      const r = await FA.api('import_paths', { paths: [nativePath], kind: 'audio', name: name + '.m4a' });
      m = r.items[0];
      if (!m) return FA.toast((r.errors || []).join('\n') || '旁白加入失敗', 'err');
      FA.S.project.media[m.id] = m;
    } else {
      await new Promise((r) => (rec.state === 'inactive' ? r() : (rec.onstop = r)));
      // Safari 錄出來是 MP4（AAC），Windows 版是 WebM（Opus）→ 副檔名跟著實際格式
      const mt = rec.mimeType || (chunks[0] && chunks[0].type) || 'audio/webm';
      const ext = /mp4|aac|m4a/.test(mt) ? '.m4a' : '.webm';
      const file = new File([new Blob(chunks, { type: mt })], name + ext, { type: mt });
      [m] = await FA.uploadFiles([file], 'audio');
      if (!m) return;
    }
    const A = { id: FA.uid(), media: m.id, start: at, vol: 1 };
    FA.edit((sh) => sh.voice.push(A));
    FA.select('voice', A.id);
    FA.toast('旁白已加入', 'ok');
  };

  // ------------------------------------------------------------ 右側屬性
  function renderInspector() {
    const box = $('#inspector');
    box.innerHTML = '';
    const sh = FA.show();
    if (!sh) return;
    const sel = S.sel;
    if (sel && sel.kind === 'trans') return transInspector(box, sh.items.find((x) => x.id === sel.id));
    const o = FA.selected();
    if (!o) {
      box.append(h('h3', {}, '屬性'), h('p', { class: 'hint' }, '在下方腳本或時間軸點選相片、轉場、文字、剪貼畫、特效或音樂，這裡就會出現可以調整的設定。'));
      FA.itemProps(box);
      return;
    }
    const del = (kind) => h('button', { class: 'btn danger', style: { marginTop: '10px' }, onclick: () => { FA.edit(() => { const L = FA.listOf(kind); L.splice(L.indexOf(o), 1); }); FA.select(null); } }, '刪除');
    const timeFields = (kind) => {
      const st = h('input', { type: 'number', class: 'num', min: 0, step: 0.1, value: (+o.start || 0).toFixed(1) });
      const du = h('input', { type: 'number', class: 'num', min: 0.3, step: 0.1, value: (+o.dur || 4).toFixed(1) });
      st.addEventListener('change', () => FA.edit(() => (o.start = Math.max(0, +st.value || 0))));
      du.addEventListener('change', () => FA.edit(() => (o.dur = Math.max(0.3, +du.value || 4))));
      return h('div', { class: 'row' }, h('label', { class: 'fld' }, '開始（秒）', st), h('label', { class: 'fld' }, '長度（秒）', du));
    };
    if (sel.kind === 'item') { box.append(h('h3', {}, '相片／影片')); FA.itemProps(box); return; }
    if (sel.kind === 'title') {
      box.append(h('h3', {}, '文字'), timeFields());
      FA.textForm(box, o, () => FA.edit(() => {}, 'text-' + o.id));
      box.append(del('title'));
    } else if (sel.kind === 'clip') {
      box.append(h('h3', {}, '剪貼畫'), h('img', { src: typeof o.art === 'number' ? FA.mediaURL(o.art) : FA.clipartURL(o.art), style: { width: '80px' } }), timeFields());
      const sz = h('input', { type: 'range', min: 3, max: 100, value: Math.round((o.w || 0.2) * 100), style: { width: '100%' } });
      sz.addEventListener('input', () => FA.edit(() => (o.w = sz.value / 100), 'csz-' + o.id));
      const rot = h('input', { type: 'range', min: -180, max: 180, value: o.rot || 0, style: { width: '100%' } });
      rot.addEventListener('input', () => FA.edit(() => (o.rot = +rot.value), 'crot-' + o.id));
      box.append(h('label', { class: 'fld' }, '大小', sz), h('label', { class: 'fld' }, '旋轉角度', rot),
        h('label', { class: 'fld' }, '動畫', FA.selectEl(...FA.CLIP_ANIMS.map((a) => [a.id, a.name]), o.anim || 'none', (v) => FA.edit(() => (o.anim = v)))),
        h('label', { class: 'fld' }, h('input', { type: 'checkbox', checked: !!o.flip, onchange: (e) => FA.edit(() => (o.flip = e.target.checked)) }), ' 左右翻轉'), del('clip'));
    } else if (sel.kind === 'effect') {
      box.append(h('h3', {}, '場景特效'), timeFields(),
        h('label', { class: 'fld' }, '特效', FA.selectEl(...FA.SCENES.map((s) => [s.id, s.name]), o.kind, (v) => FA.edit(() => (o.kind = v)))));
      const am = h('input', { type: 'range', min: 10, max: 300, value: Math.round((o.amount ?? 1) * 100), style: { width: '100%' } });
      am.addEventListener('input', () => FA.edit(() => (o.amount = am.value / 100), 'eam-' + o.id));
      box.append(h('label', { class: 'fld' }, '數量／強度', am), del('effect'));
    } else if (sel.kind === 'music' || sel.kind === 'voice') audioInspector(box, o, sel.kind, del);
  }
  function transInspector(box, it) {
    if (!it) return;
    const t = FA.TRANSITION_BY[(it.trans || {}).id];
    box.append(h('h3', {}, '轉場'), h('p', {}, t ? t.zh : '（無轉場，直接切換）'));
    const td = h('input', { type: 'number', class: 'num', min: 0.2, max: 5, step: 0.1, value: (it.trans && it.trans.dur) || 1 });
    td.addEventListener('change', () => FA.edit(() => (it.trans = { id: (it.trans && it.trans.id) || 'Fade', dur: +td.value || 1 })));
    box.append(h('label', { class: 'fld' }, '轉場秒數 ', td), h('p', { class: 'hint' }, '到左邊「轉場」分頁點一種新的轉場就會換上去。'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { lib = 'trans'; renderTabs(); renderLib(); } }, '換一種轉場'), h('button', { class: 'btn', onclick: () => FA.edit(() => (it.trans = { id: 'none', dur: 0 })) }, '不要轉場')));
  }
  async function audioInspector(box, A, kind, del) {
    const m = FA.media(A.media);
    box.append(h('h3', {}, kind === 'music' ? '背景音樂' : A.sfx ? '音效' : '旁白'), h('p', {}, A.sfx ? FA.SFX_BY[A.sfx].name : m ? m.name : ''));
    if (kind === 'music' && m) {
      await FA.loadMusicLib();
      const cr = FA.musicCredit(m);
      if (cr) box.append(h('div', { class: 'hint' }, '授權標示（影片分享到網路時請貼在說明欄）：', h('div', { style: 'user-select:text;font-size:11px;margin:4px 0' }, cr),
        h('button', { class: 'btn sm', onclick: () => { navigator.clipboard.writeText(cr).then(() => FA.toast('已複製授權標示', 'ok')); } }, '📋 複製標示')));
    }
    const total = A.sfx ? FA.SFX_BY[A.sfx].dur : (m && m.duration) || 0;
    const st = h('input', { type: 'number', class: 'num', min: 0, step: 0.1, value: (+A.start || 0).toFixed(1) });
    st.addEventListener('change', () => FA.edit(() => (A.start = Math.max(0, +st.value || 0))));
    box.append(h('label', { class: 'fld' }, '從影片第幾秒開始 ', st));
    // 剪下工具：波形＋開始、結束
    const wf = FA.mkCanvas(270, 60);
    wf.style.width = '100%'; wf.style.background = '#10151c'; wf.style.borderRadius = '4px';
    box.append(h('div', { class: 'fld' }, '剪下要用的段落（拖曳兩條線）'), wf);
    const draw = (peaks) => {
      const x = wf.getContext('2d'); x.clearRect(0, 0, 270, 60);
      const a = (A.in || 0) / total * 270, b = ((A.out || total) / total) * 270;
      x.fillStyle = 'rgba(25,167,201,0.15)'; x.fillRect(a, 0, b - a, 60);
      x.fillStyle = '#4fa7d0';
      (peaks || []).forEach((p, i) => x.fillRect(i, 30 - p * 28, 1, p * 56 + 1));
      x.fillStyle = '#f7b733'; x.fillRect(a - 1, 0, 3, 60); x.fillRect(b - 2, 0, 3, 60);
    };
    let peaks = [];
    draw(peaks);
    FA.waveform(A, 270).then((w) => { peaks = w.peaks || []; draw(peaks); });
    wf.addEventListener('pointerdown', (e) => {
      const r = FA.rect(wf);
      const pos = (ev) => Math.max(0, Math.min(1, (FA.cx(ev) - r.left) / r.width)) * total;
      const p0 = pos(e), which = Math.abs(p0 - (A.in || 0)) < Math.abs(p0 - (A.out || total)) ? 'in' : 'out';
      const mv = (ev) => FA.edit(() => { const v = pos(ev); if (which === 'in') A.in = Math.min(v, (A.out || total) - 0.5); else A.out = Math.max(v, (A.in || 0) + 0.5); draw(peaks); info.textContent = trimInfo(); }, 'trim-' + A.id);
      mv(e);
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    const trimInfo = () => '使用 ' + FA.fmtTime(A.in || 0, true) + ' ～ ' + FA.fmtTime(A.out || total, true) + '（共 ' + ((A.out || total) - (A.in || 0)).toFixed(1) + ' 秒）';
    const info = h('div', { class: 'hint' }, trimInfo());
    box.append(info, h('button', { class: 'mini', onclick: () => FA.edit(() => { delete A.in; delete A.out; }) }, '取消剪下'));
    const vol = h('input', { type: 'range', min: 0, max: 200, value: Math.round((A.vol ?? 1) * 100), style: { width: '100%' } });
    vol.addEventListener('input', () => FA.edit(() => (A.vol = vol.value / 100), 'vol-' + A.id));
    const fi = h('input', { type: 'number', class: 'num', min: 0, max: 10, step: 0.5, value: A.fadeIn || 0 });
    const fo = h('input', { type: 'number', class: 'num', min: 0, max: 10, step: 0.5, value: A.fadeOut || 0 });
    fi.addEventListener('change', () => FA.edit(() => (A.fadeIn = +fi.value || 0)));
    fo.addEventListener('change', () => FA.edit(() => (A.fadeOut = +fo.value || 0)));
    box.append(h('label', { class: 'fld' }, '音量', vol), h('div', { class: 'row' }, h('label', { class: 'fld' }, '淡入（秒）', fi), h('label', { class: 'fld' }, '淡出（秒）', fo)));
    if (kind === 'music') box.append(h('label', { class: 'fld' }, h('input', { type: 'checkbox', checked: !!A.fit, onchange: (e) => FA.edit(() => { A.fit = e.target.checked; if (A.fit) A.loop = false; }) }), ' 配合影片長度（重複播放到結尾並淡出）'));
    box.append(h('button', { class: 'btn', onclick: () => FA.Player.playFrom(A.start || 0) }, '▶ 從這裡試聽'), ' ', del(kind));
  }

  FA.on('tab', (t) => { if (t === 'personalize') { renderTabs(); renderLib(); renderInspector(); } });
  FA.on('select', () => { if (S.tab === 'personalize') renderInspector(); });
  FA.on('inspector', () => { if (S.tab === 'personalize') renderInspector(); });
  let insTimer = null;
  FA.on('change', (what) => {
    if (S.tab !== 'personalize') return;
    if (String(what).startsWith('drag-') || String(what).startsWith('text-') || /^(csz|crot|eam|vol|trim)-/.test(what)) return;   // 拖曳中不要重畫表單
    clearTimeout(insTimer);
    insTimer = setTimeout(() => { renderInspector(); if (lib === 'audio') renderLib(); }, 30);
  });
})();
