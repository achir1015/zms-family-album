/* 聲音：背景音樂、旁白、音效、影片原音。
 * 預覽時用即時 AudioContext 從目前時間開始排程；輸出時用 OfflineAudioContext 混成一個 WAV。 */
(function () {
  const FA = (window.FA = window.FA || {});
  const RATE = 48000;
  const BUF = new Map();          // key → Promise<AudioBuffer>
  let decodeCtx = null;

  function dctx() { return decodeCtx || (decodeCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: RATE })); }

  FA.audioBuffer = function (mid) {
    const key = 'm' + mid;
    if (!BUF.has(key)) {
      const p = fetch(FA.mediaURL(mid)).then((r) => { if (!r.ok) throw new Error('無法讀取聲音'); return r.arrayBuffer(); })
        .then((ab) => dctx().decodeAudioData(ab)).catch((e) => { console.warn('解碼失敗', mid, e); return null; });
      BUF.set(key, p);
    }
    return BUF.get(key);
  };

  // ------------------------------------------------------------ 音效合成
  FA.sfxBuffer = function (id) {
    const key = 's' + id;
    if (BUF.has(key)) return BUF.get(key);
    const def = FA.SFX_BY[id];
    const dur = def ? def.dur : 1;
    const oc = new OfflineAudioContext(2, Math.ceil(dur * RATE), RATE);
    const out = oc.createGain(); out.gain.value = 0.8; out.connect(oc.destination);
    const tone = (f, t0, d, type = 'sine', v = 0.4, f2) => {
      const o = oc.createOscillator(), g = oc.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + d + 0.05);
    };
    const noise = (t0, d, v, filt, f0, f1) => {
      const n = oc.createBuffer(1, Math.ceil(d * RATE), RATE), ch = n.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      const s = oc.createBufferSource(); s.buffer = n;
      const bq = oc.createBiquadFilter(); bq.type = filt || 'bandpass'; bq.frequency.setValueAtTime(f0 || 1000, t0);
      if (f1) bq.frequency.exponentialRampToValueAtTime(f1, t0 + d);
      const g = oc.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + d * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      s.connect(bq); bq.connect(g); g.connect(out); s.start(t0);
    };
    switch (id) {
      case 'chime': tone(1318, 0, 0.8); tone(988, 0.35, 1.2); break;
      case 'bell': [880, 1760, 2637].forEach((f, i) => tone(f, 0, 2.1, 'sine', 0.3 / (i + 1))); break;
      case 'pop': tone(600, 0, 0.12, 'sine', 0.6, 120); break;
      case 'whoosh': noise(0, 0.85, 0.5, 'bandpass', 300, 3000); break;
      case 'applause': for (let k = 0; k < 70; k++) noise(Math.random() * 3, 0.06, 0.35, 'highpass', 1500); break;
      case 'drum': tone(120, 0, 0.4, 'sine', 0.9, 45); tone(120, 0.5, 0.4, 'sine', 0.9, 45); noise(0.95, 0.3, 0.4, 'highpass', 2000); break;
      case 'magic': [1046, 1318, 1568, 2093, 2637].forEach((f, i) => tone(f, i * 0.12, 0.9, 'triangle', 0.25)); break;
      case 'camera': noise(0, 0.08, 0.7, 'highpass', 2500); noise(0.12, 0.1, 0.5, 'highpass', 1800); break;
      case 'heartbeat': [0, 0.25, 1, 1.25].forEach((t, i) => tone(i % 2 ? 50 : 60, t, 0.2, 'sine', 0.9, 30)); break;
      case 'birds': for (let k = 0; k < 9; k++) tone(2500 + Math.random() * 1500, k * 0.3 + Math.random() * 0.1, 0.12, 'sine', 0.25, 3800 + Math.random() * 800); break;
      case 'waves': noise(0, 2.4, 0.5, 'lowpass', 400, 1200); noise(2.2, 2.6, 0.5, 'lowpass', 500, 900); break;
      case 'tada': tone(523, 0, 0.25, 'square', 0.15); tone(784, 0.18, 1.2, 'square', 0.18); tone(1046, 0.18, 1.2, 'square', 0.1); break;
      default: tone(880, 0, 0.5);
    }
    const p = oc.startRendering();
    BUF.set(key, p);
    return p;
  };

  // ------------------------------------------------------------ 收集所有要播的聲音片段
  // 每段：{buf, at（在影片中的開始秒數）, off（從素材第幾秒開始）, dur, vol, fi, fo, loopUntil}
  FA.collectAudio = async function (show, tm) {
    const segs = [];
    const total = tm.total;
    const add = async (A, kind) => {
      const buf = A.sfx ? await FA.sfxBuffer(A.sfx) : await FA.audioBuffer(A.media);
      if (!buf) return;
      const inT = +A.in || 0;
      const outT = A.out ? Math.min(+A.out, buf.duration) : buf.duration;
      const len = Math.max(0.05, outT - inT);
      const at = +A.start || 0;
      if (A.loop || A.fit) {
        // 重複播到相簿結束（最後一段淡出）
        const end = A.fit ? total : at + (A.dur || len);
        let t = at;
        while (t < end - 0.05) {
          const d = Math.min(len, end - t);
          segs.push({ buf, at: t, off: inT, dur: d, vol: A.vol ?? 1, fi: t === at ? A.fadeIn || 0 : 0, fo: t + d >= end - 0.06 ? Math.max(A.fadeOut || 0, A.fit ? 2 : 0) : 0, kind });
          t += d;
        }
      } else {
        const d = Math.min(len, A.dur || len);
        segs.push({ buf, at, off: inT, dur: d, vol: A.vol ?? 1, fi: A.fadeIn || 0, fo: A.fadeOut || 0, kind });
      }
    };
    for (const A of show.music || []) await add(A, 'music');
    for (const A of show.voice || []) await add(A, 'voice');
    // 影片原音
    (show.items || []).forEach((it, i) => {
      if (it.type !== 'video' || it.mute || (it.vol ?? 1) <= 0) return;
      segs.push({ lazyMedia: it.media, at: tm.starts[i], off: +it.in || 0, dur: FA.itemDur(it), vol: it.vol ?? 1, fi: 0.15, fo: 0.15, kind: 'video', rate: +it.speed || 1 });
    });
    for (const s of segs) if (s.lazyMedia) s.buf = await FA.audioBuffer(s.lazyMedia);
    // 旁白時自動把背景音樂調小（ducking）
    const voices = segs.filter((s) => s.kind === 'voice');
    if (show.duck !== false && voices.length) for (const s of segs) if (s.kind === 'music') s.duck = voices.map((v) => [v.at, v.at + v.dur]);
    return segs.filter((s) => s.buf);
  };

  function schedule(ctx, dest, segs, from, startAt, master) {
    const nodes = [];
    for (const s of segs) {
      const end = s.at + s.dur;
      if (end <= from) continue;
      const src = ctx.createBufferSource();
      src.buffer = s.buf;
      if (s.rate && s.rate !== 1) src.playbackRate.value = s.rate;
      const g = ctx.createGain();
      const t0 = startAt + Math.max(0, s.at - from);         // 這段在 ctx 時間軸上的開始
      const skip = Math.max(0, from - s.at);                   // 已經過去的部分
      const vol = (s.vol ?? 1) * (master ?? 1);
      // 音量包絡：淡入、淡出、旁白壓低
      const envAt = (lt) => {
        let v = vol;
        if (s.fi && lt < s.fi) v *= lt / s.fi;
        if (s.fo && lt > s.dur - s.fo) v *= Math.max(0, (s.dur - lt) / s.fo);
        if (s.duck) for (const [a, b] of s.duck) { const T = s.at + lt; if (T > a - 0.3 && T < b + 0.3) v *= 0.35; }
        return Math.max(0.0001, v);
      };
      const step = 0.1;
      g.gain.setValueAtTime(envAt(skip), t0);
      for (let lt = Math.ceil(skip / step) * step; lt <= s.dur; lt += step) g.gain.linearRampToValueAtTime(envAt(lt), t0 + (lt - skip));
      src.connect(g); g.connect(dest);
      src.start(t0, s.off + skip * (s.rate || 1), (s.dur - skip) * (s.rate || 1));
      nodes.push(src);
    }
    return nodes;
  }

  // ------------------------------------------------------------ 預覽播放
  FA.AudioPlayer = class {
    constructor() { this.ctx = null; this.nodes = []; this.segs = null; this.key = ''; }
    async prepare(show, tm) {
      const key = JSON.stringify([show.music, show.voice, (show.items || []).filter((i) => i.type === 'video').map((i) => [i.id, i.in, i.dur, i.vol, i.mute, i.speed]), tm.starts.join(','), tm.total, show.duck]);
      if (key !== this.key || !this.segs) { this.segs = await FA.collectAudio(show, tm); this.key = key; }
    }
    start(from) {
      this.stop();
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: RATE });
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const at = this.ctx.currentTime + 0.08;
      this.t0 = at - from;
      this.nodes = this.muted ? [] : schedule(this.ctx, this.ctx.destination, this.segs || [], from, at, 1);
      return this.t0;
    }
    now() { return this.ctx ? this.ctx.currentTime - this.t0 : 0; }
    stop() { for (const n of this.nodes) { try { n.stop(); } catch (e) { /* 已停止 */ } } this.nodes = []; }
  };

  // ------------------------------------------------------------ 輸出混音 → WAV
  FA.mixWav = async function (show, tm) {
    const segs = await FA.collectAudio(show, tm);
    const len = Math.max(1, Math.ceil(tm.total * RATE));
    const oc = new OfflineAudioContext(2, len, RATE);
    const comp = oc.createDynamicsCompressor();       // 防止爆音
    comp.threshold.value = -6; comp.knee.value = 6; comp.ratio.value = 4;
    comp.connect(oc.destination);
    schedule(oc, comp, segs, 0, 0, 1);
    const buf = await oc.startRendering();
    return FA.wavBytes(buf);
  };
  FA.wavBytes = function (buf) {
    const ch = buf.numberOfChannels, n = buf.length, rate = buf.sampleRate;
    const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, rate, true);
    out.setUint32(28, rate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    return new Uint8Array(out.buffer);
  };

  // 波形（給剪輯音樂用）
  FA.waveform = async function (A, n) {
    const buf = A.sfx ? await FA.sfxBuffer(A.sfx) : await FA.audioBuffer(A.media);
    if (!buf) return [];
    const d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / n)), out = [];
    for (let i = 0; i < n; i++) { let m = 0; for (let k = i * step; k < Math.min(d.length, (i + 1) * step); k += 16) m = Math.max(m, Math.abs(d[k])); out.push(m); }
    return { peaks: out, duration: buf.duration };
  };
})();
