"""輸出影片工作：畫面逐格（JPEG）從程式畫面送進 FFmpeg，聲音先混好成一個 WAV。

流程：
1. start：建立工作（暫存資料夾、輸出檔名），畫面先把整段聲音混好上傳（audio）
2. 開始逐格送畫面（frame，帶格數編號；可能亂序到達，這裡依序寫進 FFmpeg）
3. finish：關閉輸入、等 FFmpeg 收尾；cancel：中止並刪除未完成的檔案
"""
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid

from . import presets
from .album import NO_WINDOW, ffmpeg_exe


class Job:
    def __init__(self, preset, aspect, quality, fps, total, out_path, w, h):
        self.id = uuid.uuid4().hex[:12]
        self.preset = preset
        self.aspect = aspect
        self.quality = quality
        self.fps = fps
        self.total = int(total)
        self.out_path = out_path
        self.w, self.h = w, h
        self.dir = tempfile.mkdtemp(prefix="zmsalbum-")
        self.audio = None
        self.proc = None
        self.next = 0
        self.pending = {}
        self.lock = threading.Condition()
        self.error = ""
        self.status = "RUN"
        self.started = time.time()
        self.log = os.path.join(self.dir, "ffmpeg.log")
        self.export_id = None
        self.touched = time.time()

    # ---------------------------------------------------------------- 聲音
    def set_audio(self, data: bytes):
        self.audio = os.path.join(self.dir, "mix.wav")
        with open(self.audio, "wb") as f:
            f.write(data)

    # ---------------------------------------------------------------- FFmpeg
    def _start_proc(self):
        p = presets.BY_ID[self.preset]
        tmp_out = self.out_path + ".part"
        args = [ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y",
                "-f", "image2pipe", "-framerate", presets.fps_arg(self.fps), "-c:v", "mjpeg", "-i", "-"]
        if self.audio and (p["a"] or p["fmt"] in ("dvd", "vcd", "svcd")):
            args += ["-i", self.audio, "-map", "0:v", "-map", "1:a", "-shortest"]
        args += presets.ffmpeg_output_args(p, self.aspect, self.quality, self.w, self.h)
        if p["fmt"] is None:                     # 暫存檔名是 .part：明確告訴 FFmpeg 輸出格式
            fmt = {"mp4": "mp4", "mov": "mov", "mkv": "matroska", "webm": "webm", "avi": "avi", "wmv": "asf",
                   "asf": "asf", "flv": "flv", "swf": "swf", "3gp": "3gp", "dv": "dv", "gif": "gif",
                   "m4v": "ipod", "mpg": "mpeg"}.get(p["ext"], p["ext"])
            args += ["-f", fmt]
        args.append(tmp_out)
        self._tmp_out = tmp_out
        self.proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                                     stderr=open(self.log, "wb"), creationflags=NO_WINDOW)

    def frame(self, idx: int, data: bytes):
        """收到一格畫面（JPEG）。依格數順序寫進 FFmpeg。"""
        with self.lock:
            self.touched = time.time()
            if self.status != "RUN":
                raise RuntimeError(self.error or "輸出已停止")
            if self.proc is None:
                self._start_proc()
            self.pending[idx] = data
            while self.next in self.pending:
                buf = self.pending.pop(self.next)
                try:
                    self.proc.stdin.write(buf)
                except (BrokenPipeError, OSError):
                    self.status = "FAIL"
                    self.error = self._ffmpeg_error() or "轉檔程式意外結束"
                    raise RuntimeError(self.error)
                self.next += 1
            if len(self.pending) > 120:
                raise RuntimeError("畫面順序錯亂")

    def _ffmpeg_error(self):
        try:
            return open(self.log, encoding="utf-8", errors="replace").read()[-800:]
        except OSError:
            return ""

    def finish(self):
        with self.lock:
            if self.proc is None:
                raise RuntimeError("沒有收到任何畫面")
            try:
                self.proc.stdin.close()
            except OSError:
                pass
        code = self.proc.wait()
        if code != 0:
            self.status = "FAIL"
            self.error = self._ffmpeg_error() or "轉檔失敗（代碼 %s）" % code
            self._cleanup(remove_out=True)
            raise RuntimeError(self.error)
        if os.path.exists(self.out_path):
            os.remove(self.out_path)
        os.replace(self._tmp_out, self.out_path)
        self.status = "DONE"
        self._cleanup()
        return self.out_path

    def cancel(self):
        with self.lock:
            self.status = "STOP"
            if self.proc and self.proc.poll() is None:
                try:
                    self.proc.stdin.close()
                except OSError:
                    pass
                self.proc.kill()
        self._cleanup(remove_out=True)

    def _cleanup(self, remove_out=False):
        if remove_out and getattr(self, "_tmp_out", None) and os.path.exists(self._tmp_out):
            try:
                os.remove(self._tmp_out)
            except OSError:
                pass
        shutil.rmtree(self.dir, ignore_errors=True)


JOBS = {}


def unique_path(folder, name, ext):
    bad = '<>:"/\\|?*'
    name = "".join("_" if c in bad else c for c in (name or "家庭相簿")).strip() or "家庭相簿"
    path = os.path.join(folder, "%s.%s" % (name, ext))
    n = 2
    while os.path.exists(path) or os.path.exists(path + ".part"):
        path = os.path.join(folder, "%s (%d).%s" % (name, n, ext))
        n += 1
    return path


def cancel_stale(idle=45):
    """畫面重新整理或當掉而留下的工作：超過 idle 秒沒有收到畫面就取消。"""
    for k, j in list(JOBS.items()):
        if j.status == "RUN" and time.time() - j.touched > idle:
            j.cancel()
            JOBS.pop(k, None)


def stop_all():
    for j in list(JOBS.values()):
        if j.status == "RUN":
            j.cancel()
