/* 語音動態教學：小柯（資料助秘）一邊說明、一邊切換畫面並用聚光框指出按鈕。
 * 語音優先用 assets/voice/<課程>-<第幾句>.mp3（微軟自然語音預先產生），沒有就用電腦內建中文語音。 */
(function () {
  const FA = window.FA;
  const { $, h } = FA;
  const S = FA.S;
  const G = (FA.Guide = {});
  let cur = null;

  G.menu = function () {
    const box = h('div', {}, h('p', { class: 'hint' }, '選一個主題，小柯會一邊說明一邊示範，講完會自動接下一課。教學中可以按「下一句」、「上一句」或「結束」。'),
      (window.FA_LESSONS || []).map((L, i) => h('div', { class: 'lesson', onclick: () => { close(); G.playFrom(i); } }, h('div', { class: 'n' }, String(i + 1)), h('div', {}, h('b', {}, L.title), h('small', {}, L.desc)))),
      h('div', { class: 'lesson', onclick: () => { close(); G.playAll(); } }, h('div', { class: 'n' }, '▶'), h('div', {}, h('b', {}, '全部從頭播放'), h('small', {}, '約 6 分鐘'))));
    let close;
    FA.dialog({ title: '🔊 語音動態教學', width: '480px', body: box, buttons: [], onOpen: (b, c) => (close = c) });
  };
  G.autoStart = async function () {
    try {
      const pref = await FA.get('pref');
      if (pref.guideSeen) return;
      await FA.api('pref', { guideSeen: true });
    } catch (e) { return; }
    const ok = await FA.confirm('第一次使用嗎？要不要聽小柯用語音一步一步示範怎麼製作相簿影片？（之後可以在右上角「語音教學」再看）', '好，開始教學');
    if (ok) G.playFrom(0);
  };
  // 從第 i 課開始依序播放：每一課講完停 1.2 秒自動接下一課；按「結束」就整個停止
  let chain = 0;
  G.playFrom = async function (i) {
    const my = ++chain;
    const ls = window.FA_LESSONS || [];
    for (let k = Math.max(0, i); k < ls.length; k++) {
      const r = await G.play(ls[k].id, true);
      if (r === 'stop' || my !== chain) break;
      if (k + 1 < ls.length) {
        FA.toast('下一課：' + ls[k + 1].title, 'ok');
        await new Promise((res) => setTimeout(res, 1200));
        if (my !== chain) break;
      }
    }
  };
  G.playAll = () => G.playFrom(0);

  async function ensureEditor() {
    if (S.project) return true;
    const rows = await FA.get('projects').catch(() => []);
    if (rows.length) { await FA.openProject(rows[0].id); return true; }
    await FA.dialog({ title: '先建立一本相簿', body: h('p', {}, '這段教學要在編輯畫面示範。請先按「新增相簿」建立一本相簿，再開始這段教學。') });
    return false;
  }
  async function doAction(a) {
    if (!a) return;
    const [k, v] = a.split(':');
    if (k === 'home') { if (S.project) await FA.gotoHome(); return; }
    if (k === 'tab') FA.setTab(v);
    if (k === 'lib') { if (S.tab !== 'personalize') FA.setTab('personalize'); FA.libTab(v); }
    if (k === 'view') { if (S.tab === 'create') FA.setTab('personalize'); FA.setBottomView(v === 'time' ? 'time' : 'story'); }
    await new Promise((r) => setTimeout(r, 250));
  }

  G.play = async function (id, inChain) {
    if (!inChain) chain++;               // 單獨叫用時，取消正在連續播放的課程
    G.stop();
    const L = (window.FA_LESSONS || []).find((x) => x.id === id);
    if (!L) return;
    if (L.editor && !(await ensureEditor())) return 'stop';
    const me = (cur = { stop: false, idx: 0, audio: null, wake: null });
    const hole = h('div', { class: 'guide-hole' });
    const bubble = h('div', { class: 'guide-bubble' });
    document.body.append(hole, bubble);
    let res = 'done';
    while (me.idx < L.steps.length && !me.stop) {
      const st = L.steps[me.idx];
      await doAction(st.do);
      const el = $(st.sel);
      place(hole, bubble, el);
      const nav = { next: false, prev: false };
      bubble.innerHTML = '';
      bubble.append(h('div', { class: 'who' }, h('img', { src: 'assets/icon.png' }), '小柯（' + L.title + '　' + (me.idx + 1) + '／' + L.steps.length + '）'),
        h('div', {}, st.say),
        h('div', { class: 'acts' },
          h('button', { class: 'ghost', onclick: () => { me.stop = true; res = 'stop'; wake(); } }, '結束'),
          me.idx > 0 ? h('button', { class: 'ghost', onclick: () => { nav.prev = true; wake(); } }, '上一句') : null,
          h('button', { onclick: () => { nav.next = true; wake(); } }, '下一句 ▶')));
      place(hole, bubble, el);
      await speak(me, L.id + '-' + (me.idx + 1), st.say);
      if (me.stop) break;
      if (nav.prev) { me.idx--; continue; }
      if (!nav.next) await new Promise((r) => { me.wake = r; setTimeout(r, 900); });
      me.idx++;
    }
    function wake() { stopVoice(me); me.wake && me.wake(); }
    hole.remove(); bubble.remove();
    if (cur === me) cur = null;
    return me.stop ? 'stop' : res;
  };
  G.stop = function () { if (cur) { cur.stop = true; stopVoice(cur); cur.wake && cur.wake(); } };

  function place(hole, bubble, el) {
    // 畫面有自動縮放（html 的 CSS zoom）：getBoundingClientRect 與 innerWidth 是實際螢幕像素，
    // 但 left/top 會再被乘上縮放比例 → 全部換算成縮放後的座標，框才會對準
    const z = parseFloat(document.documentElement.style.zoom) || 1;
    const innerWidth = window.innerWidth / z, innerHeight = window.innerHeight / z;
    const b0 = el ? el.getBoundingClientRect() : null;
    const r = b0 ? { left: b0.left / z, top: b0.top / z, width: b0.width / z, height: b0.height / z }
      : { left: innerWidth / 2 - 100, top: innerHeight / 2 - 50, width: 200, height: 100 };
    const pad = 6;
    Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const bw = 360, bh = bubble.offsetHeight || 140;
    let x = r.left + r.width + 16, y = r.top;
    if (x + bw > innerWidth - 10) x = r.left - bw - 16;
    if (x < 10) { x = Math.min(innerWidth - bw - 10, Math.max(10, r.left)); y = r.top + r.height + 14; if (y + bh > innerHeight - 10) y = r.top - bh - 14; }
    y = Math.max(10, Math.min(innerHeight - bh - 10, y));
    Object.assign(bubble.style, { left: x + 'px', top: y + 'px' });
  }

  // ------------------------------------------------------------ 語音
  function stopVoice(me) {
    if (me.audio) { me.audio.pause(); me.audio.onended && me.audio.onended(); me.audio = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
    me.done && me.done();
  }
  function speak(me, key, text) {
    return new Promise((resolve) => {
      let finished = false;
      const done = (me.done = () => { if (!finished) { finished = true; me.done = null; resolve(); } });
      const a = new Audio('assets/voice/' + key + '.mp3');
      me.audio = a;
      a.onended = done;
      a.onerror = () => { me.audio = null; tts(text, done); };
      a.play().catch(() => { me.audio = null; tts(text, done); });
    });
  }
  function tts(text, done) {
    if (!window.speechSynthesis) return setTimeout(done, Math.max(2500, text.length * 220));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW'; u.rate = 1.05;
    const v = speechSynthesis.getVoices().find((x) => /zh[-_]TW/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^zh/i.test(x.lang));
    if (v) u.voice = v;
    u.onend = done; u.onerror = done;
    speechSynthesis.speak(u);
    setTimeout(done, Math.max(4000, text.length * 400));
  }
})();
