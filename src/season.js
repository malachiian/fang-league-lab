/**
 * Season rules shared by the game and the headless balance sim.
 * Mutates plain objects only. No DOM.
 */
import {
  BALANCE,
  RACES,
  STATS,
  addXp,
  createPlayer,
  createRoster,
  facilityCost,
  focusFor,
  healCost,
  purse,
  raceById,
  recruitCost,
  trainingCost,
} from './data.js';
import { hashSeed, makeRng, simulateMatch } from './match.js';
import { ensureWeek, resetWeek, readyForMatch } from './weekly.js';

export function roundRobin(ids) {
  const list = ids.slice();
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds = [];
  let arr = list.slice();
  for (let r = 0; r < n - 1; r += 1) {
    const pairs = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a && b) pairs.push([a, b]);
    }
    rounds.push(pairs);
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr = [arr[0], ...rest];
  }
  return rounds;
}

function blankRecord() {
  return { won: 0, drawn: 0, lost: 0, pf: 0, pa: 0 };
}

export function divisionSchedule(teams) {
  const divisions = [...new Set(teams.map((t) => t.division))];
  const robins = divisions.map((division) => roundRobin(teams.filter((t) => t.division === division).map((t) => t.id)));
  const rounds = [];
  const count = Math.max(...robins.map((r) => r.length));
  for (let i = 0; i < count; i += 1) {
    rounds.push(robins.flatMap((robin) => robin[i] || []));
  }
  for (let i = 0; i < count; i += 1) {
    rounds.push(robins.flatMap((robin) => (robin[i] || []).map(([a, b]) => [b, a])));
  }
  return rounds;
}

export function newGame(raceId, seed) {
  const rng = makeRng(seed >>> 0);
  const teams = RACES.map((race) => {
    const roster = createRoster(race, rng, 0);
    return {
      id: race.id,
      race: race.id,
      name: race.team,
      short: race.short,
      trait: race.trait,
      division: race.division,
      isPlayer: race.id === raceId,
      gold: BALANCE.startGold,
      fans: BALANCE.startFans,
      trainingLevel: 0,
      stadiumLevel: 0,
      clinicLevel: 0,
      players: roster,
      ...blankRecord(),
    };
  });
  const state = {
    seed: seed >>> 0,
    season: 1,
    round: 0,
    phase: 'league',
    playerId: raceId,
    teams,
    schedule: divisionSchedule(teams),
    pool: [],
    poolVersion: 1,
    trainsLeft: BALANCE.trainsPerWeek,
    cups: 0,
    titles: 0,
    tableNoted: false,
    cupNoted: false,
    finalApplied: false,
    history: [],
    claimedGoals: [],
  };
  refreshPool(state);
  ensureWeek(state);
  return state;
}

export function playerTeam(state) {
  return state.teams.find((t) => t.id === state.playerId);
}

export function teamById(state, id) {
  return state.teams.find((t) => t.id === id);
}

function clampGold(team) {
  team.gold = Math.max(0, Math.floor(team.gold));
}

function rowFrom(team) {
  return {
    id: team.id,
    name: team.name,
    short: team.short,
    race: team.race,
    division: team.division,
    played: team.won + team.drawn + team.lost,
    won: team.won,
    drawn: team.drawn,
    lost: team.lost,
    pf: team.pf,
    pa: team.pa,
    diff: team.pf - team.pa,
    pts: team.won * 3 + team.drawn,
  };
}

function sortRows(rows) {
  rows.sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.pf - a.pf || a.name.localeCompare(b.name));
  return rows;
}

export function leagueTable(state) {
  return sortRows(state.teams.map(rowFrom));
}

export function divisionTable(state, division) {
  return sortRows(state.teams.filter((t) => t.division === division).map(rowFrom));
}

export function playerRank(state) {
  const team = playerTeam(state);
  const table = divisionTable(state, team.division);
  const row = table.find((r) => r.id === state.playerId);
  const index = table.findIndex((r) => r.id === state.playerId);
  const key = (r) => `${r.pts}:${r.diff}:${r.pf}`;
  let rank = 1;
  for (let i = 0; i < index; i += 1) {
    if (key(table[i]) !== key(row)) rank += 1;
  }
  const tied = table.filter((r) => key(r) === key(row)).length > 1;
  return { rank, tied, row, index, champion: index === 0, division: team.division };
}

export function playerFixture(state) {
  if (state.phase !== 'league') return null;
  const pairs = state.schedule[state.round] || [];
  return pairs.find((p) => p[0] === state.playerId || p[1] === state.playerId) || null;
}

export function fixtureSeed(state, round, a, b, tag = 'm') {
  return hashSeed(state.seed, tag, state.season, round, a, b);
}

