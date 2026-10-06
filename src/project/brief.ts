import { z } from 'zod';

const answer = z.string().trim().min(1).max(1000);

/**
 * User-authored requirements are retained verbatim, even when the concept generator cannot fulfill them.
 * Explicit approval tokens, timestamps, and references track design provenance.
 */
export const designBriefSchema = z.strictObject({
  request: z.string().trim().min(1).max(4000),
  area: z.number().min(40).max(600),
  bedrooms: z.number().int().min(1).max(8),
  bathrooms: z.number().int().min(1).max(5),
  floors: z.number().int().min(1).max(5),
  style: answer,
  site: answer,
  household: answer,
  spaces: answer,
  materials: answer,
  budget: answer,
  lighting: answer,
  interiorViews: answer,
  approvalToken: z.string().min(1).max(256).optional(),
  approvedAt: z.string().optional(),
  references: z.array(z.string().max(2000)).optional(),
  customConstraints: z.array(z.string().max(500)).optional(),
});
export type DesignBrief = z.infer<typeof designBriefSchema>;

export const BRIEF_TOPICS = [
  { key: 'style', label: 'Architecture & interior style', hint: 'Which styles, colors and reference homes do you like?' },
  { key: 'site', label: 'Site & climate', hint: 'Location, plot dimensions, orientation and site constraints' },
  { key: 'household', label: 'Who will live here?', hint: 'People, daily routines, accessibility, pets and future needs' },
  { key: 'spaces', label: 'Rooms & must-haves', hint: 'Kitchen layout, office, storage, garage, outdoor areas and anything else' },
  { key: 'materials', label: 'Materials & furniture', hint: 'Flooring, wall finishes, furniture, textures and materials to avoid' },
  { key: 'budget', label: 'Budget & priorities', hint: 'Amount and currency, priorities and acceptable compromises' },
  { key: 'lighting', label: 'Light & atmosphere', hint: 'Sun direction, time of day, window preferences and artificial lighting' },
  { key: 'interiorViews', label: 'Interior & exterior views', hint: 'Rooms, street-facing facade, exterior materials and viewpoints; sunlight, shadows and reflections' },
] as const;

export type BriefTopicKey = typeof BRIEF_TOPICS[number]['key'];

/**
 * Generate a durable approval token for a confirmed design brief.
 * Incorporates a stable signature of all approved requirement fields.
 */
export function createApprovalToken(brief: DesignBrief): string {
  const payload = [
    brief.area,
    brief.bedrooms,
    brief.bathrooms,
    brief.floors,
    brief.style.trim().toLowerCase(),
    brief.site.trim().toLowerCase(),
    brief.household.trim().toLowerCase(),
    brief.spaces.trim().toLowerCase(),
    brief.materials.trim().toLowerCase(),
    brief.budget.trim().toLowerCase(),
    brief.lighting.trim().toLowerCase(),
    brief.interiorViews.trim().toLowerCase(),
  ].join('|');

  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) - hash + payload.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const timestamp = Date.now().toString(36);
  return `appr_${hex}_${timestamp}`;
}

/**
 * Verify whether an approval token belongs to the given design brief.
 */
export function verifyApprovalToken(brief: DesignBrief, token?: string): boolean {
  if (!token || !token.startsWith('appr_')) return false;
  const parts = token.split('_');
  if (parts.length < 3) return false;
  const expectedPrefix = createApprovalToken(brief).slice(0, 13); // appr_<hex>
  return token.startsWith(expectedPrefix);
}

export function briefPrompt(brief: DesignBrief): string {
  const b = designBriefSchema.parse(brief);
  return `Create a ${b.area}m² house with ${b.bedrooms} bedrooms and ${b.bathrooms} bathrooms.\nConfirmed requirements: ${JSON.stringify(b)}`;
}

