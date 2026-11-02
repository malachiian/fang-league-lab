/**
 * Fang League UI and side-view playback.
 * Match results come from simulateMatch; this file only shows them.
 */
import {
  ART,
  ASSET_OVERRIDES,
  BALANCE,
  RACES,
  STATS,
  STAT_LABEL,
  divisionName,
  facilityCost,
  clinicBlurb,
  healCost,
  purse,
  raceById,
  recruitCost,
  rulesLines,
  stadiumBlurb,
  trainingGroundBlurb,
  traitLabel,
} from './data.js';
import {
  finalPair,
  fixtureSeed,
  heal,
  healthyCount,
  releaseBlock,
  leagueTable,
  newGame,
  nextSeason,
  playerFixture,
  playerRank,
  playerTeam,
  release,
  rerollPool,
  resolveFinal,
  resolveRound,
  sign,
  simById,
  teamById,
  upgrade,
} from './season.js';
import { hashSeed, matchRuleText, pickLineup, simulateMatch, TACTICS, defaultTactic } from './match.js';
import { clubGoals, claimGoal } from './club.js';
import { assignActivity, advanceWeek, readyForMatch } from './weekly.js';
import { renderWeekly, weekSteps, renderWeekReport } from './weekly-view.js';
import { saveCareer, loadCareer, clearCareer } from './save.js';
import { ASSET_FILES } from './assets.js';
import { drawBroadcast } from './match-view.js';

const storage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: key => window.localStorage.removeItem(key),
};

const PLAYER_H = ART.playerHeight;
const PAINTED_RACES = new Set(['orcs', 'humans', 'elves', 'goblins', 'undead', 'halflings', 'dwarves', 'ratfolk', 'lizardfolk', 'darkelves', 'ogres', 'doomsworn']);
const view = document.getElementById('view');
const flashEl = document.getElementById('flash');
const images = {};
const missingArt = new Set();
let showMissing = false;

const ui = {
  screen: 'select',
  tab: 'club',
  selectedRace: 'orcs',
  speed: 1,
  paused: false,
  flash: '',
  trainId: null,
  releaseId: null,
  playback: null,
  post: null,
  applying: false,
  autoReplay: true,
  swapId: null,
  exhibition: { home: 'orcs', away: 'elves', tacticA: 'power', tacticB: 'spread', seed: 3 },
  estimateKey: '',
  estimate: null,
};

let game = null;
let saveWarning = '';
let raf = 0;
let lastTick = 0;

function noteMissing(src) {
  const url = new URL(src, document.baseURI).href;
  if (missingArt.has(url)) return;
  missingArt.add(url);
  console.warn('[fang-league] missing art:', src);
  paintMissing();
}

function clearMissing(src) {
  if (missingArt.delete(new URL(src, document.baseURI).href)) paintMissing();
}

function want(key, src, opts = {}) {
  if (images[key]) return images[key];
  // Optional poses use the existing body fallback without issuing a failing request.
  if (!ASSET_FILES.has(src)) return null;
  const over = ASSET_OVERRIDES[key] || {};
  const rec = {
    key,
    src,
    ok: false,
    img: new Image(),
    pixelated: over.pixelated ?? opts.pixelated ?? false,
    frameWidth: over.frameWidth || opts.frameWidth || 0,
  };
  rec.img.onload = () => {
    rec.ok = true;
    clearMissing(src);
    if (key.startsWith('icon-')) renderHud();
    if (ui.screen !== 'match') paintStill();
  };
  rec.img.onerror = () => {
    rec.ok = false;
    noteMissing(src);
  };
  rec.img.src = src;
  images[key] = rec;
  return rec;
}

function loadArt() {
  want('pitch', 'assets/pitch.png', { pixelated: false });
  want('ball', 'assets/ball.png', { pixelated: true });
  want('icon-gold', 'assets/icon-gold.png', { pixelated: true });
  want('icon-fans', 'assets/icon-fans.png', { pixelated: true });
  want('stands', 'assets/stands.png', { pixelated: false });
  want('trophy', 'assets/trophy-room.png', { pixelated: false });
  for (const race of RACES) {
    want(`crest-${race.file}`, `assets/crest-${race.file}.png`);
    want(`${race.file}-${race.face}-portrait-neutral`, `assets/${race.file}-${race.face}-portrait-neutral.png`);
  }
}

function loadRaceArt(raceId) {
  const race = raceById(raceId);
  for (const pos of race.positions) {
    const stem = `${race.file}-${pos.id}`;
    for (const pose of ART.poses) want(`${stem}-${pose}`, `assets/${stem}-${pose}.png`);
    for (const expr of ART.expressions) want(`${stem}-portrait-${expr}`, `assets/${stem}-portrait-${expr}.png`);
  }
}

function frameOf(rec, frameIndex) {
  const w = rec.img.naturalWidth || 1;
  const h = rec.img.naturalHeight || 1;
  let fw = rec.frameWidth;
  if (!fw) fw = h > 0 && w >= h * 2 && w % h === 0 ? h : w;
  const count = Math.max(1, Math.floor(w / fw));
  const index = ((frameIndex % count) + count) % count;
  return { sx: index * fw, sy: 0, sw: fw, sh: h, count };
}

function firstOk(keys) {
  return keys.map((key) => images[key]).find((rec) => rec?.ok) || null;
}

function pitchBody(race, position) {
  const stem = `${race.file}-${position}`;
  const keys = [`${stem}-idle`];
  if (!PAINTED_RACES.has(race.id)) keys.push(`${stem}-hd-128`, `${stem}-hd`, stem);
  return firstOk(keys);
}

function poseArt(race, position, pose) {
  if (pose !== 'idle') {
    const specific = images[`${race.file}-${position}-${pose}`];
    if (specific?.ok) return { rec: specific, fake: false };
  }
  return { rec: pitchBody(race, position), fake: pose !== 'idle' };
}

function portraitRecord(race, position, expression) {
  const stem = `${race.file}-${position}`;
  return firstOk([
    `${stem}-portrait-${expression}`,
    `${stem}-portrait-neutral`,
    `${stem}-idle`,
  ]) || (!PAINTED_RACES.has(race.id) ? images[stem] : null);
}