function toSim(team) {
  return {
    id: team.id,
    name: team.name,
    race: team.race,
    trait: team.trait,
    tactic: team.tactic,
    lineup: team.lineup,
    players: team.players.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      race: p.race,
      injury: p.injury,
      stats: { ...p.stats },
    })),
  };
}

export function simById(state, idA, idB, seed, options = {}) {
  return simulateMatch(toSim(teamById(state, idA)), toSim(teamById(state, idB)), seed, options);
}

function resultOf(scoreFor, scoreAgainst) {
  if (scoreFor > scoreAgainst) return 'win';
  if (scoreFor < scoreAgainst) return 'loss';
  return 'draw';
}

export function applyFixture(state, idA, idB, res, opts = {}) {
  const countLeague = opts.league !== false;
  const A = teamById(state, idA);
  const B = teamById(state, idB);
  const resultA = resultOf(res.scoreA, res.scoreB);
  const resultB = resultOf(res.scoreB, res.scoreA);
  const payA = purse(A, resultA);
  const payB = purse(B, resultB);
  const fansBeforeA = A.fans;
  const fansBeforeB = B.fans;
  A.gold += payA.total;
  B.gold += payB.total;
  A.fans = Math.max(BALANCE.fansMin, A.fans + payA.fansDelta);
  B.fans = Math.max(BALANCE.fansMin, B.fans + payB.fansDelta);
  clampGold(A);
  clampGold(B);
  if (countLeague) {
    A.pf += res.scoreA;
    A.pa += res.scoreB;
    B.pf += res.scoreB;
    B.pa += res.scoreA;
    bump(A, resultA);
    bump(B, resultB);
  }
  const notes = [];
  const scorers = {};
  for (const ev of res.events) {
    if (ev.type === 'touchdown' && ev.actorId) scorers[ev.actorId] = (scorers[ev.actorId] || 0) + 1;
  }
  for (const c of res.casualties) {
    const team = c.team === 'A' ? A : B;
    const player = team.players.find((p) => p.id === c.playerId);
    if (!player) continue;
    player.injury = Math.max(player.injury, c.matchesOut);
    notes.push({
      teamId: team.id,
      text: `${player.name} is out for ${player.injury} match${player.injury === 1 ? '' : 'es'}.`,
    });
  }
  grantPlayed(A, res.playedA, scorers, notes);
  grantPlayed(B, res.playedB, scorers, notes);
  return {
    resultA,
    resultB,
    payA,
    payB,
    fansBeforeA,
    fansBeforeB,
    fansAfterA: A.fans,
    fansAfterB: B.fans,
    notes,
    scoreA: res.scoreA,
    scoreB: res.scoreB,
  };
}

function bump(team, result) {
  if (result === 'win') team.won += 1;
  else if (result === 'loss') team.lost += 1;
  else team.drawn += 1;
}

function grantPlayed(team, ids, scorers, notes) {
  for (const id of ids) {
    const player = team.players.find((p) => p.id === id);
    if (!player) continue;
    const gained = BALANCE.xpPlay + (scorers[id] || 0) * BALANCE.xpScore;
    for (const line of addXp(player, gained)) notes.push({ teamId: team.id, text: line });
  }
}

function captureOut(state) {
  const map = new Map();
  for (const team of state.teams) {
    map.set(team.id, new Set(team.players.filter((p) => p.injury > 0).map((p) => p.id)));
  }
  return map;
}

function decrementServed(state, wasOut) {
  for (const team of state.teams) {
    const set = wasOut.get(team.id) || new Set();
    for (const player of team.players) {
      if (set.has(player.id)) player.injury = Math.max(0, player.injury - 1);
    }
  }
}

export function aiManage(state) {
  for (const team of state.teams) {
    if (team.id === state.playerId) continue;
    const rng = makeRng(hashSeed(state.seed, 'ai', state.season, state.round, team.id, team.gold, team.players.length));
    const hurt = team.players.filter((p) => p.injury > 0);
    if (hurt.length && rng.next() < 0.55) {
      const target = hurt[rng.int(0, hurt.length - 1)];
      const cost = healCost(target.injury, team.trainingLevel, team.trait);
      if (team.gold >= cost + 36) {
        team.gold -= cost;
        target.injury = 0;
        clampGold(team);
      }
    }
    const fit = team.players.filter((p) => p.injury === 0);
    if (fit.length && rng.next() < 0.4) {
      const pick = fit[rng.int(0, fit.length - 1)];
      const stat = focusFor(pick);
      if (pick.stats[stat] < BALANCE.statCap) {
        const cost = trainingCost(pick.stats[stat], team.trainingLevel);
        if (team.gold >= cost + 50) applyTrain(team, pick, stat, rng);
      }
    }
    if (team.trainingLevel === 0 && team.gold >= 460 && rng.next() < 0.4) {
      team.gold -= BALANCE.trainingCosts[1];
      team.trainingLevel = 1;
      clampGold(team);
    }
  }
}

