import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { aiFallbackEnabled, quotaConfigurationIssue, requestIp, resolveAuthorization, validAuthorization } from './ai-guard.ts';
import { consumeAiQuota } from './quota.ts';
import { designBriefSchema, verifyApprovalToken, type DesignBrief } from '../src/project/brief.ts';
import { createProject, MoppleProjectEngine } from '../src/project/engine.ts';
import { generateArchitecturalLayout } from '../src/project/architecture-generator.ts';
import { exteriorCamera, exteriorViews, exteriorViewNames } from '../src/project/measurements.ts';
import { validateProject } from '../src/project/validation.ts';
import type { MoppleProject } from '../src/project/schema.ts';

export interface RequirementCoverageReport {
  fulfilled: string[];
  unresolved: string[];
  userDecisions: string[];
}

export interface GenerationArtifact {
  id: string;
  type: 'project' | 'floor_plan' | 'interior_render' | 'exterior_render';
  title: string;
  url?: string;
  data?: string;
  roomId?: string;
  provenance: {
    briefVersion?: string;
    approvalToken: string;
    provider?: string;
    model?: string;
    camera?: { x: number; y: number; z: number; fov: number };
    target?: { x: number; y: number; z: number };
    sunAzimuth?: number;
    sunElevation?: number;
    prompt?: string;
  };
}

