import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {MoppleProjectEngine} from '../src/project/engine.ts';
import {interpretPromptLocally} from '../src/editor/ai.ts';
import {validateProject} from '../src/project/validation.ts';
const demo=JSON.parse(readFileSync(new URL('../examples/modern-house.mopple',import.meta.url),'utf8'));
const prompts=[
 'Create a 120 sqm home with 2 bedrooms and 1 bathroom',
 'Generate a 150 sqm house with 3 bedrooms and 2 bathrooms',
 'Build a minimal 100 sqm apartment with 2 bedrooms and 1 bathroom',
 'Design a 180 sqm home with 4 bedrooms and 2 bathrooms',
 'Create a 90 sqm house with 1 bedroom and 1 bathroom',
 'Создай дом 120 м² с 2 спальнями и 1 ванной',
 'Спроектируй квартиру 150 м² с 3 спальнями и 2 ванными',
 '120 m2 uy yarat 2 yotoqxona 1 hammom',
 '150 m2 xonadon loyihala 3 yotoqxona 2 hammom',
 'Create a cozy 140 sqm home with 3 bedrooms and 1 bathroom'
];
for(const prompt of prompts){const engine=new MoppleProjectEngine(demo);const operations=interpretPromptLocally(prompt,demo);assert.ok(operations.some(o=>o.type==='create_house'),prompt);engine.applyOperations({operations});const project=validateProject(engine.getSnapshot());assert.ok(project.building.rooms.length>=4);console.log(`PASS ${prompt}`);}
console.log(`${prompts.length} generation and validation checks passed.`);
