import type { MoppleGeo } from '../project/schema.ts';

export interface CityPreset {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export const WORLD_CITY_PRESETS: CityPreset[] = [
  { name: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278, timezone: 'UTC+0' },
  { name: 'New York', country: 'United States', latitude: 40.7128, longitude: -74.0060, timezone: 'UTC-5' },
  { name: 'Tashkent', country: 'Uzbekistan', latitude: 41.2995, longitude: 69.2401, timezone: 'UTC+5' },
  { name: 'Tokyo', country: 'Japan', latitude: 35.6762, longitude: 139.6503, timezone: 'UTC+9' },
  { name: 'Paris', country: 'France', latitude: 48.8566, longitude: 2.3522, timezone: 'UTC+1' },
  { name: 'Dubai', country: 'United Arab Emirates', latitude: 25.2048, longitude: 55.2708, timezone: 'UTC+4' },
  { name: 'Sydney', country: 'Australia', latitude: -33.8688, longitude: 151.2093, timezone: 'UTC+10' },
  { name: 'Berlin', country: 'Germany', latitude: 52.5200, longitude: 13.4050, timezone: 'UTC+1' },
  { name: 'Zurich', country: 'Switzerland', latitude: 47.3769, longitude: 8.5417, timezone: 'UTC+1' },
  { name: 'Los Angeles', country: 'United States', latitude: 34.0522, longitude: -118.2437, timezone: 'UTC-8' },
  { name: 'Singapore', country: 'Singapore', latitude: 1.3521, longitude: 103.8198, timezone: 'UTC+8' },
];

export const DEFAULT_GEO: MoppleGeo = {
  latitude: 51.5074,
  longitude: -0.1278,
  city: 'London',
  address: 'Architectural Site Plot #1',
  northAngle: 0,
  mapUnderlay: false,
};

/**
 * Interactive Geolocation Map Controller
 * Renders an interactive world/local map canvas showing coordinates,
 * house footprint pin, and true North rotation indicator.
 */
export class GeolocationMapController {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentGeo: MoppleGeo;
  private onChange: (geo: MoppleGeo) => void;

  constructor(canvas: HTMLCanvasElement, initialGeo: MoppleGeo = DEFAULT_GEO, onChange: (geo: MoppleGeo) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.currentGeo = { ...DEFAULT_GEO, ...initialGeo };
    this.onChange = onChange;

    this.setupInteractivity();
    this.render();
  }

  public setGeo(geo: Partial<MoppleGeo>): void {
    this.currentGeo = { ...this.currentGeo, ...geo };
    this.render();
  }

  public getGeo(): MoppleGeo {
    return { ...this.currentGeo };
  }