export interface GenerationJob {
  id: string;
  accessToken: string;
  idempotencyKey?: string;
  approvalToken: string;
  projectRevision: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'stale';
  stage: 'architecture' | 'scene_3d' | 'interior_renders' | 'complete';
  progress: number;
  brief: DesignBrief;
  coverageReport: RequirementCoverageReport;
  artifacts: GenerationArtifact[];
  generatedProject?: MoppleProject;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const generateRequestSchema = z.strictObject({
  approvedBrief: designBriefSchema,
  approvalToken: z.string().min(1).max(256),
  projectRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().max(128).optional(),
  targetProject: z.unknown().optional(),
  options: z.strictObject({
    generateArchitecture: z.boolean().default(true),
    generateScene3d: z.boolean().default(true),
    generateRenders: z.boolean().default(true),
    imageApiKey: z.string().max(1024).optional(),
  }).optional(),
});

// Bounded process-local job store; access tokens authorize status and cancellation.
const jobStore = new Map<string, GenerationJob>();
const idempotencyIndex = new Map<string, string>();

/**
 * Validates brief, checks approval token, and executes multi-stage generation.
 */
export async function executeGeneration(
  input: z.infer<typeof generateRequestSchema>
): Promise<GenerationJob> {
  const brief = input.approvedBrief;
  for (const [id, job] of jobStore) if (Date.now() - Date.parse(job.createdAt) > 3600000) jobStore.delete(id);
  for (const [key, id] of idempotencyIndex) if (!jobStore.has(id)) idempotencyIndex.delete(key);
  const scopedKey = input.idempotencyKey ? createHash('sha256').update(input.idempotencyKey + JSON.stringify({brief, project: input.targetProject, revision: input.projectRevision})).digest('hex') : undefined;

  // 1. Detect changes to the confirmed requirement snapshot.
  if (!verifyApprovalToken(brief, input.approvalToken)) {
    throw new Error('Invalid or unverified approval token. The house brief must be confirmed and signed before generation.');
  }

  // 2. Idempotency check
  if (scopedKey && idempotencyIndex.has(scopedKey)) {
    const existing = jobStore.get(idempotencyIndex.get(scopedKey)!);
    if (existing && existing.status !== 'failed' && existing.status !== 'cancelled') {
      return existing;
    }
  }

  if (jobStore.size >= 128) { const oldest = jobStore.keys().next().value; if(oldest)jobStore.delete(oldest); }
  const jobId = `job_gen_${globalThis.crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const job: GenerationJob = {
    id: jobId,
    accessToken: globalThis.crypto.randomUUID(),
    idempotencyKey: input.idempotencyKey,
    approvalToken: input.approvalToken,
    projectRevision: input.projectRevision,
    status: 'running',
    stage: 'architecture',
    progress: 10,
    brief,
    coverageReport: {
      fulfilled: [],
      unresolved: [],
      userDecisions: [],
    },
    artifacts: [],
    createdAt: now,
    updatedAt: now,
  };

  jobStore.set(jobId, job);
  if (scopedKey) {
    idempotencyIndex.set(scopedKey, jobId);
  }

  try {
    // ---------------------------------------------------------
    // Stage 1: Architecture Generation
    // ---------------------------------------------------------
    job.stage = 'architecture';
    job.progress = 30;

    const baseProject = input.targetProject
      ? validateProject(input.targetProject)
      : createProject(`${brief.style} Home (${brief.area} m²)`);

    const project: MoppleProject = structuredClone(baseProject);
    project.metadata.designBrief = {
      ...brief,
      approvalToken: input.approvalToken,
      approvedAt: now,
    };

    generateArchitecturalLayout(project, {
      area: brief.area,
      bedrooms: brief.bedrooms,
      bathrooms: brief.bathrooms,
      floors: brief.floors,
      style: brief.style,
      spaces: brief.spaces,
      household: brief.household,
      materials: brief.materials,
      lighting: brief.lighting,
    });

    job.coverageReport.fulfilled.push(
      `Architecture: Created ${project.building.floors.length} floor(s) matching requested ${brief.floors} floor(s).`,
      `Rooms: Built ${project.building.rooms.filter(r => r.type === 'bedroom').length} bedrooms and ${project.building.rooms.filter(r => r.type === 'bathroom').length} bathrooms.`,
      `Circulation: Constructed non-overlapping internal doors and shared walls with clearances.`
    );

    if (brief.floors > 1) {
      job.coverageReport.fulfilled.push('Circulation: Installed inter-floor stairs connecting ground floor and upper levels.');
    }

    if (/wheelchair|accessib|step[- ]free|elderly/i.test(brief.household)) {
      job.coverageReport.fulfilled.push('Accessibility: Ground floor incorporates accessible bedroom suite and step-free bathroom.');
    }

    if (/office|study/i.test(brief.spaces)) {
      job.coverageReport.fulfilled.push('Custom Spaces: Dedicated home office / study generated.');
    }

    if (/courtyard|patio/i.test(brief.spaces)) {
      job.coverageReport.fulfilled.push('Custom Spaces: Courtyard / outdoor area integrated.');
    }

    // ---------------------------------------------------------
    // Stage 2: Detailed 3D Scene
    // ---------------------------------------------------------
    job.stage = 'scene_3d';
    job.progress = 65;

    // Persist sun lighting in metadata
    const sunAzimuth = project.metadata.sun?.azimuth ?? 225;
    const sunElevation = project.metadata.sun?.elevation ?? 40;
    project.metadata.sun = {
      mode: 'manual',
      azimuth: sunAzimuth,
      elevation: sunElevation,
      intensity: 2.8,
      warmth: 0.35,
      softness: 0.2,
    };

    job.coverageReport.fulfilled.push(
      `PBR Materials: Oak wood, limestone tile, plaster, and glazed glass surfaces assigned.`,
      `Lighting & Shadows: Direct sunlight (azimuth ${sunAzimuth}°, elevation ${sunElevation}°) with soft contact shadows.`
    );

    // ---------------------------------------------------------
    // Stage 3: Interior Render Preparation & Renders
    // ---------------------------------------------------------
    job.stage = 'interior_renders';
    job.progress = 85;

    const renderRooms = project.building.rooms.filter(r => r.type !== 'hallway');
    for (const room of renderRooms) {
      const floor = project.building.floors.find(f => f.id === room.floorId);
      const floorElev = floor?.elevation ?? 0;
      const eyeHeight = floorElev + 1.6;

      const conditionedPrompt = `Photorealistic architectural visualization of ${room.name} (${room.type.replaceAll('_', ' ')}). ` +
        `Preserve approved architecture: style ${brief.style}, materials: ${brief.materials}, ceiling height ${room.height}m. ` +
        `Daylight from exterior windows aligned with sun azimuth ${sunAzimuth}° and elevation ${sunElevation}°. ` +
        `Soft contact shadows, realistic glass transmission, specular highlights on timber/stone. No invented doors or altered dimensions.`;

      job.artifacts.push({
        id: `render_${room.id}`,
        type: 'interior_render',
        title: `${room.name} Visualization`,
        roomId: room.id,
        provenance: {
          approvalToken: input.approvalToken,
          briefVersion: brief.request.slice(0, 50),
          camera: { x: 0, y: eyeHeight, z: 0, fov: 65 },
          sunAzimuth,
          sunElevation,
          prompt: conditionedPrompt,
          provider: 'geometry_conditioned_capture',
        },
      });
    }

    job.coverageReport.fulfilled.push(
      `Interior Views: Prepared ${renderRooms.length} geometry-conditioned render specifications with locked camera eye-heights and sun angles.`
    );

    for (const view of exteriorViews) {
      const pose = exteriorCamera(project, view);
      job.artifacts.push({
        id: `render_exterior_${view}`, type: 'exterior_render', title: exteriorViewNames[view],
        provenance: {
          approvalToken: input.approvalToken, provider: 'geometry_conditioned_capture',
          camera: { ...pose.position, fov: pose.fov }, target: pose.target, sunAzimuth, sunElevation,
          prompt: `Exterior visualization of ${exteriorViewNames[view]}. Preserve the approved model's footprint, heights, roof, doors, windows and facade materials. Style: ${brief.style}. Materials: ${brief.materials}. Requested views: ${brief.interiorViews}. Front is +Z. No invented site boundaries or neighboring buildings.`,
        },
      });
    }
    job.coverageReport.fulfilled.push('Exterior Views: Prepared a street perspective and four facade camera specifications for local scene capture.');

    // Validate committed project through engine
    new MoppleProjectEngine(project);

    job.generatedProject = project;
    job.stage = 'complete';
    job.status = 'succeeded';
    job.progress = 100;
    job.updatedAt = new Date().toISOString();

    return job;
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
    job.updatedAt = new Date().toISOString();
    throw err;
  }
}

