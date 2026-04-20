import 'dart:math' as math;

import 'package:flame/components.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';

import '../models/tracking_models.dart';

class HockeyRunnerGame extends FlameGame {
  HockeyRunnerGame({this.onGameOver});

  final VoidCallback? onGameOver;

  late final PlayerComponent player;
  final math.Random _random = math.Random();
  double _spawnTimer = 0;
  double _spawnEvery = 1.15;
  int score = 0;
  bool gameOver = false;

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    player = PlayerComponent()
      ..position = Vector2(size.x / 2, size.y - 130)
      ..size = Vector2(72, 92)
      ..anchor = Anchor.center
      ..targetX = size.x / 2;
    add(player);
    add(ScoreText(_scoreText));
  }

  String get _scoreText => 'Score: $score';

  void resetGame() {
    gameOver = false;
    score = 0;
    _spawnEvery = 1.15;
    _spawnTimer = 0;
    children.whereType<ObstacleComponent>().toList().forEach((o) => o.removeFromParent());
    player.position = Vector2(size.x / 2, size.y - 130);
    player.targetX = size.x / 2;
    player.reset();
    resumeEngine();
  }

  void applyTracking(Offset normalizedPuck, ActionCommand command) {
    if (gameOver) {
      return;
    }

    player.targetX = normalizedPuck.dx * size.x;
    if (command == ActionCommand.jump) {
      player.jump();
    } else if (command == ActionCommand.crouch) {
      player.crouch();
    }
  }

  @override
  void update(double dt) {
    super.update(dt);
    if (gameOver) {
      return;
    }

    _spawnTimer += dt;
    if (_spawnTimer >= _spawnEvery) {
      _spawnTimer = 0;
      _spawnEvery = math.max(0.55, _spawnEvery - 0.015);
      _spawnObstacle();
    }

    for (final obstacle in children.whereType<ObstacleComponent>()) {
      if (obstacle.position.y - obstacle.size.y > size.y + 40) {
        obstacle.removeFromParent();
        score += 1;
      }

      if (_intersects(player.hitbox, obstacle.hitbox)) {
        gameOver = true;
        pauseEngine();
        onGameOver?.call();
        break;
      }
    }
  }

  bool _intersects(Rect a, Rect b) => a.overlaps(b);

  void _spawnObstacle() {
    final width = 40.0 + _random.nextInt(45);
    final height = 28.0 + _random.nextInt(40);
    final obstacle = ObstacleComponent(
      speed: 220 + _random.nextDouble() * 110,
    )
      ..size = Vector2(width, height)
      ..position = Vector2(
        (_random.nextDouble() * size.x).clamp(width / 2, size.x - width / 2).toDouble(),
        -height,
      )
      ..anchor = Anchor.center;
    add(obstacle);
  }
}

class PlayerComponent extends PositionComponent {
  double targetX = 0;
  double _verticalVelocity = 0;
  double _jumpOffset = 0;
  double _crouchTimer = 0;
  bool _isJumping = false;

  Rect get hitbox {
    final crouchFactor = _crouchTimer > 0 ? 0.55 : 1.0;
    final jumpLift = _jumpOffset;
    return Rect.fromCenter(
      center: Offset(position.x, position.y - jumpLift),
      width: size.x * 0.55,
      height: size.y * 0.72 * crouchFactor,
    );
  }

  void reset() {
    targetX = position.x;
    _verticalVelocity = 0;
    _jumpOffset = 0;
    _crouchTimer = 0;
    _isJumping = false;
  }

  void jump() {
    if (_isJumping) {
      return;
    }
    _isJumping = true;
    _verticalVelocity = 420;
  }

  void crouch() {
    _crouchTimer = 0.55;
  }

  @override
  void update(double dt) {
    super.update(dt);
    position.x += (targetX - position.x) * math.min(1, dt * 10);
    final gameWidth = findGame()?.size.x ?? position.x;
    position.x = position.x.clamp(size.x / 2, gameWidth - size.x / 2).toDouble();

    if (_isJumping || _jumpOffset > 0) {
      _jumpOffset += _verticalVelocity * dt;
      _verticalVelocity -= 900 * dt;
      if (_jumpOffset <= 0) {
        _jumpOffset = 0;
        _verticalVelocity = 0;
        _isJumping = false;
      }
    }

    if (_crouchTimer > 0) {
      _crouchTimer -= dt;
    }
  }

  @override
  void render(Canvas canvas) {
    super.render(canvas);
    final bodyPaint = Paint()..color = Colors.white;
    final stickPaint = Paint()
      ..color = Colors.orangeAccent
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;

    final center = Offset(size.x / 2, size.y / 2 - _jumpOffset);
    final crouchOffset = _crouchTimer > 0 ? 10.0 : 0.0;
    final headCenter = Offset(center.dx, center.dy - 20 + crouchOffset);

    canvas.drawCircle(headCenter, 10, bodyPaint);
    canvas.drawLine(
      Offset(center.dx, center.dy - 10 + crouchOffset),
      Offset(center.dx, center.dy + 18),
      stickPaint..strokeWidth = 4,
    );
    canvas.drawLine(
      Offset(center.dx, center.dy + 5),
      Offset(center.dx - 16, center.dy + 22 + crouchOffset),
      stickPaint,
    );
    canvas.drawLine(
      Offset(center.dx, center.dy + 5),
      Offset(center.dx + 16, center.dy + 22 + crouchOffset),
      stickPaint,
    );
    canvas.drawLine(
      Offset(center.dx + 6, center.dy),
      Offset(center.dx + 28, center.dy + 18),
      stickPaint,
    );
    canvas.drawLine(
      Offset(center.dx + 28, center.dy + 18),
      Offset(center.dx + 18, center.dy + 28),
      stickPaint,
    );
  }
}

class ObstacleComponent extends PositionComponent {
  ObstacleComponent({required this.speed});

  final double speed;

  Rect get hitbox => Rect.fromCenter(
        center: Offset(position.x, position.y),
        width: size.x,
        height: size.y,
      );

  @override
  void update(double dt) {
    super.update(dt);
    position.y += speed * dt;
  }

  @override
  void render(Canvas canvas) {
    super.render(canvas);
    final rect = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset(size.x / 2, size.y / 2),
        width: size.x,
        height: size.y,
      ),
      const Radius.circular(12),
    );
    canvas.drawRRect(rect, Paint()..color = Colors.redAccent);
  }
}

class ScoreText extends TextComponent {
  ScoreText(String Function() getter)
      : _getter = getter,
        super(
          position: Vector2(16, 16),
          anchor: Anchor.topLeft,
          priority: 10,
        );

  final String Function() _getter;

  @override
  void update(double dt) {
    super.update(dt);
    text = _getter();
    textRenderer = TextPaint(
      style: const TextStyle(
        color: Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}
