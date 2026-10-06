import * as THREE from 'three';
import type { MoppleInteriorObject, MoppleMaterial } from '../project/schema.ts';

export interface FurnitureFootprint {
  width: number;
  depth: number;
  color: string;
  label: string;
}

// Default standard footprint dimensions (in meters) for each kind
export { DEFAULT_FURNITURE_SIZES } from '../project/furniture-dimensions.ts';
import { DEFAULT_FURNITURE_SIZES } from '../project/furniture-dimensions.ts';

export function getFurnitureFootprint(obj: MoppleInteriorObject): FurnitureFootprint {
  const defaults = DEFAULT_FURNITURE_SIZES[obj.kind] || { width: 1, height: 1, depth: 1 };
  const width = (obj.size?.x ?? defaults.width) * (obj.scale?.x ?? 1);
  const depth = (obj.size?.z ?? defaults.depth) * (obj.scale?.z ?? 1);
  const colors: Record<MoppleInteriorObject['kind'], string> = {
    sofa: '#7d9181',
    bed: '#8599a8',
    table: '#997c65',
    chair: '#7a827d',
    cabinet: '#697471',
    lamp: '#d4b35d',
    appliance: '#586b68',
    decoration: '#75947b',
    stairs: '#8a7b6b',
    fixture: '#6a827f',
  };
  return {
    width,
    depth,
    color: colors[obj.kind] || '#889988',
    label: obj.assetId || obj.kind,
  };
}

/**
 * Creates procedural 3D model for an interior object.
 */
