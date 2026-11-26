"""輸出格式（一般影片、高畫質、Apple、手機、遊戲機與播放器、網路分享、光碟相容）。

每個格式：id、分類、名稱、說明、副檔名、固定寬高（None＝依相簿比例，以 h 為高）、每秒格數、FFmpeg 參數。
畫面依相簿比例算好後交給 FFmpeg；固定寬高的格式會等比縮放並補黑邊（DVD／VCD 用變形像素並標示 4:3／16:9）。
"""

CATS = [
    ("pc", "存到電腦", "一般影片格式，電腦、電視盒、隨身碟都能播"),
    ("hd", "高畫質 HD", "1080p／4K 高畫質，適合大電視與保存"),
    ("apple", "Apple 裝置", "iPhone、iPad、iPod、Apple TV"),
    ("mobile", "手機與平板", "Android 與各品牌手機、平板"),
    ("player", "遊戲機與播放器", "PS、Xbox、PSP、Wii、隨身播放器"),
    ("web", "網路分享", "YouTube、Facebook、Vimeo、LINE、Instagram"),
    ("disc", "光碟相容", "DVD、VCD、SVCD 相容的 MPEG 影片（可用燒錄軟體燒成光碟）"),
]

H264 = ["-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-profile:v", "high"]
AAC = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
MP4F = ["-movflags", "+faststart"]


def _p(id, cat, name, desc, ext, h, v, a, w=None, fps=30, fmt=None, fixed=False, dar=False, q=True):
    return dict(id=id, cat=cat, name=name, desc=desc, ext=ext, h=h, w=w, fps=fps, v=v, a=a, fmt=fmt, fixed=fixed,
                dar=dar, crf=q)


