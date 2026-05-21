export const PLAYER_MODULE_SCRIPT = `
(function () {
  function roundedRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    if (fill) ctx.fill(); else ctx.stroke();
  }

  function drawShadow(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.20)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw(ctx, player, w, h, now, laneX) {
    var targetX = laneX(player.lane, w);
    if (!player.x) player.x = targetX;
    player.x += (targetX - player.x) * 0.18;
    player.y = h * 0.76;

    var jumping = player.jumpUntil > now;
    var ducking = player.duckUntil > now;
    var jumpLift = jumping ? 42 * Math.sin(((player.jumpUntil - now) / 620) * Math.PI) : 0;
    var skate = Math.sin(now * 0.018) * 5;
    var x = player.x;
    var y = player.y - jumpLift;

    drawShadow(ctx, x, player.y + 34, jumping ? 30 : 42, jumping ? 6 : 12);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(ducking ? 1.08 : 1, ducking ? 0.72 : 1);

    // Low-poly runner style: compact body, large helmet, simple readable silhouette.
    // Hockey adaptation: stick instead of weapon, skates instead of shoes.
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';

    // Skates.
    ctx.beginPath(); ctx.moveTo(-31, 35); ctx.lineTo(-6, 35 + skate * 0.25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, 35 - skate * 0.25); ctx.lineTo(34, 35); ctx.stroke();
    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-33, 40); ctx.lineTo(-2, 40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, 40); ctx.lineTo(37, 40); ctx.stroke();

    // Hockey stick.
    ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(21, ducking ? 2 : -13); ctx.lineTo(55, 43); ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(55, 43); ctx.lineTo(72, 38); ctx.stroke();

    // Legs.
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-10, 24); ctx.lineTo(-22, 35 + skate); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 24); ctx.lineTo(22, 35 - skate); ctx.stroke();

    // Body.
    ctx.fillStyle = '#111827';
    roundedRect(ctx, -23, ducking ? -4 : -28, 46, ducking ? 34 : 58, 12, true);
    ctx.fillStyle = '#1d4ed8';
    roundedRect(ctx, -17, ducking ? 1 : -20, 34, ducking ? 20 : 39, 9, true);
    ctx.fillStyle = '#93c5fd';
    roundedRect(ctx, -11, ducking ? 4 : -15, 22, ducking ? 7 : 10, 4, true);

    // Arms.
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-20, ducking ? 6 : -10); ctx.lineTo(-35, ducking ? 18 : 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(20, ducking ? 4 : -12); ctx.lineTo(38, ducking ? 10 : -1); ctx.stroke();

    // Helmet and visor.
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.arc(0, ducking ? -22 : -47, ducking ? 13 : 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111827';
    roundedRect(ctx, -15, ducking ? -29 : -56, 30, 7, 4, true);
    ctx.fillStyle = '#38bdf8';
    roundedRect(ctx, -10, ducking ? -25 : -51, 20, 4, 3, true);

    ctx.restore();
  }

  window.HockeyRunnerPlayer = { draw: draw };
})();
`;
