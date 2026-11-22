import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

// ZERO magic: elemental schools, persistent mastery, mana and two-element combos.
const P = "zrpg:magic_";
const ELEMENTS = [
  { id:"fire", name:"Огонь", school:"Разрушение", damage:6, cost:12 },
  { id:"water", name:"Вода", school:"Восстановление", damage:0, cost:12 },
  { id:"earth", name:"Земля", school:"Защита", damage:0, cost:14 },
  { id:"air", name:"Воздух", school:"Контроль", damage:3, cost:10 },
  { id:"lightning", name:"Молния", school:"Разрушение", damage:8, cost:18 },
  { id:"ice", name:"Лёд", school:"Контроль", damage:5, cost:14 }
];
const COMBOS = [
  { a:"fire", b:"air", name:"Огненный вихрь", damage:12, cost:26 },
  { a:"water", b:"ice", name:"Ледяной поток", damage:10, cost:24 },
  { a:"earth", b:"lightning", name:"Грозовой удар", damage:14, cost:30 },
  { a:"fire", b:"earth", name:"Лавовый удар", damage:13, cost:28 }
];
function get(player, key, fallback=0) {
  const value=player.getDynamicProperty(P+key);
  return typeof value==="number" && Number.isFinite(value) ? value : fallback;
}
function set(player,key,value) { player.setDynamicProperty(P+key,value); }
function maxMana(player) {
  const intelligence=player.getDynamicProperty("zrpg:intelligence");
  return Math.min(500, 50 + Math.max(1,typeof intelligence==="number"?intelligence:1)*5);
}
function mana(player) {
  const value=player.getDynamicProperty(P+"mana");
  return typeof value==="number" ? Math.max(0,Math.min(value,maxMana(player))) : maxMana(player);
}
function message(player,text) { player.sendMessage("§d[ZERO Магия] §r"+text); }
function show(player,form,handler) {
  form.show(player).then(result=>{if(!result.canceled) handler(result.selection);})
    .catch(error=>console.warn("[ZERO MAGIC UI] "+error));
}
function mastery(player,id) { return get(player,"mastery_"+id); }
function train(player,ids) {
  for(const id of ids) {
    const xp=get(player,"xp_"+id)+1;
    const rank=mastery(player,id);
    if(xp>=10+rank*5 && rank<20) {
      set(player,"xp_"+id,0);
      set(player,"mastery_"+id,rank+1);
      message(player,"§aМастерство "+ELEMENTS.find(e=>e.id===id).name+": "+(rank+1));
    } else set(player,"xp_"+id,xp);
  }
}
const cooldown=new Map();
function target(player) {
  try {
    const hits=player.getEntitiesFromViewDirection({maxDistance:12});
    for(const hit of hits) {
      const entity=hit.entity;
      if(entity && entity.id!==player.id && entity.typeId!=="minecraft:player") return entity;
    }
  } catch(error) { console.warn("[ZERO MAGIC TARGET] "+error); }
  return null;
}
function cast(player,spell,ids) {
  const now=system.currentTick;
  if(now-(cooldown.get(player.id)??-100)>=0 && now-(cooldown.get(player.id)??-100)<30) {
    message(player,"§cЗаклинание восстанавливается.");return;
  }
  const current=mana(player);
  if(current<spell.cost) {message(player,"§cНедостаточно маны.");return;}
  const enemy=spell.damage>0?target(player):null;
  if(spell.damage>0 && !enemy) {message(player,"§eПосмотри на существо в пределах 12 блоков.");return;}
  try {
    if(spell.damage>0) {
      const bonus=ids.reduce((sum,id)=>sum+mastery(player,id),0);
      enemy.applyDamage(spell.damage+Math.floor(bonus/4));
    } else if(ids.includes("water")) {
      const health=player.getComponent("minecraft:health");
      if(!health) return;
      health.setCurrentValue(Math.min(health.effectiveMax,health.currentValue+5+Math.floor(mastery(player,"water")/3)));
    } else if(ids.includes("earth")) {
      player.addEffect("resistance",200,{amplifier:0,showParticles:true});
    }
    set(player,"mana",current-spell.cost);
    cooldown.set(player.id,now);
    train(player,ids);
    message(player,"§aПрименено: §f"+spell.name+" §7(-"+spell.cost+" маны)");
  } catch(error) {
    console.warn("[ZERO MAGIC CAST] "+error);
    message(player,"§cНе удалось применить заклинание.");
  }
}
function showSpells(player,back) {
  const form=new ActionFormData().title("§dСтихии и школы")
    .body("§fМана: §b"+Math.floor(mana(player))+"/"+maxMana(player)+
      "\n§7Наведи взгляд на существо для атакующих заклинаний.");
  for(const element of ELEMENTS)
    form.button("§e"+element.name+" §7· "+element.school+"\n§b"+element.cost+" маны · ранг "+mastery(player,element.id));
  form.button("§7Назад");
  show(player,form,index=>{
    if(index===ELEMENTS.length)return back();
    const element=ELEMENTS[index];
    if(!element)return;
    cast(player,{...element,name:element.name},[element.id]);
    system.run(()=>showSpells(player,back));
  });
}
function showCombos(player,back) {
  const form=new ActionFormData().title("§5Комбинации стихий")
    .body("§7Комбинации доступны каждому игроку. Развивай обе стихии.");
  for(const combo of COMBOS)form.button("§d"+combo.name+"\n§b"+combo.cost+" маны");
  form.button("§7Назад");
  show(player,form,index=>{
    if(index===COMBOS.length)return back();
    const combo=COMBOS[index];
    if(!combo)return;
    if(mastery(player,combo.a)<2||mastery(player,combo.b)<2)
      message(player,"§cДля комбинации нужно мастерство 2 обеих стихий.");
    else cast(player,combo,[combo.a,combo.b]);
    system.run(()=>showCombos(player,back));
  });
}
function showMastery(player,back) {
  const form=new ActionFormData().title("§bМастерство магии")
    .body(ELEMENTS.map(e=>e.name+": "+mastery(player,e.id)+"/20 ("+
      get(player,"xp_"+e.id)+"/"+(10+mastery(player,e.id)*5)+" опыта)").join("\n"));
  form.button("§7Назад");show(player,form,back);
}
export function showMagic(player,back) {
  const form=new ActionFormData().title("§dМагия ZERO")
    .body("§fМана: §b"+Math.floor(mana(player))+"/"+maxMana(player)+
      "\n§7Стихии, школы, сочетания и развитие мастерства.");
  form.button("§dЗаклинания");
  form.button("§5Комбинации");
  form.button("§bМастерство");
  form.button("§7Назад");
  show(player,form,index=>{
    if(index===0)showSpells(player,()=>showMagic(player,back));
    else if(index===1)showCombos(player,()=>showMagic(player,back));
    else if(index===2)showMastery(player,()=>showMagic(player,back));
    else back();
  });
}
// Passive mana regeneration: 1 point every 5 seconds.
system.runInterval(()=>{
  for(const player of world.getAllPlayers()) {
    try {
      const value=mana(player);
      if(value<maxMana(player))set(player,"mana",Math.min(maxMana(player),value+1));
    } catch(error) {console.warn("[ZERO MAGIC REGEN] "+error);}
  }
},100);
