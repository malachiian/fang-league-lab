/** Seeded spatial football: movement, contact and ball contests determine the result. */
import { TRAITS } from './data.js';
import { makeRng, pickLineup } from './match-core.js';
export const DRIVES=6, DRIVE_SECONDS=24, STEP=.1;
export const TACTICS={
  power:{name:'Iron wall',short:'POWER RUN',description:'Two lead blockers clear a path. Short support routes; passes only under pressure.',passDelay:5,width:12,blockers:2},
  spread:{name:'Skyfire',short:'WIDE PASS',description:'Receivers stretch the field. Earlier, longer passes; less protection for the carrier.',passDelay:1.2,width:23,blockers:1},
  counter:{name:'Blood hunt',short:'PRESS & COUNTER',description:'Swarm the carrier and chase turnovers. Fast counters, but open space behind the press.',passDelay:2.8,width:18,blockers:1},
};
export function defaultTactic(team){return ['orcs','dwarves','ogres','doomsworn','undead'].includes(team.race)?'power':['elves','humans','darkelves'].includes(team.race)?'spread':'counter';}
export function matchRuleText(){return 'Six alternating possessions, each with a 24-second play clock. Run into the opposing end zone to score. Blocks open space; tackles spill the ball; either side can recover or intercept and counterattack. A tied game gets one extra possession each. Your lineup, stats and tactical plan drive every contest.';}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const other=s=>s==='A'?'B':'A';
const round=n=>Math.round(n*1000)/1000;

