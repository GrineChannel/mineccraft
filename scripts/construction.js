import { world, system } from "@minecraft/server";

// Opt-in physical construction near active players. Never overwrite non-air blocks.
// Plans and material costs are persistent in the existing town record.
const TYPES=[
 {id:"house",name:"Дом",cost:16,wealth:0},
 {id:"farm",name:"Ферма",cost:12,wealth:0},
 {id:"workshop",name:"Мастерская",cost:22,wealth:5},
 {id:"wall",name:"Оборонительная стена",cost:18,wealth:0},
 {id:"road",name:"Дорога",cost:8,wealth:0}
];
const BLOCKS={house:"minecraft:oak_planks",farm:"minecraft:oak_fence",workshop:"minecraft:cobblestone",wall:"minecraft:stone_bricks",road:"minecraft:gravel"};
function plan(type,x,y,z) {
  const cells=[];
  if(type==="road") {
    for(let i=0;i<9;i++)cells.push({x:x+i,y,z,block:BLOCKS.road});
  } else if(type==="wall") {
    for(let i=0;i<7;i++)for(let h=0;h<3;h++)cells.push({x:x+i,y:y+h,z,block:BLOCKS.wall});
  } else if(type==="farm") {
    for(let dx=0;dx<5;dx++)for(let dz=0;dz<5;dz++)
      if(dx===0||dx===4||dz===0||dz===4)cells.push({x:x+dx,y,z:z+dz,block:BLOCKS.farm});
  } else {
    const block=BLOCKS[type];
    for(let dx=0;dx<5;dx++)for(let dz=0;dz<5;dz++) {
      cells.push({x:x+dx,y:y-1,z:z+dz,block});
      if(dx===0||dx===4||dz===0||dz===4)
        for(let h=0;h<3;h++)if(!(dx===2&&dz===0&&h<2))
          cells.push({x:x+dx,y:y+h,z:z+dz,block});
    }
  }
  return cells;
}
function safeLocation(villager,town) {
  const center=town.center||{x:Math.floor(villager.location.x),y:Math.floor(villager.location.y),z:Math.floor(villager.location.z)};
  const n=town.buildings?.length||0;
  const radius=10+Math.floor(n/8)*8;
  const side=n%4;
  return {x:center.x+(side===0?radius:side===2?-radius:0),
    y:center.y,z:center.z+(side===1?radius:side===3?-radius:0)};
}
function isAir(block) {
  return block&&block.typeId==="minecraft:air";
}
function validArea(dimension,cells) {
  // Avoid changing terrain or player structures. Require empty target cells and
  // a solid supporting block below the first floor.
  for(const cell of cells) {
    const block=dimension.getBlock({x:cell.x,y:cell.y,z:cell.z});
    if(!isAir(block))return false;
  }
  return true;
}
function activeNear(dimension,point) {
  return world.getAllPlayers().some(p=>{
    if(p.dimension.id!==dimension.id)return false;
    const dx=p.location.x-point.x,dz=p.location.z-point.z;
    return dx*dx+dz*dz<64*64;
  });
}
export function toggleConstruction(town) {
  town.constructionEnabled=!town.constructionEnabled;
  return town.constructionEnabled;
}
export function constructionStatus(town) {
  return "§fСтроительство: "+(town.constructionEnabled?"§aВключено":"§cВыключено")+
    "\n§fПостроек: §e"+(town.buildings?.length||0)+
    "\n§fРесурсы: §e"+town.materials+
    "\n§7Здания строятся только в загруженных областях рядом с игроком.";
}
export function advanceConstruction(town,villager) {
  if(!town.constructionEnabled)return;
  if(!Array.isArray(town.buildings))town.buildings=[];
  if(town.buildings.length>=40)return;
  const dim=villager.dimension;
  const position=safeLocation(villager,town);
  if(!activeNear(dim,position))return;
  const next=TYPES[town.buildings.length%TYPES.length];
  if(town.materials<next.cost||town.wealth<next.wealth)return;
  const cells=plan(next.id,position.x,position.y,position.z);
  try {
    if(!validArea(dim,cells))return;
    // Limit each cycle to one small blueprint; preserve all existing blocks.
    for(const cell of cells) {
      const block=dim.getBlock({x:cell.x,y:cell.y,z:cell.z});
      if(isAir(block))block.setType(cell.block);
    }
    town.materials-=next.cost;
    town.wealth-=next.wealth;
    town.buildings.push({type:next.id,x:position.x,y:position.y,z:position.z});
    town.security=Math.min(100,town.security+(next.id==="wall"?5:0));
    if(next.id==="farm")town.food+=8;
    if(next.id==="workshop")town.materials+=3;
  }catch(error){console.warn("[ZERO BUILD] "+error);}
}
export function repairConstruction(town,villager) {
  if(!town.constructionEnabled||!Array.isArray(town.buildings)||town.materials<2)return;
  const dim=villager.dimension;
  for(const building of town.buildings.slice(0,20)) {
    const cells=plan(building.type,building.x,building.y,building.z);
    if(!activeNear(dim,building))continue;
    try {
      for(const cell of cells) {
        const block=dim.getBlock({x:cell.x,y:cell.y,z:cell.z});
        if(isAir(block)) {
          block.setType(cell.block);
          town.materials-=2;
          return;
        }
      }
    }catch(error){console.warn("[ZERO REPAIR] "+error);}
  }
}
