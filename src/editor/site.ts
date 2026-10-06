import type { MoppleGeo } from '../project/schema.ts';

export interface CityPreset {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export const WORLD_CITY_PRESETS: CityPreset[] = [
  { name: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278, timezone: 'UTC+0' },
  { name: 'New York', country: 'United States', latitude: 40.7128, longitude: -74.0060, timezone: 'UTC-5' },
  { name: 'Tashkent', country: 'Uzbekistan', latitude: 41.2995, longitude: 69.2401, timezone: 'UTC+5' },
  { name: 'Tokyo', country: 'Japan', latitude: 35.6762, longitude: 139.6503, timezone: 'UTC+9' },
  { name: 'Paris', country: 'France', latitude: 48.8566, longitude: 2.3522, timezone: 'UTC+1' },
  { name: 'Dubai', country: 'United Arab Emirates', latitude: 25.2048, longitude: 55.2708, timezone: 'UTC+4' },
  { name: 'Sydney', country: 'Australia', latitude: -33.8688, longitude: 151.2093, timezone: 'UTC+10' },
  { name: 'Berlin', country: 'Germany', latitude: 52.5200, longitude: 13.4050, timezone: 'UTC+1' },
  { name: 'Zurich', country: 'Switzerland', latitude: 47.3769, longitude: 8.5417, timezone: 'UTC+1' },
  { name: 'Los Angeles', country: 'United States', latitude: 34.0522, longitude: -118.2437, timezone: 'UTC-8' },
  { name: 'Singapore', country: 'Singapore', latitude: 1.3521, longitude: 103.8198, timezone: 'UTC+8' },
];

export const DEFAULT_GEO: MoppleGeo = {
  latitude: 51.5074,
  longitude: -0.1278,
  city: 'London',
  address: 'Architectural Site Plot #1',
  northAngle: 0,
  mapUnderlay: false,
};

