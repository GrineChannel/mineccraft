import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

// Abstract state simulation; no automatic block destruction, raids or offline ticks.
// Each existing 128x128 settlement sector can belong to one state.
const KEY="zrpg:states_v1";
const NAMES=["Северная корона","Союз долин","Железный престол","Вольные земли"];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function read() {
  try {
    const raw=world.getDynamicProperty(KEY);
    const data=raw?JSON.parse(raw):null;
    return data&&Array.isArray(data.states)&&typeof data.turn==="number"?data:null;
  }catch(_){return null;}
}
function write(data){world.setDynamicProperty(KEY,JSON.stringify(data));}
function initial(){
  return {turn:0,states:NAMES.map((name,i)=>({
    id:"k"+i,name,treasury:100,food:80,army:20,stability:75,loyalty:75,
    tax:10,law:i%2?"council":"monarchy",ruler:"Правитель "+(i+1),
    dynasty:"Дом "+(i+1),heirs:1,age:25+i*6,claims:[],
    lands:[],alliances:[],wars:[],influence:10,unrest:0,alive:true
  }))};
}
function get(){return read()||initial();}
function random(n){return Math.floor(Math.random()*n);}
function addUnique(list,id){if(!list.includes(id))list.push(id);}
function remove(list,id){const i=list.indexOf(id);if(i>=0)list.splice(i,1);}
function active(data){return data.states.filter(s=>s.alive);}
function other(data,state){return active(data).filter(s=>s.id!==state.id);}
function turnState(data,s) {
  if(!s.alive)return;
  const landCount=s.lands.length;
  const income=4+landCount*2+Math.floor((s.tax*landCount)/10);
  s.treasury=clamp(s.treasury+income-Math.ceil(s.army/10),0,999999);
  s.food=clamp(s.food+4+landCount*3-Math.ceil(s.army/8),0,999999);
  s.stability=clamp(s.stability+(s.food>10?1:-5)-(s.tax>20?2:0),0,100);
  s.loyalty=clamp(s.loyalty+(s.stability>60?1:-2)-(s.tax>25?2:0),0,100);
  s.unrest=clamp(s.unrest+(s.loyalty<35?5:-2),0,100);
  if(s.treasury>50&&s.food>25&&s.army<250){s.treasury-=10;s.food-=5;s.army+=2;}
  if(s.food===0)s.army=Math.max(0,s.army-3);
  s.age++;
  if(s.age>=65&&random(5)===0){
    if(s.heirs>0){s.heirs--;s.ruler="Наследник "+data.turn;s.age=20+random(15);s.stability=clamp(s.stability-8,0,100);}
    else {s.ruler="Новый правитель "+data.turn;s.dynasty="Дом "+data.turn;s.age=25;s.stability=clamp(s.stability-25,0,100);}
  }
  if(s.unrest>=90){
    s.army=Math.max(0,s.army-8);s.stability=clamp(s.stability-15,0,100);
    s.unrest=45;s.ruler="Восставший совет "+data.turn;s.law="council";
    if(s.lands.length>1)s.lands.pop(); // territory secedes into neutral land
  }
  if(random(30)===0&&s.heirs<3)s.heirs++;
  if(random(20)===0&&s.stability<50)s.influence=Math.max(0,s.influence-2);
}
function diplomacy(data) {
  const states=active(data);
  if(states.length<2)return;
  const a=states[random(states.length)];
  const b=states[random(states.length)];
  if(a.id===b.id)return;
  if(a.wars.includes(b.id)){
    const aPower=a.army+random(20),bPower=b.army+random(20);
    a.army=Math.max(0,a.army-2-random(4));
    b.army=Math.max(0,b.army-2-random(4));
    if(aPower>bPower+10&&b.lands.length>0) {
      const territory=b.lands.pop();addUnique(a.lands,territory);
      a.influence+=3;b.stability=clamp(b.stability-8,0,100);
    }
    if(a.army<5||b.army<5||random(8)===0){remove(a.wars,b.id);remove(b.wars,a.id);}
  }else if(a.alliances.includes(b.id)){
    if(random(15)===0){remove(a.alliances,b.id);remove(b.alliances,a.id);}
    else {a.treasury+=2;b.treasury+=2;}
  }else if(random(12)===0&&a.stability>50&&b.stability>50){
    addUnique(a.alliances,b.id);addUnique(b.alliances,a.id);
  }else if(random(20)===0&&a.army>15&&b.army>15){
    addUnique(a.wars,b.id);addUnique(b.wars,a.id);
    remove(a.alliances,b.id);remove(b.alliances,a.id);
  }
}
function collapse(data,s) {
  if(!s.alive||s.stability>0||s.army>0||s.treasury>0)return;
  s.alive=false;
  for(const other of data.states){remove(other.wars,s.id);remove(other.alliances,s.id);}
  s.wars=[];s.alliances=[];s.lands=[];
}
export function registerSettlements(towns) {
  const data=get();let changed=false;
  for(const id of Object.keys(towns)){
    if(data.states.some(s=>s.lands.includes(id)))continue;
    const candidates=active(data);if(!candidates.length)break;
    const owner=candidates[random(candidates.length)];
    addUnique(owner.lands,id);changed=true;
  }
  if(changed)write(data);
}
export function advanceStates() {
  const data=get();data.turn++;
  for(const state of data.states)turnState(data,state);
  diplomacy(data);
  for(const state of data.states)collapse(data,state);
  write(data);
}
function show(player,form,cb) {
  form.show(player).then(r=>{if(!r.canceled)cb(r.selection);})
    .catch(e=>console.warn("[ZERO STATES UI] "+e));
}
function details(player,s,back){
  const form=new ActionFormData().title("§6"+s.name).body(
    "§fПравитель: §e"+s.ruler+"\n§fДинастия: §e"+s.dynasty+
    "\n§fЗакон: §e"+(s.law==="monarchy"?"Монархия":"Совет")+
    "\n§fНаследников: §e"+s.heirs+"\n§fТерриторий: §e"+s.lands.length+
    "\n§fКазна: §e"+s.treasury+"\n§fЕда: §e"+s.food+
    "\n§fАрмия: §e"+s.army+"\n§fНалоги: §e"+s.tax+"%"+
    "\n§fСтабильность: §e"+s.stability+"\n§fЛояльность: §e"+s.loyalty+
    "\n§fНедовольство: §e"+s.unrest+"\n§fСоюзы: §e"+s.alliances.length+
    "\n§fВойны: §e"+s.wars.length+"\n§fСостояние: "+(s.alive?"§aСуществует":"§cРаспалось"));
  form.button("§7Назад");show(player,form,back);
}
export function showStates(player,back){
  const data=get();
  const form=new ActionFormData().title("§6Государства ZERO")
    .body("§7Абстрактная симуляция политики, войн, династий и экономики.\n"+
      "§fПолитических циклов: §e"+data.turn+"\n§7Один цикл = 5 минут активной игры.");
  for(const state of data.states)form.button((state.alive?"§e":"§8")+state.name+"\n§7Земли: "+state.lands.length+" · Армия: "+state.army);
  form.button("§7Назад");
  show(player,form,i=>{
    if(i===data.states.length)return back();
    if(data.states[i])details(player,data.states[i],()=>showStates(player,back));
  });
}
// State simulation only while the world is active and players are online.
system.runInterval(()=>{
  try{if(world.getAllPlayers().length)advanceStates();}
  catch(e){console.warn("[ZERO STATES SIM] "+e);}
},6000);
