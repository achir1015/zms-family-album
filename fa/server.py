"""本機網頁伺服器：程式畫面（web/）、JSON API、素材播放（支援 Range，影片可以拖曳）。

只聽 127.0.0.1；每次開程式產生一組金鑰（KEY），API 與素材都要帶（網址 ?k= 或標頭 X-Key），
避免電腦上其他網頁偷連。登入後另有工作階段代號（X-Session／?s=）。
"""
import json
import mimetypes
import os
import secrets
import shutil
import tempfile
import threading
import traceback
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import APP_NAME, APP_VERSION, CREDIT, maintenance, presets
from .album import Album, BizError, kind_of
from .export import JOBS, Job, cancel_stale, unique_path
from .seed import FUNCS, ROLES
from .settings import resource_dir

KEY = os.environ.get("FA_KEY") or secrets.token_urlsafe(18)
WEB = os.path.join(resource_dir(), "web")
STATE = {"db": None, "st": None, "ready": False, "error": "", "native": None}
SESSIONS = {}
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("audio/mp4", ".m4a")
mimetypes.add_type("video/mp4", ".m4v")


class ApiError(Exception):
    def __init__(self, msg, code=400):
        super().__init__(msg)
        self.code = code


def _sess(h, q):
    sid = h.headers.get("X-Session") or q.get("s", "")
    a = SESSIONS.get(sid)
    if not a or not a.user:
        raise ApiError("請先登入", 401)
    return a


# ==================================================================== API
def api_state(h, q, body):
    a = SESSIONS.get(h.headers.get("X-Session") or "")
    out = dict(ready=STATE["ready"], error=STATE["error"], app=APP_NAME, version=APP_VERSION, credit=CREDIT,
               native=bool(STATE["native"]), funcs=[dict(id=f[0], name=f[1], desc=f[2]) for f in FUNCS],
               roles=ROLES)
    if STATE["ready"]:
        b = Album(STATE["db"])
        out["has_users"] = b.has_users()
        out["company"] = b.company().get("name", "")
    if a and a.user:
        out["user"] = dict(uid=a.uid, name=a.user["name"], is_admin=bool(a.user["is_admin"]),
                           perms={f[0]: a.level(f[0]) for f in FUNCS})
    return out


def _need_ready():
    if not STATE["ready"]:
        raise ApiError(STATE["error"] or "資料庫啟動中，請稍候…", 503)


def api_setup(h, q, body):
    _need_ready()
    a = Album(STATE["db"])
    a.create_first_admin(body.get("uid"), body.get("name"), body.get("pw"))
    return api_login(h, q, body)


def api_login(h, q, body):
    _need_ready()
    a = Album(STATE["db"])
    a.login(body.get("uid"), body.get("pw"))
    sid = secrets.token_urlsafe(18)
    SESSIONS[sid] = a
    st = STATE["st"]
    if st:
        st.last_user = a.uid
        st.save()
    return dict(session=sid, uid=a.uid, name=a.user["name"])


def api_logout(h, q, body):
    sid = h.headers.get("X-Session") or ""
    a = SESSIONS.pop(sid, None)
    if a:
        a.logout()
    return {}


def api_last_user(h, q, body):
    return dict(uid=(STATE["st"].last_user if STATE["st"] else ""))


def api_password(h, q, body):
    _sess(h, q).change_password(body.get("old"), body.get("new"))
    return {}


def api_users(h, q, body):
    a = _sess(h, q)
    a.need("SYS", 1)
    rows = a.users()
    for r in rows:
        r["last_login"] = r["last_login"].strftime("%Y-%m-%d %H:%M") if r["last_login"] else ""
    return rows


def api_user_save(h, q, body):
    a = _sess(h, q)
    a.save_user(body.get("uid"), body.get("name"), body.get("role", ""), body.get("is_admin"), body.get("active", 1),
                body.get("perms") or {}, pw=body.get("pw") or None, is_new=body.get("is_new"),
                dept=body.get("dept", ""))
    return {}


def api_user_delete(h, q, body):
    _sess(h, q).delete_user(body.get("uid"))
    return {}


def api_audit(h, q, body):
    a = _sess(h, q)
    a.need("SYS", 1)
    rows = a.audit(300)
    for r in rows:
        r["at"] = r["at"].strftime("%Y-%m-%d %H:%M:%S")
    return rows


