import { BALANCE, STATS, STAT_LABEL, TRAITS, addXp, trainingCost } from './data.js';
import { hashSeed, makeRng } from './match.js';

export const ACTIVITIES = ['practice', ...STATS, 'recovery', 'outreach', 'rest'];
export const ACTIVITY_NAMES = {
  practice: 'Team practice', strength: 'Strength gym', speed: 'Running track',
  agility: 'Agility drills', passing: 'Passing drills', recovery: 'Treatment',
  outreach: 'Meet the fans', rest: 'Rest',
};
const ownTeam = state => state.teams.find(t => t.id === state.playerId);
export const weekKey = state => `${state.season}:${state.round}`;
export function capacities(team) {
  return { training: BALANCE.trainsPerWeek + team.trainingLevel,
    recovery: 1 + (team.clinicLevel || 0), outreach: 1 + team.stadiumLevel };
}
export function recoveryDetails(team) {
  const raw = Math.max(2, 8 - 2 * (team.clinicLevel || 0));
  return { cost: Math.round(raw * (TRAITS[team.trait]?.healMult || 1)), gain: (team.clinicLevel || 0) >= 2 ? 2 : 1 };
}

export function resetWeek(state) {
  state.week = { key: weekKey(state), status: 'planning', assignments: {}, report: null };
  state.trainsLeft = capacities(ownTeam(state)).training;
}

// Version-one careers retain purchases, stats and any already-spent training slots.
export function ensureWeek(state) {
  for (const team of state.teams) team.clinicLevel ??= 0;
  state.clubReports ??= [];
  if (!state.week) {
    const remaining = state.trainsLeft;
    resetWeek(state);
    if (Number.isInteger(remaining)) state.trainsLeft = Math.min(state.trainsLeft, remaining);
  }
  return state.week;
}

export function playerActivity(state, player) {
  return state.week?.assignments[player.id] || (player.injury > 0 ? 'rest' : 'practice');
}

export function activityEffect(team, player, activity) {
  if (STATS.includes(activity)) {
    const capped = player.stats[activity] >= BALANCE.statCap;
    return { cost: capped ? 0 : trainingCost(player.stats[activity], team.trainingLevel),
      text: capped ? 'At the stat cap. Choose another activity.' : `${STAT_LABEL[activity]} ${player.stats[activity]} → ${player.stats[activity] + 1}, +4 XP${team.trainingLevel >= 2 && player.stats[activity] < 19 ? '; 25% chance of +2 instead' : ''}` };
  }
  if (activity === 'recovery') {
    const details = recoveryDetails(team);
    return { cost: details.cost, text: `Injury ${player.injury} → ${Math.max(0, player.injury - details.gain)} matches out` };
  }
  if (activity === 'outreach') return { cost: 0, text: '+1 fan for the club; no training XP' };
  if (activity === 'practice') return { cost: 0, text: '+2 XP toward the next level' };
  return { cost: 0, text: 'No cost or gains. Injuries still tick down after a match.' };
}

export function previewWeek(state) {
  ensureWeek(state);
  const team = ownTeam(state);
  const limits = capacities(team);
  limits.training = state.trainsLeft;
  const used = { training: 0, recovery: 0, outreach: 0 };
  const errors = [];
  const rows = team.players.map(player => {
    const activity = playerActivity(state, player);
    const effect = activityEffect(team, player, activity);
    if (!ACTIVITIES.includes(activity)) errors.push(`${player.name}: choose a valid activity.`);
    if (STATS.includes(activity)) {
      used.training++;
      if (player.stats[activity] >= BALANCE.statCap) errors.push(`${player.name}: ${STAT_LABEL[activity]} is at the cap.`);
    }
    if (activity === 'recovery') {
      used.recovery++;
      if (player.injury <= 0) errors.push(`${player.name} is already fit. Choose practice or a different activity.`);
    }
    if (activity === 'outreach') used.outreach++;
    if (player.injury > 0 && !['recovery', 'rest'].includes(activity)) errors.push(`${player.name} is injured and needs treatment or rest.`);
    return { player, activity, ...effect };
  });
  for (const kind of Object.keys(limits)) {
    if (used[kind] > limits[kind]) errors.push(`${kind === 'training' ? 'Coached training' : kind === 'recovery' ? 'Treatment' : 'Fan outreach'} uses ${used[kind]} places; ${limits[kind]} available.`);
  }
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  if (cost > team.gold) errors.push(`The plan costs ${cost}g; you have ${team.gold}g. Remove a paid session or choose free practice.`);
  return { rows, used, limits, cost, remaining: team.gold - cost, errors, ok: errors.length === 0 };
}

