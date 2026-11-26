"""資料助秘家庭相簿編輯 — 程式進入點。

桌面版：python main.py（開一個視窗；關閉視窗時資料庫、轉檔一起停止）
網頁測試：python main.py --web 8700（只開本機伺服器，用瀏覽器開 http://127.0.0.1:8700/?k=dev）
"""
import os
import sys
import threading

if not os.environ.get("SSL_CERT_FILE"):
    try:
        import certifi
        os.environ["SSL_CERT_FILE"] = certifi.where()
    except Exception:
        pass


def _log_to_file():
    """打包版沒有主控台：錯誤寫到資料夾裡的 app.log。"""
    if getattr(sys, "frozen", False):
        from fa.settings import data_dir
        f = open(os.path.join(data_dir(), "app.log"), "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = f


class NativeApi:
    """給畫面呼叫的電腦功能（選檔、選資料夾、在檔案總管顯示、開網頁）。"""

    def __init__(self):
        self._window = None

    def pick_files(self, kind="media"):
        import webview
        types = {
            "media": ("相片與影片 (*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.webp;*.tif;*.tiff;*.heic;*.mp4;*.mov;*.m4v;*.avi;"
                      "*.wmv;*.mpg;*.mpeg;*.3gp;*.mkv;*.flv;*.mts;*.m2ts;*.webm)", "所有檔案 (*.*)"),
            "photo": ("相片 (*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.webp;*.tif;*.tiff;*.heic)", "所有檔案 (*.*)"),
            "audio": ("音樂 (*.mp3;*.wav;*.ogg;*.m4a;*.aac;*.wma;*.flac)", "所有檔案 (*.*)"),
            "backup": ("資料庫備份 (*.sql.gz;*.sql)", "所有檔案 (*.*)"),
        }.get(kind, ("所有檔案 (*.*)",))
        r = self._window.create_file_dialog(webview.FileDialog.OPEN, allow_multiple=kind != "backup",
                                           file_types=types)
        return list(r or [])

    def pick_folder(self, start=""):
        import webview
        r = self._window.create_file_dialog(webview.FileDialog.FOLDER, directory=start or "")
        return r[0] if r else ""

    def reveal(self, path):
        import subprocess
        if os.name == "nt":
            if os.path.isfile(path):
                subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
            else:
                os.startfile(path)
        else:
            subprocess.Popen(["open", "-R" if os.path.isfile(path) else "", path])
        return True

    def open_file(self, path):
        if os.name == "nt":
            os.startfile(path)
        else:
            import subprocess
            subprocess.Popen(["open", path])
        return True

    def open_url(self, url):
        import webbrowser
        if url.startswith(("https://", "http://")):
            webbrowser.open(url)
        return True

    def toggle_fullscreen(self):
        self._window.toggle_fullscreen()
        return True


def run_web(port):
    os.environ.setdefault("FA_KEY", "dev")
    from fa import server
    server.KEY = os.environ["FA_KEY"]
    threading.Thread(target=server.start_database, daemon=True).start()
    srv = server.serve(port)
    print("http://127.0.0.1:%d/?k=%s" % (srv.server_address[1], server.KEY), flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        server.stop_database()


def run_desktop():
    from fa import APP_NAME, single
    if not single.acquire():
        single.activate_existing()
        sys.exit(0)
    _log_to_file()
    if getattr(sys, "frozen", False) and os.name == "nt":
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ZMS.FamilyAlbum")
        except Exception:
            pass
    import webview
    from fa import export, server
    threading.Thread(target=server.start_database, daemon=True).start()
    srv = server.serve(0)
    url = "http://127.0.0.1:%d/?k=%s" % (srv.server_address[1], server.KEY)
    api = NativeApi()
    win = webview.create_window(APP_NAME, url, js_api=api, width=1360, height=860, min_size=(1000, 640),
                                background_color="#1d2530", text_select=False, maximized=True)
    api._window = win
    server.STATE["native"] = api
    server.STATE["quit"] = lambda: win.destroy()

    def on_closed():
        export.stop_all()
        srv.shutdown()
        server.stop_database()

    win.events.closed += on_closed
    from fa.settings import data_dir
    webview.start(gui="edgechromium", private_mode=False, storage_path=os.path.join(data_dir(), "webview"),
                  debug=bool(os.environ.get("FA_DEBUG")))
    server.stop_database()
    os._exit(0)


if __name__ == "__main__":
    if "--web" in sys.argv:
        i = sys.argv.index("--web")
        run_web(int(sys.argv[i + 1]) if len(sys.argv) > i + 1 else 8700)
    else:
        run_desktop()
