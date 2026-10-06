import * as THREE from 'three';
import type { MoppleSun } from '../project/schema.ts';

export const DEFAULT_SUN: MoppleSun = { mode: 'manual', azimuth: 225, elevation: 40, intensity: 2.8, warmth: 0.35, softness: 0.2 };

/** Art-directed sunlight: azimuth clockwise from -Z (north), elevation above horizon. */
export function manualSolarPosition(sun: MoppleSun, radius = 45): SolarPosition {
  const azimuthDeg = ((sun.azimuth % 360) + 360) % 360;
  const elevationDeg = Math.max(1, Math.min(90, sun.elevation));
  const azimuthRad = azimuthDeg * Math.PI / 180, elevationRad = elevationDeg * Math.PI / 180;
  const pos = calculateSolarPosition({ latitude: 0, longitude: 0, dayOfYear: 81, timeHours: 12, northAngle: 0 }, radius);
  
  const intensity = sun.intensity ?? 2.8;
  const warmth = Math.max(0, Math.min(1, sun.warmth ?? 0.35));
  const sunColor = new THREE.Color('#f2f7ff').lerp(new THREE.Color('#ffb366'), warmth);

  return {
    ...pos,
    azimuthDeg,
    azimuthRad,
    elevationDeg,
    elevationRad,
    sunPosition: new THREE.Vector3(
      radius * Math.cos(elevationRad) * Math.sin(azimuthRad),
      radius * Math.sin(elevationRad),
      -radius * Math.cos(elevationRad) * Math.cos(azimuthRad)
    ),
    sunColor,
    sunIntensity: intensity,
    isGoldenHour: elevationDeg <= 16 || warmth >= 0.7,
  };
}

export interface SolarState {
  latitude: number;
  longitude: number;
  dayOfYear: number; // 1 - 365
  timeHours: number; // 0.0 - 24.0
  northAngle: number; // 0 - 360 degrees
}