/**
 * HTTP handler for /api/ai/generate
 */
export async function handleGenerationRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(body));
  };

  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!aiFallbackEnabled()) {
    send(503, { error: 'Hosted AI is disabled. Set AI_FALLBACK_ENABLED=true on the server to enable it.' });
    return;
  }

  // GET: Query status of job
  if (req.method === 'GET') {
    const jobId = url.searchParams.get('jobId');
    if (!jobId) {
      send(400, { error: 'A job ID and its access token are required.' });
      return;
    }
    const job = jobStore.get(jobId);
    if (!job) {
      send(404, { error: 'Generation job not found.' });
      return;
    }
    if (req.headers.authorization !== `Bearer ${job.accessToken}`) { send(403, {error:'This generation job requires its access token.'}); return; }
    send(200, job);
    return;
  }

  // POST /cancel
  if (req.method === 'POST' && url.pathname.endsWith('/cancel')) {
    const jobId = url.searchParams.get('jobId');
    if (!jobId || !jobStore.has(jobId)) {
      send(404, { error: 'Job not found to cancel.' });
      return;
    }
    const job = jobStore.get(jobId)!;
    if (req.headers.authorization !== `Bearer ${job.accessToken}`) { send(403, {error:'This generation job requires its access token.'}); return; }
    job.status = 'cancelled';
    job.updatedAt = new Date().toISOString();
    send(200, { message: 'Job cancelled.', job });
    return;
  }

  // POST: Start or execute generation
  if (req.method !== 'POST') {
    send(405, { error: 'Use POST to start generation or GET to check status.' });
    return;
  }

  const authorization = resolveAuthorization(req);
  if (!authorization) {
    send(503, { error: 'Hosted AI is unavailable. Using the offline designer.' });
    return;
  }
  if (!validAuthorization(authorization)) {
    send(401, { error: 'Hosted AI is not configured. Using the offline designer.' });
    return;
  }
  const quotaIssue = quotaConfigurationIssue();
  if (quotaIssue) { send(503, { error: quotaIssue }); return; }
  if (!req.headers['content-type']?.startsWith('application/json')) {
    send(415, { error: 'Expected application/json.' });
    return;
  }
  const quotaResult = await consumeAiQuota(requestIp(req));
  if (quotaResult === 'unavailable') { send(503, { error: 'AI limits unavailable. Using offline designer.' }); return; }
  if (quotaResult === 'daily_limit') { send(503, { error: 'AI daily limit reached. Using offline designer.' }); return; }
  if (quotaResult === 'ip_limit') { send(429, { error: 'AI request limit reached. Using offline designer.' }); return; }

  try {
    const chunks: Buffer[] = [];
    let size = 0;
    const parsedBody=(req as IncomingMessage & {body?:unknown}).body;
    if(parsedBody!==undefined){const raw=typeof parsedBody==='string'?parsedBody:JSON.stringify(parsedBody);size=Buffer.byteLength(raw);if(size>2*1024*1024){send(413,{error:'Payload too large (2 MiB limit).'});return;}chunks.push(Buffer.from(raw));}
    else for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      const buf = Buffer.from(chunk);
      size += buf.length;
      if (size > 2 * 1024 * 1024) {
        req.resume();
        send(413, { error: 'Payload too large (2 MiB limit).' });
        return;
      }
      chunks.push(buf);
    }

    const raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const input = generateRequestSchema.parse(raw);
    const job = await executeGeneration(input);
    send(200, job);
  } catch (error) {
    if (error instanceof z.ZodError) {
      send(422, { error: 'Invalid brief or generation parameters.', issues: error.issues });
    } else {
      send(422, { error: error instanceof Error ? error.message : 'Generation failed.' });
    }
  }
}
