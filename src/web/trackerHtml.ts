import { PUCK_MOTION_MODULE_SCRIPT } from './puckMotionModule';

type TrackerConfig = {
  relayUrl: string;
  room: string;
  fieldLengthCm: number;
  fieldWidthCm: number;
  puckDiameterCm: number;
};

export function buildTrackerHtml(config: TrackerConfig): string {
  const safeConfig = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<title>Hockey Runner Tracker</title>
<style>
  :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #020617; color: #f8fafc; }
  #root { position: fixed; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr) 340px; }
  #stage { position: relative; min-width: 0; min-height: 0; background: radial-gradient(circle at 50% 20%, #172554 0, #020617 68%); overflow: hidden; }
  video, #overlay { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
  video { transform: translateZ(0); background: #000; }
  #overlay { touch-action: none; }
  #panel { border-left: 1px solid #20304b; background: #08111f; padding: 14px; overflow: auto; box-sizing: border-box; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .small { color: #94a3b8; font-size: 12px; line-height: 17px; }
  .pill { display: inline-block; padding: 5px 8px; border-radius: 999px; font-size: 12px; font-weight: 800; margin: 3px 4px 3px 0; background: #0f172a; border: 1px solid #2b4263; }
  .ok { color: #86efac; } .warn { color: #fde68a; } .bad { color: #fca5a5; }
  button { width: 100%; border: 0; border-radius: 12px; padding: 12px 10px; margin: 6px 0; background: #38bdf8; color: #06101f; font-weight: 900; font-size: 15px; }
  button.secondary { background: #0f172a; color: #e0f2fe; border: 1px solid #38bdf8; }
  .metric { display: grid; grid-template-columns: 128px 1fr; gap: 6px; font-size: 13px; margin: 6px 0; }
  .metric b { color: #93c5fd; }
  #log { height: 132px; overflow: auto; background: #06101f; border: 1px solid #1e293b; border-radius: 12px; padding: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 16px; white-space: pre-wrap; }
  @media (max-width: 760px) {
    #root { display: block; }
    #stage { position: absolute; inset: 0; }
    #panel {
      position: absolute;
      left: 8px;
      right: 8px;
      bottom: 8px;
      max-height: 30vh;
      border-left: 0;
      border-top: 1px solid #20304b;
      border-radius: 16px;
      background: rgba(8,17,31,0.86);
      backdrop-filter: blur(8px);
      padding: 10px;
    }
    #panel h1 { display: none; }
    #panel .small { font-size: 11px; line-height: 14px; }
    #panel .metric { display: none; }
    #log { height: 54px; }
    button { width: auto; min-width: 31%; padding: 10px 8px; margin: 3px; font-size: 12px; }
    .pill { font-size: 11px; padding: 4px 6px; }
  }
</style>
</head>
<body>
<div id="root">
  <div id="stage">
    <video id="video" playsinline muted autoplay></video>
    <canvas id="overlay"></canvas>
  </div>
  <div id="panel">
    <h1>Телефон‑трекер</h1>
    <div class="small">Порядок калибровки: нажмите 4 угла светлого поля на видео: верх‑лево → верх‑право → низ‑право → низ‑лево.</div>
    <button id="cameraBtn">1. Включить камеру</button>
    <button id="clearBtn" class="secondary">Очистить углы поля</button>
    <button id="wsBtn" class="secondary">Переподключить relay</button>
    <div><span id="cameraStatus" class="pill warn">camera: off</span><span id="wsStatus" class="pill warn">ws: off</span><span id="calibStatus" class="pill warn">calib: 0/4</span></div>
    <div class="metric"><b>Комната</b><span id="room"></span></div>
    <div class="metric"><b>Relay</b><span id="relay"></span></div>
    <div class="metric"><b>Поле</b><span id="field"></span></div>
    <div class="metric"><b>Шайба</b><span id="puck"></span></div>
    <div class="metric"><b>Команда</b><span id="cmd">neutral</span></div>
    <div class="metric"><b>X / Y</b><span id="xy">—</span></div>
    <div class="metric"><b>Скорость</b><span id="motionSpeed">—</span></div>
    <div class="metric"><b>Причина</b><span id="motionReason">—</span></div>
    <div class="metric"><b>Уверенность</b><span id="conf">—</span></div>
    <div class="small" style="margin:8px 0">Фильтр от клюшки: выбирается темный компонент с круглой формой, ожидаемым размером шайбы и нормальным fill‑ratio; вытянутые объекты отбрасываются.</div>
    <div id="log"></div>
  </div>
</div>
<canvas id="work" style="display:none"></canvas>
<script>
window.HR_CONFIG = ${safeConfig};
</script>
<script>
${PUCK_MOTION_MODULE_SCRIPT}
</script>
<script>
(function () {
  var cfg = window.HR_CONFIG;
  var video = document.getElementById('video');
  var overlay = document.getElementById('overlay');
  var ctx = overlay.getContext('2d');
  var work = document.getElementById('work');
  var wctx = work.getContext('2d', { willReadFrequently: true });
  var points = [];
  var stream = null;
  var nativeWsConnected = false;
  var homography = null;
  var lastFrameAt = 0;
  var smooth = null;
  var lastSendAt = 0;
  var lastGoodAt = 0;
  var fieldPolygonSmall = [];
  var displayTrail = [];
  var lastMotionResult = null;
  var motion = window.HockeyRunnerPuckMotion.create({
    maxPoints: 24,
    minConfidence: 0.24,
    minDisplacement: 0.030,
    minPeakSpeed: 0.23,
    cooldownMs: 150,
    holdMs: 170,
    alpha: 0.42
  });

  document.getElementById('room').textContent = cfg.room;
  document.getElementById('relay').textContent = cfg.relayUrl;
  document.getElementById('field').textContent = cfg.fieldLengthCm + ' × ' + cfg.fieldWidthCm + ' см';
  document.getElementById('puck').textContent = cfg.puckDiameterCm + ' см';

  document.getElementById('cameraBtn').addEventListener('click', startCamera);
  document.getElementById('clearBtn').addEventListener('click', function () { points = []; homography = null; smooth = null; displayTrail = []; lastMotionResult = null; motion.reset(); updateCalibStatus(); drawOverlay(); });
  document.getElementById('wsBtn').addEventListener('click', connectWs);
  overlay.addEventListener('pointerdown', onTap);
  window.addEventListener('resize', resizeCanvas);

  resizeCanvas();
  connectWs();
  requestAnimationFrame(loop);

  function log(msg) {
    var el = document.getElementById('log');
    var now = new Date().toLocaleTimeString();
    el.textContent = '[' + now + '] ' + msg + '\\n' + el.textContent.slice(0, 2200);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
  }

  function setPill(id, cls, text) {
    var el = document.getElementById(id);
    el.className = 'pill ' + cls;
    el.textContent = text;
  }

  async function startCamera() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia недоступен в этом WebView');
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      setPill('cameraStatus', 'ok', 'camera: on');
      log('Камера включена');
      resizeCanvas();
    } catch (e) {
      setPill('cameraStatus', 'bad', 'camera: error');
      log('Ошибка камеры: ' + (e && e.message ? e.message : String(e)));
    }
  }

  function postNative(payload) {
    if (!window.ReactNativeWebView) {
      log('Native bridge недоступен');
      return;
    }
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  window.HR_NATIVE_WS = function (event) {
    if (!event || event.channel !== 'hr-ws') return;
    if (event.type === 'status') {
      if (event.status === 'connecting') {
        nativeWsConnected = false;
        setPill('wsStatus', 'warn', 'ws: connecting');
      } else if (event.status === 'connected') {
        nativeWsConnected = true;
        setPill('wsStatus', 'ok', 'ws: connected');
        log('Relay подключен');
      } else if (event.status === 'closed') {
        nativeWsConnected = false;
        setPill('wsStatus', 'bad', 'ws: closed');
        log('Relay закрыт. Проверьте адрес: ' + cfg.relayUrl);
      } else if (event.status === 'error') {
        nativeWsConnected = false;
        setPill('wsStatus', 'bad', 'ws: error');
        log('Relay недоступен: ' + cfg.relayUrl);
      }
    }
  };

  function connectWs() {
    nativeWsConnected = false;
    setPill('wsStatus', 'warn', 'ws: connecting');
    postNative({
      channel: 'hr-ws',
      action: 'connect',
      role: 'tracker',
      room: cfg.room,
      relayUrl: cfg.relayUrl
    });
  }

  function resizeCanvas() {
    var rect = overlay.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    overlay.width = Math.max(1, Math.floor(rect.width * dpr));
    overlay.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOverlay();
  }

  function onTap(ev) {
    if (points.length >= 4) return;
    var rect = overlay.getBoundingClientRect();
    points.push({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
    if (points.length === 4) {
      homography = buildHomography(points, [ {x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1} ]);
      log('Калибровка поля завершена');
    }
    updateCalibStatus();
    drawOverlay();
  }

  function updateCalibStatus() {
    var cls = points.length === 4 ? 'ok' : 'warn';
    setPill('calibStatus', cls, 'calib: ' + points.length + '/4');
  }

  function loop(t) {
    if (t - lastFrameAt > 66) {
      lastFrameAt = t;
      processFrame();
    }
    drawOverlay();
    requestAnimationFrame(loop);
  }

  function processFrame() {
    if (!stream || video.readyState < 2 || points.length !== 4 || !homography) return;
    var vw = video.videoWidth || 1280;
    var vh = video.videoHeight || 720;
    var targetW = 540;
    var targetH = Math.max(1, Math.round(targetW * vh / vw));
    work.width = targetW;
    work.height = targetH;
    wctx.drawImage(video, 0, 0, targetW, targetH);
    var image = wctx.getImageData(0, 0, targetW, targetH);
    var display = getVideoDisplayRect();
    var scaleX = targetW / display.width;
    var scaleY = targetH / display.height;
    fieldPolygonSmall = points.map(function (p) { return { x: (p.x - display.x) * scaleX, y: (p.y - display.y) * scaleY }; });
    var best = findPuck(image, targetW, targetH, fieldPolygonSmall);
    if (!best) {
      if (Date.now() - lastGoodAt > 450) {
        lastMotionResult = motion.update({ x: null, y: null, confidence: 0, ts: Date.now() });
        document.getElementById('cmd').textContent = 'lost';
        document.getElementById('motionSpeed').textContent = '0.00';
        document.getElementById('motionReason').textContent = 'lost';
        document.getElementById('conf').textContent = '0';
        sendInput({ x: null, y: null, cmd: 'lost', confidence: 0, speed: 0, dx: 0, dy: 0, reason: 'lost' });
      }
      return;
    }
    lastGoodAt = Date.now();
    var dispPoint = { x: best.cx / scaleX + display.x, y: best.cy / scaleY + display.y };
    var norm = applyHomography(homography, dispPoint.x, dispPoint.y);
    if (!norm || norm.x < -0.2 || norm.x > 1.2 || norm.y < -0.2 || norm.y > 1.2) return;
    norm.x = Math.max(0, Math.min(1, norm.x));
    norm.y = Math.max(0, Math.min(1, norm.y));
    if (!smooth) smooth = { x: norm.x, y: norm.y };
    smooth.x = smooth.x * 0.70 + norm.x * 0.30;
    smooth.y = smooth.y * 0.70 + norm.y * 0.30;
    var confidence = Math.max(0, Math.min(1, best.score));
    lastMotionResult = motion.update({ x: smooth.x, y: smooth.y, confidence: confidence, ts: Date.now() });
    var cmd = lastMotionResult.cmd;
    displayTrail.push({ x: dispPoint.x, y: dispPoint.y, ts: Date.now() });
    while (displayTrail.length > 24) displayTrail.shift();
    while (displayTrail.length && Date.now() - displayTrail[0].ts > 520) displayTrail.shift();
    document.getElementById('cmd').textContent = cmd + (lastMotionResult.rawCommand !== cmd ? ' / raw ' + lastMotionResult.rawCommand : '');
    document.getElementById('xy').textContent = smooth.x.toFixed(3) + ' / ' + smooth.y.toFixed(3);
    document.getElementById('motionSpeed').textContent = lastMotionResult.speed.toFixed(2);
    document.getElementById('motionReason').textContent = lastMotionResult.reason;
    document.getElementById('conf').textContent = confidence.toFixed(2);
    sendInput({ x: smooth.x, y: smooth.y, cmd: cmd, confidence: confidence, speed: lastMotionResult.speed, dx: lastMotionResult.dx, dy: lastMotionResult.dy, reason: lastMotionResult.reason });
    drawOverlay(best, dispPoint, cmd, lastMotionResult);
  }

  function getVideoDisplayRect() {
    var rect = overlay.getBoundingClientRect();
    var vw = video.videoWidth || 16;
    var vh = video.videoHeight || 9;
    var containerRatio = rect.width / rect.height;
    var videoRatio = vw / vh;
    var width, height, x, y;
    if (videoRatio > containerRatio) {
      width = rect.width;
      height = width / videoRatio;
      x = 0;
      y = (rect.height - height) / 2;
    } else {
      height = rect.height;
      width = height * videoRatio;
      x = (rect.width - width) / 2;
      y = 0;
    }
    return { x: x, y: y, width: width, height: height };
  }

  function sendInput(payload) {
    var now = Date.now();
    if (now - lastSendAt < 33) return;
    lastSendAt = now;
    if (!nativeWsConnected) return;
    postNative({
      channel: 'hr-ws',
      action: 'send',
      payload: {
        type: 'input',
        role: 'tracker',
        room: cfg.room,
        ts: now,
        x: payload.x,
        y: payload.y,
        cmd: payload.cmd,
        confidence: payload.confidence,
        speed: payload.speed || 0,
        dx: payload.dx || 0,
        dy: payload.dy || 0,
        reason: payload.reason || ''
      }
    });
  }

  function findPuck(image, width, height, polygon) {
    var data = image.data;
    var mask = new Uint8Array(width * height);
    var bbox = polyBounds(polygon, width, height);
    for (var y = bbox.minY; y <= bbox.maxY; y++) {
      for (var x = bbox.minX; x <= bbox.maxX; x++) {
        if (!pointInPoly(x, y, polygon)) continue;
        var idx = (y * width + x) * 4;
        var r = data[idx], g = data[idx + 1], b = data[idx + 2];
        var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        var maxc = Math.max(r, g, b);
        var minc = Math.min(r, g, b);
        var saturation = maxc === 0 ? 0 : (maxc - minc) / maxc;
        // Чуть мягче порог: темная шайба может быть не идеально черной из-за бликов и автоэкспозиции.
        if (lum < 118 && saturation < 0.72) mask[y * width + x] = 1;
      }
    }

    var visited = new Uint8Array(width * height);
    var best = null;
    var expected = expectedPuckDiameterPx(polygon);
    var minArea = Math.max(10, Math.PI * Math.pow(expected * 0.18, 2));
    var stackX = [];
    var stackY = [];

    for (var yy = bbox.minY; yy <= bbox.maxY; yy++) {
      for (var xx = bbox.minX; xx <= bbox.maxX; xx++) {
        var start = yy * width + xx;
        if (!mask[start] || visited[start]) continue;
        stackX.length = 0; stackY.length = 0;
        stackX.push(xx); stackY.push(yy); visited[start] = 1;
        var area = 0, sumX = 0, sumY = 0, minX = xx, maxX = xx, minY = yy, maxY = yy;
        while (stackX.length) {
          var cx = stackX.pop();
          var cy = stackY.pop();
          area++; sumX += cx; sumY += cy;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
              var nx = cx + dx, ny = cy + dy;
              if (nx < bbox.minX || nx > bbox.maxX || ny < bbox.minY || ny > bbox.maxY) continue;
              var ni = ny * width + nx;
              if (mask[ni] && !visited[ni]) { visited[ni] = 1; stackX.push(nx); stackY.push(ny); }
            }
          }
        }
        if (area < minArea) continue;
        var bw = Math.max(1, maxX - minX + 1);
        var bh = Math.max(1, maxY - minY + 1);
        var diameter = (bw + bh) / 2;
        var aspect = bw / bh;
        var fill = area / (bw * bh);
        var circleFill = area / (Math.PI * Math.pow(Math.max(bw, bh) / 2, 2));
        var sizeRatio = diameter / expected;
        // Клюшка обычно длинная и тонкая. Шайба ближе к компактному компоненту.
        var sizeOk = sizeRatio > 0.30 && sizeRatio < 2.40;
        var shapeOk = aspect > 0.42 && aspect < 2.35 && fill > 0.16 && fill < 0.98 && circleFill > 0.20 && circleFill < 1.25;
        if (!sizeOk || !shapeOk) continue;
        var score = 1 - Math.min(1, Math.abs(1 - sizeRatio)) * 0.36;
        score += Math.min(0.30, fill * 0.16 + circleFill * 0.18);
        if (!best || score > best.score) {
          best = { cx: sumX / area, cy: sumY / area, area: area, bw: bw, bh: bh, score: score, expected: expected };
        }
      }
    }

    // Если шайба касается клюшки и стала одним вытянутым компонентом, компонентный фильтр может ее отбросить.
    // Тогда используем локальный круговой скан: ищем темный круг ожидаемого радиуса внутри поля.
    var circleBest = findPuckByCircleScan(mask, width, height, bbox, polygon, expected);
    if (circleBest && (!best || circleBest.score > best.score * 0.92)) return circleBest;
    return best;
  }

  function findPuckByCircleScan(mask, width, height, bbox, polygon, expected) {
    var radius = Math.max(4, expected / 2);
    var step = Math.max(3, Math.round(radius / 2.5));
    var best = null;
    for (var y = bbox.minY + radius; y <= bbox.maxY - radius; y += step) {
      for (var x = bbox.minX + radius; x <= bbox.maxX - radius; x += step) {
        if (!pointInPoly(x, y, polygon)) continue;
        var inner = 0, innerDark = 0, outer = 0, outerDark = 0;
        for (var yy = Math.floor(y - radius * 1.45); yy <= Math.ceil(y + radius * 1.45); yy += 2) {
          if (yy < bbox.minY || yy > bbox.maxY) continue;
          for (var xx = Math.floor(x - radius * 1.45); xx <= Math.ceil(x + radius * 1.45); xx += 2) {
            if (xx < bbox.minX || xx > bbox.maxX) continue;
            var dx = xx - x, dy = yy - y;
            var d = Math.sqrt(dx * dx + dy * dy);
            var mi = yy * width + xx;
            if (d <= radius) { inner++; if (mask[mi]) innerDark++; }
            else if (d <= radius * 1.45) { outer++; if (mask[mi]) outerDark++; }
          }
        }
        if (!inner || !outer) continue;
        var innerRatio = innerDark / inner;
        var outerRatio = outerDark / outer;
        var score = innerRatio - outerRatio * 0.55;
        if (innerRatio > 0.34 && score > 0.22 && (!best || score > best.score)) {
          best = { cx: x, cy: y, area: innerDark * 4, bw: radius * 2, bh: radius * 2, score: Math.min(1, score + 0.25), expected: expected };
        }
      }
    }
    return best;
  }

  function expectedPuckDiameterPx(poly) {
    var top = dist(poly[0], poly[1]);
    var bottom = dist(poly[3], poly[2]);
    var left = dist(poly[0], poly[3]);
    var right = dist(poly[1], poly[2]);
    var pxPerCmWidth = ((top + bottom) / 2) / cfg.fieldWidthCm;
    var pxPerCmLength = ((left + right) / 2) / cfg.fieldLengthCm;
    var pxPerCm = (pxPerCmWidth + pxPerCmLength) / 2;
    return Math.max(6, pxPerCm * cfg.puckDiameterCm);
  }

  function polyBounds(poly, width, height) {
    var xs = poly.map(function (p) { return p.x; });
    var ys = poly.map(function (p) { return p.y; });
    return {
      minX: Math.max(0, Math.floor(Math.min.apply(null, xs) - 4)),
      maxX: Math.min(width - 1, Math.ceil(Math.max.apply(null, xs) + 4)),
      minY: Math.max(0, Math.floor(Math.min.apply(null, ys) - 4)),
      maxY: Math.min(height - 1, Math.ceil(Math.max.apply(null, ys) + 4))
    };
  }

  function drawOverlay(best, displayPoint, cmd, motionResult) {
    var rect = overlay.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(56,189,248,0.95)';
    ctx.fillStyle = 'rgba(56,189,248,0.12)';
    if (points.length) {
      ctx.beginPath();
      points.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      if (points.length === 4) ctx.closePath();
      ctx.stroke();
      if (points.length === 4) ctx.fill();
      points.forEach(function (p, i) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fillStyle = '#38bdf8'; ctx.fill();
        ctx.fillStyle = '#020617'; ctx.font = 'bold 12px -apple-system'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), p.x, p.y);
      });
    }
    if (displayTrail.length > 1) {
      ctx.save();
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(250,204,21,0.78)';
      ctx.beginPath();
      displayTrail.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();
      ctx.restore();
    }
    if (displayPoint) {
      ctx.beginPath();
      ctx.arc(displayPoint.x, displayPoint.y, 18, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#22c55e';
      ctx.stroke();
      ctx.fillStyle = 'rgba(34,197,94,0.18)';
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 18px -apple-system';
      ctx.textAlign = 'center';
      ctx.fillText(cmd || '', displayPoint.x, displayPoint.y - 26);
      if (motionResult) {
        ctx.font = 'bold 12px -apple-system';
        ctx.fillText(motionResult.reason + ' / v=' + motionResult.speed.toFixed(2), displayPoint.x, displayPoint.y + 31);
      }
    }
  }

  function pointInPoly(x, y, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      var intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 0.000001) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  function buildHomography(src, dst) {
    var A = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i].x, y = src[i].y, u = dst[i].x, v = dst[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    var h = solveLinear(A);
    if (!h) return null;
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  function solveLinear(m) {
    var n = 8;
    for (var col = 0; col < n; col++) {
      var pivot = col;
      for (var row = col + 1; row < n; row++) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
      if (Math.abs(m[pivot][col]) < 1e-9) return null;
      var tmp = m[col]; m[col] = m[pivot]; m[pivot] = tmp;
      var div = m[col][col];
      for (var k = col; k <= n; k++) m[col][k] /= div;
      for (var r = 0; r < n; r++) {
        if (r === col) continue;
        var factor = m[r][col];
        for (var c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
      }
    }
    var result = [];
    for (var i = 0; i < n; i++) result.push(m[i][n]);
    return result;
  }

  function applyHomography(H, x, y) {
    if (!H) return null;
    var den = H[6] * x + H[7] * y + H[8];
    if (Math.abs(den) < 1e-9) return null;
    return { x: (H[0] * x + H[1] * y + H[2]) / den, y: (H[3] * x + H[4] * y + H[5]) / den };
  }
})();
</script>
</body>
</html>`;
}