function paintMissing() {
  const box = document.getElementById('missing');
  const list = document.getElementById('missing-list');
  const count = document.getElementById('missing-count');
  const button = document.getElementById('missing-btn');
  if (!box || !list || !count || !button) return;
  const total = missingArt.size;
  button.hidden = total === 0;
  button.textContent = `Missing art (${total})`;
  if (!total) showMissing = false;
  box.hidden = !showMissing;
  button.setAttribute('aria-expanded', String(showMissing));
  count.textContent = total ? `${total} image${total === 1 ? '' : 's'} could not load. Refresh to try again.` : '';
  list.innerHTML = [...missingArt].map(src => `<li>${esc(new URL(src).pathname.split('/').pop())}</li>`).join('');
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function flash(text) {
  ui.flash = text;
  if (flashEl) flashEl.textContent = text;
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function doRestart() {
  if (!clearCareer(storage)) {
    flash('Could not clear the saved career. Please allow browser storage and try again.');
    return;
  }
  stopLoop();
  ui.speed = 1;
  ui.paused = false;
  ui.screen = 'select';
  ui.tab = 'club';
  ui.trainId = null;
  ui.releaseId = null;
  ui.playback = null;
  ui.post = null;
  ui.applying = false;
  ui.estimate = null;
  ui.estimateKey = '';
  game = null;
  flash('Speed is 1×. Pick a side.');
  render();
}

function render() {
  paintMissing();
  document.body.dataset.screen = ui.screen;
  if (game) loadRaceArt(playerTeam(game).race);
  if (ui.screen === 'exhibition') { loadRaceArt(ui.exhibition.home); loadRaceArt(ui.exhibition.away); }
  renderHud();
  if (flashEl) flashEl.textContent = ui.flash || '';
  if (ui.screen === 'select') view.innerHTML = renderSelect();
  else if (ui.screen === 'hub') view.innerHTML = renderHub();
  else if (ui.screen === 'match') view.innerHTML = renderMatchShell();
  else if (ui.screen === 'post') view.innerHTML = renderPost();
  else if (ui.screen === 'review') view.innerHTML = renderReview();
  else if (ui.screen === 'done') view.innerHTML = renderDone();
  else if (ui.screen === 'exhibition') view.innerHTML = renderExhibition();
  else if (ui.screen === 'exhibition-result') view.innerHTML = renderExhibitionResult();
  else if (ui.screen === 'loading-match') view.innerHTML = '<section class="panel loading-match"><p class="eyebrow">Fang League · Matchday</p><h2>The teams are taking the field.</h2><p>Getting the stadium ready…</p></section>';
  paintStill();
  const saved = saveCareer(storage, game, ui);
  if (!saved.skipped) saveWarning = saved.ok ? '' : saved.message;
  const saveStatus = document.getElementById('save-status');
  if (saveStatus) saveStatus.textContent = saveWarning || (!game ? 'Your club starts here' : ui.screen === 'match' ? 'Career saved before kickoff' : 'Career saved on this browser');
  const speedBtn = document.getElementById('speed');
  const pauseBtn = document.getElementById('pause');
  const onMatch = ui.screen === 'match';
  if (speedBtn) {
    speedBtn.hidden = !onMatch;
    speedBtn.textContent = `Speed ${ui.speed}×`;
  }
  if (pauseBtn) {
    pauseBtn.hidden = !onMatch;
    pauseBtn.textContent = ui.paused ? 'Resume' : 'Pause';
  }
}

function icon(name, alt) {
  const rec = images[`icon-${name}`];
  if (rec?.ok) {
    const crisp = rec.pixelated ? 'pixelated' : 'auto';
    return `<img src="${rec.src}" width="32" height="32" alt="${alt}" style="image-rendering:${crisp}">`;
  }
  const color = name === 'gold' ? '#f0c14a' : '#e15d5d';
  return `<span class="fallback-icon" style="background:${color};border:2px solid #000" title="${alt}"></span>`;
}

function renderHud() {
  const gold = document.getElementById('hud-gold');
  const fans = document.getElementById('hud-fans');
  const match = document.getElementById('hud-match');
  const rank = document.getElementById('hud-rank');
  if (!game) {
    gold.innerHTML = `${icon('gold', 'Gold')} Gold —`;
    fans.innerHTML = `${icon('fans', 'Fans')} Fans —`;
    match.textContent = 'Preseason';
    rank.textContent = 'Pick a team';
    const hud = document.getElementById('hud');
    if (hud) hud.style.boxShadow = '';
    return;
  }
  const team = playerTeam(game);
  const accent = raceById(team.race).colors.primary;
  gold.innerHTML = `${icon('gold', 'Gold')} ${team.gold}g`;
  fans.innerHTML = `${icon('fans', 'Fans')} ${team.fans} fans`;
  if (game.phase === 'league') match.textContent = `Match ${game.round + 1} / ${game.schedule.length}`;
  else if (game.phase === 'review') match.textContent = playerRank(game).champion ? 'Cup spot won' : 'Season over';
  else match.textContent = 'Cup final';
  const hud = document.getElementById('hud');
  if (hud) hud.style.boxShadow = `inset 6px 0 0 ${accent}`;
  const played = team.won + team.drawn + team.lost;
  if (!played) rank.textContent = `${team.short} · preseason`;
  else {
    const place = playerRank(game);
    rank.innerHTML = `<span class="swatch" style="background:${accent}"></span> ${place.tied ? 'T-' : ''}${ordinal(place.rank)} in ${esc(divisionName(place.division))}`;
  }
}

function renderSelect() {
  const cards = RACES.map((race) => {
    const on = race.id === ui.selectedRace ? ' on' : '';
    const roles = race.positions.map((p) => `${p.count} ${p.label}`).join(' · ');
    return `<button type="button" class="card${on}" data-act="pick" data-race="${race.id}" style="border-left:8px solid ${race.colors.primary}">
      <div class="who">
        <canvas class="face" width="96" height="120" data-face="${race.id}"></canvas>
        <div>
          <h2>${esc(race.team)}</h2>
          <p class="style">${esc(race.name)}: ${esc(race.style)}</p>
          <p class="muted">${esc(divisionName(race.division))}</p>
        </div>
      </div>
      <p class="muted">${esc(traitLabel(race.trait))}</p>
      <p class="muted">${esc(roles)}. Recruits from ${race.recruitCost}g.</p>
    </button>`;
  }).join('');
  const race = raceById(ui.selectedRace);
  return `<div class="intro"><p class="eyebrow">A small club. A big ambition.</p><h2>Build a team worth cheering for.</h2><p>Recruit misfits. Train your stars. Grow your home ground. Then watch them fight for the cup.</p></div>
    <div class="hero panel" style="border-left:8px solid ${race.colors.primary}">
      <canvas class="face" width="220" height="260" data-face="${race.id}"></canvas>
      <div>
        <h2>${esc(race.team)}</h2>
        <p class="style">${esc(race.name)}: ${esc(race.style)}</p>
        <p class="muted">${esc(divisionName(race.division))}. ${esc(traitLabel(race.trait))}</p>
        <button type="button" class="ember" data-act="lead">Lead the ${esc(race.team)}</button>
      </div>
    </div>
    <div class="section-heading"><h2>Choose your club</h2><span>12 teams · 2 divisions · 1 cup</span></div><div class="grid team-grid">${cards}</div>`;
}

function renderHub() {
  const team = playerTeam(game);
  const race = raceById(team.race);
  const tabs = [
    ['club', 'Clubhouse'],
    ['week', 'This week'],
    ['squad', 'Squad'],
    ['recruit', 'Recruit'],
    ['upgrades', 'Upgrades'],
    ['league', 'League'],
    ['match', 'Match'],
  ].map(([id, label]) => `<button type="button" class="tab${ui.tab === id ? ' on' : ''}" data-act="tab" data-tab="${id}">${label}</button>`).join('');
  let body = '';
  if (ui.tab === 'club') body = renderClub(team, race);
  else if (ui.tab === 'week') body = renderWeekly(game, esc);
  else if (ui.tab === 'squad') body = renderSquad(team, race);
  else if (ui.tab === 'recruit') body = renderRecruit(team);
  else if (ui.tab === 'upgrades') body = renderUpgrades(team);
  else if (ui.tab === 'league') body = renderTable();
  else body = renderMatchup(team);
  const fx = playerFixture(game);
  let banner = 'The table is set.';
  if (fx) {
    const opp = teamById(game, fx[0] === team.id ? fx[1] : fx[0]);
    banner = `Next: ${esc(opp.name)} (${esc(raceById(opp.race).name)}: ${esc(raceById(opp.race).style)}).`;
  }
  return `<div class="club-heading"><div><p class="eyebrow">Season ${game.season} · ${esc(divisionName(team.division))}</p><h2>${esc(team.name)}</h2></div><p class="muted">${banner}</p></div>
    <nav class="tabs" aria-label="Club management">${tabs}</nav>${body}`;
}

function renderClub(team, race) {
  const fx = playerFixture(game);
  const opponent = fx && teamById(game, fx[0] === team.id ? fx[1] : fx[0]);
  const fit = healthyCount(team);
  const ready = readyForMatch(game);
  const history = (game.history || []).slice(-5).reverse();
  const goals = clubGoals(game);
  const complete = goals.filter(g => g.claimed).length;
  const lineup = pickLineup(team.players, team.lineup);
  const players = lineup.map((p, i) => `<img class="practice-player player-${i}" src="assets/${race.file}-${p.position}-idle.png" alt="${esc(p.name)} practicing" style="--i:${i}">`).join('');
  const facilities = [['training', 'Training ground', team.trainingLevel], ['stadium', 'Stadium', team.stadiumLevel]].map(([id, label, level]) => `<button class="ground-building ${id}" data-act="tab" data-tab="week"><img class="facility-art" src="assets/facility-${id}-l${level}.png" alt=""><strong>${label}</strong><span>Level ${level} / 3</span></button>`).join('');
  const results = history.map(m => `<li><span class="result-badge ${m.us > m.them ? 'win' : m.us < m.them ? 'loss' : 'draw'}">${m.us > m.them ? 'W' : m.us < m.them ? 'L' : 'D'}</span><span>${esc(teamById(game, m.opponentId).short)}<small>Season ${m.season} · Match ${m.round}</small></span><strong>${m.us} : ${m.them}</strong></li>`).join('');
  const goalCards = goals.map(g => `<article class="goal ${g.claimed ? 'claimed' : ''}"><div class="goal-top"><span>${g.claimed ? 'Completed' : g.complete ? 'Reward ready' : 'Club goal'}</span><strong>+${g.reward}g</strong></div><h3>${esc(g.name)}</h3><p>${esc(g.detail)}</p><progress max="${g.target}" value="${Math.min(g.target, g.value)}" aria-label="${esc(g.name)}"></progress><div class="goal-bottom"><span>${Math.min(g.target, g.value)} / ${g.target}</span>${g.claimed ? '<span>Collected ✓</span>' : `<button data-act="claim" data-goal="${g.id}" ${g.complete ? '' : 'disabled'}>Collect</button>`}</div></article>`).join('');
  return `${weekSteps(game)}<div class="club-layout"><section class="grounds panel"><div class="section-heading"><div><p class="eyebrow">Home sweet home</p><h2>Your club grounds</h2></div><span class="badge">${team.fans} fans</span></div><div class="ground-scene" aria-label="Club grounds with links to facilities and squad"><div class="ground-path"></div>${facilities}<button class="practice-pitch" data-act="tab" data-tab="squad" aria-label="Manage the squad"><span class="halfway"></span><span class="center-circle"></span>${players}<span class="pitch-caption">Meet your squad</span></button><span class="ground-sign">${esc(team.short)} FC</span></div><div class="ground-summary"><span><strong>${team.players.length}</strong> players</span><span><strong>${fit}</strong> fit to play</span><span><strong>${ready ? 'Ready' : game.trainsLeft}</strong> ${ready ? 'for match day' : 'coached places'}</span></div></section><aside class="club-sidebar"><section class="panel fixture-card"><p class="eyebrow">Next up · Match ${game.round + 1} of 10</p><h2>${opponent ? esc(opponent.name) : 'Season complete'}</h2><p class="muted">${opponent ? esc(raceById(opponent.race).style) : 'Time to celebrate.'}</p><p>${fit < 5 ? `Only ${fit} fit. Visit the squad to heal injured players.` : 'Your team is ready to take the field.'}</p><button class="ember" data-act="tab" data-tab="${ready ? 'match' : 'week'}">${ready ? 'Go to match day' : 'Plan this week'} →</button></section><section class="panel"><h2>Recent form</h2>${results ? `<ul class="form-list">${results}</ul>` : '<p class="muted">A new badge. A blank record. Your story starts with the first whistle.</p>'}<p class="muted">${game.titles} division titles · ${game.cups} cups</p></section></aside></div>${game.clubReports?.length ? `<details class="panel previous-week"><summary>${ready ? 'This week' : 'Last week'}: ${game.clubReports.at(-1).cost}g invested in the club</summary>${renderWeekReport(game.clubReports.at(-1), esc)}</details>` : ''}<div class="section-heading"><div><p class="eyebrow">Build something that lasts</p><h2>Club ambitions</h2></div><span>${complete} of ${goals.length} achieved</span></div><div class="goals-grid">${goalCards}</div>`;
}

function statLine(player) {
  return STATS.map((s) => `<span>${STAT_LABEL[s]} ${player.stats[s]}/${BALANCE.statCap}</span>`).join('');
}

function renderSquad(team, race) {
  const starters = new Set(pickLineup(team.players, team.lineup).map((p) => p.id));
  const fit = healthyCount(team);
  const cards = team.players.map((p) => {
    const hurt = p.injury > 0;
    const healPrice = hurt ? healCost(p.injury, team.trainingLevel, team.trait) : 0;
    const canHeal = hurt && team.gold >= healPrice;
    const dropReason = releaseBlock(team, p.id);
    const canDrop = !dropReason;
    const releaseOpen = ui.releaseId === p.id;
    return `<article class="card" style="border-left:8px solid ${race.colors.primary}">
      <div class="who">
        <canvas class="portrait" width="140" height="180" data-portrait="${esc(p.id)}" data-expr="${hurt ? 'hurt' : 'neutral'}"></canvas>
        <div>
          <h2>${esc(p.name)}</h2>
          <p class="muted">${esc(p.positionLabel)} · level ${p.level}</p>
          ${starters.has(p.id) ? '<span class="badge">Starting</span>' : '<span class="badge bench">Reserve</span>'}
          ${hurt ? `<span class="badge out">Out ${p.injury}</span>` : '<span class="badge fit">Fit</span>'}
        </div>
      </div>
      <div class="stats">${statLine(p)}</div>
      <div class="bar" title="XP ${p.xp}/${BALANCE.xpLevel}"><span style="width:${Math.round((p.xp / BALANCE.xpLevel) * 100)}%"></span></div>
      <p class="muted">XP ${p.xp}/${BALANCE.xpLevel}. Focus ${STAT_LABEL[race.positions.find((pos) => pos.id === p.position)?.focus || 'agility']} on level-up.</p>
      <div class="row">
        ${!hurt && !starters.has(p.id) ? `<button type="button" class="ember" data-act="choose-sub" data-id="${esc(p.id)}">${ui.swapId === p.id ? 'Cancel swap' : 'Put in starting five'}</button>` : ''}
        ${starters.has(p.id) && ui.swapId ? `<button type="button" class="ember" data-act="swap-starter" data-id="${esc(p.id)}">Replace ${esc(p.name)}</button>` : ''}
        <button type="button" data-act="plan-player" data-id="${esc(p.id)}">${readyForMatch(game) ? 'Week report' : hurt ? 'Plan recovery' : 'Plan training'}</button>
        ${hurt ? `<button type="button" data-act="heal" data-id="${esc(p.id)}" ${canHeal ? '' : 'disabled'} title="${canHeal ? '' : `Need ${healPrice}g`}">Instant heal ${healPrice}g</button>` : ''}
        <button type="button" class="ghost" data-act="release-open" data-id="${esc(p.id)}" ${canDrop ? '' : 'disabled'} title="${esc(canDrop ? 'Release this player' : dropReason)}">Release</button>
        ${dropReason ? `<span class="why">${esc(dropReason)}</span>` : ''}
      </div>
      ${releaseOpen ? `<div class="row"><button type="button" class="danger" data-act="release-yes" data-id="${esc(p.id)}">Release ${esc(p.name)}</button></div>` : ''}
    </article>`;
  }).join('');
  const hurtList = team.players.filter((p) => p.injury > 0);
  const hurtLine = hurtList.length
    ? `Injured: ${hurtList.map((p) => `${p.name} (${p.injury})`).join(', ')}.`
    : 'No one is injured.';
  return `<div class="panel" style="border-left:8px solid ${race.colors.primary}"><h2>Squad ${team.players.length}/${BALANCE.rosterMax}</h2><button class="ghost" data-act="auto-lineup">Auto-pick starting five</button>${ui.swapId ? '<p class="style">Choose which starter to replace below.</p>' : ''}
    <p class="muted">${fit} fit. ${readyForMatch(game) ? 'Weekly activities complete.' : `Plan this week: ${game.trainsLeft} coached places available.`} ${esc(hurtLine)} Five start. Release stays blocked below ${BALANCE.rosterMin} players or below ${BALANCE.fieldSize} fit. ${esc(race.name)}: ${esc(race.style)}. ${esc(traitLabel(race.trait))}</p></div>
    <div class="grid" style="margin-top:10px">${cards}</div>`;
}

function renderRecruit(team) {
  const full = team.players.length >= BALANCE.rosterMax;
  const cards = game.pool.map((p, i) => {
    const cost = recruitCost(p);
    const afford = team.gold >= cost && !full;
    const why = full ? `Roster is full (${BALANCE.rosterMax})` : `Need ${cost}g`;
    return `<article class="card">
      <div class="who">
        <canvas class="portrait" width="120" height="150" data-portrait="${esc(p.id)}" data-expr="neutral"></canvas>
        <div><h2>${esc(p.name)}</h2><p class="muted">${esc(p.positionLabel)}</p></div>
      </div>
      <div class="stats">${statLine(p)}</div>
      <button type="button" data-act="sign" data-index="${i}" ${afford ? '' : 'disabled'} title="${esc(why)}">Sign for ${cost}g</button>
    </article>`;
  }).join('');
  const rerollAfford = team.gold >= BALANCE.scoutReroll;
  return `<div class="panel"><h2>Scouting pool</h2>
    <p class="muted">Three free looks land between matches. A reroll costs ${BALANCE.scoutReroll}g. Price is ${raceById(team.race).recruitCost}g plus 6g for every stat point over 18.</p>
    <button type="button" class="ghost" data-act="reroll" ${rerollAfford ? '' : 'disabled'} title="${rerollAfford ? '' : `Need ${BALANCE.scoutReroll}g`}">Reroll scouts · ${BALANCE.scoutReroll}g</button>
    </div><div class="grid" style="margin-top:10px">${cards}</div>`;
}

function renderUpgrades(team) {
  const blocks = [
    ['training', 'Training ground', team.trainingLevel, trainingGroundBlurb(team.trainingLevel), images.stands],
    ['stadium', 'Stadium', team.stadiumLevel, stadiumBlurb(team.stadiumLevel), images.trophy],
    ['clinic', 'Club clinic', team.clinicLevel, clinicBlurb(team.clinicLevel, team.trait), null],
  ].map(([kind, label, level, blurb, img]) => {
    const cost = facilityCost(kind, level);
    const maxed = cost == null;
    const afford = !maxed && team.gold >= cost;
    const art = img?.ok ? `<img src="${img.img.src}" width="48" height="48" alt="" style="image-rendering:${img.pixelated ? 'pixelated' : 'auto'}">` : '';
    return `<article class="card">
      <div class="who">${art}<h2>${label} · level ${level}/${BALANCE.maxFacility}</h2></div>
      <p class="muted">${esc(blurb)}</p>
      ${!maxed ? `<p class="upgrade-preview"><strong>Next level:</strong> ${esc(kind === 'training' ? trainingGroundBlurb(level + 1) : kind === 'clinic' ? clinicBlurb(level + 1, team.trait) : stadiumBlurb(level + 1))}</p>` : ''}
      ${maxed ? '<p class="style">Maxed.</p>' : `<button type="button" data-act="upgrade" data-kind="${kind}" ${afford ? '' : 'disabled'} title="${afford ? '' : `Need ${cost}g`}">Upgrade · ${cost}g</button>`}
    </article>`;
  }).join('');
  const win = purse(team, 'win');
  const loss = purse(team, 'loss');
  const rules = rulesLines().map((line) => `<li>${esc(line)}</li>`).join('');
  return `<div class="section-heading"><div><p class="eyebrow">Build your advantage</p><h2>A better place to grow.</h2></div><button class="ghost" data-act="tab" data-tab="week">Back to weekly plan</button></div><div class="facility-grid">${blocks}</div>
    <div class="panel" style="margin-top:10px">
      <h2>What you get paid</h2>
      <p class="muted">At ${team.fans} fans, stadium ${team.stadiumLevel}: a win pays ${win.total}g (gate ${win.gate} + sponsor ${win.sponsor}) and ${win.fansDelta >= 0 ? '+' : ''}${win.fansDelta} fans. A loss pays ${loss.total}g and ${loss.fansDelta} fans. Fans never drop below ${BALANCE.fansMin}.</p>
      <ul class="muted">${rules}</ul>
    </div>`;
}

function tableHtml(division) {
  const rows = divisionTableRows(division).map((row, index) => {
    const me = row.id === game.playerId ? ' me' : '';
    const spot = index === 0 ? ' spot' : '';
    const color = raceById(row.race).colors.primary;
    return `<tr class="${me}${spot}" style="box-shadow:inset 4px 0 0 ${color}">
      <td>${index + 1}</td>
      <td><span class="swatch" style="background:${color}"></span> ${esc(row.name)}</td>
      <td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td>
      <td>${row.lost}</td><td>${row.pf}</td><td>${row.pa}</td><td>${row.diff}</td><td>${row.pts}</td>
    </tr>`;
  }).join('');
  return `<div class="panel"><h2>${esc(divisionName(division))}</h2>
    <table><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>PF</th><th>PA</th><th>Diff</th><th>Pts</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function divisionTableRows(division) {
  return leagueTable(game).filter((row) => row.division === division);
}

function renderTable() {
  return `<p class="muted">You only play your division. First place, after difference, points scored, then name, goes to the cup against the other division's champion.</p>
    <div class="split">${tableHtml('fen')}${tableHtml('ridge')}</div>`;
}

function lineupBlock(team) {
  const starters = pickLineup(team.players, team.lineup);
  const lines = starters.map((p) => `<li>${esc(p.name)} · ${esc(p.positionLabel)} · Str ${p.stats.strength} Spd ${p.stats.speed} Agi ${p.stats.agility} Pas ${p.stats.passing}</li>`).join('');
  const total = starters.reduce((s, p) => s + p.stats.strength + p.stats.speed + p.stats.agility + p.stats.passing, 0);
  return `<h2>${esc(team.name)}</h2><p class="muted">${esc(traitLabel(team.trait))} Starting stat total ${total}. Fit ${healthyCount(team)}/${team.players.length}.</p><ul class="muted">${lines}</ul>`;
}

function renderMatchup(team) {
  const fx = playerFixture(game);
  if (!fx) return `<div class="panel"><p>No match scheduled.</p></div>`;
  const oppId = fx[0] === team.id ? fx[1] : fx[0];
  const opp = teamById(game, oppId);
  loadRaceArt(opp.race);
  const win = purse(team, 'win');
  const loss = purse(team, 'loss');
  const draw = purse(team, 'draw');
  const fit = healthyCount(team);
  const warn = fit === 0
    ? 'Nobody is fit. You forfeit 0–3.'
    : fit < 5
      ? `Only ${fit} fit. You will start short-handed.`
      : '';
  return `${renderTactics(team)}${weekSteps(game)}${!readyForMatch(game) ? '<div class="panel prep-reminder"><h2>Your preparation week comes first.</h2><p>Assign activities and run the week before kickoff. Free team practice is always an option.</p><button class="ember" data-act="tab" data-tab="week">Plan this week →</button></div>' : ''}<div class="split">
      <div class="panel">${lineupBlock(team)}</div>
      <div class="panel">${lineupBlock(opp)}</div>
    </div>
    <div class="panel" style="margin-top:10px">
      <p>${esc(matchRuleText())}</p>
<p class="muted">Your starting five and tactical plan shape the match. Injured starters are replaced by fit reserves at kickoff.</p>
      <p class="muted">Win ${win.total}g and ${win.fansDelta >= 0 ? '+' : ''}${win.fansDelta} fans. Draw ${draw.total}g. Loss ${loss.total}g and ${loss.fansDelta} fans.</p>
      ${warn ? `<p class="style">${esc(warn)}</p>` : ''}
      <button type="button" class="ember" data-act="kickoff" ${readyForMatch(game) ? '' : 'disabled'}>Kick off</button>
    </div>`;
}

function renderTactics(team) {
  const selected = team.tactic || defaultTactic(team);
  return `<div class="section-heading"><div><p class="eyebrow">The coach's call</p><h2>How do you want to win?</h2></div><button class="ghost" data-act="tab" data-tab="squad">Choose starting five</button></div><div class="tactic-grid">${Object.entries(TACTICS).map(([id, plan]) => `<button class="tactic-card ${id === selected ? 'selected' : ''}" data-act="set-tactic" data-tactic="${id}" aria-pressed="${id === selected}"><span>${plan.short}</span><h3>${plan.name}</h3><p>${plan.description}</p></button>`).join('')}</div>`;
}

function renderExhibition() {
  const ex = ui.exhibition;
  const side = (key, tacticKey, label) => {
    const race = raceById(ex[key]);
    return `<article class="exhibition-team"><p class="eyebrow">${label}</p><canvas class="face" width="200" height="230" data-face="${race.id}"></canvas><label for="ex-${key}">Club</label><select id="ex-${key}" data-exhibition="${key}">${RACES.map(r => `<option value="${r.id}" ${r.id === race.id ? 'selected' : ''}>${r.team}</option>`).join('')}</select><label for="ex-${tacticKey}">Game plan</label><select id="ex-${tacticKey}" data-exhibition="${tacticKey}">${Object.entries(TACTICS).map(([id, p]) => `<option value="${id}" ${id === ex[tacticKey] ? 'selected' : ''}>${p.name} · ${p.short}</option>`).join('')}</select><p>${TACTICS[ex[tacticKey]].description}</p></article>`;
  };
  return `<section class="exhibition-intro"><p class="eyebrow">Five a side. No place to hide.</p><h2>LET THEM PLAY.</h2><p>Big hits. Desperate passes. One loose ball can change everything.</p></section><div class="exhibition-pair">${side('home','tacticA','Home club')}<div class="versus">VS</div>${side('away','tacticB','Away club')}</div><div class="exhibition-launch"><button class="ember" data-act="start-exhibition" ${ex.home === ex.away ? 'disabled' : ''}>Watch the match →</button><button class="ghost" data-act="leave-exhibition">${game ? 'Back to my club' : 'Start a club instead'}</button><p>Exhibitions keep your career untouched. Choose different clubs or plans to change the contest.</p></div>`;
}

function renderMatchStats(res, home, away) {
  if (!res.stats) return '';
  const stats = [['touchdowns','Touchdowns'],['passes','Passes attempted'],['completions','Passes completed'],['blocks','Blocks landed'],['tackles','Tackles made'],['interceptions','Interceptions'],['recoveries','Loose balls recovered'],['yards','Ground gained']];
  const star = res.star;
  const starPlayer = star && [...home.players, ...away.players].find(p => p.id === star.id);
  const portrait = starPlayer ? `assets/${raceById(starPlayer.race).file}-${starPlayer.position}-portrait-happy.png` : '';
  const moments = res.events.filter(e => ['touchdown','interception'].includes(e.type));
  return `<div class="match-report-grid"><section class="panel"><p class="eyebrow">The match in numbers</p><table class="match-stat-table"><thead><tr><th>${esc(home.short)}</th><th>Match stats</th><th>${esc(away.short)}</th></tr></thead><tbody>${stats.map(([key,label])=>`<tr><td>${res.stats.A[key]}</td><th>${label}</th><td>${res.stats.B[key]}</td></tr>`).join('')}</tbody></table></section><section class="panel star-player"><p class="eyebrow">Player of the match</p>${portrait ? `<img src="${portrait}" width="150" height="150" alt="${esc(star.name)}">` : ''}<h2>${esc(star?.name || 'A team effort')}</h2><p>${star ? `${star.touchdowns} touchdowns · ${star.tackles} tackles · ${star.blocks} blocks` : ''}</p><p class="muted">${star ? esc(star.side === 'A' ? home.name : away.name) : ''}</p></section></div><section class="panel key-moments"><h2>The turning points</h2>${moments.length ? `<ol>${moments.map(e=>`<li><time>${Math.floor(e.t/60)}:${String(Math.floor(e.t%60)).padStart(2,'0')}</time><span class="${e.type}">${e.type === 'touchdown' ? 'TOUCHDOWN' : 'INTERCEPTION'}</span><p>${esc(e.text)}</p><strong>${e.scoreA} : ${e.scoreB}</strong></li>`).join('')}</ol>` : '<p class="muted">Both defenses held their ground.</p>'}</section>`;
}

function renderExhibitionResult() {
  const { res, teams } = ui.exhibitionResult;
  const title = res.winner === 'draw' ? 'Honors even.' : `${teams[res.winner].short} take the win.`;
  return `<section class="panel exhibition-final"><p class="eyebrow">Full time · Exhibition</p><div class="final-score"><span>${esc(teams.A.name)}</span><strong>${res.scoreA} : ${res.scoreB}</strong><span>${esc(teams.B.name)}</span></div><h2>${esc(title)}</h2><div class="row"><button class="ember" data-act="watch-again">Watch again</button><button class="ghost" data-act="rematch-exhibition">Play a rematch</button><button class="ghost" data-act="open-exhibition">Change the matchup</button><button class="ghost" data-act="leave-exhibition">${game ? 'Back to my club' : 'Choose a club'}</button></div></section>${renderMatchStats(res, teams.A, teams.B)}`;
}

function renderMatchShell() {
  return `<div class="match-stage"><canvas id="pitch" width="1280" height="720" aria-label="Live fantasy football match"></canvas><div class="match-controls"><button data-act="match-pause">${ui.paused ? 'Resume' : 'Pause'}</button><button data-act="match-speed">${ui.speed}× speed</button><button data-act="replay-toggle">Auto replay ${ui.autoReplay ? 'on' : 'off'}</button><button data-act="replay-last">Replay last big play</button><button data-act="fullscreen">Full screen</button><button data-act="finish-match">Skip to result</button><button class="ember" id="continue" data-act="continue" ${ui.playback?.done ? '' : 'hidden'}>Match report →</button></div></div>`;
}

function renderPost() {
  const post = ui.post;
  if (!post) return '<div class="panel">Nothing to report.</div>';
  const mine = post.mine;
  const home = mine.a === game.playerId;
  const us = home ? mine.res.scoreA : mine.res.scoreB;
  const them = home ? mine.res.scoreB : mine.res.scoreA;
  const opp = teamById(game, home ? mine.b : mine.a);
  const result = home ? mine.report.resultA : mine.report.resultB;
  const pay = home ? mine.report.payA : mine.report.payB;
  const fansAfter = home ? mine.report.fansAfterA : mine.report.fansAfterB;
  const fansBefore = home ? mine.report.fansBeforeA : mine.report.fansBeforeB;
  const notes = mine.report.notes.filter((n) => n.teamId === game.playerId).map((n) => `<li>${esc(n.text)}</li>`).join('');
  const headline = result === 'win' ? 'WIN' : result === 'loss' ? 'LOSS' : 'DRAW';
  const next = post.toReview
    ? '<button type="button" class="ember" data-act="to-review">See the table</button>'
    : '<button type="button" class="ember" data-act="to-hub">Back to the clubhouse</button>';
  return `<div class="panel end">
    <p class="muted">${esc(playerTeam(game).short)} ${us} – ${them} ${esc(opp.short)}</p>
    <h2>${headline}</h2>
    <p>Gate ${pay.gate}g + sponsor ${pay.sponsor}g = ${pay.total}g. Fans ${fansBefore} → ${fansAfter}.</p>
    ${notes ? `<ul class="muted" style="text-align:left">${notes}</ul>` : '<p class="muted">No fresh injuries, no level-ups.</p>'}
    ${next}
  </div>${renderMatchStats(mine.res, teamById(game, mine.a), teamById(game, mine.b))}`;
}

function renderReview() {
  const place = playerRank(game);
  const mine = divisionTableRows(place.division);
  const otherId = place.division === 'fen' ? 'ridge' : 'fen';
  const other = divisionTableRows(otherId)[0];
  const champ = mine[0];
  const made = place.champion;
  let blurb = `You finished ${place.tied ? 'tied for ' : ''}${ordinal(place.rank)} in the ${divisionName(place.division)}.`;
  if (made) blurb = `You won the ${divisionName(place.division)} on ${place.row.pts} points. Cup final against ${other.name}.`;
  else blurb = `You finished ${place.tied ? 'tied for ' : ''}${ordinal(place.rank)} in the ${divisionName(place.division)}. ${champ.name} take the cup spot.`;
  const action = made
    ? '<button type="button" class="ember" data-act="final">Play the cup final</button>'
    : '<button type="button" class="ember" data-act="next">Next season</button>';
  return `${renderTable()}<div class="panel end" style="margin-top:10px"><h2>${esc(blurb)}</h2>
    <p class="muted">A level cup final goes to the side with more division points, then difference, then points scored. ${made ? '' : 'The offseason clears injuries. Rivals return with +1 to every stat.'}</p>
    ${action}</div>`;
}

function renderDone() {
  const report = game.finalReport;
  const home = teamById(game, report.homeId);
  const away = teamById(game, report.awayId);
  const winner = teamById(game, report.cupWinnerId);
  const title = report.playerWon ? 'CUP CHAMPIONS' : 'RUNNERS-UP';
  const drawNote = report.drawn ? ' Level scores. The league leader keeps the cup.' : '';
  const pay = report.homeId === game.playerId ? report.report.payA : report.report.payB;
  const art = images.trophy?.ok ? `<img src="${images.trophy.img.src}" width="48" height="48" alt="">` : '';
  return `<div class="panel end">
    ${art}<h2>${title}</h2>
    <p>${esc(home.short)} ${report.res.scoreA} – ${report.res.scoreB} ${esc(away.short)}. ${esc(winner.name)} lift the cup.${drawNote}</p>
    <p class="muted">You collected ${pay.total}g. Cups ${game.cups}. Division titles ${game.titles}.</p>
    <p class="muted">Next season the rivals come back sharper (+${game.season} to every stat). Your squad, gold, fans, and buildings stay. Injuries clear.</p>
    <button type="button" class="ember" data-act="next">Start season ${game.season + 1}</button>
  </div>${renderMatchStats(report.res, home, away)}`;
}

function paintStill() {
  document.querySelectorAll('[data-crest]').forEach((canvas) => {
    drawCrest(canvas.getContext('2d'), raceById(canvas.dataset.crest), canvas.width);
  });
  document.querySelectorAll('[data-face]').forEach((canvas) => {
    const race = raceById(canvas.dataset.face);
    if (!race) return;
    drawPortrait(canvas.getContext('2d'), canvas.width, canvas.height, {
      race: race.id,
      position: race.face,
    }, 'neutral');
  });
  document.querySelectorAll('[data-portrait]').forEach((canvas) => {
    const player = findAnyPlayer(canvas.dataset.portrait);
    if (!player) return;
    drawPortrait(canvas.getContext('2d'), canvas.width, canvas.height, player, canvas.dataset.expr || 'neutral');
  });
}

function findAnyPlayer(id) {
  if (!game) return null;
  for (const team of game.teams) {
    const found = team.players.find((p) => p.id === id);
    if (found) return found;
  }
  return (game.pool || []).find((p) => p.id === id) || null;
}

function drawCrest(ctx, race, size) {
  ctx.clearRect(0, 0, size, size);
  const art = images[`crest-${race.file}`];
  if (art?.ok) {
    ctx.imageSmoothingEnabled = !art.pixelated;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art.img, 0, 0, size, size);
    return;
  }
  const s = size / 32;
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = race.colors.dark;
  ctx.fillRect(6, 2, 20, 22);
  ctx.fillStyle = race.colors.primary;
  ctx.fillRect(8, 4, 16, 16);
  ctx.fillStyle = race.colors.secondary;
  ctx.fillRect(8, 4, 16, 4);
  ctx.fillStyle = race.colors.ink;
  if (race.emblem === 'tusk') { ctx.fillRect(12, 12, 3, 6); ctx.fillRect(17, 12, 3, 6); }
  else if (race.emblem === 'stripe') ctx.fillRect(14, 8, 4, 12);
  else if (race.emblem === 'anvil') { ctx.fillRect(10, 14, 12, 4); ctx.fillRect(13, 10, 6, 4); }
  else if (race.emblem === 'leaf') { ctx.fillRect(14, 8, 4, 10); ctx.fillRect(12, 10, 8, 4); }
  else if (race.emblem === 'tooth') { ctx.fillRect(11, 12, 3, 5); ctx.fillRect(15, 12, 3, 5); ctx.fillRect(19, 12, 3, 5); }
  else if (race.emblem === 'eyes') { ctx.fillRect(11, 10, 3, 3); ctx.fillRect(18, 10, 3, 3); }
  else if (race.emblem === 'snout') ctx.fillRect(18, 12, 6, 4);
  else { ctx.fillRect(12, 10, 8, 6); }
  ctx.fillStyle = race.colors.primary;
  ctx.fillRect(12, 20, 4, 6);
  ctx.fillRect(16, 20, 4, 6);
  ctx.restore();
}

function faceMarks(ctx, race, expression) {
  const c = race.colors;
  ctx.fillStyle = '#161616';
  if (expression === 'hurt') {
    ctx.fillRect(17, 5, 2, 4);
    ctx.fillRect(16, 6, 4, 2);
  } else if (expression === 'angry') {
    ctx.fillRect(16, 5, 4, 2);
    ctx.fillRect(16, 4, 2, 2);
  } else {
    ctx.fillRect(18, 6, 2, 2);
  }
  ctx.fillStyle = expression === 'happy' ? '#8a3030' : '#3a2418';
  if (expression === 'happy') ctx.fillRect(16, 10, 5, 2);
  else if (expression === 'angry' || expression === 'hurt') ctx.fillRect(16, 11, 5, 1);
  else ctx.fillRect(17, 10, 3, 1);
  if (race.id === 'orcs' || race.id === 'ogres') {
    ctx.fillStyle = '#f4f0dc';
    ctx.fillRect(20, 11, 2, 3);
  } else if (race.id === 'elves' || race.id === 'darkelves') {
    ctx.fillStyle = c.skin;
    ctx.fillRect(8, 6, 3, 2);
  } else if (race.id === 'goblins' || race.id === 'halflings') {
    ctx.fillStyle = c.skin;
    ctx.fillRect(6, 7, 4, 3);
  } else if (race.id === 'undead') {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(18, 6, 2, 2);
  } else if (race.id === 'ratfolk') {
    ctx.fillStyle = c.skin;
    ctx.fillRect(21, 8, 6, 3);
  } else if (race.id === 'lizardfolk') {
    ctx.fillStyle = c.skin;
    ctx.fillRect(21, 7, 7, 4);
  } else if (race.id === 'doomsworn') {
    ctx.fillStyle = c.primary;
    ctx.fillRect(11, 1, 2, 4);
    ctx.fillRect(19, 1, 2, 4);
  }
}

function drawMascot(ctx, race, pose, frame, expression = 'neutral') {
  const c = race.colors;
  const bulky = race.id === 'ogres' || race.id === 'doomsworn';
  if (pose === 'down') {
    ctx.fillStyle = c.primary;
    ctx.fillRect(2, 20, 22, 8);
    ctx.fillStyle = c.secondary;
    ctx.fillRect(4, 18, 6, 4);
    ctx.fillStyle = c.skin;
    ctx.fillRect(22, 16, 8, 8);
    faceMarks(ctx, race, 'hurt');
    return;
  }
  const step = pose === 'run' ? (frame % 2 ? 3 : -2) : 0;
  const lean = pose === 'tackle' ? (frame === 0 ? -3 : 5) : 0;
  ctx.save();
  ctx.translate(lean, 0);
  const short = race.id === 'dwarves' || race.id === 'goblins' || race.id === 'halflings';
  const bodyY = short ? 15 : bulky ? 11 : 12;
  const bodyH = short ? 9 : bulky ? 13 : 11;
  const bodyW = bulky ? 18 : 16;
  const bodyX = bulky ? 7 : 8;
  ctx.fillStyle = c.dark;
  ctx.fillRect(10, 22, 4, short ? 6 : 8);
  ctx.fillRect(18 + step, 22, 4, short ? 6 : 8);
  ctx.fillStyle = c.primary;
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
  ctx.fillStyle = c.secondary;
  ctx.fillRect(bodyX - 1, bodyY + 1, 4, 4);
  ctx.fillRect(bodyX + bodyW - 3, bodyY + 1, 4, 4);
  if (pose === 'tackle') {
    ctx.fillStyle = c.skin;
    ctx.fillRect(frame === 0 ? 2 : 22, bodyY + 2, 8, 3);
  }
  ctx.fillStyle = c.skin;
  ctx.fillRect(10, 2, 12, 11);
  if (race.id === 'humans' || race.id === 'dwarves' || race.id === 'halflings') {
    ctx.fillStyle = race.id === 'dwarves' ? c.secondary : c.dark;
    ctx.fillRect(10, 2, 12, 3);
  }
  if (race.id === 'dwarves') {
    ctx.fillStyle = c.secondary;
    ctx.fillRect(10, 11, 12, 4);
  }
  if (race.id === 'ratfolk') {
    ctx.fillStyle = c.secondary;
    ctx.fillRect(2, 16, 7, 2);
  }
  if (race.id === 'lizardfolk') {
    ctx.fillStyle = c.primary;
    ctx.fillRect(2, 16, 7, 3);
  }
  faceMarks(ctx, race, expression);
  ctx.restore();
}

function drawPortrait(ctx, w, h, player, expression) {
  const race = raceById(player.race);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1a120e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = race.colors.primary;
  ctx.fillRect(0, h - 10, w, 10);
  ctx.fillStyle = race.colors.secondary;
  ctx.fillRect(0, h - 14, w, 4);
  const rec = portraitRecord(race, player.position, expression);
  if (rec?.ok) {
    const fr = frameOf(rec, 0);
    const pad = 8;
    const maxW = w - pad * 2;
    const maxH = h - 22;
    const scale = Math.min(maxW / fr.sw, maxH / fr.sh);
    const dw = fr.sw * scale;
    const dh = fr.sh * scale;
    ctx.imageSmoothingEnabled = !rec.pixelated;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(rec.img, fr.sx, fr.sy, fr.sw, fr.sh, (w - dw) / 2, h - 14 - dh, dw, dh);
    return;
  }
  ctx.save();
  ctx.translate(w / 2, h - 16);
  ctx.scale(Math.min(w, h) / 40, Math.min(w, h) / 40);
  ctx.translate(-16, -32);
  drawMascot(ctx, race, 'idle', 0, expression);
  ctx.restore();
}

function drawPlayer(ctx, player, x, y, facing, pose, frame) {
  const race = raceById(player.race);
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(px, py, PLAYER_H * 0.22, PLAYER_H * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = race.colors.primary;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(px, py - 1, PLAYER_H * 0.16, PLAYER_H * 0.045, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const art = poseArt(race, player.position, pose);
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(facing < 0 ? -1 : 1, 1);
  if (pose === 'down') {
    ctx.fillStyle = 'rgba(210, 184, 140, 0.55)';
    ctx.beginPath();
    ctx.ellipse(8, -3, 26, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 244, 220, 0.35)';
    ctx.beginPath();
    ctx.ellipse(28, -8, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (art.rec?.ok) {
    if (art.fake && pose === 'run') {
      const up = frame % 2 === 1;
      ctx.translate(0, up ? -6 : 0);
      ctx.scale(up ? 0.96 : 1.05, up ? 1.06 : 0.94);
    } else if (art.fake && pose === 'tackle') {
      const wind = frame === 0;
      ctx.rotate(wind ? -0.22 : 0.3);
      ctx.translate(wind ? -10 : 18, wind ? -4 : 2);
    } else if (art.fake && pose === 'down') {
      ctx.translate(6, 10);
      ctx.rotate(Math.PI / 2);
    }
    const fr = frameOf(art.rec, art.fake ? 0 : frame);
    const dh = PLAYER_H;
    const dw = dh * (fr.sw / fr.sh);
    ctx.imageSmoothingEnabled = !art.rec.pixelated;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art.rec.img, fr.sx, fr.sy, fr.sw, fr.sh, -dw / 2, -dh, dw, dh);
  } else {
    const s = PLAYER_H / 32;
    ctx.scale(s, s);
    ctx.translate(-16, -32);
    drawMascot(ctx, race, pose, frame, pose === 'down' ? 'hurt' : pose === 'tackle' ? 'angry' : 'neutral');
  }
  ctx.restore();
}

function drawBall(ctx, x, y) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(y));
  if (images.ball?.ok) {
    ctx.imageSmoothingEnabled = !images.ball.pixelated;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(images.ball.img, -16, -16, 32, 32);
  } else {
    ctx.fillStyle = '#6b3a1f';
    ctx.fillRect(-6, -6, 12, 12);
    ctx.fillStyle = '#f4e6cf';
    ctx.fillRect(-2, -6, 4, 12);
    ctx.fillRect(-6, -2, 12, 4);
  }
  ctx.restore();
}

function drawPitch(ctx, homeRace, awayRace, fans, stadiumLevel) {
  if (images.pitch?.ok) {
    ctx.imageSmoothingEnabled = !images.pitch.pixelated;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(images.pitch.img, 0, 0, 800, 600);
    return;
  }
  ctx.fillStyle = '#8ec6ea';
  ctx.fillRect(0, 0, 800, 210);
  ctx.fillStyle = '#d7ecf8';
  ctx.fillRect(80, 36, 70, 24);
  ctx.fillRect(420, 28, 90, 20);
  ctx.fillStyle = '#6b4a32';
  ctx.fillRect(24, 96, 752, 78);
  ctx.fillStyle = '#4e3424';
  ctx.fillRect(24, 168, 752, 16);
  if (stadiumLevel >= 2) {
    ctx.fillStyle = '#5a3b28';
    ctx.fillRect(24, 70, 752, 28);
  }
  const seats = Math.min(96, Math.floor(fans / 2));
  for (let i = 0; i < 96; i += 1) {
    const col = i % 32;
    const row = Math.floor(i / 32);
    const color = i < seats
      ? (i % 3 === 0 ? homeRace.colors.primary : i % 3 === 1 ? awayRace.colors.primary : '#f0c14a')
      : '#3a2a22';
    ctx.fillStyle = color;
    ctx.fillRect(40 + col * 23, 108 + row * 18, 8, 8);
  }
  ctx.fillStyle = '#2f8a3a';
  ctx.fillRect(36, 210, 728, 250);
  ctx.fillStyle = '#277a32';
  for (let x = 36; x < 764; x += 56) ctx.fillRect(x, 210, 28, 250);
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = homeRace.colors.primary;
  ctx.fillRect(36, 210, 72, 250);
  ctx.fillStyle = awayRace.colors.primary;
  ctx.fillRect(692, 210, 72, 250);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  for (let s = 0; s <= 10; s += 1) {
    const x = 36 + (s / 10) * 728;
    ctx.beginPath();
    ctx.moveTo(x, 214);
    ctx.lineTo(x, 456);
    ctx.stroke();
  }
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(48, 250, 4, 70);
  ctx.fillRect(48, 250, 18, 4);
  ctx.fillRect(748, 250, 4, 70);
  ctx.fillRect(730, 250, 18, 4);
  ctx.fillStyle = '#6b4a32';
  ctx.fillRect(0, 460, 800, 48);
}

async function startPlayback(res, meta, sourceTeams = game?.teams) {
  stopLoop();
  const request = (ui.playbackRequest || 0) + 1; ui.playbackRequest = request;
  ui.screen = 'loading-match'; render();
  const roster = {};
  const teams = {};
  for (const [id, side] of [[meta.a, 'A'], [meta.b, 'B']]) {
    teams[side] = sourceTeams.find(t => t.id === id);
    for (const player of teams[side].players) roster[player.id] = { player, side };
  }
  for (const team of Object.values(teams)) loadRaceArt(team.race);
  const prefixes = Object.values(teams).map(team => raceById(team.race).file + '-');
  await Promise.all(Object.values(images).filter(rec => prefixes.some(prefix => rec.key.startsWith(prefix)) || ['pitch','ball'].includes(rec.key)).map(rec => rec.img.decode().catch(() => {})));
  if (request !== ui.playbackRequest || ui.screen !== 'loading-match') return;
  ui.playback = { res, meta, roster, teams, t: 0, done: false, replay: null, replayed: new Set() };
  ui.screen = 'match'; ui.paused = false; flash('');
  render(); lastTick = performance.now(); stopLoop();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loop = now => {
    const pb = ui.playback;
    if (ui.screen !== 'match' || !pb) return;
    const raw = Math.min(.08, (now - lastTick) / 1000); lastTick = now;
    if (!ui.paused && !pb.done) {
      if (pb.replay) {
        pb.replay.t += raw * .65;
        if (pb.replay.t >= pb.replay.end) pb.replay = null;
      } else {
        pb.t += raw * ui.speed;
        const highlight = pb.res.highlights?.find(h => h.event.type === 'touchdown' && pb.t >= h.event.t + 2.6 && pb.t < h.event.t + 3.4 && !pb.replayed.has(h.event.t));
        if (highlight && ui.autoReplay && !reducedMotion) { pb.replayed.add(highlight.event.t); pb.replay = { ...highlight, t: highlight.start }; }
        if (pb.t >= pb.res.duration) { pb.t = pb.res.duration; pb.done = true; const btn = document.getElementById('continue'); if (btn) btn.hidden = false; }
      }
    }
    const canvas = document.getElementById('pitch');
    if (canvas) drawBroadcast(canvas.getContext('2d'), pb, { images, drawPlayer, drawPortrait, drawBall }, { time: pb.replay?.t ?? pb.t, replay: !!pb.replay, paused: ui.paused, reducedMotion });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function onContinue() {
  if (ui.applying || !ui.playback || !ui.playback.done) return;
  ui.applying = true;
  stopLoop();
  const pending = ui.playback.meta.kind;
  if (pending === 'exhibition') {
    ui.exhibitionResult = { res: ui.playback.res, teams: ui.playback.teams };
    ui.playback = null; ui.screen = 'exhibition-result';
  } else if (pending === 'final') {
    resolveFinal(game);
    ui.playback = null;
    ui.screen = 'done';
  } else {
    const reports = resolveRound(game);
    const mine = reports.find((r) => r.a === game.playerId || r.b === game.playerId);
    ui.post = { mine, toReview: game.phase === 'review' };
    ui.playback = null;
    ui.screen = 'post';
  }
  ui.estimateKey = '';
  ui.applying = false;
  flash('');
  render();
}

function act(name, el) {
  if (name === 'pick') {
    ui.selectedRace = el.dataset.race;
    render();
    return;
  }
  if (name === 'lead') {
    const seed = (Math.random() * 0x7fffffff) | 0;
    game = newGame(ui.selectedRace, seed);
    ui.screen = 'hub';
    ui.tab = 'club';
    flash(`${playerTeam(game).name} open the season with ${BALANCE.startGold}g and ${BALANCE.startFans} fans.`);
    render();
    return;
  }
  if (name === 'open-exhibition') { ui.screen = 'exhibition'; flash(''); render(); return; }
  if (name === 'leave-exhibition') { ui.screen = game ? game.phase === 'league' ? 'hub' : game.phase : 'select'; render(); return; }
  if (name === 'start-exhibition' || name === 'rematch-exhibition') {
    if (name === 'rematch-exhibition') ui.exhibition.seed = Math.floor(Math.random() * 100000);
    const ex = ui.exhibition;
    if (ex.home === ex.away) { flash('Choose two different clubs.'); return; }
    const sample = newGame(ex.home, 42);
    const home = teamById(sample, ex.home), away = teamById(sample, ex.away);
    home.tactic = ex.tacticA; away.tactic = ex.tacticB;
    const res = simulateMatch(home, away, ex.seed);
    startPlayback(res, { a: home.id, b: away.id, kind: 'exhibition', label: 'Exhibition' }, sample.teams);
    return;
  }
  if (name === 'watch-again' && ui.exhibitionResult) {
    const { res, teams } = ui.exhibitionResult;
    startPlayback(res, { a: teams.A.id, b: teams.B.id, kind: 'exhibition', label: 'Exhibition' }, [teams.A, teams.B]); return;
  }
  if (name === 'match-pause') { ui.paused = !ui.paused; el.textContent = ui.paused ? 'Resume' : 'Pause'; return; }
  if (name === 'match-speed') { ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 4 : 1; el.textContent = `${ui.speed}× speed`; return; }
  if (name === 'replay-toggle') { ui.autoReplay = !ui.autoReplay; el.textContent = `Auto replay ${ui.autoReplay ? 'on' : 'off'}`; return; }
  if (name === 'replay-last' && ui.playback) {
    const pb = ui.playback;
    const h = pb.res.highlights.filter(h => h.event.t <= pb.t).at(-1);
    if (h) { el.textContent = 'Replay last big play'; pb.replay = { ...h, t: h.start }; pb.done = false; ui.paused = false; }
    else el.textContent = 'No big play yet';
    return;
  }
  if (name === 'fullscreen') { document.querySelector('.match-stage')?.requestFullscreen?.().catch(() => {}); return; }
  if (name === 'finish-match' && ui.playback) { ui.playback.done = true; onContinue(); return; }
  if (name === 'continue') { onContinue(); return; }
  if (!game) return;
  if (name === 'set-tactic' && TACTICS[el.dataset.tactic]) { playerTeam(game).tactic = el.dataset.tactic; render(); return; }
  if (name === 'choose-sub') { ui.swapId = ui.swapId === el.dataset.id ? null : el.dataset.id; render(); return; }
  if (name === 'swap-starter' && ui.swapId) {
    const team = playerTeam(game), chosen = pickLineup(team.players, team.lineup).map(p => p.id);
    const incoming = team.players.find(p => p.id === ui.swapId && !p.injury);
    if (incoming && chosen.includes(el.dataset.id) && !chosen.includes(incoming.id)) team.lineup = chosen.map(id => id === el.dataset.id ? incoming.id : id);
    ui.swapId = null; render(); return;
  }
  if (name === 'auto-lineup') { delete playerTeam(game).lineup; ui.swapId = null; render(); return; }
  if (name === 'claim') {
    const result = claimGoal(game, el.dataset.goal);
    flash(result.ok ? `${result.name}: +${result.reward}g for the club.` : result.reason);
    render();
    return;
  }
  if (name === 'tab') {
    ui.tab = el.dataset.tab;
    ui.trainId = null;
    ui.releaseId = null;
    render();
    return;
  }
  if (name === 'plan-player') {
    ui.tab = 'week';
    render();
    const select = document.getElementById(`activity-${el.dataset.id}`);
    if (select) { select.scrollIntoView({ block: 'center', behavior: 'instant' }); select.focus({ preventScroll: true }); }
    return;
  }
  if (name === 'advance-week') {
    const result = advanceWeek(game);
    ui.estimateKey = '';
    flash(result.ok ? `Week ${result.report.week} complete. ${result.report.cost}g spent. Your squad's progress is below.` : result.reason);
    render();
    document.querySelector('.week-complete')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    return;
  }
  if (name === 'reset-plan' && game.week.status === 'planning') {
    game.week.assignments = {};
    flash('Fit players will join free team practice. Injured players will rest.');
    render();
    return;
  }
  if (name === 'heal') {
    const result = heal(game, el.dataset.id);
    flash(result.ok ? `Healed for ${result.cost}g.` : result.reason);
    render();
    return;
  }
  if (name === 'release-open') {
    ui.releaseId = ui.releaseId === el.dataset.id ? null : el.dataset.id;
    render();
    return;
  }
  if (name === 'release-yes') {
    const result = release(game, el.dataset.id);
    ui.releaseId = null;
    flash(result.ok ? `Released ${result.name}.` : result.reason);
    render();
    return;
  }
  if (name === 'sign') {
    const result = sign(game, Number(el.dataset.index));
    flash(result.ok ? `Signed ${result.name} for ${result.cost}g.` : result.reason);
    render();
    return;
  }
  if (name === 'reroll') {
    const result = rerollPool(game);
    flash(result.ok ? `New scouts. -${result.cost}g.` : result.reason);
    render();
    return;
  }
  if (name === 'upgrade') {
    const result = upgrade(game, el.dataset.kind);
    flash(result.ok ? `${el.dataset.kind === 'training' ? 'Training ground' : el.dataset.kind === 'clinic' ? 'Club clinic' : 'Stadium'} is level ${result.level}.` : result.reason);
    render();
    return;
  }
  if (name === 'kickoff') {
    if (!readyForMatch(game)) { flash('Run your preparation week before kickoff.'); ui.tab = 'week'; render(); return; }
    const fx = playerFixture(game);
    const seed = fixtureSeed(game, game.round, fx[0], fx[1]);
    const res = simById(game, fx[0], fx[1], seed);
    startPlayback(res, {
      a: fx[0],
      b: fx[1],
      kind: 'league',
      label: `Match ${game.round + 1} / ${game.schedule.length}`,
    });
    return;
  }
  if (name === 'continue') onContinue();
  if (name === 'to-hub') {
    ui.screen = 'hub';
    ui.tab = 'club';
    render();
  }
  if (name === 'to-review') {
    ui.screen = 'review';
    render();
  }
  if (name === 'final') {
    const { home, away } = finalPair(game);
    if (home.id !== game.playerId && away.id !== game.playerId) return;
    const seed = fixtureSeed(game, 'final', home.id, away.id, 'cup');
    const res = simById(game, home.id, away.id, seed);
    startPlayback(res, { a: home.id, b: away.id, kind: 'final', label: 'Cup final' });
  }
  if (name === 'next') {
    nextSeason(game);
    ui.screen = 'hub';
    ui.tab = 'club';
    flash(`Season ${game.season}. Rivals are +${game.season - 1} to every stat. Your injuries cleared.`);
    render();
  }
}

document.body.addEventListener('change', event => {
  if (event.target.dataset.exhibition) { ui.exhibition[event.target.dataset.exhibition] = event.target.value; render(); return; }
  const playerId = event.target.dataset.activityPlayer;
  if (!playerId || !game) return;
  const selectedId = event.target.id;
  const result = assignActivity(game, playerId, event.target.value);
  flash(result.ok ? '' : result.reason);
  render();
  document.getElementById(selectedId)?.focus({ preventScroll: true });
});

document.body.addEventListener('click', (event) => {
  const el = event.target.closest('[data-act]');
  if (!el || el.disabled) return;
  act(el.dataset.act, el);
});

document.getElementById('speed').addEventListener('click', () => {
  ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 4 : 1;
  render();
});

document.getElementById('pause').addEventListener('click', () => {
  ui.paused = !ui.paused;
  render();
});

document.getElementById('restart').addEventListener('click', () => {
  document.getElementById('modal').hidden = false;
  document.getElementById('modal-no').focus();
});
document.getElementById('modal-no').addEventListener('click', () => {
  document.getElementById('modal').hidden = true;
  document.getElementById('restart').focus();
});
document.getElementById('modal-yes').addEventListener('click', () => {
  document.getElementById('modal').hidden = true;
  doRestart();
});
document.getElementById('modal').addEventListener('click', (event) => {
  if (event.target.id === 'modal') event.currentTarget.hidden = true;
});

document.getElementById('missing-btn').addEventListener('click', () => {
  if (!missingArt.size) return;
  showMissing = !showMissing;
  paintMissing();
});

// Clubhouse and report images are DOM elements rather than canvas-loader images.
for (const type of ['error', 'load']) {
  document.addEventListener(type, event => {
    if (!(event.target instanceof HTMLImageElement)) return;
    const src = event.target.currentSrc || event.target.getAttribute('src');
    if (src) (type === 'error' ? noteMissing : clearMissing)(src);
  }, true);
}

document.addEventListener('keydown', (event) => {
  if (!document.getElementById('modal').hidden) {
    if (event.key === 'Escape') {
      document.getElementById('modal').hidden = true;
      document.getElementById('restart').focus();
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      document.getElementById(document.activeElement.id === 'modal-no' ? 'modal-yes' : 'modal-no').focus();
    }
    return;
  }
  if (event.key === 'Escape' && showMissing) {
    showMissing = false;
    paintMissing();
    document.getElementById('missing-btn').focus();
    return;
  }
  if (event.key !== 'm' && event.key !== 'M') return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (!missingArt.size || event.target.closest('input, textarea, select, [contenteditable]')) return;
  showMissing = !showMissing;
  paintMissing();
});

document.getElementById('pitch')?.addEventListener('contextmenu', (event) => event.preventDefault());
document.body.addEventListener('contextmenu', (event) => {
  if (event.target.closest('#pitch, .card, button')) event.preventDefault();
});

window.simulateMatch = simulateMatch;
window.__league = {
  get ui() { return ui; },
  get game() { return game; },
  simulateMatch,
};

const career = loadCareer(storage);
if (career.game) {
  game = career.game;
  ui.screen = game.phase === 'league' ? 'hub' : game.phase;
  ui.tab = 'club';
}
loadArt();
flash(career.message || (game ? `Welcome back to ${playerTeam(game).name}.` : ''));
render();
