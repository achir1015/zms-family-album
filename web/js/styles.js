/* 特效與風格定義：相片特效、動態（Ken Burns）、相框、文字樣式、文字動畫、場景特效、影片風格、字型、片頭片尾背景。
 * 所有繪製都只依「時間」決定（不靠亂數狀態），預覽與輸出的畫面完全一樣。 */
(function () {
  const FA = (window.FA = window.FA || {});

  // ------------------------------------------------------------ 小工具
  FA.rnd = function (seed) {            // 0～1 的固定亂數（同一個 seed 永遠一樣）
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const R = FA.rnd;
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeBack = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  const bounce = (p) => {
    const n1 = 7.5625, d1 = 2.75;
    if (p < 1 / d1) return n1 * p * p;
    if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
    if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
    return n1 * (p -= 2.625 / d1) * p + 0.984375;
  };
  FA.ease = { ease, easeOut, easeBack, bounce };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  FA.clamp = clamp;

  // ------------------------------------------------------------ 相片特效（ctx.filter＋覆蓋）
  FA.FX = [
    { id: 'none', name: '原色', filter: '' },
    { id: 'old', name: '舊照片', filter: 'sepia(0.85) contrast(1.05) brightness(0.95)', vignette: 0.55, grain: 0.10, scratch: true },
    { id: 'sepia', name: '懷舊褐色', filter: 'sepia(1)' },
    { id: 'gray', name: '黑白', filter: 'grayscale(1) contrast(1.1)' },
    { id: 'invert', name: '反向（負片）', filter: 'invert(1)' },
    { id: 'forest', name: '森林綠意', filter: 'saturate(1.2) hue-rotate(-12deg)', tint: 'rgba(40,120,40,0.18)' },
    { id: 'wood', name: '木紋', filter: 'sepia(0.5) saturate(0.9)', wood: true },
    { id: 'warm', name: '暖陽', filter: 'saturate(1.15)', tint: 'rgba(255,150,40,0.16)' },
    { id: 'cool', name: '清涼藍調', filter: 'saturate(1.05)', tint: 'rgba(40,120,255,0.16)' },
    { id: 'vivid', name: '鮮豔', filter: 'saturate(1.6) contrast(1.1)' },
    { id: 'fade', name: '褪色底片', filter: 'saturate(0.7) contrast(0.85) brightness(1.08)', tint: 'rgba(255,240,220,0.12)' },
    { id: 'dream', name: '夢幻柔光', filter: 'brightness(1.06) saturate(1.1)', glow: true },
    { id: 'soft', name: '柔焦', filter: 'blur(1.5px) brightness(1.05)' },
    { id: 'blur', name: '模糊', filter: 'blur(6px)' },
    { id: 'vignette', name: '暗角', filter: '', vignette: 0.7 },
    { id: 'film', name: '電影感', filter: 'contrast(1.15) saturate(0.85)', tint: 'rgba(0,80,90,0.12)', vignette: 0.4, grain: 0.06 },
    { id: 'pink', name: '粉嫩', filter: 'brightness(1.08) saturate(1.1)', tint: 'rgba(255,120,170,0.15)' },
    { id: 'bright', name: '明亮', filter: 'brightness(1.2) contrast(1.05)' },
    { id: 'dark', name: '暗沉', filter: 'brightness(0.75) contrast(1.1)' },
    { id: 'emboss', name: '浮雕灰', filter: 'grayscale(1) contrast(2.2) brightness(1.1)' },
    { id: 'pop', name: '普普風', filter: 'saturate(2.6) contrast(1.4)' },
    { id: 'night', name: '夜色', filter: 'brightness(0.7) saturate(0.6) hue-rotate(190deg)', tint: 'rgba(20,40,120,0.25)' },
    { id: 'gold', name: '金色時光', filter: 'sepia(0.35) saturate(1.3) brightness(1.05)', tint: 'rgba(255,190,60,0.12)', vignette: 0.35 },
  ];
  FA.FX_BY = Object.fromEntries(FA.FX.map((f) => [f.id, f]));

  // ------------------------------------------------------------ 動態（Ken Burns）：from/to = {x,y 中心偏移（-0.5～0.5）, z 放大倍率}
  FA.MOTIONS = [
    { id: 'none', name: '靜止', from: { x: 0, y: 0, z: 1 }, to: { x: 0, y: 0, z: 1 } },
    { id: 'auto', name: '自動（每張不同）' },
    { id: 'zoomin', name: '慢慢放大', from: { x: 0, y: 0, z: 1 }, to: { x: 0, y: 0, z: 1.18 } },
    { id: 'zoomout', name: '慢慢縮小', from: { x: 0, y: 0, z: 1.18 }, to: { x: 0, y: 0, z: 1 } },
    { id: 'panr', name: '向右平移', from: { x: -0.06, y: 0, z: 1.15 }, to: { x: 0.06, y: 0, z: 1.15 } },
    { id: 'panl', name: '向左平移', from: { x: 0.06, y: 0, z: 1.15 }, to: { x: -0.06, y: 0, z: 1.15 } },
    { id: 'pand', name: '向下平移', from: { x: 0, y: -0.06, z: 1.15 }, to: { x: 0, y: 0.06, z: 1.15 } },
    { id: 'panu', name: '向上平移', from: { x: 0, y: 0.06, z: 1.15 }, to: { x: 0, y: -0.06, z: 1.15 } },
    { id: 'zoomtl', name: '放大到左上', from: { x: 0, y: 0, z: 1 }, to: { x: -0.08, y: -0.06, z: 1.25 } },
    { id: 'zoombr', name: '放大到右下', from: { x: 0, y: 0, z: 1 }, to: { x: 0.08, y: 0.06, z: 1.25 } },
    { id: 'zoomtr', name: '放大到右上', from: { x: 0, y: 0, z: 1 }, to: { x: 0.08, y: -0.06, z: 1.25 } },
    { id: 'zoombl', name: '放大到左下', from: { x: 0, y: 0, z: 1 }, to: { x: -0.08, y: 0.06, z: 1.25 } },
    { id: 'strong', name: '大幅放大', from: { x: 0, y: 0, z: 1 }, to: { x: 0, y: 0, z: 1.45 } },
    { id: 'custom', name: '自訂起點與終點' },
  ];
  FA.MOTION_BY = Object.fromEntries(FA.MOTIONS.map((m) => [m.id, m]));
  const AUTO_SET = ['zoomin', 'zoomout', 'panr', 'panl', 'zoomtl', 'zoombr', 'zoomtr', 'zoombl', 'pand', 'panu'];
  FA.motionOf = function (item, idx) {
    const m = item.motion || { kind: 'auto' };
    if (m.kind === 'custom' && m.from && m.to) return m;
    if (m.kind === 'auto' || !FA.MOTION_BY[m.kind]) {
      const seed = (item.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), idx || 0);
      return FA.MOTION_BY[AUTO_SET[seed % AUTO_SET.length]];
    }
    return FA.MOTION_BY[m.kind];
  };

  // ------------------------------------------------------------ 相框裝飾
  FA.FRAMES = [
    { id: 'none', name: '無' }, { id: 'white', name: '白邊' }, { id: 'polaroid', name: '拍立得' },
    { id: 'film', name: '底片' }, { id: 'round', name: '圓角' }, { id: 'gold', name: '金框' },
    { id: 'vignette', name: '柔和暗角' }, { id: 'dots', name: '童趣圓點' }, { id: 'heart', name: '愛心角落' },
    { id: 'wood', name: '木頭相框' }, { id: 'snow', name: '雪白圓角' }, { id: 'neon', name: '霓虹光框' },
  ];

  // ------------------------------------------------------------ 字型
  FA.FONTS = [
    { id: 'Noto Sans TC', name: '思源黑體' }, { id: 'Microsoft JhengHei', name: '微軟正黑體' },
    { id: 'DFKai-SB', name: '標楷體' }, { id: 'PMingLiU', name: '新細明體' },
    { id: 'Georgia', name: 'Georgia（英文襯線）' }, { id: 'Times New Roman', name: 'Times New Roman' },
    { id: 'Segoe Script', name: 'Segoe Script（英文手寫）' }, { id: 'Comic Sans MS', name: 'Comic Sans（英文童趣）' },
    { id: 'Impact', name: 'Impact（英文粗體）' }, { id: 'Arial Black', name: 'Arial Black' },
  ];

  // ------------------------------------------------------------ 文字樣式（預先定義的文字效果）
  // fill：顏色或 [漸層色…]；stroke：[寬度（字高比例）, 顏色]；shadow：[x, y, 模糊, 顏色]；glow：顏色；box：底色
  FA.TEXT_PRESETS = [
    { id: 'plain', name: '白字陰影', fill: '#ffffff', shadow: [0.04, 0.05, 0.1, 'rgba(0,0,0,0.75)'] },
    { id: 'black', name: '黑字', fill: '#111111' },
    { id: 'outline', name: '白字黑邊', fill: '#ffffff', stroke: [0.12, '#000000'] },
    { id: 'gold', name: '金色描邊', fill: ['#fff3b0', '#f5c542', '#b8860b'], stroke: [0.06, '#5a3b00'], shadow: [0.03, 0.04, 0.08, 'rgba(0,0,0,0.6)'] },
    { id: 'wedding', name: '婚禮香檳金', fill: ['#fffaf0', '#e8c98a'], shadow: [0, 0, 0.25, 'rgba(255,215,140,0.9)'], font: 'Georgia' },
    { id: 'neonpink', name: '霓虹粉', fill: '#ffe6f4', glow: '#ff3fa4' },
    { id: 'neonblue', name: '霓虹藍', fill: '#e6fbff', glow: '#1fc8ff' },
    { id: 'neongreen', name: '霓虹綠', fill: '#eaffea', glow: '#38ff5a' },
    { id: '3d', name: '立體陰影', fill: '#ffd23f', stroke: [0.05, '#7a3d00'], depth: ['#7a3d00', 6] },
    { id: 'rainbow', name: '彩虹漸層', fill: ['#ff4d4d', '#ffb84d', '#ffff4d', '#4dff88', '#4dc3ff', '#b84dff'], stroke: [0.06, '#ffffff'] },
    { id: 'fire', name: '火焰', fill: ['#fff176', '#ff9800', '#e53935'], glow: '#ff5722' },
    { id: 'ice', name: '冰晶藍', fill: ['#ffffff', '#b3e5fc', '#4fc3f7'], stroke: [0.04, '#01579b'], glow: '#b3e5fc' },
    { id: 'candy', name: '糖果粉彩', fill: ['#ffb3d9', '#b3e0ff'], stroke: [0.1, '#ffffff'], shadow: [0.04, 0.05, 0.05, 'rgba(255,80,150,0.5)'] },
    { id: 'bubble', name: '可愛泡泡字', fill: '#ff6fa8', stroke: [0.16, '#ffffff'], shadow: [0.04, 0.06, 0.06, 'rgba(0,0,0,0.35)'] },
    { id: 'kids', name: '童趣彩色', fill: '#ffeb3b', stroke: [0.14, '#3f51b5'], shadow: [0.05, 0.06, 0, '#e91e63'] },
    { id: 'chalk', name: '黑板粉筆', fill: '#f5f5f5', box: 'rgba(30,60,40,0.85)', shadow: [0, 0, 0.06, 'rgba(255,255,255,0.4)'] },
    { id: 'subtitle', name: '電影字幕', fill: '#ffffff', stroke: [0.06, '#000000'] },
    { id: 'bar', name: '黑底白字條', fill: '#ffffff', box: 'rgba(0,0,0,0.6)' },
    { id: 'whitebar', name: '白底黑字條', fill: '#222222', box: 'rgba(255,255,255,0.85)' },
    { id: 'red', name: '喜氣紅金', fill: ['#ffe082', '#ffb300'], stroke: [0.08, '#b71c1c'], shadow: [0.03, 0.04, 0.06, 'rgba(0,0,0,0.5)'] },
    { id: 'retro', name: '復古棕', fill: '#f3e0c0', stroke: [0.05, '#5d4037'], shadow: [0.06, 0.06, 0, '#3e2723'], font: 'Georgia' },
    { id: 'elegant', name: '優雅細白', fill: '#ffffff', shadow: [0, 0.02, 0.12, 'rgba(0,0,0,0.6)'], font: 'Times New Roman', italic: true },
    { id: 'script', name: '英文手寫', fill: '#ffffff', shadow: [0.03, 0.03, 0.08, 'rgba(0,0,0,0.6)'], font: 'Segoe Script' },
    { id: 'emboss', name: '浮雕', fill: '#d9d9d9', shadow: [-0.03, -0.03, 0, '#ffffff'], depth: ['#555555', 3] },
    { id: 'magazine', name: '雜誌標題', fill: '#ffffff', box: 'rgba(233,30,99,0.9)', bold: true },
    { id: 'sunset', name: '夕陽漸層', fill: ['#ffd54f', '#ff7043', '#ab47bc'], shadow: [0.03, 0.04, 0.08, 'rgba(0,0,0,0.5)'] },
    { id: 'ocean', name: '海洋漸層', fill: ['#e0f7fa', '#26c6da', '#1565c0'], stroke: [0.04, '#ffffff'] },
    { id: 'forest', name: '森林綠', fill: ['#dcedc8', '#7cb342', '#33691e'], stroke: [0.04, '#ffffff'] },
    { id: 'silver', name: '銀色金屬', fill: ['#ffffff', '#9e9e9e', '#eeeeee', '#616161'], stroke: [0.04, '#212121'] },
    { id: 'love', name: '浪漫紅心', fill: ['#ff8a80', '#d50000'], glow: '#ff80ab' },
    { id: 'christmas', name: '聖誕紅綠', fill: '#ffffff', stroke: [0.1, '#c62828'], shadow: [0.05, 0.06, 0, '#2e7d32'] },
    { id: 'stamp', name: '印章紅', fill: '#c62828', box: 'rgba(255,248,225,0.9)', font: 'DFKai-SB' },
    { id: 'calligraphy', name: '書法', fill: '#1a1a1a', shadow: [0, 0, 0.05, 'rgba(255,255,255,0.8)'], font: 'DFKai-SB' },
  ];
  FA.TEXT_PRESET_BY = Object.fromEntries(FA.TEXT_PRESETS.map((p) => [p.id, p]));

  // ------------------------------------------------------------ 文字動畫（進場／出場）
  // 回傳每個字的變化：{a 透明度, x, y 位移（字高倍數）, s 縮放, r 旋轉, show 是否顯示}
  // p＝進場（或出場）進度 0～1；i＝第幾個字、n＝總字數
  FA.TEXT_ANIMS = [
    { id: 'none', name: '無' },
    { id: 'fade', name: '淡入', f: (p) => ({ a: p }) },
    { id: 'left', name: '從左飛入', f: (p) => ({ a: p, x: -(1 - easeOut(p)) * 8 }) },
    { id: 'right', name: '從右飛入', f: (p) => ({ a: p, x: (1 - easeOut(p)) * 8 }) },
    { id: 'top', name: '從上落下', f: (p) => ({ a: p, y: -(1 - easeOut(p)) * 4 }) },
    { id: 'bottom', name: '從下升起', f: (p) => ({ a: p, y: (1 - easeOut(p)) * 4 }) },
    { id: 'zoomin', name: '放大出現', f: (p) => ({ a: p, s: 0.3 + 0.7 * easeOut(p) }) },
    { id: 'zoomout', name: '縮小出現', f: (p) => ({ a: p, s: 2.2 - 1.2 * easeOut(p) }) },
    { id: 'pop', name: '彈跳出現', f: (p) => ({ a: Math.min(1, p * 3), s: easeBack(p) }) },
    { id: 'bounce', name: '彈跳落下', f: (p) => ({ a: Math.min(1, p * 4), y: -(1 - bounce(p)) * 5 }) },
    { id: 'spin', name: '旋轉出現', f: (p) => ({ a: p, r: (1 - easeOut(p)) * Math.PI * 2, s: 0.3 + 0.7 * p }) },
    { id: 'swing', name: '搖擺', f: (p) => ({ a: p, r: Math.sin(p * 12) * 0.35 * (1 - p) }) },
    { id: 'blur', name: '模糊變清楚', f: (p) => ({ a: p, blur: (1 - p) * 0.35 }) },
    { id: 'type', name: '打字機', each: true, f: (p, i, n) => ({ show: i < Math.ceil(p * n) }) },
    { id: 'letters', name: '逐字淡入', each: true, f: (p, i, n) => ({ a: clamp(p * (n + 3) - i, 0, 1) }) },
    { id: 'drop', name: '逐字掉落', each: true, f: (p, i, n) => { const q = clamp(p * (n + 4) / 4 - i / 4, 0, 1); return { a: Math.min(1, q * 3), y: -(1 - bounce(q)) * 3 }; } },
    { id: 'rise', name: '逐字升起', each: true, f: (p, i, n) => { const q = clamp(p * (n + 4) / 4 - i / 4, 0, 1); return { a: q, y: (1 - easeOut(q)) * 1.5 }; } },
    { id: 'popchars', name: '逐字彈出', each: true, f: (p, i, n) => { const q = clamp(p * (n + 4) / 4 - i / 4, 0, 1); return { a: Math.min(1, q * 3), s: easeBack(q) }; } },
    { id: 'spinchars', name: '逐字旋轉', each: true, f: (p, i, n) => { const q = clamp(p * (n + 4) / 4 - i / 4, 0, 1); return { a: q, r: (1 - easeOut(q)) * Math.PI }; } },
    { id: 'scatter', name: '四散聚合', each: true, f: (p, i) => { const q = easeOut(p); return { a: p, x: (R(i + 1) - 0.5) * 16 * (1 - q), y: (R(i + 7) - 0.5) * 10 * (1 - q), r: (R(i + 3) - 0.5) * 3 * (1 - q) }; } },
    { id: 'wavein', name: '波浪進場', each: true, f: (p, i, n) => { const q = clamp(p * 2 - i / n, 0, 1); return { a: q, y: Math.sin((1 - q) * 6) * (1 - q) * 2 }; } },
    { id: 'flip', name: '翻轉出現', f: (p) => ({ a: p, sx: Math.max(0.02, easeOut(p)) }) },
    { id: 'stretch', name: '拉伸出現', f: (p) => ({ a: p, sy: Math.max(0.02, easeBack(p)) }) },
    { id: 'flicker', name: '閃爍出現', f: (p) => ({ a: p > 0.9 ? 1 : (Math.sin(p * 60) > 0 ? p : 0.1) }) },
    { id: 'glow', name: '發光出現', f: (p) => ({ a: p, glow: (1 - p) * 2 }) },
  ];
  // 持續動畫（整段顯示期間）
  FA.TEXT_LOOPS = [
    { id: 'none', name: '無' },
    { id: 'float', name: '輕輕飄浮', f: (t) => ({ y: Math.sin(t * 2) * 0.12 }) },
    { id: 'pulse', name: '心跳縮放', f: (t) => ({ s: 1 + Math.sin(t * 5) * 0.05 }) },
    { id: 'wave', name: '文字波浪', each: true, f: (t, i) => ({ y: Math.sin(t * 4 - i * 0.6) * 0.15 }) },
    { id: 'rainbow', name: '彩虹變色', each: true, f: (t, i) => ({ hue: (t * 90 + i * 25) % 360 }) },
    { id: 'shake', name: '微微晃動', f: (t) => ({ r: Math.sin(t * 9) * 0.03 }) },
    { id: 'blink', name: '閃亮', f: (t) => ({ a: 0.75 + 0.25 * Math.sin(t * 6) }) },
    { id: 'zoomslow', name: '慢慢放大', f: (t, i, n, d) => ({ s: 1 + 0.12 * (t / Math.max(d, 0.1)) }) },
    { id: 'scroll', name: '向上捲動（片尾名單）', scroll: true },
  ];
  FA.TEXT_ANIM_BY = Object.fromEntries(FA.TEXT_ANIMS.map((a) => [a.id, a]));
  FA.TEXT_LOOP_BY = Object.fromEntries(FA.TEXT_LOOPS.map((a) => [a.id, a]));

  // ------------------------------------------------------------ 場景特效（粒子）
  function particles(ctx, W, H, t, dur, n, seed, drawOne) {
    for (let i = 0; i < n; i++) drawOne(i, R(seed + i * 3.1), R(seed + i * 7.7), R(seed + i * 1.3), R(seed + i * 5.9));
  }
  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
    ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
    ctx.fill();
  }
  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.42 : r, a = (k * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  function petal(ctx, x, y, s, rot, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  // 落下型：y 隨時間往下、x 左右擺
  function falling(ctx, W, H, t, amount, speed, sizeF, draw, seed = 1) {
    const n = Math.round(30 * amount);
    for (let i = 0; i < n; i++) {
      const a = R(seed + i * 3.1), b = R(seed + i * 7.7), c = R(seed + i * 1.3);
      const sp = (0.08 + c * 0.12) * speed;
      const y = ((b + t * sp) % 1.15) - 0.08;
      const x = a + Math.sin(t * (0.6 + c) + i) * 0.03;
      draw(x * W, y * H, sizeF(c) * H, t * (0.5 + c) + i, i, c);
    }
  }
  // 上升型
  function rising(ctx, W, H, t, amount, speed, sizeF, draw, seed = 2) {
    falling(ctx, W, H, t, amount, speed, sizeF, (x, y, s, r, i, c) => draw(x, H - y, s, r, i, c), seed);
  }
  FA.SCENES = [
    { id: 'snow', name: '雪花紛飛', draw(ctx, W, H, t, d, am) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      falling(ctx, W, H, t, am * 2, 0.7, (c) => 0.004 + c * 0.008, (x, y, s) => { ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill(); });
    } },
    { id: 'hearts', name: '愛心飄落', draw(ctx, W, H, t, d, am) {
      falling(ctx, W, H, t, am, 0.6, (c) => 0.02 + c * 0.025, (x, y, s, r, i, c) => {
        ctx.fillStyle = ['rgba(255,82,120,0.85)', 'rgba(255,150,190,0.85)', 'rgba(230,30,80,0.8)'][i % 3];
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(r) * 0.4); heartPath(ctx, 0, -s / 2, s); ctx.restore();
      });
    } },
    { id: 'heartsup', name: '愛心上升', draw(ctx, W, H, t, d, am) {
      rising(ctx, W, H, t, am, 0.6, (c) => 0.02 + c * 0.03, (x, y, s, r, i) => {
        ctx.fillStyle = ['rgba(255,82,120,0.8)', 'rgba(255,170,200,0.8)'][i % 2];
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(r) * 0.3); heartPath(ctx, 0, -s / 2, s); ctx.restore();
      });
    } },
    { id: 'bubbles', name: '泡泡', draw(ctx, W, H, t, d, am) {
      rising(ctx, W, H, t, am, 0.5, (c) => 0.012 + c * 0.03, (x, y, s) => {
        const g = ctx.createRadialGradient(x - s * 0.3, y - s * 0.3, s * 0.1, x, y, s);
        g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.7, 'rgba(180,230,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0.55)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
      });
    } },
    { id: 'sakura', name: '櫻花飄落', draw(ctx, W, H, t, d, am) {
      falling(ctx, W, H, t, am, 0.55, (c) => 0.008 + c * 0.01, (x, y, s, r, i) => petal(ctx, x, y, s, r, i % 2 ? 'rgba(255,183,197,0.9)' : 'rgba(255,214,224,0.9)'));
    } },
    { id: 'leaves', name: '楓葉飄落', draw(ctx, W, H, t, d, am) {
      falling(ctx, W, H, t, am * 0.8, 0.5, (c) => 0.012 + c * 0.012, (x, y, s, r, i) => petal(ctx, x, y, s, r, ['rgba(230,81,0,0.9)', 'rgba(255,160,0,0.9)', 'rgba(191,54,12,0.9)'][i % 3]));
    } },
    { id: 'stars', name: '星光閃爍', draw(ctx, W, H, t, d, am) {
      const n = Math.round(40 * am);
      for (let i = 0; i < n; i++) {
        const a = 0.5 + 0.5 * Math.sin(t * (2 + R(i * 3) * 3) + i);
        ctx.fillStyle = 'rgba(255,250,210,' + (a * 0.9).toFixed(3) + ')';
        star(ctx, R(i * 1.7 + 1) * W, R(i * 2.3 + 2) * H, (0.004 + R(i * 5) * 0.01) * H * (0.6 + a * 0.6));
      }
    } },
    { id: 'confetti', name: '彩色紙花', draw(ctx, W, H, t, d, am) {
      const cols = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#e040fb', '#ff6e40'];
      falling(ctx, W, H, t, am * 2, 0.9, (c) => 0.006 + c * 0.006, (x, y, s, r, i) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(r * 3); ctx.scale(1, Math.cos(r * 4)); ctx.fillStyle = cols[i % cols.length];
        ctx.fillRect(-s, -s * 0.5, s * 2, s); ctx.restore();
      });
    } },
    { id: 'fireflies', name: '螢火蟲', draw(ctx, W, H, t, d, am) {
      const n = Math.round(30 * am);
      for (let i = 0; i < n; i++) {
        const x = (R(i + 1) + Math.sin(t * 0.3 + i) * 0.05) * W, y = (R(i + 9) + Math.cos(t * 0.4 + i * 2) * 0.05) * H;
        const a = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2 + i * 1.7));
        const g = ctx.createRadialGradient(x, y, 0, x, y, H * 0.02);
        g.addColorStop(0, 'rgba(220,255,120,' + a + ')'); g.addColorStop(1, 'rgba(220,255,120,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, H * 0.02, 0, 7); ctx.fill();
      }
    } },
    { id: 'rain', name: '下雨', draw(ctx, W, H, t, d, am) {
      ctx.strokeStyle = 'rgba(200,220,255,0.5)'; ctx.lineWidth = Math.max(1, H / 600);
      const n = Math.round(80 * am);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = R(i + 3) * W * 1.1, y = ((R(i + 5) + t * (1.2 + R(i) * 0.6)) % 1.1) * H;
        ctx.moveTo(x, y); ctx.lineTo(x - H * 0.01, y + H * 0.04);
      }
      ctx.stroke();
    } },
    { id: 'balloons', name: '氣球上升', draw(ctx, W, H, t, d, am) {
      const cols = ['#ef5350', '#ffca28', '#42a5f5', '#66bb6a', '#ab47bc', '#ff7043'];
      rising(ctx, W, H, t, am * 0.4, 0.45, (c) => 0.035 + c * 0.02, (x, y, s, r, i) => {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y + s * 1.2); ctx.quadraticCurveTo(x + Math.sin(r) * s * 0.4, y + s * 2, x, y + s * 2.8); ctx.stroke();
        const g = ctx.createRadialGradient(x - s * 0.3, y - s * 0.4, s * 0.1, x, y, s * 1.2);
        g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(0.3, cols[i % cols.length]); g.addColorStop(1, cols[i % cols.length]);
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, s, s * 1.2, 0, 0, 7); ctx.fill();
      }, 5);
    } },
    { id: 'fireworks', name: '煙火', draw(ctx, W, H, t, d, am) {
      const cols = ['#ffeb3b', '#ff5252', '#40c4ff', '#69f0ae', '#e040fb', '#ffffff'];
      const n = Math.max(1, Math.round(4 * am));
      for (let k = 0; k < n; k++) {
        const period = 2.2 + R(k) * 1.2, ph = (t + R(k + 4) * period) % period, cycle = Math.floor((t + R(k + 4) * period) / period);
        const cx = (0.15 + R(k * 13 + cycle) * 0.7) * W, cy = (0.15 + R(k * 17 + cycle) * 0.35) * H;
        if (ph > 1.6) continue;
        const p = ph / 1.6, rad = easeOut(p) * H * (0.15 + R(k + cycle) * 0.1), alpha = 1 - p;
        ctx.fillStyle = cols[(k + cycle) % cols.length];
        ctx.globalAlpha = alpha;
        for (let j = 0; j < 36; j++) {
          const a = (j / 36) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad + p * p * H * 0.05, H * 0.004, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    } },
    { id: 'bokeh', name: '光斑散景', draw(ctx, W, H, t, d, am) {
      const n = Math.round(18 * am);
      for (let i = 0; i < n; i++) {
        const x = (R(i + 11) + Math.sin(t * 0.15 + i) * 0.04) * W, y = (R(i + 21) + Math.cos(t * 0.12 + i) * 0.04) * H;
        const s = (0.03 + R(i + 31) * 0.06) * H, a = 0.12 + 0.12 * Math.sin(t + i);
        const hue = [40, 200, 330, 50][i % 4];
        ctx.fillStyle = 'hsla(' + hue + ',90%,75%,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
      }
    } },
    { id: 'gold', name: '金粉飄落', draw(ctx, W, H, t, d, am) {
      falling(ctx, W, H, t, am * 2.5, 0.35, (c) => 0.002 + c * 0.004, (x, y, s, r, i) => {
        ctx.fillStyle = 'rgba(255,215,90,' + (0.5 + 0.5 * Math.sin(r * 5)).toFixed(3) + ')'; star(ctx, x, y, s * 2);
      }, 9);
    } },
    { id: 'meteor', name: '流星', draw(ctx, W, H, t, d, am) {
      const n = Math.max(1, Math.round(3 * am));
      for (let k = 0; k < n; k++) {
        const period = 2.5 + R(k) * 2, ph = ((t + R(k + 2) * period) % period) / 1.2;
        if (ph > 1) continue;
        const cyc = Math.floor((t + R(k + 2) * period) / period);
        const x0 = (0.3 + R(k * 7 + cyc) * 0.8) * W, y0 = R(k * 5 + cyc) * H * 0.4;
        const x = x0 - ph * W * 0.4, y = y0 + ph * H * 0.3;
        const g = ctx.createLinearGradient(x, y, x + W * 0.12, y - H * 0.09);
        g.addColorStop(0, 'rgba(255,255,255,' + (1 - ph) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = H * 0.004; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + W * 0.12, y - H * 0.09); ctx.stroke();
      }
    } },
    { id: 'oldfilm', name: '老電影', draw(ctx, W, H, t, d, am) {
      const f = Math.floor(t * 12);
      ctx.fillStyle = 'rgba(40,25,10,' + (0.06 + 0.04 * R(f)) + ')'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      for (let k = 0; k < 3 * am; k++) {
        if (R(f * 3 + k) > 0.6) continue;
        const x = R(f * 7 + k) * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (R(f + k) - 0.5) * 8, H); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      for (let k = 0; k < 6 * am; k++) { if (R(f * 11 + k) > 0.3) continue; ctx.beginPath(); ctx.arc(R(f * 13 + k) * W, R(f * 17 + k) * H, 1 + R(k + f) * 3, 0, 7); ctx.fill(); }
    } },
    { id: 'lightleak', name: '漏光', draw(ctx, W, H, t, d, am) {
      const x = (0.5 + Math.sin(t * 0.4) * 0.6) * W, y = (0.3 + Math.cos(t * 0.3) * 0.4) * H;
      const g = ctx.createRadialGradient(x, y, 0, x, y, W * 0.6);
      g.addColorStop(0, 'rgba(255,170,60,' + (0.35 * am).toFixed(3) + ')'); g.addColorStop(0.5, 'rgba(255,80,60,' + (0.12 * am).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,80,60,0)');
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    } },
    { id: 'butterflies', name: '蝴蝶飛舞', draw(ctx, W, H, t, d, am) {
      const n = Math.round(6 * am);
      for (let i = 0; i < n; i++) {
        const x = ((R(i + 1) + t * (0.03 + R(i + 2) * 0.04)) % 1.2 - 0.1) * W, y = (R(i + 5) * 0.8 + Math.sin(t * 1.5 + i) * 0.05) * H;
        const s = (0.015 + R(i + 9) * 0.015) * H, flap = Math.abs(Math.sin(t * 10 + i));
        ctx.fillStyle = ['rgba(255,152,0,0.85)', 'rgba(156,39,176,0.8)', 'rgba(3,169,244,0.8)'][i % 3];
        ctx.save(); ctx.translate(x, y);
        ctx.beginPath(); ctx.ellipse(-s * 0.6 * flap, 0, s * flap, s * 0.7, -0.4, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(s * 0.6 * flap, 0, s * flap, s * 0.7, 0.4, 0, 7); ctx.fill();
        ctx.restore();
      }
    } },
  ];
  FA.SCENE_BY = Object.fromEntries(FA.SCENES.map((s) => [s.id, s]));

  // ------------------------------------------------------------ 片頭片尾背景
  FA.CARD_BGS = [
    { id: 'black', name: '黑色', c: ['#000000', '#000000'] },
    { id: 'night', name: '夜空藍', c: ['#0f2027', '#2c5364'] },
    { id: 'sunset', name: '夕陽', c: ['#ff7e5f', '#feb47b'] },
    { id: 'love', name: '浪漫粉', c: ['#ff9a9e', '#fecfef'] },
    { id: 'wedding', name: '香檳白', c: ['#fdfbf6', '#e9d8b4'] },
    { id: 'baby', name: '寶寶藍', c: ['#a1c4fd', '#c2e9fb'] },
    { id: 'girl', name: '寶寶粉', c: ['#fbc2eb', '#fde6f2'] },
    { id: 'mint', name: '薄荷綠', c: ['#a8edea', '#d6f5e3'] },
    { id: 'forest', name: '森林', c: ['#134e5e', '#71b280'] },
    { id: 'ocean', name: '海洋', c: ['#2193b0', '#6dd5ed'] },
    { id: 'gold', name: '金色', c: ['#3a2c0a', '#b8860b'] },
    { id: 'red', name: '喜氣紅', c: ['#8e0e00', '#e52d27'] },
    { id: 'xmas', name: '聖誕綠', c: ['#0b3d20', '#1e7a46'] },
    { id: 'purple', name: '紫羅蘭', c: ['#41295a', '#2f0743'] },
    { id: 'vintage', name: '復古米', c: ['#d7c4a3', '#a68a64'] },
    { id: 'white', name: '白色', c: ['#ffffff', '#eeeeee'] },
    { id: 'rainbow', name: '彩虹', c: ['#ff9a9e', '#fad0c4', '#fbc2eb', '#a1c4fd', '#c2e9fb'] },
  ];
  FA.CARD_BG_BY = Object.fromEntries(FA.CARD_BGS.map((c) => [c.id, c]));

  // ------------------------------------------------------------ 影片風格（一鍵套用）
  // trans：轉場輪流使用；dur：每張秒數；td：轉場秒數；motion；fx；frame；scene；card：片頭片尾背景；
  // text：文字樣式；anim：文字進場；clip：剪貼畫（放在片頭）；intro／credit：片頭片尾文字
  const S = (id, cat, name, o) => Object.assign({ id, cat, name, dur: 5, td: 1.2, motion: 'auto', fx: 'none', frame: 'none', scene: '', card: 'black', text: 'plain', anim: 'fade', clip: [], three: false }, o);
  FA.STYLE_CATS = [
    { id: 'love', name: '愛情婚禮' }, { id: 'baby', name: '寶寶兒童' }, { id: 'party', name: '生日派對' },
    { id: 'travel', name: '旅遊' }, { id: 'festival', name: '節慶' }, { id: 'family', name: '家庭生活' },
    { id: 'retro', name: '懷舊' }, { id: 'simple', name: '簡約' }, { id: '3d', name: '3D 動感' }, { id: 'school', name: '畢業學校' },
  ];
  FA.STYLES = [
    S('wedding1', 'love', '浪漫婚禮', { trans: ['Fade', 'HeartWipe', 'Dreamy', 'BokehDissolve'], scene: 'hearts', card: 'wedding', text: 'wedding', anim: 'letters', frame: 'white', clip: ['ring', 'heartribbon'], intro: '我們結婚了', credit: '謝謝您的祝福' }),
    S('wedding2', 'love', '香檳金典', { trans: ['GlowDissolve', 'Fade', 'LightWipe', 'BloomDissolve'], scene: 'gold', card: 'gold', text: 'gold', anim: 'glow', fx: 'gold', frame: 'gold', clip: ['bouquet'], intro: 'Happy Wedding', credit: '永浴愛河' }),
    S('love1', 'love', '甜蜜愛戀', { trans: ['HeartWipe', 'Fade', 'Swirl', 'DreamyZoom'], scene: 'heartsup', card: 'love', text: 'love', anim: 'pop', frame: 'heart', clip: ['hearts', 'kiss'], intro: '我們的愛', credit: '愛你一萬年' }),
    S('love2', 'love', '粉色告白', { trans: ['BokehDissolve', 'FlowerWipe', 'Fade', 'Blossom'], scene: 'sakura', card: 'love', text: 'candy', anim: 'drop', fx: 'pink', clip: ['loveletter'], intro: '給最愛的你', credit: 'Love you' }),
    S('anniv', 'love', '結婚紀念日', { trans: ['Fade', 'InvertedPageCurl', 'GlowDissolve'], scene: 'bokeh', card: 'purple', text: 'elegant', anim: 'blur', frame: 'polaroid', clip: ['rose'], intro: '結婚紀念日快樂', credit: '一起走過的每一天' }),
    S('baby1', 'baby', '寶寶成長（男孩）', { trans: ['CircleOpen', 'Bounce', 'PopIn', 'Swap'], scene: 'bubbles', card: 'baby', text: 'bubble', anim: 'popchars', frame: 'dots', clip: ['baby', 'teddy'], intro: '寶貝長大了', credit: '健康快樂長大' }),
    S('baby2', 'baby', '寶寶成長（女孩）', { trans: ['HeartWipe', 'CircleOpen', 'Bounce', 'BokehDissolve'], scene: 'sakura', card: 'girl', text: 'candy', anim: 'popchars', frame: 'dots', clip: ['babybottle', 'rainbow'], intro: '小公主的成長日記', credit: '爸爸媽媽愛你' }),
    S('kids', 'baby', '童趣歡樂', { trans: ['Bounce', 'PopIn', 'Pinwheel', 'Puzzle', 'Swap'], scene: 'balloons', card: 'rainbow', text: 'kids', anim: 'bounce', frame: 'dots', dur: 4, clip: ['kite', 'carousel'], intro: '快樂童年', credit: '天天開心' }),
    S('school1', 'baby', '幼兒園時光', { trans: ['Puzzle', 'PopIn', 'GridFlip'], scene: 'stars', card: 'mint', text: 'kids', anim: 'drop', frame: 'round', clip: ['crayon', 'abc'], intro: '幼兒園的日子', credit: '畢業快樂' }),
    S('bday1', 'party', '生日快樂', { trans: ['Swap', 'PopIn', 'CircleBurst', 'Cube'], scene: 'confetti', card: 'sunset', text: 'rainbow', anim: 'popchars', frame: 'white', clip: ['cake', 'balloon'], intro: '生日快樂', credit: '祝你天天開心' }),
    S('bday2', 'party', '派對狂歡', { trans: ['GlitchFlicker', 'CrossZoom', 'WhipPan', 'Swap'], scene: 'fireworks', card: 'purple', text: 'neonpink', anim: 'zoomout', dur: 3.5, td: 0.7, clip: ['party', 'partyface'], intro: 'PARTY TIME', credit: '下次再一起嗨' }),
    S('bday3', 'party', '長輩壽宴', { trans: ['Fade', 'GlowDissolve', 'InvertedPageCurl'], scene: 'gold', card: 'red', text: 'red', anim: 'letters', frame: 'gold', clip: ['cake', 'crown'], intro: '福如東海 壽比南山', credit: '祝您身體健康' }),
    S('travel1', 'travel', '旅行日記', { trans: ['Directional', 'SlideProjector', 'Swap', 'PaperPlane'], card: 'ocean', text: 'ocean', anim: 'left', frame: 'polaroid', clip: ['plane', 'luggage'], intro: '旅行日記', credit: '下一站見' }),
    S('travel2', 'travel', '海島假期', { trans: ['WaterDrop', 'Ripple', 'WaveWipe', 'Directional'], scene: 'bubbles', card: 'ocean', text: 'ocean', anim: 'wavein', fx: 'vivid', clip: ['beach', 'palm'], intro: '夏日海島', credit: 'Summer Vacation' }),
    S('travel3', 'travel', '山林露營', { trans: ['LeafWipe', 'Fade', 'Wind', 'DirectionalWarp'], scene: 'fireflies', card: 'forest', text: 'forest', anim: 'rise', fx: 'forest', clip: ['camping', 'mountain'], intro: '山林之旅', credit: '大自然真美' }),
    S('travel4', 'travel', '城市漫遊', { trans: ['WhipPan', 'SlideAwayRight', 'Directional', 'GridFlip'], card: 'night', text: 'magazine', anim: 'right', frame: 'film', dur: 4, clip: ['camera'], intro: 'City Walk', credit: '城市的回憶' }),
    S('xmas', 'festival', '聖誕快樂', { trans: ['Snowflake', 'Fade', 'StarWipe', 'Cube'], scene: 'snow', card: 'xmas', text: 'christmas', anim: 'drop', frame: 'snow', clip: ['tree', 'snowman'], intro: 'Merry Christmas', credit: '聖誕快樂 新年快樂' }),
    S('cny', 'festival', '新春團圓', { trans: ['Fade', 'Pinwheel', 'CircleOpen', 'GlowDissolve'], scene: 'fireworks', card: 'red', text: 'red', anim: 'pop', frame: 'gold', clip: ['lantern', 'redenv'], intro: '新年快樂 萬事如意', credit: '恭喜發財' }),
    S('moon', 'festival', '中秋團圓', { trans: ['Fade', 'CircleIris', 'Dreamy'], scene: 'stars', card: 'night', text: 'gold', anim: 'letters', clip: ['moon', 'mooncake'], intro: '中秋節快樂', credit: '月圓人團圓' }),
    S('halloween', 'festival', '萬聖節', { trans: ['GlitchMemories', 'Fade', 'BurnThrough'], scene: 'meteor', card: 'purple', text: 'fire', anim: 'flicker', fx: 'night', clip: ['pumpkin'], intro: 'Happy Halloween', credit: '不給糖就搗蛋' }),
    S('mother', 'festival', '母親節', { trans: ['FlowerWipe', 'Fade', 'BokehDissolve'], scene: 'sakura', card: 'love', text: 'love', anim: 'letters', frame: 'heart', clip: ['bouquet', 'heart'], intro: '媽媽我愛您', credit: '母親節快樂' }),
    S('father', 'festival', '父親節', { trans: ['Directional', 'Cube', 'Fade'], card: 'night', text: 'gold', anim: 'zoomin', frame: 'wood', clip: ['trophy'], intro: '爸爸辛苦了', credit: '父親節快樂' }),
    S('family1', 'family', '溫馨家庭', { trans: ['Fade', 'Dreamy', 'InvertedPageCurl', 'CircleOpen'], scene: 'bokeh', card: 'sunset', text: 'plain', anim: 'letters', frame: 'polaroid', clip: ['people', 'house'], intro: '我們這一家', credit: '家，是最溫暖的地方' }),
    S('family2', 'family', '週末出遊', { trans: ['Swap', 'Directional', 'PaperPlane', 'Bounce'], scene: 'butterflies', card: 'mint', text: 'kids', anim: 'bounce', clip: ['car', 'sun'], intro: '快樂週末', credit: '下次再出發' }),
    S('pet', 'family', '毛小孩', { trans: ['Bounce', 'PopIn', 'HeartWipe', 'Swap'], scene: 'heartsup', card: 'mint', text: 'bubble', anim: 'popchars', frame: 'round', clip: ['dog', 'cat'], intro: '我的毛小孩', credit: '永遠的好朋友' }),
    S('grand', 'family', '祖孫情', { trans: ['Fade', 'FadeGrayscale', 'GlowDissolve'], card: 'vintage', text: 'retro', anim: 'letters', fx: 'warm', frame: 'polaroid', clip: ['grandma', 'grandpa'], intro: '阿公阿嬤', credit: '謝謝您們的愛' }),
    S('retro1', 'retro', '老照片回憶', { trans: ['FilmBurn', 'FadeGrayscale', 'FilmDissolve', 'Fade'], scene: 'oldfilm', card: 'vintage', text: 'retro', anim: 'type', fx: 'old', frame: 'film', clip: [], intro: '那些年', credit: '回憶永存' }),
    S('retro2', 'retro', '黑白經典', { trans: ['Fade', 'FadeColor', 'FilmLeader'], scene: 'oldfilm', card: 'black', text: 'elegant', anim: 'fade', fx: 'gray', frame: 'vignette', intro: '黑白歲月', credit: 'The End' }),
    S('retro3', 'retro', '復古錄影帶', { trans: ['VhsTracking', 'TvRoll', 'GlitchBands', 'TvStatic'], card: 'black', text: 'neonblue', anim: 'flicker', fx: 'fade', dur: 4, intro: 'PLAY ▶', credit: 'STOP ■' }),
    S('simple1', 'simple', '簡約淡入淡出', { trans: ['Fade'], card: 'black', text: 'plain', anim: 'fade', motion: 'none' }),
    S('simple2', 'simple', '輕鬆推移', { trans: ['Directional'], card: 'white', text: 'black', anim: 'left', motion: 'zoomin' }),
    S('simple3', 'simple', '優雅白框', { trans: ['Fade', 'CrossZoom'], card: 'white', text: 'black', anim: 'blur', frame: 'white' }),
    S('simple4', 'simple', '雜誌風', { trans: ['SlideAwayRight', 'Directional', 'InsetWipe'], card: 'white', text: 'magazine', anim: 'right', frame: 'round', dur: 4 }),
    S('cube3d', '3d', '3D 方塊', { three: true, trans: ['Cube', 'InsideCube', 'PuzzleCube', 'Doorway'], card: 'night', text: '3d', anim: 'flip', dur: 4.5, intro: '精彩回顧', credit: 'The End' }),
    S('book3d', '3d', '3D 翻書相簿', { three: true, trans: ['BookFlip', 'InvertedPageCurl', 'PaperFold', 'Accordion'], card: 'vintage', text: 'retro', anim: 'letters', frame: 'polaroid', intro: '我們的相簿', credit: '未完待續' }),
    S('sphere3d', '3d', '3D 球體空間', { three: true, trans: ['Sphere', 'Globe', 'Tunnel', 'Wormhole'], scene: 'stars', card: 'purple', text: 'neonblue', anim: 'zoomout', intro: '時空之旅', credit: '再會' }),
    S('flip3d', '3d', '3D 翻轉卡片', { three: true, trans: ['SimpleFlip', 'GridFlip', 'QuadTurn', 'TriangleFlip', 'CardSwipe'], card: 'ocean', text: 'silver', anim: 'flip', dur: 4 }),
    S('dyn3d', '3d', '3D 動感節奏', { three: true, trans: ['Doorway', 'Revolve', 'Swap', 'CylinderRoll', 'Tumble'], scene: 'lightleak', card: 'black', text: 'fire', anim: 'zoomout', dur: 3, td: 0.8, intro: 'HIGHLIGHT', credit: 'THANK YOU' }),
    S('grad1', 'school', '畢業典禮', { trans: ['Fade', 'CircleOpen', 'StarWipe', 'PaperPlane'], scene: 'confetti', card: 'night', text: 'gold', anim: 'pop', frame: 'white', clip: ['graduation', 'diploma'], intro: '畢業快樂', credit: '前程似錦' }),
    S('sport', 'school', '運動會', { trans: ['WhipPan', 'CrossZoom', 'SpeedLines', 'Swap'], card: 'sunset', text: 'kids', anim: 'zoomout', dur: 3.5, td: 0.6, clip: ['medal', 'soccer'], intro: '運動會', credit: '大家都是冠軍' }),
  ];
  FA.STYLE_BY = Object.fromEntries(FA.STYLES.map((s) => [s.id, s]));

  // ------------------------------------------------------------ 音效（程式即時合成，沒有版權問題）
  FA.SFX = [
    { id: 'chime', name: '叮咚', dur: 1.6 }, { id: 'bell', name: '鈴聲', dur: 2.2 }, { id: 'pop', name: '啵', dur: 0.4 },
    { id: 'whoosh', name: '咻', dur: 0.9 }, { id: 'applause', name: '掌聲', dur: 3.5 }, { id: 'drum', name: '鼓聲', dur: 1.4 },
    { id: 'magic', name: '魔法閃亮', dur: 1.8 }, { id: 'camera', name: '快門', dur: 0.5 }, { id: 'heartbeat', name: '心跳', dur: 2.0 },
    { id: 'birds', name: '鳥叫', dur: 3.0 }, { id: 'waves', name: '海浪', dur: 5.0 }, { id: 'tada', name: '登登！', dur: 1.5 },
  ];
  FA.SFX_BY = Object.fromEntries(FA.SFX.map((s) => [s.id, s]));
})();
