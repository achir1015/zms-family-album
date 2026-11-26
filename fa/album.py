"""相簿服務層：相簿專案、素材庫、輸出紀錄、個人偏好。

規則都在這裡檢查（畫面只負責顯示），日後手機版透過 API 也共用同一套。
"""
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess

from .core import Base, BizError
from .settings import data_dir, program_dir

NO_WINDOW = 0x08000000 if os.name == "nt" else 0

PHOTO_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tif", ".tiff", ".jfif", ".heic", ".heif"}
VIDEO_EXT = {".mp4", ".m4v", ".mov", ".webm", ".avi", ".wmv", ".mpg", ".mpeg", ".3gp", ".flv", ".mkv", ".mts",
             ".m2ts", ".ts", ".vob", ".asf", ".dv"}
AUDIO_EXT = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".wma", ".flac", ".opus", ".weba"}
WEB_PHOTO = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".jfif"}
WEB_VIDEO = {".mp4", ".m4v", ".webm", ".mov"}
WEB_AUDIO = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus", ".weba"}


def media_root():
    d = os.path.join(data_dir(), "media")
    os.makedirs(d, exist_ok=True)
    return d


def ffmpeg_exe():
    exe = "ffmpeg.exe" if os.name == "nt" else "ffmpeg"
    for c in (os.environ.get("FA_FFMPEG", ""), os.path.join(program_dir(), "ffmpeg", exe),
              os.path.normpath(os.path.join(program_dir(), "..", "Resources", "ffmpeg", exe)),
              os.path.join(program_dir(), "packaging", "ffmpeg", exe)):
        if c and os.path.isfile(c):
            return c
    p = shutil.which("ffmpeg")
    if p:
        return p
    raise BizError("找不到影音轉檔程式 FFmpeg，請重新安裝本系統")


def kind_of(name):
    ext = os.path.splitext(name)[1].lower()
    if ext in PHOTO_EXT:
        return "photo"
    if ext in VIDEO_EXT:
        return "video"
    if ext in AUDIO_EXT:
        return "audio"
    return ""


