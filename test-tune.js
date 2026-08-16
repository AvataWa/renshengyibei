// 难度标定：模拟不同反应速度的玩家，扫描难度参数
const Game = require('./src/game.js');
function mockCtx(){const n=()=>{};return new Proxy({},{get(t,k){if(k==='measureText')return()=>({width:50});if(k==='createLinearGradient')return()=>({addColorStop:n});return n;},set(){return true;}});}

function playOnce(reaction, aimMargin, tuning, maxCups){
  let sc,ec;
  const env={canvas:{getContext:()=>mockCtx()},ctx:mockCtx(),W:375,H:667,
    onTouchStart:c=>sc=c,onTouchEnd:c=>ec=c,getStorage:()=>'',setStorage:()=>{},vibrate:()=>{},share:()=>{},
    tuning};
  const g=new Game(env);
  const step=s=>{const dt=1/60;for(let t=0;t<s;t+=dt)g.update(dt);};
  sc(5,5);
  let cups=0;
  for(let i=0;i<maxCups;i++){
    let guard=0; while(g.phase!=='aim'&&guard++<2000) step(1/60);
    if(g.state==='over') break;
    sc(5,5);
    const target=g.cup.zones.p[0]+aimMargin;
    let reactLeft=-1, released=false, g2=0;
    while(g2++<2000){
      step(1/60);
      if(!released){
        if(reactLeft<0 && g.level>=target) reactLeft=Math.round(reaction*60);
        if(reactLeft>0){ reactLeft--; if(reactLeft<=0){ ec(); released=true; } }
      }
      if(g.phase!=='press') break;
    }
    step(1.6);
    if(g.state==='over') break;
    cups++;
  }
  return {score: g.score, cups};
}

function evalTuning(tuning){
  const out = {};
  for(const [label, r, m] of [['expert(0.10s)',0.10,0.02],['normal(0.20s)',0.20,0.0],['slow(0.30s)',0.30,-0.03]]){
    const scores=[]; const cupsArr=[];
    for(let i=0;i<30;i++){ const r0=playOnce(r,m,tuning,120); scores.push(r0.score); cupsArr.push(r0.cups); }
    scores.sort((a,b)=>a-b); cupsArr.sort((a,b)=>a-b);
    out[label]={avgScore:(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1), medCups:cupsArr[15]};
  }
  return out;
}

const candidates = [
  {POUR_RATE: 0.30, RATE_ACCEL: 0.9, TILT_SPEED: 0.45},
  {POUR_RATE: 0.32, RATE_ACCEL: 0.9, TILT_SPEED: 0.45},
  {POUR_RATE: 0.34, RATE_ACCEL: 1.0, TILT_SPEED: 0.5},
  {POUR_RATE: 0.30, RATE_ACCEL: 0.8, TILT_SPEED: 0.4},
];
for(const c of candidates){
  console.log(JSON.stringify(c));
  const r = evalTuning(c);
  for(const k in r) console.log('   ', k, JSON.stringify(r[k]));
}
