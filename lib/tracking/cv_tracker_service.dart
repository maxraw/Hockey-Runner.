import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

import 'package:camera/camera.dart';
import 'package:opencv_dart/opencv_dart.dart' as cv;

import '../models/tracking_models.dart';
import 'camera_image_utils.dart';

class CvTrackerService {
  Offset? _lastSmoothed;
  Offset? _lastCommandSample;
  int _stableCalibrationFrames = 0;
  DateTime _lastActionAt = DateTime.fromMillisecondsSinceEpoch(0);

  Future<TrackingFrameResult> analyze(
    CameraImage image, {
    required CameraLensDirection lensDirection,
    required int sensorOrientation,
    required DeviceOrientation deviceOrientation,
  }) async {
    cv.Mat? rgba;
    cv.Mat? gray;
    cv.Mat? blur;
    cv.Mat? brightMask;
    cv.Mat? darkMask;

    try {
      final rgbaBytes = _toRgba(image);
      rgba = cv.Mat.fromList(
        image.height,
        image.width,
        cv.MatType.CV_8UC4,
        rgbaBytes,
      );

      _rotateToUpright(
        rgba,
        lensDirection: lensDirection,
        sensorOrientation: sensorOrientation,
        deviceOrientation: deviceOrientation,
      );

      final targetWidth = math.min(640, rgba.width);
      if (targetWidth < rgba.width) {
        final targetHeight = (rgba.height * (targetWidth / rgba.width)).round();
        cv.resize(rgba, (targetWidth, targetHeight), dst: rgba);
      }

      final frameSize = Size(rgba.width.toDouble(), rgba.height.toDouble());
      gray = cv.cvtColor(rgba, cv.COLOR_RGBA2GRAY);
      blur = cv.gaussianBlur(gray, (5, 5), 0);

      final (_, binaryBright) = cv.threshold(
        blur,
        0,
        255,
        cv.THRESH_BINARY + cv.THRESH_OTSU,
      );
      brightMask = binaryBright;

      final field = _detectField(brightMask, frameSize);
      if (field == null) {
        _stableCalibrationFrames = 0;
        return TrackingFrameResult(
          frameSize: frameSize,
          message: 'Не найдено светлое игровое поле. Наведи камеру так, чтобы коврик занял большую часть кадра.',
        );
      }

      final (_, binaryDark) = cv.threshold(
        blur,
        0,
        255,
        cv.THRESH_BINARY_INV + cv.THRESH_OTSU,
      );
      darkMask = binaryDark;

      final puck = _detectPuck(darkMask, field);
      if (puck == null) {
        _stableCalibrationFrames = 0;
        return TrackingFrameResult(
          frameSize: frameSize,
          field: field,
          message: 'Поле найдено. Теперь положи тёмную шайбу внутрь поля.',
        );
      }

      final widthRatio = field.rect.width / puck.diameterPx;
      final heightRatio = field.rect.height / puck.diameterPx;
      final ratioLooksValid = widthRatio >= 10 &&
          widthRatio <= 35 &&
          heightRatio >= 5 &&
          heightRatio <= 18;

      if (!ratioLooksValid) {
        _stableCalibrationFrames = 0;
        return TrackingFrameResult(
          frameSize: frameSize,
          field: field,
          puck: puck,
          message: 'Размер шайбы не похож на реальный относительно поля. Проверь расстояние камеры и масштаб поля.',
        );
      }

      _stableCalibrationFrames += 1;
      final normalized = Offset(
        ((puck.center.dx - field.rect.left) / field.rect.width).clamp(0.0, 1.0),
        ((puck.center.dy - field.rect.top) / field.rect.height).clamp(0.0, 1.0),
      );

      final smoothed = _smooth(normalized);
      final command = _extractCommand(smoothed);
      final isReady = _stableCalibrationFrames >= 8;

      return TrackingFrameResult(
        frameSize: frameSize,
        field: field,
        puck: puck,
        normalizedPuck: smoothed,
        command: command,
        calibrationReady: isReady,
        message: isReady
            ? 'Калибровка готова. Можно начинать игру.'
            : 'Удерживай поле и шайбу в кадре ещё ${8 - _stableCalibrationFrames} кадр(ов).',
      );
    } catch (e) {
      return TrackingFrameResult(
        frameSize: Size(image.width.toDouble(), image.height.toDouble()),
        message: 'Ошибка CV: $e',
      );
    } finally {
      rgba?.dispose();
      gray?.dispose();
      blur?.dispose();
      brightMask?.dispose();
      darkMask?.dispose();
    }
  }

  Uint8List _toRgba(CameraImage image) {
    if (image.format.group == ImageFormatGroup.bgra8888) {
      return bgraToRgba(image.planes.first.bytes);
    }
    return yuv420ToRgba8888(image);
  }

