import { registerSettlements } from "./states.js";
import { advanceConstruction, repairConstruction, toggleConstruction, constructionStatus } from "./construction.js";
import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

// Simulates loaded vanilla villagers only. No offline simulation or block construction.
const KEY="zrpg:settlements_v1";
const JOBS=["Фермер","Ремесленник","Торговец","Страж","Учитель"];
const NAMES=["Арен","Мира","Торн","Лея","Рен","Элин","Варек","Нора"];
function load() {
  try {const value=world.getDynamicProperty(KEY);return typeof value==="string"?JSON.parse(value):{};}
  catch(_){return {};}
}
function save(data) {world.setDynamicProperty(KEY,JSON.stringify(data));}
function settlementId(villager) {
  const p=villager.location;
  return villager.dimension.id+":"+Math.floor(p.x/128)+":"+Math.floor(p.z/128);
}
function createTown(id,location) {
  return {id,name:"Поселение "+Math.abs(Math.floor(location.x/128))+"-"+Math.abs(Math.floor(location.z/128)),
    food:30,materials:10,wealth:10,security:30,knowledge:0,level:1,days:0,constructionEnabled:false,buildings:[],center:{x:Math.floor(location.x),y:Math.floor(location.y),z:Math.floor(location.z)}};
}
function bounded(value,min,max){return Math.max(min,Math.min(max,value));}
function number(entity,key,initial) {
  const v=entity.getDynamicProperty("zrpg:npc_"+key);
  return typeof v==="number"&&Number.isFinite(v)?v:initial;
}
function set(entity,key,value){entity.setDynamicProperty("zrpg:npc_"+key,value);}
function initialize(villager) {
  if(villager.getDynamicProperty("zrpg:npc_initialized")===true)return;
  const job=JOBS[Math.floor(Math.random()*JOBS.length)];
  const name=NAMES[Math.floor(Math.random()*NAMES.length)];
  villager.setDynamicProperty("zrpg:npc_initialized",true);
  villager.setDynamicProperty("zrpg:npc_job",job);
  villager.setDynamicProperty("zrpg:npc_name",name);
  set(villager,"hunger",25);
  set(villager,"energy",80);
  set(villager,"skill",1);
  set(villager,"relationships",0);
  set(villager,"family",0);
  set(villager,"experience",0);
}
function work(villager,town) {
  const job=villager.getDynamicProperty("zrpg:npc_job");
  const hunger=number(villager,"hunger",25);
  const energy=number(villager,"energy",80);
  if(energy<20||hunger>80) {
    set(villager,"energy",bounded(energy+12,0,100));
    if(town.food>0&&hunger>50){town.food--;set(villager,"hunger",bounded(hunger-25,0,100));}
    return;
  }
  const skill=number(villager,"skill",1);
  const production=1+Math.floor(skill/5);
  if(job==="Фермер")town.food+=production*2;
  if(job==="Ремесленник"&&town.food>0){town.materials+=production;town.food--;}
  if(job==="Торговец"&&town.materials>0){town.wealth+=production;town.materials--;}
  if(job==="Страж")town.security=bounded(town.security+production,0,100);
  if(job==="Учитель")town.knowledge+=production;
  set(villager,"hunger",bounded(hunger+5,0,100));
  set(villager,"energy",bounded(energy-7,0,100));
  const experience=number(villager,"experience",0)+1;
  if(experience>=10+skill*3&&skill<20) {
    set(villager,"experience",0);set(villager,"skill",skill+1);
  } else set(villager,"experience",experience);
}
function social(villager,neighbors) {
  if(neighbors.length<2)return;
  const relationships=number(villager,"relationships",0)+1;
  set(villager,"relationships",bounded(relationships,0,100));
  if(relationships>=30&&number(villager,"family",0)===0)
    set(villager,"family",1); // family tie is social data; no automatic breeding
}
function advanceTown(town) {
  town.days++;
  town.food=bounded(town.food,0,9999);
  town.materials=bounded(town.materials,0,9999);
  town.wealth=bounded(town.wealth,0,9999);
  if(town.food>60&&town.materials>30&&town.wealth>20&&town.knowledge>=10&&town.level<10) {
    town.food-=30;town.materials-=20;town.wealth-=10;town.knowledge-=10;
    town.level++;
  }
  if(town.food===0)town.security=bounded(town.security-2,0,100);
}
function getNearbyVillagers(player) {
  try {
    return player.dimension.getEntities({type:"minecraft:villager",location:player.location,maxDistance:48}).slice(0,30);
  }catch(_){return [];}
}
function findNearest(player) {
  const villagers=getNearbyVillagers(player);
  villagers.sort((a,b)=>{
    const x=a.location,z=b.location,p=player.location;
    return (x.x-p.x)**2+(x.z-p.z)**2-((z.x-p.x)**2+(z.z-p.z)**2);
  });
  return villagers[0];
}
function show(player,form,handler) {
  form.show(player).then(result=>{if(!result.canceled)handler(result.selection);})
    .catch(error=>console.warn("[ZERO NPC UI] "+error));
}
function talk(player,villager,back) {
  initialize(villager);
  const name=villager.getDynamicProperty("zrpg:npc_name");
  const job=villager.getDynamicProperty("zrpg:npc_job");
  const form=new ActionFormData().title("§a"+name+" · "+job)
    .body("§fПрофессия: §e"+job+
      "\n§fНавык: §e"+number(villager,"skill",1)+
      "\n§fГолод: §e"+number(villager,"hunger",25)+"/100"+
      "\n§fЭнергия: §e"+number(villager,"energy",80)+"/100"+
      "\n§fОтношения: §e"+number(villager,"relationships",0)+"/100"+
      "\n§fСемейные связи: §e"+(number(villager,"family",0)?"Есть":"Нет"));
  form.button("§bПоговорить");
  form.button("§6Обменяться ресурсами");
  form.button("§7Назад");
  show(player,form,index=>{
    if(index===0) {
      set(villager,"relationships",bounded(number(villager,"relationships",0)+5,0,100));
      player.sendMessage("§a"+name+": Рад встрече! Наше поселение постепенно развивается.");
    } else if(index===1) {
      const towns=load();const id=settlementId(villager);
      const town=towns[id]||createTown(id,villager.location);
      player.sendMessage("§eТорговля предметами доступна через обычный интерфейс жителя. Запасы поселения: "+town.food+" еды.");
    } else return back();
    system.run(()=>talk(player,villager,back));
  });
}
export function showNPC(player,back) {
  const villagers=getNearbyVillagers(player);
  const towns=load();
  const ids=[...new Set(villagers.map(v=>settlementId(v)))];
  const details=ids.map(id=>{
    const t=towns[id];return t?t.name+" · ур. "+t.level+" · еда "+t.food+" · материалы "+t.materials+" · богатство "+t.wealth:"Неизученное поселение";
  });
  const form=new ActionFormData().title("§aЖивой мир ZERO")
    .body("§7Активные жители поблизости: §e"+villagers.length+
      "\n§7Поселения: §e"+ids.length+"\n\n"+(details.join("\n")||"Жителей поблизости нет.")+
      "\n\n§8Симуляция работает только рядом с игроками.");
  form.button("§bПоговорить с ближайшим жителем");
  form.button("§6Строительство поселения");
  form.button("§7Назад");
  show(player,form,index=>{
    if(index===2)return back();
    if(index===1){
      const nearest=findNearest(player);
      if(!nearest)return back();
      const id=settlementId(nearest);const data=load();
      if(!data[id])data[id]=createTown(id,nearest.location);
      const town=data[id];
      const buildForm=new ActionFormData().title("§6Развитие поселения")
        .body(constructionStatus(town)+"\n§8Внимание: NPC будут устанавливать блоки в мире.");
      buildForm.button(town.constructionEnabled?"§cОтключить строительство":"§aРазрешить строительство");
      buildForm.button("§7Назад");
      show(player,buildForm,choice=>{
        if(choice===0){toggleConstruction(town);save(data);}
        system.run(()=>showNPC(player,back));
      });
      return;
    }
    const nearest=findNearest(player);
    if(!nearest){player.sendMessage("§c[ZERO] Поблизости нет жителей.");return back();}
    talk(player,nearest,()=>showNPC(player,back));
  });
}
// Bounded simulation: at most 30 villagers per player, 1 pass every 30 seconds.
system.runInterval(()=>{
  try {
    const towns=load();const seen=new Set();const residents={};
    for(const player of world.getAllPlayers()) {
      for(const villager of getNearbyVillagers(player)) {
        if(seen.has(villager.id))continue;
        seen.add(villager.id);
        initialize(villager);
        const id=settlementId(villager);
        if(!towns[id])towns[id]=createTown(id,villager.location);
        if(!residents[id])residents[id]=[];
        residents[id].push(villager);
        work(villager,towns[id]);
      }
    }
    for(const id of Object.keys(residents)) {
      for(const villager of residents[id])social(villager,residents[id]);
      advanceTown(towns[id]);
      if(residents[id].length>0){
        advanceConstruction(towns[id],residents[id][0]);
        repairConstruction(towns[id],residents[id][0]);
      }
    }
    if(seen.size>0){save(towns);registerSettlements(towns);}
  }catch(error){console.warn("[ZERO NPC SIM] "+error);}
},600);