def api_company(h, q, body):
    a = _sess(h, q)
    if body:
        a.save_company(body.get("name"), body.get("out_dir"))
    c = a.company()
    return dict(name=c.get("name", ""), out_dir=c.get("out_dir", ""), default_out=a.default_out_dir())


# ---------------------------------------------------------------- 素材
def api_media(h, q, body):
    return _sess(h, q).media_list(q.get("kind", ""))


def api_import_paths(h, q, body):
    a = _sess(h, q)
    out, errors = [], []
    for p in body.get("paths") or []:
        try:
            if not os.path.isfile(p):
                raise BizError("找不到檔案：" + p)
            out.append(a.import_file(p, kind=body.get("kind") or None))
        except BizError as e:
            errors.append(str(e))
    return dict(items=out, errors=errors)


def api_upload(h, q, body_bytes):
    """拖曳進來的檔案、錄好的旁白：原始位元組上傳。"""
    a = _sess(h, q)
    name = q.get("name") or "file.bin"
    kind = q.get("kind") or kind_of(name)
    d = tempfile.mkdtemp(prefix="zmsalbum-up-")
    try:
        p = os.path.join(d, os.path.basename(name))
        with open(p, "wb") as f:
            f.write(body_bytes)
        return a.import_file(p, name=name, kind=kind)
    finally:
        shutil.rmtree(d, ignore_errors=True)


def api_sample_media(h, q, body):
    """內建範本相片（AI 產生的台灣年輕人畢業與校園生活照，不是真人）匯入素材庫。"""
    a = _sess(h, q)
    d = os.path.join(WEB, "assets", "samples")
    try:
        caps = json.load(open(os.path.join(d, "samples.json"), encoding="utf-8"))
    except OSError:
        raise BizError("這個版本沒有附範本相片")
    out = []
    for c in caps:
        p = os.path.join(d, c["file"])
        if os.path.isfile(p):
            m = a.import_file(p, name="範本-" + c["caption"] + ".jpg")
            m["caption"] = c["caption"]
            out.append(m)
    if not out:
        raise BizError("找不到範本相片")
    return out


def api_music_import(h, q, body):
    """把內附背景音樂（Kevin MacLeod，CC BY 4.0）加進素材庫。body: {file: "m01.m4a"}"""
    a = _sess(h, q)
    d = os.path.join(WEB, "assets", "music")
    try:
        lib = {m["file"]: m for m in json.load(open(os.path.join(d, "music.json"), encoding="utf-8"))}
    except OSError:
        raise BizError("這個版本沒有附背景音樂")
    m = lib.get(str(body.get("file") or ""))
    if not m or not os.path.isfile(os.path.join(d, m["file"])):
        raise BizError("找不到這首音樂")
    r = a.import_file(os.path.join(d, m["file"]), name=m["name"] + ".m4a", kind="audio")
    r["credit"] = m["credit"]
    return r


def api_media_delete(h, q, body):
    _sess(h, q).media_delete(int(body.get("id")))
    return {}


def api_media_rename(h, q, body):
    _sess(h, q).media_rename(int(body.get("id")), body.get("name"))
    return {}


# ---------------------------------------------------------------- 相簿
def api_projects(h, q, body):
    return _sess(h, q).projects()


def api_project(h, q, body):
    return _sess(h, q).project_get(int(q.get("id") or body.get("id")))


def api_project_save(h, q, body):
    a = _sess(h, q)
    pid = a.project_save(body.get("id"), body.get("name"), body.get("data"), shared=body.get("shared"),
                         aspect=body.get("aspect"), seconds=body.get("seconds") or 0, items=body.get("items") or 0,
                         thumb=body.get("thumb"))
    return dict(id=pid)


def api_project_meta(h, q, body):
    _sess(h, q).project_meta(int(body["id"]), body.get("name"), body.get("shared"))
    return {}


def api_project_copy(h, q, body):
    return dict(id=_sess(h, q).project_copy(int(body["id"])))


def api_project_delete(h, q, body):
    _sess(h, q).project_delete(int(body["id"]))
    return {}


def api_pref(h, q, body):
    a = _sess(h, q)
    return a.save_pref(body) if body else a.pref()


# ---------------------------------------------------------------- 輸出
def api_presets(h, q, body):
    return presets.public()