export interface SolarPosition {
  elevationDeg: number;
  elevationRad: number;
  azimuthDeg: number;
  azimuthRad: number;
  sunPosition: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  isDaylight: boolean;
  isGoldenHour: boolean;
  isNight: boolean;
  sunriseHour: number;
  sunsetHour: number;
  shadowCameraNear: number;
  shadowCameraFar: number;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Calculates solar position, daylight metrics, and lighting properties
 * using astronomical sun equations.
 */
export function calculateSolarPosition(state: SolarState, radius = 45): SolarPosition {
  const { latitude, dayOfYear, timeHours, northAngle } = state;
  const latRad = latitude * DEG2RAD;

  // Approximate solar declination (Spencer formula)
  const b = (360 / 365) * (dayOfYear - 81) * DEG2RAD;
  const declination = 23.45 * DEG2RAD * Math.sin(b);

  // Hour angle: 15 degrees per hour from solar noon (12:00)
  const hourAngle = (timeHours - 12) * 15 * DEG2RAD;

  // Solar altitude / elevation
  const sinElevation = Math.sin(latRad) * Math.sin(declination) +
    Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
  const elevationRad = Math.asin(Math.max(-1, Math.min(1, sinElevation)));
  const elevationDeg = elevationRad * RAD2DEG;

  // Solar azimuth (from North clockwise)
  const cosElevation = Math.cos(elevationRad);
  let azimuthRad = 0;
  if (cosElevation > 1e-5) {
    const cosAzimuth = (Math.sin(elevationRad) * Math.sin(latRad) - Math.sin(declination)) /
      (cosElevation * Math.cos(latRad));
    const clampedCosAz = Math.max(-1, Math.min(1, cosAzimuth));
    azimuthRad = Math.acos(clampedCosAz);
    if (Math.sin(hourAngle) > 0) {
      azimuthRad = 2 * Math.PI - azimuthRad;
    }
  }
  const azimuthDeg = azimuthRad * RAD2DEG;

  // Calculate sunrise and sunset hours
  let sunriseHour = 6;
  let sunsetHour = 18;
  const cosHourSunset = -Math.tan(latRad) * Math.tan(declination);
  if (cosHourSunset <= -1) {
    // Midnight sun (polar day)
    sunriseHour = 0;
    sunsetHour = 24;
  } else if (cosHourSunset >= 1) {
    // Polar night
    sunriseHour = 12;
    sunsetHour = 12;
  } else {
    const hourSunsetDeg = Math.acos(cosHourSunset) * RAD2DEG;
    const halfDayHours = hourSunsetDeg / 15;
    sunriseHour = Math.max(0, 12 - halfDayHours);
    sunsetHour = Math.min(24, 12 + halfDayHours);
  }

  // Effective azimuth relative to house North orientation
  // In Mopple: -Z is North, +X is East, +Z is South, -X is West.
  const effectiveAzimuthRad = azimuthRad - (northAngle * DEG2RAD);
  const effectiveElevationRad = Math.max(-Math.PI / 4, elevationRad);

  const horizontalR = radius * Math.cos(effectiveElevationRad);
  const sunX = horizontalR * Math.sin(effectiveAzimuthRad);
  const sunY = radius * Math.sin(effectiveElevationRad);
  const sunZ = -horizontalR * Math.cos(effectiveAzimuthRad);
  const sunPosition = new THREE.Vector3(sunX, Math.max(0.5, sunY), sunZ);

  // Daylight state classification
  const isDaylight = elevationDeg > 0;
  const isGoldenHour = elevationDeg > 0 && elevationDeg <= 16;
  const isNight = elevationDeg < -4;

  // Photorealistic sun color & intensity calculation
  let sunColor = new THREE.Color('#fff7e6');
  let sunIntensity = 2.6;
  let ambientColor = new THREE.Color('#dce5f0');
  let ambientIntensity = 0.85;

  if (isNight) {
    // Night moonlight
    sunColor = new THREE.Color('#8ea9d1');
    sunIntensity = 0.35;
    ambientColor = new THREE.Color('#141c24');
    ambientIntensity = 0.4;
    // Position moon opposite or elevated
    sunPosition.set(-sunX * 0.7, Math.max(12, Math.abs(sunY)), -sunZ * 0.7);
  } else if (elevationDeg <= 4) {
    // Low dawn / dusk
    const t = Math.max(0, elevationDeg / 4);
    sunColor = new THREE.Color('#ff6e26').lerp(new THREE.Color('#ffa647'), t);
    sunIntensity = 1.0 + t * 0.7;
    ambientColor = new THREE.Color('#3d2838').lerp(new THREE.Color('#664d5c'), t);
    ambientIntensity = 0.55 + t * 0.2;
  } else if (isGoldenHour) {
    // Golden hour
    const t = (elevationDeg - 4) / 12;
    sunColor = new THREE.Color('#ffa647').lerp(new THREE.Color('#fff2d4'), t);
    sunIntensity = 1.7 + t * 0.8;
    ambientColor = new THREE.Color('#827b87').lerp(new THREE.Color('#cce0f0'), t);
    ambientIntensity = 0.75 + t * 0.15;
  } else {
    // High sun / midday
    const t = Math.min(1, (elevationDeg - 16) / 50);
    sunColor = new THREE.Color('#fff2d4').lerp(new THREE.Color('#ffffff'), t);
    sunIntensity = 2.5 + t * 0.4;
    ambientColor = new THREE.Color('#d4e5f7');
    ambientIntensity = 0.9;
  }

  return {
    elevationDeg,
    elevationRad,
    azimuthDeg,
    azimuthRad,
    sunPosition,
    sunColor,
    sunIntensity,
    ambientColor,
    ambientIntensity,
    isDaylight,
    isGoldenHour,
    isNight,
    sunriseHour,
    sunsetHour,
    shadowCameraNear: 1,
    shadowCameraFar: 140,
  };
}

/**
 * 3D Heliodon visualizer showing compass rose, solstice trajectories,
 * and current solar trajectory arc with an interactive glowing sun sphere.
 */
export class Heliodon3D {
  public group = new THREE.Group();
  private compassGroup = new THREE.Group();
  private arcsGroup = new THREE.Group();
  private activeArcMesh: THREE.Line | null = null;
  private sunSphereMesh: THREE.Mesh;
  private sunRayLine: THREE.Line;
  private radius: number;
  private lastArcKey = '';

  constructor(radius = 32) {
    this.radius = radius;
    this.group.name = 'heliodon_visualizer';

    // Sun sphere
    const sphereGeo = new THREE.SphereGeometry(1.0, 24, 24);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffe277 });
    this.sunSphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    this.group.add(this.sunSphereMesh);

