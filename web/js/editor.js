/* 編輯視窗：相片（旋轉、翻轉、裁切、紅眼、亮度對比飽和、特效、自訂動態）、影片（剪頭尾、音量、速度）、文字卡。 */
(function () {
  const FA = window.FA;
  const { h } = FA;
  const clamp = FA.clamp;

  FA.Editor = { open };

  async function open(item) {
    if (item.type === 'card') return openCard(item);
    const work = JSON.parse(JSON.stringify(item));       // 先在副本上改，按「套用」才寫回
    const m = FA.media(item.media) || {};
    const isVideo = item.type === 'video';
    const stage = h('div', { class: 'ed-stage' });
    const cv = h('canvas');
    stage.append(cv);
    const side = h('div', { class: 'ed-side' });
    let mode = 'crop';
    let full = null;            // 旋轉後、未裁切的影像（相片）或影片元素
    let video = null;

    // ------------------------------------------------ 準備來源
    if (isVideo) {
      video = h('video', { src: FA.mediaURL(item.media), muted: true, preload: 'auto', playsinline: true });
      video.muted = true;
      await new Promise((r) => { video.onloadeddata = r; video.onerror = r; setTimeout(r, 6000); });
      video.currentTime = (work.in || 0) + 0.05;
    }
    async function rebuild() {
      if (isVideo) return;
      const b = await FA.bakePhoto(FA.mediaURL(item.media), Object.assign({}, work, { crop: null, adj: null }), 1400);
      full = b;
    }
    await rebuild();

    // ------------------------------------------------ 畫面
    let box = null;     // 畫布在舞台內的顯示範圍
    function srcSize() {
      if (isVideo) { const r = ((work.rot || 0) % 180) !== 0; return r ? [video.videoHeight, video.videoWidth] : [video.videoWidth, video.videoHeight]; }
      return [full.w, full.h];
    }
    function draw() {
      const [sw, sh] = srcSize();
      if (!sw) return;
      const maxW = 640, maxH = 460, k = Math.min(maxW / sw, maxH / sh);
      cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
      const x = cv.getContext('2d');
      x.save();
      const fx = FA.FX_BY[work.fx || 'none'];
      x.filter = [FA.adjFilter(work.adj), fx && fx.filter].filter(Boolean).join(' ') || 'none';
      if (isVideo) {
        x.translate(cv.width / 2, cv.height / 2); x.rotate(((work.rot || 0) * Math.PI) / 180); if (work.flip) x.scale(-1, 1);
        const vw = video.videoWidth * k, vh = video.videoHeight * k;
        x.drawImage(video, -vw / 2, -vh / 2, vw, vh);
      } else x.drawImage(full.canvas, 0, 0, cv.width, cv.height);
      x.restore();
      if (fx && fx.tint) { x.fillStyle = fx.tint; x.fillRect(0, 0, cv.width, cv.height); }
      box = { k, w: cv.width, h: cv.height };
      overlay();
    }
    // 裁切框／紅眼圈／動態框
    const ov = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } });
    stage.append(ov);
    function cvRect() { const r = FA.rect(cv), s = FA.rect(stage); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; }
    function overlay() {
      ov.innerHTML = '';
      const R = cvRect();
      if (mode === 'crop') {
        const c = work.crop || { x: 0, y: 0, w: 1, h: 1 };
        const el = h('div', { class: 'crop-box', style: { left: R.x + c.x * R.w + 'px', top: R.y + c.y * R.h + 'px', width: c.w * R.w + 'px', height: c.h * R.h + 'px', pointerEvents: 'auto' } });
        ['nw', 'ne', 'sw', 'se'].forEach((p) => el.append(h('div', { class: 'h', 'data-p': p, style: { [p[0] === 'n' ? 'top' : 'bottom']: '-7px', [p[1] === 'w' ? 'left' : 'right']: '-7px', cursor: p + '-resize' } })));
        ov.append(el);
        dragBox(el, R, () => work.crop || { x: 0, y: 0, w: 1, h: 1 }, (c2) => { work.crop = c2; }, cropRatio());
      } else if (mode === 'redeye') {
        for (const s of work.redeye || []) {
          const r = s.r * Math.max(R.w, R.h);
          ov.append(h('div', { class: 'redeye-ring', style: { left: R.x + s.x * R.w - r + 'px', top: R.y + s.y * R.h - r + 'px', width: 2 * r + 'px', height: 2 * r + 'px' } }));
        }
      } else if (mode === 'motion' && work.motion && work.motion.kind === 'custom') {
        const ar = FA.ar(), iw = R.w, ih = R.h;
        [['from', '起點', '#4fc3f7'], ['to', '終點', '#ffb74d']].forEach(([k, lbl, col]) => {
          const m2 = work.motion[k];
          // 可見範圍：以畫面比例、放大 z 倍後的框
          const base = Math.min(iw / ar, ih);                  // 填滿高度時的框高
          const bh = base / m2.z, bw = bh * ar;
          const cx = iw / 2 + m2.x * iw, cy = ih / 2 + m2.y * ih;
          const el = h('div', { class: 'crop-box', style: { left: R.x + cx - bw / 2 + 'px', top: R.y + cy - bh / 2 + 'px', width: bw + 'px', height: bh + 'px', borderColor: col, boxShadow: 'none', pointerEvents: 'auto' } },
            h('span', { style: { background: col, color: '#000', fontSize: '12px', padding: '0 4px' } }, lbl), h('div', { class: 'h', 'data-p': 'se', style: { right: '-7px', bottom: '-7px', background: col } }));
          ov.append(el);
          el.addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
            const sx = FA.cx(e), sy = FA.cy(e), o = Object.assign({}, m2), rs = e.target.dataset.p === 'se';
            const mv = (ev) => {
              const dx = FA.cx(ev) - sx, dy = FA.cy(ev) - sy;
              if (rs) m2.z = clamp(o.z * (bh / Math.max(20, bh + dy)), 1, 4);
              else { m2.x = clamp(o.x + dx / iw, -0.5, 0.5); m2.y = clamp(o.y + dy / ih, -0.5, 0.5); }
              overlay();
            };
            const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
          });
        });
      }
    }
    function cropRatio() { const v = side.querySelector('#crop-ratio'); return v ? v.value : 'free'; }
    function dragBox(el, R, get, set, ratioMode) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const p = e.target.dataset.p || 'move', c0 = Object.assign({}, get()), sx = FA.cx(e), sy = FA.cy(e);
        const [sw, sh] = srcSize();
        const ratio = ratioMode === 'show' ? FA.ar() : ratioMode === '1' ? 1 : ratioMode === '43' ? 4 / 3 : ratioMode === '34' ? 3 / 4 : 0;
        const mv = (ev) => {
          const dx = (FA.cx(ev) - sx) / R.w, dy = (FA.cy(ev) - sy) / R.h;
          let c = Object.assign({}, c0);
          if (p === 'move') { c.x = clamp(c0.x + dx, 0, 1 - c0.w); c.y = clamp(c0.y + dy, 0, 1 - c0.h); }
          else {
            if (p.includes('w')) { c.x = clamp(c0.x + dx, 0, c0.x + c0.w - 0.05); c.w = c0.w + (c0.x - c.x); }
            if (p.includes('e')) c.w = clamp(c0.w + dx, 0.05, 1 - c0.x);
            if (p.includes('n')) { c.y = clamp(c0.y + dy, 0, c0.y + c0.h - 0.05); c.h = c0.h + (c0.y - c.y); }
            if (p.includes('s')) c.h = clamp(c0.h + dy, 0.05, 1 - c0.y);
            if (ratio) {                              // 固定比例：以寬為準調整高
              const want = (c.w * sw) / ratio / sh;
              if (p.includes('n')) c.y = c.y + c.h - want;
              c.h = want;
              if (c.y < 0 || c.y + c.h > 1) { c = Object.assign({}, get()); }
            }
          }
          set(c);
          overlay();
        };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
    }
    // 紅眼：在相片上按住拖出圓圈
    stage.addEventListener('pointerdown', (e) => {
      if (mode !== 'redeye' || e.target.closest('.crop-box')) return;
      const R = cvRect(), s = FA.rect(stage);
      const x0 = (FA.cx(e) - s.left - R.x) / R.w, y0 = (FA.cy(e) - s.top - R.y) / R.h;
      if (x0 < 0 || y0 < 0 || x0 > 1 || y0 > 1) return;
      const spot = { x: x0, y: y0, r: 0.01 };
      work.redeye = (work.redeye || []).concat([spot]);
      const mv = (ev) => { spot.r = Math.max(0.004, Math.hypot(FA.cx(ev) - FA.cx(e), FA.cy(ev) - FA.cy(e)) / Math.max(R.w, R.h)); overlay(); };
      const up = async () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); await rebuild(); draw(); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });

    // ------------------------------------------------ 右側設定
    const tabs = [['crop', '裁切旋轉'], ['fx', '特效調色'], ['motion', '動態']];
    if (!isVideo) tabs.splice(1, 0, ['redeye', '紅眼']);
    if (isVideo) tabs.push(['trim', '剪輯聲音']);
    function renderSide() {
      side.innerHTML = '';
      side.append(h('div', { class: 'tabs2' }, tabs.map(([k, t]) => h('button', { class: mode === k ? 'on' : '', onclick: () => { mode = k; renderSide(); draw(); } }, t))));
      if (mode === 'crop') {
        side.append(h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: async () => { work.rot = ((work.rot || 0) + 270) % 360; work.crop = null; work.redeye = []; await rebuild(); draw(); } }, '⟲ 左轉'),
          h('button', { class: 'btn', onclick: async () => { work.rot = ((work.rot || 0) + 90) % 360; work.crop = null; work.redeye = []; await rebuild(); draw(); } }, '⟳ 右轉'),
          h('button', { class: 'btn', onclick: async () => { work.flip = !work.flip; work.redeye = []; await rebuild(); draw(); } }, '⇋ 鏡像')));
        const ratio = h('select', { id: 'crop-ratio', class: 'inp' }, h('option', { value: 'free' }, '自由'), h('option', { value: 'show' }, '影片畫面比例（' + FA.aspect() + '）'), h('option', { value: '43' }, '4:3'), h('option', { value: '34' }, '3:4（直）'), h('option', { value: '1' }, '1:1 正方形'));
        ratio.addEventListener('change', () => {
          if (ratio.value !== 'free') {
            const [sw, sh] = srcSize(), r = ratio.value === 'show' ? FA.ar() : ratio.value === '1' ? 1 : ratio.value === '43' ? 4 / 3 : 3 / 4;
            let w = 1, hh = (sw / r) / sh;
            if (hh > 1) { hh = 1; w = (sh * r) / sw; }
            work.crop = { x: (1 - w) / 2, y: (1 - hh) / 2, w, h: hh };
          }
          draw();
        });
        side.append(h('label', { class: 'fld' }, '裁切比例', ratio), h('p', { class: 'hint' }, '拖曳白框移動，拉四個角調整大小。'),
          h('button', { class: 'btn', onclick: () => { work.crop = null; draw(); } }, '取消裁切'));
      } else if (mode === 'redeye') {
        side.append(h('p', {}, '在紅眼的地方「按住並拖曳」畫出圓圈，放開後就會自動修正。'),
          h('p', { class: 'hint' }, '可以放大視窗、圈得剛好包住瞳孔效果最好。'),
          h('button', { class: 'btn', onclick: async () => { (work.redeye || []).pop(); await rebuild(); draw(); } }, '↶ 取消上一個'),
          ' ', h('button', { class: 'btn', onclick: async () => { work.redeye = []; await rebuild(); draw(); } }, '全部清除'));
      } else if (mode === 'fx') {
        const g = h('div', { class: 'fxgrid' });
        const thumbSrc = isVideo ? video : full.canvas;
        for (const fx of FA.FX) {
          const c = FA.mkCanvas(120, 90), x = c.getContext('2d');
          const sw = isVideo ? video.videoWidth : full.w, sh = isVideo ? video.videoHeight : full.h, k = Math.max(120 / sw, 90 / sh);
          x.filter = fx.filter || 'none';
          x.drawImage(thumbSrc, (120 - sw * k) / 2, (90 - sh * k) / 2, sw * k, sh * k);
          x.filter = 'none';
          if (fx.tint) { x.fillStyle = fx.tint; x.fillRect(0, 0, 120, 90); }
          if (fx.vignette) { const gr = x.createRadialGradient(60, 45, 20, 60, 45, 75); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,' + fx.vignette + ')'); x.fillStyle = gr; x.fillRect(0, 0, 120, 90); }
          g.append(h('div', { class: 'card' + ((work.fx || 'none') === fx.id ? ' on' : ''), onclick: () => { work.fx = fx.id; renderSide(); draw(); } }, c, h('div', { class: 'nm' }, fx.name)));
        }
        side.append(g);
        work.adj = work.adj || { b: 0, c: 0, s: 0 };
        for (const [k, lbl] of [['b', '亮度'], ['c', '對比'], ['s', '飽和度']]) {
          const r = h('input', { type: 'range', min: -60, max: 60, value: work.adj[k] || 0, style: { width: '100%' } });
          const v = h('span', {}, String(work.adj[k] || 0));
          r.addEventListener('input', () => { work.adj[k] = +r.value; v.textContent = r.value; draw(); });
          side.append(h('label', { class: 'fld' }, lbl + ' ', v, r));
        }
        side.append(h('button', { class: 'btn', onclick: () => { work.adj = { b: 0, c: 0, s: 0 }; renderSide(); draw(); } }, '調色歸零'));
      } else if (mode === 'motion') {
        const kind = (work.motion && work.motion.kind) || (isVideo ? 'none' : 'auto');
        const s = FA.selectEl(...FA.MOTIONS.map((x) => [x.id, x.name]), kind, (v) => {
          if (v === 'custom') {
            const cur = FA.motionOf(Object.assign({}, work, { motion: { kind: kind === 'custom' ? 'auto' : kind } }), 0);
            work.motion = { kind: 'custom', from: Object.assign({}, cur.from || { x: 0, y: 0, z: 1 }), to: Object.assign({}, cur.to || { x: 0, y: 0, z: 1.2 }) };
            if (work.motion.from.z < 1.05 && work.motion.to.z < 1.05) work.motion.to.z = 1.3;
          } else work.motion = { kind: v };
          renderSide(); draw();
        });
        side.append(h('label', { class: 'fld' }, '鏡頭移動方式', s));
        if (kind === 'custom') side.append(h('p', { class: 'hint' }, '藍框＝開始時看到的範圍，橘框＝結束時看到的範圍。拖曳移動，拉右下角圓點放大縮小。'));
        else side.append(h('p', { class: 'hint' }, '選「自訂起點與終點」可以自己決定鏡頭從哪裡移到哪裡（例如從全家福慢慢推近到壽星）。'));
        const dur = h('input', { type: 'number', class: 'num', min: 0.5, max: 600, step: 0.5, value: FA.itemDur(work) });
        dur.addEventListener('change', () => (work.dur = Math.max(0.5, +dur.value || 5)));
        side.append(h('label', { class: 'fld' }, '顯示秒數 ', dur));
      } else if (mode === 'trim') {
        const total = m.duration || video.duration || 1;
        const inp = h('input', { type: 'number', class: 'num', min: 0, step: 0.1, value: (work.in || 0).toFixed(1) });
        const out = h('input', { type: 'number', class: 'num', min: 0.5, step: 0.1, value: ((work.in || 0) + FA.itemDur(work) * (work.speed || 1)).toFixed(1) });
        const apply = () => {
          const a = clamp(+inp.value || 0, 0, total - 0.5), b = clamp(+out.value || total, a + 0.5, total);
          work.in = a; work.dur = Math.round(((b - a) / (work.speed || 1)) * 100) / 100;
          video.currentTime = a; info.textContent = '使用 ' + (b - a).toFixed(1) + ' 秒（原長 ' + total.toFixed(1) + ' 秒）';
        };
        inp.addEventListener('change', apply); out.addEventListener('change', apply);
        const info = h('div', { class: 'hint' });
        const pos = h('input', { type: 'range', min: 0, max: Math.round(total * 10), value: Math.round((work.in || 0) * 10), style: { width: '100%' } });
        pos.addEventListener('input', () => { video.currentTime = pos.value / 10; });
        video.ontimeupdate = () => { pos.value = Math.round(video.currentTime * 10); };
        video.onseeked = () => draw();
        side.append(h('label', { class: 'fld' }, '目前位置', pos),
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { inp.value = video.currentTime.toFixed(1); apply(); } }, '⇤ 設成開頭'), h('button', { class: 'btn', onclick: () => { out.value = video.currentTime.toFixed(1); apply(); } }, '設成結尾 ⇥')),
          h('label', { class: 'fld' }, '開始秒數 ', inp), h('label', { class: 'fld' }, '結束秒數 ', out), info);
        const vol = h('input', { type: 'range', min: 0, max: 200, value: Math.round((work.vol ?? 1) * 100), style: { width: '100%' } });
        vol.addEventListener('input', () => (work.vol = vol.value / 100));
        const sp = FA.selectEl(['0.5', '慢動作 0.5 倍'], ['0.75', '0.75 倍'], ['1', '正常'], ['1.5', '1.5 倍'], ['2', '快轉 2 倍'], String(work.speed || 1), (v) => { const used = FA.itemDur(work) * (work.speed || 1); work.speed = +v; work.dur = Math.round((used / work.speed) * 100) / 100; });
        side.append(h('label', { class: 'fld' }, h('input', { type: 'checkbox', checked: !!work.mute, onchange: (e) => (work.mute = e.target.checked) }), ' 靜音（不要影片原本的聲音）'),
          h('label', { class: 'fld' }, '原音音量', vol), h('label', { class: 'fld' }, '播放速度', sp));
        apply();
      }
    }
    renderSide();
    const res = await FA.dialog({ title: isVideo ? '編輯影片' : '編輯相片', cls: 'wide', body: h('div', { class: 'ed-wrap' }, stage, side),
      buttons: [{ label: '取消', value: false }, { label: '套用', primary: true, value: true }],
      onOpen: () => setTimeout(draw, 50) });
    if (video) { video.removeAttribute('src'); video.load(); }
    if (!res) return;
    FA.edit((sh) => {
      const it = sh.items.find((x) => x.id === item.id);
      if (it) Object.assign(it, work);
      if (it && !it.crop) delete it.crop;
    });
  }

  // ------------------------------------------------------------ 文字卡（片頭、片尾、段落標題）
  async function openCard(item) {
    const work = JSON.parse(JSON.stringify(item));
    work.card = work.card || { bg: 'night' };
    work.texts = work.texts && work.texts.length ? work.texts : [{ id: FA.uid(), text: '標題', preset: 'plain', size: 0.1, x: 0.5, y: 0.45, anim: 'fade' }];
    const W = 560, H = Math.round(W / FA.ar());
    const eng = new FA.Engine(W, H);
    const cv = h('canvas', { width: W, height: H, style: { width: W + 'px', borderRadius: '6px' } });
    let t = 1.2;
    const redraw = async () => {
      eng.setShow({ items: [work], fadeEnds: false }, {});
      await eng.ensureItem(work);
      eng.draw(Math.min(t, FA.itemDur(work) - 0.05));
      cv.getContext('2d').drawImage(eng.out, 0, 0);
    };
    const side = h('div', { class: 'ed-side' });
    let ti = 0;
    function render() {
      side.innerHTML = '';
      const bgs = h('div', {}, FA.CARD_BGS.map((b) => h('span', { class: 'sw' + (work.card.bg === b.id && !work.card.color1 ? ' on' : ''), title: b.name, style: { background: 'linear-gradient(135deg,' + b.c.join(',') + ')' }, onclick: () => { work.card.bg = b.id; delete work.card.color1; render(); redraw(); } })));
      const c1 = h('input', { type: 'color', value: work.card.color1 || '#204060' }), c2 = h('input', { type: 'color', value: work.card.color2 || '#102030' });
      const setC = () => { work.card.color1 = c1.value; work.card.color2 = c2.value; redraw(); };
      c1.addEventListener('input', setC); c2.addEventListener('input', setC);
      const dur = h('input', { type: 'number', class: 'num', min: 1, max: 60, step: 0.5, value: FA.itemDur(work) });
      dur.addEventListener('change', () => { work.dur = Math.max(1, +dur.value || 5); redraw(); });
      side.append(h('label', { class: 'fld' }, '背景'), bgs, h('div', { class: 'row', style: { margin: '6px 0' } }, h('span', {}, '自訂漸層'), c1, c2), h('label', { class: 'fld' }, '顯示秒數 ', dur));
      side.append(h('div', { class: 'tabs2' }, work.texts.map((T, i) => h('button', { class: i === ti ? 'on' : '', onclick: () => { ti = i; render(); } }, '文字 ' + (i + 1))),
        h('button', { onclick: () => { work.texts.push({ id: FA.uid(), text: '新的文字', preset: 'plain', size: 0.06, x: 0.5, y: 0.65, anim: 'fade', start: 0.5 }); ti = work.texts.length - 1; render(); redraw(); } }, '＋')));
      const T = work.texts[ti];
      if (T) FA.textForm(side, T, () => redraw(), { inCard: true, onDelete: work.texts.length > 1 ? () => { work.texts.splice(ti, 1); ti = 0; render(); redraw(); } : null });
    }
    render();
    const slider = h('input', { type: 'range', min: 0, max: 100, value: 40, style: { width: W + 'px' } });
    slider.addEventListener('input', () => { t = (slider.value / 100) * FA.itemDur(work); redraw(); });
    const res = await FA.dialog({ title: '編輯文字卡', body: h('div', { class: 'ed-wrap' }, h('div', {}, cv, slider, h('div', { class: 'hint' }, '拖曳滑桿可以看文字動畫的過程')), side),
      buttons: [{ label: '取消', value: false }, { label: '套用', primary: true, value: true }], onOpen: () => redraw() });
    if (!res) return;
    FA.edit((sh) => { const it = sh.items.find((x) => x.id === item.id); if (it) Object.assign(it, work); });
  }

  // 文字設定表單（字幕、文字卡共用）；onChange 每次修改後呼叫
  FA.textForm = function (box, T, onChange, opts) {
    opts = opts || {};
    const ch = () => onChange && onChange();
    const ta = h('textarea', { class: 'inp', rows: 3 }, T.text || '');
    ta.addEventListener('input', () => { T.text = ta.value; ch(); });
    box.append(h('label', { class: 'fld' }, '文字內容（可以換行）', ta));
    const presets = h('div', { class: 'cards c3' }, FA.TEXT_PRESETS.map((p) => {
      const c = FA.mkCanvas(110, 46), x = c.getContext('2d');
      x.fillStyle = '#556677'; x.fillRect(0, 0, 110, 46);
      FA.drawText(x, { text: '相簿 Aa', preset: p.id, size: 0.42, x: 0.5, y: 0.5, anim: 'none', animOut: 'none' }, 1, 2, 110, 46);
      return h('div', { class: 'card' + (T.preset === p.id ? ' on' : ''), title: p.name, onclick: (e) => { T.preset = p.id; delete T.color; delete T.font; box.querySelectorAll('.cards .card').forEach((k) => k.classList.remove('on')); e.currentTarget.classList.add('on'); ch(); } }, c, h('div', { class: 'nm' }, p.name));
    }));
    box.append(h('div', { class: 'fld' }, '文字效果'), presets);
    const font = FA.selectEl(['', '（依文字效果）'], ...FA.FONTS.map((f) => [f.id, f.name]), T.font || '', (v) => { if (v) T.font = v; else delete T.font; ch(); });
    const size = h('input', { type: 'range', min: 2, max: 30, value: Math.round((T.size || 0.08) * 100), style: { width: '100%' } });
    size.addEventListener('input', () => { T.size = size.value / 100; ch(); });
    const color = h('input', { type: 'color', value: typeof T.color === 'string' ? T.color : '#ffffff' });
    color.addEventListener('input', () => { T.color = color.value; ch(); });
    const bold = h('input', { type: 'checkbox', checked: T.bold !== false }), ital = h('input', { type: 'checkbox', checked: !!T.italic });
    bold.addEventListener('change', () => { T.bold = bold.checked; ch(); }); ital.addEventListener('change', () => { T.italic = ital.checked; ch(); });
    box.append(h('label', { class: 'fld' }, '字型', font), h('label', { class: 'fld' }, '大小', size),
      h('div', { class: 'row' }, h('label', { class: 'inline' }, '顏色 ', color, h('button', { class: 'mini', onclick: () => { delete T.color; ch(); } }, '還原')), h('label', { class: 'inline' }, bold, '粗體'), h('label', { class: 'inline' }, ital, '斜體')));
    const align = FA.selectEl(['center', '置中'], ['left', '靠左'], ['right', '靠右'], T.align || 'center', (v) => { T.align = v; ch(); });
    const pos = FA.selectEl(['', '—'], ['top', '上方'], ['mid', '中間'], ['bottom', '下方（字幕）'], '', (v) => { if (v) { T.x = 0.5; T.y = v === 'top' ? 0.15 : v === 'mid' ? 0.5 : 0.86; ch(); } });
    box.append(h('div', { class: 'row' }, h('label', { class: 'fld' }, '對齊', align), h('label', { class: 'fld' }, '快速位置', pos)));
    const ain = FA.selectEl(...FA.TEXT_ANIMS.map((a) => [a.id, a.name]), T.anim || 'fade', (v) => { T.anim = v; ch(); });
    const aout = FA.selectEl(...FA.TEXT_ANIMS.map((a) => [a.id, a.name]), T.animOut || 'fade', (v) => { T.animOut = v; ch(); });
    const loop = FA.selectEl(...FA.TEXT_LOOPS.map((a) => [a.id, a.name]), T.loop || 'none', (v) => { T.loop = v; ch(); });
    box.append(h('label', { class: 'fld' }, '進場動畫', ain), h('label', { class: 'fld' }, '出場動畫', aout), h('label', { class: 'fld' }, '持續動畫', loop));
    if (opts.inCard) {
      const st = h('input', { type: 'number', class: 'num', min: 0, max: 60, step: 0.1, value: T.start || 0 });
      st.addEventListener('change', () => { T.start = Math.max(0, +st.value || 0); ch(); });
      box.append(h('label', { class: 'fld' }, '第幾秒出現 ', st));
    }
    if (opts.onDelete) box.append(h('button', { class: 'btn danger', style: { marginTop: '8px' }, onclick: opts.onDelete }, '刪除這段文字'));
  };
})();
