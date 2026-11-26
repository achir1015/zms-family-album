/* 主程式：啟動、登入、相簿清單、編輯畫面的共用狀態（目前相簿、選取、復原、儲存）。 */
(function () {
  const FA = window.FA;
  const { $, $$, h } = FA;
  const S = (FA.S = { state: null, user: null, project: null, showIdx: 0, sel: null, tab: 'organize', undo: [], redo: [], dirty: false, t: 0 });

  // ================================================================ 啟動
  FA.boot = async function () {
    if (!FA.key) { $('#splash-msg').textContent = '請從程式開啟（缺少連線金鑰）'; return; }
    for (let i = 0; i < 240; i++) {
      try {
        const st = await FA.get('state');
        S.state = st;
        $('#credit').textContent = st.credit + '　版本 ' + st.version;
        if (st.error) { $('#splash-msg').textContent = st.error; return; }
        if (st.ready) break;
      } catch (e) { $('#splash-msg').textContent = e.message; }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (S.state.user) { S.user = S.state.user; return FA.gotoHome(); }
    FA.showLogin();
  };
  // 螢幕縮放比例很大（筆電 150%、175%）時，畫面裝不下 → 整體自動縮小到剛好放得下
  function fitZoom() {
    const z = Math.min(1, window.innerWidth / 1300, window.innerHeight / 780);
    document.documentElement.style.zoom = z < 0.98 ? Math.max(0.6, z).toFixed(3) : '';
  }
  window.addEventListener('resize', fitZoom);
  fitZoom();
  FA.screen = (id) => { $$('.screen').forEach((s) => s.classList.toggle('show', s.id === id)); };
  FA.onLoggedOut = () => { FA.setSession(''); S.user = null; FA.showLogin(); };
  FA.can = (f, lvl) => !!S.user && (S.user.is_admin || (S.user.perms[f] || 0) >= (lvl || 1));

  // ================================================================ 登入
  FA.showLogin = async function () {
    FA.screen('login');
    const f = $('#login-form');
    f.innerHTML = '';
    const first = !S.state.has_users;
    $('#login-sub').textContent = first ? '第一次使用：請建立系統管理員帳號' : '請登入';
    const uid = h('input', { class: 'inp', id: 'lg-uid', autocomplete: 'username' });
    const name = h('input', { class: 'inp', id: 'lg-name' });
    const pw = h('input', { class: 'inp', type: 'password', id: 'lg-pw', autocomplete: first ? 'new-password' : 'current-password' });
    const pw2 = h('input', { class: 'inp', type: 'password', id: 'lg-pw2' });
    const go = async () => {
      try {
        let r;
        if (first) {
          if (pw.value !== pw2.value) throw new Error('兩次輸入的密碼不一樣');
          r = await FA.api('setup', { uid: uid.value.trim(), name: name.value.trim() || uid.value.trim(), pw: pw.value });
        } else r = await FA.api('login', { uid: uid.value.trim(), pw: pw.value });
        FA.setSession(r.session);
        S.state = await FA.get('state');
        S.user = S.state.user;
        FA.gotoHome(true);
      } catch (e) { FA.err(e); }
    };
    [uid, name, pw, pw2].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }));
    f.append(h('label', { class: 'fld' }, '帳號', uid));
    if (first) f.append(h('label', { class: 'fld' }, '姓名', name));
    f.append(h('label', { class: 'fld' }, '密碼' + (first ? '（至少 6 個字）' : ''), pw));
    if (first) f.append(h('label', { class: 'fld' }, '再輸入一次密碼', pw2));
    f.append(h('button', { class: 'btn primary', id: 'lg-go', onclick: go }, first ? '建立並開始使用' : '登入'));
    try { const lu = await FA.get('last_user'); if (lu.uid && !first) { uid.value = lu.uid; pw.focus(); } else uid.focus(); } catch (e) { uid.focus(); }
  };

  // ================================================================ 使用者選單
  function userMenu(btn) {
    if (FA.WEB) return FA.menu(btn, [['🔊 語音動態教學', () => FA.Guide.menu()], ['🏠 家庭名稱', () => FA.Admin.company()], ['ℹ 關於', () => FA.Admin.about()]]);
    const items = [
      ['🔊 語音動態教學', () => FA.Guide.menu()],
      ['🔑 變更密碼', changePw],
    ];
    if (FA.can('SYS', 1)) items.push(null, ['👥 使用者與權限', () => FA.Admin.users()], ['🏠 家庭／公司設定', () => FA.Admin.company()], ['📜 操作紀錄', () => FA.Admin.audit()]);
    if (FA.can('SYS', 2)) items.push(['💾 備份與還原', () => FA.Admin.backup()]);
    items.push(null, ['⬆ 檢查更新', () => FA.Admin.update()], ['🖥 建立桌面捷徑', () => FA.Admin.shortcut()], ['ℹ 關於', () => FA.Admin.about()], null, ['🚪 登出', logout]);
    FA.menu(btn, items);
  }
  FA.menu = function (anchor, items) {
    $$('.menu').forEach((m) => m.remove());
    const m = h('div', { class: 'menu' }, items.map((it) => it ? h('button', { onclick: () => { m.remove(); it[1](); } }, it[0]) : h('hr')));
    document.body.append(m);
    const r = FA.rect(anchor);
    m.style.top = r.bottom + 4 + 'px';
    m.style.left = Math.min(window.innerWidth / FA.Z() - m.offsetWidth - 8, r.left) + 'px';
    setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
  };
  async function changePw() {
    const o = h('input', { class: 'inp', type: 'password' }), n = h('input', { class: 'inp', type: 'password' }), n2 = h('input', { class: 'inp', type: 'password' });
    await FA.dialog({ title: '變更密碼', body: h('div', {}, h('label', { class: 'fld' }, '舊密碼', o), h('label', { class: 'fld' }, '新密碼（至少 6 個字）', n), h('label', { class: 'fld' }, '再輸入一次', n2)),
      buttons: [{ label: '取消', value: null }, { label: '變更', primary: true, onClick: async () => { if (n.value !== n2.value) throw new Error('兩次新密碼不一樣'); await FA.api('password', { old: o.value, new: n.value }); FA.toast('密碼已變更', 'ok'); } }] });
  }
  async function logout() {
    if (S.project) await FA.saveNow();
    await FA.api('logout').catch(() => 0);
    FA.setSession(''); S.user = null; S.project = null;
    S.state = await FA.get('state');
    FA.showLogin();
  }
  $('#home-user').addEventListener('click', (e) => userMenu(e.currentTarget));
  $('#ed-user').addEventListener('click', (e) => userMenu(e.currentTarget));
  $('#home-guide').addEventListener('click', () => FA.Guide.menu());
  $('#btn-guide').addEventListener('click', () => FA.Guide.menu());

  // ================================================================ 相簿清單
  FA.gotoHome = async function (fromLogin) {
    if (S.project) { await FA.saveNow(); S.project = null; FA.Player && FA.Player.stop(); }
    FA.screen('home');
    $$('.uname').forEach((e) => (e.textContent = S.user.name));
    $('#btn-new').disabled = !FA.can('EDIT', 2);
    $('#btn-sample').disabled = !FA.can('EDIT', 2);
    const grid = $('#project-grid');
    grid.innerHTML = '';
    let rows = [];
    try { rows = await FA.get('projects'); } catch (e) { FA.err(e); }
    if (!rows.length) grid.append(h('div', { class: 'empty' }, FA.can('EDIT', 2) ? ['還沒有相簿，按右上角「＋ 新增相簿」開始製作第一本吧！', h('br'), h('br'),
      h('button', { class: 'btn big', onclick: () => FA.makeSample() }, '🎓 先用範本看看（畢業紀念相簿，40 張範例相片）')] : '目前沒有可以觀看的相簿。'));
    for (const p of rows) {
      const th = h('div', { class: 'thumb' }, '🖼');
      if (p.thumb) { th.style.backgroundImage = 'url("' + FA.mediaURL(p.thumb) + '")'; th.textContent = ''; }
      const acts = h('div', { class: 'acts' });
      if (p.mine && FA.can('EDIT', 2)) {
        acts.append(
          h('button', { class: 'mini', title: '改名', onclick: (e) => { e.stopPropagation(); rename(p); } }, '改名'),
          h('button', { class: 'mini', title: '複製一份', onclick: async (e) => { e.stopPropagation(); await FA.api('project_copy', { id: p.id }).catch(FA.err); FA.gotoHome(); } }, '複製'),
          h('button', { class: 'mini', title: p.shared ? '取消分享' : '分享給家人觀看', onclick: async (e) => { e.stopPropagation(); await FA.api('project_meta', { id: p.id, shared: !p.shared }).catch(FA.err); FA.gotoHome(); } }, p.shared ? '取消分享' : '分享'),
          h('button', { class: 'mini', title: '刪除', onclick: async (e) => { e.stopPropagation(); if (await FA.confirm('確定要刪除相簿「' + p.name + '」嗎？（相片素材不會被刪除）', '刪除', true)) { await FA.api('project_delete', { id: p.id }).catch(FA.err); FA.gotoHome(); } } }, '刪除'));
      }
      grid.append(h('div', { class: 'pcard', onclick: () => FA.openProject(p.id) }, th,
        h('div', { class: 'info' }, h('div', { class: 'name' }, p.name),
          h('div', { class: 'meta' }, h('span', {}, FA.fmtTime(p.seconds)), h('span', {}, p.items + ' 個素材'), h('span', {}, p.aspect), h('span', {}, p.updated_at),
            p.shared ? h('span', { class: 'badge' }, '已分享') : null, !p.mine ? h('span', { class: 'badge' }, p.owner_name || p.owner) : null)),
        acts));
    }
    if (fromLogin) FA.Guide.autoStart();
  };
  async function rename(p) {
    const n = await FA.prompt('相簿改名', p.name, '新名稱');
    if (n) { await FA.api('project_meta', { id: p.id, name: n }).catch(FA.err); FA.gotoHome(); }
  }
  // 內建範本：40 張 AI 產生的畢業與校園生活相片 → 三段影片、各自套風格、每張加字幕
  FA.makeSample = async function () {
    const b = FA.busy('建立範本相簿：匯入 40 張範本相片…');
    try {
      const ms = await FA.api('sample_media');
      const groups = [['畢業典禮', 'grad1', 0, 8], ['校園生活', 'simple4', 8, 26], ['活動與球賽', 'sport', 26, 40]];
      const shows = [];
      const media = {};
      ms.forEach((m) => (media[m.id] = m));
      for (const [name, style, a, z] of groups) {
        const sh = FA.newShow(name);
        sh.items = ms.slice(a, z).map((m) => ({ id: FA.uid(), type: 'photo', media: m.id, dur: 5, motion: { kind: 'auto' }, trans: { id: 'Fade', dur: 1 } }));
        if (!sh.items.length) continue;
        S.project = { name: '畢業紀念相簿（範本）', media };          // applyStyle 會用到名稱
        FA.applyStyle(sh, FA.STYLE_BY[style], true, true);
        if (sh.items[0].type === 'card') sh.items[0].texts[0].text = name;
        else sh.items.unshift({ id: FA.uid(), type: 'card', dur: 4, card: { bg: 'white' }, trans: { id: 'Directional', dur: 1 },
          texts: [{ id: FA.uid(), text: name, preset: 'magazine', size: 0.1, x: 0.5, y: 0.5, anim: 'right', animOut: 'none' }] });
        const tm = FA.timing(sh);
        sh.items.forEach((it, i) => {
          const m = media[it.media];
          if (it.type === 'photo' && m && m.caption) sh.titles.push({ id: FA.uid(), text: m.caption, preset: 'bar', size: 0.05, x: 0.5, y: 0.87, start: tm.starts[i] + 0.6, dur: FA.itemDur(it) - 1.4, anim: 'left', animOut: 'fade' });
        });
        shows.push(sh);
      }
      S.project = null;
      const r = await FA.api('project_save', { name: '畢業紀念相簿（範本）', aspect: '16:9', data: { v: 1, shows }, items: ms.length, thumb: ms[0].id });
      b.close();
      FA.toast('範本相簿已建立：三段影片、40 張相片（AI 產生的範例相片，不是真人）', 'ok');
      FA.openProject(r.id);
    } catch (e) { b.close(); S.project = null; FA.err(e); }
  };
  FA.newShow = (name) => ({ id: FA.uid(), name: name || '影片 1', items: [], titles: [], cliparts: [], effects: [], music: [], voice: [], bg: { type: 'blur' }, fit: 'fit' });
  $('#btn-sample').addEventListener('click', () => FA.makeSample());
  $('#btn-new').addEventListener('click', async () => {
    const n = await FA.prompt('新增相簿', '我的家庭相簿 ' + new Date().toLocaleDateString('zh-TW'), '相簿名稱');
    if (!n) return;
    try {
      const r = await FA.api('project_save', { name: n, aspect: '16:9', data: { v: 1, shows: [FA.newShow()] } });
      FA.openProject(r.id);
    } catch (e) { FA.err(e); }
  });

  // ================================================================ 開啟相簿
  FA.openProject = async function (id) {
    let p;
    try { p = await FA.get('project', { id }); } catch (e) { return FA.err(e); }
    p.data = p.data || {};
    p.data.shows = p.data.shows && p.data.shows.length ? p.data.shows : [FA.newShow()];
    for (const sh of p.data.shows) for (const k of ['items', 'titles', 'cliparts', 'effects', 'music', 'voice']) sh[k] = sh[k] || [];
    S.project = p;
    S.showIdx = 0; S.sel = null; S.undo = []; S.redo = []; S.dirty = false;
    FA.screen('editor');
    $$('.uname').forEach((e) => (e.textContent = S.user.name));
    $('#proj-name').value = p.name;
    $('#proj-name').readOnly = !p.editable;
    updateAspect();
    FA.setTab('organize');
    FA.changed('open');
    setSaveState(p.editable ? '' : '（唯讀：別人分享的相簿）');
  };
  FA.show = () => S.project && S.project.data.shows[S.showIdx];
  FA.aspect = () => (S.project && S.project.aspect) || '16:9';
  FA.ar = () => (FA.aspect() === '4:3' ? 4 / 3 : 16 / 9);
  FA.media = (id) => (S.project && S.project.media[id]) || null;

  // ================================================================ 修改、復原、儲存
  let lastKey = '', lastAt = 0;
  // FA.edit(fn, key)：修改前先存一份復原；key 相同、1.2 秒內的連續修改（拖拉、滑桿）只存一次
  FA.edit = function (fn, key) {
    if (!S.project || !S.project.editable) { FA.toast('這本相簿是唯讀的'); return false; }
    const now = Date.now();
    if (!key || key !== lastKey || now - lastAt > 1200) {
      S.undo.push(JSON.stringify(S.project.data));
      if (S.undo.length > 80) S.undo.shift();
      S.redo = [];
    }
    lastKey = key || ''; lastAt = now;
    fn(FA.show());
    FA.changed(key || 'edit');
    return true;
  };
  FA.changed = function (what) {
    if (S.project && what !== 'open') { S.dirty = true; setSaveState('尚未儲存…'); scheduleSave(); }
    $('#btn-undo').disabled = !S.undo.length;
    $('#btn-redo').disabled = !S.redo.length;
    FA.emit('change', what);
  };
  function undo() {
    if (!S.undo.length) return;
    S.redo.push(JSON.stringify(S.project.data));
    S.project.data = JSON.parse(S.undo.pop());
    S.showIdx = Math.min(S.showIdx, S.project.data.shows.length - 1);
    lastKey = '';
    FA.changed('undo');
  }
  function redo() {
    if (!S.redo.length) return;
    S.undo.push(JSON.stringify(S.project.data));
    S.project.data = JSON.parse(S.redo.pop());
    lastKey = '';
    FA.changed('undo');
  }
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  document.addEventListener('keydown', (e) => {
    if (!S.project || $('.dlg-wrap')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); FA.saveNow(true); }
    else if (e.key === ' ') { e.preventDefault(); FA.Player.toggle(); }
    else if (e.key === 'Delete') { FA.emit('delete-key'); }
  });
  let saveTimer = null;
  function setSaveState(t) { $('#save-state').textContent = t; }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => FA.saveNow(), 1500); }
  FA.saveNow = async function (manual) {
    clearTimeout(saveTimer);
    const p = S.project;
    if (!p || !p.editable || (!S.dirty && !manual)) return;
    let secs = 0, items = 0, thumb = null;
    for (const sh of p.data.shows) {
      secs += FA.timing(sh).total;
      items += sh.items.length;
      if (!thumb) { const f = sh.items.find((i) => i.type === 'photo'); if (f) thumb = f.media; }
    }
    try {
      setSaveState('儲存中…');
      await FA.api('project_save', { id: p.id, name: $('#proj-name').value.trim() || p.name, data: p.data, aspect: p.aspect, seconds: Math.round(secs * 100) / 100, items, thumb });
      S.dirty = false;
      setSaveState('已儲存 ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }));
      if (manual) FA.toast('已儲存', 'ok');
    } catch (e) { setSaveState('儲存失敗'); FA.err(e); }
  };
  $('#proj-name').addEventListener('change', () => { S.dirty = true; FA.saveNow(); });
  $('#btn-back').addEventListener('click', () => FA.gotoHome());
  window.addEventListener('beforeunload', () => { if (S.dirty) FA.saveNow(); });

  // 16:9 ↔ 4:3
  function updateAspect() { $('#btn-aspect').textContent = '畫面 ' + FA.aspect(); }
  $('#btn-aspect').addEventListener('click', () => {
    if (!S.project.editable) return;
    S.undo.push(JSON.stringify(S.project.data));
    S.project.aspect = FA.aspect() === '16:9' ? '4:3' : '16:9';
    updateAspect();
    FA.changed('aspect');
    FA.toast('已切換成 ' + S.project.aspect + ' 畫面');
  });

  // ================================================================ 分頁
  FA.setTab = function (tab) {
    S.tab = tab;
    $$('.step').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $$('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + tab));
    $('#editor').className = 'screen show tab-' + tab;
    FA.Player.mount($('.player-slot[data-slot="' + tab + '"]'));
    FA.emit('tab', tab);
  };
  $$('.step').forEach((b) => b.addEventListener('click', () => FA.setTab(b.dataset.tab)));

  // ================================================================ 選取
  FA.select = function (kind, id, opts) {
    S.sel = kind ? { kind, id } : null;
    FA.emit('select', S.sel);
    if (opts && opts.seek !== undefined) FA.Player.seek(opts.seek);
  };
  FA.selected = function () {
    const sh = FA.show();
    if (!S.sel || !sh) return null;
    const list = { item: sh.items, title: sh.titles, clip: sh.cliparts, effect: sh.effects, music: sh.music, voice: sh.voice }[S.sel.kind];
    return list ? list.find((x) => x.id === S.sel.id) || null : null;
  };
  FA.listOf = (kind) => { const sh = FA.show(); return { item: sh.items, title: sh.titles, clip: sh.cliparts, effect: sh.effects, music: sh.music, voice: sh.voice }[kind]; };

  // ================================================================ 匯入素材
  FA.importFiles = async function (opts) {
    opts = opts || {};
    await FA.nativeReady;
    let added = [];
    if (FA.native) {
      const paths = await FA.native.pick_files(opts.kind || 'media');
      if (!paths || !paths.length) return [];
      const b = FA.busy('匯入中…');
      try {
        for (let i = 0; i < paths.length; i++) {
          b.set('匯入中（' + (i + 1) + '／' + paths.length + '）…\n' + paths[i].split(/[\\/]/).pop() + (/\.(avi|wmv|mpg|mpeg|3gp|flv|mkv|mts|m2ts|vob|asf|dv)$/i.test(paths[i]) ? '\n（這種影片要先轉檔，請稍候）' : ''));
          const r = await FA.api('import_paths', { paths: [paths[i]], kind: opts.kind === 'audio' ? 'audio' : '' });
          added.push(...r.items);
          r.errors.forEach((e) => FA.toast(e, 'err'));
        }
      } finally { b.close(); }
    } else {
      const inp = opts.kind === 'audio' ? $('#audio-input') : $('#file-input');
      const files = await new Promise((res) => { inp.value = ''; inp.onchange = () => res(Array.from(inp.files || [])); inp.click(); });
      added = await FA.uploadFiles(files, opts.kind);
    }
    for (const m of added) S.project.media[m.id] = m;
    return added;
  };
  FA.uploadFiles = async function (files, kind) {
    const out = [];
    if (!files.length) return out;
    const b = FA.busy('上傳中…');
    try {
      for (let i = 0; i < files.length; i++) {
        b.set('匯入中（' + (i + 1) + '／' + files.length + '）…\n' + files[i].name);
        try { out.push(await FA.upload(files[i], kind === 'audio' ? 'audio' : '')); } catch (e) { FA.toast(files[i].name + '：' + e.message, 'err'); }
      }
    } finally { b.close(); }
    for (const m of out) S.project.media[m.id] = m;
    return out;
  };
  // 把素材變成影片裡的項目
  FA.itemFromMedia = function (m) {
    if (m.kind === 'video') return { id: FA.uid(), type: 'video', media: m.id, in: 0, dur: Math.max(0.5, Math.round(m.duration * 100) / 100 || 5), vol: 1, trans: { id: 'Fade', dur: 1 } };
    return { id: FA.uid(), type: 'photo', media: m.id, dur: +($('#all-dur').value || 5), motion: { kind: 'auto' }, trans: { id: 'Fade', dur: 1 } };
  };
})();
