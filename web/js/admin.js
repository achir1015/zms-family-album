/* 系統管理：使用者與權限、家庭／公司設定、操作紀錄、備份還原、版本更新、桌面捷徑、關於。 */
(function () {
  const FA = window.FA;
  const { h } = FA;
  const LV = ['無', '查詢', '維護'];

  async function users() {
    let rows;
    try { rows = await FA.get('users'); } catch (e) { return FA.err(e); }
    const st = FA.S.state;
    const tbody = h('tbody');
    for (const u of rows) {
      tbody.append(h('tr', {}, h('td', {}, u.uid), h('td', {}, u.name), h('td', {}, u.role), h('td', {}, u.is_admin ? '✔' : ''), h('td', {}, u.active ? '啟用' : '停用'), h('td', {}, u.last_login || ''),
        h('td', {}, h('button', { class: 'mini', onclick: () => edit(u).then((ok) => ok && reopen()) }, '修改'), ' ',
          h('button', { class: 'mini', onclick: async () => { if (await FA.confirm('刪除帳號 ' + u.uid + '？', '刪除', true)) { await FA.api('user_delete', { uid: u.uid }).catch(FA.err); reopen(); } } }, '刪除'))));
    }
    let closeFn;
    const reopen = () => { closeFn && closeFn(null); users(); };
    FA.dialog({ title: '使用者與權限', width: '820px', body: h('div', {},
      h('p', { class: 'hint' }, '權限：相簿編輯（1 看、2 編輯）、輸出影片、共用相簿（1 看別人分享的、2 可修改）、系統管理。角色只是快速範本，可以再個別調整。'),
      h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['帳號', '姓名', '角色', '管理員', '狀態', '最近登入', ''].map((t) => h('th', {}, t)))), tbody)),
    buttons: [{ label: '＋ 新增使用者', onClick: async () => { if (await edit(null)) reopen(); return false; } }, { label: '關閉', primary: true, value: true }],
    onOpen: (box, close) => (closeFn = close) });
    void st;
  }
  async function edit(u) {
    const st = FA.S.state;
    const isNew = !u;
    u = u || { uid: '', name: '', role: '編輯者', is_admin: 0, active: 1, perms: Object.assign({}, st.roles['編輯者']), dept: '' };
    const uid = h('input', { class: 'inp', value: u.uid, disabled: !isNew }), name = h('input', { class: 'inp', value: u.name }), dept = h('input', { class: 'inp', value: u.dept || '', placeholder: '例如：爸爸、媽媽、行政部' });
    const pw = h('input', { class: 'inp', type: 'password', placeholder: isNew ? '至少 6 個字' : '不改請留空白' });
    const admin = h('input', { type: 'checkbox', checked: !!u.is_admin }), active = h('input', { type: 'checkbox', checked: !!u.active });
    const perms = Object.assign({}, u.perms);
    const ptab = h('table', { class: 'grid' });
    const drawPerms = () => {
      ptab.innerHTML = '';
      for (const f of st.funcs) {
        ptab.append(h('tr', {}, h('td', {}, h('b', {}, f.name), h('div', { class: 'hint', style: { padding: 0 } }, f.desc)),
          h('td', {}, FA.selectEl(...LV.map((t, i) => [String(i), t]), String(perms[f.id] || 0), (v) => (perms[f.id] = +v)))));
      }
    };
    const role = FA.selectEl(...Object.keys(st.roles).map((r) => [r, r]), u.role || '編輯者', (v) => { Object.assign(perms, st.roles[v]); admin.checked = v === '系統管理員'; drawPerms(); });
    drawPerms();
    return FA.dialog({ title: isNew ? '新增使用者' : '修改使用者 ' + u.uid, width: '560px', body: h('div', {},
      h('div', { class: 'row' }, h('label', { class: 'fld' }, '帳號', uid), h('label', { class: 'fld' }, '姓名', name)),
      h('div', { class: 'row' }, h('label', { class: 'fld' }, '關係／部門', dept), h('label', { class: 'fld' }, '密碼', pw)),
      h('div', { class: 'row' }, h('label', { class: 'fld' }, '角色範本', role), h('label', { class: 'inline' }, admin, '系統管理員'), h('label', { class: 'inline' }, active, '啟用')),
      ptab),
    buttons: [{ label: '取消', value: false }, { label: '儲存', primary: true, onClick: async () => {
      await FA.api('user_save', { uid: uid.value.trim(), name: name.value.trim(), role: role.value, dept: dept.value.trim(), is_admin: admin.checked, active: active.checked, perms, pw: pw.value, is_new: isNew });
      FA.toast('已儲存', 'ok');
      return true;
    } }] });
  }

  async function company() {
    let c;
    try { c = await FA.get('company'); } catch (e) { return FA.err(e); }
    const name = h('input', { class: 'inp', value: c.name || '' });
    const out = h('input', { class: 'inp', value: c.out_dir || '', placeholder: c.default_out });
    await FA.nativeReady;
    FA.dialog({ title: '家庭／公司設定', width: '520px', body: h('div', {},
      h('label', { class: 'fld' }, '家庭或公司名稱（片尾會自動署名）', name),
      h('label', { class: 'fld' }, '預設輸出資料夾（空白＝「影片」資料夾裡的「家庭相簿」）', h('div', { class: 'row' }, out, FA.native ? h('span', { style: { flex: 'none' } }, h('button', { class: 'btn', onclick: async () => { const f = await FA.native.pick_folder(out.value); if (f) out.value = f; } }, '選擇…')) : null))),
    buttons: [{ label: '取消', value: false }, { label: '儲存', primary: true, onClick: async () => { await FA.api('company', { name: name.value, out_dir: out.value }); FA.S.state.company = name.value; FA.toast('已儲存', 'ok'); return true; } }] });
  }

  async function audit() {
    let rows;
    try { rows = await FA.get('audit'); } catch (e) { return FA.err(e); }
    const NAMES = { login: '登入', logout: '登出', login_fail: '登入失敗', user_save: '修改使用者', user_delete: '刪除使用者', password: '變更密碼', project_new: '新增相簿', project_del: '刪除相簿', media_add: '匯入素材', media_del: '刪除素材', export: '輸出影片', backup: '備份', restore: '還原', company: '修改設定' };
    FA.dialog({ title: '操作紀錄（最近 300 筆）', width: '820px', body: h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['時間', '帳號', '動作', '對象', '內容'].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.at), h('td', {}, r.uid), h('td', {}, NAMES[r.action] || r.action), h('td', {}, r.target), h('td', { style: { wordBreak: 'break-all', maxWidth: '300px' } }, (r.detail || '').slice(0, 160)))))) });
  }

  async function backup() {
    await FA.nativeReady;
    FA.dialog({ title: '備份與還原', width: '520px', body: h('div', {},
      h('p', {}, '備份會把資料庫（使用者、相簿內容、設定）存成一個 .sql.gz 檔。相片與影片素材在資料夾「%LOCALAPPDATA%\\ZMSFamilyAlbum\\media」，請一併用隨身碟或雲端硬碟備份。'),
      h('p', { class: 'hint' }, '還原會把目前的資料庫換成備份檔的內容，請小心使用。')),
    buttons: [
      { label: '還原…', danger: true, onClick: async () => {
        if (!FA.native) return FA.toast('網頁版不能還原');
        const [p] = await FA.native.pick_files('backup');
        if (!p) return false;
        if (!(await FA.confirm('確定要用「' + p + '」還原？目前的資料會被覆蓋。', '還原', true))) return false;
        const b = FA.busy('還原中…');
        try { await FA.api('restore', { path: p }); FA.toast('還原完成，請重新登入', 'ok'); setTimeout(() => location.reload(), 1500); } finally { b.close(); }
        return true;
      } },
      { label: '立即備份', primary: true, onClick: async () => {
        let folder = '';
        if (FA.native) folder = await FA.native.pick_folder('');
        if (FA.native && !folder) return false;
        const b = FA.busy('備份中…');
        try { const r = await FA.api('backup', { folder }); FA.toast('已備份到 ' + r.path + '（' + FA.fmtSize(r.size) + '）', 'ok'); if (FA.native) FA.native.reveal(r.path); } finally { b.close(); }
        return true;
      } }] });
  }

  async function update() {
    const b = FA.busy('檢查新版本…');
    let r;
    try { r = await FA.get('update_check'); } catch (e) { b.close(); return FA.err(e); }
    b.close();
    if (r.latest) return FA.dialog({ title: '版本更新', body: h('p', {}, r.note ? r.note + '（版本 ' + r.current + '）' : '目前已經是最新版（' + r.current + '）。') });
    const info = r.info;
    FA.dialog({ title: '有新版本 ' + info.version, width: '560px', body: h('div', {}, h('p', {}, '目前版本 ' + r.current + '，最新版本 ' + info.version + (info.size ? '（' + FA.fmtSize(info.size) + '）' : '') + '。'),
      h('pre', { style: { whiteSpace: 'pre-wrap', maxHeight: '240px', overflow: 'auto', background: '#151b23', padding: '8px', borderRadius: '6px' } }, info.notes || '')),
    buttons: [{ label: '前往發佈頁', onClick: () => { FA.native ? FA.native.open_url(info.page) : window.open(info.page); return false; } },
      { label: '稍後', value: false },
      FA.can('SYS', 2) && info.name ? { label: '下載並安裝', primary: true, onClick: async () => {
        await FA.saveNow();
        const bb = FA.busy('下載新版中，完成後程式會自動關閉並安裝新版…');
        try { await FA.api('update_install'); } catch (e) { bb.close(); throw e; }
        return true;
      } } : null].filter(Boolean) });
  }

  async function shortcut() {
    try { await FA.api('shortcut'); FA.toast('已在桌面建立捷徑', 'ok'); } catch (e) { FA.err(e); }
  }
  function about() {
    const st = FA.S.state;
    FA.dialog({ title: '關於', body: h('div', { style: { textAlign: 'center' } }, h('img', { src: 'assets/icon.png', style: { width: '96px', borderRadius: '20px' } }),
      h('h2', {}, st.app), h('p', {}, '版本 ' + st.version), h('p', {}, st.credit),
      h('p', { class: 'hint' }, '轉場特效：gl-transitions（MIT）・剪貼畫：Microsoft Fluent Emoji（MIT）・影音轉檔：FFmpeg（GPL）・資料庫：MariaDB（GPL）・字型：思源黑體（OFL）'),
      h('p', { class: 'hint' }, '內附背景音樂：Kevin MacLeod（incompetech.com），Licensed under Creative Commons: By Attribution 4.0（creativecommons.org/licenses/by/4.0/）・範本相片：AI 產生，不是真人')) });
  }
  FA.Admin = { users, company, audit, backup, update, shortcut, about };
})();
