import 'dart:typed_data';

import 'package:camera/camera.dart';

Uint8List yuv420ToRgba8888(CameraImage image) {
  final int width = image.width;
  final int height = image.height;
  final int uvRowStride = image.planes[1].bytesPerRow;
  final int uvPixelStride = image.planes[1].bytesPerPixel!;
  final int yRowStride = image.planes[0].bytesPerRow;
  final int yPixelStride = image.planes[0].bytesPerPixel!;

  final yBuffer = image.planes[0].bytes;
  final uBuffer = image.planes[1].bytes;
  final vBuffer = image.planes[2].bytes;

  final rgbaBuffer = Uint8List(width * height * 4);
  for (int y = 0; y < height; y++) {
    for (int x = 0; x < width; x++) {
      final int uvIndex = uvPixelStride * (x ~/ 2) + uvRowStride * (y ~/ 2);
      final int index = y * width + x;

      final yValue = yBuffer[y * yRowStride + x * yPixelStride];
      final uValue = uBuffer[uvIndex];
      final vValue = vBuffer[uvIndex];

      final r = (yValue + 1.402 * (vValue - 128)).round().clamp(0, 255);
      final g = (yValue - 0.344136 * (uValue - 128) - 0.714136 * (vValue - 128))
          .round()
          .clamp(0, 255);
      final b = (yValue + 1.772 * (uValue - 128)).round().clamp(0, 255);

      rgbaBuffer[index * 4] = r;
      rgbaBuffer[index * 4 + 1] = g;
      rgbaBuffer[index * 4 + 2] = b;
      rgbaBuffer[index * 4 + 3] = 255;
    }
  }
  return rgbaBuffer;
}

Uint8List bgraToRgba(Uint8List bgra) {
  final out = Uint8List(bgra.length);
  for (int i = 0; i < bgra.length; i += 4) {
    out[i] = bgra[i + 2];
    out[i + 1] = bgra[i + 1];
    out[i + 2] = bgra[i];
    out[i + 3] = bgra[i + 3];
  }
  return out;
}
