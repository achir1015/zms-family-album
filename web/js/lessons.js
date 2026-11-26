/* 語音動態教學的課程內容（tools/make_voice.py 也會讀這個檔，產生每一句的語音 MP3）。
 * do：開始講這一句之前先做的動作（home 相簿清單、tab:分頁、lib:素材庫分頁、view:story/time、out:輸出分類） */
window.FA_LESSONS = [
  { id: 'start', title: '認識畫面與建立相簿', desc: '相簿清單、新增相簿、三個步驟', editor: false, steps: [
    { sel: '#project-grid', do: 'home', say: '歡迎使用資料助秘家庭相簿編輯！這裡是相簿清單，每一張卡片就是一本相簿，點一下就能打開繼續編輯。' },
    { sel: '#btn-new', do: 'home', say: '要做新的相簿，請按右上角的「新增相簿」，輸入名稱後就會進入編輯畫面。' },
    { sel: '#btn-sample', do: 'home', say: '第一次使用，可以先按「建立範本相簿」。程式會用內建的四十張畢業與校園生活範例相片，自動做好一本畢業紀念相簿，讓您看看完成後的樣子。這些範例相片是 AI 產生的，不是真人。' },
    { sel: '#home-user', do: 'home', say: '右上角的帳號選單裡有變更密碼、使用者與權限、備份、檢查更新、建立桌面捷徑等功能。' },
  ] },
  { id: 'organize', title: '第 1 步：整理相片', desc: '加入相片影片、排序、旋轉、秒數', editor: true, steps: [
    { sel: '.steps', do: 'tab:organize', say: '製作影片只要三個步驟：整理、個人化、製作。現在是第一步「整理」。' },
    { sel: '#btn-add-files', do: 'tab:organize', say: '按「加入相片或影片」選擇檔案，也可以直接從檔案總管把相片拖進中間的區域。JPG、PNG、手機影片、舊的 AVI 或 WMV 都可以。' },
    { sel: '#org-grid', do: 'tab:organize', say: '加進來的相片會照順序排在這裡。用滑鼠拖曳可以調整順序；按住 Ctrl 可以一次選好幾張。' },
    { sel: '#org-tools', do: 'tab:organize', say: '上方工具列可以把相片向左轉、向右轉、移除，也可以依拍攝日期或檔名排序，或一次設定每張相片顯示幾秒。' },
    { sel: '#show-list', do: 'tab:organize', say: '左邊是影片段。一本相簿可以分成好幾段，例如「出發」、「海邊」、「回程」，輸出時會自動接在一起。' },
    { sel: '.org-right', do: 'tab:organize', say: '右邊可以隨時預覽，並設定選取相片的秒數、轉場和鏡頭動態。在相片上按兩下，可以裁切、修紅眼、調亮度和加特效。' },
  ] },
  { id: 'style', title: '第 2 步：一鍵套用影片風格', desc: '好萊塢式風格、3D 風格', editor: true, steps: [
    { sel: '.steps', do: 'tab:personalize', say: '第二步「個人化」，讓相片變成有感情的影片。' },
    { sel: '#lib-body', do: 'lib:style', say: '最快的方法是套用影片風格，例如浪漫婚禮、寶寶成長、生日快樂、旅行日記、3D 方塊。點一下就會先預覽，喜歡再按「套用風格」。' },
    { sel: '.pz-center', do: 'lib:style', say: '中間是預覽畫面，按播放鍵或空白鍵就可以從頭看。' },
  ] },
  { id: 'trans', title: '轉場與鏡頭動態', desc: '337 種 2D／3D 轉場、Ken Burns', editor: true, steps: [
    { sel: '#lib-body', do: 'lib:trans', say: '轉場分頁裡有三百多種 2D 和 3D 轉場。滑鼠移到上面就會播放效果。' },
    { sel: '#storyboard', do: 'view:story', say: '把喜歡的轉場直接拖到下方兩張相片中間的小方塊，就換好了。點選小方塊，右邊還可以調整轉場秒數。' },
    { sel: '#lib-body', do: 'lib:motion', say: '動態分頁可以讓相片慢慢放大、縮小或平移，讓靜態相片也有電影感。' },
  ] },
  { id: 'text', title: '文字、剪貼畫與場景特效', desc: '標題字幕、可愛圖案、下雪愛心', editor: true, steps: [
    { sel: '#lib-body', do: 'lib:text', say: '文字分頁有三十多種文字效果，點一下就會在播放頭的位置加上一段文字。可以在預覽畫面上直接拖曳位置、拉右下角改大小。' },
    { sel: '#inspector', do: 'lib:text', say: '右邊可以修改文字內容、字型、顏色，以及進場、出場和持續的動畫，例如打字機、逐字掉落、彩虹變色。' },
    { sel: '#lib-body', do: 'lib:clip', say: '剪貼畫分頁有一百多個可愛的圖案，愛心、蛋糕、動物、節慶都有，還可以讓它飄浮、彈跳或旋轉。' },
    { sel: '#lib-body', do: 'lib:scene', say: '場景特效會疊在相片上，例如雪花紛飛、愛心飄落、煙火、泡泡、老電影。可以只加在一段時間，或整段影片都加。' },
  ] },
  { id: 'music', title: '背景音樂、旁白與片頭片尾', desc: '音樂剪輯淡入淡出、錄音、文字卡', editor: true, steps: [
    { sel: '#lib-body', do: 'lib:audio', say: '在音樂音效分頁按「加入音樂檔」，支援 MP3、WAV、OGG。音樂預設會配合影片長度，結尾自動淡出。' },
    { sel: '#tl-add-voice', do: 'lib:audio', say: '按「錄旁白」可以用麥克風邊看影片邊說故事，錄好的聲音會自動放在時間軸上，背景音樂也會自動調小。' },
    { sel: '#lib-body', do: 'lib:intro', say: '片頭片尾分頁可以加上大標題、段落標題，或像電影一樣往上捲動的感謝名單。' },
  ] },
  { id: 'timeline', title: '時間軸', desc: '精準調整每樣東西的時間', editor: true, steps: [
    { sel: '#bottom', do: 'view:time', say: '下方可以在「腳本」和「時間軸」之間切換。時間軸有音樂、旁白、文字、相片、場景特效、剪貼畫六條軌道。' },
    { sel: '#timeline', do: 'view:time', say: '拖曳色塊可以移動時間，拉色塊右邊可以調整長度。點上面的時間尺可以跳到那個位置。' },
    { sel: '.bottom-bar', do: 'view:time', say: '工具列的「分割」會把影片在播放頭的位置切成兩段，「刪除」會刪掉選取的東西。按 Ctrl 加 Z 可以復原。' },
  ] },
  { id: 'create', title: '第 3 步：製作影片', desc: '各種格式、手機、DVD 相容', editor: true, steps: [
    { sel: '.steps', do: 'tab:create', say: '最後一步「製作」，把相簿輸出成影片檔。' },
    { sel: '#out-cats', do: 'tab:create', say: '左邊選擇用途：存到電腦、高畫質、Apple 裝置、手機、遊戲機、網路分享，或 DVD 相容格式。' },
    { sel: '#out-presets', do: 'tab:create', say: '再選一種格式，例如 MP4、AVI、WMV、MOV、MKV、iPhone、YouTube。' },
    { sel: '#btn-export', do: 'tab:create', say: '設定檔名和儲存位置後，按「開始製作影片」。完成後可以直接播放，或開啟資料夾。' },
    { sel: '#btn-aspect', do: 'tab:create', say: '右上角這個按鈕可以一鍵切換 16 比 9 寬螢幕和 4 比 3 傳統畫面。' },
  ] },
];