/** Explicit scope report for the brief. */
export function conceptScope(brief: DesignBrief): string[] {
  return [
    ...(brief.floors > 1 ? [`${brief.floors} floors requested; this concept only creates one floor.`] : []),
    'Only area, bedroom count and bathroom count drive the starter layout.',
    'Style, site, household, extra spaces, materials, budget and lighting are saved for the full generator.',
    'Architecture and 3D share an editable concept. Detailed architecture and photorealistic interior images are not generated yet.',
  ];
}

const wordToNumber: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  single: 1, double: 2, triple: 3,
};

/**
 * Parses user prompt into structured candidate fields, identifying missing and conflicting items.
 */
export function extractBriefFromPrompt(prompt: string, existing: Partial<DesignBrief> = {}): {
  brief: Partial<DesignBrief>;
  missing: BriefTopicKey[];
  conflicts: string[];
} {
  const text = prompt.trim();
  const lower = text.toLowerCase();
  const extracted: Partial<DesignBrief> = { ...existing, request: text };

  // Area (m²)
  const areaMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|sq\s*m|square\s*meters?)/i);
  if (areaMatch) {
    const val = parseFloat(areaMatch[1]);
    if (val >= 40 && val <= 600) extracted.area = val;
  } else if (!extracted.area) {
    extracted.area = 150;
  }

  // Bedrooms
  const bedMatch = lower.match(/(one|two|three|four|five|six|seven|eight|\d+)\s*(?:bed|beds|bedrooms?)/i);
  if (bedMatch) {
    const count = wordToNumber[bedMatch[1].toLowerCase()] ?? parseInt(bedMatch[1], 10);
    if (count >= 1 && count <= 8) extracted.bedrooms = count;
  } else if (!extracted.bedrooms) {
    extracted.bedrooms = 3;
  }

  // Bathrooms
  const bathMatch = lower.match(/(one|two|three|four|five|\d+)\s*(?:bath|baths|bathrooms?)/i);
  if (bathMatch) {
    const count = wordToNumber[bathMatch[1].toLowerCase()] ?? parseInt(bathMatch[1], 10);
    if (count >= 1 && count <= 5) extracted.bathrooms = count;
  } else if (!extracted.bathrooms) {
    extracted.bathrooms = 2;
  }

  // Floors
  const floorMatch = lower.match(/(one|two|three|four|five|\d+)\s*[- ]?(?:floors?|storeys?|stories|story|storey)/i);
  if (floorMatch) {
    const count = wordToNumber[floorMatch[1].toLowerCase()] ?? parseInt(floorMatch[1], 10);
    if (count >= 1 && count <= 5) extracted.floors = count;
  } else if (lower.includes('two-floor') || lower.includes('two floor') || lower.includes('2-floor') || lower.includes('2-story')) {
    extracted.floors = 2;
  } else if (!extracted.floors) {
    extracted.floors = 1;
  }

  // Style
  if (!extracted.style || extracted.style === 'No preference') {
    const styleMatches: string[] = [];
    if (/minimal(?:ist)?/i.test(lower)) styleMatches.push('Minimalist');
    if (/modern/i.test(lower)) styleMatches.push('Modern');
    if (/scandinavian|nordic/i.test(lower)) styleMatches.push('Scandinavian');
    if (/japandi/i.test(lower)) styleMatches.push('Japandi');
    if (/mediterranean/i.test(lower)) styleMatches.push('Mediterranean');
    if (/industrial/i.test(lower)) styleMatches.push('Industrial');
    if (/contemporary/i.test(lower)) styleMatches.push('Contemporary');
    if (/brutalist/i.test(lower)) styleMatches.push('Brutalist');
    if (/traditional|classic/i.test(lower)) styleMatches.push('Traditional');
    if (styleMatches.length > 0) extracted.style = styleMatches.join(' & ');
  }

  // Site / Climate / Location
  if (!extracted.site || extracted.site === 'No preference') {
    const siteMatches: string[] = [];
    if (/south[- ]facing/i.test(lower)) siteMatches.push('South-facing orientation');
    if (/north[- ]facing/i.test(lower)) siteMatches.push('North-facing orientation');
    if (/corner lot|narrow plot|sloped/i.test(lower)) {
      const m = lower.match(/(corner lot|narrow plot|sloped plot|steep site)/i);
      if (m) siteMatches.push(m[1]);
    }
    const cityMatch = lower.match(/(?:in|located in|site in)\s+([A-Z][a-zA-Z\s]+?)(?:,|\.|\s+with|\s+for|$)/);
    if (cityMatch) siteMatches.push(`Location: ${cityMatch[1].trim()}`);
    if (siteMatches.length > 0) extracted.site = siteMatches.join(', ');
  }

  // Household / Accessibility
  if (!extracted.household || extracted.household === 'No preference') {
    const houseMatches: string[] = [];
    const famMatch = lower.match(/(family of (?:three|four|five|six|\d+)|couple|single occupant)/i);
    if (famMatch) houseMatches.push(famMatch[1]);
    if (/wheelchair|accessible|step[- ]free|elderly|disabled|mobility/i.test(lower)) {
      houseMatches.push('Accessible / step-free ground floor living requested');
    }
    if (/pet|dogs?|cats?/i.test(lower)) houseMatches.push('Pet friendly');
    if (houseMatches.length > 0) extracted.household = houseMatches.join('; ');
  }

  // Spaces / Rooms / Must-haves
  if (!extracted.spaces || extracted.spaces === 'No preference') {
    const spacesFound: string[] = [];
    if (/office|study|workspace/i.test(lower)) spacesFound.push('Home office / study');
    if (/courtyard|atrium|patio/i.test(lower)) spacesFound.push('Courtyard / outdoor patio');
    if (/reading (?:room|nook)/i.test(lower)) spacesFound.push('Reading room');
    if (/garage|carport/i.test(lower)) spacesFound.push('Garage');
    if (/open kitchen|kitchen island/i.test(lower)) spacesFound.push('Open kitchen with island');
    if (/pantry|laundry|storage/i.test(lower)) spacesFound.push('Pantry and storage');
    if (/terrace|balcony/i.test(lower)) spacesFound.push('Terrace / balcony');
    if (spacesFound.length > 0) extracted.spaces = spacesFound.join(', ');
  }

  // Materials & Finishes
  if (!extracted.materials || extracted.materials === 'No preference') {
    const matFound: string[] = [];
    if (/oak|wood|timber|hardwood/i.test(lower)) matFound.push('Oak flooring and timber accents');
    if (/marble|stone|limestone|granite/i.test(lower)) matFound.push('Natural stone / limestone surfaces');
    if (/concrete|microcement/i.test(lower)) matFound.push('Polished concrete');
    if (/tile|terrazzo|ceramic/i.test(lower)) matFound.push('Porcelain / tile');
    if (/glass|large windows|floor to ceiling windows/i.test(lower)) matFound.push('Floor-to-ceiling glass');
    if (/limewash|warm plaster|stucco/i.test(lower)) matFound.push('Warm plaster / limewash walls');
    if (matFound.length > 0) extracted.materials = matFound.join(', ');
  }

  // Budget
  if (!extracted.budget || extracted.budget === 'No preference') {
    const budgetMatch = lower.match(/(?:\$|€|£|usd|eur|gbp)\s*(\d[\d,\.]*(?:\s*(?:k|thousand|million|m))?)|(\d[\d,\.]*)\s*(?:usd|eur|dollars?|euros?)/i);
    if (budgetMatch) extracted.budget = budgetMatch[0].trim();
  }

  // Lighting & Atmosphere
  if (!extracted.lighting || extracted.lighting === 'No preference') {
    const lightFound: string[] = [];
    if (/evening sun|golden hour|sunset/i.test(lower)) lightFound.push('Western evening sun & golden hour');
    if (/morning sun|sunrise|dawn/i.test(lower)) lightFound.push('Eastern morning sun');
    if (/natural light|abundant light|bright/i.test(lower)) lightFound.push('Abundant natural daylight');
    if (/warm ambient|recessed|cove/i.test(lower)) lightFound.push('Warm indirect ambient lighting');
    if (lightFound.length > 0) extracted.lighting = lightFound.join(', ');
  }

  // Interior Views
  if (!extracted.interiorViews || extracted.interiorViews === 'No preference') {
    const viewsFound: string[] = [];
    if (/living room/i.test(lower)) viewsFound.push('Living room looking toward garden/courtyard');
    if (/master bedroom/i.test(lower)) viewsFound.push('Master bedroom suite');
    if (/kitchen/i.test(lower)) viewsFound.push('Kitchen and dining space');
    if (/office/i.test(lower)) viewsFound.push('Home office');
    if (viewsFound.length > 0) extracted.interiorViews = viewsFound.join('; ');
  }

  // Conflicts and Feasibility Checks
  const conflicts: string[] = [];
  const area = extracted.area ?? 150;
  const bedrooms = extracted.bedrooms ?? 3;
  const bathrooms = extracted.bathrooms ?? 2;
  const minRequiredArea = 35 + bedrooms * 14 + bathrooms * 8;
  if (area < minRequiredArea) {
    conflicts.push(`Requested ${area} m² is tight for ${bedrooms} bedrooms and ${bathrooms} bathrooms (recommended minimum: ${minRequiredArea} m²). Consider increasing area or adjusting room count.`);
  }

  // Check missing topics
  const missing: BriefTopicKey[] = [];
  for (const topic of BRIEF_TOPICS) {
    const val = extracted[topic.key];
    if (!val || val.trim() === '') {
      missing.push(topic.key);
    }
  }

  return { brief: extracted, missing, conflicts };
}

