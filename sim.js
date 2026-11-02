import { RACES } from './src/data.js';
import { newGame, resolveRound, playerRank } from './src/season.js';

const runs = Math.max(1, Math.min(1000, Number(process.argv[2]) || 20));
const rows = RACES.map(race => {
  let won=0, drawn=0, lost=0, titles=0;
  for(let seed=1;seed<=runs;seed++) {
    const game=newGame(race.id,seed);
    for(let round=0;round<10;round++) resolveRound(game);
    const finish=playerRank(game);
    const team=game.teams.find(t=>t.id===game.playerId);
    won+=team.won; drawn+=team.drawn; lost+=team.lost;
    if(finish.champion) titles++;
  }
  return {team:race.team,seasons:runs,won,drawn,lost,titles};
});
console.log('Idle-player baseline. Opponents use existing AI management. This is not a coached-play balance verdict.');
console.table(rows);
