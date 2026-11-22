import { world, system, EquipmentSlot } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const RARITIES = [
  { name:"Обычный", color:"§f", weight:48, bonus:1 },
  { name:"Необычный", color:"§a", weight:28, bonus:2 },
  { name:"Редкий", color:"§9", weight:14, bonus:3 },
  { name:"Эпический", color:"§5", weight:7, bonus:4 },
  { name:"Легендарный", color:"§6", weight:2.5, bonus:5 },
  { name:"Мифический", color:"§d", weight:0.5, bonus:7 }
];
const SETS = [
  { id:"guardian", name:"Страж", keyword:"iron", effect:"resistance" },
  { id:"shadow", name:"Тень", keyword:"leather", effect:"speed" },
  { id:"royal", name:"Корона", keyword:"diamond", effect:"strength" }
];
const STATS = ["Сила","Ловкость","Выносливость","Интеллект","Удача"];
const META = "§8ZERO-GEAR:";
const MAX_UPGRADE = 10;
function chooseRarity() {
  let roll=Math.random()*100;
  for(let i=0;i<RARITIES.length;i++) {
    roll-=RARITIES[i].weight;
    if(roll<0)return i;
  }
  return 0;
}
function read(item) {
  if(!item)return null;
  const lore=item.getLore();
  const line=lore.find(v=>v.startsWith(META));
  if(!line)return null;
  try {
    const data=JSON.parse(line.slice(META.length));
    if(!Number.isInteger(data.r)||data.r<0||data.r>=RARITIES.length ||
      !Number.isInteger(data.lv)||data.lv<1||data.lv>100 ||
      !Number.isInteger(data.up)||data.up<0||data.up>MAX_UPGRADE ||
      !Number.isInteger(data.stat)||data.stat<0||data.stat>=STATS.length ||
      !Number.isInteger(data.roll)||data.roll<1||data.roll>10)return null;
    return data;
  } catch(_){return null;}
}
function write(item,data) {
  const rarity=RARITIES[data.r];
  const lore=item.getLore().filter(line=>!line.startsWith(META)&&!line.startsWith("§7ZERO "));
  lore.push("§7ZERO "+rarity.color+rarity.name+" §7· Ур. "+data.lv+" · +"+data.up);
  lore.push("§7ZERO "+STATS[data.stat]+": §a+"+(data.roll+data.up));
  lore.push(META+JSON.stringify(data));
  item.setLore(lore);
}
function eligible(item) {
  if(!item)return false;
  const id=item.typeId;
  return /_(sword|axe|pickaxe|shovel|hoe|helmet|chestplate|leggings|boots)$/.test(id) ||
    id==="minecraft:bow" || id==="minecraft:crossbow" || id==="minecraft:trident";
}
function selected(player) {
  const inv=player.getComponent("minecraft:inventory")?.container;
  if(!inv)return null;
  const slot=player.selectedSlotIndex;
  return {inv,slot,item:inv.getItem(slot)};
}
function notify(player,msg){player.sendMessage("§6[ZERO Экипировка] §r"+msg);}
function show(player,form,callback){
  form.show(player).then(result=>{if(!result.canceled)callback(result.selection);})
    .catch(error=>console.warn("[ZERO GEAR UI] "+error));
}
function inspect(player,back) {
  const held=selected(player);
  const data=read(held?.item);
  const body=!held?.item?"§7Возьми оружие или инструмент в руку.":
    !data?"§7Предмет не имеет RPG-свойств. Открой раздел «Пробудить предмет».":"§f"+held.item.typeId+
      "\n§fРедкость: "+RARITIES[data.r].color+RARITIES[data.r].name+
      "\n§fУровень: §e"+data.lv+
      "\n§fУлучшение: §e+"+data.up+
      "\n§f"+STATS[data.stat]+": §a+"+(data.roll+data.up);
  const form=new ActionFormData().title("§6Свойства предмета").body(body);
  form.button("§7Назад");show(player,form,back);
}
function awaken(player) {
  const held=selected(player);
  if(!held?.item||!eligible(held.item)){notify(player,"§cВозьми подходящее оружие, инструмент или броню в руку.");return;}
  if(read(held.item)){notify(player,"§eПредмет уже пробуждён.");return;}
  const level=Math.max(1,Math.min(100,player.getDynamicProperty("zrpg:level")||1));
  const r=chooseRarity();
  const data={r,lv:level,up:0,stat:Math.floor(Math.random()*STATS.length),roll:RARITIES[r].bonus+Math.floor(Math.random()*3)};
  try {
    write(held.item,data);
    held.inv.setItem(held.slot,held.item);
    notify(player,"§aПробуждён предмет: "+RARITIES[r].color+RARITIES[r].name);
  }catch(error){console.warn("[ZERO GEAR AWAKEN] "+error);notify(player,"§cНе удалось изменить предмет.");}
}
function emeraldCount(inv) {
  let count=0;
  for(let i=0;i<inv.size;i++) {
    const item=inv.getItem(i);
    if(item?.typeId==="minecraft:emerald")count+=item.amount;
  }
  return count;
}
function consumeEmeralds(inv,amount) {
  if(emeraldCount(inv)<amount)return false;
  for(let i=0;i<inv.size&&amount>0;i++) {
    const item=inv.getItem(i);
    if(item?.typeId!=="minecraft:emerald")continue;
    const take=Math.min(amount,item.amount);
    if(take===item.amount)inv.setItem(i,undefined);
    else {item.amount-=take;inv.setItem(i,item);}
    amount-=take;
  }
  return amount===0;
}
function upgrade(player) {
  const held=selected(player);
  const data=read(held?.item);
  if(!data){notify(player,"§cСначала пробуди предмет.");return;}
  if(data.up>=MAX_UPGRADE){notify(player,"§eМаксимальное улучшение +10.");return;}
  const price=(data.up+1)*3;
  if(emeraldCount(held.inv)<price){notify(player,"§cНужно "+price+" изумрудов.");return;}
  try {
    const updated={...data,up:data.up+1};
    write(held.item,updated);
    if(!consumeEmeralds(held.inv,price))return;
    held.inv.setItem(held.slot,held.item);
    notify(player,"§aПредмет улучшен до +"+updated.up+". Потрачено "+price+" изумрудов.");
  }catch(error){console.warn("[ZERO GEAR UPGRADE] "+error);notify(player,"§cОшибка улучшения.");}
}
function armorItems(player) {
  const equip=player.getComponent("minecraft:equippable");
  if(!equip)return [];
  const result=[];
  for(const slot of [EquipmentSlot.Head,EquipmentSlot.Chest,EquipmentSlot.Legs,EquipmentSlot.Feet]) {
    const item=equip.getEquipment(slot);
    if(item)result.push(item);
  }
  return result;
}
function activeSet(player) {
  const armor=armorItems(player);
  if(armor.length<4)return null;
  for(const set of SETS) {
    if(armor.every(item=>item.typeId.includes(set.keyword)&&read(item)))return set;
  }
  return null;
}
function showSets(player,back) {
  const active=activeSet(player);
  const form=new ActionFormData().title("§bКомплекты ZERO").body(
    "§7Нужны 4 пробуждённые части брони одного материала.\n\n"+
    SETS.map(s=>"§f"+s.name+" §7("+s.keyword+"): "+s.effect).join("\n")+
    "\n\n§fАктивный комплект: §e"+(active?.name||"Нет"));
  form.button("§7Назад");show(player,form,back);
}
export function showEquipment(player,back) {
  const form=new ActionFormData().title("§6Экипировка ZERO")
    .body("§7Редкость, уровни предметов, случайные бонусы, улучшения и комплекты.\n"+
      "§7Для действий возьми предмет в основную руку.");
  form.button("§eСвойства предмета");
  form.button("§dПробудить предмет");
  form.button("§aУлучшить предмет (изумруды)");
  form.button("§bКомплекты брони");
  form.button("§7Назад");
  show(player,form,index=>{
    if(index===0)return inspect(player,()=>showEquipment(player,back));
    if(index===1)awaken(player);
    if(index===2)upgrade(player);
    if(index===3)return showSets(player,()=>showEquipment(player,back));
    if(index!==4)system.run(()=>showEquipment(player,back));
    else back();
  });
}
// Bonuses from gear affect gameplay through vanilla status effects.
// Four-piece set grants a unique passive effect; weapon traits grant combat buffs.
system.runInterval(()=>{
  for(const player of world.getAllPlayers()) {
    try {
      const set=activeSet(player);
      if(set)player.addEffect(set.effect,120,{amplifier:0,showParticles:false});
      const held=selected(player);
      const data=read(held?.item);
      if(!data)continue;
      const value=data.roll+data.up;
      const effects=["strength","speed","resistance","haste","luck"];
      const effect=effects[data.stat];
      const amplifier=Math.min(2,Math.floor(value/7));
      player.addEffect(effect,120,{amplifier,showParticles:false});
    }catch(error){console.warn("[ZERO GEAR PASSIVE] "+error);}
  }
},80);
