import * as THREE from 'three';
import type { SolarPosition } from './solar.ts';

/**
 * Procedural Dynamic Architectural Sky Dome that realistically adapts
 * atmospheric colors to the sun altitude (midday, golden hour, twilight, starry night).
 */
export class ArchitecturalSkyDome {
  public mesh: THREE.Mesh;
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D;
  private texture: THREE.Texture;
  private material: THREE.MeshBasicMaterial;

  constructor(radius = 350) {
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 128;
      this.canvas.height = 512;
      this.ctx = this.canvas.getContext('2d')!;

      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.generateMipmaps = false;
      this.texture.minFilter = THREE.LinearFilter;
      this.texture.magFilter = THREE.LinearFilter;
    } else {
      this.texture = new THREE.Texture();
    }

    const geometry = new THREE.SphereGeometry(radius, 32, 24);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'sky_dome';

    // Initial render: daytime
    this.renderGradient(45);
  }

  /**
   * Updates the sky dome gradient based on solar elevation
   */
  public update(solarPos: SolarPosition): void {
    this.renderGradient(solarPos.elevationDeg);
  }

  private renderGradient(elevationDeg: number): void {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    const grad = ctx.createLinearGradient(0, 0, 0, h);

    if (elevationDeg > 20) {
      // Clear architectural daytime
      const t = Math.min(1, (elevationDeg - 20) / 45);
      const zenith = new THREE.Color('#103b75').lerp(new THREE.Color('#1a529e'), t);
      const mid = new THREE.Color('#4c7eb8').lerp(new THREE.Color('#659bd6'), t);
      const horizon = new THREE.Color('#cbe0f2').lerp(new THREE.Color('#e0ecf7'), t);

      grad.addColorStop(0.0, zenith.getStyle());
      grad.addColorStop(0.45, mid.getStyle());
      grad.addColorStop(0.72, horizon.getStyle());
      grad.addColorStop(1.0, '#101714'); // ground nadir
    } else if (elevationDeg > 0) {
      // Golden Hour & Sunrise / Sunset
      const t = elevationDeg / 20;
      const zenith = new THREE.Color('#111828').lerp(new THREE.Color('#103b75'), t);
      const mid = new THREE.Color('#783b27').lerp(new THREE.Color('#4c7eb8'), t);
      const horizon = new THREE.Color('#ff7826').lerp(new THREE.Color('#cbe0f2'), t);

      grad.addColorStop(0.0, zenith.getStyle());
      grad.addColorStop(0.4, mid.getStyle());
      grad.addColorStop(0.7, horizon.getStyle());
      grad.addColorStop(1.0, '#0c110e');
    } else if (elevationDeg >= -6) {
      // Civil twilight (Blue Hour)
      const t = (elevationDeg + 6) / 6;
      const zenith = new THREE.Color('#070c17').lerp(new THREE.Color('#111828'), t);
      const mid = new THREE.Color('#211f38').lerp(new THREE.Color('#783b27'), t);
      const horizon = new THREE.Color('#693138').lerp(new THREE.Color('#ff7826'), t);

      grad.addColorStop(0.0, zenith.getStyle());
      grad.addColorStop(0.45, mid.getStyle());
      grad.addColorStop(0.72, horizon.getStyle());
      grad.addColorStop(1.0, '#080c0a');
    } else {
      // Deep starry night
      grad.addColorStop(0.0, '#04070f');
      grad.addColorStop(0.5, '#070c17');
      grad.addColorStop(0.72, '#0c121e');
      grad.addColorStop(1.0, '#060a08');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // If night, draw subtle stars in upper sky
    if (elevationDeg < -3) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      // Fixed pseudo-random distribution
      for (let i = 0; i < 60; i++) {
        const sx = (Math.sin(i * 123.45) * 0.5 + 0.5) * w;
        const sy = (Math.cos(i * 678.9) * 0.5 + 0.5) * (h * 0.45);
        ctx.fillRect(sx, sy, 1.2, 1.2);
      }
    }

    this.texture.needsUpdate = true;
  }

  public setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
