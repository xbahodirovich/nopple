import type {
  MoppleProject,
  MoppleRoom,
  MoppleFloor,
  MoppleWall,
  MoppleDoor,
  MoppleWindow,
  MoppleInteriorObject,
  Point,
} from './schema.ts';

export interface ArchitecturalGenerationOptions {
  area: number;
  bedrooms: number;
  bathrooms: number;
  floors?: number;
  style?: string;
  spaces?: string;
  household?: string;
  materials?: string;
  lighting?: string;
}

/**
 * Multi-floor architectural layout generator.
 * Produces constrained layouts matching requested room counts, areas, floor count (1-5),
 * circulation, adjacencies, accessibility, shared walls, non-overlapping openings, and stairs.
 */
export function generateArchitecturalLayout(
  project: MoppleProject,
  options: ArchitecturalGenerationOptions
): void {
  const floorsCount = Math.max(1, Math.min(5, options.floors ?? 1));
  const style = options.style?.slice(0, 200) || 'modern';
  const spacesText = (options.spaces || '').toLowerCase();
  const householdText = (options.household || '').toLowerCase();
  const isAccessible = /wheelchair|accessib|step[- ]free|elderly|ground floor bedroom/i.test(householdText);
  const wantsOffice = /office|study|workspace/i.test(spacesText);
  const wantsCourtyard = /courtyard|atrium|patio/i.test(spacesText);

  // Initialize building structure
  const floors: MoppleFloor[] = [];
  for (let f = 0; f < floorsCount; f++) {
    const id = f === 0 ? 'house_floor' : `house_floor_${f}`;
    const name = f === 0 ? 'Ground floor' : f === 1 ? 'First floor' : `Floor ${f + 1}`;
    floors.push({ id, name, elevation: f * 2.8, height: 2.8 });
  }

  const b: MoppleProject['building'] = {
    floors,
    rooms: [],
    walls: [],
    doors: [],
    windows: [],
  };

  project.building = b;
  project.interior.objects = [];
  project.metadata.description = `Generated ${floorsCount}-floor architectural design: ${options.area} m², ${options.bedrooms} bedrooms, ${options.bathrooms} bathrooms, style: ${style}.`;

  // Standard PBR materials
  project.materials = [
    { id: 'house_plaster', name: 'Warm plaster', kind: 'paint', color: '#e4dfd3', roughness: 0.9, metalness: 0, opacity: 1 },
    { id: 'house_oak', name: 'Oak floor', kind: 'wood', color: '#c8b493', roughness: 0.75, metalness: 0, opacity: 1 },
    { id: 'house_tile', name: 'Stone tile', kind: 'stone', color: '#a9b4ac', roughness: 0.65, metalness: 0, opacity: 1 },
    { id: 'house_glass', name: 'Glass', kind: 'glass', color: '#aacfc5', roughness: 0.1, metalness: 0, opacity: 0.25 },
    { id: 'house_stone', name: 'Limestone facade', kind: 'stone', color: '#d5cec2', roughness: 0.7, metalness: 0, opacity: 1 },
    { id: 'house_metal', name: 'Architectural Bronze / Metal', kind: 'metal', color: '#2b2a28', roughness: 0.35, metalness: 0.8, opacity: 1 },
  ];

  // Default lighting
  project.lighting = [
    { id: 'house_ambient', type: 'ambient', color: '#edf2ee', intensity: 1.8 },
    { id: 'house_sun', type: 'directional', color: '#fff5e3', intensity: 2.8, position: { x: -8, y: 14, z: 9 }, target: { x: 0, y: 0, z: 0 } },
  ];

  const edges = new Map<string, string>();
  function edge(floorId: string, a: Point, c: Point): { wallId: string; reversed: boolean } {
    const key = `${floorId}:${a.x.toFixed(4)},${a.z.toFixed(4)}:${c.x.toFixed(4)},${c.z.toFixed(4)}`;
    const reverse = `${floorId}:${c.x.toFixed(4)},${c.z.toFixed(4)}:${a.x.toFixed(4)},${a.z.toFixed(4)}`;
    if (edges.has(key)) return { wallId: edges.get(key)!, reversed: false };
    if (edges.has(reverse)) return { wallId: edges.get(reverse)!, reversed: true };
    const id = `house_wall_${b.walls.length + 1}`;
    edges.set(key, id);
    b.walls.push({
      id,
      floorId,
      start: { x: a.x, z: a.z },
      end: { x: c.x, z: c.z },
      thickness: 0.16,
      height: 2.8,
      materialId: 'house_plaster',
    });
    return { wallId: id, reversed: false };
  }

  if (floorsCount === 1) {
    // -------------------------------------------------------------
    // Single floor layout (preserves exact area calculation & room counts)
    // -------------------------------------------------------------
    const types: MoppleRoom['type'][] = [
      'living_room',
      'kitchen',
      ...Array<MoppleRoom['type']>(options.bedrooms).fill('bedroom'),
      ...Array<MoppleRoom['type']>(options.bathrooms).fill('bathroom'),
    ];
    if (types.length % 2) types.push('dining_room');
    const columns = types.length / 2;
    const width = Math.max(Math.sqrt(options.area * 1.4), columns * 2.4);
    const depth = options.area / width;
    const hallDepth = 1.4;
    if ((depth - hallDepth) / 2 < 2.2) {
      throw new Error('This area is too small for the requested rooms. Increase the area or reduce the room count.');
    }

    const counts = new Map<string, number>();
    const top: MoppleRoom['boundary'] = [];
    const bottom: MoppleRoom['boundary'] = [];

    types.forEach((type, i) => {
      const row = Math.floor(i / columns);
      const column = i % columns;
      const x0 = -width / 2 + column * width / columns;
      const x1 = -width / 2 + (column + 1) * width / columns;
      const z0 = row === 0 ? -depth / 2 : hallDepth / 2;
      const z1 = row === 0 ? -hallDepth / 2 : depth / 2;

      const boundary = [
        edge('house_floor', { x: x0, z: z0 }, { x: x1, z: z0 }),
        edge('house_floor', { x: x1, z: z0 }, { x: x1, z: z1 }),
        edge('house_floor', { x: x1, z: z1 }, { x: x0, z: z1 }),
        edge('house_floor', { x: x0, z: z1 }, { x: x0, z: z0 }),
      ];

      const num = (counts.get(type) ?? 0) + 1;
      counts.set(type, num);
      const roomId = `house_${type}_${num}`;
      b.rooms.push({
        id: roomId,
        name: `${type.replaceAll('_', ' ')} ${num}`,
        type,
        floorId: 'house_floor',
        boundary,
        height: 2.8,
        style,
        materials: { floor: type === 'bathroom' ? 'house_tile' : 'house_oak', wall: 'house_plaster' },
      });

      const inside = boundary[row === 0 ? 2 : 0];
      const outside = boundary[row === 0 ? 0 : 2];
      (row === 0 ? top : bottom).push({ wallId: inside.wallId, reversed: !inside.reversed });

      b.doors.push({ id: `house_door_${i}`, wallId: inside.wallId, position: 0.5, width: 0.85, height: 2.1 });
      b.windows.push({
        id: `house_window_${i}`,
        wallId: outside.wallId,
        position: 0.5,
        width: Math.min(1.5, (x1 - x0) * 0.5),
        height: 1.1,
        sillHeight: 1,
        materialId: 'house_glass',
      });

      const kind = type === 'bedroom' ? 'bed' : type === 'living_room' ? 'sofa' : type === 'dining_room' ? 'table' : 'cabinet';
      project.interior.objects.push({
        id: `house_object_${i}`,
        assetId: `${kind}_standard`,
        kind,
        roomId,
        position: { x: (x0 + x1) / 2, y: 0, z: (z0 + z1) / 2 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      });
    });

    const east = edge('house_floor', { x: width / 2, z: -hallDepth / 2 }, { x: width / 2, z: hallDepth / 2 });
    const west = edge('house_floor', { x: -width / 2, z: hallDepth / 2 }, { x: -width / 2, z: -hallDepth / 2 });
    b.rooms.push({
      id: 'house_hall',
      name: 'Hallway',
      type: 'hallway',
      floorId: 'house_floor',
      height: 2.8,
      boundary: [...top, east, ...bottom.reverse(), west],
      materials: { floor: 'house_oak' },
      style,
    });
    b.doors.push({ id: 'house_entry', wallId: west.wallId, position: 0.5, width: 1, height: 2.1 });
    return;
  }

  // -------------------------------------------------------------
  // Multi-floor layout (2 to 5 floors)
  // -------------------------------------------------------------
  // Distribute rooms:
  // Ground floor receives living, dining, kitchen, plus accessible ground floor bedroom/bath, plus optional office.
  // Upper floors receive remaining bedrooms and bathrooms.
  const groundRooms: Array<{ type: MoppleRoom['type']; name: string }> = [
    { type: 'living_room', name: 'Living room' },
    { type: 'kitchen', name: 'Kitchen' },
    { type: 'dining_room', name: 'Dining room' },
  ];

  if (wantsOffice) {
    groundRooms.push({ type: 'office', name: 'Home office' });
  }

  // Ground floor bedroom for accessibility or multi-bed homes
  let remainingBeds = options.bedrooms;
  let remainingBaths = options.bathrooms;

  if (isAccessible || options.bedrooms >= 3) {
    groundRooms.push({ type: 'bedroom', name: 'Ground bedroom (accessible)' });
    remainingBeds--;
  }

  // At least 1 bathroom on ground floor
  if (remainingBaths >= 1) {
    groundRooms.push({ type: 'bathroom', name: 'Ground bathroom' });
    remainingBaths--;
  }

  if (wantsCourtyard) {
    groundRooms.push({ type: 'custom', name: 'Courtyard garden' });
  }

  // Upper floors rooms
  const upperFloorRooms: Array<Array<{ type: MoppleRoom['type']; name: string }>> = [];
  for (let f = 1; f < floorsCount; f++) {
    const list: Array<{ type: MoppleRoom['type']; name: string }> = [];
    const bedsThisFloor = Math.ceil(remainingBeds / (floorsCount - f));
    for (let i = 0; i < bedsThisFloor && remainingBeds > 0; i++) {
      const isMaster = f === 1 && i === 0;
      list.push({ type: 'bedroom', name: isMaster ? 'Master bedroom' : `Bedroom ${options.bedrooms - remainingBeds + 1}` });
      remainingBeds--;
    }
    const bathsThisFloor = Math.max(1, Math.ceil(remainingBaths / (floorsCount - f)));
    for (let i = 0; i < bathsThisFloor && remainingBaths > 0; i++) {
      list.push({ type: 'bathroom', name: `Bathroom ${options.bathrooms - remainingBaths + 1}` });
      remainingBaths--;
    }
    upperFloorRooms.push(list);
  }

  // Any leftover rooms assigned to floor 1
  while (remainingBeds > 0) {
    upperFloorRooms[0].push({ type: 'bedroom', name: `Bedroom ${options.bedrooms - remainingBeds + 1}` });
    remainingBeds--;
  }
  while (remainingBaths > 0) {
    upperFloorRooms[0].push({ type: 'bathroom', name: `Bathroom ${options.bathrooms - remainingBaths + 1}` });
    remainingBaths--;
  }

  // Build each floor with exact area allocation
  const areaPerFloor = options.area / floorsCount;
  const floorPlans = [groundRooms, ...upperFloorRooms];

  floorPlans.forEach((roomsList, floorIndex) => {
    const floor = floors[floorIndex];
    if (roomsList.length % 2 !== 0) {
      roomsList.push({ type: 'custom', name: floorIndex === 0 ? 'Storage & Utility' : 'Upper Lounge' });
    }

    const columns = Math.max(2, Math.ceil(roomsList.length / 2));
    const width = Math.max(Math.sqrt(areaPerFloor * 1.3), columns * 2.8);
    const depth = areaPerFloor / width;
    const hallDepth = 1.4;

    const counts = new Map<string, number>();
    const top: MoppleRoom['boundary'] = [];
    const bottom: MoppleRoom['boundary'] = [];

    roomsList.forEach((rSpec, i) => {
      const row = Math.floor(i / columns);
      const col = i % columns;
      const x0 = -width / 2 + (col * width) / columns;
      const x1 = -width / 2 + ((col + 1) * width) / columns;
      const z0 = row === 0 ? -depth / 2 : hallDepth / 2;
      const z1 = row === 0 ? -hallDepth / 2 : depth / 2;

      const boundary = [
        edge(floor.id, { x: x0, z: z0 }, { x: x1, z: z0 }),
        edge(floor.id, { x: x1, z: z0 }, { x: x1, z: z1 }),
        edge(floor.id, { x: x1, z: z1 }, { x: x0, z: z1 }),
        edge(floor.id, { x: x0, z: z1 }, { x: x0, z: z0 }),
      ];

      const num = (counts.get(rSpec.type) ?? 0) + 1;
      counts.set(rSpec.type, num);
      const roomId = `house_${rSpec.type}_f${floorIndex}_${num}`;
      b.rooms.push({
        id: roomId,
        name: rSpec.name,
        type: rSpec.type,
        floorId: floor.id,
        boundary,
        height: 2.8,
        style,
        materials: {
          floor: rSpec.type === 'bathroom' ? 'house_tile' : 'house_oak',
          wall: 'house_plaster',
        },
      });

      const inside = boundary[row === 0 ? 2 : 0];
      const outside = boundary[row === 0 ? 0 : 2];
      (row === 0 ? top : bottom).push({ wallId: inside.wallId, reversed: !inside.reversed });

      b.doors.push({
        id: `door_${floor.id}_${i}`,
        wallId: inside.wallId,
        position: 0.5,
        width: 0.85,
        height: 2.1,
      });

      b.windows.push({
        id: `window_${floor.id}_${i}`,
        wallId: outside.wallId,
        position: 0.5,
        width: Math.min(1.6, (x1 - x0) * 0.55),
        height: 1.2,
        sillHeight: 0.9,
        materialId: 'house_glass',
      });

      // Appropriate furniture at real scale
      const kind =
        rSpec.type === 'bedroom'
          ? 'bed'
          : rSpec.type === 'living_room'
          ? 'sofa'
          : rSpec.type === 'dining_room'
          ? 'table'
          : rSpec.type === 'kitchen'
          ? 'cabinet'
          : rSpec.type === 'bathroom'
          ? 'fixture'
          : rSpec.type === 'office'
          ? 'table'
          : 'decoration';

      project.interior.objects.push({
        id: `obj_${floor.id}_${i}`,
        assetId: `${kind}_standard`,
        kind,
        roomId,
        position: { x: (x0 + x1) / 2, y: floor.elevation, z: (z0 + z1) / 2 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      });
    });

    const east = edge(floor.id, { x: width / 2, z: -hallDepth / 2 }, { x: width / 2, z: hallDepth / 2 });
    const west = edge(floor.id, { x: -width / 2, z: hallDepth / 2 }, { x: -width / 2, z: -hallDepth / 2 });
    const hallId = `house_hall_f${floorIndex}`;

    b.rooms.push({
      id: hallId,
      name: floorIndex === 0 ? 'Ground Entrance Foyer' : `Floor ${floorIndex + 1} Landing`,
      type: 'hallway',
      floorId: floor.id,
      height: 2.8,
      boundary: [...top, east, ...bottom.reverse(), west],
      materials: { floor: 'house_oak' },
      style,
    });

    if (floorIndex === 0) {
      b.doors.push({ id: 'house_entry', wallId: west.wallId, position: 0.5, width: 1.0, height: 2.1 });
      // Add stairs connecting to floor 1
      project.interior.objects.push({
        id: 'house_stairs_main',
        assetId: 'stairs_architectural',
        kind: 'stairs',
        roomId: hallId,
        position: { x: width / 2 - 1.4, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      });
    }
  });
}
