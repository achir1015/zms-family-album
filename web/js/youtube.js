/* 直接上傳到 YouTube（電腦版）：系統管理員設定 OAuth 用戶端 → 使用者連結自己的 YouTube 帳號 → 選影片上傳。 */
(function () {
  const FA = window.FA;
  const { h } = FA;
  const S = FA.S;
  const Y = (FA.YT = {});
  const PRIV = [['private', '私人（只有自己看得到）'], ['unlisted', '不公開（知道網址的人才看得到）'], ['public', '公開']];

  // ------------------------------------------------------------ 系統管理員：設定 OAuth 用戶端
  Y.setup = async function () {
    let cur = {};
    try { cur = await FA.api('yt_client', {}); } catch (e) { return FA.err(e); }
    const id = h('input', { class: 'inp', placeholder: '例如 123456789-abc….apps.googleusercontent.com', value: cur.id || '' });
    const sec = h('input', { class: 'inp', type: 'password', placeholder: cur.configured ? '已設定（' + cur.secret + '），要更換才需要重新貼上' : 'GOCSPX-…' });
    const file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    const steps = h('ol', { style: { margin: '6px 0 10px', paddingLeft: '1.3em', lineHeight: 1.7 } },
      h('li', {}, '用要上傳影片的 Google 帳號登入 ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); open('https://console.cloud.google.com/projectcreate'); } }, 'Google Cloud 主控台'), '，建立一個專案（名稱例如「家庭相簿上傳」）。'),
      h('li', {}, '到「API 和服務 → 程式庫」搜尋 ', h('b', {}, 'YouTube Data API v3'), '，按「啟用」。'),
      h('li', {}, '到「Google Auth Platform（OAuth 同意畫面）」：使用者類型選「外部」，填應用程式名稱與您的 Email；在「目標對象 → 測試使用者」加入要上傳影片的 Google 帳號。'),
      h('li', {}, '到「用戶端」→「建立用戶端」：應用程式類型選 ', h('b', {}, '電腦版應用程式'), '，建立後按「下載 JSON」。'),
      h('li', {}, '回到這裡按「匯入 JSON 檔」選剛下載的檔案（或把用戶端 ID 與密鑰貼到下面），再按「儲存」。'));
    const body = h('div', {},
      h('p', { class: 'hint', style: { margin: 0 } }, '只要設定一次，之後每個使用者在上傳時連結自己的 YouTube 帳號即可。'), h('a', { href: '#', onclick: (e) => { e.preventDefault(); open('https://github.com/achir1015/zms-family-album/blob/main/YouTube%E4%B8%8A%E5%82%B3%E8%A8%AD%E5%AE%9A.md'); } }, '📖 詳細說明（限制與注意事項）'),
      steps,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => file.click() }, '📄 匯入 JSON 檔'), h('span', { class: 'hint' }, cur.configured ? '✅ 目前已設定' : '尚未設定')),
      h('label', { class: 'fld' }, '用戶端 ID（Client ID）', id),
      h('label', { class: 'fld' }, '用戶端密鑰（Client secret）', sec),
      h('p', { class: 'hint' }, '注意：Google 審核通過前，上傳的影片一律是「私人」，要到 YouTube Studio 自己改成公開；每天大約可以上傳 6 支影片。'), file);
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      try { const r = await FA.api('yt_client', { json: await f.text() }); id.value = r.id; sec.placeholder = '已設定（' + r.secret + '）'; sec.value = ''; FA.toast('已匯入 OAuth 用戶端', 'ok'); }
      catch (e) { FA.err(e); }
    };
    await FA.dialog({ title: '▶ YouTube 上傳設定', width: '640px', body, buttons: [
      cur.configured ? { label: '清除設定', danger: true, onClick: async () => { if (!(await FA.confirm('清除後所有人都不能直接上傳到 YouTube，確定嗎？', '清除', true))) return false; await FA.api('yt_client', { clear: true }); FA.toast('已清除'); return true; } } : null,
      { label: '取消', value: null },
      { label: '儲存', primary: true, onClick: async () => {
        if (!sec.value.trim()) { if (cur.configured && id.value.trim() === cur.id) return true; FA.toast('請貼上用戶端密鑰', 'err'); return false; }
        await FA.api('yt_client', { id: id.value.trim(), secret: sec.value.trim() }); FA.toast('已儲存 YouTube 上傳設定', 'ok'); return true;
      } }].filter(Boolean) });
  };
  function open(url) { FA.native ? FA.native.open_url(url) : window.open(url); }

  // ------------------------------------------------------------ 連結帳號
  async function link() {
    const r = await FA.api('yt_auth', {});
    let done = null, cancelled = false;
    const status = h('p', { class: 'hint' }, '等待您在瀏覽器完成登入…');
    const dlg = FA.dialog({ title: '連結 YouTube 帳號', width: '560px', esc: false, body: h('div', {},
      h('p', {}, '已在瀏覽器（Chrome／Edge）開啟 Google 登入頁。'),
      h('ol', { style: { paddingLeft: '1.3em', lineHeight: 1.7, margin: '4px 0' } },
        h('li', {}, '瀏覽器視窗可能被本程式蓋住，請看工作列（Mac 看 Dock）切換到瀏覽器。'),
        h('li', {}, '選擇要上傳影片的 Google 帳號。'),
        h('li', {}, '看到「Google 尚未驗證這個應用程式」時，按「繼續」。'),
        h('li', {}, '勾選允許上傳 YouTube 影片，按「繼續」。看到「連結成功」就可以回到這裡。')),
      h('p', { class: 'hint' }, '如果瀏覽器顯示「存取權被封鎖」或「403 access_denied」：請到 Google Cloud 的「目標對象 → 測試使用者」加入這個 Google 帳號後再試一次。'),
      status),
      buttons: [{ label: '取消', onClick: () => { cancelled = true; return true; } },
        { label: '📋 複製登入網址', onClick: () => { navigator.clipboard.writeText(r.url).then(() => FA.toast('已複製，請貼到瀏覽器的網址列', 'ok')); return false; } },
        { label: '重新開啟登入頁', primary: true, onClick: async () => { await FA.api('yt_auth', {}).then((x) => (r.url = x.url)).catch(FA.err); return false; } }] });
    for (let i = 0; i < 600 && !cancelled; i++) {
      await new Promise((res) => setTimeout(res, 1500));
      let st = null;
      try { st = await FA.get('yt_status'); } catch (e) { /* 再試 */ }
      if (st && st.linked) { done = st; break; }
    }
    if (!cancelled) document.querySelector('.dlg .x')?.click();
    await dlg;
    if (done) { FA.toast('已連結 YouTube 頻道：' + (done.channel || ''), 'ok'); return done; }
    throw new Error(cancelled ? '已取消連結' : '等太久了，請再按一次「連結 YouTube 帳號」');
  }

  // 說明欄預設內容：相簿名稱＋用到的內附音樂授權標示（CC BY 一定要標示）
  async function defaultDescription() {
    const lines = [];
    const credits = new Set();
    try {
      await FA.loadMusicLib();
      for (const sh of (S.project && S.project.data.shows) || []) for (const A of sh.music || []) { const c = FA.musicCredit(FA.media(A.media)); if (c) credits.add(c); }
    } catch (e) { /* 沒有相簿也沒關係 */ }
    if (credits.size) lines.push('背景音樂：', ...credits, '');
    lines.push('使用「資料助秘家庭相簿編輯」製作');
    return lines.join('\n');
  }

  // ------------------------------------------------------------ 上傳
  Y.upload = async function (v) {
    let st;
    try { st = await FA.get('yt_status'); } catch (e) { return FA.err(e); }
    if (!st.configured) {
      return FA.dialog({ title: '⬆ 上傳到 YouTube', body: h('p', {}, st.can_setup ? '還沒有設定 YouTube 上傳。只要設定一次（約 10 分鐘），之後就能一鍵上傳。' : '系統管理員還沒有設定 YouTube 上傳，請洽系統管理員（右上角選單 →「YouTube 上傳設定」）。'),
        buttons: st.can_setup ? [{ label: '取消', value: null }, { label: '開始設定', primary: true, onClick: () => { setTimeout(Y.setup, 50); return true; } }] : undefined });
    }
    if (!st.linked) {
      const go = await FA.dialog({ title: '⬆ 上傳到 YouTube', body: h('div', {}, h('p', {}, '第一次上傳要先連結您的 YouTube 帳號：按下面的按鈕會開啟瀏覽器登入 Google，選擇帳號後按「允許」。'),
        h('p', { class: 'hint' }, '如果看到「Google 尚未驗證這個應用程式」，請按「繼續」（這是您自己建立的上傳設定）。')),
        buttons: [{ label: '取消', value: null }, { label: '連結 YouTube 帳號', primary: true, value: true }] });
      if (!go) return;
      try { st = await link(); } catch (e) { return FA.err(e); }
    }
    const name = (v.path || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    const title = h('input', { class: 'inp', maxlength: 100, value: (S.project && S.project.name) || name });
    const desc = h('textarea', { class: 'inp', rows: 6, style: { width: '100%', resize: 'vertical' } }, await defaultDescription());
    const pv = FA.selectEl(...PRIV, S.ytPrivacy || 'private', (x) => (S.ytPrivacy = x));
    const kids = FA.selectEl(['no', '否，不是為兒童打造'], ['yes', '是，這是為兒童打造的內容'], 'no', () => 0);
    const tags = h('input', { class: 'inp', placeholder: '用逗號分開，例如：畢業,家庭,旅行' });
    const pl = FA.selectEl(['', '（不加入播放清單）'], '', () => 0);
    FA.get('yt_playlists').then((ls) => ls.forEach((x) => pl.append(h('option', { value: x.id }, x.title)))).catch(() => 0);
    const body = h('div', {},
      h('div', { class: 'row', style: { alignItems: 'center' } }, h('span', {}, '頻道：', h('b', {}, st.channel || '（已連結）')),
        h('button', { class: 'mini', style: { flex: 'none', marginLeft: 'auto' }, onclick: async () => { if (await FA.confirm('要取消連結這個 YouTube 帳號嗎？之後上傳需要重新登入。', '取消連結')) { await FA.api('yt_unlink', {}); FA.toast('已取消連結'); document.querySelector('.dlg .x')?.click(); } } }, '切換帳號')),
      h('p', { class: 'hint', style: { margin: '2px 0 6px' } }, '影片：' + (v.path || '')),
      h('label', { class: 'fld' }, '標題', title),
      h('label', { class: 'fld' }, '說明', desc),
      h('div', { class: 'row' }, h('label', { class: 'fld' }, '瀏覽權限', pv), h('label', { class: 'fld' }, '播放清單', pl)),
      h('label', { class: 'fld' }, '觀眾（YouTube 規定一定要選）', kids),
      h('label', { class: 'fld' }, '標籤', tags),
      h('p', { class: 'hint' }, 'Google 審核通過前，影片上傳後會先設為「私人」；要公開請到 YouTube Studio 修改。'));
    const ok = await FA.dialog({ title: '⬆ 上傳到 YouTube', width: '620px', body, buttons: [{ label: '取消', value: null }, { label: '開始上傳', primary: true, onClick: () => (title.value.trim() ? true : (FA.toast('請輸入標題', 'err'), false)) }] });
    if (!ok) return;
    let job;
    try {
      job = (await FA.api('yt_upload', { export_id: v.export_id, title: title.value.trim(), description: desc.value, privacy: pv.value, kids: kids.value === 'yes',
        playlist: pl.value || '', tags: tags.value.split(/[,，、]/).map((t) => t.trim()).filter(Boolean) })).job;
    } catch (e) { return FA.err(e); }
    progress(job);
  };

  function progress(job) {
    const bar = h('div', {}), msg = h('div', { class: 'hint', style: { padding: '6px 0' } }, '準備上傳…');
    let stop = false;
    const dlg = FA.dialog({ title: '⬆ 上傳到 YouTube', width: '520px', esc: false, body: h('div', {}, h('div', { class: 'progress' }, bar), msg),
      buttons: [{ label: '取消上傳', onClick: async () => { if (!(await FA.confirm('要取消上傳嗎？', '取消上傳', true))) return false; await FA.api('yt_cancel', { id: job }); stop = true; return true; } },
        { label: '在背景繼續', primary: true, onClick: () => { stop = true; watch(job, null); return true; } }] });
    watch(job, { bar, msg, isStopped: () => stop, close: () => document.querySelector('.dlg .x')?.click() });
    return dlg;
  }
  async function watch(job, ui) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      if (ui && ui.isStopped()) return;
      let j;
      try { j = await FA.get('yt_job', { id: job }); } catch (e) { if (ui) ui.msg.textContent = e.message; return; }
      if (ui) {
        ui.bar.style.width = j.pct + '%';
        ui.msg.textContent = j.state === 'uploading' ? '上傳中 ' + Math.floor(j.pct) + '%（' + FA.fmtSize(j.sent) + ' / ' + FA.fmtSize(j.size) + '）' + (j.eta != null ? '　大約還要 ' + FA.fmtTime(j.eta) : '') : j.state === 'start' ? '連線到 YouTube…' : '';
      }
      if (j.state === 'done' || j.state === 'error' || j.state === 'cancelled') {
        if (ui) ui.close();
        if (j.state === 'done') finished(j);
        else if (j.state === 'error') FA.dialog({ title: '上傳失敗', body: h('p', {}, j.error) });
        return;
      }
    }
  }
  function finished(j) {
    const priv = { private: '私人', unlisted: '不公開', public: '公開' }[j.privacy] || j.privacy;
    FA.dialog({ title: '🎉 已上傳到 YouTube', body: h('div', {}, h('p', {}, '影片網址：', h('b', { style: { userSelect: 'text' } }, j.url)), h('p', {}, '目前的瀏覽權限：' + priv),
      j.warn ? h('p', { class: 'hint' }, j.warn) : null,
      h('p', { class: 'hint' }, 'YouTube 需要幾分鐘處理影片，處理完成才能播放。' + (j.privacy === 'private' ? '要公開請按「開啟 YouTube Studio」修改瀏覽權限。' : ''))),
      buttons: [{ label: '📋 複製網址', onClick: () => { navigator.clipboard.writeText(j.url).then(() => FA.toast('已複製', 'ok')); return false; } },
        { label: '開啟 YouTube Studio', onClick: () => { open('https://studio.youtube.com/video/' + j.video_id + '/edit'); return false; } },
        { label: '▶ 觀看影片', primary: true, onClick: () => { open(j.url); return false; } }] });
  }
})();