PRESETS = [
    # ---------------------------------------------------------------- 一般格式
    _p("mp4", "pc", "MP4（H.264）", "最通用，幾乎所有裝置都能播", "mp4", 720, H264, AAC + MP4F),
    _p("avi", "pc", "AVI", "舊電腦、DVD 播放機的 USB 播放", "avi", 720,
       ["-c:v", "mpeg4", "-vtag", "XVID", "-q:v", "3"], ["-c:a", "libmp3lame", "-b:a", "192k"], q=False),
    _p("wmv", "pc", "WMV", "Windows 媒體播放程式", "wmv", 720, ["-c:v", "wmv2", "-b:v", "4M"],
       ["-c:a", "wmav2", "-b:a", "192k"], q=False),
    _p("mov", "pc", "MOV", "QuickTime、Mac", "mov", 720, H264, AAC + MP4F),
    _p("m4v", "pc", "M4V", "iTunes 影片", "m4v", 720, H264, AAC + MP4F, fmt="ipod"),
    _p("mkv", "pc", "MKV", "高相容的 Matroska 影片", "mkv", 720, H264, AAC),
    _p("webm", "pc", "WebM", "網頁播放用（VP9）", "webm", 720,
       ["-c:v", "libvpx-vp9", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4"],
       ["-c:a", "libopus", "-b:a", "160k"]),
    _p("mpeg", "pc", "MPEG", "MPEG-2 影片", "mpg", 576, ["-c:v", "mpeg2video", "-q:v", "3", "-pix_fmt", "yuv420p"],
       ["-c:a", "mp2", "-b:a", "224k"], fps=30, q=False),
    _p("flv", "pc", "FLV", "Flash 影片", "flv", 480, ["-c:v", "flv1", "-q:v", "3"],
       ["-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100"], q=False),
    _p("f4v", "pc", "F4V", "Flash H.264 影片", "f4v", 720, H264, AAC, fmt="mp4"),
    _p("swf", "pc", "SWF", "Flash 動畫檔", "swf", 480, ["-c:v", "flv1", "-q:v", "3"],
       ["-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100"], fps=25, q=False),
    _p("asf", "pc", "ASF", "Windows Media 串流", "asf", 480, ["-c:v", "wmv2", "-b:v", "3M"],
       ["-c:a", "wmav2", "-b:a", "160k"], q=False),
    _p("3gp", "pc", "3GP", "老式手機", "3gp", 288, ["-c:v", "h263", "-b:v", "400k"],
       ["-c:a", "aac", "-b:a", "64k", "-ar", "22050", "-ac", "1"], w=352, fixed=True, fps=15, q=False),
    _p("dv", "pc", "DV（NTSC）", "數位攝影機格式", "dv", 480, ["-c:v", "dvvideo", "-pix_fmt", "yuv411p"],
       ["-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2"], w=720, fixed=True, fps=29.97, dar=True, q=False),
    _p("gif", "pc", "GIF 動畫", "沒有聲音的動態圖片（適合短片）", "gif", 360,
       ["-vf", "fps=12,split[a][b];[a]palettegen[p];[b][p]paletteuse"], [], fps=12, q=False),
    # ---------------------------------------------------------------- 高畫質
    _p("hd-mp4", "hd", "HD MP4（1080p）", "Full HD H.264，最推薦保存", "mp4", 1080, H264, AAC + MP4F),
    _p("hd-h264", "hd", "HD H.264（720p）", "HD H.264 MP4，檔案較小", "mp4", 720, H264, AAC + MP4F),
    _p("hd-h265", "hd", "HD H.265／HEVC（1080p）", "同畫質檔案更小（新裝置才能播）", "mp4", 1080,
       ["-c:v", "libx265", "-preset", "medium", "-pix_fmt", "yuv420p", "-tag:v", "hvc1"], AAC + MP4F),
    _p("4k-mp4", "hd", "4K MP4（2160p）", "超高畫質（輸出較久）", "mp4", 2160, H264, AAC + MP4F),
    _p("hd-ts", "hd", "HD TS", "MPEG-TS 傳輸串流", "ts", 1080, H264, ["-c:a", "ac3", "-b:a", "384k"], fmt="mpegts"),
    _p("hd-trp", "hd", "HD TRP", "MPEG-TS（TRP）", "trp", 1080, H264, ["-c:a", "ac3", "-b:a", "384k"], fmt="mpegts"),
    _p("hd-avi", "hd", "HD AVI", "高畫質 AVI", "avi", 1080, ["-c:v", "mpeg4", "-vtag", "XVID", "-q:v", "2"],
       ["-c:a", "ac3", "-b:a", "384k"], q=False),
    _p("hd-mpeg", "hd", "HD MPEG", "高畫質 MPEG-2", "mpg", 1080, ["-c:v", "mpeg2video", "-b:v", "18M", "-maxrate",
                                                                  "25M", "-bufsize", "9M", "-pix_fmt", "yuv420p"],
       ["-c:a", "ac3", "-b:a", "384k"], q=False),
    _p("hd-wmv", "hd", "HD WMV", "高畫質 WMV", "wmv", 1080, ["-c:v", "wmv2", "-b:v", "12M"],
       ["-c:a", "wmav2", "-b:a", "256k"], q=False),
    _p("hd-mov", "hd", "HD MOV", "高畫質 QuickTime", "mov", 1080, H264, AAC + MP4F),
    _p("hd-mkv", "hd", "HD MKV", "高畫質 Matroska", "mkv", 1080, H264, AAC),
    # ---------------------------------------------------------------- Apple
    _p("iphone", "apple", "iPhone", "iPhone 全系列（1080p）", "mp4", 1080, H264, AAC + MP4F),
    _p("ipad", "apple", "iPad", "iPad 全系列（1080p）", "mp4", 1080, H264, AAC + MP4F),
    _p("ipod", "apple", "iPod", "iPod touch／nano（640×480 以內）", "m4v", 480,
       ["-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-profile:v", "baseline", "-level", "3.0"],
       AAC + MP4F, fmt="ipod"),
    _p("appletv", "apple", "Apple TV", "Apple TV（1080p）", "m4v", 1080, H264, AAC + MP4F, fmt="ipod"),
    # ---------------------------------------------------------------- 手機
    _p("android", "mobile", "Android 手機", "三星、小米、OPPO、華碩等（1080p）", "mp4", 1080, H264, AAC + MP4F),
    _p("android-tab", "mobile", "Android 平板", "各品牌平板（1080p）", "mp4", 1080, H264, AAC + MP4F),
    _p("phone-small", "mobile", "一般手機（省空間）", "720p、檔案較小，傳 LINE 也快", "mp4", 720, H264,
       ["-c:a", "aac", "-b:a", "128k"] + MP4F),
    _p("blackberry", "mobile", "BlackBerry", "黑莓機（480×360）", "mp4", 360,
       ["-c:v", "libx264", "-profile:v", "baseline", "-pix_fmt", "yuv420p"], AAC + MP4F, w=480, fixed=True),
    _p("nokia", "mobile", "Nokia／舊型手機", "3GP（320×240）", "3gp", 240, ["-c:v", "mpeg4", "-b:v", "500k"],
       ["-c:a", "aac", "-b:a", "96k", "-ar", "44100"], w=320, fixed=True, fps=15, q=False),
    _p("winmobile", "mobile", "Windows Mobile", "WMV（320×240）", "wmv", 240, ["-c:v", "wmv2", "-b:v", "700k"],
       ["-c:a", "wmav2", "-b:a", "96k"], w=320, fixed=True, q=False),
    # ---------------------------------------------------------------- 遊戲機與播放器
    _p("ps3", "player", "PS3／PS4", "PlayStation（1080p MP4）", "mp4", 1080, H264, AAC + MP4F),
    _p("psp", "player", "PSP", "PSP（480×272）", "mp4", 272,
       ["-c:v", "libx264", "-profile:v", "main", "-level", "3.0", "-pix_fmt", "yuv420p"], AAC + MP4F, w=480,
       fixed=True),
    _p("xbox", "player", "Xbox", "Xbox（1080p）", "mp4", 1080, H264, AAC + MP4F),
    _p("wii", "player", "Wii", "Wii（MJPEG AVI 640×480）", "avi", 480, ["-c:v", "mjpeg", "-q:v", "4"],
       ["-c:a", "pcm_s16le", "-ar", "44100"], w=640, fixed=True, q=False),
    _p("nds", "player", "NDS", "掌上型遊戲機（256×192）", "avi", 192, ["-c:v", "mpeg4", "-q:v", "4"],
       ["-c:a", "libmp3lame", "-b:a", "96k"], w=256, fixed=True, fps=15, q=False),
    _p("walkman", "player", "Sony Walkman", "隨身播放器（320×240）", "mp4", 240,
       ["-c:v", "libx264", "-profile:v", "baseline", "-pix_fmt", "yuv420p"], AAC + MP4F, w=320, fixed=True),
    _p("tv-usb", "player", "電視 USB 播放", "插在電視 USB 直接播（1080p MP4）", "mp4", 1080, H264, AAC + MP4F),
    # ---------------------------------------------------------------- 網路分享
    _p("youtube", "web", "YouTube", "1080p，上傳後畫質最好", "mp4", 1080, H264, AAC + MP4F),
    _p("facebook", "web", "Facebook", "720p，上傳快", "mp4", 720, H264, ["-c:a", "aac", "-b:a", "128k"] + MP4F),
    _p("vimeo", "web", "Vimeo", "1080p 高畫質", "mp4", 1080, H264, AAC + MP4F),
    _p("line", "web", "LINE", "720p、檔案小，適合傳給家人", "mp4", 720, H264, ["-c:a", "aac", "-b:a", "128k"] + MP4F),
    _p("instagram", "web", "Instagram", "1080p MP4", "mp4", 1080, H264, AAC + MP4F),
    # ---------------------------------------------------------------- 光碟
    _p("dvd-ntsc", "disc", "DVD 相容（NTSC，台灣）", "MPEG-2 720×480，用燒錄軟體燒成 DVD 影片", "mpg", 480, [],
       [], w=720, fixed=True, fps=29.97, dar=True, fmt="dvd", q=False),
    _p("dvd-pal", "disc", "DVD 相容（PAL）", "MPEG-2 720×576（歐洲、香港）", "mpg", 576, [], [], w=720, fixed=True,
       fps=25, dar=True, fmt="dvd", q=False),
    _p("vcd", "disc", "VCD 相容", "MPEG-1 352×240", "mpg", 240, [], [], w=352, fixed=True, fps=29.97, dar=True,
       fmt="vcd", q=False),
    _p("svcd", "disc", "SVCD 相容", "MPEG-2 480×480", "mpg", 480, [], [], w=480, fixed=True, fps=29.97, dar=True,
       fmt="svcd", q=False),
]
BY_ID = {p["id"]: p for p in PRESETS}

def fps_arg(fps):
    """29.97 要寫成精確的 30000/1001（DV、DVD 只接受這個）。"""
    return "30000/1001" if abs(float(fps) - 29.97) < 0.01 else str(fps)


QUALITY = {"high": 18, "normal": 21, "small": 25}       # H.264 CRF


def render_size(preset, aspect):
    """相簿畫面要畫多大（寬, 高，偶數）。"""
    ar = 16 / 9 if aspect == "16:9" else 4 / 3
    h = int(preset["h"])
    if preset["fixed"] and preset["w"] and not preset["dar"]:
        w0 = int(preset["w"])
        if w0 / h > ar:
            w = int(round(h * ar / 2) * 2)
        else:
            w, h = w0, int(round(w0 / ar / 2) * 2)
        return max(w, 16), max(h, 16)
    return int(round(h * ar / 2) * 2), h


def ffmpeg_output_args(preset, aspect, quality="normal", rw=None, rh=None):
    """輸入（畫面＋聲音）之後的 FFmpeg 參數（不含輸出檔名）。"""
    p = preset
    args = []
    vf = []
    if p["fmt"] in ("dvd", "vcd", "svcd"):
        std = "pal" if p["fps"] == 25 else "ntsc"
        args += ["-target", "%s-%s" % (std, p["fmt"])]
        vf.append("scale=%d:%d,setsar=1" % (p["w"], p["h"]))
        args += ["-aspect", aspect if p["fmt"] == "dvd" else "4:3"]
        if p["fmt"] != "dvd" and aspect == "16:9":       # VCD/SVCD 只有 4:3：補上下黑邊
            vf = ["scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1"
                  % (p["w"], p["h"], p["w"], p["h"])]
            args[-1] = "4:3"
        return ["-vf", ",".join(vf)] + args
    if p["fixed"] and p["w"]:
        if p["dar"]:
            vf.append("scale=%d:%d,setsar=1" % (p["w"], p["h"]))
            args += ["-aspect", aspect]
        else:
            vf.append("scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1"
                      % (p["w"], p["h"], p["w"], p["h"]))
    v = list(p["v"])
    if "-vf" in v:                                        # GIF 自帶濾鏡
        i = v.index("-vf")
        vf.append(v[i + 1])
        del v[i:i + 2]
    if p["crf"] and "libx26" in " ".join(v):
        v += ["-crf", str(QUALITY.get(quality, 21) + (2 if "libx265" in v else 0))]
    if p["crf"] and "libvpx" in " ".join(v):
        v += ["-crf", str(QUALITY.get(quality, 21) + 12)]
    if vf:
        args += ["-vf", ",".join(vf)]
    args += v
    if p["a"]:
        args += p["a"]
    else:
        args += ["-an"]
    args += ["-r", fps_arg(p["fps"])]
    if p["fmt"]:
        args += ["-f", p["fmt"]]
    return args


def public():
    """給畫面用的清單（不含 FFmpeg 參數）。"""
    return dict(cats=[dict(id=c[0], name=c[1], desc=c[2]) for c in CATS],
                presets=[dict(id=p["id"], cat=p["cat"], name=p["name"], desc=p["desc"], ext=p["ext"], h=p["h"],
                              w=p["w"], fps=p["fps"], fixed=p["fixed"], audio=bool(p["a"]) or bool(p["fmt"] in (
                                  "dvd", "vcd", "svcd"))) for p in PRESETS])
