import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

// Hybrid world: opt-in starter outpost and bounded discoveries in normal terrain.
// Uses only vanilla blocks; no custom terrain generator or imported world required.
const KEY="zrpg:world_sites_v1";
const START_KEY="zrpg:starter_location_v1";
const TYPES=[
 {id:"ruins",name:"Забытые руины",floor:"minecraft:mossy_cobblestone",wall:"minecraft:stone_bricks"},
 {id:"crypt",name:"Древний склеп",floor:"minecraft:deepslate_bricks",wall:"minecraft:cracked_deepslate_bricks"},
 {id:"camp",name:"Заброшенный лагерь",floor:"minecraft:coarse_dirt",wall:"minecraft:oak_planks"}
];
function load() {
  try {const raw=world.getDynamicProperty(KEY);const value=raw?JSON.parse(raw):[];return Array.isArray(value)?value:[];}
  catch(_){return [];}
}
function save(sites) {world.setDynamicProperty(KEY,JSON.stringify(sites.slice(-100)));}
function block(dim,x,y,z){try{return dim.getBlock({x:Math.floor(x),y:Math.floor(y),z:Math.floor(z)});}catch(_){return undefined;}}
function empty(b){return b?.typeId==="minecraft:air";}
function solid(b){return !!b&&!empty(b)&&b.typeId!=="minecraft:water"&&b.typeId!=="minecraft:lava";}
function ground(dim,x,z,y) {
  for(let h=Math.floor(y)+10;h>=Math.floor(y)-12;h--){
    if(solid(block(dim,x,h-1,z))&&empty(block(dim,x,h,z))&&empty(block(dim,x,h+1,z)))return h;
  }
  return null;
}
function footprint(dim,x,y,z,r) {
  for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
    if(!empty(block(dim,x+dx,y,z+dz))||!empty(block(dim,x+dx,y+1,z+dz)))return false;
    if(!solid(block(dim,x+dx,y-1,z+dz)))return false;
  }
  return true;
}
function build(dim,x,y,z,type) {
  // Preflight every target: never overwrite a player's structures.
  const r=type==="starter"?5:3;
  if(!footprint(dim,x,y,z,r))return false;
  const changes=[];
  for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
    changes.push([x+dx,y-1,z+dz,type==="starter"?"minecraft:stone_bricks":type.floor]);
    if(Math.abs(dx)===r||Math.abs(dz)===r){
      if(type==="starter"){
        if(!(dx===0&&dz===-r))changes.push([x+dx,y,z+dz,"minecraft:oak_fence"]);
      } else if((dx+dz)%3!==0)changes.push([x+dx,y,z+dz,type.wall]);
    }
  }
  if(type==="starter")changes.push([x,y,z,"minecraft:torch"]);
  // Each blueprint is small; every placement is bounded to a prechecked area.
  for(const [bx,by,bz,id] of changes)block(dim,bx,by,bz)?.setType(id);
  return true;
}
function regionKey(dim,x,z){return dim.id+":"+Math.floor(x/256)+":"+Math.floor(z/256);}
function distance2(a,b){return (a.x-b.x)**2+(a.z-b.z)**2;}
function discover(player) {
  const dim=player.dimension,p=player.location;
  const sites=load(),key=regionKey(dim,p.x,p.z);
  if(sites.some(s=>s.region===key))return "§eВ этом регионе уже обнаружена структура.";
  if(sites.length>=100)return "§cЛимит сохранённых структур достигнут.";
  for(let attempt=0;attempt<10;attempt++){
    const angle=Math.random()*Math.PI*2;
    const distance=45+Math.random()*40;
    const x=Math.floor(p.x+Math.cos(angle)*distance);
    const z=Math.floor(p.z+Math.sin(angle)*distance);
    if(distance2({x,z},p)<40*40)continue;
    const y=ground(dim,x,z,p.y);
    if(y===null)continue;
    const type=TYPES[Math.floor(Math.random()*TYPES.length)];
    try {
      if(!build(dim,x,y,z,type))continue;
      sites.push({region:key,dim:dim.id,x,y,z,type:type.id,name:type.name});
      save(sites);
      return "§aОбнаружено: "+type.name+" §7("+x+", "+y+", "+z+")";
    }catch(error){console.warn("[ZERO WORLD SITE] "+error);}
  }
  return "§eНе нашлось подходящего ровного участка. Попробуй в другом месте.";
}
function starter(player) {
  if(world.getDynamicProperty(START_KEY))return "§eСтартовая область уже создана.";
  const p=player.location,dim=player.dimension;
  for(let radius=14;radius<=28;radius+=7){
    const x=Math.floor(p.x+radius),z=Math.floor(p.z);
    const y=ground(dim,x,z,p.y);
    if(y===null)continue;
    try {
      if(!build(dim,x,y,z,"starter"))continue;
      world.setDynamicProperty(START_KEY,JSON.stringify({dim:dim.id,x,y,z}));
      return "§aСтартовый форпост создан: §f"+x+", "+y+", "+z;
    }catch(error){console.warn("[ZERO WORLD START] "+error);}
  }
  return "§eНужна ровная свободная площадка поблизости.";
}
function show(player,form,handler){
  form.show(player).then(r=>{if(!r.canceled)handler(r.selection);})
    .catch(error=>console.warn("[ZERO WORLD UI] "+error));
}
export function showWorld(player,back) {
  const sites=load();
  const near=sites.filter(s=>s.dim===player.dimension.id&&distance2(s,player.location)<1024*1024).slice(-5);
  const start=world.getDynamicProperty(START_KEY);
  const form=new ActionFormData().title("§2Мир ZERO")
    .body("§7Гибридный мир: стандартная генерация Minecraft и дополнительные RPG-локации.\n"+
      "§fСтартовая область: "+(start?"§aСоздана":"§eНе создана")+
      "\n§fОбнаруженных структур: §e"+sites.length+
      "\n\n§7Ближайшие открытия:\n"+(near.map(s=>s.name+": "+s.x+", "+s.y+", "+s.z).join("\n")||"Пока нет")+
      "\n\n§8Изменение блоков запускается только по команде игрока.");
  form.button("§aСоздать стартовый форпост");
  form.button("§6Найти и создать RPG-структуру");
  form.button("§7Назад");
  show(player,form,index=>{
    if(index===2)return back();
    const result=index===0?starter(player):discover(player);
    player.sendMessage("§6[ZERO Мир] §r"+result);
    system.run(()=>showWorld(player,back));
  });
}
