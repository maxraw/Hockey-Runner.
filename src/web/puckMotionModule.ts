export const PUCK_MOTION_MODULE_SCRIPT = `
(function () {
  function median(values) {
    if (!values.length) return 0;
    var arr = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  }

  function majorityVote(values) {
    var counts = {};
    var best = 'neutral';
    var bestCount = 0;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (!v || v === 'neutral') continue;
      counts[v] = (counts[v] || 0) + 1;
      if (counts[v] > bestCount) { best = v; bestCount = counts[v]; }
    }
    return bestCount >= 2 ? best : 'neutral';
  }

  function create(options) {
    options = options || {};
    var points = [];
    var commands = [];
    var rawCommands = [];
    var smoothed = null;
    var lastEmitAt = 0;
    var lastStrongCmd = 'neutral';
    var lastStrongAt = 0;
    var maxPoints = options.maxPoints || 24;
    var minConfidence = options.minConfidence || 0.24;
    var minDisplacement = options.minDisplacement || 0.030;
    var minPeakSpeed = options.minPeakSpeed || 0.23;
    var holdMs = options.holdMs || 170;
    var cooldownMs = options.cooldownMs || 150;
    var alpha = options.alpha || 0.42;

    function reset() {
      points = [];
      commands = [];
      rawCommands = [];
      smoothed = null;
      lastEmitAt = 0;
      lastStrongCmd = 'neutral';
      lastStrongAt = 0;
    }

    function update(sample) {
      var now = sample.ts || Date.now();
      var confidence = typeof sample.confidence === 'number' ? sample.confidence : 1;
      if (confidence < minConfidence || sample.x == null || sample.y == null) {
        commands.push('lost');
        if (commands.length > 7) commands.shift();
        return result('lost', 'lost', confidence, 0, 0, 0, 'low-confidence', now);
      }

      // Median filter over the last two raw samples + current sample: removes one-frame camera spikes.
      var rawWindow = points.slice(-2);
      rawWindow.push({ x: sample.x, y: sample.y, ts: now, confidence: confidence });
      var mx = median(rawWindow.map(function (p) { return p.x; }));
      var my = median(rawWindow.map(function (p) { return p.y; }));

      // Lightweight low-pass filter, equivalent in purpose to the Butterworth smoothing used in HAR projects.
      if (!smoothed) smoothed = { x: mx, y: my };
      smoothed.x = smoothed.x * (1 - alpha) + mx * alpha;
      smoothed.y = smoothed.y * (1 - alpha) + my * alpha;

      var p = { x: smoothed.x, y: smoothed.y, ts: now, confidence: confidence };
      points.push(p);
      while (points.length > maxPoints) points.shift();
      while (points.length && now - points[0].ts > 520) points.shift();

      if (points.length < 4) return result('neutral', 'neutral', confidence, 0, 0, 0, 'warming-up', now);

      var first = points[0];
      var last = points[points.length - 1];
      var dxTotal = last.x - first.x;
      var dyTotal = last.y - first.y;
      var dtSec = Math.max(0.001, (last.ts - first.ts) / 1000);
      var vx = dxTotal / dtSec;
      var vy = dyTotal / dtSec;
      var speed = Math.sqrt(vx * vx + vy * vy);

      var raw = classify(dxTotal, dyTotal, vx, vy, speed);
      rawCommands.push(raw.cmd);
      if (rawCommands.length > 5) rawCommands.shift();

      var voted = majorityVote(rawCommands);
      var cmd = voted;
      var reason = raw.reason;

      if (cmd !== 'neutral') {
        if (now - lastEmitAt < cooldownMs && cmd === lastStrongCmd) {
          cmd = 'neutral';
          reason = 'cooldown';
        } else {
          lastEmitAt = now;
          lastStrongCmd = cmd;
          lastStrongAt = now;
        }
      } else if (now - lastStrongAt < holdMs) {
        cmd = lastStrongCmd;
        reason = 'hold';
      }

      commands.push(cmd);
      if (commands.length > 7) commands.shift();

      return result(cmd, raw.cmd, confidence, dxTotal, dyTotal, speed, reason, now);
    }

    function classify(dx, dy, vx, vy, speed) {
      var absX = Math.abs(dx);
      var absY = Math.abs(dy);
      var peakX = Math.abs(vx);
      var peakY = Math.abs(vy);
      if (Math.max(absX, absY) < minDisplacement && speed < minPeakSpeed) {
        return { cmd: 'neutral', reason: 'below-threshold' };
      }
      if (absX > absY * 1.18 || peakX > peakY * 1.22) {
        return { cmd: dx < 0 ? 'left' : 'right', reason: 'x-peak' };
      }
      if (absY > absX * 1.05 || peakY > peakX * 1.12) {
        return { cmd: dy < 0 ? 'jump' : 'duck', reason: 'y-peak' };
      }
      return { cmd: 'neutral', reason: 'ambiguous' };
    }

    function result(cmd, rawCommand, confidence, dx, dy, speed, reason, ts) {
      return {
        cmd: cmd,
        rawCommand: rawCommand,
        confidence: confidence,
        dx: dx,
        dy: dy,
        speed: speed,
        reason: reason,
        ts: ts,
        stable: cmd !== 'neutral' && cmd !== 'lost',
        points: points.slice()
      };
    }

    return { update: update, reset: reset };
  }

  window.HockeyRunnerPuckMotion = { create: create };
})();
`;
