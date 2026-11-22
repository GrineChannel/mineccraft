import { world, system } from "@minecraft/server";

// Vanilla death rules remain untouched. ZERO character data is stored
// in player dynamic properties and is never reset on death or respawn.
world.afterEvents.entityDie.subscribe(event => {
  try {
    const player = event.deadEntity;
    if (player.typeId !== "minecraft:player") return;
    const key = "zrpg:deaths";
    const old = player.getDynamicProperty(key);
    player.setDynamicProperty(key, (typeof old === "number" && Number.isFinite(old) ? old : 0) + 1);
  } catch (error) { console.warn("[ZERO DEATH] " + error); }
});
world.afterEvents.playerSpawn.subscribe(event => {
  if (event.initialSpawn) return;
  system.run(() => {
    try {
      const player = event.player;
      if (player.getDynamicProperty("zrpg:created") !== true) return;
      player.sendMessage("§6[ZERO] §aТы возродился. Уровень, характеристики, навыки и магия сохранены.");
    } catch (error) { console.warn("[ZERO RESPAWN] " + error); }
  });
});
