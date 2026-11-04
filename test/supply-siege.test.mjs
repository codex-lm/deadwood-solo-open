import test from 'node:test';
import assert from 'node:assert/strict';
import { SupplySiegeSimulation } from '../public/supply-siege.js';
import { RoomSimulation } from '../simulation.mjs';
import { LastNightSimulation } from '../public/last-night.js';
import { SoloSocket } from '../public/solo-transport.js';
const id = '0123456789abcdef';
function room() {
  const sim = new SupplySiegeSimulation('000000', {random:()=>.5});
  sim.addPlayer(id,'Test'); sim.start(id); return sim;
}
function begin(sim, convoy = false) {
  assert.equal(sim.startSiegeAssault(id,convoy),true);
  for (let i=0;i<31;i++) sim.tick(.1);
  assert.equal(sim.phase,'wave');
}
function finish(sim) {
  sim.waveTimeLeft=.01; sim.tick(.1);
}
test('planning freezes all time, manual next-wave cannot bypass it, and unauthorised actions are rejected',()=>{
  const sim=room(); const state=JSON.stringify(sim.snapshot());
  for(let i=0;i<100;i++)sim.tick(.1);
  assert.equal(JSON.stringify(sim.snapshot()),state);
  assert.equal(sim.voteNextWave(id),false); assert.equal(sim.beginWave(),false);
  assert.equal(sim.startSiegeAssault('someone-else',false),false);
  assert.equal(sim.startSiegeAssault(id,'true'),false);
  assert.equal(sim.buySiege(id,'constructor'),false);
  assert.equal(sim.buySiege(id,'ammo'),false,'full stock cannot waste supplies');
});
test('convoy changes real spawn budget and duration, and yields the promised supply reward',()=>{
  for(const convoy of [false,true]) {
    const sim=room();begin(sim,convoy);
    assert.equal(sim.waveInitialTotal,convoy?12:8);
    assert.ok(sim.waveTimeLeft>(convoy?44:29));
    finish(sim);
    assert.equal(sim.planning,true);assert.equal(sim.ledger.supplies,convoy?9:6);
    assert.equal(sim.ledger.convoys,convoy?1:0);
    assert.equal(sim.startSiegeAssault(id,convoy),true);
    assert.equal(sim.startSiegeAssault(id,convoy),false,'duplicate start cannot double launch');
  }
});
test('health, armour, ammunition and wounds persist at the break; purchases apply exactly once',()=>{
  const sim=room(); begin(sim); const player=sim.players.get(id);
  player.hp=23;player.armor=17;player.inventory.pistol.ammo=2;player.inventory.pistol.reserve=7;
  for(const door of sim.doors) if(!door.sealed)door.hp=25;
  finish(sim);
  assert.equal(player.hp,23);assert.equal(player.armor,17);
  assert.equal(player.inventory.pistol.ammo,2);assert.equal(player.inventory.pistol.reserve,7);
  assert.equal(sim.buySiege(id,'medicine'),true);assert.equal(player.hp,68);
  assert.equal(sim.buySiege(id,'medicine'),false);assert.equal(player.hp,68);
  assert.equal(sim.buySiege(id,'ammo'),true);assert.equal(player.inventory.pistol.ammo,12);
  assert.equal(player.inventory.pistol.reserve,36);
  assert.equal(sim.buySiege(id,'barricades'),true);
  assert.ok(sim.doors.filter(d=>!d.sealed).every(d=>d.hp===d.maxHp));
  assert.equal(sim.ledger.supplies,1);
  assert.equal(sim.buySiege(id,'shotgun'),false,'cannot overspend');
});
test('shotgun unlocks at assault two, respects slots and cannot be bought twice',()=>{
  const sim=room(); assert.equal(sim.buySiege(id,'shotgun'),false);
  begin(sim,true);finish(sim);
  assert.equal(sim.buySiege(id,'shotgun'),true);
  const player=sim.players.get(id);assert.ok(player.inventory.shotgun.ammo>0);
  assert.equal(sim.chooseWeapon(id,'shotgun'),true);
  assert.equal(sim.buySiege(id,'shotgun'),false);
  begin(sim);finish(sim);assert.equal(sim.buySiege(id,'shotgun'),false);
  const other=room();begin(other);finish(other);other.players.get(id).inventory.bat={ammo:Infinity,reserve:Infinity};
  assert.equal(other.buySiege(id,'shotgun'),false);
});
test('six legal launches reach extraction then victory; terminal time freezes and replay resets',()=>{
  const sim=room();const waves=[];
  // Isolate progression; combat and aiming are checked in the real browser.
  for(let i=0;i<6;i++) {if(i===5)assert.equal(sim.startSiegeAssault(id,true),false,'no pointless convoy on the final assault');begin(sim,i===1);waves.push(sim.wave);finish(sim);}
  assert.deepEqual(waves,[1,2,3,4,5,6]);assert.equal(sim.phase,'extraction');
  assert.equal(sim.planning,false);
  for(let i=0;i<130;i++)sim.tick(.1);
  assert.equal(sim.phase,'victory');
  const done=JSON.stringify(sim.snapshot());sim.tick(.1);assert.equal(JSON.stringify(sim.snapshot()),done);
  assert.equal(sim.start(id),true);assert.equal(sim.wave,0);assert.equal(sim.ledger.supplies,4);
  assert.equal(sim.ledger.convoys,0);assert.equal(sim.planning,true);assert.equal(sim.players.get(id).hp,100);
});
test('death at a timeout cannot be healed by a break; pause and invalid deltas do not drain assault time',()=>{
  const sim=room();begin(sim);
  sim.setPause(id,true);const frozen=JSON.stringify(sim.snapshot());sim.tick(.1);assert.equal(JSON.stringify(sim.snapshot()),frozen);
  sim.setPause(id,false);const left=sim.waveTimeLeft;
  for(const delta of [-1,NaN,Infinity])sim.tick(delta);assert.equal(sim.waveTimeLeft,left);
  sim.players.get(id).alive=false;finish(sim);assert.equal(sim.phase,'gameover');assert.equal(sim.planning,false);
  assert.equal(sim.startSiegeAssault(id,false),false);assert.equal(sim.buySiege(id,'medicine'),false);
});
test('mode refuses saves; classic and Last Night retain their own rules',()=>{
  const sim=room();assert.throws(()=>sim.exportSave({requesterId:id,build:'test'}),error=>error.code==='mode');
  assert.deepEqual(sim.importSave({}),{ok:false,reason:'mode'});
  assert.equal(new RoomSimulation('a').maxWaves,20);assert.equal(new LastNightSimulation('b').maxWaves,10);
  assert.equal(sim.raidsEnabled,false);assert.equal(sim.snapshot().expedition.enabled,false);
});
test('ordinary transport selects this mode and freezes gameplay packets at the desk',async t=>{
  const socket=new SoloSocket('',{autoTick:false,playerId:id});t.after(()=>socket.close());
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  const send=data=>socket.send(JSON.stringify(data));
  send({type:'join',name:'Test',mode:'supply-siege'});send({type:'start'});
  const sim=socket.simulation;assert.equal(sim.mode,'supply-siege');
  const before=JSON.stringify(sim.snapshot());
  for(const data of [{type:'input',forward:1},{type:'shoot'},{type:'interact'},{type:'next-wave'},{type:'pause',paused:true}])send(data);
  socket.tick();assert.equal(JSON.stringify(sim.snapshot()),before);
  send({type:'siege-start',convoy:true});assert.equal(sim.planning,false);assert.equal(sim.convoy,true);
  const practice=new SoloSocket('',{autoTick:false,playerId:id});t.after(()=>practice.close());
  await new Promise(resolve=>practice.addEventListener('open',resolve,{once:true}));
  practice.send(JSON.stringify({type:'join',practice:true,mode:'supply-siege'}));assert.equal(practice.simulation.mode,'classic');
});
test('new mode instructions and endings translate without borrowing the Last Night name',async t=>{
  const {t:tr,setLanguage,getLanguage}=await import('../public/i18n.js');
  const previous=getLanguage();t.after(()=>setLanguage(previous));
  for(const lang of ['en','fr']) {
    setLanguage(lang);
    for(const key of ['title','brief','carry','ammo','medicine','barricades','shotgun','convoyHelp','forecast','noSave','win','loss'])assert.notEqual(tr(`siege.${key}`),`siege.${key}`);
    assert.match(tr('siege.win'),/Supply Siege/);assert.match(tr('siege.loss'),/Supply Siege/);
    assert.doesNotMatch(tr('siege.loss'),/Last Night/);
  }
});
