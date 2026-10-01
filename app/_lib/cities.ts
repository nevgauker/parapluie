/**
 * The three runner cities. Each one bends the same rules a different way:
 * how fast the street moves, how much cover the umbrella gives, how hard it
 * rains, and what she stops for. The signature hazard of each city lives in
 * cityEvents.ts; its furniture in cityStreet.ts.
 */

import { YELLOW_CANOPY, type Canopy } from './street';

export type CityId = 'newyork' | 'tokyo' | 'paris';

export interface GoalType { emoji: string; pts: number; dur: number; pause: number }
export interface ObstacleType { emoji: string; w: number; h: number }

export interface City {
  name: string;
  /** One line under the city picker. */
  hint: string;
  /** Street speed multiplier. */
  pace: number;
  /** Umbrella cover radius multiplier. */
  cover: number;
  /** How fast the follower soaks outside cover, as a multiplier. */
  soak: number;
  /** Raindrops on screen. */
  rain: number;
  /** Roadway width on wide screens, px. */
  road: number;
  canopy: Canopy;
  goals: GoalType[];
  obstacles: ObstacleType[];
}

export const CITIES: Record<CityId, City> = {
  // Fast and wide. Nobody lingers; the danger comes off the road.
  newyork: {
    name: 'New York',
    hint: 'Fast streets, wide cover. When a taxi honks, get off the kerb.',
    pace: 1.25, cover: 1, soak: 1, rain: 100, road: 320,
    canopy: YELLOW_CANOPY,
    goals: [
      { emoji: '🌭', pts: 90, dur: 7, pause: 1.0 },
      { emoji: '🥨', pts: 70, dur: 8, pause: 1.0 },
      { emoji: '☕', pts: 70, dur: 9, pause: 1.2 },
      { emoji: '🚕', pts: 150, dur: 5, pause: 0.4 },
      { emoji: '📰', pts: 60, dur: 10, pause: 0.8 },
      { emoji: '🐕', pts: 120, dur: 9, pause: 1.5 },
    ],
    obstacles: [
      { emoji: '🚧', w: 64, h: 36 },
      { emoji: '🗑️', w: 42, h: 42 },
      { emoji: '📦', w: 56, h: 46 },
    ],
  },
  // A narrow alley under lanterns. Petals warn of the wind.
  tokyo: {
    name: 'Tokyo',
    hint: 'Narrow alleys. Petals warn of a gust: step downwind.',
    pace: 1.05, cover: 0.9, soak: 1, rain: 110, road: 250,
    canopy: {
      base: '#d8322c', lit: '#f2604e', shade: '#9e1f1c',
      rib: 'rgba(90,14,12,0.55)', halo: '230,70,60',
    },
    goals: [
      { emoji: '🍜', pts: 120, dur: 9, pause: 2.0 },
      { emoji: '🍡', pts: 70, dur: 8, pause: 1.2 },
      { emoji: '🌸', pts: 60, dur: 11, pause: 1.5 },
      { emoji: '🐈', pts: 90, dur: 8, pause: 1.8 },
      { emoji: '🏮', pts: 50, dur: 12, pause: 1.0 },
      { emoji: '🎮', pts: 100, dur: 7, pause: 1.5 },
    ],
    obstacles: [
      { emoji: '🛵', w: 70, h: 44 },
      { emoji: '🚲', w: 60, h: 40 },
      { emoji: '🗑️', w: 40, h: 40 },
    ],
  },
  // A slow stroll in heavy rain under a small umbrella. She lingers everywhere.
  paris: {
    name: 'Paris',
    hint: 'Slow strolls, small umbrella, heavy rain. Duck under café awnings.',
    pace: 0.8, cover: 0.8, soak: 1.35, rain: 150, road: 300,
    canopy: {
      base: '#22355e', lit: '#3d5590', shade: '#141f3c',
      rib: 'rgba(8,14,30,0.6)', halo: '120,150,220',
    },
    goals: [
      { emoji: '☕', pts: 80, dur: 10, pause: 2.8 },
      { emoji: '🥐', pts: 90, dur: 9, pause: 2.4 },
      { emoji: '🍷', pts: 110, dur: 9, pause: 3.0 },
      { emoji: '🌹', pts: 60, dur: 12, pause: 2.0 },
      { emoji: '🎨', pts: 100, dur: 8, pause: 2.6 },
      { emoji: '📚', pts: 70, dur: 11, pause: 2.2 },
    ],
    obstacles: [
      { emoji: '🚲', w: 64, h: 40 },
      { emoji: '🪑', w: 54, h: 48 },
      { emoji: '🌳', w: 50, h: 50 },
    ],
  },
};

export const CITY_IDS = Object.keys(CITIES) as CityId[];
