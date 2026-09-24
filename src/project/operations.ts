import { z } from 'zod';
import { doorSchema, floorSchema, geoSchema, idSchema, lightSchema, materialSchema, objectSchema, pointSchema, roomSchema, vectorSchema, wallSchema, windowSchema } from './schema.ts';
import { MoppleValidationError } from './validation.ts';

export const operationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('rename_project'), name: z.string().trim().min(1).max(200) }),
  z.strictObject({ type: z.literal('create_house'), area: z.number().min(40).max(600), bedrooms: z.number().int().min(1).max(8), bathrooms: z.number().int().min(1).max(5), style: z.string().trim().min(1).max(200) }),
  z.strictObject({ type: z.literal('add_floor'), floor: floorSchema }),
  z.strictObject({ type: z.literal('create_room'), room: roomSchema }),
  z.strictObject({ type: z.literal('remove_room'), targetId: idSchema }),
  z.strictObject({ type: z.literal('update_room'), targetId: idSchema, changes: roomSchema.omit({ id: true, floorId: true, boundary: true }).partial() }),
  z.strictObject({ type: z.literal('resize_room'), targetId: idSchema, width: z.number().positive(), depth: z.number().positive() }),
  z.strictObject({ type: z.literal('add_wall'), wall: wallSchema }),
  z.strictObject({ type: z.literal('move_wall'), targetId: idSchema, start: pointSchema, end: pointSchema }),
  z.strictObject({ type: z.literal('update_wall'), targetId: idSchema, changes: wallSchema.pick({ thickness: true, height: true, materialId: true }).partial() }),
  z.strictObject({ type: z.literal('remove_wall'), targetId: idSchema }),
  z.strictObject({ type: z.literal('add_door'), door: doorSchema }),
  z.strictObject({ type: z.literal('add_window'), window: windowSchema }),
  z.strictObject({ type: z.literal('add_object'), object: objectSchema }),
  z.strictObject({ type: z.literal('move_object'), targetId: idSchema, position: vectorSchema, rotation: vectorSchema.optional(), roomId: idSchema.optional() }),
  z.strictObject({ type: z.literal('remove_object'), targetId: idSchema }),
  z.strictObject({ type: z.literal('scale_object'), targetId: idSchema, scale: objectSchema.shape.scale }),
  // Upsert a reusable material; all existing references immediately see its change.
  z.strictObject({ type: z.literal('change_material'), material: materialSchema }),
  z.strictObject({ type: z.literal('change_room_style'), targetId: idSchema, style: z.string().trim().min(1).max(200) }),
  z.strictObject({ type: z.literal('update_lighting'), lights: z.array(lightSchema) }),
  z.strictObject({ type: z.literal('update_geo'), geo: geoSchema }),
]);
export const operationsSchema = z.strictObject({ operations: z.array(operationSchema).min(1).max(100) });
export type MoppleOperation = z.infer<typeof operationSchema>;
export type MoppleOperations = z.infer<typeof operationsSchema>;

export function validateOperations(input: unknown): MoppleOperations {
  const result = operationsSchema.safeParse(input);
  if (!result.success) throw new MoppleValidationError(result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
  return result.data;
}