function applyTrain(team, player, stat, rng) {
  const cost = trainingCost(player.stats[stat], team.trainingLevel);
  if (team.gold < cost) return { ok: false, reason: `Need ${cost}g.`, cost };
  if (player.stats[stat] >= BALANCE.statCap) {
    return { ok: false, reason: `Already at the cap (${BALANCE.statCap}).`, cost };
  }
  team.gold -= cost;
  clampGold(team);
  const room = BALANCE.statCap - player.stats[stat];
  let gain = 1;
  if (room >= 2 && team.trainingLevel >= BALANCE.trainBonusLevel && rng.next() < BALANCE.trainBonusChance) gain = 2;
  player.stats[stat] += gain;
  const notes = addXp(player, BALANCE.xpTrain);
  return { ok: true, cost, gain, notes };
}

export function train(state, playerId, stat) {
  if (state.phase !== 'league' || state.week?.status === 'ready') return { ok: false, reason: 'Training is finished for this week.' };
  const team = playerTeam(state);
  const player = team.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: 'No such player.' };
  if (!STATS.includes(stat)) return { ok: false, reason: 'Pick a stat.' };
  if ((state.trainsLeft ?? 0) <= 0) {
    return { ok: false, reason: `No training sessions left this week (0/${BALANCE.trainsPerWeek}).`, cost: trainingCost(player.stats[stat] || 1, team.trainingLevel) };
  }
  const rng = makeRng(hashSeed(state.seed, 'train', player.id, stat, player.stats[stat], player.xp, team.gold, state.trainsLeft));
  const result = applyTrain(team, player, stat, rng);
  if (result.ok) state.trainsLeft -= 1;
  return result;
}

export function releaseBlock(team, playerId) {
  if (team.players.length - 1 < BALANCE.rosterMin) {
    return `Need at least ${BALANCE.rosterMin} players.`;
  }
  const fitAfter = team.players.filter((p) => p.id !== playerId && p.injury <= 0).length;
  if (fitAfter < BALANCE.fieldSize) {
    return `Need ${BALANCE.fieldSize} fit players.`;
  }
  return '';
}

export function heal(state, playerId) {
  const team = playerTeam(state);
  const player = team.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: 'No such player.' };
  if (player.injury <= 0) return { ok: false, reason: 'They are already fit.' };
  const cost = healCost(player.injury, team.trainingLevel, team.trait);
  if (team.gold < cost) return { ok: false, reason: `Need ${cost}g.`, cost };
  team.gold -= cost;
  clampGold(team);
  player.injury = 0;
  if (state.week?.status === 'planning' && state.week.assignments[playerId] === 'recovery') delete state.week.assignments[playerId];
  return { ok: true, cost };
}

export function release(state, playerId) {
  const team = playerTeam(state);
  const blocked = releaseBlock(team, playerId);
  if (blocked) return { ok: false, reason: blocked };
  const index = team.players.findIndex((p) => p.id === playerId);
  if (index < 0) return { ok: false, reason: 'No such player.' };
  const [gone] = team.players.splice(index, 1);
  if (team.lineup) team.lineup = team.lineup.filter(id => id !== playerId);
  if (state.week) delete state.week.assignments[playerId];
  return { ok: true, name: gone.name };
}

export function sign(state, poolIndex) {
  const team = playerTeam(state);
  const prospect = state.pool[poolIndex];
  if (!prospect) return { ok: false, reason: 'That scout slot is empty.' };
  if (team.players.length >= BALANCE.rosterMax) {
    return { ok: false, reason: `Roster is full (${BALANCE.rosterMax}).` };
  }
  const cost = recruitCost(prospect);
  if (team.gold < cost) return { ok: false, reason: `Need ${cost}g.`, cost };
  team.gold -= cost;
  clampGold(team);
  team.players.push(prospect);
  state.pool.splice(poolIndex, 1);
  return { ok: true, cost, name: prospect.name };
}

export function rerollPool(state) {
  const team = playerTeam(state);
  if (team.gold < BALANCE.scoutReroll) return { ok: false, reason: `Need ${BALANCE.scoutReroll}g.` };
  team.gold -= BALANCE.scoutReroll;
  clampGold(team);
  state.poolVersion += 1;
  refreshPool(state);
  return { ok: true, cost: BALANCE.scoutReroll };
}

