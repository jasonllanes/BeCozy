// Splits a W×H screen into one zone per player.
// layout "columns": everyone side by side. layout "grid": rows of 1–2 zones.
export function layoutRows(n, layout) {
  if (layout === 'grid' && n > 1) return n === 2 ? [1, 1] : n === 3 ? [2, 1] : [2, 2];
  return [n];
}

export function computeZones(n, layout, W, H) {
  const rows = layoutRows(n, layout);
  const rh = H / rows.length;
  const zones = [];
  rows.forEach((cols, r) => {
    const cw = W / cols;
    for (let c = 0; c < cols; c++) {
      zones.push({ index: zones.length, x: c * cw, y: r * rh, w: cw, h: rh });
    }
  });
  return zones;
}
