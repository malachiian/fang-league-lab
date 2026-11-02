/**
 * Fang League data: twelve races, economy, and roster builders.
 * No DOM. A new race is one object in RACES plus a name list.
 * Reuse a trait id, or add one to TRAITS (match.js reads it by id).
 */

export const DIVISIONS = [
  { id: 'fen', name: 'Fen Division' },
  { id: 'ridge', name: 'Ridge Division' },
];

/** Hand-painted cartoon defaults. Override a file in ASSET_OVERRIDES. */
export const ART = {
  pixelated: false,
  playerHeight: 96,
  poses: ['idle', 'run', 'tackle', 'down'],
  expressions: ['neutral', 'happy', 'angry', 'hurt'],
};

export const ASSET_OVERRIDES = {
  'icon-gold': { pixelated: true },
  'icon-fans': { pixelated: true },
};

export const STATS = ['strength', 'speed', 'agility', 'passing'];

export const STAT_LABEL = {
  strength: 'Str',
  speed: 'Spd',
  agility: 'Agi',
  passing: 'Pas',
};

export const BALANCE = {
  startGold: 230,
  startFans: 40,
  trainBase: 18,
  trainPerStat: 5,
  trainDiscount: 0.12,
  trainBonusLevel: 2,
  trainBonusChance: 0.25,
  healPerMatch: 26,
  healTrim: 6,
  rosterMin: 7,
  fieldSize: 5,
  trainsPerWeek: 3,
  rosterMax: 10,
  statCap: 20,
  xpLevel: 30,
  xpTrain: 8,
  xpPlay: 5,
  xpScore: 8,
  scoutReroll: 18,
  gateBase: 20,
  gatePerFan: 0.42,
  stadiumGate: 0.22,
  sponsorBase: 14,
  sponsorPerStadium: 8,
  sponsorWin: 20,
  sponsorDraw: 8,
  fansWin: 6,
  fansDraw: 1,
  fansLoss: -3,
  fansMin: 16,
  fansPerStadiumWin: 2,
  trainingCosts: [0, 150, 280, 420],
  stadiumCosts: [0, 170, 320, 480],
  clinicCosts: [0, 120, 220, 340],
  maxFacility: 3,
};

/**
 * Trait numbers are the only hidden-looking modifiers, and the UI
 * prints traitLabel() from these same fields.
 * lineCheck adds strength in contact contests. Legacy speedCheck is zero.
 * Injury fields are scaled by .25 per successful tackle in the spatial engine.
 * injuryBonus / injuryTaken increase that chance; injuryResist reduces it.
 */
export const TRAITS = {
  none: {
    lineCheck: 0, speedCheck: 0, injuryBonus: 0, injuryTaken: 0, injuryResist: 0, regen: false, healMult: 1,
  },
  brutal: {
    lineCheck: 1, speedCheck: 0, injuryBonus: 0.08, injuryTaken: 0, injuryResist: 0, regen: false, healMult: 1,
  },
  sturdy: {
    lineCheck: 1, speedCheck: 0, injuryBonus: 0, injuryTaken: 0, injuryResist: 0.08, regen: false, healMult: 1,
  },
  fragile: {
    lineCheck: 0, speedCheck: 0, injuryBonus: 0, injuryTaken: 0.08, injuryResist: 0, regen: false, healMult: 1,
  },
  regen: {
    lineCheck: 0, speedCheck: 0, injuryBonus: 0, injuryTaken: 0, injuryResist: 0, regen: true, healMult: 0.5,
  },
  swift: {
    lineCheck: 0, speedCheck: 0, injuryBonus: 0, injuryTaken: 0, injuryResist: 0, regen: false, healMult: 1,
  },
  scales: {
    lineCheck: 0.5, speedCheck: 0, injuryBonus: 0, injuryTaken: 0, injuryResist: 0.05, regen: false, healMult: 1,
  },
  cruel: {
    lineCheck: 0, speedCheck: 0, injuryBonus: 0.05, injuryTaken: 0.03, injuryResist: 0, regen: false, healMult: 1,
  },
  massive: {
    lineCheck: 1, speedCheck: 0, injuryBonus: 0.06, injuryTaken: 0, injuryResist: 0.06, regen: false, healMult: 1,
  },
};