def _sha1_file(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def probe(path):
    """用 ffmpeg -i 讀影片／音訊資訊（寬高、長度、編碼）。"""
    r = subprocess.run([ffmpeg_exe(), "-hide_banner", "-i", path], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
    info = {"duration": 0.0, "width": 0, "height": 0, "vcodec": "", "acodec": "", "rotate": 0}
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    if m:
        info["duration"] = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    m = re.search(r"Stream #\S+.*Video: (\w+)[^\n]*?, (\d{2,5})x(\d{2,5})", r.stderr)
    if m:
        info["vcodec"], info["width"], info["height"] = m.group(1), int(m.group(2)), int(m.group(3))
    m = re.search(r"Stream #\S+.*Audio: (\w+)", r.stderr)
    if m:
        info["acodec"] = m.group(1)
    m = re.search(r"rotation of (-?[\d.]+) degrees|rotate\s*:\s*(-?\d+)", r.stderr)
    if m:
        info["rotate"] = int(float(m.group(1) or m.group(2)))
    return info


def run_ffmpeg(args):
    r = subprocess.run([ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y"] + args, capture_output=True,
                       text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
    if r.returncode != 0:
        raise BizError("轉檔失敗：" + (r.stderr or "")[-600:])


class Album(Base):
    # ================================================================ 素材庫
    def import_file(self, src_path, name=None, kind=None):
        """把檔案放進素材庫（同一個檔案只存一份），必要時轉成程式內可以播放的格式。回傳素材資料。"""
        self.need("EDIT")
        name = name or os.path.basename(src_path)
        kind = kind or kind_of(name)
        if not kind:
            raise BizError("不支援的檔案類型：" + name)
        sha = _sha1_file(src_path)
        old = self.db.row("SELECT * FROM fa_media WHERE sha1=%s AND kind=%s ORDER BY id LIMIT 1", (sha, kind))
        if old and os.path.isfile(self.media_path(old)):
            mine = self.db.row("SELECT * FROM fa_media WHERE sha1=%s AND kind=%s AND owner=%s LIMIT 1",
                               (sha, kind, self.uid))
            if mine:
                return self._media_row(mine)
            # 別人匯入過同一個檔案：共用實體檔、另建一筆
            mid = self._insert_media(kind, name, old["path"], sha, old["size"], old["width"], old["height"],
                                     old["duration"], old["taken_at"])
            return self.media_get(mid)
        ext = os.path.splitext(name)[1].lower()
        sub = sha[:2]
        os.makedirs(os.path.join(media_root(), sub), exist_ok=True)
        w = h = 0
        dur = 0.0
        taken = None
        try:
            taken = datetime.datetime.fromtimestamp(os.path.getmtime(src_path)).replace(microsecond=0)
        except Exception:
            pass
        if kind == "photo":
            rel, w, h, taken2 = self._store_photo(src_path, sha, ext, sub)
            taken = taken2 or taken
        elif kind == "video":
            info = probe(src_path)
            playable = ext in WEB_VIDEO and info["vcodec"] in ("h264", "vp8", "vp9", "av1") and \
                info["acodec"] in ("", "aac", "mp3", "opus", "vorbis")
            if playable:
                rel = sub + "/" + sha + ext
                shutil.copyfile(src_path, os.path.join(media_root(), rel))
            else:
                rel = sub + "/" + sha + ".mp4"
                run_ffmpeg(["-i", src_path, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                            os.path.join(media_root(), rel)])
                info = probe(os.path.join(media_root(), rel))
            w, h, dur = info["width"], info["height"], info["duration"]
            if abs(info.get("rotate", 0)) in (90, 270):
                w, h = h, w
        else:
            if ext in WEB_AUDIO:
                rel = sub + "/" + sha + ext
                shutil.copyfile(src_path, os.path.join(media_root(), rel))
            else:
                rel = sub + "/" + sha + ".m4a"
                run_ffmpeg(["-i", src_path, "-vn", "-c:a", "aac", "-b:a", "192k", os.path.join(media_root(), rel)])
            dur = probe(os.path.join(media_root(), rel))["duration"]
        size = os.path.getsize(os.path.join(media_root(), rel))
        mid = self._insert_media(kind, name, rel, sha, size, w, h, dur, taken)
        self.log("media_add", mid, name)
        return self.media_get(mid)

    def _store_photo(self, src, sha, ext, sub):
        from PIL import Image, ImageOps
        taken = None
        try:
            im = Image.open(src)
        except Exception:
            if ext in (".heic", ".heif"):
                raise BizError("無法讀取 HEIC 相片，請在手機「設定 → 相機 → 格式」改成「最相容」，或另存成 JPG 再匯入")
            raise BizError("無法讀取相片：" + os.path.basename(src))
        try:
            exif = im.getexif()
            dt = exif.get_ifd(0x8769).get(36867) or exif.get(306)
            if dt:
                taken = datetime.datetime.strptime(str(dt)[:19], "%Y:%m:%d %H:%M:%S")
        except Exception:
            pass
        orient = 1
        try:
            orient = im.getexif().get(274, 1)
        except Exception:
            pass
        big = max(im.size) > 4096
        if ext in WEB_PHOTO and orient in (0, 1) and not big:
            rel = sub + "/" + sha + ext
            shutil.copyfile(src, os.path.join(media_root(), rel))
            w, h = im.size
        else:
            # 轉正（相機直拍）、縮到 4096 以內、非網頁格式（TIFF／HEIC）轉成 JPG
            im = ImageOps.exif_transpose(im)
            if big:
                im.thumbnail((4096, 4096), Image.LANCZOS)
            if im.mode in ("RGBA", "LA", "P") and ext in (".png", ".gif", ".webp", ".tif", ".tiff"):
                rel = sub + "/" + sha + ".png"
                im.convert("RGBA").save(os.path.join(media_root(), rel))
            else:
                rel = sub + "/" + sha + ".jpg"
                im.convert("RGB").save(os.path.join(media_root(), rel), quality=93)
            w, h = im.size
        return rel, w, h, taken

    def _insert_media(self, kind, name, rel, sha, size, w, h, dur, taken):
        return self.db.exec("INSERT INTO fa_media (owner, kind, name, path, sha1, size, width, height, duration, "
                            "taken_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                            (self.uid, kind, name[:200], rel.replace("\\", "/"), sha, size, w, h, dur, taken))

    @staticmethod
    def _media_row(r):
        r = dict(r)
        r["duration"] = float(r.get("duration") or 0)
        for k in ("taken_at", "created_at"):
            if r.get(k):
                r[k] = r[k].strftime("%Y-%m-%d %H:%M:%S")
        r.pop("sha1", None)
        r.pop("path", None)
        return r

    def media_get(self, mid):
        r = self.db.row("SELECT * FROM fa_media WHERE id=%s", (mid,))
        if not r:
            raise BizError("找不到素材")
        return self._media_row(r)

    def media_list(self, kind=""):
        self.need("EDIT", 1)
        sql = "SELECT * FROM fa_media WHERE owner=%s" + (" AND kind=%s" if kind else "") + " ORDER BY id DESC"
        return [self._media_row(r) for r in self.db.rows(sql, (self.uid, kind) if kind else (self.uid,))]

    @staticmethod
    def media_path(r):
        return os.path.join(media_root(), r["path"].replace("/", os.sep))

    def media_file(self, mid):
        """播放用：回傳實體檔案路徑（自己的素材，或有「共用相簿」權限時別人的素材）。"""
        r = self.db.row("SELECT * FROM fa_media WHERE id=%s", (mid,))
        if not r:
            return None
        if r["owner"] != self.uid and not self.can("SHARE", 1):
            return None
        return self.media_path(r)

    def media_rename(self, mid, name):
        self.need("EDIT")
        self.db.exec("UPDATE fa_media SET name=%s WHERE id=%s AND owner=%s", ((name or "").strip()[:200], mid, self.uid))

    def media_delete(self, mid):
        self.need("EDIT")
        r = self.db.row("SELECT * FROM fa_media WHERE id=%s", (mid,))
        if not r:
            return
        if r["owner"] != self.uid and not self.user["is_admin"]:
            raise BizError("只能刪除自己匯入的素材")
        self.db.exec("DELETE FROM fa_media WHERE id=%s", (mid,))
        if not self.db.value("SELECT COUNT(*) FROM fa_media WHERE path=%s", (r["path"],)):
            try:
                os.remove(self.media_path(r))
            except OSError:
                pass
        self.log("media_del", mid, r["name"])

    # ================================================================ 相簿專案
    def projects(self):
        if not self.can("EDIT", 1) and not self.can("SHARE", 1):
            raise BizError("您沒有使用相簿的權限")
        rows = self.db.rows("SELECT p.id, p.name, p.owner, u.name AS owner_name, p.shared, p.aspect, p.seconds, "
                            "p.items, p.thumb, p.updated_at FROM fa_project p LEFT JOIN sys_user u ON u.uid=p.owner "
                            "WHERE p.owner=%s OR (p.shared=1 AND %s=1) ORDER BY p.updated_at DESC",
                            (self.uid, 1 if self.can("SHARE", 1) else 0))
        for r in rows:
            r["seconds"] = float(r["seconds"])
            r["updated_at"] = r["updated_at"].strftime("%Y-%m-%d %H:%M")
            r["mine"] = r["owner"] == self.uid
        return rows

    def project_get(self, pid):
        r = self.db.row("SELECT * FROM fa_project WHERE id=%s", (pid,))
        if not r:
            raise BizError("找不到這本相簿")
        if r["owner"] != self.uid and not (r["shared"] and self.can("SHARE", 1)):
            raise BizError("這本相簿不是您的，也沒有分享")
        data = json.loads(r["data"] or "{}")
        ids = set()

        def walk(o):
            if isinstance(o, dict):
                for k, v in o.items():
                    if k == "media" and isinstance(v, int):
                        ids.add(v)
                    else:
                        walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(data)
        media = {}
        if ids:
            for m in self.db.rows("SELECT * FROM fa_media WHERE id IN (%s)" % ",".join("%s" for _ in ids),
                                  tuple(ids)):
                media[m["id"]] = self._media_row(m)
        mine = r["owner"] == self.uid
        return dict(id=r["id"], name=r["name"], owner=r["owner"], shared=r["shared"], aspect=r["aspect"], data=data,
                    media=media, mine=mine,
                    editable=bool((mine and self.can("EDIT", 2)) or (r["shared"] and self.can("SHARE", 2))))

    def project_save(self, pid, name, data, shared=None, aspect=None, seconds=0, items=0, thumb=None):
        self.need("EDIT")
        name = (name or "").strip()[:100] or "未命名相簿"
        js = json.dumps(data or {}, ensure_ascii=False)
        if pid:
            r = self.db.row("SELECT owner, shared FROM fa_project WHERE id=%s", (pid,))
            if not r:
                raise BizError("找不到這本相簿")
            if r["owner"] != self.uid and not (r["shared"] and self.can("SHARE", 2)):
                raise BizError("只能修改自己的相簿")
            self.db.exec("UPDATE fa_project SET name=%s, data=%s, aspect=COALESCE(%s, aspect), "
                         "shared=COALESCE(%s, shared), seconds=%s, items=%s, thumb=%s WHERE id=%s",
                         (name, js, aspect, None if shared is None else int(bool(shared)), seconds, items, thumb, pid))
        else:
            pid = self.db.exec("INSERT INTO fa_project (name, owner, shared, aspect, data, seconds, items, thumb) "
                               "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                               (name, self.uid, int(bool(shared)), aspect or "16:9", js, seconds, items, thumb))
            self.log("project_new", pid, name)
        return pid

    def project_meta(self, pid, name=None, shared=None):
        self.need("EDIT")
        r = self.db.row("SELECT owner FROM fa_project WHERE id=%s", (pid,))
        if not r or (r["owner"] != self.uid and not self.user["is_admin"]):
            raise BizError("只能修改自己的相簿")
        if name is not None:
            self.db.exec("UPDATE fa_project SET name=%s WHERE id=%s", ((name or "").strip()[:100] or "未命名相簿", pid))
        if shared is not None:
            self.db.exec("UPDATE fa_project SET shared=%s WHERE id=%s", (int(bool(shared)), pid))

    def project_copy(self, pid):
        p = self.project_get(pid)
        return self.project_save(None, p["name"] + "（複製）", p["data"], aspect=p["aspect"])

    def project_delete(self, pid):
        self.need("EDIT")
        r = self.db.row("SELECT owner, name, shared FROM fa_project WHERE id=%s", (pid,))
        if not r:
            return
        if r["owner"] != self.uid and not (self.user["is_admin"] or (r["shared"] and self.can("SHARE", 2))):
            raise BizError("只能刪除自己的相簿")
        self.db.exec("DELETE FROM fa_project WHERE id=%s", (pid,))
        self.log("project_del", pid, r["name"])

    # ================================================================ 個人偏好
    def pref(self):
        v = self.db.value("SELECT data FROM fa_pref WHERE uid=%s", (self.uid,))
        return json.loads(v) if v else {}

    def save_pref(self, data):
        cur = self.pref()
        cur.update(data or {})
        self.db.exec("REPLACE INTO fa_pref (uid, data) VALUES (%s, %s)", (self.uid, json.dumps(cur, ensure_ascii=False)))
        return cur

    # ================================================================ 輸出紀錄
    def export_begin(self, pid, preset, seconds):
        self.need("EXPORT", 1)
        return self.db.exec("INSERT INTO fa_export (project_id, uid, preset, seconds) VALUES (%s,%s,%s,%s)",
                            (pid or 0, self.uid, preset, seconds))

    def export_end(self, eid, status, path="", message=""):
        size = os.path.getsize(path) if path and os.path.isfile(path) else 0
        self.db.exec("UPDATE fa_export SET status=%s, path=%s, size=%s, message=%s, finished_at=NOW() WHERE id=%s",
                     (status, path, size, (message or "")[:4000], eid))
        if status == "DONE":
            self.log("export", eid, path)

    def exports(self, pid=None):
        sql = ("SELECT e.*, p.name AS project FROM fa_export e LEFT JOIN fa_project p ON p.id=e.project_id "
               "WHERE e.uid=%s" + (" AND e.project_id=%s" if pid else "") + " ORDER BY e.id DESC LIMIT 100")
        rows = self.db.rows(sql, (self.uid, pid) if pid else (self.uid,))
        for r in rows:
            r["seconds"] = float(r["seconds"])
            for k in ("created_at", "finished_at"):
                r[k] = r[k].strftime("%Y-%m-%d %H:%M") if r[k] else ""
            r["exists"] = bool(r["path"] and os.path.isfile(r["path"]))
        return rows

    def default_out_dir(self):
        d = (self.company().get("out_dir") or "").strip()
        if d and os.path.isdir(d):
            return d
        base = os.path.expanduser("~")
        if os.name == "nt":
            try:
                import ctypes
                buf = ctypes.create_unicode_buffer(520)
                ctypes.windll.shell32.SHGetFolderPathW(None, 14, None, 0, buf)   # CSIDL_MYVIDEO「影片」
                if buf.value:
                    base = buf.value
            except Exception:
                pass
        else:
            base = os.path.join(base, "Movies")
        d = os.path.join(base, "家庭相簿")
        os.makedirs(d, exist_ok=True)
        return d
