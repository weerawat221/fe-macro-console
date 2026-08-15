// ocrPreprocessor.js
// Client-side / Canvas Image Preprocessor for OCR Engine.
// Performs upscaling, grayscale conversion, auto-inversion for dark console/terminal screens,
// contrast stretching, and binarization to maximize Tesseract.js recognition accuracy.

/**
 * Preprocesses a canvas crop before OCR.
 * @param {HTMLImageElement | HTMLCanvasElement} sourceImg
 * @param {number} sx source X
 * @param {number} sy source Y
 * @param {number} sw source width
 * @param {number} sh source height
 * @param {object} options
 * @returns {{ dataUrl: string, scale: number, width: number, height: number }}
 */
export function preprocessCropCanvas(sourceImg, sx, sy, sw, sh, options = {}) {
  // 1. Calculate Target Scaling (upscale if width < 2000px)
  let scale = 1;
  const targetMinW = options.minWidth || 2000;
  if (sw > 0 && sw < targetMinMinW(sw, targetMinW)) {
    scale = Math.min(3.0, Math.max(1.5, targetMinW / sw));
  } else if (sw > 0 && sw < 1000) {
    scale = 2.0;
  }

  const outW = Math.round(sw * scale);
  const outH = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // High quality interpolation
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw scaled region
  ctx.drawImage(sourceImg, sx, sy, sw, sh, 0, 0, outW, outH);

  // 2. Pixel Manipulation (Grayscale + Inversion + Contrast Stretch)
  const imgData = ctx.getImageData(0, 0, outW, outH);
  const data = imgData.data;
  const len = data.length;

  let totalLum = 0;
  let minLum = 255;
  let maxLum = 0;
  const pixelCount = len / 4;

  // First pass: convert to grayscale and gather statistics
  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Standard perceptual luminance
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    data[i] = lum;
    data[i + 1] = lum;
    data[i + 2] = lum;

    totalLum += lum;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const avgLum = totalLum / pixelCount;
  // If background is dark (console / terminal / dark mode), invert so text is dark on light background
  const shouldInvert = options.invert !== undefined ? options.invert : avgLum < 120;

  // Second pass: Invert + Contrast stretch
  const lumRange = Math.max(1, maxLum - minLum);
  for (let i = 0; i < len; i += 4) {
    let lum = data[i];

    // Invert if dark background
    if (shouldInvert) {
      lum = 255 - lum;
    }

    // Contrast stretching: stretch [minLum, maxLum] to [0, 255]
    if (lumRange < 240) {
      const normalized = (lum - (shouldInvert ? 255 - maxLum : minLum)) / lumRange;
      lum = Math.max(0, Math.min(255, Math.round(normalized * 255)));
    }

    // Subtle unsharp / high contrast curve
    if (lum < 90) lum = Math.max(0, lum * 0.7);
    else if (lum > 160) lum = Math.min(255, lum * 1.15 + 10);

    data[i] = lum;
    data[i + 1] = lum;
    data[i + 2] = lum;
  }

  ctx.putImageData(imgData, 0, 0);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    scale,
    width: outW,
    height: outH,
  };
}

function targetMinMinW(sw, target) {
  return target;
}
