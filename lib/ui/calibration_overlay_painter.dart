import 'dart:ui';

import 'package:flutter/material.dart';

import '../models/tracking_models.dart';

class CalibrationOverlayPainter extends CustomPainter {
  CalibrationOverlayPainter({required this.result});

  final TrackingFrameResult? result;

  @override
  void paint(Canvas canvas, Size size) {
    final frameSize = result?.frameSize;
    if (frameSize == null || frameSize.width == 0 || frameSize.height == 0) {
      return;
    }

    final scaleX = size.width / frameSize.width;
    final scaleY = size.height / frameSize.height;

    final shadePaint = Paint()..color = Colors.black.withOpacity(0.18);
    canvas.drawRect(Offset.zero & size, shadePaint);

    final field = result?.field;
    if (field != null) {
      final rect = Rect.fromLTWH(
        field.rect.left * scaleX,
        field.rect.top * scaleY,
        field.rect.width * scaleX,
        field.rect.height * scaleY,
      );
      final fieldPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..color = result!.calibrationReady ? Colors.greenAccent : Colors.amberAccent;
      canvas.drawRect(rect, fieldPaint);
    }

    final puck = result?.puck;
    if (puck != null) {
      final center = Offset(puck.center.dx * scaleX, puck.center.dy * scaleY);
      final radius = (puck.diameterPx * scaleX) / 2;
      final puckPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = Colors.cyanAccent;
      canvas.drawCircle(center, radius, puckPaint);
    }
  }

  @override
  bool shouldRepaint(covariant CalibrationOverlayPainter oldDelegate) {
    return oldDelegate.result != result;
  }
}