def api_export_start(h, q, body):
    a = _sess(h, q)
    a.need("EXPORT", 1)
    cancel_stale()
    p = presets.BY_ID.get(body.get("preset"))
    if not p:
        raise BizError("不明的輸出格式")
    aspect = body.get("aspect") or "16:9"
    folder = body.get("folder") or a.default_out_dir()
    os.makedirs(folder, exist_ok=True)
    out = unique_path(folder, body.get("name"), p["ext"])
    w, h2 = presets.render_size(p, aspect)
    if body.get("height"):                            # 預覽用的小尺寸輸出
        h2 = int(body["height"])
        w = int(round(h2 * (16 / 9 if aspect == "16:9" else 4 / 3) / 2) * 2)
    fps = float(p["fps"])
    total = int(body.get("frames") or 0)
    job = Job(p["id"], aspect, body.get("quality") or "normal", fps, total, out, w, h2)
    job.export_id = a.export_begin(body.get("project_id"), p["id"], body.get("seconds") or 0)
    job.owner = a
    JOBS[job.id] = job
    return dict(job=job.id, width=w, height=h2, fps=fps, path=out)


def _job(h, q):
    a = _sess(h, q)
    j = JOBS.get(q.get("job", ""))
    if not j or getattr(j, "owner", None) is not a:
        raise ApiError("找不到輸出工作")
    return a, j


def api_export_audio(h, q, data):
    _, j = _job(h, q)
    j.set_audio(data)
    return {}


def api_export_frame(h, q, data):
    _, j = _job(h, q)
    try:
        j.frame(int(q.get("i", 0)), data)
    except RuntimeError as e:
        raise ApiError(str(e))
    return {}


def api_export_finish(h, q, body):
    a, j = _job(h, q)
    try:
        path = j.finish()
    except RuntimeError as e:
        a.export_end(j.export_id, "FAIL", message=str(e))
        JOBS.pop(j.id, None)
        raise ApiError("輸出失敗：" + str(e)[-400:])
    a.export_end(j.export_id, "DONE", path)
    JOBS.pop(j.id, None)
    return dict(path=path, size=os.path.getsize(path))


def api_export_cancel(h, q, body):
    a, j = _job(h, q)
    j.cancel()
    a.export_end(j.export_id, "STOP")
    JOBS.pop(j.id, None)
    return {}


def api_exports(h, q, body):
    return _sess(h, q).exports(int(q["pid"]) if q.get("pid") else None)


# ---------------------------------------------------------------- 系統
def api_update_check(h, q, body):
    import urllib.error
    try:
        info = maintenance.check_update()
    except urllib.error.HTTPError as e:
        if e.code == 404:                 # GitHub 上還沒有發佈頁或還沒有任何發佈版本
            return dict(latest=True, info=None, current=APP_VERSION,
                        note="目前還沒有發佈到網路上的新版本，您使用的就是最新版。")
        raise ApiError("無法連到更新伺服器：%s" % e)
    except Exception as e:
        raise ApiError("無法連到更新伺服器：%s" % e)
    return dict(latest=info is None, info=info, current=APP_VERSION)


def api_update_install(h, q, body):
    a = _sess(h, q)
    a.need("SYS")
    info = maintenance.check_update()
    if not info or not info.get("name"):
        raise ApiError("找不到可以自動安裝的新版本，請到發佈頁下載")
    path = maintenance.download(info["url"])
    maintenance.launch_installer(path)
    threading.Timer(1.5, lambda: STATE.get("quit") and STATE["quit"]()).start()
    return dict(ok=True)


def api_backup(h, q, body):
    a = _sess(h, q)
    a.need("SYS")
    folder = body.get("folder") or a.default_out_dir()
    import datetime
    path = os.path.join(folder, "家庭相簿資料庫備份-%s.sql.gz" % datetime.datetime.now().strftime("%Y%m%d-%H%M"))
    size = maintenance.backup(STATE["st"], path)
    a.log("backup", "", path)
    return dict(path=path, size=size)


def api_restore(h, q, body):
    a = _sess(h, q)
    a.need("SYS")
    p = body.get("path") or ""
    if not os.path.isfile(p):
        raise BizError("找不到備份檔")
    maintenance.restore(STATE["st"], p)
    a.log("restore", "", p)
    return {}


def api_shortcut(h, q, body):
    maintenance.create_desktop_shortcut()
    return {}


ROUTES = {n[4:]: f for n, f in globals().items() if n.startswith("api_") and callable(f)}
RAW = {"upload", "export_audio", "export_frame"}
GET_OK = {"state", "media", "projects", "project", "presets", "exports", "users", "audit", "last_user", "pref",
          "company", "update_check"}


