import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const PREFIX = "zrpg:";
const CLASSES = [
  { id: "warrior", name: "Воин", description: "+2 Сила, +2 Выносливость", bonuses: {strength:2,endurance:2}, affinity:"power" },
  { id: "ranger", name: "Следопыт", description: "+3 Ловкость, +1 Удача", bonuses: {agility:3,luck:1}, affinity:"vigor" },
  { id: "mage", name: "Маг", description: "+3 Интеллект, +1 Удача", bonuses: {intelligence:3,luck:1}, affinity:"focus" }
];
const SKILLS = [
  { id: "power", name: "Мощный удар", stat: "strength", description: "+1 к силе" },
  { id: "vigor", name: "Стойкость", stat: "endurance", description: "+1 к выносливости" },
  { id: "focus", name: "Концентрация", stat: "intelligence", description: "+1 к интеллекту" }
];
const QUESTS = [
  { id: "hunter", name: "Первый охотник", target: 5, reward: 60 },
  { id: "veteran", name: "Опытный охотник", target: 25, reward: 250 }
];
function num(player, key, fallback = 0) {
  const value = player.getDynamicProperty(PREFIX + key);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function put(player, key, value) { player.setDynamicProperty(PREFIX + key, value); }
function levelRequirement(level) { return 100 + (level - 1) * 50; }
function notify(player, message) { try { player.sendMessage("§6[ZERO] §r" + message); } catch (_) {} }
export function addExperience(player, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  let level = num(player, "level", 1);
  let xp = num(player, "xp");
  xp += Math.floor(amount);
  while (level < 100 && xp >= levelRequirement(level)) {
    xp -= levelRequirement(level);
    level++;
    put(player, "points", num(player, "points") + 5);
    put(player, "skill_points", num(player, "skill_points") + 1);
    notify(player, "§aНовый уровень: §e" + level + "§a! +5 очков характеристик и +1 очко навыков.");
  }
  if (level >= 100) xp = Math.min(xp, levelRequirement(100));
  put(player, "level", level);
  put(player, "xp", xp);
}
function show(player, form, handler) {
  form.show(player).then(result => {
    if (!result.canceled) handler(result.selection);
  }).catch(error => console.warn("[ZERO RPG UI] " + error));
}
export function showClasses(player, back) {
  const current = player.getDynamicProperty(PREFIX + "class") || "";
  const form = new ActionFormData().title("§dКлассы ZERO")
    .body(current ? "§fТвой класс: §e" + (CLASSES.find(c => c.id === current)?.name || current) :
      "§7Выбери основной класс. Его бонусы постоянны, но все навыки доступны любому классу.");
  for (const item of CLASSES) form.button("§e" + item.name + "\n§7" + item.description);
  form.button("§7Назад");
  show(player, form, selection => {
    if (selection === CLASSES.length) return back();
    const chosen = CLASSES[selection];
    if (!chosen) return;
    if (current) notify(player, "§cКласс уже выбран.");
    else {
      for (const [stat, bonus] of Object.entries(chosen.bonuses)) {
        put(player, stat, num(player, stat, 1) + bonus);
      }
      player.setDynamicProperty(PREFIX + "class", chosen.id);
      notify(player, "§aВыбран класс: " + chosen.name);
    }
    system.run(() => showClasses(player, back));
  });
}
export function showSkills(player, back) {
  const points = num(player, "skill_points");
  const classId = player.getDynamicProperty(PREFIX + "class") || "";
  const affinity = CLASSES.find(c => c.id === classId)?.affinity;
  const form = new ActionFormData().title("§bНавыки ZERO")
    .body("§fОчки навыков: §e" + points + "\n§7Навыки улучшаются до 5 ранга.");
  for (const skill of SKILLS) {
    const rank = num(player, "skill_" + skill.id);
    const maxRank = skill.id === affinity ? 7 : 5;
    form.button("§e" + skill.name + " §7" + rank + "/" + maxRank + "\n" + skill.description);
  }
  form.button("§7Назад");
  show(player, form, selection => {
    if (selection === SKILLS.length) return back();
    const skill = SKILLS[selection];
    if (!skill) return;
    const rank = num(player, "skill_" + skill.id);
    const maxRank = skill.id === affinity ? 7 : 5;
    if (points < 1) notify(player, "§cНедостаточно очков навыков.");
    else if (rank >= maxRank) notify(player, "§eМаксимальный ранг.");
    else {
      put(player, "skill_" + skill.id, rank + 1);
      put(player, "skill_points", points - 1);
      put(player, skill.stat, num(player, skill.stat, 1) + 1);
      notify(player, "§aИзучено: " + skill.name);
    }
    system.run(() => showSkills(player, back));
  });
}
export function showQuests(player, back) {
  const kills = num(player, "kills");
  const form = new ActionFormData().title("§aЗадания ZERO")
    .body("§7Побеждено существ: §e" + kills + "\n§7Награду можно получить один раз.");
  for (const quest of QUESTS) {
    const done = player.getDynamicProperty(PREFIX + "quest_" + quest.id) === true;
    form.button("§e" + quest.name + "\n§7" +
      (done ? "Выполнено" : kills + "/" + quest.target + " · +" + quest.reward + " XP"));
  }
  form.button("§7Назад");
  show(player, form, selection => {
    if (selection === QUESTS.length) return back();
    const quest = QUESTS[selection];
    if (!quest) return;
    if (player.getDynamicProperty(PREFIX + "quest_" + quest.id) === true) notify(player, "§eНаграда уже получена.");
    else if (kills < quest.target) notify(player, "§cУсловие ещё не выполнено.");
    else {
      player.setDynamicProperty(PREFIX + "quest_" + quest.id, true);
      addExperience(player, quest.reward);
      notify(player, "§aЗадание выполнено! +" + quest.reward + " XP");
    }
    system.run(() => showQuests(player, back));
  });
}
export function showProgress(player, back) {
  const level = num(player, "level", 1);
  const form = new ActionFormData().title("§6Прогресс ZERO")
    .body("§fУровень: §e" + level +
      "\n§fОпыт: §a" + num(player, "xp") + "/" + levelRequirement(level) +
      "\n§fПобед: §e" + num(player, "kills") +
      "\n§fОчки характеристик: §e" + num(player, "points") +
      "\n§fОчки навыков: §e" + num(player, "skill_points"));
  form.button("§7Назад");
  show(player, form, back);
}
world.afterEvents.entityDie.subscribe(event => {
  try {
    const killer = event.damageSource?.damagingEntity;
    if (!killer || killer.typeId !== "minecraft:player") return;
    if (event.deadEntity.typeId === "minecraft:player") return;
    const player = killer;
    put(player, "kills", num(player, "kills") + 1);
    addExperience(player, 10);
  } catch (error) { console.warn("[ZERO RPG XP] " + error); }
});