export function upgrade(state, kind) {
  if (!['training', 'stadium', 'clinic'].includes(kind)) return { ok: false, reason: 'Choose a facility.' };
  const team = playerTeam(state);
  const key = { training: 'trainingLevel', stadium: 'stadiumLevel', clinic: 'clinicLevel' }[kind];
  const level = team[key] || 0;
  const cost = facilityCost(kind, level);
  if (cost == null) return { ok: false, reason: `Already maxed (level ${BALANCE.maxFacility}).` };
  if (team.gold < cost) return { ok: false, reason: `Need ${cost}g.`, cost };
  team.gold -= cost;
  clampGold(team);
  team[key] = level + 1;
  if (kind === 'training' && state.week?.status === 'planning') state.trainsLeft += 1;
  return { ok: true, cost, level: level + 1 };
}

export function refreshPool(state) {
  const team = playerTeam(state);
  const race = raceById(team.race);
  const rng = makeRng(hashSeed(state.seed, 'pool', state.season, state.round, state.poolVersion));
  const used = new Set(team.players.map((p) => p.name));
  state.pool = [0, 1, 2].map(() => {
    const position = rng.pick(race.positions);
    return createPlayer(race, position, rng, used, 0);
  });
}

export function resolveRound(state) {
  if (state.phase !== 'league') return [];
  if (state.round >= state.schedule.length) return [];
  if (!readyForMatch(state)) return [];
  const wasOut = captureOut(state);
  const reports = [];
  for (const [a, b] of state.schedule[state.round]) {
    const seed = fixtureSeed(state, state.round, a, b);
    const res = simById(state, a, b, seed, { record: a === state.playerId || b === state.playerId });
    const report = applyFixture(state, a, b, res);
    reports.push({ a, b, res, report });
    if (a === state.playerId || b === state.playerId) {
      const home = a === state.playerId;
      (state.history ||= []).push({ season: state.season, round: state.round + 1,
        opponentId: home ? b : a, home, us: home ? res.scoreA : res.scoreB,
        them: home ? res.scoreB : res.scoreA });
    }
  }
  decrementServed(state, wasOut);
  aiManage(state);
  state.poolVersion += 1;
  refreshPool(state);
  state.trainsLeft = BALANCE.trainsPerWeek;
  state.round += 1;
  if (state.round >= state.schedule.length) {
    state.phase = 'review';
    noteTableFinish(state);
  }
  if (state.phase === 'league') resetWeek(state);
  return reports;
}

export function noteTableFinish(state) {
  if (state.tableNoted) return;
  state.tableNoted = true;
  if (playerRank(state).champion) state.titles += 1;
}

export function finalPair(state) {
  const fen = divisionTable(state, 'fen');
  const ridge = divisionTable(state, 'ridge');
  return { home: fen[0], away: ridge[0], fen, ridge };
}

export function resolveFinal(state) {
  if (state.finalApplied) return state.finalReport;
  const { home, away } = finalPair(state);
  const seed = fixtureSeed(state, 'final', home.id, away.id, 'cup');
  const res = simById(state, home.id, away.id, seed);
  const report = applyFixture(state, home.id, away.id, res, { league: false });
  let cupWinnerId = home.id;
  if (res.scoreB > res.scoreA) cupWinnerId = away.id;
  else if (res.scoreA === res.scoreB) {
    const better = home.pts - away.pts || home.diff - away.diff || home.pf - away.pf;
    cupWinnerId = better >= 0 ? home.id : away.id;
  }
  const playerWon = cupWinnerId === state.playerId;
  if (playerWon) state.cups += 1;
  state.cupNoted = true;
  state.finalApplied = true;
  state.phase = 'done';
  state.finalReport = {
    res, report, homeId: home.id, awayId: away.id, playerWon, seed, cupWinnerId, drawn: res.scoreA === res.scoreB,
  };
  return state.finalReport;
}

export function nextSeason(state) {
  state.season += 1;
  state.round = 0;
  state.phase = 'league';
  state.tableNoted = false;
  state.cupNoted = false;
  state.finalApplied = false;
  state.finalReport = null;
  const boost = state.season - 1;
  const rng = makeRng(hashSeed(state.seed, 'season', state.season));
  for (const team of state.teams) {
    Object.assign(team, blankRecord());
    if (team.id === state.playerId) {
      for (const player of team.players) player.injury = 0;
    } else {
      const race = raceById(team.race);
      team.players = createRoster(race, rng, boost);
      team.gold = BALANCE.startGold;
      team.fans = BALANCE.startFans;
      team.trainingLevel = 0;
      team.stadiumLevel = 0;
      team.clinicLevel = 0;
    }
  }
  state.schedule = divisionSchedule(state.teams);
  state.poolVersion += 1;
  state.trainsLeft = BALANCE.trainsPerWeek;
  refreshPool(state);
  resetWeek(state);
  return state;
}

export function healthyCount(team) {
  return team.players.filter((p) => p.injury <= 0).length;
}