  private setupInteractivity(): void {
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = this.canvas.width;
      const h = this.canvas.height;

      // Map canvas pixel to lat/long (Equirectangular projection)
      const lon = (x / w) * 360 - 180;
      const lat = 90 - (y / h) * 180;

      const roundedLat = Math.round(lat * 10000) / 10000;
      const roundedLon = Math.round(lon * 10000) / 10000;

      // Check if near any preset city
      let matchedCity: string | undefined = undefined;
      for (const preset of WORLD_CITY_PRESETS) {
        const dLat = Math.abs(preset.latitude - roundedLat);
        const dLon = Math.abs(preset.longitude - roundedLon);
        if (dLat < 4 && dLon < 6) {
          matchedCity = preset.name;
          break;
        }
      }

      this.currentGeo.latitude = roundedLat;
      this.currentGeo.longitude = roundedLon;
      this.currentGeo.city = matchedCity || `Site (${roundedLat.toFixed(2)}°, ${roundedLon.toFixed(2)}°)`;

      this.render();
      this.onChange(this.getGeo());
    });
  }

  public render(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    // Dark architectural map aesthetic
    ctx.fillStyle = '#0a0e0c';
    ctx.fillRect(0, 0, w, h);

    // Coordinate grid lines (every 30 degrees)
    ctx.strokeStyle = 'rgba(168, 232, 210, 0.08)';
    ctx.lineWidth = 1;

    // Longitude lines (vertical)
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = ((lon + 180) / 360) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Latitude lines (horizontal)
    for (let lat = -90; lat <= 90; lat += 30) {
      const y = ((90 - lat) / 180) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Equator & Prime Meridian highlighted
    ctx.strokeStyle = 'rgba(168, 232, 210, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Simplified architectural landmass outlines
    this.drawStylizedContinents(ctx, w, h);

    // Draw preset city markers
    for (const city of WORLD_CITY_PRESETS) {
      const cx = ((city.longitude + 180) / 360) * w;
      const cy = ((90 - city.latitude) / 180) * h;

      ctx.fillStyle = 'rgba(168, 232, 210, 0.35)';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw active house geolocation pin
    const pinX = ((this.currentGeo.longitude + 180) / 360) * w;
    const pinY = ((90 - this.currentGeo.latitude) / 180) * h;

    // Pulse radar rings
    ctx.strokeStyle = 'rgba(168, 232, 210, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pinX, pinY, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(168, 232, 210, 0.7)';
    ctx.beginPath();
    ctx.arc(pinX, pinY, 7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#a8e8d2';
    ctx.beginPath();
    ctx.arc(pinX, pinY, 4, 0, Math.PI * 2);
    ctx.fill();

    // True North orientation arrow on pin
    const northRad = ((this.currentGeo.northAngle ?? 0) - 90) * (Math.PI / 180);
    const arrowLen = 22;
    ctx.strokeStyle = '#ffd066';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pinX, pinY);
    ctx.lineTo(pinX + Math.cos(northRad) * arrowLen, pinY + Math.sin(northRad) * arrowLen);
    ctx.stroke();

    // Pin Label Badge
    const cityName = this.currentGeo.city || 'Custom Location';
    const coordStr = `${Math.abs(this.currentGeo.latitude).toFixed(2)}°${this.currentGeo.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(this.currentGeo.longitude).toFixed(2)}°${this.currentGeo.longitude >= 0 ? 'E' : 'W'}`;

    ctx.font = 'bold 11px Inter, sans-serif';
    const textWidth = Math.max(ctx.measureText(cityName).width, ctx.measureText(coordStr).width);
    const boxW = textWidth + 16;
    const boxH = 34;
    const boxX = Math.min(w - boxW - 8, Math.max(8, pinX - boxW / 2));
    const boxY = pinY > 60 ? pinY - boxH - 12 : pinY + 16;

    ctx.fillStyle = 'rgba(16, 23, 20, 0.92)';
    ctx.strokeStyle = 'rgba(168, 232, 210, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#a8e8d2';
    ctx.textAlign = 'left';
    ctx.fillText(`📍 ${cityName}`, boxX + 8, boxY + 14);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(coordStr, boxX + 8, boxY + 28);
  }

  private drawStylizedContinents(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Stylized low-poly landmass curves for clean architectural map aesthetic
    ctx.fillStyle = 'rgba(24, 34, 29, 0.55)';
    ctx.strokeStyle = 'rgba(168, 232, 210, 0.15)';
    ctx.lineWidth = 1;

    // Approximate bounding regions for major continents:
    // Eurasia / Africa, Americas, Australia
    const regions: [number, number][][] = [
      // North America
      [[-160, 70], [-60, 70], [-80, 25], [-105, 20], [-125, 35], [-160, 60]],
      // South America
      [[-80, 10], [-35, -5], [-55, -55], [-75, -45], [-80, 0]],
      // Europe / Asia
      [[-10, 36], [30, 36], [60, 40], [140, 40], [170, 65], [10, 70], [-10, 60]],
      // Africa
      [[-15, 35], [50, 30], [50, 10], [40, -35], [15, -35], [-15, 10]],
      // Australia
      [[115, -15], [150, -15], [150, -38], [115, -35]],
    ];

    for (const poly of regions) {
      ctx.beginPath();
      for (let i = 0; i < poly.length; i++) {
        const [lon, lat] = poly[i];
        const x = ((lon + 180) / 360) * w;
        const y = ((90 - lat) / 180) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}