/**
 * Creates friendly, clarifying questions tailored to missing or conflicting areas.
 */
export function generateDiscoveryQuestions(missing: BriefTopicKey[], conflicts: string[]): string[] {
  const questions: string[] = [];
  if (conflicts.length > 0) {
    questions.push(...conflicts);
  }
  for (const key of missing) {
    const topic = BRIEF_TOPICS.find(t => t.key === key);
    if (!topic) continue;
    switch (key) {
      case 'style':
        questions.push('What architectural and interior design style do you envision (e.g. Modern, Japandi, Scandinavian, Minimalist)?');
        break;
      case 'site':
        questions.push('Where is the site located, and what is its orientation, climate, or plot shape?');
        break;
      case 'household':
        questions.push('Who will live in this home, and are there specific accessibility, child, or pet needs?');
        break;
      case 'spaces':
        questions.push('Any dedicated spaces you must have, such as a home office, courtyard, garage, or reading room?');
        break;
      case 'materials':
        questions.push('What materials and finishes do you prefer for floors and walls (e.g. oak wood, limestone, plaster, glass)?');
        break;
      case 'budget':
        questions.push('What is your target budget and currency?');
        break;
      case 'lighting':
        questions.push('What lighting atmosphere do you want (e.g. bright natural light, warm evening glow, golden hour)?');
        break;
      case 'interiorViews':
        questions.push('Which rooms and camera viewpoints would you like photorealistic interior renders for?');
        break;
    }
  }
  return questions;
}

