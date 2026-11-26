# 資料助秘家庭相簿編輯

把相片、影片、音樂做成有轉場、字幕、動態效果的相簿影片。操作方式參考 DVD 相簿製作軟體，分成三個步驟：**整理 → 個人化 → 製作**。

開發：吳玉柱 先生 與 Claude AI Opus 5.5

## 平台

| 平台 | 狀態 |
|---|---|
| Windows 11 | 0.9.0：下載 [ZMSFamilyAlbum-Setup-0.9.0.exe](https://github.com/achir1015/zms-family-album/releases/latest) |
| macOS（MacBook Pro） | 之後 |
| 線上版（網頁） | 之後 |
| iPhone／iPad（線上安裝） | 之後 |
| Android | 之後 |

## 功能

**1. 整理**
- 加入相片、影片（拖曳或選檔）：JPG、PNG、BMP、GIF、WebP、TIFF、HEIC（最相容格式）、MP4、MOV、AVI、WMV、MPG、3GP、MKV、FLV、MTS…（不能直接播放的格式會自動轉檔）
- 拖曳排序、依拍攝日期／檔名／隨機排序、旋轉、移除、每張秒數
- 一本相簿可以有好幾段影片，輸出時接在一起
- 編輯視窗：裁切（自由／16:9／4:3／1:1）、旋轉、鏡像、**紅眼修正**（圈選後自動修）、亮度／對比／飽和度、23 種相片特效（舊照片、森林、反向、黑白、木紋…）、自訂鏡頭起點終點、影片剪頭尾／音量／靜音／速度

**2. 個人化**
- **40 種影片風格**（愛情婚禮、寶寶兒童、生日派對、旅遊、節慶、家庭、懷舊、簡約、3D 動感、畢業學校），一鍵套用轉場、動態、相框、特效、片頭片尾
- **337 種 2D／3D 轉場**（gl-transitions，MIT 授權），可拖到兩張相片中間
- 14 種鏡頭動態（Ken Burns）＋自訂
- 文字：33 種預設文字效果、10 種字型、34 種進場／出場動畫、9 種持續動畫（含片尾捲動名單）
- 143 個剪貼畫（Microsoft Fluent Emoji 3D，MIT），可拖曳、縮放、旋轉、動畫，也可用自己的去背 PNG
- 18 種場景特效（雪花、愛心、泡泡、櫻花、煙火、星光、老電影、漏光…）
- 12 種相框、片頭片尾文字卡
- **內附 40 首背景音樂**（每首 4～5 分多鐘，溫馨抒情／輕快活潑／運動活力／浪漫爵士／節慶，可試聽），也可加入自己的音樂（MP3、WAV、OGG、M4A、WMA、FLAC）：波形剪下、淡入淡出、音量、配合影片長度
- 錄旁白（麥克風），有旁白時背景音樂自動調小；12 種程式合成音效
- 腳本／時間軸（音樂、旁白音效、文字、相片影片、場景特效、剪貼畫 六軌）、分割、復原重做
- 一鍵切換 16:9 與 4:3

**3. 製作**（52 種格式，全部實測可輸出）
- 存到電腦：MP4、AVI、WMV、MOV、M4V、MKV、WebM、MPEG、FLV、F4V、SWF、ASF、3GP、DV、GIF
- 高畫質：HD MP4 1080p、H.264、H.265、4K、TS、TRP、HD AVI／MPEG／WMV／MOV／MKV
- Apple（iPhone、iPad、iPod、Apple TV）、手機平板（Android、BlackBerry、Nokia、Windows Mobile）
- 遊戲機與播放器（PS3/PS4、PSP、Xbox、Wii、NDS、Walkman、電視 USB）
- 網路分享（YouTube、Facebook、Vimeo、LINE、Instagram）
- 光碟相容：DVD（NTSC／PAL）、VCD、SVCD 規格的 MPEG 影片（燒成影片光碟需另用燒錄軟體）

**其他**
- 使用者與權限（相簿編輯、輸出影片、共用相簿、系統管理）、分享相簿給家人、操作紀錄、備份還原（內建 MariaDB）
- 語音動態教學（8 個主題，微軟曉臻自然語音＋聚光框示範，講完自動接下一課）
- 程式內更新（GitHub Releases）、桌面捷徑
- 內建範本相簿：40 張 AI 產生的台灣年輕人畢業與校園生活範例相片（不是真人）

## 開發

```powershell
py -3.12 -m venv .venv
.venv\Scripts\pip install pywebview pymysql edge-tts pillow pyinstaller certifi
.venv\Scripts\python main.py            # 桌面版
.venv\Scripts\python main.py --web 8700 # 瀏覽器測試：http://127.0.0.1:8700/?k=dev
```

- `fa/`：Python 後端（本機伺服器、MariaDB、素材庫、FFmpeg 輸出、更新）
- `web/`：畫面（純 JavaScript，WebGL 轉場、Canvas 繪製、Web Audio 混音），之後線上版與手機版共用
- `tools/`：建置與資料產生（`build_windows.py`、`build_transitions.py`、`fetch_clipart.py`、`make_voice.py`、`make_icon.py`、`make_samples.py`、`fetch_music.py`）
- `packaging/`：Inno Setup 安裝程式、圖示；`packaging/mariadb`、`packaging/ffmpeg` 不放 git；背景音樂檔 `web/assets/music/*.m4a` 也不放 git，建置前執行 `tools/fetch_music.py` 下載

資料存放：`%LOCALAPPDATA%\ZMSFamilyAlbum`（資料庫、素材 media、設定）；輸出影片預設在「影片\家庭相簿」。

## 授權與第三方

gl-transitions（MIT）、Microsoft Fluent Emoji（MIT）、mp4-muxer（MIT）、FFmpeg（GPL）、MariaDB（GPL）、思源黑體（OFL）、pywebview（BSD）。
內附背景音樂：Kevin MacLeod（incompetech.com），Licensed under Creative Commons: By Attribution 4.0（每首曲名見 `web/assets/music/music.json`）。
範本相片由 AI Horde（Juggernaut XL）產生，畫面中的人物不是真實存在的人。