    // Sun ray line connecting sun to center of site
    const rayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 10, 0),
    ]);
    const rayMat = new THREE.LineDashedMaterial({
      color: 0xffd255,
      dashSize: 0.8,
      gapSize: 0.4,
      transparent: true,
      opacity: 0.7,
    });
    this.sunRayLine = new THREE.Line(rayGeo, rayMat);
    this.sunRayLine.computeLineDistances();
    this.group.add(this.sunRayLine);

    this.group.add(this.compassGroup);
    this.group.add(this.arcsGroup);

    this.buildCompass();
  }

  private buildCompass(): void {
    this.compassGroup.clear();
    const R = this.radius;

    // Ground circle
    const segments = 64;
    const circlePoints: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      circlePoints.push(new THREE.Vector3(R * Math.sin(a), 0.05, -R * Math.cos(a)));
    }
    const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePoints);
    const circleMat = new THREE.LineBasicMaterial({
      color: 0x3d5248,
      transparent: true,
      opacity: 0.5,
    });
    const circleLine = new THREE.Line(circleGeo, circleMat);
    this.compassGroup.add(circleLine);

    // Cardinal directions: N (-Z), E (+X), S (+Z), W (-X)
    const cardinals: [string, number, number, number][] = [
      ['N', 0, 0.08, -R - 1.2],
      ['E', R + 1.2, 0.08, 0],
      ['S', 0, 0.08, R + 1.2],
      ['W', -R - 1.2, 0.08, 0],
    ];

    for (const [letter, x, y, z] of cardinals) {
      const sprite = this.createCardinalSprite(letter, letter === 'N');
      sprite.position.set(x, y + 0.4, z);
      this.compassGroup.add(sprite);
    }

    // North arrow indicator
    const arrowGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.8, 0.06, -R + 3.0),
      new THREE.Vector3(0, 0.06, -R - 0.2),
      new THREE.Vector3(0.8, 0.06, -R + 3.0),
    ]);
    const arrowMat = new THREE.LineBasicMaterial({ color: 0xa8e8d2 });
    const arrowLine = new THREE.Line(arrowGeo, arrowMat);
    this.compassGroup.add(arrowLine);
  }

  private createCardinalSprite(letter: string, isNorth: boolean): THREE.Sprite {
    if (typeof document === 'undefined') {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
      return sprite;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = isNorth ? '#a8e8d2' : '#8fa69c';
    ctx.font = 'bold 36px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.2, 2.2, 1);
    return sprite;
  }

  /**
   * Updates celestial arcs for Solstices & current day of year
   */
  public updateSolarGuides(state: SolarState, solarPos: SolarPosition): void {
    const R = this.radius;

    // Rotate compass rose to reflect True North orientation
    this.compassGroup.rotation.y = -state.northAngle * DEG2RAD;

    // Update Sun sphere position & appearance
    this.sunSphereMesh.position.copy(solarPos.sunPosition);
    const sphereMat = this.sunSphereMesh.material as THREE.MeshBasicMaterial;
    sphereMat.color.copy(solarPos.sunColor);
    this.sunSphereMesh.visible = solarPos.elevationDeg > -12;

    // Update Sun ray line
    const rayGeo = this.sunRayLine.geometry;
    const posAttr = rayGeo.attributes.position as THREE.BufferAttribute;
    posAttr.setXYZ(0, 0, 0, 0);
    posAttr.setXYZ(1, solarPos.sunPosition.x, solarPos.sunPosition.y, solarPos.sunPosition.z);
    posAttr.needsUpdate = true;
    this.sunRayLine.computeLineDistances();
    this.sunRayLine.visible = solarPos.elevationDeg > 0;

    // Rebuild Solstice & Equinox arcs only when date or location parameters change
    const arcKey = `${state.latitude}:${state.longitude}:${state.dayOfYear}:${state.northAngle}`;
    if (this.lastArcKey !== arcKey) {
      this.lastArcKey = arcKey;
      this.arcsGroup.traverse(child => {
        if (child instanceof THREE.Line || child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else if (child.material) child.material.dispose();
        }
      });
      this.arcsGroup.clear();

      // 1. Summer solstice (Day 172)
      this.arcsGroup.add(this.buildTrajectoryArc({ ...state, dayOfYear: 172 }, 0x937c42, 0.35, true));
      // 2. Equinox (Day 80)
      this.arcsGroup.add(this.buildTrajectoryArc({ ...state, dayOfYear: 80 }, 0x5a7566, 0.35, true));
      // 3. Winter solstice (Day 355)
      this.arcsGroup.add(this.buildTrajectoryArc({ ...state, dayOfYear: 355 }, 0x476378, 0.35, true));

      // 4. Today's active solar path arc (highlighted)
      const todayArc = this.buildTrajectoryArc(state, 0xffd066, 0.85, false);
      this.arcsGroup.add(todayArc);
    }
  }

  private buildTrajectoryArc(state: SolarState, colorHex: number, opacity: number, dashed: boolean): THREE.Line {
    const points: THREE.Vector3[] = [];
    const stepMinutes = 15;
    const steps = (24 * 60) / stepMinutes;

    for (let i = 0; i <= steps; i++) {
      const h = (i * stepMinutes) / 60;
      const pos = calculateSolarPosition({ ...state, timeHours: h }, this.radius);
      if (pos.elevationDeg >= -1) {
        points.push(pos.sunPosition);
      }
    }

    if (points.length < 2) {
      // Degenerate arc (polar night)
      points.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.01, 0));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    let mat: THREE.Material;
    if (dashed) {
      mat = new THREE.LineDashedMaterial({
        color: colorHex,
        dashSize: 1.2,
        gapSize: 0.6,
        transparent: true,
        opacity,
      });
    } else {
      mat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity,
      });
    }

    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    return line;
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public dispose(): void {
    this.group.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Sprite) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    });
    this.group.clear();
  }
}
