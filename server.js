const express=require("express"),http=require("http"),WebSocket=require("ws");
const app=express(),server=http.createServer(app),wss=new WebSocket.Server({server});
app.use(express.static("public"));
const rooms=new Map(), colors=["#5aa9ff","#ff6262","#61d36d","#d7a83d"];
const spots=[[150,150],[1050,150],[1050,570],[150,570]];
const unitDefs={
 iron_knight:{cost:90,wood:0,iron:3,hp:180,atk:18,speed:1.7,range:28},
 steel_cavalry:{cost:120,wood:0,iron:4,hp:150,atk:22,speed:3.0,range:30},
 ranger_knight:{cost:100,wood:1,iron:2,hp:90,atk:25,speed:1.9,range:150},
 siege_tank:{cost:180,iron:6,oil:3,hp:420,atk:38,speed:.8,range:180},
 shock_guard:{cost:130,iron:4,energy:1,hp:220,atk:28,speed:1.6,range:32},
 bulwark:{cost:150,iron:3,energy:3,hp:360,atk:10,speed:.7,range:25},
 dragon_mech:{cost:500,iron:10,oil:8,energy:8,hp:900,atk:85,speed:1.1,range:220},
 field_engineer:{cost:80,iron:2,hp:120,atk:8,speed:1.5,range:45,builder:true}
};
const religions={machinery:"Machinery",war:"Warrior",armor:"Armor",peace:"Peace",nature:"Nature",resources:"Resources",knowledge:"Knowledge",exploration:"Exploration",royalty:"Royalty",community:"Community",craft:"Craftsmanship",duty:"Duty",ancestors:"Ancestors",harvest:"Harvest",sea:"Sea",sun:"Sun",moon:"Moon",forge:"Forge",fortress:"Fortress",freedom:"Freedom",unity:"Unity",prosperity:"Prosperity",reconciliation:"Reconciliation",strategy:"Strategy",land:"Land",energy:"Energy"};
const sects={
 iron_shield:{name:"Order of the Iron Shield",religions:["armor","duty"],bonus:"defense"},
 forge_brotherhood:{name:"Forge Brotherhood",religions:["machinery","craft","forge"],bonus:"engineering"},
 skyward_order:{name:"Skyward Order",religions:["exploration","knowledge"],bonus:"scouting"},
 wild_wardens:{name:"Wardens of the Wild",religions:["nature","land"],bonus:"terrain"},
 crown_keepers:{name:"Keepers of the Crown",religions:["royalty","tradition"],bonus:"command"},
 banner_sons:{name:"Sons of the Banner",religions:["war","duty"],bonus:"morale"},
 peace_guardians:{name:"Guardians of Peace",religions:["peace","unity"],bonus:"diplomacy"},
 deepstone:{name:"Deepstone Legion",religions:["resources","fortress"],bonus:"resource"}
};
const formations={line:{atk:1,def:1,speed:1},shield_wall:{atk:.85,def:1.35,speed:.75},wedge:{atk:1.25,def:.9,speed:1.05},skirmish:{atk:1.1,def:.85,speed:1.18},square:{atk:.9,def:1.45,speed:.65}};
function room(){
  const homes=[];
  const spots=[[360,170],[510,170],[690,170],[840,170],[360,540],[510,540],[690,540],[840,540],[250,350],[950,350]];
  spots.forEach((s,i)=>homes.push({id:String(i+1),x:s[0],y:s[1],searched:false,hideout:Math.random()<0.55,owner:null,security:0}));
  return {players:{},units:{},spies:{},officials:[],next:1,spyNext:1,routeNext:1,orderNext:1,campNext:1,officialNext:1,baseNext:1,prisonNext:1,rebels:[],supplyRoutes:[],attackOrders:[],territories:[{x:600,y:360,owner:null,name:"Central Citadel"},{x:600,y:120,owner:null,name:"North Mine"},{x:600,y:600,owner:null,name:"South Oilfield"},{x:300,y:360,owner:null,name:"Western Farmland"},{x:900,y:360,owner:null,name:"Eastern Power"}]}
}
function id(){return Math.random().toString(36).slice(2,7).toUpperCase()}
function send(w,m){if(w.readyState===1)w.send(JSON.stringify(m))}
function broadcast(r,m){Object.values(r.players).forEach(p=>send(p.ws,m))}
function night(){return Math.floor(Date.now()/1000)%120>=60}
function snap(r){return {type:"state",night:night(),timeLeft:60-(Math.floor(Date.now()/1000)%60),players:Object.values(r.players).map(p=>({id:p.id,name:p.name,color:p.color,x:p.x,y:p.y,hp:p.hp,score:p.score,res:p.res,buildings:p.buildings,bases:p.bases,culture:p.culture,doctrines:p.doctrines,trust:p.trust,riot:p.riot,religion:p.religion,sect:p.sect,formation:p.formation,discipline:p.discipline,oversight:p.oversight,secretService:!!p.secretService,cosmetics:p.cosmetics})),units:Object.values(r.units),territories:r.territories,homes:r.homes,spies:Object.values(r.spies).map(s=>({...s,owner:s.owner===null?null:s.owner})),supplyRoutes:r.supplyRoutes,attackOrders:r.attackOrders.map(o=>({...o})),camps:r.camps||[],prisoners:r.prisoners||[],officials:r.officials||[],rebels:r.rebels||[],religions,sects,formations}}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function join(ws,r,pid,name,n){let [x,y]=spots[n];r.players[pid]={id:pid,name:name.slice(0,16),color:colors[n],x,y,hp:1000,score:0,res:{gold:300,iron:100,oil:40,energy:20,food:100},buildings:[],culture:{honor:0,mercy:0,innovation:0,tradition:0,expansion:0},doctrines:[],religion:"duty",sect:"iron_shield",formation:"line",discipline:86,oversight:80,cosmetics:{rankStyle:"standard",jobStyle:"line",palette:n===0?"azure":n===1?"crimson":n===2?"emerald":"gold"},trust:78,riot:0,ws,bases:[
    {id:"base"+(n+1)+"a",name:"Home Base",x,y,hp:1200,level:1,officerChecked:0},
    {id:"base"+(n+1)+"b",name:"Forward Base",x:x+(n%2? -120:120),y:y+(n<2?120:-120),hp:850,level:1,officerChecked:0}
  ]};
  r.officials.push({id:"o"+(r.officialNext++),owner:pid,name:"Captain",rank:1,armor:120,x:x,y:y,status:"at_base",baseId:r.players[pid].bases[0].id,capturedBy:null,intel:[]});
  r.officials.push({id:"o"+(r.officialNext++),owner:pid,name:"Marshal",rank:3,armor:260,x:r.players[pid].bases[1].x,y:r.players[pid].bases[1].y,status:"at_base",baseId:r.players[pid].bases[1].id,capturedBy:null,intel:[]});
}
wss.on("connection",ws=>{
 let rid,pid;
 ws.on("message",raw=>{let m;try{m=JSON.parse(raw)}catch{return}
  if(m.type==="create"){rid=id();rooms.set(rid,room());pid=Math.random().toString(36).slice(2);join(ws,rooms.get(rid),pid,m.name||"Player",0);send(ws,{type:"room",rid,pid});return}
  if(m.type==="join"){rid=m.rid?.toUpperCase();let r=rooms.get(rid);if(!r||Object.keys(r.players).length>=4)return send(ws,{type:"error",message:"Room full or not found"});pid=Math.random().toString(36).slice(2);join(ws,r,pid,m.name||"Player",Object.keys(r.players).length);send(ws,{type:"room",rid,pid});return}
  let r=rooms.get(rid),p=r?.players[pid];if(!p)return;
  if(m.type==="breakCamp"){const u=r.units[m.unit];const c=r.camps?.find(c=>c.id===u?.campId&&c.owner===pid);if(u&&c){c.units=c.units.filter(id=>id!==u.id);u.campId=null;r.camps=r.camps.filter(x=>x.units.length||x.id!==c.id)}}
  if(m.type==="camp"){
    const u=r.units[m.unit];
    if(u&&u.owner===pid&&!u.garrisonedIn&&p.res.gold>=15&&p.res.food>=10){
      const nearExisting=Object.values(r.units).some(v=>v.owner===pid&&v.campId&&Math.hypot(v.x-u.x,v.y-u.y)<55);
      if(!nearExisting){p.res.gold-=15;p.res.food-=10;const camp={id:"c"+r.campNext++,x:u.x,y:u.y,owner:pid,hp:300,defense:70,units:[]};r.camps=r.camps||[];r.camps.push(camp);u.campId=camp.id;camp.units.push(u.id);}
    }
  }
  if(m.type==="move"){p.x=Math.max(30,Math.min(1170,+m.x));p.y=Math.max(50,Math.min(670,+m.y))}
  if(m.type==="inspectBase"){
    const b=p.bases.find(b=>b.id===m.base); const o=r.officials.find(o=>o.id===m.official);
    if(b&&o&&o.owner===pid&&o.baseId===b.id&&Math.hypot(o.x-b.x,o.y-b.y)<70){b.officerChecked=Date.now();o.status="inspecting";p.trust=Math.min(100,p.trust+2);p.score+=8;}
  }
  if(m.type==="sendOfficer"){
    const o=r.officials.find(o=>o.id===m.official), b=p.bases.find(b=>b.id===m.base);
    if(o&&b&&o.owner===pid&&o.status!=="captured"){o.baseId=b.id;o.x=b.x;o.y=b.y;o.status="traveling";}
  }
  if(m.type==="ransomOfficial"){
    const o=r.officials.find(o=>o.id===m.official);
    if(o&&o.capturedBy===pid&&o.owner!==pid&&p.res.gold>=100){p.res.gold-=100;p.score+=30;o.ransomed=true;o.status="ransomed";o.capturedBy=null;o.x=0;o.y=0;}
  }
  if(m.type==="interrogateOfficial"){
    const o=r.officials.find(o=>o.id===m.official); const prison=p.buildings.find(b=>b.kind==="prison"&&Math.hypot(b.x-p.x,b.y-p.y)<220);
    if(o&&o.capturedBy===pid&&prison&&p.res.gold>=40){p.res.gold-=40;o.interrogations=(o.interrogations||0)+1;const intel=["supply routes","base defenses","resource priorities","officer schedules"][Math.floor(Math.random()*4)];o.intel=o.intel||[];o.intel.push({text:`Intel revealed: ${intel}.`,at:Date.now()});p.score+=15;}
  }
  if(m.type==="propaganda"){
    const o=r.officials.find(o=>o.id===m.official), target=r.players[m.target];
    if(o&&o.owner===pid&&target&&target.id!==pid&&o.status!=="captured"&&p.res.gold>=50){p.res.gold-=50;o.status="propaganda";o.missionUntil=Date.now()+45000;target.trust=Math.max(0,target.trust-4);p.trust=Math.min(100,p.trust+2);p.score+=12;}
  }
  if(m.type==="culture"){
    const costs={honor:120,mercy:120,innovation:160,tradition:100,expansion:150};
    const cost=costs[m.belief];
    if(cost && p.res.gold>=cost && !p.doctrines.includes(m.belief)){
      p.res.gold-=cost;
      p.culture[m.belief]=(p.culture[m.belief]||0)+1;
      p.doctrines.push(m.belief);
      p.score+=20;
    }
  }
  if(m.type==="buildDefense"){
    const u=r.units[m.unit];
    const defs={
      sandbags:{cost:20,hp:180,radius:28,garrison:0},
      barricade:{cost:35,hp:260,radius:30,garrison:0},
      field_emplacement:{cost:70,hp:380,radius:32,garrison:2}
    };
    const d=defs[m.kind], bx=Number(m.x), by=Number(m.y);
    if(u&&u.owner===pid&&unitDefs[u.kind]?.builder&&d&&Number.isFinite(bx)&&Number.isFinite(by)&&p.res.gold>=d.cost&&Math.hypot(u.x-bx,u.y-by)<95){
      const occupied=p.buildings.some(b=>Math.hypot(b.x-bx,b.y-by)<35);
      if(!occupied){
        p.res.gold-=d.cost;
        p.buildings.push({id:"b"+Math.random().toString(36).slice(2,8),kind:m.kind,x:Math.max(30,Math.min(1170,bx)),y:Math.max(50,Math.min(670,by)),hp:d.hp,garrison:[],maxGarrison:d.garrison,builtBy:u.id});
        u.x=bx;u.y=by;
      }
    }
  }
  if(m.type==="build"){
    const defs={
      house:{cost:40,hp:220,radius:32,garrison:3},
      barracks:{cost:110,hp:400,radius:34,garrison:6},
      wall:{cost:50,hp:300,radius:26,garrison:0},
      tower:{cost:90,hp:280,radius:25,garrison:4},
      fort:{cost:180,hp:600,radius:42,garrison:8},
      castle:{cost:300,hp:900,radius:52,garrison:12},
      base:{cost:260,hp:1200,radius:55,garrison:10},
      bunker:{cost:220,hp:700,radius:38,garrison:8},
      prison:{cost:160,hp:500,radius:40,garrison:4},
      trench:{cost:80,hp:360,radius:55,garrison:2},
      moat:{cost:130,hp:500,radius:70,garrison:0},
      safehouse:{cost:140,hp:300,radius:34,garrison:2},
      security_office:{cost:180,hp:450,radius:38,garrison:4}
    };
    const d=defs[m.kind]; const bx=Number(m.x), by=Number(m.y);
    if(d&&Number.isFinite(bx)&&Number.isFinite(by)&&p.res.gold>=d.cost){
      const nearBase=Math.hypot(p.x-bx,p.y-by)<220;
      const nearOwnedTerritory=r.territories.some(t=>t.owner===pid&&Math.hypot(t.x-bx,t.y-by)<95);
      const occupied=r.players[pid].buildings.some(b=>Math.hypot(b.x-bx,b.y-by)<45);
      if((nearBase||nearOwnedTerritory)&&!occupied){
        p.res.gold-=d.cost;
        const nb={id:"b"+Math.random().toString(36).slice(2,8),kind:m.kind,x:Math.max(30,Math.min(1170,bx)),y:Math.max(50,Math.min(670,by)),hp:d.hp,garrison:[],maxGarrison:d.garrison};p.buildings.push(nb);if(m.kind==="base"){p.bases.push({id:"base"+(r.baseNext++),name:"New Base",x:nb.x,y:nb.y,hp:d.hp,level:1,officerChecked:0});}
      }
    }
  }
  if(m.type==="garrison"){
    const u=r.units[m.unit], b=p.buildings.find(b=>b.id===m.building);
    if(u&&b&&u.owner===pid&&b.maxGarrison>0&&Math.hypot(u.x-b.x,u.y-b.y)<45&&!b.garrison.includes(u.id)&&b.garrison.length<b.maxGarrison){
      b.garrison.push(u.id);u.garrisonedIn=b.id;u.x=b.x;u.y=b.y;
    }
  }
  if(m.type==="ungarrison"){
    const b=p.buildings.find(b=>b.id===m.building);
    if(b){for(const uid of b.garrison){const u=r.units[uid];if(u){u.garrisonedIn=null;u.x=b.x+40;u.y=b.y+40;}}b.garrison=[];}
  }
  if(m.type==="spy"){
    if(p.res.gold>=100 && p.res.food>=5){p.res.gold-=100;p.res.food-=5;const s={id:String(r.spyNext++),owner:pid,x:p.x+20,y:p.y+20,status:"ready",home:null,hidden:true};r.spies[s.id]=s;p.score+=10}
  }
  if(m.type==="spyMove"){const s=r.spies[m.spy];if(s&&s.owner===pid){s.x=Math.max(30,Math.min(1170,+m.x));s.y=Math.max(50,Math.min(670,+m.y));s.status="moving"}}
  if(m.type==="hide"){const s=r.spies[m.spy],h=r.homes.find(h=>h.id===m.home);if(s&&s.owner===pid&&h&&dist(s,h)<75&&!h.searched){s.x=h.x;s.y=h.y;s.home=h.id;s.hidden=true;s.status="sleeper";h.security=Math.max(0,h.security-1)}}
  if(m.type==="clearHouse"){const h=r.homes.find(h=>h.id===m.home);if(h&&dist(p,h)<95){h.searched=true;h.security=Math.min(3,h.security+1);if(h.hideout){h.hideout=false;p.score+=50;p.res.gold=Math.min(9999,p.res.gold+75)}for(const s of Object.values(r.spies)){if(s.home===h.id){delete r.spies[s.id]}}}}
  if(m.type==="train"){let d=unitDefs[m.kind];if(!d)return;
  let finalCost=d.cost;
  if(p.doctrines.includes("honor") && ["iron_knight","steel_cavalry","shock_guard"].includes(m.kind)) finalCost=Math.round(finalCost*.9);
  if(p.doctrines.includes("innovation") && ["siege_tank","dragon_mech"].includes(m.kind)) finalCost=Math.round(finalCost*.88);
  let ok=p.res.gold>=finalCost&&p.res.iron>=(d.iron||0)&&p.res.oil>=(d.oil||0)&&p.res.energy>=(d.energy||0)&&p.res.food>=10;if(ok){p.res.gold-=finalCost;p.res.iron-=(d.iron||0);p.res.oil-=(d.oil||0);p.res.energy-=(d.energy||0);p.res.food-=10;let job=m.kind==="field_engineer"?"engineer":m.kind.includes("ranger")?"scout":"soldier";let u={id:String(r.next++),owner:pid,x:p.x+30,y:p.y+30,hp:d.hp,kind:m.kind,tx:p.x,ty:p.y,target:null,rank:"recruit",job,uniform:p.cosmetics,formation:p.formation,disguised:false};r.units[u.id]=u}}
  if(m.type==="target"){let u=r.units[m.unit],t=r.players[m.target];if(u&&u.owner===pid&&t)u.target=m.target}
  if(m.type==="capture"){let t=r.territories[m.i];if(t&&dist(p,t)<80){t.owner=pid;p.trust=Math.min(100,p.trust+2)}}
  if(m.type==="supplyRoute"){
    const t=r.territories[m.i];
    if(t&&t.owner===pid&&dist(p,t)<120&&p.res.food>=15&&p.res.gold>=40){
      p.res.food-=15;p.res.gold-=40;
      r.supplyRoutes.push({id:String(r.routeNext++),owner:pid,territory:m.i,active:true,supplies:0});
      p.trust=Math.min(100,p.trust+1);
    }
  }
  if(m.type==="cancelRoute"){const q=r.supplyRoutes.find(q=>q.id===m.id);if(q&&q.owner===pid){q.active=false}}
  if(m.type==="interrogatePrisoner"){
    const q=r.prisoners.find(q=>q.id===m.id);
    const prison=p.buildings.find(b=>b.kind==="prison"&&Math.hypot(b.x-p.x,b.y-p.y)<220);
    if(q&&q.owner===pid&&prison&&p.res.gold>=25){
      p.res.gold-=25; q.interrogations=(q.interrogations||0)+1;
      const types=["supply_route","defense_weakness","territory_resource","army_movement"];
      const kind=types[Math.floor(Math.random()*types.length)]; const target=r.players[q.captiveOwner];
      const names={supply_route:"Supply route",defense_weakness:"Defense weakness",territory_resource:"Resource territory",army_movement:"Army movement"};
      const text=target ? `${names[kind]} intel recovered about ${target.name}.` : `${names[kind]} intel recovered.`;
      q.intel=q.intel||[]; q.intel.push({type:kind,text,expiresAt:Date.now()+120000}); p.score+=10;
    }
  }
  if(m.type==="releasePrisoner"){const q=r.prisoners.find(q=>q.id===m.id);if(q&&q.owner===pid){r.prisoners=r.prisoners.filter(x=>x.id!==m.id);p.score+=15}}
  if(m.type==="rescuePOW"){
    const q=r.prisoners.find(q=>q.id===m.id); const source=r.players[q?.captiveOwner];
    if(q&&q.captiveOwner===pid&&p.res.gold>=60&&source){
      const nearby=Object.values(r.units).some(u=>u.owner===pid&&Math.hypot(u.x-(source.x||0),u.y-(source.y||0))<260);
      if(nearby){p.res.gold-=60;r.prisoners=r.prisoners.filter(x=>x.id!==q.id);p.score+=35;p.trust=Math.min(100,p.trust+1);}
    }
  }
  if(m.type==="setReligion" && religions[m.religion]){p.religion=m.religion;p.score+=5;}
  if(m.type==="setSect" && sects[m.sect]){p.sect=m.sect;p.score+=8;}
  if(m.type==="setFormation" && formations[m.formation]){p.formation=m.formation;for(const u of Object.values(r.units))if(u.owner===pid&&!u.garrisonedIn)u.formation=m.formation;}
  if(m.type==="promote"){
    const u=r.units[m.unit]; if(u&&u.owner===pid){const ranks=["recruit","veteran","sergeant","captain"];const i=ranks.indexOf(u.rank);if(i>=0&&i<ranks.length-1&&p.res.gold>=30){p.res.gold-=30;u.rank=ranks[i+1];u.armor=(u.armor||0)+25;p.score+=6;}}
  }
  if(m.type==="disguise"){
    const u=r.units[m.unit]; if(u&&u.owner===pid&&u.job!=="engineer"&&p.res.gold>=20){p.res.gold-=20;u.disguised=true;u.disguiseLevel=Math.min(3,(u.disguiseLevel||0)+1);p.score+=5;}
  }
  if(m.type==="secretService"){
    if(!p.secretService && p.res.gold>=180){p.res.gold-=180;p.secretService=true;p.score+=15;}
  }

  if(m.type==="scheduleAttack"){
    const t=r.players[m.target];
    if(t&&m.target!==pid&&p.res.gold>=60&&p.res.food>=10){
      p.res.gold-=60;p.res.food-=10;
      r.attackOrders.push({id:String(r.orderNext++),owner:pid,target:m.target,executeAt:Date.now()+Math.max(5,Math.min(120,+m.delay||15))*1000,done:false});
      p.trust=Math.max(0,p.trust-2);
    }
  }
  if(m.type==="cancelAttack"){const q=r.attackOrders.find(q=>q.id===m.id);if(q&&q.owner===pid&&!q.done)q.done=true}
 });
 ws.on("close",()=>{let r=rooms.get(rid);if(r){delete r.players[pid];for(let k in r.units)if(r.units[k].owner===pid)delete r.units[k]}})
});
setInterval(()=>{
  for(const r of rooms.values()){
    for(const p of Object.values(r.players)){
      const belief=p.religion;
      p.res.gold=Math.min(9999,p.res.gold+(p.doctrines.includes("expansion")?3:2)+(belief==="prosperity"?1:0));
      p.res.food=Math.min(9999,p.res.food+1+(belief==="harvest"||belief==="nature"?1:0));
      if(belief==="resources"||belief==="forge")p.res.iron=Math.min(9999,p.res.iron+0.5);
      if(belief==="energy")p.res.energy=Math.min(9999,p.res.energy+0.5);
      for(const t of r.territories){
        if(t.owner===p.id){
          p.res.iron=Math.min(9999,p.res.iron+1);
          if(t.name.includes("Oil"))p.res.oil++;
          if(t.name.includes("Power"))p.res.energy++;
        }
      }
      if(belief==="community"||belief==="peace"||belief==="unity")p.trust=Math.min(100,p.trust+0.012);
      if(belief==="duty"||belief==="war")p.discipline=Math.min(100,p.discipline+0.008);
      if(belief==="reconciliation")p.trust=Math.min(100,p.trust+0.008);
      const routeCount=r.supplyRoutes.filter(q=>q.owner===p.id&&q.active).length;
      if(routeCount){p.res.food=Math.min(9999,p.res.food+routeCount);p.res.iron=Math.min(9999,p.res.iron+routeCount);}
      const activeOrders=r.attackOrders.filter(q=>q.owner===p.id&&!q.done).length;
      const incomePressure=p.res.food<20||p.res.gold<40;
      if(incomePressure)p.trust=Math.max(0,p.trust-0.08); else if(routeCount)p.trust=Math.min(100,p.trust+0.025);
      const inspected=p.bases.filter(b=>Date.now()-(b.officerChecked||0)<90000).length;
      p.oversight=Math.max(0,Math.min(100,Math.round(inspected/Math.max(1,p.bases.length)*100)));
      p.discipline=Math.max(0,Math.min(100,p.discipline + (p.oversight>50?.012:-.02) + (p.religion==="duty"?.01:0)));
      p.riot=Math.max(0,Math.min(100,(100-p.trust)*1.15+(activeOrders>2?5:0)+(p.discipline<35?10:0)));
      if(p.riot>70&&Math.random()<0.015){p.res.gold=Math.max(0,p.res.gold-20);p.res.food=Math.max(0,p.res.food-10);p.score=Math.max(0,p.score-5);p.trust=Math.max(0,p.trust-2);}
      // Base inspection decay: officers should regularly visit each base.
      for(const b of p.bases){
        if(Date.now()-(b.officerChecked||0)>90000)p.trust=Math.max(0,p.trust-0.01);
      }
    }
    for(const o of r.attackOrders){
      if(o.done||Date.now()<o.executeAt)continue;
      const a=r.players[o.owner],t=r.players[o.target];o.done=true;
      if(a&&t){
        for(let i=0;i<3;i++){const uid=String(r.next++);r.units[uid]={id:uid,owner:a.id,x:a.x+25+i*12,y:a.y+25,hp:180,kind:"iron_knight",tx:t.x,ty:t.y,target:t.id};}
        a.trust=Math.max(0,a.trust-3);
      }
    }
    // Internal security: high unrest can create abstract rebel cells.
    for(const p of Object.values(r.players)){
      if(p.riot>72 && p.secretService && Math.random()<0.0008){r.rebels.push({id:"r"+Math.random().toString(36).slice(2,7),owner:p.id,x:p.x+(Math.random()-.5)*180,y:p.y+(Math.random()-.5)*180,strength:50});}
      if(p.secretService){for(const q of r.rebels.filter(q=>q.owner===p.id)){q.strength-=0.04;if(q.strength<=0)r.rebels=r.rebels.filter(x=>x.id!==q.id);}}
    }
    // Officers travel between bases, inspect them, and can run a temporary propaganda campaign.
    for(const o of r.officials){
      if(o.status==="captured"||o.status==="ransomed")continue;
      const owner=r.players[o.owner];
      if(!owner)continue;
      const b=owner.bases.find(b=>b.id===o.baseId);
      if((o.status==="traveling"||o.status==="propaganda")&&b){
        const z=Math.hypot(b.x-o.x,b.y-o.y);
        if(z>3){o.x+=(b.x-o.x)/z*0.9;o.y+=(b.y-o.y)/z*0.9;}
        else {o.x=b.x;o.y=b.y;o.status="at_base";b.officerChecked=Date.now();owner.trust=Math.min(100,owner.trust+1);}
      }
      if(o.status==="propaganda"&&Date.now()>o.missionUntil)o.status="at_base";
      // Ambushes are abstracted as a capture chance when hostile troops surround the official.
      const ambusher=Object.values(r.units).find(u=>u.owner&&u.owner!==o.owner&&!u.garrisonedIn&&Math.hypot(u.x-o.x,u.y-o.y)<22);
      if(ambusher&&Math.random()<0.01){
        o.armor=Math.max(0,o.armor-10);
        if(o.armor===0){
          o.status="captured";o.capturedBy=ambusher.owner;
          r.prisoners.push({id:"p"+Math.random().toString(36).slice(2,7),owner:ambusher.owner,captiveOwner:o.owner,unitKind:o.name+" (official)",capturedBy:ambusher.owner,interrogations:0,intel:[]});
        }
      }
    }
    for(const u of Object.values(r.units)){
      const d=unitDefs[u.kind];
      if(!d||u.garrisonedIn)continue;
      if(u.campId&&r.camps?.some(c=>c.id===u.campId))continue;
      let atk=d.atk;
      const ownerPlayer=u.owner&&r.players[u.owner]; const fm=formations[u.formation||ownerPlayer?.formation||"line"]||formations.line; atk*=fm.atk;
      if(ownerPlayer?.religion==="war")atk*=1.05; if(ownerPlayer?.religion==="armor")atk*=1.02; if(ownerPlayer?.religion==="machinery"&&["siege_tank","dragon_mech"].includes(u.kind))atk*=1.06;
      if(ownerPlayer?.sect==="banner_sons")atk*=1.04;
      if(u.owner&&r.players[u.owner]?.doctrines.includes("honor")&&["iron_knight","steel_cavalry","shock_guard"].includes(u.kind))atk*=1.15;
      if(u.owner&&r.players[u.owner]?.doctrines.includes("innovation")&&["siege_tank","dragon_mech"].includes(u.kind))atk*=1.12;
      if(u.target&&r.players[u.target]){
        const t=r.players[u.target],z=dist(u,t);
        if(z>d.range){u.x+=(t.x-u.x)/z*d.speed;u.y+=(t.y-u.y)/z*d.speed;}
        else if(Math.random()<0.12){let dmg=atk*(t.religion==="armor"?.94:1)*(t.sect==="iron_shield"?.95:1);const cover=Object.values(t.buildings||{});const defenses=(t.buildings||[]).filter(b=>b.kind==="trench"||b.kind==="moat");if(defenses.length)dmg*=0.72;t.hp=Math.max(0,t.hp-dmg);if(t.hp===0){r.players[u.owner].score+=100;t.hp=1000;}}
      }
    }
    for(const camp of (r.camps||[]))camp.units=camp.units.filter(uid=>r.units[uid]);
    for(const u of Object.values(r.units)){
      if(!u.owner||u.garrisonedIn)continue;
      const owner=r.players[u.owner];if(!owner)continue;
      const nearBase=owner.bases.some(b=>Math.hypot(u.x-b.x,u.y-b.y)<180);
      u.exposed=!nearBase&&!u.campId&&night();
    }
    for(const u of Object.values(r.units)){
      if(!u.owner||!u.exposed||!night())continue;
      const enemy=Object.values(r.units).find(v=>v.owner&&v.owner!==u.owner&&!v.garrisonedIn&&Math.hypot(v.x-u.x,v.y-u.y)<24);
      if(enemy&&Math.random()<(u.campId?0.0007:0.003)){
        const camp=r.camps?.find(c=>c.id===u.campId);
        if(camp){camp.defense=Math.max(0,camp.defense-5);if(camp.defense>0)continue;}
        const owner=r.players[u.owner];
        if(owner){r.prisoners.push({id:"p"+Math.random().toString(36).slice(2,7),owner:enemy.owner,captiveOwner:u.owner,unitKind:u.kind,capturedBy:enemy.owner,interrogations:0,intel:[]});delete r.units[u.id];owner.score=Math.max(0,owner.score-10);}
      }
    }
    broadcast(r,snap(r));
  }
},100);
server.listen(process.env.PORT||3000,()=>console.log("Iron & Crown on port "+(process.env.PORT||3000)));
