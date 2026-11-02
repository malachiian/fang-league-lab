import { RACES, STATS } from './data.js';
import { ACTIVITIES, ensureWeek, weekKey } from './weekly.js';

export const SAVE_KEY = 'fang-league-lab.career.v1';
const phases = new Set(['league', 'review', 'done']);
const tabs = new Set(['club', 'week', 'squad', 'recruit', 'upgrades', 'league', 'match']);
const integer = n => Number.isSafeInteger(n) && n >= 0;

function validGame(g) {
  if (!g || !integer(g.seed) || !integer(g.season) || g.season < 1 || !integer(g.round) || !phases.has(g.phase)) return false;
  const ids = new Set(RACES.map(r => r.id));
  if (!ids.has(g.playerId) || !Array.isArray(g.teams) || g.teams.length !== ids.size) return false;
  const player = p => p && typeof p.id === 'string' && typeof p.name === 'string' && ids.has(p.race)
    && integer(p.injury) && integer(p.xp) && integer(p.level)
    && STATS.every(s => Number.isFinite(p.stats?.[s]) && p.stats[s] >= 1 && p.stats[s] <= 20);
  if (new Set(g.teams.map(t => t.id)).size !== ids.size || !g.teams.every(t => ids.has(t.id) && ids.has(t.race)
    && typeof t.name === 'string' && ['fen', 'ridge'].includes(t.division)
    && ['gold', 'fans', 'won', 'drawn', 'lost', 'pf', 'pa', 'trainingLevel', 'stadiumLevel'].every(k => integer(t[k]))
    && Array.isArray(t.players) && t.players.length >= 1 && t.players.length <= 10 && t.players.every(player))) return false;
  return Array.isArray(g.schedule) && g.schedule.length === 10 && g.round <= 10
    && g.schedule.every(round => Array.isArray(round) && round.length === 6 && round.every(p => Array.isArray(p) && p.length === 2 && ids.has(p[0]) && ids.has(p[1])))
    && Array.isArray(g.pool) && g.pool.every(player)
    && ['trainsLeft', 'poolVersion', 'cups', 'titles'].every(k => integer(g[k]))
    && (g.phase !== 'done' || (g.finalApplied && g.finalReport?.res && g.finalReport?.report && ids.has(g.finalReport.cupWinnerId)))
    && (g.history == null || (Array.isArray(g.history) && g.history.every(m => integer(m.season) && integer(m.round) && ids.has(m.opponentId) && integer(m.us) && integer(m.them))))
    && (g.claimedGoals == null || (Array.isArray(g.claimedGoals) && g.claimedGoals.every(x => typeof x === 'string')))
    && validWeek(g);
}

function validReport(r) {
  return r && typeof r.key === 'string' && integer(r.season) && integer(r.week) && integer(r.cost) && integer(r.fansGained)
    && Array.isArray(r.entries) && r.entries.every(e => typeof e.name === 'string' && typeof e.playerId === 'string'
      && ACTIVITIES.includes(e.activity) && integer(e.cost) && Array.isArray(e.gains) && e.gains.every(s => typeof s === 'string'));
}

function validWeek(g) {
  if (!g.teams.every(t => t.clinicLevel == null || (integer(t.clinicLevel) && t.clinicLevel <= 3))) return false;
  if (g.clubReports != null && (!Array.isArray(g.clubReports) || g.clubReports.length > 12 || !g.clubReports.every(validReport))) return false;
  if (g.week == null) return true; // Version-one migration.
  const w = g.week;
  const playerIds = new Set(g.teams.find(t => t.id === g.playerId).players.map(p => p.id));
  return ['planning', 'ready'].includes(w.status) && typeof w.key === 'string'
    && (g.phase !== 'league' || w.key === weekKey(g))
    && w.assignments && typeof w.assignments === 'object' && !Array.isArray(w.assignments)
    && Object.entries(w.assignments).every(([id, activity]) => playerIds.has(id) && ACTIVITIES.includes(activity))
    && (w.status === 'planning' ? w.report === null : validReport(w.report) && w.report.key === w.key);
}

export function saveCareer(storage, game, ui) {
  if (!game || ui.screen === 'match') return { ok: true, skipped: true };
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 2, game, tab: ui.tab, savedAt: Date.now() }));
    return { ok: true };
  } catch {
    return { ok: false, message: 'Saving is unavailable. Keep this tab open to keep your career.' };
  }
}

export function loadCareer(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return { game: null };
    const save = JSON.parse(raw);
    if (![1, 2].includes(save.version) || !validGame(save.game)) throw new Error('Invalid career');
    if (save.version === 2 && !save.game.week) throw new Error('Incomplete weekly save');
    if (save.version === 1) {
      // Keep an untouched recovery copy where storage permits, then migrate in memory.
      try { if (!storage.getItem(`${SAVE_KEY}.backup-v1`)) storage.setItem(`${SAVE_KEY}.backup-v1`, raw); } catch { /* Main save still remains readable. */ }
    }
    ensureWeek(save.game);
    return { game: save.game, tab: tabs.has(save.tab) ? save.tab : 'club', savedAt: save.savedAt };
  } catch {
    return { game: null, message: 'Your saved career could not be loaded. Starting a new club will replace it.' };
  }
}

export function clearCareer(storage) {
  try { storage.removeItem(SAVE_KEY); return true; } catch { return false; }
}
