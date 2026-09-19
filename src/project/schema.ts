import { z } from 'zod';

export const FORMAT = 'mopple';
export const CURRENT_VERSION = '1.0';

export const idSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,127}$/);
const name = z.string().trim().min(1).max(200);
const positive = z.number().positive();
const nonnegative = z.number().nonnegative();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const pointSchema = z.strictObject({ x: z.number(), z: z.number() });
export const vectorSchema = z.strictObject({ x: z.number(), y: z.number(), z: z.number() });
const materialRefs = z.strictObject({ floor: idSchema.optional(), wall: idSchema.optional(), ceiling: idSchema.optional() });

export const floorSchema = z.strictObject({ id: idSchema, name, elevation: z.number(), height: positive });
export const roomSchema = z.strictObject({
  id: idSchema, name,
  type: z.enum(['living_room', 'bedroom', 'kitchen', 'bathroom', 'hallway', 'office', 'dining_room', 'garage', 'custom']),
  floorId: idSchema,
  // Ordered directed wall edges form a closed polygon. No duplicate room geometry.
  boundary: z.array(z.strictObject({ wallId: idSchema, reversed: z.boolean() })).min(3),
  height: positive, materials: materialRefs.optional(), style: name.optional(),
});
export const wallSchema = z.strictObject({
  id: idSchema, floorId: idSchema, start: pointSchema, end: pointSchema,
  thickness: positive, height: positive, materialId: idSchema.optional(),
});
const openingFields = {
  id: idSchema, wallId: idSchema, position: z.number().min(0).max(1),
  width: positive, height: positive, materialId: idSchema.optional(),
};
export const doorSchema = z.strictObject(openingFields);
export const windowSchema = z.strictObject({ ...openingFields, sillHeight: nonnegative });
export const objectSchema = z.strictObject({
  id: idSchema, assetId: idSchema, roomId: idSchema,
  kind: z.enum(['sofa', 'bed', 'table', 'chair', 'cabinet', 'lamp', 'decoration', 'appliance']),
  position: vectorSchema, rotation: vectorSchema,
  scale: z.strictObject({ x: positive, y: positive, z: positive }),
  materialOverrides: z.array(z.strictObject({ slot: name, materialId: idSchema })).optional(),
});
export const materialSchema = z.strictObject({
  id: idSchema, name,
  kind: z.enum(['paint', 'wood', 'stone', 'glass', 'metal', 'flooring', 'fabric', 'custom']),
  color, roughness: z.number().min(0).max(1), metalness: z.number().min(0).max(1),
  opacity: z.number().min(0).max(1),
});
export const lightSchema = z.discriminatedUnion('type', [
  z.strictObject({ id: idSchema, type: z.literal('ambient'), color, intensity: nonnegative }),
  z.strictObject({ id: idSchema, type: z.literal('directional'), color, intensity: nonnegative, position: vectorSchema, target: vectorSchema }),
  z.strictObject({ id: idSchema, type: z.literal('point'), color, intensity: nonnegative, position: vectorSchema, range: positive }),
]);
export const projectSchema = z.strictObject({
  format: z.literal(FORMAT), version: z.literal(CURRENT_VERSION),
  project: z.strictObject({
    id: idSchema, name, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
    units: z.literal('meters'),
  }),
  building: z.strictObject({ floors: z.array(floorSchema), rooms: z.array(roomSchema), walls: z.array(wallSchema), doors: z.array(doorSchema), windows: z.array(windowSchema) }),
  interior: z.strictObject({ objects: z.array(objectSchema) }),
  materials: z.array(materialSchema), lighting: z.array(lightSchema),
  metadata: z.strictObject({ description: z.string().max(4000).optional(), author: name.optional() }),
});

export type MoppleProject = z.infer<typeof projectSchema>;
export type MoppleBuilding = MoppleProject['building'];
export type MoppleFloor = z.infer<typeof floorSchema>;
export type MoppleRoom = z.infer<typeof roomSchema>;
export type MoppleWall = z.infer<typeof wallSchema>;
export type MoppleDoor = z.infer<typeof doorSchema>;
export type MoppleWindow = z.infer<typeof windowSchema>;
export type MoppleInteriorObject = z.infer<typeof objectSchema>;
export type MoppleMaterial = z.infer<typeof materialSchema>;
export type MoppleLight = z.infer<typeof lightSchema>;
export type Point = z.infer<typeof pointSchema>;
export type Vector = z.infer<typeof vectorSchema>;
