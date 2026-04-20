import 'dart:ui';

enum AppStage {
  calibration,
  countdown,
  playing,
}

enum ActionCommand {
  none,
  jump,
  crouch,
}

class FieldDetection {
  const FieldDetection({
    required this.rect,
    required this.area,
    required this.aspectRatio,
    required this.coverage,
  });

  final Rect rect;
  final double area;
  final double aspectRatio;
  final double coverage;
}

class PuckDetection {
  const PuckDetection({
    required this.rect,
    required this.center,
    required this.diameterPx,
    required this.circularity,
  });

  final Rect rect;
  final Offset center;
  final double diameterPx;
  final double circularity;
}

class TrackingFrameResult {
  const TrackingFrameResult({
    required this.frameSize,
    this.field,
    this.puck,
    this.normalizedPuck,
    this.command = ActionCommand.none,
    this.calibrationReady = false,
    this.message = '',
  });

  final Size frameSize;
  final FieldDetection? field;
  final PuckDetection? puck;
  final Offset? normalizedPuck;
  final ActionCommand command;
  final bool calibrationReady;
  final String message;
}