export function simulateMatch(teamA,teamB,seed,options={}){
  const rng=makeRng(seed),teams={A:teamA,B:teamB};
  const plans=Object.fromEntries(Object.entries(teams).map(([s,t])=>[s,TACTICS[t.tactic]?t.tactic:defaultTactic(t)]));
  const score={A:0,B:0};
  const totals=Object.fromEntries(['A','B'].map(s=>[s,{passes:0,completions:0,tackles:0,blocks:0,dodges:0,interceptions:0,recoveries:0,yards:0,touchdowns:0}]));
  const individuals={},used={A:new Set(),B:new Set()},injured=new Set(),casualties=[],events=[],frames=[],numbers=new Map();
  let actors=[],time=0,drive=0,driveClock=DRIVE_SECONDS,ball={x:50,y:30,z:0,mode:'held',owner:null};
  let possession='A',driveStart=0,lastPass=0,passCount=0,flight=null,scored=false;
  for(const [side,team]of Object.entries(teams))team.players.forEach((p,i)=>{
    individuals[p.id]={id:p.id,name:p.name,side,passes:0,catches:0,tackles:0,blocks:0,interceptions:0,touchdowns:0,yards:0,recoveries:0};numbers.set(p.id,i+1);
  });
  const active=s=>actors.filter(p=>p.side===s&&!p.out);
  const upright=p=>!p.out&&p.stun<=0;
  const carrier=()=>actors.find(p=>p.id===ball.owner&&upright(p));
  const nearEnemies=(p,r)=>actors.filter(q=>q.side!==p.side&&upright(q)&&distance(p,q)<r);
  const strength=p=>p.stats.strength+(TRAITS[teams[p.side].trait]?.lineCheck||0);
  function emit(type,text,actor=null,target=null,extra={}){
    events.push({type,text,t:round(time),dt:extra.dt||1.8,team:actor?.side||possession,actorId:actor?.id||null,targetId:target?.id||null,
      carrierId:ball.owner,x:target?.x??actor?.x??ball.x,y:target?.y??actor?.y??ball.y,scoreA:score.A,scoreB:score.B,drive,...extra});
  }
  function snapshot(){
    if(options.record===false)return;
    frames.push({t:round(time),drive,remaining:round(driveClock),scoreA:score.A,scoreB:score.B,possession,
      ball:{x:round(ball.x),y:round(ball.y),z:round(ball.z),mode:ball.mode,owner:ball.owner},
      players:actors.map(p=>({id:p.id,side:p.side,x:round(p.x),y:round(p.y),facing:p.facing,
        pose:p.stun>0||p.out?'down':p.actionUntil>time?'tackle':p.speed>.2?'run':'idle',out:p.out,number:numbers.get(p.id)}))});
  }
  function hold(seconds){for(let i=0;i<Math.round(seconds/STEP);i++){time+=STEP;if(i%2===0)snapshot();}snapshot();}
  function takeBall(p,type,text){
    const turnover=p.side!==possession;possession=p.side;
    ball={x:p.x,y:p.y,z:2,owner:p.id,mode:'held'};p.carrySince=time;flight=null;
    if(turnover){passCount=0;lastPass=time;}
    if(type)emit(type,text,p,null,{turnover});
  }
  function spill(p){
    ball={x:p.x,y:p.y,z:0,owner:null,mode:'loose',vx:(rng.next()-.5)*18,vy:(rng.next()-.5)*18,freeAt:time+.35};flight=null;
    emit('fumble',`${p.name} loses it. The ball is loose!`,p,null,{popup:'LOOSE BALL'});
  }
  function move(p,target,speed=1){
    const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),step=Math.min(d,(4.4+p.stats.speed*.32)*speed*STEP);
    if(d>.05){p.x+=dx/d*step;p.y+=dy/d*step;p.facing=dx>.05?1:dx<-.05?-1:p.facing;}
    p.x=clamp(p.x,3,97);p.y=clamp(p.y,3,57);p.speed=step/STEP;
  }
  function knock(attacker,victim,kind){
    victim.x=clamp(victim.x+(attacker.side==='A'?2.4:-2.4),3,97);victim.stun=kind==='tackle'?2.4:1.6;victim.cooldown=victim.stun+1;attacker.actionUntil=time+.5;
    const stat=kind==='tackle'?'tackles':'blocks';totals[attacker.side][stat]++;individuals[attacker.id][stat]++;
    emit(kind,`${attacker.name} ${kind==='tackle'?'brings down':'flattens'} ${victim.name}!`,attacker,victim,{popup:kind==='tackle'?'BIG HIT':'BLOCK',impact:true});
    if(ball.owner===victim.id)spill(victim);
    const trait=TRAITS[teams[victim.side].trait]||TRAITS.none,hitTrait=TRAITS[teams[attacker.side].trait]||TRAITS.none;
    const chance=clamp(.035+hitTrait.injuryBonus*.25+trait.injuryTaken*.25-trait.injuryResist*.25,.01,.09);
    if(kind==='tackle'&&casualties.filter(c=>c.team===victim.side).length<2&&rng.next()<chance){
      victim.out=true;injured.add(victim.id);const matchesOut=trait.regen?1:rng.int(1,2);
      casualties.push({team:victim.side,playerId:victim.id,name:victim.name,matchesOut,by:attacker.name});
      emit('casualty',`${victim.name} is off injured. A reserve can enter on the next possession.`,attacker,victim,{popup:'INJURED',matchesOut});
    }
  }
  function tackle(attacker,victim){
    attacker.cooldown=2.1;attacker.actionUntil=time+.4;
    const chance=clamp(.48+(strength(attacker)-victim.stats.strength)*.035+(attacker.stats.speed-victim.stats.agility)*.025,.17,.84);
    if(rng.next()<chance)knock(attacker,victim,'tackle');else{
      attacker.stun=.55;victim.x=clamp(victim.x+(victim.side==='A'?1.6:-1.6),3,97);totals[victim.side].dodges++;
      emit('dodge',`${victim.name} slips past ${attacker.name}!`,victim,attacker,{popup:'SIDESTEP'});
    }
  }
  function tryPass(p){
    const plan=TACTICS[plans[p.side]],dir=p.side==='A'?1:-1;
    if(time-driveStart<plan.passDelay||time-lastPass<2.5||time-p.carrySince<.8||passCount>=2)return;
    const pressure=nearEnemies(p,10).length;if(plans[p.side]==='power'&&(!pressure||time-driveStart<5))return;
    const ranked=active(p.side).filter(q=>upright(q)&&q!==p&&(q.x-p.x)*dir>5&&distance(p,q)<42)
      .map(q=>({p:q,gap:Math.min(25,...active(other(p.side)).filter(upright).map(d=>distance(q,d)))}))
      .sort((a,b)=>(b.gap*2+(b.p.x-p.x)*dir*.35+b.p.stats.agility)-(a.gap*2+(a.p.x-p.x)*dir*.35+a.p.stats.agility));
    if(!ranked.length||(ranked[0].gap<4&&!pressure))return;
    const target=ranked[0].p,error=Math.max(.7,4.8-p.stats.passing*.22);
    const end={x:clamp(target.x+dir*3+(rng.next()-.5)*error*2,5,95),y:clamp(target.y+(rng.next()-.5)*error*2,4,56)};
    flight={start:time,duration:.65+distance(p,end)/45,from:{x:p.x,y:p.y},to:end,target:target.id,side:p.side,passer:p.id,attempted:new Set()};
    ball={x:p.x,y:p.y,z:2,owner:null,mode:'flight'};p.actionUntil=time+.35;lastPass=time;passCount++;
    totals[p.side].passes++;individuals[p.id].passes++;
    emit('pass',`${p.name} launches it toward ${target.name}.`,p,target,{popup:'PASS',fromX:p.x,fromY:p.y,toX:end.x,toY:end.y});
  }
  function tryHandoff(p){
    if(plans[p.side]!=='power'||p.role!=='thrower'||time-driveStart<.6||time-driveStart>3)return false;
    const runner=active(p.side).find(q=>upright(q)&&q.role==='runner'&&distance(q,p)<6);
    if(!runner)return false;
    if(rng.next()<clamp(.83+runner.stats.agility*.015,.86,.98)){
      takeBall(runner,'handoff',`${p.name} hands off. ${runner.name} follows the blockers.`);
    }else spill(runner);
    lastPass=time;
    return true;
  }
  function updateBall(){
    const owner=carrier();
    if(owner){
      const gained=Math.max(0,(owner.x-ball.x)*(owner.side==='A'?1:-1));totals[owner.side].yards+=gained;individuals[owner.id].yards+=gained;
      ball.x=owner.x;ball.y=owner.y;ball.z=2;
      if(owner.side==='A'&&owner.x>=94||owner.side==='B'&&owner.x<=6){score[owner.side]++;totals[owner.side].touchdowns++;individuals[owner.id].touchdowns++;scored=true;
        emit('touchdown',`${owner.name} breaks the line! ${teams[owner.side].name} score.`,owner,null,{popup:'TOUCHDOWN',dt:4});}
      return;
    }
    if(flight){
      const f=flight,u=clamp((time-f.start)/f.duration,0,1);ball.x=f.from.x+(f.to.x-f.from.x)*u;ball.y=f.from.y+(f.to.y-f.from.y)*u;ball.z=2+Math.sin(u*Math.PI)*12;
      for(const p of actors.filter(p=>upright(p)&&p.side!==f.side&&distance(p,ball)<3&&ball.z<6&&!f.attempted.has(p.id))){
        f.attempted.add(p.id);if(rng.next()<clamp(.22+p.stats.agility*.035,.2,.8)){totals[p.side].interceptions++;individuals[p.id].interceptions++;takeBall(p,'interception',`${p.name} cuts it out! The counterattack is on.`);return;}
      }
      if(u>=1){
        const closest=actors.filter(p=>upright(p)&&distance(p,ball)<5).sort((a,b)=>distance(a,ball)-distance(b,ball))[0];
        if(closest&&rng.next()<clamp(.52+closest.stats.agility*.035-nearEnemies(closest,4).length*.09,.25,.93)){
          const intercepted=closest.side!==f.side;
          if(intercepted){totals[closest.side].interceptions++;individuals[closest.id].interceptions++;}else{totals[closest.side].completions++;individuals[closest.id].catches++;}
          takeBall(closest,intercepted?'interception':'catch',intercepted?`${closest.name} steals the pass!`:`${closest.name} gathers it in stride.`);
        }else{flight=null;ball={...ball,mode:'loose',z:0,owner:null,vx:(rng.next()-.5)*12,vy:(rng.next()-.5)*12,freeAt:time+.3};emit('incomplete','The pass hits the turf. Still a live ball!',null,null,{popup:'LOOSE BALL'});}
      }return;
    }
    if(ball.mode==='loose'){
      ball.x=clamp(ball.x+ball.vx*STEP,3,97);ball.y=clamp(ball.y+ball.vy*STEP,3,57);ball.vx*=.84;ball.vy*=.84;ball.z=Math.abs(Math.sin(time*13))*Math.hypot(ball.vx,ball.vy)*.1;
      if(time<ball.freeAt)return;
      for(const p of actors.filter(p=>upright(p)&&p.pickupAt<=time&&distance(p,ball)<2.6).sort((a,b)=>distance(a,ball)-distance(b,ball))){
        p.pickupAt=time+.8;if(rng.next()<clamp(.42+p.stats.agility*.045,.25,.9)){totals[p.side].recoveries++;individuals[p.id].recoveries++;takeBall(p,'recovery',`${p.name} scoops it up${p.side!==possession?' and turns the game around':''}!`);break;}
      }
    }
  }
  function targetFor(p,owner){
    const dir=p.side==='A'?1:-1,plan=TACTICS[plans[p.side]];
    if(ball.mode==='loose'){
      const chase=active(p.side).filter(upright).sort((a,b)=>distance(a,ball)-distance(b,ball));if(chase.indexOf(p)<2)return ball;
      return {x:clamp(ball.x+dir*(p.role==='blocker'?4:12),8,92),y:clamp(30+p.lane,5,55)};
    }
    if(flight){if(p.id===flight.target)return flight.to;
      const chasers=active(p.side).filter(upright).sort((a,b)=>distance(a,flight.to)-distance(b,flight.to));
      if(p.side!==flight.side&&chasers.indexOf(p)<2)return flight.to;
      return{x:clamp(flight.to.x+dir*(p.side===flight.side?-8:9),8,92),y:clamp(30+p.lane,5,55)};}
    if(!owner)return p;
    if(p===owner){
      let best=null;for(const angle of [0,-.4,.4,-.8,.8,-1.1,1.1]){
        const x=clamp(p.x+dir*Math.cos(angle)*10,3,97),y=clamp(p.y+Math.sin(angle)*10,3,57);
        const openness=Math.min(16,...active(other(p.side)).filter(upright).map(q=>Math.hypot(q.x-x,q.y-y)));
        const score=(x-p.x)*dir*.8+openness*1.35-(y<7||y>53?4:0);if(!best||score>best.score)best={x,y,score};
      }return best;
    }
    if(p.side===owner.side){
      if(p.role==='runner'&&owner.role==='thrower'&&time-driveStart<3)return{x:owner.x+dir*3,y:owner.y+3};
      if(p.role==='blocker'){
        const threats=active(other(p.side)).filter(q=>upright(q)&&(q.x-owner.x)*dir>-3).sort((a,b)=>distance(a,owner)-distance(b,owner));
        const blockerIndex=active(p.side).filter(q=>upright(q)&&q.role==='blocker').indexOf(p);
        const threat=threats[blockerIndex%Math.max(1,threats.length)];
        if(threat&&distance(threat,owner)<24)return threat;
        return{x:clamp(owner.x+dir*6,4,96),y:clamp(owner.y+p.lane*.25,5,55)};
      }
      return{x:clamp(owner.x+dir*(p.role==='receiver'?17:-3),5,95),y:clamp(30+p.lane*plan.width/22,5,55)};
    }
    const defenders=active(p.side).filter(upright).sort((a,b)=>distance(a,owner)-distance(b,owner));
    if(defenders.indexOf(p)<(plans[p.side]==='counter'?4:2))return{x:clamp(owner.x-dir*Math.min(7,distance(p,owner)/8*2.5),3,97),y:owner.y};
    const receivers=active(owner.side).filter(q=>upright(q)&&q!==owner&&q.role!=='blocker').sort((a,b)=>a.lane-b.lane);
    const markers=active(p.side).filter(q=>upright(q)&&!defenders.slice(0,plans[p.side]==='counter'?4:2).includes(q)).sort((a,b)=>a.lane-b.lane);
    const receiver=receivers[markers.indexOf(p)%Math.max(1,receivers.length)];
    return receiver?{x:clamp(receiver.x-dir*4,4,96),y:receiver.y}:{x:owner.x-dir*10,y:clamp(owner.y+p.lane*.4,4,56)};
  }
  function step(){
    time+=STEP;driveClock=Math.max(0,DRIVE_SECONDS-(time-driveStart));
    for(const p of actors){p.stun=Math.max(0,p.stun-STEP);p.cooldown=Math.max(0,p.cooldown-STEP);p.speed=0;}
    let owner=carrier();if(owner&&!tryHandoff(owner))tryPass(owner);owner=carrier();
    const targets=new Map(actors.filter(upright).map(p=>[p.id,targetFor(p,owner)]));
    for(const p of actors.filter(upright))move(p,targets.get(p.id),p === owner ? .94 : 1);
    if(owner){
      for(const p of active(owner.side)){
        if(!upright(p)||p===owner||p.role!=='blocker'||p.cooldown>0)continue;
        const q=active(other(p.side)).filter(q=>upright(q)&&distance(p,q)<4.4).sort((a,b)=>distance(a,owner)-distance(b,owner))[0];
        if(!q)continue;p.cooldown=2.8;p.actionUntil=time+.4;
        if(rng.next()<clamp(.48+(strength(p)-strength(q))*.05,.15,.85))knock(p,q,'block');else p.stun=.4;
      }
      for(const p of active(other(owner.side))){if(!ball.owner)break;if(upright(p)&&p.cooldown<=0&&distance(p,owner)<4.4)tackle(p,owner);}
    }
    for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
      const a=actors[i],b=actors[j];if(!upright(a)||!upright(b))continue;const d=distance(a,b);
      if(d>0&&d<4.1){const push=(4.1-d)*.4,dx=(a.x-b.x)/d,dy=(a.y-b.y)/d;
        a.x=clamp(a.x+dx*push,3,97);a.y=clamp(a.y+dy*push,3,57);b.x=clamp(b.x-dx*push,3,97);b.y=clamp(b.y-dy*push,3,57);}
    }updateBall();
  }
  function setupDrive(offense){
    possession=offense;passCount=0;flight=null;scored=false;const prior=new Set(actors.map(p=>p.id));actors=[];
    for(const side of ['A','B']){
      const team=teams[side],players=pickLineup(team.players.filter(p=>!injured.has(p.id)),team.lineup||[]),plan=TACTICS[plans[side]],dir=side==='A'?1:-1;
      const thrower=[...players].sort((a,b)=>b.stats.passing-a.stats.passing)[0],rest=players.filter(p=>p!==thrower).sort((a,b)=>b.stats.strength-a.stats.strength);
      const runner=plans[side]==='power'?[...rest.slice(plan.blockers)].sort((a,b)=>(b.stats.speed+b.stats.strength*.5)-(a.stats.speed+a.stats.strength*.5))[0]:null;
      for(const [i,p]of players.entries()){
        const role=p===thrower?'thrower':rest.indexOf(p)<plan.blockers?'blocker':p===runner?'runner':'receiver',lane=[0,-18,18,-8,8][i];
        const forward=side===offense?(p===thrower?20:role==='runner'?24:role==='blocker'?31:30+(i%2)*5):48+(i%2)*9;
        actors.push({...p,side,x:side==='A'?forward:100-forward,y:side===offense&&role==='runner'?33:30+lane,role,lane,stun:0,cooldown:0,pickupAt:0,actionUntil:0,carrySince:time,facing:dir,speed:0,out:false});
        used[side].add(p.id);if(prior.size&&!prior.has(p.id))emit('substitution',`${p.name} joins the field.`,actors.at(-1));
      }
    }
    const holder=actors.find(p=>p.side===offense&&p.role==='thrower')||active(offense)[0];if(!holder)return false;
    takeBall(holder,null,'');emit('kickoff',`${teams[offense].name}: ${TACTICS[plans[offense]].name}. ${drive>6?'Overtime possession.':'The next possession begins.'}`,holder,null,{dt:2.2,popup:drive===1?'KICKOFF':null});
    snapshot();hold(drive===1?3:2);driveStart=time;lastPass=time-1;return true;
  }
  const fitA=pickLineup(teamA.players,teamA.lineup),fitB=pickLineup(teamB.players,teamB.lineup);
  if(!fitA.length||!fitB.length){if(fitA.length)score.A=3;else if(fitB.length)score.B=3;
    emit('whistle','The opposition cannot field a side. Match awarded by forfeit.');snapshot();hold(3);return finish();}
  const first=rng.next()<.5?'A':'B';let overtime=false;
  for(drive=1;drive<=DRIVES+2;drive++){
    if(drive>DRIVES&&!overtime)break;driveClock=DRIVE_SECONDS;
    if(setupDrive(drive%2?first:other(first))){
      for(let i=0;i<DRIVE_SECONDS/STEP&&!scored;i++){step();if(i%2===0||scored)snapshot();}
      if(!scored)emit('stop',`Time expires on the possession. ${teams[other(possession)].name} hold firm.`,null,null,{popup:'DEFENSIVE STOP',dt:2.4});
      snapshot();hold(scored?4:2.4);
    }
    if(drive===DRIVES)overtime=score.A===score.B;
  }
  drive=overtime?8:6;emit('whistle',`Full time. ${teamA.name} ${score.A}, ${teamB.name} ${score.B}.`,null,null,{popup:'FULL TIME',dt:3});snapshot();hold(3);return finish();
  function finish(){
    for(const s of Object.values(totals))s.yards=Math.round(s.yards);for(const s of Object.values(individuals))s.yards=Math.round(s.yards);
    const rating=p=>p.touchdowns*12+p.interceptions*7+p.tackles*2+p.blocks+p.yards*.05;
    const stars=Object.values(individuals).filter(p=>used[p.side].has(p.id)).sort((a,b)=>rating(b)-rating(a));
    return{engine:'spatial-v1',seed:seed>>>0,scoreA:score.A,scoreB:score.B,winner:score.A>score.B?'A':score.B>score.A?'B':'draw',duration:round(time),events,frames,casualties,
      playedA:[...used.A],playedB:[...used.B],stats:totals,playerStats:individuals,star:stars[0]||null,tactics:plans,
      highlights:events.filter(e=>['touchdown','interception'].includes(e.type)).map(e=>({start:Math.max(0,e.t-5),end:e.t+1,event:e}))};
  }
}
