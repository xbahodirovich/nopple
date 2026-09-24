import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSolarPosition, Heliodon3D } from './solar.ts';
import { WORLD_CITY_PRESETS, DEFAULT_GEO } from './map.ts';
import { MoppleProjectEngine } from '../project/engine.ts';
import { parseProject } from '../project/validation.ts';
import {
  getWoodPlankTexture,
  getMarbleTexture,
  getTileTexture,
  getPlasterBumpTexture,
  getLawnTexture,
  getMapPlotTexture,
} from './textures.ts';
import { readFileSync } from 'node:fs';

const fixture = () => parseProject(readFileSync(new URL('../../examples/modern-house.mopple', import.meta.url), 'utf8'));

test('calculateSolarPosition accurately models noon, midnight, and daylight states', () => {
  // London on Summer Solstice (Day 172)
  const noon = calculateSolarPosition({
    latitude: 51.5074,
    longitude: -0.1278,
    dayOfYear: 172,
    timeHours: 12.0,
    northAngle: 0,
  });

  assert.equal(noon.isDaylight, true);
  assert.equal(noon.isNight, false);
  // Noon in London summer should have sun elevation ~61.9°
  assert.ok(noon.elevationDeg > 55 && noon.elevationDeg < 65, `Expected elevation ~62°, got ${noon.elevationDeg}`);
  assert.ok(noon.sunIntensity > 2.0);

  // London at midnight (0:00)
  const midnight = calculateSolarPosition({
    latitude: 51.5074,
    longitude: -0.1278,
    dayOfYear: 172,
    timeHours: 0.0,
    northAngle: 0,
  });

  assert.equal(midnight.isDaylight, false);
  assert.equal(midnight.isNight, true);
  assert.ok(midnight.elevationDeg < 0);
  assert.equal(midnight.sunIntensity, 0.35);

  // Sunrise and Sunset checks for London summer
  assert.ok(noon.sunriseHour >= 3.5 && noon.sunriseHour <= 5.5, `Sunrise should be ~4:30, got ${noon.sunriseHour}`);
  assert.ok(noon.sunsetHour >= 19.5 && noon.sunsetHour <= 22.0, `Sunset should be ~21:15, got ${noon.sunsetHour}`);
});

test('solar calculation respects True North compass bearing offset', () => {
  const dueNorth = calculateSolarPosition({
    latitude: 40.7128,
    longitude: -74.006,
    dayOfYear: 172,
    timeHours: 12.0,
    northAngle: 0,
  });

  const rotated90 = calculateSolarPosition({
    latitude: 40.7128,
    longitude: -74.006,
    dayOfYear: 172,
    timeHours: 12.0,
    northAngle: 90,
  });

  // Solar elevation is invariant to house rotation
  assert.ok(Math.abs(dueNorth.elevationDeg - rotated90.elevationDeg) < 1e-4);
  // Sun 3D X/Z position rotates with northAngle
  assert.notEqual(dueNorth.sunPosition.x, rotated90.sunPosition.x);
  assert.notEqual(dueNorth.sunPosition.z, rotated90.sunPosition.z);
});

test('engine supports update_geo operation, getGeo(), undo, and redo', () => {
  const engine = new MoppleProjectEngine(fixture());
  assert.equal(engine.getGeo(), undefined);

  const newGeo = {
    latitude: 41.2995,
    longitude: 69.2401,
    city: 'Tashkent',
    address: 'Amir Temur Avenue',
    northAngle: 45,
    mapUnderlay: true,
  };

  engine.updateGeo(newGeo);
  const geo = engine.getGeo();
  assert.ok(geo);
  assert.equal(geo?.city, 'Tashkent');
  assert.equal(geo?.latitude, 41.2995);
  assert.equal(geo?.longitude, 69.2401);
  assert.equal(geo?.northAngle, 45);
  assert.equal(geo?.mapUnderlay, true);

  // Undo
  assert.equal(engine.undo(), true);
  assert.equal(engine.getGeo(), undefined);

  // Redo
  assert.equal(engine.redo(), true);
  assert.equal(engine.getGeo()?.city, 'Tashkent');
});

test('world city presets contain valid geographic coordinates', () => {
  assert.ok(WORLD_CITY_PRESETS.length >= 10);
  for (const city of WORLD_CITY_PRESETS) {
    assert.ok(city.latitude >= -90 && city.latitude <= 90, `Bad lat for ${city.name}`);
    assert.ok(city.longitude >= -180 && city.longitude <= 180, `Bad lon for ${city.name}`);
    assert.ok(city.name.length > 0);
  }
  assert.ok(DEFAULT_GEO.latitude >= -90 && DEFAULT_GEO.latitude <= 90);
});

test('procedural textures execute safely without DOM in Node environment', () => {
  const wood = getWoodPlankTexture();
  assert.ok(wood);
  const marble = getMarbleTexture();
  assert.ok(marble);
  const tile = getTileTexture();
  assert.ok(tile);
  const plaster = getPlasterBumpTexture();
  assert.ok(plaster);
  const lawn = getLawnTexture();
  assert.ok(lawn);
  const mapPlot = getMapPlotTexture('Test Site', 40.7, -74.0, 30);
  assert.ok(mapPlot);
});
