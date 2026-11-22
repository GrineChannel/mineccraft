import { world, system } from "@minecraft/server";

// Practice XP is separate from character-level XP and manually spent stat points.
// Counters persist per player. All progress is server-side and rate-limited.
const P = "zrpg:";
const RULES = {
  strength: { threshold: 30, cap: 30, name: "Сила" },
  agility: { threshold: 45, cap: 30, name: "Ловкость" },
  endurance: { threshold: 60, cap: 30, name: "Выносливость" },
  intelligence: { threshold: 25, cap: 30, name: "Интеллект" },
  luck: { threshold: 40, cap: 30, name: "Удача" }
};
function number(player, key, fallback = 0) {
  const value = player.getDynamicProperty(P + key);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function set(player, key, value) { player.setDynamicProperty(P + key, value); }
function practice(player, stat, amount = 1) {
  const rule = RULES[stat];
  if (!rule || !Number.isInteger(amount) || amount < 1) return;
  const gained = number(player, "practice_levels_" + stat);
  if (gained >= rule.cap) return;
  const progress = number(player, "practice_xp_" + stat) + amount;
  if (progress >= rule.threshold) {
    set(player, "practice_xp_" + stat, progress - rule.threshold);
    set(player, "practice_levels_" + stat, gained + 1);
    set(player, stat, number(player, stat, 1) + 1);
    player.sendMessage("§6[ZERO] §a" + rule.name + " выросла от практики! §e+1");
  } else set(player, "practice_xp_" + stat, progress);
}
const last = new Map();
function throttled(player, kind, ticks, action) {
  const key = player.id + ":" + kind;
  const now = system.currentTick;
  if (now - (last.get(key) ?? -ticks) < ticks) return;
  last.set(key, now);
  action();
}
world.afterEvents.entityHurt.subscribe(event => {
  try {
    const attacker = event.damageSource?.damagingEntity;
    if (attacker?.typeId === "minecraft:player" && event.hurtEntity.typeId !== "minecraft:player")
      throttled(attacker, "strength", 20, () => practice(attacker, "strength"));
    const victim = event.hurtEntity;
    if (victim.typeId === "minecraft:player" && event.damage > 0)
      throttled(victim, "endurance", 100, () => practice(victim, "endurance"));
  } catch (error) { console.warn("[ZERO PRACTICE HURT] " + error); }
});
world.afterEvents.playerBreakBlock.subscribe(event => {
  try {
    const player = event.player;
    throttled(player, "mining", 40, () => practice(player, "endurance"));
  } catch (error) { console.warn("[ZERO PRACTICE MINING] " + error); }
});
world.afterEvents.itemUse.subscribe(event => {
  try {
    const player = event.source;
    const id = event.itemStack?.typeId || "";
    if (id === "minecraft:carrot_on_a_stick") return;
    if (id.includes("potion") || id.includes("enchant") || id.includes("experience_bottle"))
      throttled(player, "intelligence", 100, () => practice(player, "intelligence"));
  } catch (error) { console.warn("[ZERO PRACTICE ITEM] " + error); }
});
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      const loc = player.location;
      const key = player.id + ":movement";
      const previous = movement.get(key);
      movement.set(key, { x: loc.x, y: loc.y, z: loc.z, tick: system.currentTick });
      if (!previous) continue;
      const dx = loc.x - previous.x;
      const dz = loc.z - previous.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance >= 3 && distance <= 18) practice(player, "agility");
    } catch (error) { console.warn("[ZERO PRACTICE MOVE] " + error); }
  }
}, 100);
const movement = new Map();
world.afterEvents.entityDie.subscribe(event => {
  try {
    const player = event.damageSource?.damagingEntity;
    if (player?.typeId !== "minecraft:player" || event.deadEntity.typeId === "minecraft:player") return;
    throttled(player, "luck", 40, () => practice(player, "luck"));
  } catch (error) { console.warn("[ZERO PRACTICE KILL] " + error); }
});
export function practiceSummary(player) {
  return Object.entries(RULES).map(([stat, rule]) => {
    const level = number(player, "practice_levels_" + stat);
    return rule.name + ": " + level + "/" + rule.cap + " · " +
      number(player, "practice_xp_" + stat) + "/" + rule.threshold;
  }).join("\n");
}