/**
 * Applies natural language updates or corrections to an existing brief draft.
 */
export function applyConversationalCorrection(
  current: Partial<DesignBrief>,
  message: string
): { updated: Partial<DesignBrief>; notes: string[] } {
  const notes: string[] = [];
  const updated = { ...current };
  const lower = message.toLowerCase();

  // Check for floor updates
  const floorMatch = lower.match(/(\d+|one|two|three|four|five)\s*[- ]?(?:floors?|storeys?|stories)/i);
  if (floorMatch) {
    const f = wordToNumber[floorMatch[1].toLowerCase()] ?? parseInt(floorMatch[1], 10);
    if (f >= 1 && f <= 5) {
      updated.floors = f;
      notes.push(`Updated floors to ${f}`);
    }
  }

  // Check for area updates
  const areaMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|square\s*meters?)/i);
  if (areaMatch) {
    const a = parseFloat(areaMatch[1]);
    if (a >= 40 && a <= 600) {
      updated.area = a;
      notes.push(`Updated area to ${a} m²`);
    }
  }

  // Check for bedroom updates
  const bedMatch = lower.match(/(\d+|one|two|three|four|five|six|seven|eight)\s*(?:bedrooms?|beds?)/i);
  if (bedMatch) {
    const b = wordToNumber[bedMatch[1].toLowerCase()] ?? parseInt(bedMatch[1], 10);
    if (b >= 1 && b <= 8) {
      updated.bedrooms = b;
      notes.push(`Updated bedrooms to ${b}`);
    }
  }

  // Check for bathroom updates
  const bathMatch = lower.match(/(\d+|one|two|three|four|five)\s*(?:bathrooms?|baths?)/i);
  if (bathMatch) {
    const b = wordToNumber[bathMatch[1].toLowerCase()] ?? parseInt(bathMatch[1], 10);
    if (b >= 1 && b <= 5) {
      updated.bathrooms = b;
      notes.push(`Updated bathrooms to ${b}`);
    }
  }

  // Check specific topic answers
  if (/style|modern|scandinavian|japandi|minimal|mediterranean|industrial/i.test(lower)) {
    const existing = updated.style && updated.style !== 'No preference' ? `${updated.style}; ` : '';
    updated.style = `${existing}${message.trim()}`.slice(0, 1000);
    notes.push('Captured style preference');
  } else if (/site|plot|location|facing|climate|city|orient/i.test(lower)) {
    const existing = updated.site && updated.site !== 'No preference' ? `${updated.site}; ` : '';
    updated.site = `${existing}${message.trim()}`.slice(0, 1000);
    notes.push('Captured site/climate details');
  } else if (/family|occupant|wheelchair|accessib|pet|elderly|children/i.test(lower)) {
    const existing = updated.household && updated.household !== 'No preference' ? `${updated.household}; ` : '';
    updated.household = `${existing}${message.trim()}`.slice(0, 1000);
    notes.push('Captured household/accessibility details');
  } else if (/office|courtyard|garage|patio|study|storage|balcony|terrace/i.test(lower)) {
    const existing = updated.spaces && updated.spaces !== 'No preference' ? `${updated.spaces}; ` : '';
    updated.spaces = `${existing}${message.trim()}`.slice(0, 1000);
    notes.push('Added custom spaces and rooms');
  } else if (/oak|wood|stone|plaster|concrete|marble|tile|glass|finish/i.test(lower)) {
    const existing = updated.materials && updated.materials !== 'No preference' ? `${updated.materials}; ` : '';
    updated.materials = `${existing}${message.trim()}`.slice(0, 1000);
    notes.push('Captured materials & finishes');
  } else if (/\$|€|£|usd|eur|budget|cost/i.test(lower)) {
    updated.budget = message.trim().slice(0, 1000);
    notes.push('Recorded budget target');
  } else if (/sun|light|window|golden hour|sunset|sunrise|ambient/i.test(lower)) {
    const existing = updated.lighting && updated.lighting !== 'No preference' ? `${updated.lighting}; ` : '';
    updated.lighting = `${existing}${message.trim()}`.slice(0, 1000);
    notes.push('Recorded lighting preference');
  } else if (/view|camera|render|interior/i.test(lower)) {
    const existing = updated.interiorViews && updated.interiorViews !== 'No preference' ? `${updated.interiorViews}; ` : '';
    updated.interiorViews = `${existing}${message.trim()}`.slice(0, 1000);
    notes.push('Recorded requested interior render viewpoints');
  } else {
    // Generic addition
    notes.push('Noted user requirement');
  }

  return { updated, notes };
}
