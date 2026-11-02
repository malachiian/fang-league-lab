import { RACES, raceById } from './data.js';

// Presentation order only. Keep simulation order stable for existing careers/seeds.
export const CORE_TEAMS = ['humans', 'orcs', 'darkelves', 'doomsworn', 'lizardfolk', 'elves'].map(raceById);
export const WIP_TEAMS = RACES.filter(race => !CORE_TEAMS.includes(race));
