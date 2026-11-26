"""桌面視窗端到端測試（Windows WebView2／macOS WKWebView 都可用）：
用全新的暫存資料夾啟動，在真的視窗裡：建立管理員 → 建立範本相簿 → 檢查預覽畫面有畫出來 →
相片特效濾鏡 → 混音 → 輸出 6 秒 360p MP4 → 檢查麥克風與剪貼簿 API。結果寫到 stdout 與 <資料夾>/e2e.json。

用法：python tests/desktop_e2e.py   （macOS 要在登入的畫面工作階段執行，例如從終端機視窗）
需要環境變數 FA_MARIADB_BIN、FA_FFMPEG（開發模式）或在打包後的程式旁邊有 mariadb／ffmpeg。
"""
import json
import os
import sys
import tempfile
import threading
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
DATA = tempfile.mkdtemp(prefix="fa-e2e-")
os.environ["FA_DATA_DIR"] = DATA

JS_FLOW = r"""
window.__e2e = null;
(async () => {
  const R = { ua: navigator.userAgent, canFilter: FA.CAN_FILTER };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 240 && !(FA.S.state && FA.S.state.ready); i++) { await wait(500); try { FA.S.state = await FA.get('state'); } catch (e) {} }
  R.dbReady = !!(FA.S.state && FA.S.state.ready);
  const r = await FA.api('setup', { uid: 'e2e', name: 'E2E', pw: 'e2e-pass-123' });
  FA.setSession(r.session); FA.S.state = await FA.get('state'); FA.S.user = FA.S.state.user;
  await FA.gotoHome(true);
  await FA.makeSample(); await wait(2500);
  R.project = FA.S.project && FA.S.project.name;
  R.shows = FA.S.project.data.shows.map((s) => s.items.length);
  // 預覽：畫第 6 秒的畫面，看是不是有內容
  const sh = FA.S.project.data.shows[0];
  const eng = new FA.Engine(640, 360); eng.setShow(sh, FA.S.project.media); await eng.ensureAll(() => {});
  eng.draw(6, true);
  const d = eng.out.getContext('2d').getImageData(0, 0, 640, 360).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
  R.previewMean = Math.round(sum / (d.length / 4) / 3);
  // 舊照片特效：有沒有變成褐色（R > B）
  const it = sh.items.find((x) => x.type === 'photo'); const old = it.fx; it.fx = 'old';
  const tm = FA.timing(sh); const k = sh.items.indexOf(it);
  eng.setShow(sh, FA.S.project.media); await eng.ensureAll(() => {}); eng.draw(tm.starts[k] + 1.5, true);
  const e = eng.out.getContext('2d').getImageData(200, 100, 240, 160).data; let rr = 0, bb = 0; for (let i = 0; i < e.length; i += 4) { rr += e[i]; bb += e[i + 2]; }
  R.sepiaRB = +(rr / bb).toFixed(2); it.fx = old;
  // 內附音樂＋混音
  const lib = await FA.loadMusicLib(); R.musicLib = lib.length;
  const m = await FA.api('music_import', { file: lib[0].file }); FA.S.project.media[m.id] = m;
  sh.music = [{ id: 'm1', media: m.id, start: 0, vol: 0.8, fadeIn: 1, fadeOut: 2, fit: true }];
  // 輸出 6 秒 360p MP4
  const t0 = Date.now();
  const job = await FA.api('export_start', { preset: 'mp4', aspect: '16:9', name: 'e2e', folder: __FOLDER__, quality: 'normal', height: 360, seconds: 6, frames: 180 });
  const ex = new FA.Engine(job.width, job.height); ex.setShow(sh, FA.S.project.media); await ex.ensureAll(() => {});
  const wav = await FA.mixWav(sh, { ...ex.tm, total: 6 });
  await FA.raw('export_audio', wav, { job: job.job });
  const n = Math.round(6 * job.fps);
  for (let i = 0; i < n; i++) {
    ex.draw(i / job.fps);
    const blob = await new Promise((r) => ex.out.toBlob(r, 'image/jpeg', 0.9));
    await FA.raw('export_frame', await blob.arrayBuffer(), { job: job.job, i });
  }
  const fin = await FA.raw('export_finish', new TextEncoder().encode('{}'), { job: job.job });
  R.export = { path: fin.path, size: fin.size, sec: (Date.now() - t0) / 1000 };
  R.getUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  R.mediaRecorderMp4 = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/mp4');
  R.clipboard = !!(navigator.clipboard && navigator.clipboard.writeText);
  R.zoom = document.documentElement.style.zoom || '1';
  return JSON.stringify(R);
})().then((t) => (window.__e2e = t), (e) => (window.__e2e = JSON.stringify({ error: String(e && (e.stack || e.message) || e) })));
'started'
"""


def main():
    import webview
    from fa import export, server
    import main as app
    threading.Thread(target=server.start_database, daemon=True).start()
    srv = server.serve(0)
    url = "http://127.0.0.1:%d/?k=%s" % (srv.server_address[1], server.KEY)
    api = app.NativeApi()
    win = webview.create_window("E2E", url, js_api=api, width=1360, height=860)
    api._window = win
    out = {}

    def flow():
        time.sleep(4)
        try:
            win.evaluate_js(JS_FLOW.replace("__FOLDER__", json.dumps(DATA)))
            res = None
            for _ in range(900):                       # 最多 15 分鐘
                time.sleep(1)
                res = win.evaluate_js("window.__e2e")
                if res:
                    break
            out.update(json.loads(res) if isinstance(res, str) else (res or {"error": "timeout"}))
        except Exception as e:
            out["error"] = repr(e)
        try:
            from fa.album import probe
            if out.get("export"):
                out["probe"] = probe(out["export"]["path"])
        except Exception as e:
            out["probe_error"] = repr(e)
        txt = json.dumps(out, ensure_ascii=False, indent=1, default=str)
        print(txt, flush=True)
        open(os.path.join(DATA, "e2e.json"), "w", encoding="utf-8").write(txt)
        open(os.path.join(tempfile.gettempdir(), "fa-e2e-result.json"), "w", encoding="utf-8").write(txt)
        win.destroy()

    webview.start(flow, gui="edgechromium" if os.name == "nt" else None, private_mode=True)
    export.stop_all()
    srv.shutdown()
    server.stop_database()


if __name__ == "__main__":
    main()