export function assignActivity(state, playerId, activity) {
  ensureWeek(state);
  if (state.phase !== 'league' || state.week.status !== 'planning') return { ok: false, reason: 'This week is finished. Play the match to open a new week.' };
  const player = ownTeam(state).players.find(p => p.id === playerId);
  if (!player || !ACTIVITIES.includes(activity)) return { ok: false, reason: 'Choose a player and an activity.' };
  if (player.injury > 0 && !['recovery', 'rest'].includes(activity)) return { ok: false, reason: 'Injured players need treatment or rest.' };
  if (activity === 'recovery' && player.injury <= 0) return { ok: false, reason: 'This player is already fit.' };
  if (STATS.includes(activity) && player.stats[activity] >= BALANCE.statCap) return { ok: false, reason: 'That stat is already at the cap.' };
  state.week.assignments[playerId] = activity;
  return { ok: true };
}

export function advanceWeek(state) {
  ensureWeek(state);
  if (state.phase !== 'league' || state.week.key !== weekKey(state)) return { ok: false, reason: 'No preparation week is available.' };
  if (state.week.status === 'ready') return { ok: false, reason: 'This week has already been completed.' };
  const preview = previewWeek(state);
  if (!preview.ok) return { ok: false, reason: preview.errors.join(' ') };
  const team = ownTeam(state);
  const fansBefore = team.fans;
  const entries = [];
  // Validate the whole plan first; one charge and one application per week.
  team.gold -= preview.cost;
  for (const row of preview.rows) {
    const p = row.player;
    const before = { stats: { ...p.stats }, xp: p.xp, level: p.level, injury: p.injury };
    let xp = 0;
    let notes = [];
    if (STATS.includes(row.activity)) {
      const rng = makeRng(hashSeed(state.seed, 'weekly', state.season, state.round, p.id, row.activity));
      const gain = team.trainingLevel >= 2 && rng.next() < BALANCE.trainBonusChance ? 2 : 1;
      p.stats[row.activity] = Math.min(BALANCE.statCap, p.stats[row.activity] + gain);
      xp = 4;
    } else if (row.activity === 'practice') xp = 2;
    else if (row.activity === 'recovery') p.injury = Math.max(0, p.injury - recoveryDetails(team).gain);
    else if (row.activity === 'outreach') team.fans += 1;
    if (xp) notes = addXp(p, xp);
    const gains = STATS.filter(stat => p.stats[stat] !== before.stats[stat]).map(stat => `${STAT_LABEL[stat]} ${before.stats[stat]} → ${p.stats[stat]}`);
    if (xp) gains.push(`+${xp} XP`);
    if (p.level > before.level) gains.push(`Level ${before.level} → ${p.level}`);
    if (p.injury !== before.injury) gains.push(`Injury ${before.injury} → ${p.injury}`);
    if (row.activity === 'outreach') gains.push('+1 fan');
    entries.push({ playerId: p.id, name: p.name, position: p.position, activity: row.activity,
      cost: row.cost, xp, before, after: { stats: { ...p.stats }, xp: p.xp, level: p.level, injury: p.injury },
      gains, notes });
  }
  const report = { key: weekKey(state), season: state.season, week: state.round + 1,
    cost: preview.cost, fansGained: team.fans - fansBefore, entries };
  state.week.report = report;
  state.week.status = 'ready';
  state.trainsLeft = 0;
  state.clubReports.push(report);
  state.clubReports = state.clubReports.slice(-12);
  return { ok: true, report };
}

export function readyForMatch(state) {
  return state.week?.key === weekKey(state) && state.week.status === 'ready';
}
