import { TRAITS } from './data.js';

export function makeRng(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    },
  };
}

export function hashSeed(...parts) {
  let h = 2166136261;
  const s = parts.map(String).join('|');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function traitOf(id) {
  return TRAITS[id] || TRAITS.none;
}

export function statSum(player) {
  const s = player.stats;
  return s.strength + s.speed + s.agility + s.passing;
}

export function pickLineup(players, preferred = []) {
  const fit = (players || []).filter((p) => !p.injury);
  if (!fit.length) return [];
  const chosen = [];
  const add = (p) => {
    if (p && !chosen.includes(p) && chosen.length < 5) chosen.push(p);
  };
  for (const id of preferred || []) add(fit.find(p => p.id === id));
  const positions = [];
  for (const p of fit) if (!positions.includes(p.position)) positions.push(p.position);
  for (const pos of positions) {
    const group = fit.filter((p) => p.position === pos);
    add(group.reduce((m, p) => (!m || statSum(p) > statSum(m) ? p : m), null));
  }
  const rest = [...fit].sort((a, b) => statSum(b) - statSum(a));
  for (const p of rest) add(p);
  return chosen;
}

export function lineupPower(players) {
  return pickLineup(players).reduce((sum, p) => sum + statSum(p), 0);
}

function average(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function bestOf(list, fn) {
  return list.reduce((m, p) => (!m || fn(p) > fn(m) ? p : m), null);
}

export function sideRatings(players, traitId) {
  const trait = traitOf(traitId);
  const lineup = pickLineup(players);
  if (!lineup.length) {
    return { lineup, thrower: null, runner: null, tackler: null, off: 0, def: 0, trait };
  }
  const line = [...lineup].sort((a, b) => b.stats.strength - a.stats.strength).slice(0, 3);
  const thrower = bestOf(lineup, (p) => p.stats.passing);
  const runner = bestOf(lineup, (p) => p.stats.speed + p.stats.agility);
  const tackler = bestOf(lineup, (p) => p.stats.strength * 0.45 + p.stats.speed * 0.55);
  const lineStr = average(line.map((p) => p.stats.strength));
  const spd = average(lineup.map((p) => p.stats.speed));
  const agi = average(lineup.map((p) => p.stats.agility));
  const bonus = trait.lineCheck * 0.55 + trait.speedCheck * 0.55;
  const off = lineStr * 0.38
    + thrower.stats.passing * 0.52
    + runner.stats.speed * 0.48
    + runner.stats.agility * 0.36
    + bonus
    - 2.4;
  const def = lineStr * 0.24
    + spd * 0.58
    + agi * 0.46
    + tackler.stats.strength * 0.1
    + bonus;
  return { lineup, thrower, runner, tackler, off, def, trait };
}