# ==================================================================== HTTP
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ZMSAlbum"

    def log_message(self, *a):
        pass

    def _q(self):
        u = urllib.parse.urlsplit(self.path)
        return u.path, {k: v[-1] for k, v in urllib.parse.parse_qs(u.query).items()}

    def _send(self, code, data, ctype="application/json; charset=utf-8", extra=None):
        if not isinstance(data, (bytes, bytearray)):
            data = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _key_ok(self, q):
        return (self.headers.get("X-Key") or q.get("k")) == KEY

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path, q = self._q()
        if path.startswith("/api/"):
            return self._api(path[5:], q, None)
        if path.startswith("/media/"):
            return self._media(path, q)
        return self._static(path)

    def do_POST(self):
        path, q = self._q()
        if not path.startswith("/api/"):
            return self._send(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        return self._api(path[5:], q, raw, post=True)

    def _api(self, name, q, raw, post=False):
        if not self._key_ok(q):
            return self._send(403, {"error": "金鑰不正確"})
        f = ROUTES.get(name)
        if not f or (not post and name not in GET_OK):
            return self._send(404, {"error": "沒有這個功能：" + name})
        try:
            if name in RAW:
                body = raw or b""
            else:
                body = json.loads(raw.decode("utf-8")) if raw else {}
            res = f(self, q, body)
            if STATE["db"]:
                STATE["db"].close()                # 每個請求結束就歸還連線（執行緒會被重複使用）
            return self._send(200, {"ok": True, "data": res})
        except ApiError as e:
            return self._send(e.code, {"ok": False, "error": str(e)})
        except BizError as e:
            return self._send(400, {"ok": False, "error": str(e)})
        except Exception as e:
            traceback.print_exc()
            return self._send(500, {"ok": False, "error": "程式錯誤：%s" % e})

    def _media(self, path, q):
        if not self._key_ok(q):
            return self._send(403, {"error": "金鑰不正確"})
        try:
            a = _sess(self, q)
            mid = int(path.rsplit("/", 1)[-1].split(".")[0])
            fp = a.media_file(mid)
        except Exception:
            fp = None
        if not fp or not os.path.isfile(fp):
            return self._send(404, {"error": "找不到素材"})
        self._file(fp, cache=True)

    def _static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        fp = os.path.normpath(os.path.join(WEB, urllib.parse.unquote(path).lstrip("/")))
        if not fp.startswith(os.path.normpath(WEB)) or not os.path.isfile(fp):
            return self._send(404, b"not found", "text/plain")
        self._file(fp, cache=False)

    def _file(self, fp, cache):
        size = os.path.getsize(fp)
        ctype = mimetypes.guess_type(fp)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype == "application/javascript":
            ctype += "; charset=utf-8"
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        code = 200
        if rng and rng.startswith("bytes="):
            a, _, b = rng[6:].split(",")[0].partition("-")
            try:
                if a:
                    start = int(a)
                    end = int(b) if b else size - 1
                else:
                    start = max(0, size - int(b))
                end = min(end, size - 1)
                code = 206
            except ValueError:
                pass
            if start > end:
                self.send_response(416)
                self.send_header("Content-Range", "bytes */%d" % size)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
        length = end - start + 1
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "private, max-age=86400" if cache else "no-cache")
        if code == 206:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.end_headers()
        if self.command == "HEAD":
            return
        try:
            with open(fp, "rb") as f:
                f.seek(start)
                left = length
                while left > 0:
                    chunk = f.read(min(256 * 1024, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False


def serve(port=0):
    srv = Server(("127.0.0.1", port), Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


def start_database(st=None):
    """啟動內建資料庫並建表（在背景執行緒呼叫）。"""
    from .database import DB
    from .dbserver import LocalDatabaseServer
    from .settings import Settings
    try:
        st = st or Settings.load()
        STATE["st"] = st
        srv = None
        if st.mode == "embedded":
            srv = LocalDatabaseServer(st)
            srv.start()
            st.save()
        db = DB(st)
        db.prepare()
        db.close()
        STATE["db"], STATE["dbserver"], STATE["ready"] = db, srv, True
    except Exception as e:
        traceback.print_exc()
        STATE["error"] = "資料庫啟動失敗：%s" % e


def stop_database():
    srv = STATE.get("dbserver")
    if srv:
        srv.stop()
