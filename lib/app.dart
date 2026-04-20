import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';

import 'game/hockey_runner_game.dart';
import 'models/tracking_models.dart';
import 'tracking/cv_tracker_service.dart';
import 'ui/calibration_overlay_painter.dart';

class HockeyFloorGameApp extends StatelessWidget {
  const HockeyFloorGameApp({super.key, required this.cameras});

  final List<CameraDescription> cameras;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(useMaterial3: true),
      home: TrackingGameScreen(cameras: cameras),
    );
  }
}

class TrackingGameScreen extends StatefulWidget {
  const TrackingGameScreen({super.key, required this.cameras});

  final List<CameraDescription> cameras;

  @override
  State<TrackingGameScreen> createState() => _TrackingGameScreenState();
}

class _TrackingGameScreenState extends State<TrackingGameScreen>
    with WidgetsBindingObserver {
  final CvTrackerService _tracker = CvTrackerService();
  late final HockeyRunnerGame _game;

  CameraController? _controller;
  TrackingFrameResult? _lastResult;
  AppStage _stage = AppStage.calibration;
  bool _isProcessingFrame = false;
  bool _isGameOver = false;
  int _countdown = 15;
  Timer? _countdownTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _game = HockeyRunnerGame(
      onGameOver: () {
        if (!mounted) {
          return;
        }
        setState(() => _isGameOver = true);
      },
    );
    _initCamera();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _countdownTimer?.cancel();
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return;
    }

    if (state == AppLifecycleState.inactive) {
      controller.dispose();
      setState(() => _controller = null);
    } else if (state == AppLifecycleState.resumed) {
      _initCamera();
    }
  }

  Future<void> _initCamera() async {
    final backCamera = widget.cameras.where((c) => c.lensDirection == CameraLensDirection.back).firstOrNull;
    final selectedCamera = backCamera ?? widget.cameras.firstOrNull;
    if (selectedCamera == null) {
      return;
    }

    await _controller?.dispose();

    final controller = CameraController(
      selectedCamera,
      ResolutionPreset.high,
      enableAudio: false,
      imageFormatGroup: Platform.isIOS ? ImageFormatGroup.bgra8888 : ImageFormatGroup.yuv420,
    );

    if (mounted) {
      setState(() => _controller = controller);
    }

    try {
      await controller.initialize();
      await controller.startImageStream(_processFrame);
      if (!mounted) {
        return;
      }
      setState(() {});
    } on CameraException catch (e) {
      await controller.dispose();
      if (!mounted) {
        return;
      }
      setState(() {
        _lastResult = TrackingFrameResult(
          frameSize: const Size(1, 1),
          message: 'Ошибка камеры: ${e.description ?? e.code}',
        );
      });
    }
  }

  Future<void> _processFrame(CameraImage image) async {
    final controller = _controller;
    if (_isProcessingFrame || controller == null || !mounted) {
      return;
    }

    _isProcessingFrame = true;
    try {
      final result = await _tracker.analyze(
        image,
        lensDirection: controller.description.lensDirection,
        sensorOrientation: controller.description.sensorOrientation,
        deviceOrientation: controller.value.deviceOrientation,
      );

      if (!mounted) {
        return;
      }

      if (_stage == AppStage.playing && result.normalizedPuck != null) {
        _game.applyTracking(result.normalizedPuck!, result.command);
      }

      setState(() {
        _lastResult = result;
      });
    } finally {
      _isProcessingFrame = false;
    }
  }

  void _startCountdown() {
    if (_lastResult?.calibrationReady != true) {
      return;
    }

    _countdownTimer?.cancel();
    setState(() {
      _stage = AppStage.countdown;
      _countdown = 15;
      _isGameOver = false;
    });

    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (_countdown <= 1) {
        timer.cancel();
        _game.resetGame();
        setState(() {
          _stage = AppStage.playing;
          _countdown = 0;
        });
      } else {
        setState(() => _countdown -= 1);
      }
    });
  }

  void _backToCalibration() {
    _countdownTimer?.cancel();
    setState(() {
      _stage = AppStage.calibration;
      _countdown = 15;
      _isGameOver = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;

    return Scaffold(
      body: controller == null || !controller.value.isInitialized
          ? const Center(child: CircularProgressIndicator())
          : Stack(
              fit: StackFit.expand,
              children: [
                CameraPreview(controller),
                ColoredBox(color: Colors.black.withOpacity(_stage == AppStage.playing ? 0.45 : 0.15)),
                if (_stage != AppStage.playing)
                  CustomPaint(
                    painter: CalibrationOverlayPainter(result: _lastResult),
                  ),
                if (_stage == AppStage.playing)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white24),
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: GameWidget(game: _game),
                      ),
                    ),
                  ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _Header(stage: _stage),
                        const SizedBox(height: 12),
                        _StatusCard(
                          result: _lastResult,
                          stage: _stage,
                          countdown: _countdown,
                        ),
                        const Spacer(),
                        if (_stage == AppStage.calibration)
                          FilledButton.icon(
                            onPressed: _lastResult?.calibrationReady == true ? _startCountdown : null,
                            icon: const Icon(Icons.sports_hockey),
                            label: const Text('Начать игру'),
                          ),
                        if (_stage == AppStage.countdown)
                          FilledButton.tonal(
                            onPressed: _backToCalibration,
                            child: const Text('Отменить и вернуться к калибровке'),
                          ),
                        if (_stage == AppStage.playing && _isGameOver)
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Столкновение. Игра окончена.',
                                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  FilledButton(
                                    onPressed: () {
                                      _game.resetGame();
                                      setState(() => _isGameOver = false);
                                    },
                                    child: const Text('Ещё раз'),
                                  ),
                                  const SizedBox(width: 12),
                                  FilledButton.tonal(
                                    onPressed: _backToCalibration,
                                    child: const Text('К калибровке'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        const SizedBox(height: 8),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.stage});

  final AppStage stage;

  @override
  Widget build(BuildContext context) {
    final title = switch (stage) {
      AppStage.calibration => 'Калибровка поля и шайбы',
      AppStage.countdown => 'Подготовка к старту',
      AppStage.playing => 'Хоккейный раннер',
    };

    return Text(
      title,
      style: const TextStyle(
        fontSize: 28,
        fontWeight: FontWeight.w900,
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.result,
    required this.stage,
    required this.countdown,
  });

  final TrackingFrameResult? result;
  final AppStage stage;
  final int countdown;

  @override
  Widget build(BuildContext context) {
    String line1 = result?.message ?? 'Инициализация камеры...';
    String line2 = 'Светлое поле: 100×50–233×100 см. Шайба: тёмная, около 7.5 см.';

    if (stage == AppStage.countdown) {
      line1 = 'Игра стартует через $countdown сек.';
      line2 = 'Поставь телефон на напольный штатив и не меняй угол камеры.';
    }

    if (stage == AppStage.playing) {
      line1 = 'Влево/вправо — уклонение. Вперёд — прыжок. Назад — приседание.';
      final p = result?.normalizedPuck;
      line2 = p == null
          ? 'Шайба временно потеряна. Верни её в пределы поля.'
          : 'Нормализованная позиция шайбы: x=${p.dx.toStringAsFixed(2)}, y=${p.dy.toStringAsFixed(2)}';
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.55),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white24),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              line1,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(line2, style: const TextStyle(fontSize: 14, color: Colors.white70)),
          ],
        ),
      ),
    );
  }
}

extension<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
