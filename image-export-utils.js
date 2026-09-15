export const EXPORT_FONT_SCALE_MIN = 80;
export const EXPORT_FONT_SCALE_MAX = 180;
export const EXPORT_FONT_SCALE_STEP = 5;
export const EXPORT_FONT_SCALE_DEFAULT = 100;
export const EXPORT_LARGE_FONT_THRESHOLD = 120;

export function normalizeExportFontScale(value) {
  if (value === null || value === undefined || value === "") {
    return EXPORT_FONT_SCALE_DEFAULT;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return EXPORT_FONT_SCALE_DEFAULT;

  const clampedValue = Math.min(
    EXPORT_FONT_SCALE_MAX,
    Math.max(EXPORT_FONT_SCALE_MIN, parsedValue)
  );
  const stepOffset = Math.round(
    (clampedValue - EXPORT_FONT_SCALE_MIN) / EXPORT_FONT_SCALE_STEP
  );
  return EXPORT_FONT_SCALE_MIN + stepOffset * EXPORT_FONT_SCALE_STEP;
}

export function getExportFontScaleCandidates(requestedScale) {
  const normalizedScale = normalizeExportFontScale(requestedScale);
  const candidates = [];

  for (
    let scale = normalizedScale;
    scale >= EXPORT_FONT_SCALE_MIN;
    scale -= EXPORT_FONT_SCALE_STEP
  ) {
    candidates.push(scale);
  }

  return candidates;
}

export function usesLargeFontExportLayout(scale) {
  return normalizeExportFontScale(scale) > EXPORT_LARGE_FONT_THRESHOLD;
}

export function getMobileTypographyScales(requestedScale) {
  const primary = normalizeExportFontScale(requestedScale);
  const scaleDelta = primary - EXPORT_FONT_SCALE_DEFAULT;

  return {
    primary,
    context: EXPORT_FONT_SCALE_DEFAULT + scaleDelta * 0.5,
    secondary: EXPORT_FONT_SCALE_DEFAULT + scaleDelta * 0.25
  };
}
