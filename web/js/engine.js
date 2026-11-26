/* 繪製引擎：依時間 t 畫出一格畫面（預覽與輸出共用）。
 *  相片／影片（裁切、旋轉、紅眼、調色、特效、Ken Burns 動態、相框）
 *  → 轉場（WebGL，gl-transitions 著色器）→ 場景特效 → 剪貼畫 → 文字
 */
(function () {
  const FA = (window.FA = window.FA || {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  FA.mkCanvas = mk;

  // ================================================================ 時間計算
  FA.uid = () => Math.random().toString(36).slice(2, 10);
  FA.itemDur = (it) => Math.max(0.3, +it.dur || 5);
  FA.timing = function (show) {
    const items = show.items || [];
    const starts = [], tds = [];
    let t = 0;
    for (let i = 0; i < items.length; i++) {
      const d = FA.itemDur(items[i]);
      starts.push(t);
      let td = 0;
      if (i < items.length - 1) {
        const tr = items[i].trans;
        if (tr && tr.id && tr.id !== 'none') td = clamp(+tr.dur || 1, 0.1, Math.min(d, FA.itemDur(items[i + 1])) * 0.5);
      }
      tds.push(td);
      t += d - td;
    }
    const last = items.length ? starts[items.length - 1] + FA.itemDur(items[items.length - 1]) : 0;
    let total = last;
    for (const k of ['titles', 'cliparts', 'effects']) for (const x of show[k] || []) total = Math.max(total, (x.start || 0) + (x.dur || 0));
    return { starts, tds, itemsEnd: last, total: Math.max(total, 0.1) };
  };
  FA.locate = function (show, tm, t) {
    const items = show.items || [];
    if (!items.length) return null;
    let k = 0;
    while (k + 1 < items.length && tm.starts[k + 1] <= t) k++;
    if (k > 0 && t < tm.starts[k - 1] + FA.itemDur(items[k - 1])) {
      const a = k - 1, s = tm.starts[k], e = tm.starts[a] + FA.itemDur(items[a]);
      return { a, b: k, p: clamp((t - s) / Math.max(e - s, 1e-3), 0, 1) };
    }
    return { a: k, b: -1, p: 0 };
  };

  // ================================================================ WebGL 轉場
  class GLT {
    constructor() {
      this.canvas = mk(16, 16);
      const gl = (this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false }));
      this.ok = !!gl;
      this.progs = {};
      this.broken = new Set();
      if (!gl) return;
      this.buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      this.tex = [this._tex(), this._tex()];
    }
    _tex() {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    program(id) {
      if (this.progs[id]) return this.progs[id];
      const def = FA.TRANSITION_BY[id];
      if (!def || this.broken.has(id)) return null;
      const gl = this.gl;
      const vs = 'attribute vec2 _p; varying vec2 _uv; void main(){ gl_Position = vec4(_p,0.0,1.0); _uv = (_p+1.0)/2.0; }';
      const fs = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
        'varying vec2 _uv; uniform sampler2D from, to; uniform float progress, ratio;\n' +
        'vec4 getFromColor(vec2 uv){ return texture2D(from, uv); }\nvec4 getToColor(vec2 uv){ return texture2D(to, uv); }\n' +
        def.glsl + '\nvoid main(){ gl_FragColor = transition(_uv); }';
      const sh = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('轉場無法編譯', id, gl.getShaderInfoLog(s)); return null; }
        return s;
      };
      const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
      if (!v || !f) { this.broken.add(id); return null; }
      const p = gl.createProgram();
      gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { this.broken.add(id); console.warn('轉場無法連結', id); return null; }
      const u = { from: gl.getUniformLocation(p, 'from'), to: gl.getUniformLocation(p, 'to'), progress: gl.getUniformLocation(p, 'progress'), ratio: gl.getUniformLocation(p, 'ratio'), params: [] };
      for (const [k, d] of Object.entries(def.params || {})) u.params.push([gl.getUniformLocation(p, k), d.type, d.value]);
      return (this.progs[id] = { p, u, a: gl.getAttribLocation(p, '_p') });
    }
    draw(id, fromCanvas, toCanvas, progress, W, H) {
      const gl = this.gl;
      if (!gl) return false;
      let pr = this.program(id) || this.program('Fade');
      if (!pr) return false;
      if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
      gl.viewport(0, 0, W, H);
      gl.useProgram(pr.p);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      [fromCanvas, toCanvas].forEach((c, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      });
      gl.uniform1i(pr.u.from, 0); gl.uniform1i(pr.u.to, 1);
      gl.uniform1f(pr.u.progress, progress); gl.uniform1f(pr.u.ratio, W / H);
      for (const [loc, type, val] of pr.u.params) {
        if (!loc) continue;
        if (type === 'float') gl.uniform1f(loc, +val);
        else if (type === 'int' || type === 'bool') gl.uniform1i(loc, val === true ? 1 : val === false ? 0 : (val | 0));
        else if (type === 'vec2') gl.uniform2fv(loc, val); else if (type === 'vec3') gl.uniform3fv(loc, val);
        else if (type === 'vec4') gl.uniform4fv(loc, val); else if (type === 'ivec2') gl.uniform2iv(loc, val);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.enableVertexAttribArray(pr.a);
      gl.vertexAttribPointer(pr.a, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return true;
    }
  }
  FA.GLT = GLT;
  FA.TRANSITION_BY = Object.fromEntries((window.FA_TRANSITIONS || []).map((t) => [t.id, t]));

  // ================================================================ 素材載入（全部引擎共用快取）
  const IMG = new Map();      // url → Promise<HTMLImageElement>
  FA.loadImage = function (url) {
    if (!IMG.has(url)) {
      IMG.set(url, new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => (im.decode ? im.decode().catch(() => 0) : Promise.resolve()).then(() => res(im));
        im.onerror = () => { IMG.delete(url); rej(new Error('無法載入圖片')); };
        im.src = url;
      }));
    }
    return IMG.get(url);
  };
  FA.clipartURL = (id) => 'assets/clipart/' + id + '.png';

  // 紅眼修正：圓形範圍內「紅色明顯偏高」的像素把紅色降成綠藍平均
  FA.fixRedEye = function (ctx, w, h, spots) {
    for (const s of spots || []) {
      const cx = s.x * w, cy = s.y * h, r = Math.max(2, s.r * Math.max(w, h));
      const x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r));
      const x1 = Math.min(w, Math.ceil(cx + r)), y1 = Math.min(h, Math.ceil(cy + r));
      if (x1 <= x0 || y1 <= y0) continue;
      const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0), px = d.data;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const dist = Math.hypot(x - cx, y - cy) / r;
        if (dist > 1) continue;
        const k = ((y - y0) * (x1 - x0) + (x - x0)) * 4, R = px[k], G = px[k + 1], B = px[k + 2];
        const avg = (G + B) / 2;
        if (R > 60 && R > avg * 1.5) {
          const f = dist > 0.8 ? (1 - dist) / 0.2 : 1;
          px[k] = Math.round(R * (1 - f) + avg * 0.9 * f);
        }
      }
      ctx.putImageData(d, x0, y0);
    }
  };

  function adjFilter(adj) {
    if (!adj) return '';
    const f = [];
    if (adj.b) f.push('brightness(' + (1 + adj.b / 100).toFixed(3) + ')');
    if (adj.c) f.push('contrast(' + (1 + adj.c / 100).toFixed(3) + ')');
    if (adj.s) f.push('saturate(' + (1 + adj.s / 100).toFixed(3) + ')');
    return f.join(' ');
  }
  FA.adjFilter = adjFilter;

  // 相片「烘焙」：旋轉、翻轉、裁切、紅眼、亮度對比飽和 → 一張畫布（快取）
  const BAKED = new Map();
  FA.bakePhoto = async function (url, it, maxSide) {
    const key = url + '|' + maxSide + '|' + JSON.stringify([it.rot || 0, !!it.flip, it.crop || null, it.redeye || [], it.adj || null]);
    if (BAKED.has(key)) return BAKED.get(key);
    const p = (async () => {
      const im = await FA.loadImage(url);
      const rot = ((it.rot || 0) % 360 + 360) % 360;
      const rw = rot % 180 ? im.naturalHeight : im.naturalWidth, rh = rot % 180 ? im.naturalWidth : im.naturalHeight;
      // 1) 旋轉＋翻轉成完整影像（限制尺寸以免太耗記憶體）
      const s0 = Math.min(1, 4096 / Math.max(rw, rh));
      const c1 = mk(Math.round(rw * s0), Math.round(rh * s0)), x1 = c1.getContext('2d');
      x1.translate(c1.width / 2, c1.height / 2);
      x1.rotate((rot * Math.PI) / 180);
      if (it.flip) x1.scale(-1, 1);
      const dw = im.naturalWidth * s0, dh = im.naturalHeight * s0;
      x1.drawImage(im, -dw / 2, -dh / 2, dw, dh);
      x1.setTransform(1, 0, 0, 1, 0, 0);
      if (it.redeye && it.redeye.length) FA.fixRedEye(x1, c1.width, c1.height, it.redeye);
      // 2) 裁切＋縮放＋調色
      const cr = it.crop || { x: 0, y: 0, w: 1, h: 1 };
      const sx = cr.x * c1.width, sy = cr.y * c1.height, sw = Math.max(4, cr.w * c1.width), sh = Math.max(4, cr.h * c1.height);
      const s1 = Math.min(1, maxSide / Math.max(sw, sh));
      const c2 = mk(Math.max(2, Math.round(sw * s1)), Math.max(2, Math.round(sh * s1))), x2 = c2.getContext('2d');
      x2.imageSmoothingQuality = 'high';
      x2.filter = adjFilter(it.adj) || 'none';
      x2.drawImage(c1, sx, sy, sw, sh, 0, 0, c2.width, c2.height);
      // 3) 模糊背景用的小圖
      const small = mk(48, Math.max(8, Math.round((48 * c2.height) / c2.width)));
      small.getContext('2d').drawImage(c2, 0, 0, small.width, small.height);
      return { canvas: c2, small, w: c2.width, h: c2.height };
    })();
    BAKED.set(key, p);
    p.catch(() => BAKED.delete(key));
    if (BAKED.size > 160) BAKED.delete(BAKED.keys().next().value);
    return p;
  };

  // 雜訊、木紋貼圖（固定，只做一次）
  let NOISE = null, WOOD = null;
  function noiseTex() {
    if (NOISE) return NOISE;
    NOISE = mk(256, 256);
    const x = NOISE.getContext('2d'), d = x.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0);
    return NOISE;
  }
  function woodTex() {
    if (WOOD) return WOOD;
    WOOD = mk(512, 512);
    const x = WOOD.getContext('2d');
    const d = x.createImageData(512, 512);
    for (let y = 0; y < 512; y++) for (let i = 0; i < 512; i++) {
      const v = Math.sin((i + Math.sin(y * 0.02) * 30 + Math.sin(y * 0.11) * 4) * 0.09) * 0.5 + 0.5;
      const k = (y * 512 + i) * 4;
      d.data[k] = 150 + v * 80; d.data[k + 1] = 100 + v * 55; d.data[k + 2] = 50 + v * 30; d.data[k + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    return WOOD;
  }

  // ================================================================ 文字
  FA.fontCSS = (o, px) => (o.italic ? 'italic ' : '') + (o.bold === false ? '400 ' : '700 ') + Math.round(px) + 'px "' + (o.font || 'Noto Sans TC') + '", "Microsoft JhengHei", sans-serif';
  function textStyle(T) {
    const base = FA.TEXT_PRESET_BY[T.preset] || FA.TEXT_PRESET_BY.plain;
    const s = Object.assign({}, base);
    if (T.color) s.fill = T.color;
    if (T.font) s.font = T.font;
    if (T.bold !== undefined) s.bold = T.bold;
    if (T.italic !== undefined) s.italic = T.italic;
    return s;
  }
  function paintText(ctx, s, str, x, y, fs, w, extra) {
    // x,y＝文字基準點（置中、中線）
    const hueFill = extra && extra.hue !== undefined ? 'hsl(' + extra.hue + ',90%,62%)' : null;
    if (s.box && !extra.noBox) {
      ctx.fillStyle = s.box;
      const pad = fs * 0.3;
      ctx.fillRect(x - w / 2 - pad, y - fs * 0.62, w + pad * 2, fs * 1.24);
    }
    if (s.depth) {
      ctx.fillStyle = s.depth[0];
      for (let k = s.depth[1]; k > 0; k--) ctx.fillText(str, x + k * fs * 0.012, y + k * fs * 0.012);
    }
    if (s.stroke) {
      ctx.lineJoin = 'round'; ctx.miterLimit = 2;
      ctx.strokeStyle = s.stroke[1]; ctx.lineWidth = s.stroke[0] * fs * 2;
      if (s.shadow) { ctx.shadowOffsetX = s.shadow[0] * fs; ctx.shadowOffsetY = s.shadow[1] * fs; ctx.shadowBlur = s.shadow[2] * fs; ctx.shadowColor = s.shadow[3]; }
      ctx.strokeText(str, x, y);
      ctx.shadowColor = 'transparent';
    }
    let fill = hueFill || s.fill;
    if (Array.isArray(fill)) {
      const g = ctx.createLinearGradient(0, y - fs * 0.5, 0, y + fs * 0.5);
      fill.forEach((c, i) => g.addColorStop(i / Math.max(1, fill.length - 1), c));
      fill = g;
    }
    ctx.fillStyle = fill;
    if (s.glow || (extra && extra.glow)) {
      ctx.shadowColor = s.glow || '#ffffff'; ctx.shadowBlur = fs * (0.35 + ((extra && extra.glow) || 0) * 0.5);
      ctx.fillText(str, x, y);
      ctx.shadowBlur = fs * 0.15; ctx.fillText(str, x, y);
    } else if (s.shadow && !s.stroke) {
      ctx.shadowOffsetX = s.shadow[0] * fs; ctx.shadowOffsetY = s.shadow[1] * fs; ctx.shadowBlur = s.shadow[2] * fs; ctx.shadowColor = s.shadow[3];
      ctx.fillText(str, x, y);
    } else ctx.fillText(str, x, y);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
  }
  function mergeT(a, b) {
    if (!b) return a;
    return { a: (a.a ?? 1) * (b.a ?? 1), x: (a.x || 0) + (b.x || 0), y: (a.y || 0) + (b.y || 0), s: (a.s ?? 1) * (b.s ?? 1),
      r: (a.r || 0) + (b.r || 0), show: (a.show ?? true) && (b.show ?? true), blur: Math.max(a.blur || 0, b.blur || 0),
      sx: (a.sx ?? 1) * (b.sx ?? 1), sy: (a.sy ?? 1) * (b.sy ?? 1), hue: b.hue ?? a.hue, glow: Math.max(a.glow || 0, b.glow || 0) };
  }
  // T：{text, preset, font, size（字高／畫面高）, x, y（0～1）, align, anim, animOut, loop, inDur, outDur}
  FA.drawText = function (ctx, T, lt, dur, W, H) {
    const text = (T.text || '').replace(/\r/g, '');
    if (!text.trim()) return;
    const s = textStyle(T);
    const fs = Math.max(6, (T.size || 0.08) * H);
    ctx.save();
    ctx.font = FA.fontCSS(s, fs);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const lines = text.split('\n');
    const lh = fs * (T.lineH || 1.3);
    const inA = FA.TEXT_ANIM_BY[T.anim || 'fade'] || FA.TEXT_ANIM_BY.fade;
    const outA = FA.TEXT_ANIM_BY[T.animOut || 'fade'] || FA.TEXT_ANIM_BY.fade;
    const loop = FA.TEXT_LOOP_BY[T.loop || 'none'] || FA.TEXT_LOOP_BY.none;
    const inD = T.inDur ?? 0.8, outD = T.outDur ?? 0.6;
    const pin = inA.f ? clamp(lt / Math.max(inD, 0.01), 0, 1) : 1;
    const pout = outA.f ? clamp((dur - lt) / Math.max(outD, 0.01), 0, 1) : 1;
    let cx = (T.x ?? 0.5) * W, cy = (T.y ?? 0.5) * H;
    const blockH = lh * lines.length;
    if (loop.scroll) cy = lerp(H + blockH / 2, -blockH / 2, clamp(lt / Math.max(dur, 0.1), 0, 1));
    const perChar = inA.each || outA.each || loop.each;
    const totalChars = lines.reduce((n, l) => n + [...l].length, 0);
    let ci = 0;
    lines.forEach((line, li) => {
      const chars = [...line];
      const lw = ctx.measureText(line).width;
      let ax = cx;
      if (T.align === 'left') ax = cx + lw / 2; else if (T.align === 'right') ax = cx - lw / 2;
      const ly = cy - blockH / 2 + lh * (li + 0.5);
      const apply = (tf, str, x, y, w) => {
        if (tf.show === false || (tf.a ?? 1) <= 0.001) return;
        ctx.save();
        ctx.globalAlpha *= clamp(tf.a ?? 1, 0, 1);
        ctx.translate(x + (tf.x || 0) * fs, y + (tf.y || 0) * fs);
        if (tf.r) ctx.rotate(tf.r);
        const sc = tf.s ?? 1;
        ctx.scale(sc * (tf.sx ?? 1), sc * (tf.sy ?? 1));
        if (tf.blur) ctx.filter = 'blur(' + (tf.blur * fs).toFixed(1) + 'px)';
        paintText(ctx, s, str, 0, 0, fs, w, { hue: tf.hue, glow: tf.glow });
        ctx.restore();
      };
      if (!perChar) {
        let tf = inA.f ? inA.f(pin, 0, 1) : {};
        if (outA.f && pout < 1) tf = mergeT(tf, outA.f(pout, 0, 1));
        if (loop.f) tf = mergeT(tf, loop.f(lt, 0, 1, dur));
        apply(tf, line, ax, ly, lw);
        ci += chars.length;
        return;
      }
      if (s.box) { ctx.save(); ctx.globalAlpha *= Math.min(pin, pout); ctx.fillStyle = s.box; const pad = fs * 0.3; ctx.fillRect(ax - lw / 2 - pad, ly - fs * 0.62, lw + pad * 2, fs * 1.24); ctx.restore(); }
      let x = ax - lw / 2;
      const s2 = Object.assign({}, s, { box: null });
      for (const ch of chars) {
        const w = ctx.measureText(ch).width;
        let tf = inA.f ? inA.f(pin, ci, totalChars) : {};
        if (outA.f && pout < 1) tf = mergeT(tf, outA.f(pout, ci, totalChars));
        if (loop.f) tf = mergeT(tf, loop.f(lt, ci, totalChars, dur));
        if (tf.show !== false && (tf.a ?? 1) > 0.001) {
          ctx.save();
          ctx.globalAlpha *= clamp(tf.a ?? 1, 0, 1);
          ctx.translate(x + w / 2 + (tf.x || 0) * fs, ly + (tf.y || 0) * fs);
          if (tf.r) ctx.rotate(tf.r);
          const sc = tf.s ?? 1;
          ctx.scale(sc * (tf.sx ?? 1), sc * (tf.sy ?? 1));
          paintText(ctx, s2, ch, 0, 0, fs, w, { hue: tf.hue, glow: tf.glow, noBox: true });
          ctx.restore();
        }
        x += w;
        ci++;
      }
    });
    ctx.restore();
  };
  // 文字的範圍（給預覽畫面拖曳用）
  FA.textBox = function (ctx, T, W, H) {
    const s = textStyle(T), fs = Math.max(6, (T.size || 0.08) * H);
    ctx.save(); ctx.font = FA.fontCSS(s, fs);
    const lines = (T.text || ' ').split('\n');
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + fs * 0.6;
    ctx.restore();
    const h = fs * (T.lineH || 1.3) * lines.length;
    return { x: (T.x ?? 0.5) * W - w / 2, y: (T.y ?? 0.5) * H - h / 2, w, h };
  };

  // ================================================================ 相框
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  FA.drawFrame = function (ctx, id, W, H) {
    if (!id || id === 'none') return;
    const m = Math.min(W, H);
    ctx.save();
    if (id === 'white' || id === 'snow' || id === 'gold' || id === 'wood' || id === 'round' || id === 'polaroid') {
      const b = id === 'polaroid' ? m * 0.045 : id === 'round' ? m * 0.03 : m * 0.035;
      const bottom = id === 'polaroid' ? m * 0.14 : b;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      // 注意：不能用 rr()，它會 beginPath 把外框清掉，變成整張相片被蓋住
      if ((id === 'snow' || id === 'round') && ctx.roundRect) ctx.roundRect(b, b, W - 2 * b, H - b - bottom, m * 0.05);
      else ctx.rect(b, b, W - 2 * b, H - b - bottom);
      let fill = '#ffffff';
      if (id === 'gold') { fill = ctx.createLinearGradient(0, 0, W, H); ['#7a5a12', '#f5d77a', '#a8801c', '#fff1b8', '#7a5a12'].forEach((c, i) => fill.addColorStop(i / 4, c)); }
      if (id === 'wood') fill = ctx.createPattern(woodTex(), 'repeat');
      if (id === 'round') fill = 'rgba(0,0,0,0.85)';
      if (id === 'polaroid') fill = '#fbfaf6';
      ctx.fillStyle = fill;
      ctx.fill('evenodd');
      if (id !== 'round') { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(b, b, W - 2 * b, H - b - bottom); }
    } else if (id === 'film') {
      const bh = H * 0.09;
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
      ctx.fillStyle = '#e8e2d0';
      const hw = bh * 0.45, gap = hw * 1.6;
      for (let x = gap * 0.3; x < W; x += gap) { rr(ctx, x, bh * 0.28, hw, bh * 0.44, 3); ctx.fill(); rr(ctx, x, H - bh * 0.72, hw, bh * 0.44, 3); ctx.fill(); }
    } else if (id === 'vignette') {
      const g = ctx.createRadialGradient(W / 2, H / 2, m * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.75)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (id === 'dots') {
      const cols = ['#ff7aa2', '#ffd54f', '#4fc3f7', '#81c784', '#ba68c8'];
      const r = m * 0.022, step = r * 3.2;
      let k = 0;
      for (let x = r * 1.6; x < W; x += step) { ctx.fillStyle = cols[k++ % 5]; ctx.beginPath(); ctx.arc(x, r * 1.6, r, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x, H - r * 1.6, r, 0, 7); ctx.fill(); }
      for (let y = r * 1.6 + step; y < H - step; y += step) { ctx.fillStyle = cols[k++ % 5]; ctx.beginPath(); ctx.arc(r * 1.6, y, r, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(W - r * 1.6, y, r, 0, 7); ctx.fill(); }
    } else if (id === 'heart') {
      const s = m * 0.12;
      ctx.fillStyle = 'rgba(255,90,130,0.9)';
      [[s * 0.7, s * 0.25], [W - s * 0.7, s * 0.25], [s * 0.7, H - s * 1.15], [W - s * 0.7, H - s * 1.15]].forEach(([x, y]) => {
        ctx.beginPath(); ctx.moveTo(x, y + s * 0.3);
        ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3); ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
        ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3); ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3); ctx.fill();
      });
    } else if (id === 'neon') {
      const b = m * 0.04;
      ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = m * 0.008; ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = m * 0.03;
      rr(ctx, b, b, W - 2 * b, H - 2 * b, m * 0.04); ctx.stroke();
      ctx.strokeStyle = '#4fe3ff'; ctx.shadowColor = '#4fe3ff';
      rr(ctx, b * 1.6, b * 1.6, W - 3.2 * b, H - 3.2 * b, m * 0.035); ctx.stroke();
    }
    ctx.restore();
  };

  // ================================================================ 片頭片尾卡背景
  FA.drawCardBg = function (ctx, card, lt, W, H) {
    const bg = FA.CARD_BG_BY[card.bg] || FA.CARD_BG_BY.black;
    const c = card.color1 ? [card.color1, card.color2 || card.color1] : bg.c;
    const a = (card.angle ?? 135) * Math.PI / 180;
    const dx = Math.cos(a) * W / 2, dy = Math.sin(a) * H / 2;
    const g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
    c.forEach((col, i) => g.addColorStop(i / Math.max(1, c.length - 1), col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 柔和的移動光暈，讓背景不呆板
    const lx = W * (0.5 + 0.35 * Math.sin(lt * 0.5)), ly = H * (0.4 + 0.2 * Math.cos(lt * 0.4));
    const rg = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(W, H) * 0.6);
    rg.addColorStop(0, 'rgba(255,255,255,0.16)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  };

  // ================================================================ 剪貼畫
  FA.CLIP_ANIMS = [
    { id: 'none', name: '固定' }, { id: 'float', name: '飄浮' }, { id: 'bounce', name: '彈跳' }, { id: 'spin', name: '旋轉' },
    { id: 'pulse', name: '心跳' }, { id: 'swing', name: '搖擺' }, { id: 'flyr', name: '由左飛到右' }, { id: 'flyu', name: '由下往上飛' },
  ];
  FA.drawClip = function (ctx, C, img, lt, dur, W, H) {
    if (!img) return;
    const size = (C.w || 0.18) * H;
    let x = (C.x ?? 0.8) * W, y = (C.y ?? 0.75) * H, r = ((C.rot || 0) * Math.PI) / 180, s = 1, a = 1;
    const inP = clamp(lt / 0.5, 0, 1), outP = clamp((dur - lt) / 0.5, 0, 1);
    a = Math.min(inP, outP);
    s = C.in === 'none' ? 1 : FA.ease.easeBack(inP);
    switch (C.anim) {
      case 'float': y += Math.sin(lt * 2) * size * 0.08; break;
      case 'bounce': y -= Math.abs(Math.sin(lt * 4)) * size * 0.25; break;
      case 'spin': r += lt * 2; break;
      case 'pulse': s *= 1 + Math.sin(lt * 6) * 0.08; break;
      case 'swing': r += Math.sin(lt * 3) * 0.3; break;
      case 'flyr': x = lerp(-size, W + size, clamp(lt / Math.max(dur, 0.1), 0, 1)); y += Math.sin(lt * 3) * size * 0.2; break;
      case 'flyu': y = lerp(H + size, -size, clamp(lt / Math.max(dur, 0.1), 0, 1)); x += Math.sin(lt * 2) * size * 0.3; break;
    }
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(x, y); ctx.rotate(r); ctx.scale(s * (C.flip ? -1 : 1), s);
    const ar = img.naturalHeight / img.naturalWidth;
    ctx.drawImage(img, -size / 2, (-size * ar) / 2, size, size * ar);
    ctx.restore();
  };

  // ================================================================ 引擎
  class Engine {
    constructor(W, H, opts) {
      this.opts = opts || {};
      this.out = mk(W, H);
      this.octx = this.out.getContext('2d');
      this.ca = mk(W, H); this.cb = mk(W, H);
      this.actx = this.ca.getContext('2d'); this.bctx = this.cb.getContext('2d');
      this.tmp = mk(16, 16);
      this.glt = FA.sharedGLT || (FA.sharedGLT = new GLT());
      this.videos = new Map();       // item.id → HTMLVideoElement
      this.photos = new Map();       // item.id → baked
      this.clips = new Map();        // art → img
      this.W = W; this.H = H;
      this.show = null;
    }
    resize(W, H) {
      if (W === this.W && H === this.H) return;
      for (const c of [this.out, this.ca, this.cb]) { c.width = W; c.height = H; }
      this.W = W; this.H = H;
    }
    setShow(show, media) {
      this.show = show;
      this.media = media || {};
      this.tm = FA.timing(show);
    }
    mediaURL(mid) { return FA.mediaURL(mid); }
    // ------------------------------------------------ 載入
    async ensureItem(it) {
      if (it.type === 'photo') {
        const url = this.mediaURL(it.media);
        const maxSide = Math.round(Math.max(this.W, this.H) * 1.6);
        const b = await FA.bakePhoto(url, it, maxSide);
        this.photos.set(it.id, b);
        return b;
      }
      if (it.type === 'video') {
        let v = this.videos.get(it.id);
        if (!v) {
          v = document.createElement('video');
          v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
          v.src = this.mediaURL(it.media);
          this.videos.set(it.id, v);
        }
        if (v.readyState < 2) await new Promise((res) => { const done = () => { v.removeEventListener('loadeddata', done); v.removeEventListener('error', done); res(); }; v.addEventListener('loadeddata', done); v.addEventListener('error', done); setTimeout(done, 8000); });
        return v;
      }
      if (it.type === 'card') {
        for (const T of it.texts || []) await FA.ensureFont(T);
      }
      return null;
    }
    async ensureAll(onProgress) {
      const items = this.show.items || [];
      let n = 0;
      for (const it of items) { await this.ensureItem(it).catch((e) => console.warn(e)); onProgress && onProgress(++n / items.length); }
      for (const C of this.show.cliparts || []) await this.clipImg(C.art).catch(() => 0);
      for (const T of this.show.titles || []) await FA.ensureFont(T);
    }
    async clipImg(art) {
      if (this.clips.has(art)) return this.clips.get(art);
      const im = await FA.loadImage(typeof art === 'number' ? this.mediaURL(art) : FA.clipartURL(art));
      this.clips.set(art, im);
      return im;
    }
    // 輸出用：把時間 t 需要的影片精準定位到那一格
    async seekVideos(t) {
      const loc = FA.locate(this.show, this.tm, t);
      if (!loc) return;
      for (const k of [loc.a, loc.b]) {
        if (k < 0) continue;
        const it = this.show.items[k];
        if (it.type !== 'video') continue;
        const v = this.videos.get(it.id) || (await this.ensureItem(it));
        const target = this.videoTime(it, t - this.tm.starts[k]);
        if (Math.abs(v.currentTime - target) < 0.001 && v.readyState >= 2) continue;
        await new Promise((res) => {
          let done = false;
          const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', on); res(); };
          const on = () => { if (v.requestVideoFrameCallback) { v.requestVideoFrameCallback(() => fin()); setTimeout(fin, 120); } else fin(); };   // 視窗縮小時畫格回呼不會觸發，最多等 0.12 秒
          v.addEventListener('seeked', on);
          v.currentTime = target;
          setTimeout(fin, 3000);
        });
      }
    }
    videoTime(it, local) {
      const inT = +it.in || 0, sp = +it.speed || 1;
      const v = this.videos.get(it.id);
      const max = v && isFinite(v.duration) ? v.duration - 0.03 : 1e9;
      return clamp(inT + local * sp, 0, Math.max(0, max));
    }
    // ------------------------------------------------ 畫一格
    draw(t, noFade) {
      const { W, H, octx } = this;
      const show = this.show;
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.globalAlpha = 1;
      octx.fillStyle = '#000';
      octx.fillRect(0, 0, W, H);
      if (!show) return this.out;
      const loc = FA.locate(show, this.tm, t);
      if (loc) {
        const items = show.items;
        if (loc.b < 0) {
          if (t <= this.tm.itemsEnd) this.drawItem(octx, items[loc.a], t - this.tm.starts[loc.a], loc.a);
        } else {
          this.drawItem(this.actx, items[loc.a], t - this.tm.starts[loc.a], loc.a);
          this.drawItem(this.bctx, items[loc.b], t - this.tm.starts[loc.b], loc.b);
          const tr = items[loc.a].trans || {};
          if (!this.glt.draw(tr.id, this.ca, this.cb, loc.p, W, H)) {
            octx.drawImage(this.ca, 0, 0); octx.globalAlpha = loc.p; octx.drawImage(this.cb, 0, 0); octx.globalAlpha = 1;
          } else octx.drawImage(this.glt.canvas, 0, 0);
        }
      }
      // 場景特效
      for (const E of show.effects || []) {
        const lt = t - (E.start || 0);
        if (lt < 0 || lt > E.dur) continue;
        const sc = FA.SCENE_BY[E.kind];
        if (!sc) continue;
        octx.save();
        octx.globalAlpha = Math.min(1, lt / 0.6, (E.dur - lt) / 0.6);
        sc.draw(octx, W, H, t, E.dur, E.amount ?? 1);
        octx.restore();
      }
      // 剪貼畫
      for (const C of show.cliparts || []) {
        const lt = t - (C.start || 0);
        if (lt < 0 || lt > C.dur) continue;
        FA.drawClip(octx, C, this.clips.get(C.art), lt, C.dur, W, H);
      }
      // 文字
      for (const T of show.titles || []) {
        const lt = t - (T.start || 0);
        if (lt < 0 || lt > T.dur) continue;
        FA.drawText(octx, T, lt, T.dur, W, H);
      }
      // 頭尾淡入淡出
      if (show.fadeEnds !== false && !noFade) {
        const f = Math.min(1, t / 0.6, (this.tm.total - t) / 0.8);
        if (f < 1) { octx.fillStyle = 'rgba(0,0,0,' + (1 - Math.max(0, f)).toFixed(3) + ')'; octx.fillRect(0, 0, W, H); }
      }
      return this.out;
    }
    drawItem(ctx, it, lt, idx) {
      const { W, H } = this;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.filter = 'none';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const dur = FA.itemDur(it);
      if (it.type === 'card') {
        FA.drawCardBg(ctx, it.card || {}, lt, W, H);
        for (const T of it.texts || []) FA.drawText(ctx, T, lt - (T.start || 0), Math.min(T.dur || dur, dur - (T.start || 0)), W, H);
        FA.drawFrame(ctx, it.frame, W, H);
        ctx.restore();
        return;
      }
      let src = null, sw = 0, sh = 0, small = null, sx = 0, sy = 0, sW = 0, sH = 0;
      if (it.type === 'photo') {
        const b = this.photos.get(it.id);
        if (b) { src = b.canvas; sw = b.w; sh = b.h; small = b.small; sx = 0; sy = 0; sW = sw; sH = sh; }
      } else if (it.type === 'video') {
        const v = this.videos.get(it.id);
        if (v && v.readyState >= 2 && v.videoWidth) {
          // 影片：每格即時套用旋轉、翻轉、裁切
          const rot = ((it.rot || 0) % 360 + 360) % 360;
          const vw = v.videoWidth, vh = v.videoHeight;
          const rw = rot % 180 ? vh : vw, rh = rot % 180 ? vw : vh;
          const cr = it.crop || { x: 0, y: 0, w: 1, h: 1 };
          const tw = Math.max(2, Math.round(cr.w * rw)), th = Math.max(2, Math.round(cr.h * rh));
          const tmp = this.tmp;
          if (tmp.width !== tw || tmp.height !== th) { tmp.width = tw; tmp.height = th; }
          const tx = tmp.getContext('2d');
          tx.setTransform(1, 0, 0, 1, 0, 0);
          tx.filter = FA.adjFilter(it.adj) || 'none';
          tx.translate(-cr.x * rw + rw / 2, -cr.y * rh + rh / 2);
          tx.rotate((rot * Math.PI) / 180);
          if (it.flip) tx.scale(-1, 1);
          tx.drawImage(v, -vw / 2, -vh / 2, vw, vh);
          src = tmp; sw = tw; sh = th; sx = 0; sy = 0; sW = tw; sH = th;
          small = null;
        }
      }
      if (!src) { ctx.restore(); return; }
      const fill = (it.fit || this.show.fit || 'fit') === 'fill';
      const base = fill ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
      // 背景：模糊放大的同一張相片（或純色）
      const bgMode = (this.show.bg && this.show.bg.type) || 'blur';
      if (!fill && (sw * base < W - 1 || sh * base < H - 1)) {
        if (bgMode === 'blur') {
          let sm = small;
          if (!sm) { sm = this._smallV || (this._smallV = mk(48, 27)); sm.getContext('2d').drawImage(src, 0, 0, sm.width, sm.height); }
          const bs = Math.max(W / sm.width, H / sm.height) * 1.1;
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(sm, (W - sm.width * bs) / 2, (H - sm.height * bs) / 2, sm.width * bs, sm.height * bs);
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
        } else {
          ctx.fillStyle = (this.show.bg && this.show.bg.color) || '#000'; ctx.fillRect(0, 0, W, H);
        }
      }
      // 動態
      const m = it.type === 'video' && !it.motion ? FA.MOTION_BY.none : FA.motionOf(it, idx);
      const p = FA.ease.ease(clamp(lt / dur, 0, 1));
      const z = lerp(m.from.z, m.to.z, p), ox = lerp(m.from.x, m.to.x, p), oy = lerp(m.from.y, m.to.y, p);
      const sc = base * z;
      const dw = sw * sc, dh = sh * sc;
      let dx = (W - dw) / 2 - ox * dw, dy = (H - dh) / 2 - oy * dh;
      const fx = FA.FX_BY[it.fx || 'none'] || FA.FX.none;
      ctx.imageSmoothingQuality = 'high';
      ctx.filter = (fx && fx.filter) || 'none';
      ctx.drawImage(src, sx, sy, sW, sH, dx, dy, dw, dh);
      ctx.filter = 'none';
      if (fx) this.fxOverlay(ctx, fx, lt, src, sx, sy, sW, sH, dx, dy, dw, dh);
      FA.drawFrame(ctx, it.frame || this.show.frame, W, H);
      ctx.restore();
    }
    fxOverlay(ctx, fx, lt, src, sx, sy, sW, sH, dx, dy, dw, dh) {
      const { W, H } = this;
      if (fx.glow) {
        ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.35; ctx.filter = 'blur(' + Math.round(H / 60) + 'px)';
        ctx.drawImage(src, sx, sy, sW, sH, dx, dy, dw, dh); ctx.restore();
      }
      if (fx.wood) {
        ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.55;
        ctx.fillStyle = ctx.createPattern(woodTex(), 'repeat'); ctx.fillRect(dx, dy, dw, dh); ctx.restore();
      }
      if (fx.tint) { ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = fx.tint.replace(/[\d.]+\)$/, '0.6)'); ctx.fillRect(0, 0, W, H); ctx.restore(); ctx.fillStyle = fx.tint; ctx.fillRect(0, 0, W, H); }
      if (fx.grain) {
        ctx.save(); ctx.globalAlpha = fx.grain; ctx.globalCompositeOperation = 'overlay';
        const pat = ctx.createPattern(noiseTex(), 'repeat');
        const f = Math.floor(lt * 24);
        ctx.translate((f * 37) % 256, (f * 91) % 256);
        ctx.fillStyle = pat; ctx.fillRect(-256, -256, W + 512, H + 512); ctx.restore();
      }
      if (fx.scratch) {
        const f = Math.floor(lt * 12);
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,240,0.3)'; ctx.lineWidth = 1;
        for (let k = 0; k < 2; k++) if (FA.rnd(f * 5 + k) < 0.5) { const x = FA.rnd(f * 9 + k) * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 3, H); ctx.stroke(); }
        ctx.restore();
      }
      if (fx.vignette) {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + fx.vignette + ')');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }
  }
  FA.Engine = Engine;

  // 字型：思源黑體放在 assets/fonts；其他用電腦內建
  const FONT_OK = new Set();
  FA.ensureFont = async function (T) {
    const s = textStyle(T || {});
    const key = FA.fontCSS(s, 40);
    if (FONT_OK.has(key) || !document.fonts) return;
    try { await document.fonts.load(key, '家庭相簿 Album'); } catch (e) { /* 沒有這個字型就用預設 */ }
    FONT_OK.add(key);
  };
})();
