import * as THREE from 'three';

const textureCache = new Map<string, THREE.CanvasTexture>();

function createFallbackTexture(repeatU = 1, repeatV = 1): THREE.CanvasTexture {
  const tex = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1) as unknown as THREE.CanvasTexture;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatU, repeatV);
  return tex;
}

/**
 * Generates an architectural hardwood parquet texture with wood grain,
 * plank offsets, and realistic subtle joint lines.
 */
export function getWoodPlankTexture(baseColorHex = '#c4a67e', repeatU = 3, repeatV = 3): THREE.CanvasTexture {
  if (typeof document === 'undefined') return createFallbackTexture(repeatU, repeatV);
  const cacheKey = `wood_${baseColorHex}_${repeatU}_${repeatV}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColorHex;
  ctx.fillRect(0, 0, size, size);

  // Planks layout: 8 rows
  const numRows = 8;
  const rowHeight = size / numRows;

  for (let r = 0; r < numRows; r++) {
    const y0 = r * rowHeight;
    // Plank shift per row
    const shift = (r % 2) * (size / 3);
    const numCols = 3;
    const colWidth = size / numCols;

    for (let c = -1; c <= numCols; c++) {
      const x0 = c * colWidth + shift;

      // Slight plank shade variation
      const shadeDiff = ((Math.sin(r * 12.3 + c * 7.1) + 1) / 2 - 0.5) * 0.08;
      ctx.fillStyle = shadeDiff > 0 ? `rgba(255, 255, 255, ${shadeDiff})` : `rgba(0, 0, 0, ${Math.abs(shadeDiff)})`;
      ctx.fillRect(x0, y0, colWidth, rowHeight);

      // Fine timber grain lines
      ctx.fillStyle = 'rgba(0, 0, 0, 0.035)';
      for (let g = 0; g < 14; g++) {
        const gy = y0 + (g / 14) * rowHeight + Math.sin(g + r) * 2;
        ctx.fillRect(x0, gy, colWidth, 1);
      }

      // Vertical joint
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(x0, y0, 1.5, rowHeight);
    }

    // Horizontal joint seam
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(0, y0, size, 1.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatU, repeatV);
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Generates polished Carrara marble texture with soft clouds and delicate veins.
 */
export function getMarbleTexture(repeatU = 2, repeatV = 2): THREE.CanvasTexture {
  if (typeof document === 'undefined') return createFallbackTexture(repeatU, repeatV);
  const cacheKey = `marble_${repeatU}_${repeatV}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#eceae6';
  ctx.fillRect(0, 0, size, size);

  // Soft cloudy layers
  for (let i = 0; i < 6; i++) {
    const grad = ctx.createRadialGradient(
      (size * (i % 3)) / 2, (size * Math.floor(i / 3)) / 2, 20,
      (size * (i % 3)) / 2, (size * Math.floor(i / 3)) / 2, size / 1.5
    );
    grad.addColorStop(0, 'rgba(235, 233, 227, 0.5)');
    grad.addColorStop(1, 'rgba(215, 212, 204, 0.2)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  // Delicate marble veining
  ctx.strokeStyle = 'rgba(150, 145, 138, 0.12)';
  ctx.lineWidth = 2.5;
  for (let v = 0; v < 5; v++) {
    ctx.beginPath();
    let x = (v / 5) * size;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < size) {
      x += (Math.random() - 0.48) * 35;
      y += 25 + Math.random() * 20;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatU, repeatV);
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Generates slate ceramic tile texture with grout grid lines.
 */
export function getTileTexture(tileColorHex = '#596063', repeatU = 4, repeatV = 4): THREE.CanvasTexture {
  if (typeof document === 'undefined') return createFallbackTexture(repeatU, repeatV);
  const cacheKey = `tile_${tileColorHex}_${repeatU}_${repeatV}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = tileColorHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle stipple on tile face
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let i = 0; i < 200; i++) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  // Bevel edge highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(2, 2, size - 4, 3);
  ctx.fillRect(2, 2, 3, size - 4);

  // Grout seam borders
  ctx.fillStyle = 'rgba(20, 24, 23, 0.6)';
  ctx.fillRect(0, 0, size, 2);
  ctx.fillRect(0, 0, 2, size);
  ctx.fillRect(0, size - 2, size, 2);
  ctx.fillRect(size - 2, 0, 2, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatU, repeatV);
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Generates micro-bump normal/stipple map for plaster walls.
 */
export function getPlasterBumpTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return createFallbackTexture(4, 4);
  const cacheKey = 'plaster_bump';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  // Micro noise
  for (let i = 0; i < 3000; i++) {
    const val = 120 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgb(${val}, ${val}, ${val})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Generates architectural landscape lawn texture.
 */
export function getLawnTexture(repeat = 8): THREE.CanvasTexture {
  if (typeof document === 'undefined') return createFallbackTexture(repeat, repeat);
  const cacheKey = `lawn_${repeat}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#223326';
  ctx.fillRect(0, 0, size, size);

  // Multi-tone grass blades
  const greens = ['#2c4432', '#36533d', '#1d2b20', '#3e5c46'];
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = greens[i % greens.length];
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Generates an architectural site plot map underlay tile.
 */
export function getMapPlotTexture(
  city = 'Plot Site',
  lat = 40.7128,
  lon = -74.006,
  northAngle = 0
): THREE.CanvasTexture {
  if (typeof document === 'undefined') return createFallbackTexture(1, 1);
  const cacheKey = `map_plot_${city}_${lat.toFixed(2)}_${lon.toFixed(2)}_${northAngle}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Dark architectural satellite / CAD plot base
  ctx.fillStyle = '#0f1412';
  ctx.fillRect(0, 0, size, size);

  // Plot grid lines (every 32px ~ 2m in world units)
  ctx.strokeStyle = 'rgba(168, 232, 210, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= size; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y <= size; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // Major property boundary box
  ctx.strokeStyle = 'rgba(168, 232, 210, 0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.strokeRect(32, 32, size - 64, size - 64);
  ctx.setLineDash([]);

  // Architectural plot road/pathway border
  ctx.fillStyle = '#161c19';
  ctx.fillRect(0, size - 48, size, 48);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, size - 48);
  ctx.lineTo(size, size - 48);
  ctx.stroke();

  // Location watermark label
  ctx.fillStyle = 'rgba(168, 232, 210, 0.4)';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`📍 ${city} (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`, 42, 54);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText(`TRUE NORTH: ${northAngle.toFixed(0)}° • 1:100 METRIC SITE PLOT`, 42, 70);

  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(cacheKey, texture);
  return texture;
}
