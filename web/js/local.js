/* 線上版／手機版的「本機核心」：取代桌面版的 Python 伺服器。
 * 只有 docs/（線上版）與手機 App 的 index.html 會載入這個檔（放在 api.js 後面）。
 * - 相簿、素材、偏好設定都存在瀏覽器的 IndexedDB（不上傳到任何伺服器）
 * - 沒有 MariaDB 與帳號：一個本機使用者，擁有全部權限
 * - 輸出影片：WebCodecs（H.264＋AAC）＋ mp4-muxer，直接在瀏覽器產生 MP4 後下載
 */
(function () {
  const FA = window.FA;
  FA.WEB = true;
  FA.key = 'web';
  FA.sid = 'web';
  const VERSION = window.FA_WEB_VERSION || '0.9.0';
  const USER = { uid: 'local', name: '本機使用者', is_admin: true, perms: { EDIT: 2, EXPORT: 2, SHARE: 2, SYS: 2 } };
  const URLS = new Map();          // 素材 id → blob: 網址

  // ------------------------------------------------------------ IndexedDB
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('zms-family-album', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('media', { keyPath: 'id', autoIncrement: true }).createIndex('sha1', 'sha1');
        d.createObjectStore('blobs');
        d.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
        d.createObjectStore('kv');
        d.createObjectStore('exports', { keyPath: 'id', autoIncrement: true });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then((v) => (out = v));
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('儲存失敗（瀏覽器空間可能不足）'));
    });
  }
  const P = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  const all = (store) => tx(store, 'readonly', (s) => P(s.getAll()));
  const getOne = (store, k) => tx(store, 'readonly', (s) => P(s.get(k)));
  const put = (store, v, k) => tx(store, 'readwrite', (s) => P(k === undefined ? s.put(v) : s.put(v, k)));
  const del = (store, k) => tx(store, 'readwrite', (s) => P(s.delete(k)));

  const now = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()); };
  const bizErr = (m) => { const e = new Error(m); e.biz = true; return e; };

  // ------------------------------------------------------------ 素材
  const PHOTO = /\.(jpe?g|png|gif|bmp|webp|avif)$/i, VIDEO = /\.(mp4|m4v|mov|webm)$/i, AUDIO = /\.(mp3|wav|ogg|m4a|aac|flac|opus|weba|webm)$/i;
  function kindOf(name, kind) {
    if (kind === 'audio' && AUDIO.test(name)) return 'audio';
    if (PHOTO.test(name)) return 'photo';
    if (VIDEO.test(name)) return 'video';
    if (AUDIO.test(name)) return 'audio';
    if (/\.(heic|heif|tiff?|avi|wmv|mpg|mpeg|3gp|mkv|flv|mts|m2ts|wma)$/i.test(name)) {
      throw bizErr('線上版無法讀取這種格式：' + name + '（請先轉成 JPG／MP4／MP3，或使用電腦版，電腦版會自動轉檔）');
    }
    throw bizErr('不支援的檔案類型：' + name);
  }
  function row(m) { const r = Object.assign({}, m); delete r.sha1; return r; }
  function urlOf(id, blob) {
    if (!URLS.has(id) && blob) URLS.set(id, URL.createObjectURL(blob));
    return URLS.get(id) || '';
  }
  async function ensureUrls(ids) {
    for (const id of ids) if (!URLS.has(id)) { const b = await getOne('blobs', id); if (b) urlOf(id, b); }
  }
  FA.mediaURL = (id) => URLS.get(+id) || '';

  function probeMedia(kind, blob) {
    return new Promise((res) => {
      const u = URL.createObjectURL(blob);
      const done = (v) => { URL.revokeObjectURL(u); res(v); };
      if (kind === 'photo') {
        const im = new Image();
        im.onload = () => done({ width: im.naturalWidth, height: im.naturalHeight, duration: 0 });
        im.onerror = () => done(null);
        im.src = u;
      } else {
        const el = document.createElement(kind === 'video' ? 'video' : 'audio');
        el.preload = 'metadata'; el.muted = true;
        el.onloadedmetadata = () => done({ width: el.videoWidth || 0, height: el.videoHeight || 0, duration: isFinite(el.duration) ? el.duration : 0 });
        el.onerror = () => done(null);
        el.src = u;
        setTimeout(() => done(null), 15000);
      }
    });
  }
  async function sha1(buf) {
    if (crypto.subtle) { const h = await crypto.subtle.digest('SHA-1', buf); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
    let h = 0; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 97) h = (h * 31 + a[i]) | 0;
    return 'x' + a.length + '-' + h;
  }
  async function importBlob(blob, name, kind) {
    kind = kindOf(name, kind);
    const buf = await blob.arrayBuffer();
    const sha = await sha1(buf);
    const old = await tx('media', 'readonly', (s) => P(s.index('sha1').get(sha)));
    if (old && old.kind === kind) { urlOf(old.id, await getOne('blobs', old.id)); return row(old); }
    const info = await probeMedia(kind, blob);
    if (!info) throw bizErr((kind === 'video' ? '這個影片' : kind === 'audio' ? '這個聲音檔' : '這張相片') + '的格式瀏覽器無法播放：' + name + '（請使用電腦版，電腦版會自動轉檔）');
    const m = { owner: 'local', kind, name, sha1: sha, size: blob.size, width: info.width, height: info.height, duration: info.duration,
      taken_at: blob.lastModified ? new Date(blob.lastModified).toISOString().replace('T', ' ').slice(0, 19) : now(), created_at: now() };
    m.id = await put('media', m);
    await put('blobs', new Blob([buf], { type: blob.type || '' }), m.id);
    urlOf(m.id, await getOne('blobs', m.id));
    return row(m);
  }
  async function fetchBlob(path) {
    const r = await fetch(path);
    if (!r.ok) throw bizErr('無法下載：' + path);
    return r.blob();
  }

  // ------------------------------------------------------------ 輸出（WebCodecs → MP4）
  const JOBS = new Map();
  let jobSeq = 0;
  async function pickVideoCodec(w, h, fps, bitrate) {
    const list = w * h > 1920 * 1088 ? ['avc1.640033', 'avc1.4d0033', 'avc1.420033'] : ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42001f'];
    for (const codec of list) {
      for (const hw of ['prefer-hardware', 'no-preference', 'prefer-software']) {
        const cfg = { codec, width: w, height: h, bitrate, framerate: fps, hardwareAcceleration: hw, avc: { format: 'avc' } };
        try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (e) { /* 試下一個 */ }
      }
    }
    return null;
  }
  async function pickAudioCodec() {
    if (typeof AudioEncoder === 'undefined') return null;
    for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
      const cfg = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 };
      try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, mux }; } catch (e) { /* 試下一個 */ }
    }
    return null;
  }
  FA.webExportSupported = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && window.Mp4Muxer;

  async function exportStart(b) {
    if (!FA.webExportSupported()) throw bizErr('這個瀏覽器不支援在網頁上製作影片，請改用最新版 Chrome、Edge 或 Safari，或使用電腦版。');
    const p = PRESETS.presets.find((x) => x.id === b.preset) || PRESETS.presets[0];
    let h = b.height || p.h, w;
    if (p.fixed && p.w) { w = p.w; h = p.h; } else w = Math.round((h * (b.aspect === '4:3' ? 4 / 3 : 16 / 9)) / 2) * 2;
    const fps = p.fps;
    const q = { high: 1.5, normal: 1, small: 0.55 }[b.quality || 'normal'] || 1;
    const bitrate = Math.round(Math.min(40e6, w * h * fps * 0.09 * q));
    const vcfg = await pickVideoCodec(w, h, fps, bitrate);
    if (!vcfg) throw bizErr('這個瀏覽器無法用 H.264 編碼 ' + w + '×' + h + ' 的影片，請選小一點的畫面或改用電腦版。');
    const acodec = await pickAudioCodec();
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), fastStart: 'in-memory', firstTimestampBehavior: 'offset',
      video: { codec: 'avc', width: w, height: h, frameRate: fps }, audio: acodec ? { codec: acodec.mux, numberOfChannels: 2, sampleRate: 48000 } : undefined });
    const job = { id: 'w' + ++jobSeq, w, h, fps, muxer, acodec, err: null, name: (b.name || 'album').replace(/[\\/:*?"<>|]/g, '_') + '.mp4', frames: 0, preset: p.id, pid: b.project_id, seconds: b.seconds || 0 };
    job.venc = new VideoEncoder({ output: (c, meta) => muxer.addVideoChunk(c, meta), error: (e) => (job.err = job.err || e) });
    job.venc.configure(vcfg);
    JOBS.set(job.id, job);
    job.exportId = await put('exports', { project_id: b.project_id, preset: p.id, status: 'RUN', seconds: b.seconds || 0, created_at: now() });
    return { job: job.id, width: w, height: h, fps, path: job.name };
  }
  async function exportAudio(job, bytes) {
    if (!job.acodec) return;
    const dv = new DataView(bytes.buffer ? bytes.buffer : bytes, bytes.byteOffset || 0);
    let off = 12, fmt = null, data = null;
    while (off + 8 <= dv.byteLength) {
      const id = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3)), sz = dv.getUint32(off + 4, true);
      if (id === 'fmt ') fmt = { ch: dv.getUint16(off + 10, true), rate: dv.getUint32(off + 12, true) };
      if (id === 'data') { data = { off: off + 8, n: sz }; break; }
      off += 8 + sz + (sz & 1);
    }
    if (!fmt || !data) return;
    const ch = fmt.ch, frames = Math.floor(data.n / 2 / ch);
    // Safari 的 AAC 編碼器不給 decoderConfig.description（AudioSpecificConfig），有時還會輸出 ADTS 標頭 →
    // 自己補上 AudioSpecificConfig、去掉 ADTS 標頭，否則 MP4 的聲音軌會是「0 聲道」放不出來
    const aac = job.acodec.mux === 'aac';
    const FREQ = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
    const fi = Math.max(0, FREQ.indexOf(fmt.rate));
    const asc = new Uint8Array([(2 << 3) | (fi >> 1), ((fi & 1) << 7) | (ch << 3)]);
    let first = true;
    const aenc = new AudioEncoder({ output: (c, meta) => {
      if (aac) {
        const d = new Uint8Array(c.byteLength); c.copyTo(d);
        if (d[0] === 0xff && (d[1] & 0xf0) === 0xf0) {
          const hl = d[1] & 1 ? 7 : 9;
          c = new EncodedAudioChunk({ type: c.type, timestamp: c.timestamp, duration: c.duration, data: d.subarray(hl) });
        }
        // 一律用自己算的 AudioSpecificConfig（Safari 給的可能是空的；AAC-LC 的值是固定算得出來的）
        if (first) meta = { decoderConfig: { codec: 'mp4a.40.2', sampleRate: fmt.rate, numberOfChannels: ch, description: asc } };
        else meta = undefined;
      }
      first = false;
      job.muxer.addAudioChunk(c, meta);
    }, error: (e) => (job.err = job.err || e) });
    aenc.configure(Object.assign({}, job.acodec.cfg, { sampleRate: fmt.rate, numberOfChannels: ch }, aac ? { aac: { format: 'aac' } } : {}));
    const CH = 4800;
    for (let s = 0; s < frames; s += CH) {
      const n = Math.min(CH, frames - s);
      const planar = new Float32Array(n * ch);
      for (let c = 0; c < ch; c++) for (let i = 0; i < n; i++) planar[c * n + i] = dv.getInt16(data.off + ((s + i) * ch + c) * 2, true) / 32768;
      const ad = new AudioData({ format: 'f32-planar', sampleRate: fmt.rate, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round((s / fmt.rate) * 1e6), data: planar });
      aenc.encode(ad); ad.close();
      if (aenc.encodeQueueSize > 50) await new Promise((r) => setTimeout(r, 0));
    }
    await aenc.flush();
    aenc.close();
  }
  // create.js 在網頁版直接把畫布交給這裡（不用轉 JPEG）
  FA.localFrame = async function (jobId, canvas, i) {
    const job = JOBS.get(jobId);
    if (!job) throw new Error('找不到輸出工作');
    if (job.err) throw job.err;
    const ts = Math.round((i / job.fps) * 1e6);
    const vf = new VideoFrame(canvas, { timestamp: ts, duration: Math.round(1e6 / job.fps) });
    job.venc.encode(vf, { keyFrame: i % Math.round(job.fps * 2) === 0 });
    vf.close();
    job.frames++;
    while (job.venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
  };
  async function exportFinish(job) {
    await job.venc.flush();
    job.venc.close();
    if (job.err) throw job.err;
    job.muxer.finalize();
    const blob = new Blob([job.muxer.target.buffer], { type: 'video/mp4' });
    JOBS.delete(job.id);
    FA.saveBlob(blob, job.name);
    await put('exports', { id: job.exportId, project_id: job.pid, preset: job.preset, status: 'DONE', seconds: job.seconds, size: blob.size, path: job.name, created_at: now(), finished_at: now() });
    return { path: job.name, size: blob.size, web: true };
  }
  // 存檔：手機 App 外殼有自己的存檔橋（ZMSAndroid／webkit.messageHandlers），網頁版用下載
  FA.saveBlob = function (blob, name) {
    if (window.ZMSAndroid && window.ZMSAndroid.saveBegin) {     // Android App：分段傳給 App 存到「影片/家庭相簿」，再開分享選單
      (async () => {
        const b = JSON.parse(window.ZMSAndroid.saveBegin(name, blob.type || 'video/mp4'));
        if (b.status !== 'ok') throw new Error(b.message);
        const CH = 3 * 1024 * 1024;
        for (let o = 0; o < blob.size; o += CH) {
          const buf = new Uint8Array(await blob.slice(o, o + CH).arrayBuffer());
          let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
          const r = JSON.parse(window.ZMSAndroid.saveChunk(b.id, btoa(bin)));
          if (r.status !== 'ok') throw new Error(r.message);
        }
        const e = JSON.parse(window.ZMSAndroid.saveEnd(b.id));
        if (e.status !== 'ok') throw new Error(e.message);
        FA.toast('影片已存到手機的「' + e.path + '」', 'ok');
      })().catch((e) => FA.toast('存檔失敗：' + e.message, 'err'));
      return;
    }
    if (window.ZMSIOS) {         // iPhone／iPad App：傳給 App 內的伺服器 → 分享選單（存到照片、檔案、LINE…）
      fetch('/__save?name=' + encodeURIComponent(name), { method: 'POST', body: blob }).catch((e) => FA.toast('存檔失敗：' + e.message, 'err'));
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };

  // 線上版的輸出格式：瀏覽器只能產生 MP4（H.264＋AAC）
  const PRESETS = {
    cats: [
      { id: 'pc', name: '存到電腦', desc: 'MP4 影片（各種裝置都能播）' },
      { id: 'mobile', name: '手機平板', desc: 'iPhone、iPad、Android' },
      { id: 'web', name: '網路分享', desc: 'YouTube、Facebook、LINE、Instagram' },
    ],
    presets: [
      { id: 'mp4', cat: 'pc', name: 'MP4 720p', desc: '一般用途，檔案適中', ext: 'mp4', h: 720, w: 0, fps: 30, fixed: false, audio: true },
      { id: 'mp4_1080', cat: 'pc', name: 'MP4 1080p 高畫質', desc: 'Full HD，適合電視、大螢幕', ext: 'mp4', h: 1080, w: 0, fps: 30, fixed: false, audio: true },
      { id: 'mp4_480', cat: 'pc', name: 'MP4 480p 省空間', desc: '檔案小、製作快', ext: 'mp4', h: 480, w: 0, fps: 30, fixed: false, audio: true },
      { id: 'iphone', cat: 'mobile', name: 'iPhone／iPad', desc: '1080p H.264', ext: 'mp4', h: 1080, w: 0, fps: 30, fixed: false, audio: true },
      { id: 'android', cat: 'mobile', name: 'Android 手機', desc: '720p H.264', ext: 'mp4', h: 720, w: 0, fps: 30, fixed: false, audio: true },
      { id: 'youtube', cat: 'web', name: 'YouTube', desc: '1080p，上傳後畫質最好', ext: 'mp4', h: 1080, w: 0, fps: 30, fixed: false, audio: true },
      { id: 'facebook', cat: 'web', name: 'Facebook', desc: '720p', ext: 'mp4', h: 720, w: 0, fps: 30, fixed: false, audio: true },
      { id: 'line', cat: 'web', name: 'LINE', desc: '720p，傳給親友', ext: 'mp4', h: 720, w: 0, fps: 30, fixed: false, audio: true },
      { id: 'instagram', cat: 'web', name: 'Instagram', desc: '1080p', ext: 'mp4', h: 1080, w: 0, fps: 30, fixed: false, audio: true },
    ],
  };

  // ------------------------------------------------------------ API 路由
  const R = {
    state: async () => ({ ready: true, error: '', app: '資料助秘家庭相簿編輯', version: VERSION + '（線上版）', credit: '開發：吳玉柱 先生 與 Claude AI Opus 5.5',
      native: false, web: true, has_users: true, company: '', user: USER, funcs: [], roles: [] }),
    last_user: async () => ({ uid: 'local' }),
    login: async () => ({ session: 'web' }), setup: async () => ({ session: 'web' }), logout: async () => ({}),
    company: async (b) => {
      if (b && b.name !== undefined) { await put('kv', b.name, 'company'); return {}; }
      return { name: (await getOne('kv', 'company')) || '', out_dir: '', default_out: '' };
    },
    pref: async (b) => {
      const cur = (await getOne('kv', 'pref')) || {};
      if (b && Object.keys(b).length) { Object.assign(cur, b); await put('kv', cur, 'pref'); }
      return cur;
    },
    presets: async () => PRESETS,
    upload: async (bytes, q) => importBlob(bytes instanceof Blob ? bytes : new Blob([bytes]), q.name || 'file', q.kind || ''),
    sample_media: async () => {
      const caps = await (await fetch('assets/samples/samples.json')).json();
      const out = [];
      for (const c of caps) {
        const m = await importBlob(await fetchBlob('assets/samples/' + c.file), '範本-' + c.caption + '.jpg', 'photo');
        m.caption = c.caption; out.push(m);
      }
      return out;
    },
    music_import: async (b) => {
      const lib = await FA.loadMusicLib();
      const m = lib.find((x) => x.file === b.file);
      if (!m) throw bizErr('找不到這首音樂');
      const r = await importBlob(await fetchBlob('assets/music/' + m.file), m.name + '.m4a', 'audio');
      r.credit = m.credit;
      return r;
    },
    media_delete: async (b) => { await del('media', +b.id); await del('blobs', +b.id); return {}; },
    media_rename: async (b) => { const m = await getOne('media', +b.id); if (m) { m.name = b.name; await put('media', m); } return {}; },
    projects: async () => {
      const ps = await all('projects');
      await ensureUrls(ps.map((p) => p.thumb).filter(Boolean));
      return ps.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).map((p) => ({ id: p.id, name: p.name, owner: 'local', owner_name: USER.name, shared: 0,
        aspect: p.aspect, seconds: p.seconds || 0, items: p.items || 0, thumb: p.thumb || null, updated_at: (p.updated_at || '').slice(0, 16), mine: true }));
    },
    project: async (b) => {
      const p = await getOne('projects', +b.id);
      if (!p) throw bizErr('找不到這本相簿');
      const ids = new Set();
      (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const k in o) { if (k === 'media' && typeof o[k] === 'number') ids.add(o[k]); else walk(o[k]); } })(p.data);
      const media = {};
      for (const id of ids) { const m = await getOne('media', id); if (m) media[id] = row(m); }
      await ensureUrls([...ids]);
      return { id: p.id, name: p.name, owner: 'local', shared: 0, aspect: p.aspect, data: p.data, media, mine: true, editable: true };
    },
    project_save: async (b) => {
      const p = b.id ? (await getOne('projects', +b.id)) || {} : { aspect: b.aspect || '16:9' };
      Object.assign(p, { name: (b.name || '').trim().slice(0, 100) || '未命名相簿', data: b.data || {}, seconds: b.seconds || 0, items: b.items || 0, thumb: b.thumb || null, updated_at: now() });
      if (b.aspect) p.aspect = b.aspect;
      if (b.id) p.id = +b.id;
      return { id: await put('projects', p) };
    },
    project_meta: async (b) => { const p = await getOne('projects', +b.id); if (p && b.name != null) { p.name = b.name; p.updated_at = now(); await put('projects', p); } return {}; },
    project_copy: async (b) => { const p = await getOne('projects', +b.id); delete p.id; p.name += '（複製）'; p.updated_at = now(); return { id: await put('projects', p) }; },
    project_delete: async (b) => { await del('projects', +b.id); return {}; },
    exports: async (q) => (await all('exports')).filter((x) => !q || !q.pid || +x.project_id === +q.pid).reverse().slice(0, 20),
    export_start: exportStart,
    export_audio: async (bytes, q) => { const j = JOBS.get(q.job); if (!j) throw new Error('找不到輸出工作'); await exportAudio(j, bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes); return {}; },
    export_frame: async () => { throw new Error('網頁版請用 FA.localFrame'); },
    export_finish: async (_, q) => { const j = JOBS.get(q.job); if (!j) throw new Error('找不到輸出工作'); return exportFinish(j); },
    export_cancel: async (_, q) => { const j = JOBS.get(q.job); if (j) { try { j.venc.close(); } catch (e) { /* 已關閉 */ } JOBS.delete(q.job); await put('exports', { id: j.exportId, project_id: j.pid, preset: j.preset, status: 'STOP', created_at: now() }); } return {}; },
    update_check: async () => {
      const app = window.ZMSIOS || window.ZMSAndroid;
      if (!app) return { latest: true, info: null, current: VERSION, note: '線上版每次開啟都是最新版。' };
      const cur = window.ZMSIOS ? window.ZMSIOS.version : (window.ZMSAndroid.getVersion ? window.ZMSAndroid.getVersion() : VERSION);
      const r = await fetch('https://api.github.com/repos/achir1015/zms-family-album/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw bizErr('無法連到更新伺服器（' + r.status + '）');
      const rel = await r.json();
      const want = window.ZMSIOS ? /-ios\.ipa$/ : /-android\.apk$/;
      const asset = (rel.assets || []).find((a) => want.test(a.name));
      const ver = (rel.tag_name || '').replace(/^v/i, '');
      const num = (v) => v.split('.').map((x) => +x || 0).reduce((t, x) => t * 1000 + x, 0);
      if (!asset || num(ver) <= num(cur)) return { latest: true, info: null, current: cur };
      const page = window.ZMSIOS ? 'https://achir1015.github.io/zms-family-album/ios/' : asset.browser_download_url;
      return { latest: false, current: cur, info: { version: ver, notes: rel.body || '', page, size: asset.size, name: '' } };
    },
  };
  const NOT_WEB = (what) => async () => { throw bizErr('線上版沒有「' + what + '」功能，請使用電腦版。'); };
  Object.assign(R, { users: async () => [], audit: async () => [], password: NOT_WEB('變更密碼'), user_save: NOT_WEB('使用者管理'), user_delete: NOT_WEB('使用者管理'),
    backup: NOT_WEB('資料庫備份'), restore: NOT_WEB('資料庫還原'), shortcut: NOT_WEB('桌面捷徑'), update_install: NOT_WEB('程式內更新'), import_paths: NOT_WEB('從資料夾匯入') });

  async function call(name, body, q) {
    const f = R[name];
    if (!f) throw new Error('線上版沒有這個功能：' + name);
    try { return await f(body, q || {}); } catch (e) { throw e instanceof Error ? e : new Error(String(e)); }
  }
  // Android 返回鍵：先關對話框，再從編輯畫面回相簿清單（app 回傳 true＝已處理）
  window.__zmsBack = function () {
    const x = document.querySelector('.dlg .x, .dlg-close, .dlg [data-close]');
    if (document.querySelector('.dlg')) { if (x) x.click(); else document.querySelector('.dlg').remove(); return true; }
    if (FA.S.project) { FA.gotoHome(); return true; }
    return false;
  };
  if (window.ZMSAndroid && window.ZMSAndroid.openUrl) window.open = (u) => { window.ZMSAndroid.openUrl(String(u)); return null; };
  FA.api = (name, body) => call(name, body || {}, {});
  FA.get = (name, params) => call(name, params || {}, params || {});
  FA.raw = (name, bytes, params) => call(name, bytes, params || {});
  FA.upload = (file, kind) => call('upload', file, { name: file.name || 'file', kind: kind || '' });
})();