export function createFurnitureMesh(
  obj: MoppleInteriorObject,
  materialsMap: Map<string, MoppleMaterial> = new Map()
): THREE.Group {
  const group = new THREE.Group();
  group.name = obj.id;
  group.userData = { id: obj.id, kind: obj.kind, assetId: obj.assetId, roomId: obj.roomId };

  // Helper to resolve material
  function getMaterial(slotName: string, fallbackColor: string, roughness = 0.6, metalness = 0.1): THREE.Material {
    const override = obj.materialOverrides?.find(o => o.slot === slotName) ?? (obj.materialId ? {materialId:obj.materialId} : undefined);
    if (override && materialsMap.has(override.materialId)) {
      const mat = materialsMap.get(override.materialId)!;
      return new THREE.MeshStandardMaterial({
        color: mat.color,
        roughness: mat.roughness,
        metalness: mat.metalness,
        transparent: mat.opacity < 1,
        opacity: mat.opacity,
      });
    }
    return new THREE.MeshStandardMaterial({ color: fallbackColor, roughness, metalness });
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);

  function addPart(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number],
    scale: [number, number, number],
    rot: [number, number, number] = [0, 0, 0]
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rot);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { parentId: obj.id };
    group.add(mesh);
    return mesh;
  }

  // Material definitions
  const woodMat = getMaterial('wood', '#826549', 0.75, 0.05);
  const darkMat = getMaterial('metal', '#282b2a', 0.5, 0.6);
  const fabricMat = getMaterial('upholstery', '#e3ddd3', 0.85, 0.0);
  const accentMat = getMaterial('accent', '#6b8071', 0.8, 0.0);
  const whiteMat = getMaterial('surface', '#f0ede6', 0.4, 0.05);
  const glassMat = getMaterial('glass', '#a2c8c0', 0.15, 0.2);

  switch (obj.kind) {
    case 'sofa': {
      // Base platform
      addPart(boxGeo, darkMat, [0, 0.08, 0], [2.2, 0.16, 0.95]);
      // Seat cushions (left and right)
      addPart(boxGeo, fabricMat, [-0.52, 0.28, 0.06], [1.02, 0.26, 0.8]);
      addPart(boxGeo, fabricMat, [0.52, 0.28, 0.06], [1.02, 0.26, 0.8]);
      // Backrest
      addPart(boxGeo, fabricMat, [0, 0.54, -0.36], [2.2, 0.45, 0.22]);
      // Armrests
      addPart(boxGeo, fabricMat, [-1.02, 0.42, 0], [0.18, 0.38, 0.95]);
      addPart(boxGeo, fabricMat, [1.02, 0.42, 0], [0.18, 0.38, 0.95]);
      // Throw pillows
      addPart(boxGeo, accentMat, [-0.85, 0.46, -0.2], [0.15, 0.28, 0.28], [0, 0.2, 0.2]);
      addPart(boxGeo, accentMat, [0.85, 0.46, -0.2], [0.15, 0.28, 0.28], [0, -0.2, -0.2]);
      break;
    }

    case 'bed': {
      // Wood frame / base
      addPart(boxGeo, woodMat, [0, 0.16, 0], [1.84, 0.32, 2.14]);
      // Headboard
      addPart(boxGeo, fabricMat, [0, 0.65, -1.02], [1.9, 0.75, 0.14]);
      // Mattress
      addPart(boxGeo, whiteMat, [0, 0.42, 0.04], [1.74, 0.25, 2.0]);
      // Duvet / Blanket
      addPart(boxGeo, accentMat, [0, 0.47, 0.26], [1.76, 0.18, 1.48]);
      // Pillows
      addPart(boxGeo, fabricMat, [-0.48, 0.6, -0.68], [0.65, 0.16, 0.44], [-0.2, 0, 0]);
      addPart(boxGeo, fabricMat, [0.48, 0.6, -0.68], [0.65, 0.16, 0.44], [-0.2, 0, 0]);
      break;
    }

    case 'table': {
      // Tabletop slab
      addPart(boxGeo, woodMat, [0, 0.72, 0], [1.6, 0.06, 0.9]);
      // 4 Legs
      const lx = 0.72, lz = 0.38;
      addPart(boxGeo, darkMat, [-lx, 0.35, -lz], [0.06, 0.7, 0.06]);
      addPart(boxGeo, darkMat, [lx, 0.35, -lz], [0.06, 0.7, 0.06]);
      addPart(boxGeo, darkMat, [-lx, 0.35, lz], [0.06, 0.7, 0.06]);
      addPart(boxGeo, darkMat, [lx, 0.35, lz], [0.06, 0.7, 0.06]);
      break;
    }

    case 'chair': {
      // Seat
      addPart(boxGeo, fabricMat, [0, 0.45, 0], [0.52, 0.06, 0.52]);
      // Backrest
      addPart(boxGeo, fabricMat, [0, 0.74, -0.23], [0.48, 0.36, 0.06]);
      // Legs
      const cl = 0.21;
      addPart(boxGeo, darkMat, [-cl, 0.22, -cl], [0.04, 0.44, 0.04]);
      addPart(boxGeo, darkMat, [cl, 0.22, -cl], [0.04, 0.44, 0.04]);
      addPart(boxGeo, darkMat, [-cl, 0.22, cl], [0.04, 0.44, 0.04]);
      addPart(boxGeo, darkMat, [cl, 0.22, cl], [0.04, 0.44, 0.04]);
      break;
    }

    case 'cabinet': {
      // Main body
      addPart(boxGeo, woodMat, [0, 0.45, 0], [1.4, 0.8, 0.5]);
      // Top slab
      addPart(boxGeo, whiteMat, [0, 0.86, 0], [1.44, 0.04, 0.54]);
      // Handles
      addPart(boxGeo, darkMat, [-0.3, 0.6, 0.26], [0.12, 0.03, 0.02]);
      addPart(boxGeo, darkMat, [0.3, 0.6, 0.26], [0.12, 0.03, 0.02]);
      // Feet
      addPart(boxGeo, darkMat, [-0.62, 0.03, -0.2], [0.04, 0.06, 0.04]);
      addPart(boxGeo, darkMat, [0.62, 0.03, -0.2], [0.04, 0.06, 0.04]);
      addPart(boxGeo, darkMat, [-0.62, 0.03, 0.2], [0.04, 0.06, 0.04]);
      addPart(boxGeo, darkMat, [0.62, 0.03, 0.2], [0.04, 0.06, 0.04]);
      break;
    }

    case 'lamp': {
      // Heavy base
      addPart(cylGeo, darkMat, [0, 0.025, 0], [0.36, 0.05, 0.36]);
      // Stem
      addPart(cylGeo, darkMat, [0, 0.72, 0], [0.03, 1.4, 0.03]);
      // Shade
      const shadeMat = new THREE.MeshStandardMaterial({
        color: '#fffae8',
        emissive: '#ffd875',
        emissiveIntensity: 0.6,
        roughness: 0.3,
      });
      addPart(cylGeo, shadeMat, [0, 1.35, 0], [0.42, 0.35, 0.42]);
      break;
    }

    case 'appliance': {
      // Kitchen unit / stove / fridge base
      addPart(boxGeo, whiteMat, [0, 0.44, 0], [0.9, 0.88, 0.65]);
      // Countertop
      addPart(boxGeo, darkMat, [0, 0.89, 0], [0.92, 0.04, 0.67]);
      // Cooktop burners / sink details
      addPart(cylGeo, darkMat, [-0.22, 0.915, -0.12], [0.18, 0.015, 0.18]);
      addPart(cylGeo, darkMat, [0.22, 0.915, -0.12], [0.18, 0.015, 0.18]);
      addPart(cylGeo, darkMat, [-0.22, 0.915, 0.15], [0.14, 0.015, 0.14]);
      addPart(cylGeo, darkMat, [0.22, 0.915, 0.15], [0.14, 0.015, 0.14]);
      break;
    }

    case 'decoration': {
      // Planter pot
      addPart(cylGeo, whiteMat, [0, 0.22, 0], [0.44, 0.44, 0.44]);
      // Plant foliage spheres
      const plantMat = new THREE.MeshStandardMaterial({ color: '#3d6342', roughness: 0.8 });
      const sphereGeo = new THREE.SphereGeometry(0.24, 12, 12);
      addPart(sphereGeo, plantMat, [0, 0.52, 0], [1, 1, 1]);
      addPart(sphereGeo, plantMat, [-0.12, 0.66, 0.08], [0.8, 0.8, 0.8]);
      addPart(sphereGeo, plantMat, [0.14, 0.62, -0.06], [0.85, 0.85, 0.85]);
      break;
    }

    case 'stairs': {
      // Architectural staircase: 12 steps climbing from y=0 to y=2.8m along Z axis
      const stepCount = 12;
      const stepWidth = 1.1;
      const stepHeight = 2.8 / stepCount;
      const stepDepth = 3.0 / stepCount;
      const stairMat = getMaterial('wood', '#a8947e', 0.6, 0.05);
      const railMat = getMaterial('metal', '#2b2a28', 0.3, 0.8);

      for (let s = 0; s < stepCount; s++) {
        const sy = (s + 0.5) * stepHeight;
        const sz = -1.5 + (s + 0.5) * stepDepth;
        addPart(boxGeo, stairMat, [0, sy, sz], [stepWidth, stepHeight, stepDepth]);
      }
      // Stringers / handrail
      addPart(boxGeo, railMat, [-stepWidth / 2 + 0.04, 1.8, 0], [0.04, 0.9, 3.2]);
      addPart(boxGeo, railMat, [stepWidth / 2 - 0.04, 1.8, 0], [0.04, 0.9, 3.2]);
      break;
    }

    case 'fixture': {
      // Bathroom vanity unit with washbasin, mirror & tap
      const vanityMat = getMaterial('stone', '#dcd8d0', 0.4, 0.1);
      const basinMat = getMaterial('ceramic', '#ffffff', 0.2, 0.0);
      const mirrorMat = getMaterial('glass', '#a8c6be', 0.05, 0.9);
      // Cabinet base
      addPart(boxGeo, vanityMat, [0, 0.42, 0], [1.1, 0.84, 0.55]);
      // Basin sink
      addPart(cylGeo, basinMat, [0, 0.85, 0], [0.45, 0.04, 0.35]);
      // Mirror above
      addPart(boxGeo, mirrorMat, [0, 1.45, -0.24], [0.9, 0.8, 0.03]);
      break;
    }

    default: {
      addPart(boxGeo, darkMat, [0, 0.4, 0], [0.8, 0.8, 0.8]);
      break;
    }
  }

  // Apply object transform
  group.position.set(obj.position.x, obj.position.y, obj.position.z);
  group.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
  if (obj.size) {
    const bounds=new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    group.scale.set(obj.size.x/Math.max(bounds.x,.001)*obj.scale.x,obj.size.y/Math.max(bounds.y,.001)*obj.scale.y,obj.size.z/Math.max(bounds.z,.001)*obj.scale.z);
  } else group.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);

  return group;
}