  void _rotateToUpright(
    cv.Mat mat, {
    required CameraLensDirection lensDirection,
    required int sensorOrientation,
    required DeviceOrientation deviceOrientation,
  }) {
    final orientations = <DeviceOrientation, int>{
      DeviceOrientation.portraitUp: 0,
      DeviceOrientation.landscapeLeft: 90,
      DeviceOrientation.portraitDown: 180,
      DeviceOrientation.landscapeRight: 270,
    };

    var rotationCompensation = orientations[deviceOrientation] ?? 0;
    if (lensDirection == CameraLensDirection.front) {
      rotationCompensation = (sensorOrientation + rotationCompensation) % 360;
    } else {
      rotationCompensation = (sensorOrientation - rotationCompensation + 360) % 360;
    }

    if (rotationCompensation == 90) {
      cv.rotate(mat, cv.ROTATE_90_CLOCKWISE, dst: mat);
    } else if (rotationCompensation == 180) {
      cv.rotate(mat, cv.ROTATE_180, dst: mat);
    } else if (rotationCompensation == 270) {
      cv.rotate(mat, cv.ROTATE_90_COUNTERCLOCKWISE, dst: mat);
    }
  }

  FieldDetection? _detectField(cv.Mat mask, Size frameSize) {
    final frameArea = frameSize.width * frameSize.height;
    final (contours, _) = cv.findContours(mask, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    double bestScore = 0;
    FieldDetection? best;

    for (final contour in contours) {
      final area = cv.contourArea(contour);
      if (area < frameArea * 0.12) {
        continue;
      }

      final perimeter = cv.arcLength(contour, true);
      final approx = cv.approxPolyDP(contour, 0.02 * perimeter, true);
      final rawRect = cv.boundingRect(approx.length >= 4 ? approx : contour);
      final rect = Rect.fromLTWH(
        rawRect.x.toDouble(),
        rawRect.y.toDouble(),
        rawRect.width.toDouble(),
        rawRect.height.toDouble(),
      );

      if (rect.width < 80 || rect.height < 40) {
        continue;
      }

      final aspectRatio = rect.width / rect.height;
      if (aspectRatio < 1.2 || aspectRatio > 3.2) {
        continue;
      }

      final coverage = area / frameArea;
      final polygonBonus = approx.length == 4 ? 0.15 : 0.0;
      final score = coverage + polygonBonus;

      if (score > bestScore) {
        bestScore = score;
        best = FieldDetection(
          rect: rect,
          area: area,
          aspectRatio: aspectRatio,
          coverage: coverage,
        );
      }
    }

    return best;
  }

  PuckDetection? _detectPuck(cv.Mat mask, FieldDetection field) {
    final (contours, _) = cv.findContours(mask, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    PuckDetection? best;
    double bestScore = 0;

    final fieldRect = field.rect.deflate(6);

    for (final contour in contours) {
      final area = cv.contourArea(contour);
      if (area < field.area * 0.001 || area > field.area * 0.08) {
        continue;
      }

      final rawRect = cv.boundingRect(contour);
      final rect = Rect.fromLTWH(
        rawRect.x.toDouble(),
        rawRect.y.toDouble(),
        rawRect.width.toDouble(),
        rawRect.height.toDouble(),
      );

      final center = rect.center;
      if (!fieldRect.contains(center)) {
        continue;
      }

      final diameter = (rect.width + rect.height) / 2.0;
      if (diameter < 8 || diameter > fieldRect.shortestSide * 0.25) {
        continue;
      }

      final perimeter = math.max(1, cv.arcLength(contour, true));
      final circularity = (4 * math.pi * area) / (perimeter * perimeter);
      if (circularity < 0.35) {
        continue;
      }

      final centerednessPenalty = ((center.dx - fieldRect.center.dx).abs() / fieldRect.width) * 0.1;
      final score = circularity - centerednessPenalty;
      if (score > bestScore) {
        bestScore = score;
        best = PuckDetection(
          rect: rect,
          center: center,
          diameterPx: diameter,
          circularity: circularity,
        );
      }
    }

    return best;
  }

  Offset _smooth(Offset current) {
    if (_lastSmoothed == null) {
      _lastSmoothed = current;
      return current;
    }

    final smoothed = Offset(
      _lastSmoothed!.dx * 0.6 + current.dx * 0.4,
      _lastSmoothed!.dy * 0.6 + current.dy * 0.4,
    );
    _lastSmoothed = smoothed;
    return smoothed;
  }

  ActionCommand _extractCommand(Offset current) {
    final previous = _lastCommandSample;
    _lastCommandSample = current;
    if (previous == null) {
      return ActionCommand.none;
    }

    final now = DateTime.now();
    if (now.difference(_lastActionAt).inMilliseconds < 350) {
      return ActionCommand.none;
    }

    final dy = current.dy - previous.dy;
    if (dy <= -0.12) {
      _lastActionAt = now;
      return ActionCommand.jump;
    }
    if (dy >= 0.12) {
      _lastActionAt = now;
      return ActionCommand.crouch;
    }

    return ActionCommand.none;
  }
}
