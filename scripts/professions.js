import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const JOBS=[
 ["miner","Шахтёр"],["smith","Кузнец"],["farmer","Фермер"],["alchemist","Алхимик"],
 ["hunter","Охотник"],["merchant","Торговец"],["woodcutter","Лесоруб"],["builder","Строитель"],
 ["fisher","Рыбак"],["cook","Повар"],["tailor","Портной"],["jeweler","Ювелир"],
 ["enchanter","Зачарователь"],["herbalist","Травник"],["explorer","Исследователь"],["guard","Страж"],
 ["carpenter","Плотник"],["mason","Каменщик"],["brewer","Пивовар"],["engineer","Инженер"],
 ["rancher","Животновод"],["scribe","Писарь"],["healer","Целитель"],["trader","Караванщик"]
];
const PREFIX="zrpg:prof_";
const RECIPES=[
 {job:"smith",name:"Железные слитки",in:[["minecraft:raw_iron",3],["minecraft:coal",1]],out:["minecraft:iron_ingot",3],level:1},
 {job:"cook",name:"Хлеб",in:[["minecraft:wheat",3]],out:["minecraft:bread",1],level:1},
 {job:"carpenter",name:"Доски",in:[["minecraft:oak_log",2]],out:["minecraft:oak_planks",8],level:1},
 {job:"mason",name:"Каменные кирпичи",in:[["minecraft:stone",4]],out:["minecraft:stone_bricks",4],level:1},
 {job:"tailor",name:"Шерсть",in:[["minecraft:string",4]],out:["minecraft:white_wool",1],level:2},
 {job:"alchemist",name:"Стеклянные бутылки",in:[["minecraft:glass",3]],out:["minecraft:glass_bottle",3],level:2},
 {job:"engineer",name:"Поршень",in:[["minecraft:cobblestone",4],["minecraft:oak_planks",3],["minecraft:iron_ingot",1],["minecraft:redstone",1]],out:["minecraft:piston",1],level:3}
];
function value(player,key,def=0){const n=player.getDynamicProperty(PREFIX+key);return typeof n==="number"&&Number.isFinite(n)?n:def;}
function set(player,key,n){player.setDynamicProperty(PREFIX+key,n);}
function level(player,job){return value(player,job+"_level",0);}
function progress(player,job){return value(player,job+"_xp",0);}
function earn(player,job,xp=1){
  if(!JOBS.some(j=>j[0]===job))return;
  const old=level(player,job);if(old>=50)return;
  const threshold=20+old*12;const total=progress(player,job)+xp;
  if(total>=threshold){
    set(player,job+"_level",old+1);set(player,job+"_xp",total-threshold);
    player.sendMessage("§6[ZERO] §aПрофессия "+JOBS.find(j=>j[0]===job)[1]+" повышена до "+(old+1));
  }else set(player,job+"_xp",total);
}
const last=new Map();
function practice(player,job,cooldown=40){
  const key=player.id+":"+job,now=system.currentTick;
  if(now-(last.get(key)??-cooldown)<cooldown)return;
  last.set(key,now);earn(player,job);
}
world.afterEvents.playerBreakBlock.subscribe(e=>{
  try{
    const id=e.brokenBlockPermutation.type.id,p=e.player;
    if(/_ore$|ancient_debris/.test(id))practice(p,"miner");
    if(/_log$|_stem$/.test(id))practice(p,"woodcutter");
    if(/wheat|carrots|potatoes|beetroot|melon|pumpkin/.test(id))practice(p,"farmer");
    if(/stone|deepslate|cobblestone/.test(id))practice(p,"mason");
    if(/leaves|flower|grass|fern/.test(id))practice(p,"herbalist");
  }catch(error){console.warn("[ZERO PROF BREAK] "+error);}
});
world.afterEvents.entityDie.subscribe(e=>{
  try{
    const p=e.damageSource?.damagingEntity;
    if(p?.typeId!=="minecraft:player")return;
    if(e.deadEntity.typeId.startsWith("minecraft:"))practice(p,"hunter",60);
  }catch(error){console.warn("[ZERO PROF HUNT] "+error);}
});
world.afterEvents.itemUse.subscribe(e=>{
  try{
    const id=e.itemStack?.typeId||"";
    if(id.includes("fishing_rod"))practice(e.source,"fisher",100);
    if(id.includes("potion"))practice(e.source,"alchemist",100);
  }catch(error){console.warn("[ZERO PROF ITEM] "+error);}
});
function inventory(player){return player.getComponent("minecraft:inventory")?.container;}
function count(container,id){
  let n=0;for(let i=0;i<container.size;i++){const item=container.getItem(i);if(item?.typeId===id)n+=item.amount;}return n;
}
function take(container,id,amount){
  let left=amount;
  for(let i=0;i<container.size&&left>0;i++){
    const item=container.getItem(i);if(item?.typeId!==id)continue;
    const n=Math.min(left,item.amount);left-=n;
    if(n===item.amount)container.setItem(i,undefined);
    else{item.amount-=n;container.setItem(i,item);}
  }
  return left===0;
}
function give(player,id,amount){
  const container=inventory(player);
  const remaining=container.addItem(new ItemStack(id,amount));
  if(remaining)player.dimension.spawnItem(remaining,player.location);
}
function workshopKey(player){return PREFIX+"workshop";}
function ownsWorkshop(player){return player.getDynamicProperty(workshopKey(player))===true;}
function craft(player,recipe){
  const container=inventory(player);if(!container)return;
  if(!ownsWorkshop(player)){player.sendMessage("§cСначала открой мастерскую.");return;}
  if(level(player,recipe.job)<recipe.level){player.sendMessage("§cНедостаточный уровень профессии.");return;}
  if(!recipe.in.every(([id,n])=>count(container,id)>=n)){player.sendMessage("§cНе хватает материалов.");return;}
  for(const [id,n] of recipe.in)take(container,id,n);
  give(player,recipe.out[0],recipe.out[1]);earn(player,recipe.job,5);
  player.sendMessage("§aИзготовлено: "+recipe.name);
}
function form(player,data,cb){
  data.show(player).then(r=>{if(!r.canceled)cb(r.selection);})
    .catch(e=>console.warn("[ZERO PROF UI] "+e));
}
function recipes(player,back){
  const f=new ActionFormData().title("§6Производство").body("§7Рецепты используют предметы из обычного инвентаря.\n§fМастерская: "+(ownsWorkshop(player)?"§aЕсть":"§cНет"));
  for(const r of RECIPES)f.button(r.name+"\n§7"+r.in.map(([id,n])=>id.replace("minecraft:","")+" ×"+n).join(", "));
  f.button("§7Назад");
  form(player,f,i=>{if(i===RECIPES.length)return back();if(RECIPES[i])craft(player,RECIPES[i]);system.run(()=>recipes(player,back));});
}
function market(player,back){
  const offers=[
    {name:"Продать 16 пшеницы за 1 изумруд",give:["minecraft:emerald",1],take:["minecraft:wheat",16]},
    {name:"Продать 8 железных слитков за 2 изумруда",give:["minecraft:emerald",2],take:["minecraft:iron_ingot",8]},
    {name:"Купить 8 хлеба за 2 изумруда",give:["minecraft:bread",8],take:["minecraft:emerald",2]}
  ];
  const f=new ActionFormData().title("§aТорговля").body("§7Обмен по фиксированным ценам. Используется обычный инвентарь.");
  for(const offer of offers)f.button(offer.name);
  f.button("§7Назад");
  form(player,f,i=>{
    if(i===offers.length)return back();
    const o=offers[i],inv=inventory(player);
    if(o&&inv){
      if(count(inv,o.take[0])<o.take[1])player.sendMessage("§cНедостаточно предметов.");
      else{take(inv,...o.take);give(player,...o.give);earn(player,"merchant",4);earn(player,"trader",2);}
    }
    system.run(()=>market(player,back));
  });
}
function jobMenu(player,back){
  const f=new ActionFormData().title("§eПрофессии").body("§7Все направления доступны одновременно. Уровни повышаются практикой и производством.");
  for(const [id,name] of JOBS)f.button(name+" §7ур. "+level(player,id)+" · XP "+progress(player,id));
  f.button("§7Назад");
  form(player,f,i=>{if(i===JOBS.length)return back();const job=JOBS[i];if(job){player.sendMessage("§6[ZERO] §e"+job[1]+": уровень "+level(player,job[0])+"/50");system.run(()=>jobMenu(player,back));}});
}
export function showProfessions(player,back){
  const f=new ActionFormData().title("§6Профессии и мастерские")
    .body("§fНаправлений: §e"+JOBS.length+"\n§fМастерская: "+(ownsWorkshop(player)?"§aОткрыта":"§cНе открыта")+
      "\n§7Осваивай профессии действиями, производи предметы и торгуй.");
  f.button("§eМастерство профессий");
  f.button("§6Производство");
  f.button("§aТорговля");
  f.button(ownsWorkshop(player)?"§7Мастерская открыта":"§bОткрыть мастерскую (16 досок + 4 железа)");
  f.button("§7Назад");
  form(player,f,i=>{
    if(i===0)return jobMenu(player,()=>showProfessions(player,back));
    if(i===1)return recipes(player,()=>showProfessions(player,back));
    if(i===2)return market(player,()=>showProfessions(player,back));
    if(i===3&&!ownsWorkshop(player)){
      const inv=inventory(player);
      if(inv&&count(inv,"minecraft:oak_planks")>=16&&count(inv,"minecraft:iron_ingot")>=4){
        take(inv,"minecraft:oak_planks",16);take(inv,"minecraft:iron_ingot",4);
        player.setDynamicProperty(workshopKey(player),true);
        earn(player,"builder",8);player.sendMessage("§aМастерская открыта!");
      }else player.sendMessage("§cНужно 16 дубовых досок и 4 железных слитка.");
    }
    if(i!==4)system.run(()=>showProfessions(player,back));
    else back();
  });
}