function bonusText(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function traitLabel(id) {
  const t = TRAITS[id] || TRAITS.none;
  const bits = [];
  if (t.lineCheck) bits.push(`strength checks +${bonusText(t.lineCheck)}`);
  if (t.speedCheck) bits.push(`speed checks +${bonusText(t.speedCheck)}`);
  if (t.injuryBonus) bits.push(`injury chance on successful tackles +${t.injuryBonus * 25} percentage points`);
  if (t.injuryTaken) bits.push(`injury chance when tackled +${t.injuryTaken * 25} percentage points`);
  if (t.injuryResist) bits.push(`injury chance when tackled -${t.injuryResist * 25} percentage points`);
  if (t.regen) bits.push('injuries last 1 match');
  if (t.healMult < 1) bits.push(`healing costs ${Math.round(t.healMult * 100)}%`);
  if (!bits.length) return 'No extra modifier. The four stats are the whole story.';
  return `${bits.join('. ')}.`;
}

const MOD = (strength = 0, speed = 0, agility = 0, passing = 0) => ({ strength, speed, agility, passing });

function pos(id, label, count, focus, mods) {
  return { id, label, count, focus, mods };
}

export const RACES = [
  {
    id: 'orcs',
    file: 'orc',
    name: 'Orcs',
    team: 'Ironjaw Brawlers',
    short: 'Ironjaw',
    style: 'hit hard',
    trait: 'brutal',
    recruitCost: 70,
    colors: { primary: '#b3261e', secondary: '#1c1c1c', skin: '#6fa04a', dark: '#4a0e0a', ink: '#10160f' },
    emblem: 'tusk',
    base: { strength: 6, speed: 5, agility: 4, passing: 4 },
    positions: [
      pos('lineman', 'Lineman', 3, 'strength', MOD(1, 0, 0, -1)),
      pos('blitzer', 'Blitzer', 2, 'strength', MOD(1, 1, 0, 0)),
      pos('thrower', 'Thrower', 1, 'passing', MOD(0, 0, 1, 2)),
      pos('brute', 'Big Brute', 1, 'strength', MOD(2, -1, -1, -1)),
    ],
  },
  {
    id: 'humans',
    file: 'human',
    name: 'Humans',
    team: 'Riverwatch Guard',
    short: 'Riverwatch',
    style: 'balanced and steady',
    trait: 'none',
    recruitCost: 75,
    colors: { primary: '#2a4a80', secondary: '#9aa3ad', skin: '#e0b090', dark: '#14243f', ink: '#10141c' },
    emblem: 'stripe',
    base: { strength: 5, speed: 5, agility: 5, passing: 5 },
    positions: [
      pos('lineman', 'Lineman', 3, 'strength', MOD(1, 0, -1, 0)),
      pos('catcher', 'Catcher', 2, 'agility', MOD(-1, 1, 1, 0)),
      pos('thrower', 'Thrower', 1, 'passing', MOD(-1, 0, 0, 2)),
      pos('blitzer', 'Blitzer', 1, 'strength', MOD(1, 1, 0, -1)),
    ],
  },
  {
    id: 'dwarves',
    file: 'dwarf',
    name: 'Dwarves',
    team: 'Deepforge Anvils',
    short: 'Deepforge',
    style: 'tough and slow',
    trait: 'sturdy',
    recruitCost: 70,
    colors: { primary: '#8d5a2b', secondary: '#e0b040', skin: '#d7a574', dark: '#3a2412', ink: '#1a1008' },
    emblem: 'anvil',
    base: { strength: 6, speed: 4, agility: 4, passing: 5 },
    positions: [
      pos('lineman', 'Lineman', 3, 'strength', MOD(1, 0, 0, 0)),
      pos('blocker', 'Blocker', 2, 'strength', MOD(2, -1, 0, 0)),
      pos('runner', 'Runner', 1, 'speed', MOD(-1, 2, 1, 0)),
      pos('warden', 'Warden', 1, 'passing', MOD(1, -1, 0, 1)),
    ],
  },
  {
    id: 'elves',
    file: 'elf',
    name: 'Elves',
    team: 'Silverleaf Gliders',
    short: 'Silverleaf',
    style: 'fast and fragile',
    trait: 'fragile',
    recruitCost: 85,
    colors: { primary: '#3e8f55', secondary: '#dfe8df', skin: '#f0d2b0', dark: '#163222', ink: '#101810' },
    emblem: 'leaf',
    base: { strength: 4, speed: 6, agility: 6, passing: 5 },
    positions: [
      pos('lineman', 'Lineman', 3, 'agility', MOD(1, -1, 0, 0)),
      pos('catcher', 'Catcher', 2, 'agility', MOD(-1, 1, 1, 0)),
      pos('thrower', 'Thrower', 1, 'passing', MOD(-1, 0, 1, 1)),
      pos('dancer', 'Dancer', 1, 'speed', MOD(-1, 2, 0, 0)),
    ],
  },
  {
    id: 'goblins',
    file: 'goblin',
    name: 'Goblins',
    team: 'Muckpit Sneaks',
    short: 'Muckpit',
    style: 'quick, cheap, and fragile',
    trait: 'fragile',
    recruitCost: 45,
    colors: { primary: '#7aaa2f', secondary: '#6a3d8a', skin: '#9ccc4a', dark: '#24300f', ink: '#12180a' },
    emblem: 'tooth',
    base: { strength: 4, speed: 6, agility: 5, passing: 5 },
    positions: [
      pos('lineman', 'Lineman', 3, 'speed', MOD(1, 0, 0, -1)),
      pos('dodger', 'Dodger', 2, 'agility', MOD(-1, 1, 1, 0)),
      pos('thrower', 'Thrower', 1, 'passing', MOD(0, 0, 0, 2)),
      pos('scrapper', 'Scrapper', 1, 'speed', MOD(0, 1, 1, -1)),
    ],
  },
  {
    id: 'undead',
    file: 'undead',
    name: 'Undead',
    team: 'Gravecall March',
    short: 'Gravecall',
    style: 'heal faster',
    trait: 'regen',
    recruitCost: 65,
    colors: { primary: '#6b4c9a', secondary: '#c8c4b0', skin: '#d9d3c2', dark: '#241833', ink: '#120e18' },
    emblem: 'eyes',
    base: { strength: 5, speed: 5, agility: 4, passing: 5 },
    positions: [
      pos('shambler', 'Shambler', 3, 'strength', MOD(2, -1, 0, 0)),
      pos('runner', 'Runner', 2, 'speed', MOD(-1, 2, 1, 0)),
      pos('thrower', 'Thrower', 1, 'passing', MOD(0, 0, 0, 2)),
      pos('brute', 'Brute', 1, 'strength', MOD(2, -1, 0, -1)),
    ],
  },
  {
    id: 'ratfolk',
    file: 'ratfolk',
    name: 'Rat-folk',
    team: 'Sewerfang Rush',
    short: 'Sewerfang',
    style: 'very fast',
    trait: 'swift',
    recruitCost: 80,
    colors: { primary: '#8d6a4a', secondary: '#c0392b', skin: '#c4a484', dark: '#2a1c14', ink: '#140e0c' },
    emblem: 'snout',
    base: { strength: 4, speed: 6, agility: 5, passing: 5 },
    positions: [
      pos('lineman', 'Lineman', 3, 'speed', MOD(1, -1, 0, 0)),
      pos('runner', 'Runner', 2, 'speed', MOD(-1, 1, 1, 0)),
      pos('thrower', 'Thrower', 1, 'passing', MOD(0, -1, 0, 2)),
      pos('sneak', 'Sneak', 1, 'agility', MOD(-1, 1, 1, 0)),
    ],
  },
  {
    id: 'lizardfolk',
    file: 'lizard',
    name: 'Lizardfolk',
    team: 'Sunscale Fangs',
    short: 'Sunscale',
    style: 'strong and quick',
    trait: 'scales',
    recruitCost: 75,
    colors: { primary: '#1a9b8e', secondary: '#f0c14a', skin: '#2fbaa8', dark: '#0d3330', ink: '#081614' },
    emblem: 'scale',
    base: { strength: 6, speed: 5, agility: 4, passing: 4 },
    positions: [
      pos('lineman', 'Lineman', 2, 'strength', MOD(1, 0, 0, -1)),
      pos('brute', 'Brute', 2, 'strength', MOD(2, 0, -1, -1)),
      pos('runner', 'Runner', 2, 'speed', MOD(0, 1, 1, 0)),
      pos('thrower', 'Thrower', 1, 'passing', MOD(-1, 0, 1, 2)),
    ],
  },
  {
    id: 'darkelves',
    file: 'darkelf',
    name: 'Dark Elves',
    team: 'Nightglass Reavers',
    short: 'Nightglass',
    style: 'cruel and quick',
    trait: 'cruel',
    recruitCost: 85,
    colors: { primary: '#3a2a6a', secondary: '#d4c4f0', skin: '#cbb6d6', dark: '#1a1028', ink: '#100818' },
    emblem: 'shard',
    base: { strength: 4, speed: 6, agility: 5, passing: 5 },
    positions: [
      pos('lineman', 'Lineman', 3, 'agility', MOD(1, -1, 0, 0)),
      pos('blitzer', 'Blitzer', 2, 'speed', MOD(0, 1, 1, -1)),
      pos('thrower', 'Thrower', 1, 'passing', MOD(-1, 0, 1, 2)),
      pos('shade', 'Shade', 1, 'agility', MOD(-1, 1, 1, 0)),
    ],
  },
  {
    id: 'halflings',
    file: 'halfling',
    name: 'Halflings',
    team: 'Bramblefoot Band',
    short: 'Bramblefoot',
    style: 'small and slippery',
    trait: 'fragile',
    recruitCost: 40,
    colors: { primary: '#c47a3a', secondary: '#6f8f3a', skin: '#f0c09a', dark: '#3a2414', ink: '#1c1008' },
    emblem: 'leaf',
    base: { strength: 4, speed: 5, agility: 6, passing: 5 },
    positions: [
      pos('lineman', 'Lineman', 3, 'agility', MOD(1, 0, 0, -1)),
      pos('dodger', 'Dodger', 2, 'agility', MOD(-1, 1, 1, 0)),
      pos('thrower', 'Thrower', 1, 'passing', MOD(0, 0, 0, 2)),
      pos('scout', 'Scout', 1, 'speed', MOD(-1, 2, 0, 0)),
    ],
  },
  {
    id: 'ogres',
    file: 'ogre',
    name: 'Ogres',
    team: 'Gutrock Maw',
    short: 'Gutrock',
    style: 'huge and slow',
    trait: 'massive',
    recruitCost: 90,
    colors: { primary: '#8a4b2f', secondary: '#e0a050', skin: '#c4865a', dark: '#3a2014', ink: '#1a0e08' },
    emblem: 'anvil',
    base: { strength: 6, speed: 5, agility: 4, passing: 4 },
    positions: [
      pos('lineman', 'Lineman', 2, 'strength', MOD(1, 0, 0, 0)),
      pos('brute', 'Brute', 3, 'strength', MOD(1, 0, 0, -1)),
      pos('crusher', 'Crusher', 1, 'strength', MOD(2, 0, -1, 0)),
      pos('thrower', 'Thrower', 1, 'passing', MOD(-1, 0, 1, 2)),
    ],
  },
  {
    id: 'doomsworn',
    file: 'doom',
    name: 'Doomsworn',
    team: 'Ashmaw Host',
    short: 'Ashmaw',
    style: 'heavy and wild',
    trait: 'brutal',
    recruitCost: 80,
    colors: { primary: '#8e1e28', secondary: '#1a1a1a', skin: '#d7a08a', dark: '#3a0c10', ink: '#140608' },
    emblem: 'horn',
    base: { strength: 6, speed: 5, agility: 4, passing: 4 },
    positions: [
      pos('lineman', 'Lineman', 3, 'strength', MOD(1, 0, 0, -1)),
      pos('blitzer', 'Blitzer', 2, 'strength', MOD(1, 1, 0, 0)),
      pos('thrower', 'Thrower', 1, 'passing', MOD(0, 0, 1, 2)),
      pos('ravager', 'Ravager', 1, 'strength', MOD(1, 0, 0, 0)),
    ],
  },
];

const RACE_META = {
  orcs: { division: 'fen', face: 'blitzer' },
  humans: { division: 'fen', face: 'thrower' },
  elves: { division: 'fen', face: 'dancer' },
  goblins: { division: 'fen', face: 'dodger' },
  undead: { division: 'fen', face: 'runner' },
  halflings: { division: 'fen', face: 'dodger' },
  dwarves: { division: 'ridge', face: 'blocker' },
  darkelves: { division: 'ridge', face: 'blitzer' },
  ratfolk: { division: 'ridge', face: 'runner' },
  lizardfolk: { division: 'ridge', face: 'brute' },
  ogres: { division: 'ridge', face: 'brute' },
  doomsworn: { division: 'ridge', face: 'ravager' },
};
for (const race of RACES) Object.assign(race, RACE_META[race.id]);

const NAMES = {
  orcs: ['Gruk', 'Mog', 'Thrag', 'Urzul', 'Brakka', 'Drog', 'Skarn', 'Vesh', 'Gorruk', 'Mazg', 'Ruk', 'Thok', 'Balg', 'Yurk', 'Krusk', 'Dregg'],
  humans: ['Alden', 'Maren', 'Tess', 'Corin', 'Bram', 'Holt', 'Sera', 'Dugan', 'Pell', 'Wynn', 'Harl', 'Nessa', 'Cobb', 'Ivo', 'Reed', 'Lotte'],
  dwarves: ['Hargin', 'Dotta', 'Bromm', 'Kessa', 'Torv', 'Nali', 'Grenda', 'Wulm', 'Barrik', 'Odil', 'Fren', 'Tova', 'Kragg', 'Hess', 'Durn', 'Marda'],
  elves: ['Sylen', 'Vaeri', 'Liriel', 'Ostel', 'Faelen', 'Miren', 'Thess', 'Quill', 'Aeris', 'Nythe', 'Sorelle', 'Iland', 'Caelith', 'Vess', 'Orila', 'Tavian'],
  goblins: ['Zib', 'Nok', 'Pikk', 'Razz', 'Titch', 'Grib', 'Snag', 'Vikk', 'Jib', 'Mott', 'Krik', 'Yazz', 'Podge', 'Snikt', 'Wib', 'Gnak'],
  undead: ['Morv', 'Cinder', 'Ashen', 'Vesper', 'Dreg', 'Yarrow', 'Oss', 'Pellam', 'Marrow', 'Vellum', 'Sable', 'Quin', 'Husk', 'Wren', 'Barrow', 'Ilex'],
  ratfolk: ['Chit', 'Nib', 'Ratch', 'Vex', 'Snik', 'Pox', 'Mite', 'Scrit', 'Nikk', 'Vetch', 'Rill', 'Skiff', 'Chet', 'Pip', 'Gnast', 'Wick'],
  lizardfolk: ['Sszik', 'Xara', 'Tessen', 'Vash', 'Kessik', 'Raza', 'Ossil', 'Yara', 'Zess', 'Kava', 'Tzik', 'Sorra', 'Vessik', 'Xol', 'Ranak', 'Iska'],
  darkelves: ['Veyra', 'Sithil', 'Neris', 'Kaelith', 'Morva', 'Iskra', 'Tyris', 'Velath', 'Sableen', 'Oriva', 'Drath', 'Ysil', 'Mireth', 'Calthis', 'Vorra', 'Eshra'],
  halflings: ['Bramble', 'Lotto', 'Pim', 'Daisy', 'Hob', 'Nell', 'Tansy', 'Wicker', 'Pippa', 'Cob', 'Merril', 'Posy', 'Fig', 'Tam', 'Bibi', 'Ost'],
  ogres: ['Grogma', 'Thud', 'Burl', 'Munga', 'Krusha', 'Og', 'Hukka', 'Bramm', 'Slog', 'Durga', 'Wump', 'Gutta', 'Rogg', 'Mawg', 'Bulka', 'Thragg'],
  doomsworn: ['Vark', 'Ashen', 'Cindra', 'Malvek', 'Rook', 'Scorn', 'Hexe', 'Drave', 'Pyre', 'Vellum', 'Korr', 'Mourn', 'Sable', 'Ixx', 'Rath', 'Vey'],
};

export function divisionName(id) {
  return DIVISIONS.find((d) => d.id === id)?.name || id;
}

export function racesIn(division) {
  return RACES.filter((r) => r.division === division);
}

export function raceById(id) {
  return RACES.find((r) => r.id === id) || null;
}

export function clampStat(n) {
  return Math.max(1, Math.min(BALANCE.statCap, n));
}

export function focusFor(player) {
  const race = raceById(player.race);
  const found = race?.positions.find((p) => p.id === player.position);
  return found?.focus || 'agility';
}

export function playerTotal(player) {
  return STATS.reduce((s, k) => s + player.stats[k], 0);
}

export function trainingCost(statValue, trainingLevel) {
  const raw = BALANCE.trainBase + BALANCE.trainPerStat * statValue;
  const mult = 1 - BALANCE.trainDiscount * trainingLevel;
  return Math.max(10, Math.round(raw * mult));
}

export function healCost(matches, trainingLevel, traitId) {
  const trait = TRAITS[traitId] || TRAITS.none;
  const raw = BALANCE.healPerMatch * matches - BALANCE.healTrim * trainingLevel;
  return Math.max(8, Math.round(raw * trait.healMult));
}

export function recruitCost(player) {
  const race = raceById(player.race);
  const extra = Math.max(0, playerTotal(player) - 18) * 6;
  return race.recruitCost + extra;
}

export function purse(team, result) {
  const gate = Math.round(
    (BALANCE.gateBase + team.fans * BALANCE.gatePerFan) * (1 + BALANCE.stadiumGate * team.stadiumLevel),
  );
  let sponsor = BALANCE.sponsorBase + team.stadiumLevel * BALANCE.sponsorPerStadium;
  if (result === 'win') sponsor += BALANCE.sponsorWin;
  else if (result === 'draw') sponsor += BALANCE.sponsorDraw;
  let fansDelta = BALANCE.fansDraw;
  if (result === 'win') fansDelta = BALANCE.fansWin + team.stadiumLevel * BALANCE.fansPerStadiumWin;
  else if (result === 'loss') fansDelta = BALANCE.fansLoss;
  return { gate, sponsor, total: gate + sponsor, fansDelta };
}

export function facilityCost(kind, level) {
  if (level >= BALANCE.maxFacility) return null;
  const table = { training: BALANCE.trainingCosts, stadium: BALANCE.stadiumCosts, clinic: BALANCE.clinicCosts }[kind];
  if (!table) return null;
  return table[level + 1];
}

export function trainingGroundBlurb(level) {
  const cut = Math.round(BALANCE.trainDiscount * level * 100);
  const trim = BALANCE.healTrim * level;
  const bits = [`${BALANCE.trainsPerWeek + level} coached places per week.`, level ? `Training costs −${cut}%. Instant heal fee −${trim}g.` : 'Coaching prices depend on player stats.'];
  if (level >= BALANCE.trainBonusLevel) {
    bits.push(`1 in ${Math.round(1 / BALANCE.trainBonusChance)} sessions adds 2 if the stat has room.`);
  }
  return bits.join(' ');
}

export function stadiumBlurb(level) {
  const gate = Math.round(BALANCE.stadiumGate * level * 100);
  const fans = level * BALANCE.fansPerStadiumWin;
  return level ? `${1 + level} fan outreach places per week. Gate receipts +${gate}%. Wins pull in +${fans} extra fans.` : '1 fan outreach place per week. Upgrades increase gate income and fans from wins.';
}

export function clinicBlurb(level, traitId = 'none') {
  const cost = Math.round(Math.max(2, 8 - 2 * level) * (TRAITS[traitId]?.healMult || 1));
  return `${1 + level} treatment place${level ? 's' : ''} per week. Each costs ${cost}g and removes ${level >= 2 ? 2 : 1} match${level >= 2 ? 'es' : ''} of injury before kickoff.`;
}

export function makeName(raceId, rng, used) {
  const pool = NAMES[raceId] || NAMES.humans;
  const open = pool.filter((n) => !used.has(n));
  let name = open.length ? rng.pick(open) : `${rng.pick(pool)} ${rng.int(2, 9)}`;
  used.add(name);
  return name;
}

export function createPlayer(race, position, rng, usedNames, boost = 0) {
  const stats = {};
  for (const key of STATS) {
    const base = race.base[key] + (position.mods[key] || 0) + boost + rng.int(-1, 1);
    stats[key] = clampStat(base);
  }
  return {
    id: `${race.id}-${position.id}-${rng.int(100, 999)}-${usedNames.size}`,
    name: makeName(race.id, rng, usedNames),
    race: race.id,
    position: position.id,
    positionLabel: position.label,
    stats,
    xp: 0,
    level: 1,
    injury: 0,
  };
}

export function createRoster(race, rng, boost = 0) {
  const used = new Set();
  const players = [];
  for (const position of race.positions) {
    for (let i = 0; i < position.count; i += 1) {
      players.push(createPlayer(race, position, rng, used, boost));
    }
  }
  return players;
}

export function addXp(player, amount) {
  const notes = [];
  player.xp += amount;
  while (player.xp >= BALANCE.xpLevel) {
    player.xp -= BALANCE.xpLevel;
    player.level += 1;
    const order = [focusFor(player), ...STATS];
    const stat = order.find((s) => player.stats[s] < BALANCE.statCap);
    if (stat) {
      player.stats[stat] += 1;
      notes.push(`${player.name} reaches level ${player.level}. ${STAT_LABEL[stat]} +1 (${player.stats[stat]}/${BALANCE.statCap}).`);
    } else {
      notes.push(`${player.name} reaches level ${player.level}. Every stat is at the cap (${BALANCE.statCap}).`);
    }
  }
  return notes;
}

export function rulesLines() {
  return [
    `Training costs ${BALANCE.trainBase}g + ${BALANCE.trainPerStat}g × the stat, then −${Math.round(BALANCE.trainDiscount * 100)}% per training-ground level.`,
    `From training ground ${BALANCE.trainBonusLevel}, ${Math.round(BALANCE.trainBonusChance * 100)}% of sessions add 2 instead of 1 (only if there is room under ${BALANCE.statCap}).`,
    `Healing costs ${BALANCE.healPerMatch}g × matches left, minus ${BALANCE.healTrim}g per training-ground level. Undead pay half.`,
    `Gate = round((${BALANCE.gateBase} + fans × ${BALANCE.gatePerFan}) × (1 + ${BALANCE.stadiumGate} × stadium)).`,
    `Sponsor = ${BALANCE.sponsorBase} + ${BALANCE.sponsorPerStadium} × stadium, plus ${BALANCE.sponsorWin} for a win or ${BALANCE.sponsorDraw} for a draw.`,
    `Win fans +${BALANCE.fansWin} (+${BALANCE.fansPerStadiumWin} per stadium level). Draw +${BALANCE.fansDraw}. Loss ${BALANCE.fansLoss}. Crowd never drops below ${BALANCE.fansMin}.`,
    `Stats cap at ${BALANCE.statCap}. Squad stays between ${BALANCE.rosterMin} and ${BALANCE.rosterMax}, and you must keep ${BALANCE.fieldSize} fit players to field a side.`,
    `Plan one activity per player before each league match. There are ${BALANCE.trainsPerWeek} coached places, plus one per training-ground level. Free team practice gives 2 XP.`,
    'Matches resolve player movement, blocking, passing, tackling and recoveries. Choose your starting five and a tactical plan before kickoff.',
  ];
}
