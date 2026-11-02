import { TACTICS } from './match.js';
const lerp=(a,b,u)=>a+(b-a)*u;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const colors={A:'#ef7359',B:'#69cee0'};
const project=(x,y)=>({x:160+x*9.6+(y-30)*.55,y:214+y*6.5});

export function sampleFrame(res,t){
  const frames=res.frames;if(!frames?.length)return null;
  let lo=0,hi=frames.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(frames[mid].t<=t)lo=mid+1;else hi=mid;}
  const a=frames[Math.max(0,lo-1)],b=frames[Math.min(frames.length-1,lo)];
  const u=b.t>a.t&&a.drive===b.drive?clamp((t-a.t)/(b.t-a.t),0,1):0;
  return {...a,ball:{...a.ball,x:lerp(a.ball.x,b.ball.x,u),y:lerp(a.ball.y,b.ball.y,u),z:lerp(a.ball.z,b.ball.z,u)},
    players:a.players.map(p=>{const next=b.players.find(q=>q.id===p.id)||p;return{...p,x:lerp(p.x,next.x,u),y:lerp(p.y,next.y,u)};})};
}
function box(ctx,x,y,w,h,r=10){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function label(ctx,text,x,y,size=16,color='#fff',align='left',weight='600'){
  ctx.fillStyle=color;ctx.font=`${weight} ${size}px "Trebuchet MS", sans-serif`;ctx.textAlign=align;ctx.fillText(text,x,y);
}
function fitted(ctx,text,x,y,width,size=16,color='#fff',align='left'){
  ctx.font=`600 ${size}px "Trebuchet MS", sans-serif`;
  while(ctx.measureText(text).width>width&&size>10){size--;ctx.font=`600 ${size}px "Trebuchet MS", sans-serif`;}
  label(ctx,text,x,y,size,color,align);
}
function path(ctx,points,fill,stroke){
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}
}
function fieldRect(ctx,x,y,w,h,fill,stroke){path(ctx,[project(x,y),project(x+w,y),project(x+w,y+h),project(x,y+h)],fill,stroke);}

