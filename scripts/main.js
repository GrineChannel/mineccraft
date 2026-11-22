import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const BOOK_TYPE = "minecraft:carrot_on_a_stick";
const BOOK_NAME = "§6§lКнига ZERO";
const STATS = { strength: "Сила", agility: "Ловкость", endurance: "Выносливость", intelligence: "Интеллект", luck: "Удача" };

function getValue(player, key, fallback = 0) {
  const value = player.getDynamicProperty("zrpg:" + key);
  return typeof value === "number" ? value : fallback;
}
function setValue(player, key, value) { player.setDynamicProperty("zrpg:" + key, value); }
function xpRequired(level) { return 100 + (level - 1) * 50; }
function initializePlayer(player) {
  if (player.getDynamicProperty("zrpg:created") === true) return;
  player.setDynamicProperty("zrpg:created", true);
  setValue(player, "level", 1);
  setValue(player, "xp", 0);
  setValue(player, "points", 0);
  for (const key of Object.keys(STATS)) setValue(player, key, 1);
  player.sendMessage("§6[ZERO] §aПерсонаж создан!");
}
function giveZeroBook(player) {
  const component = player.getComponent("minecraft:inventory");
  if (!component || !component.container) return;
  const inventory = component.container;
  for (let i = 0; i < inventory.size; i++) {
    const item = inventory.getItem(i);
    if (item && item.typeId === BOOK_TYPE && item.nameTag === BOOK_NAME) return;
  }
  const book = new ItemStack(BOOK_TYPE, 1);
  book.nameTag = BOOK_NAME;
  book.setLore(["§7Личный интерфейс персонажа", "§8Нажми, чтобы открыть ZERO"]);
  const leftover = inventory.addItem(book);
  if (leftover) player.sendMessage("§cОсвободи место для Книги ZERO!");
  else player.sendMessage("§6[ZERO] §eТы получил Книгу ZERO!");
}
function showForm(player, form, callback) {
  form.show(player).then(response => {
    if (!response.canceled) callback(response.selection);
  }).catch(error => {
    console.warn("[ZERO UI ERROR] " + error);
    player.sendMessage("§cНе удалось открыть меню ZERO.");
  });
}
function openMainMenu(player) {
  const level = getValue(player, "level", 1);
  const xp = getValue(player, "xp", 0);
  const form = new ActionFormData();
  form.title("§6§lZERO: RPG");
  form.body("§7Добро пожаловать в ZERO.\n\n§fУровень: §e" + level +
    "\n§fОпыт: §a" + xp + " / " + xpRequired(level) + "\n\n§6Выбери нужный раздел:");
  for (const label of ["§eПрофиль персонажа", "§cХарактеристики", "§6Инвентарь", "§bНавыки", "§dКлассы", "§aЗадания", "§7Закрыть"]) form.button(label);
  showForm(player, form, selection => {
    switch (selection) {
      case 0: openProfile(player); break;
      case 1: openStats(player); break;
      case 2: openComingSoon(player, "Инвентарь"); break;
      case 3: openComingSoon(player, "Навыки"); break;
      case 4: openComingSoon(player, "Классы"); break;
      case 5: openComingSoon(player, "Задания"); break;
    }
  });
}
function openProfile(player) {
  const level = getValue(player, "level", 1);
  const form = new ActionFormData();
  form.title("§6Профиль персонажа");
  form.body("§fУровень: §e" + level + "\n§fОпыт: §a" + getValue(player, "xp") +
    " / " + xpRequired(level) + "\n§fСвободные очки: §b" + getValue(player, "points") +
    "\n\n§6Характеристики:\n" + Object.entries(STATS).map(([key, name]) =>
      "§f" + name + ": §e" + getValue(player, key, 1)).join("\n"));
  form.button("§7Назад");
  showForm(player, form, () => openMainMenu(player));
}
function openStats(player) {
  const form = new ActionFormData();
  form.title("§cХарактеристики");
  form.body("§fСвободные очки: §b" + getValue(player, "points") +
    "\n\n§7Выбери характеристику для улучшения.\n§8Стоимость: 1 очко.");
  for (const [key, name] of Object.entries(STATS))
    form.button("§e" + name + "\n§7Текущее значение: " + getValue(player, key, 1));
  form.button("§7Назад");
  showForm(player, form, selection => {
    const keys = Object.keys(STATS);
    if (selection === keys.length) return openMainMenu(player);
    const key = keys[selection];
    if (!key) return;
    const points = getValue(player, "points");
    if (points < 1) player.sendMessage("§cНедостаточно свободных очков!");
    else {
      setValue(player, key, getValue(player, key, 1) + 1);
      setValue(player, "points", points - 1);
      player.sendMessage("§a" + STATS[key] + " улучшена!");
    }
    system.run(() => openStats(player));
  });
}
function openComingSoon(player, section) {
  const form = new ActionFormData();
  form.title("§6" + section);
  form.body("§7Раздел «" + section + "» пока находится в разработке.");
  form.button("§7Назад");
  showForm(player, form, () => openMainMenu(player));
}
world.afterEvents.playerSpawn.subscribe(event => {
  system.run(() => {
    initializePlayer(event.player);
    giveZeroBook(event.player);
  });
});
world.afterEvents.itemUse.subscribe(event => {
  if (event.itemStack.typeId !== BOOK_TYPE || event.itemStack.nameTag !== BOOK_NAME) return;
  system.run(() => openMainMenu(event.source));
});
console.warn("[ZERO RPG] Version 0.3.0 loaded");