/**
 * Render 2D architectural symbol for an interior object on a canvas 2D context.
 */
export function drawFurniture2D(
  ctx: CanvasRenderingContext2D,
  obj: MoppleInteriorObject,
  isSelected: boolean
) {
  const footprint = getFurnitureFootprint(obj);
  const hw = footprint.width / 2;
  const hd = footprint.depth / 2;

  ctx.save();
  ctx.translate(obj.position.x, obj.position.z);
  ctx.rotate(-obj.rotation.y); // Canvas rotation

  // Object boundary fill
  ctx.fillStyle = isSelected ? 'rgba(168, 232, 210, 0.35)' : 'rgba(255, 255, 255, 0.08)';
  ctx.strokeStyle = isSelected ? '#a8e8d2' : '#627a72';
  ctx.lineWidth = isSelected ? 0.04 : 0.02;

  // Rounded rectangle
  const r = Math.min(0.1, hw, hd);
  ctx.beginPath();
  ctx.moveTo(-hw + r, -hd);
  ctx.lineTo(hw - r, -hd);
  ctx.quadraticCurveTo(hw, -hd, hw, -hd + r);
  ctx.lineTo(hw, hd - r);
  ctx.quadraticCurveTo(hw, hd, hw - r, hd);
  ctx.lineTo(-hw + r, hd);
  ctx.quadraticCurveTo(-hw, hd, -hw, hd - r);
  ctx.lineTo(-hw, -hd + r);
  ctx.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Internal architectural symbols depending on kind
  ctx.strokeStyle = isSelected ? '#a8e8d2' : '#8aa39b';
  ctx.lineWidth = 0.015;

  if (obj.kind === 'sofa') {
    // Cushion line and backrest line
    ctx.beginPath();
    ctx.moveTo(-hw, -hd * 0.4);
    ctx.lineTo(hw, -hd * 0.4);
    ctx.moveTo(0, -hd * 0.4);
    ctx.lineTo(0, hd);
    ctx.stroke();
  } else if (obj.kind === 'bed') {
    // Pillows and fold
    ctx.beginPath();
    ctx.moveTo(-hw, -hd * 0.2);
    ctx.lineTo(hw, -hd * 0.2);
    // Pillows
    const pw = hw * 0.7, ph = hd * 0.45;
    ctx.rect(-pw, -hd + 0.05, pw * 0.9, ph);
    ctx.rect(0.05, -hd + 0.05, pw * 0.9, ph);
    ctx.stroke();
  } else if (obj.kind === 'table') {
    // Diagonal subtle guide
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(hw, hd) * 0.35, 0, Math.PI * 2);
    ctx.stroke();
  } else if (obj.kind === 'appliance') {
    // Crossed burners or sink
    ctx.beginPath();
    ctx.arc(-hw * 0.4, 0, Math.min(hw, hd) * 0.3, 0, Math.PI * 2);
    ctx.arc(hw * 0.4, 0, Math.min(hw, hd) * 0.3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (obj.kind === 'stairs') {
    // 2D architectural stairs lines & climbing arrow
    ctx.beginPath();
    const steps = 10;
    for (let s = 1; s < steps; s++) {
      const z = -hd + (s / steps) * (2 * hd);
      ctx.moveTo(-hw, z);
      ctx.lineTo(hw, z);
    }
    // Up arrow line
    ctx.moveTo(0, -hd + 0.2);
    ctx.lineTo(0, hd - 0.2);
    ctx.stroke();
  } else if (obj.kind === 'fixture') {
    // Bathroom basin oval
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.6, hd * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Forward direction indicator (arrow on front edge)
  ctx.fillStyle = isSelected ? '#a8e8d2' : '#5b756b';
  ctx.beginPath();
  ctx.moveTo(0, hd);
  ctx.lineTo(-0.08, hd - 0.12);
  ctx.lineTo(0.08, hd - 0.12);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