export function drawBroadcast(ctx,pb,assets,settings={}){
  const t=settings.time??pb.t,res=pb.res,f=sampleFrame(res,t);if(!f)return;
  const W=1280,H=720;
  ctx.clearRect(0,0,W,H);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const backdrop=ctx.createLinearGradient(0,0,0,H);backdrop.addColorStop(0,'#102b2c');backdrop.addColorStop(1,'#091b19');ctx.fillStyle=backdrop;ctx.fillRect(0,0,W,H);
  const recent=res.events.filter(e=>e.t<=t&&t-e.t<4.2);
  const priority={touchdown:10,interception:9,casualty:8,tackle:7,fumble:6,recovery:5,dodge:4,catch:3,pass:2,kickoff:1,stop:8,whistle:10};
  const featured=[...recent].sort((a,b)=>(priority[b.type]||0)-(priority[a.type]||0)||b.t-a.t)[0];
  const latest=[...res.events].reverse().find(e=>e.t<=t);
  const event=latest;
  const ballPoint=project(f.ball.x,f.ball.y);
  const zoom=settings.replay?1.19:1.07;
  const focusX=640+(ballPoint.x-640)*(settings.replay ? .42 : .22);
  const focusY=408+(ballPoint.y-408)*.08;
  const impact=recent.find(e=>e.impact&&t-e.t<.28);
  const shake=impact&&!settings.reducedMotion?Math.sin((t-impact.t)*80)*3*(1-(t-impact.t)/.28):0;
  ctx.save();ctx.translate(640+shake,408);ctx.scale(zoom,zoom);ctx.translate(-focusX,-focusY);
  // A painted crowd sits behind a pitch whose geometry is the simulation's geometry.
  if(assets.images.pitch?.ok){ctx.globalAlpha=.72;ctx.drawImage(assets.images.pitch.img,30,25,740,175,77,112,1126,110);ctx.globalAlpha=1;}
  ctx.fillStyle='#18372f';ctx.fillRect(60,210,1160,22);
  for(let i=0;i<26;i++){
    const wave=Math.sin(t*4+i*.9)>0?3:0;
    ctx.fillStyle=i%2?colors.A:colors.B;ctx.globalAlpha=.55;ctx.fillRect(80+i*44,178-wave,13,18);ctx.globalAlpha=1;
  }
  fieldRect(ctx,-3,-3,106,66,'#897c56');fieldRect(ctx,-1,-1,102,62,'#d9dbc0');
  for(let i=0;i<10;i++)fieldRect(ctx,i*10,0,10,60,i%2?'#3c6848':'#355f40');
  fieldRect(ctx,0,0,6,60,'#773d37');fieldRect(ctx,94,0,6,60,'#285b68');
  ctx.lineWidth=1.2;
  for(let i=1;i<10;i++){
    const a=project(i*10,0),b=project(i*10,60);ctx.strokeStyle='rgba(238,240,211,.38)';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    if(i%2===0){const n=project(i*10,5);label(ctx,String(i<=5?i*10:(10-i)*10),n.x,n.y,13,'#b9cbb0','center');}
  }
  fieldRect(ctx,0,0,100,60,null,'#e8e5c5');
  const center=project(50,30);ctx.save();ctx.translate(center.x,center.y);ctx.scale(1,.65);ctx.strokeStyle='#c5d0af55';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,72,0,Math.PI*2);ctx.stroke();label(ctx,'FANG',0,-2,35,'#c7d1b344','center','900');label(ctx,'LEAGUE',0,25,18,'#c7d1b344','center','800');ctx.restore();
  for(const [side,x]of [['A',3],['B',97]]){const p=project(x,30);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-Math.PI/2);fitted(ctx,pb.teams[side].short.toUpperCase(),0,5,270,21,'#e4ddc887','center');ctx.restore();}
  // Ground rings and a short carrier trail stay under the sprites.
  const owner=f.players.find(p=>p.id===f.ball.owner);
  if(owner&&owner.pose==='run'){
    ctx.strokeStyle='#ffe68b60';ctx.lineWidth=4;ctx.setLineDash([5,8]);ctx.beginPath();const p=project(owner.x-(owner.side==='A'?5:-5),owner.y);ctx.moveTo(p.x,p.y);ctx.lineTo(ballPoint.x,ballPoint.y);ctx.stroke();ctx.setLineDash([]);
  }
  for(const p of [...f.players].sort((a,b)=>a.y-b.y)){
    const world=project(p.x,p.y),info=pb.roster[p.id];if(!info)continue;
    const size=.61+p.y/400;const isCarrier=p.id===f.ball.owner;
    ctx.globalAlpha=p.out?.4:1;
    ctx.fillStyle='#06151066';ctx.beginPath();ctx.ellipse(world.x+3,world.y+2,19*size,7*size,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=isCarrier?'#ffe885':colors[p.side];ctx.lineWidth=isCarrier?3:2;ctx.beginPath();ctx.ellipse(world.x,world.y,20*size,8*size,0,0,Math.PI*2);ctx.stroke();
    ctx.save();ctx.translate(world.x,world.y);
    const bounce=p.pose==='run'&&!settings.reducedMotion?Math.sin(t*18+p.number)*2:0;
    ctx.translate(0,bounce);ctx.scale(size,size);
    if(p.pose==='run'&&!settings.reducedMotion)ctx.rotate(Math.sin(t*18+p.number)*.025);
    const strideFrame = settings.reducedMotion ? 0 : Math.floor(t * 7 + p.number * .7) % 2;
    assets.drawPlayer(ctx,info.player,0,0,p.facing,p.pose,strideFrame);ctx.restore();ctx.globalAlpha=1;
    if(!p.out){ctx.fillStyle=p.side==='A'?'#633329':'#204c59';box(ctx,world.x-8,world.y+7,16,15,4);label(ctx,String(p.number),world.x,world.y+18,10,'#fff','center');}
    if(isCarrier||event?.actorId===p.id&&t-event.t<1.5){
      ctx.fillStyle='#0a1c20d9';ctx.font='700 12px Trebuchet MS';const width=ctx.measureText(info.player.name).width+18;
      box(ctx,world.x-width/2,world.y-96*size-21,width,21,5);label(ctx,info.player.name,world.x,world.y-96*size-6,12,isCarrier?'#ffdf74':'#fff','center');
    }
  }
  // Each impact comes from a recorded contact, never from a prewritten outcome.
  for(const e of recent.filter(e=>e.impact&&t-e.t<.65)){
    const age=t-e.t,p=project(e.x,e.y);ctx.save();ctx.globalAlpha=1-age/.65;ctx.translate(p.x,p.y-24);
    ctx.strokeStyle='#ffe7a2';ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<12;i++){const a=i*Math.PI/6,r=(i%2?15:30)*(1+age);const x=Math.cos(a)*r,y=Math.sin(a)*r*.65;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();
    ctx.fillStyle='#d1bd8a55';ctx.beginPath();ctx.ellipse(0,30,25+age*35,9+age*8,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  const bx=ballPoint.x+(owner?owner.facing*15:0),by=ballPoint.y-(owner?38:f.ball.z*3+12);
  if(f.ball.mode==='flight'){
    ctx.fillStyle='#071c1855';ctx.beginPath();ctx.ellipse(ballPoint.x,ballPoint.y,13,5,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ffe49b99';ctx.setLineDash([4,5]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(ballPoint.x,ballPoint.y);ctx.lineTo(bx,by);ctx.stroke();ctx.setLineDash([]);
  }
  const halo=ctx.createRadialGradient(bx,by,2,bx,by,25);halo.addColorStop(0,'#fff0a488');halo.addColorStop(1,'#fff0a400');ctx.fillStyle=halo;ctx.fillRect(bx-25,by-25,50,50);
  ctx.save();ctx.translate(bx,by);ctx.scale(.76,.76);if(f.ball.mode==='flight')ctx.rotate(t*8);assets.drawBall(ctx,0,0);ctx.restore();
  if(f.ball.mode==='loose'){label(ctx,'LOOSE BALL',ballPoint.x,ballPoint.y-32,12,'#ffe286','center','800');}
  ctx.restore();
  // Broadcast graphics remain fixed while the field camera follows the action.
  ctx.fillStyle='#06191eed';box(ctx,28,18,1224,104,12);
  ctx.fillStyle=colors.A;box(ctx,28,18,6,104,3);ctx.fillStyle=colors.B;box(ctx,1246,18,6,104,3);
  label(ctx,'FANG LEAGUE',49,47,17,'#f5dda6','left','900');label(ctx,settings.replay?'INSTANT REPLAY':'MATCHDAY LIVE',49,69,11,settings.replay?'#ffd36c':'#8ed7c2');
  label(ctx,pb.meta.kind==='exhibition'?'EXHIBITION':pb.meta.label.toUpperCase(),49,92,11,'#9db7b5');
  fitted(ctx,pb.teams.A.name,565,54,300,25,'#fff','right');fitted(ctx,pb.teams.B.name,715,54,300,25,'#fff','left');
  label(ctx,TACTICS[res.tactics.A].short,565,77,11,colors.A,'right');label(ctx,TACTICS[res.tactics.B].short,715,77,11,colors.B);
  label(ctx,`${f.scoreA} : ${f.scoreB}`,640,64,40,'#fff8e4','center','900');
  const seconds=Math.ceil(f.remaining);label(ctx,`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,1179,57,28,'#ffdd82','center','800');
  label(ctx,f.drive>6?`OVERTIME ${f.drive-6}/2`:`POSSESSION ${f.drive}/6`,1179,80,10,'#bfd3cc','center');
  label(ctx,`${f.possession==='B'?'◀ ':''}${pb.teams[f.possession].short.toUpperCase()} BALL${f.possession==='A'?' ▶':''}`,640,103,11,colors[f.possession],'center');
  ctx.fillStyle='#082327';box(ctx,28,640,1224,62,10);
  const headline=event?.popup||({interception:'INTERCEPTION',catch:'COMPLETE',recovery:event?.turnover?'TURNOVER':'RECOVERED',kickoff:'PLAY CALL',whistle:'FULL TIME'}[event?.type])||'ON THE FIELD';
  const accent=['touchdown','interception'].includes(event?.type)?'#ffdb78':event?.impact?'#fb9b78':'#9cd5c3';
  label(ctx,headline,48,664,12,accent,'left','900');fitted(ctx,event?.text||'The teams take the field.',48,688,1170,17,'#f4f6e7');
  if(featured&&['touchdown','interception','casualty','stop','whistle'].includes(featured.type)&&t-featured.t<2.5){
    const title={touchdown:'TOUCHDOWN',interception:'PICKED OFF',casualty:'BIG HIT · PLAYER DOWN',stop:'DEFENSIVE STOP',whistle:'FULL TIME'}[featured.type];
    const age=t-featured.t,fade=Math.min(1,age*8,Math.max(0,(2.5-age)*3));ctx.save();ctx.globalAlpha=fade;
    ctx.fillStyle='#091c24e8';box(ctx,355,141,570,88,10);label(ctx,title,640,185,featured.type==='casualty'?28:38,accent,'center','900');
    label(ctx,featured.actorId?pb.roster[featured.actorId]?.player.name||'':featured.type==='whistle'?`${pb.teams.A.short} ${f.scoreA} : ${f.scoreB} ${pb.teams.B.short}`:'THE LINE HOLDS',640,209,15,'#d7e8dd','center');
    if(featured.actorId&&pb.roster[featured.actorId]){ctx.save();ctx.translate(253,138);assets.drawPortrait(ctx,92,112,pb.roster[featured.actorId].player,featured.type==='touchdown'?'happy':'angry');ctx.restore();}
    if(featured.type==='casualty'&&pb.roster[featured.targetId]){ctx.save();ctx.translate(935,138);assets.drawPortrait(ctx,92,112,pb.roster[featured.targetId].player,'hurt');ctx.restore();}
    if(featured.type==='touchdown'&&!settings.reducedMotion){for(let i=0;i<45;i++){const x=(i*97+res.seed%211)%1280,y=135+((i*37+age*80)%470);ctx.fillStyle=i%2?'#f6d76a':colors[featured.team];ctx.fillRect(x,y,5,8);}}
    ctx.restore();
  }
  if(settings.replay){ctx.fillStyle='#e6bd58';box(ctx,1045,137,188,32,5);label(ctx,'↶ REPLAY · SLOW MOTION',1139,158,11,'#1b2b2a','center','900');}
  if(settings.paused){ctx.fillStyle='#06161aa8';ctx.fillRect(0,122,1280,518);label(ctx,'PAUSED',640,374,42,'#fff9e8','center','900');}
}
