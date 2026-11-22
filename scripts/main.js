import { showProfessions } from "./professions.js";
import { showStates } from "./states.js";
import { showWorld } from "./worldgen.js";
import { showNPC } from "./npc.js";
import { showEquipment } from "./equipment.js";
import "./death.js";
import { showMagic } from "./magic.js";
import { practiceSummary } from "./practice.js";
import { showClasses, showSkills, showQuests, showProgress } from "./progression.js";
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
  for (const label of ["§eПрофиль персонажа", "§cХарактеристики", "§6Инвентарь", "§bНавыки", "§dСвободное развитие", "§aЗадания", "§dПрогресс", "§5Магия", "§6Экипировка", "§aЖивой мир", "§2Мир и открытия", "§6Государства", "§eПрофессии", "§7Закрыть"]) form.button(label);
  showForm(player, form, selection => {
    switch (selection) {
      case 0: openProfile(player); break;
      case 1: openStats(player); break;
      case 2: openZeroInventory(player); break;
      case 3: showSkills(player, () => openMainMenu(player)); break;
      case 4: showClasses(player, () => openMainMenu(player)); break;
      case 5: showQuests(player, () => openMainMenu(player)); break;
      case 6: showProgress(player, () => openMainMenu(player)); break;
      case 7: showMagic(player, () => openMainMenu(player)); break;
      case 8: showEquipment(player, () => openMainMenu(player)); break;
      case 9: showNPC(player, () => openMainMenu(player)); break;
      case 10: showWorld(player, () => openMainMenu(player)); break;
      case 11: showStates(player, () => openMainMenu(player)); break;
      case 12: showProfessions(player, () => openMainMenu(player)); break;
    }
  });
}
function openProfile(player) {
  const level = getValue(player, "level", 1);
  const form = new ActionFormData();
  form.title("§6Профиль персонажа");
  form.body("§fУровень: §e" + level + "\n§fОпыт: §a" + getValue(player, "xp") +
    " / " + xpRequired(level) + "\n§fСмертей: §e" + getValue(player, "deaths") + "\n§fСвободные очки: §b" + getValue(player, "points") +
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
  form.button("§bПрогресс практики");
  form.button("§7Назад");
  showForm(player, form, selection => {
    const keys = Object.keys(STATS);
    if (selection === keys.length) return openPractice(player);
    if (selection === keys.length + 1) return openMainMenu(player);
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

const STORAGE_KEY = "zrpg:storage_v1";
const STORAGE_SLOTS = 30;

// Stores only ordinary, unmodified item stacks. Custom metadata is deliberately
// rejected so that enchantments, durability and custom names cannot be lost.
function readStorage(player) {
  try {
    const raw = player.getDynamicProperty(STORAGE_KEY);
    if (typeof raw !== "string") return Array(STORAGE_SLOTS).fill(null);
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length !== STORAGE_SLOTS) throw new Error("Invalid storage shape");
    return data.map(entry => {
      if (entry === null) return null;
      if (!entry || typeof entry.id !== "string" || !/^minecraft:[a-z0-9_]+$/.test(entry.id) ||
          !Number.isInteger(entry.count) || entry.count < 1 || entry.count > 64) throw new Error("Invalid item");
      return { id: entry.id, count: entry.count };
    });
  } catch (error) {
    console.warn("[ZERO STORAGE] Invalid saved data: " + error);
    player.sendMessage("§c[ZERO] Ошибка данных хранилища. Запись заблокирована.");
    return null;
  }
}
function writeStorage(player, data) {
  player.setDynamicProperty(STORAGE_KEY, JSON.stringify(data));
}
function simpleItem(item) {
  if (!item || item.nameTag || item.getLore().length > 0) return false;
  if (item.getComponent("minecraft:enchantable") || item.getComponent("minecraft:durability")) return false;
  // Restrict to stackable items to avoid discarding unique item data.
  return item.isStackable && item.maxAmount > 1;
}
function openZeroInventory(player) {
  const slots = readStorage(player);
  if (!slots) return;
  const used = slots.filter(Boolean).length;
  const form = new ActionFormData().title("§6Хранилище ZERO")
    .body("§fЗанято: §e" + used + "/" + STORAGE_SLOTS +
          "\\n§7Пока поддерживаются обычные предметы без чар и прочих свойств.");
  form.button("§aПоложить предмет");
  form.button("§bЗабрать предмет");
  form.button("§eПосмотреть ячейки");
  form.button("§7Назад");
  showForm(player, form, selection => {
    if (selection === 0) openDeposit(player);
    else if (selection === 1) openWithdraw(player);
    else if (selection === 2) openStorageSlots(player);
    else if (selection === 3) openMainMenu(player);
  });
}
function openDeposit(player) {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory) return;
  const options = [];
  const form = new ActionFormData().title("§aПоложить в ZERO")
    .body("§7Выбери стопку из обычного инвентаря.");
  for (let i = 0; i < inventory.size; i++) {
    const item = inventory.getItem(i);
    if (!simpleItem(item) || item.typeId === BOOK_TYPE) continue;
    options.push(i);
    form.button("§f" + item.typeId + " §e×" + item.amount);
  }
  if (!options.length) form.body("§7Нет подходящих обычных предметов.");
  form.button("§7Назад");
  showForm(player, form, selection => {
    if (selection === options.length) return openZeroInventory(player);
    const index = options[selection];
    if (index === undefined) return;
    const item = inventory.getItem(index);
    const slots = readStorage(player);
    if (!slots || !simpleItem(item) || item.typeId === BOOK_TYPE) return;
    const empty = slots.findIndex(x => x === null);
    if (empty < 0) {
      player.sendMessage("§cХранилище ZERO заполнено!");
      return openZeroInventory(player);
    }
    // Save before removing from the inventory; rollback on inventory failure.
    slots[empty] = { id: item.typeId, count: item.amount };
    try {
      writeStorage(player, slots);
      inventory.setItem(index, undefined);
      player.sendMessage("§a[ZERO] Предмет помещён в ячейку " + (empty + 1));
    } catch (error) {
      slots[empty] = null;
      try { writeStorage(player, slots); } catch (_) {}
      player.sendMessage("§c[ZERO] Ошибка переноса. Проверь предметы.");
      console.warn("[ZERO STORAGE] Deposit failed: " + error);
    }
    system.run(() => openZeroInventory(player));
  });
}
function openWithdraw(player) {
  const slots = readStorage(player);
  if (!slots) return;
  const options = [];
  const form = new ActionFormData().title("§bЗабрать из ZERO")
    .body("§7Выбери ячейку для извлечения.");
  slots.forEach((entry, index) => {
    if (!entry) return;
    options.push(index);
    form.button("§f" + (index + 1) + ". " + entry.id + " §e×" + entry.count);
  });
  if (!options.length) form.body("§7Хранилище пусто.");
  form.button("§7Назад");
  showForm(player, form, selection => {
    if (selection === options.length) return openZeroInventory(player);
    const index = options[selection];
    if (index === undefined) return;
    const current = readStorage(player);
    const inventory = player.getComponent("minecraft:inventory")?.container;
    if (!current || !inventory || !current[index]) return;
    const entry = current[index];
    let item;
    try { item = new ItemStack(entry.id, entry.count); }
    catch (error) {
      player.sendMessage("§c[ZERO] Неизвестный предмет. Ячейка сохранена.");
      return;
    }
    // Only withdraw if a complete stack fits in an empty inventory slot.
    let free = false;
    for (let i = 0; i < inventory.size; i++) {
      if (!inventory.getItem(i)) { free = true; break; }
    }
    if (!free) {
      player.sendMessage("§cОсвободи одну ячейку обычного инвентаря!");
      return openZeroInventory(player);
    }
    const leftover = inventory.addItem(item);
    if (leftover) {
      player.sendMessage("§c[ZERO] Предмет не поместился. Проверь инвентарь.");
      return;
    }
    current[index] = null;
    try { writeStorage(player, current); }
    catch (error) {
      // The item was given; keeping storage data prevents silent loss,
      // but the player must be warned about possible duplication.
      player.sendMessage("§c[ZERO] Ошибка сохранения! Не повторяй извлечение.");
      console.warn("[ZERO STORAGE] Withdraw save failed: " + error);
      return;
    }
    player.sendMessage("§a[ZERO] Предмет извлечён из ячейки " + (index + 1));
    system.run(() => openZeroInventory(player));
  });
}
function openStorageSlots(player) {
  const slots = readStorage(player);
  if (!slots) return;
  const form = new ActionFormData().title("§e30 ячеек ZERO")
    .body(slots.map((entry, index) =>
      "§7" + (index + 1) + ". " + (entry ? "§f" + entry.id + " §e×" + entry.count : "§8Пусто")
    ).join("\\n"));
  form.button("§7Назад");
  showForm(player, form, () => openZeroInventory(player));
}

function openPractice(player) {
  const form = new ActionFormData().title("§bРазвитие практикой")
    .body("§7Характеристики растут от действий.\n\n" + practiceSummary(player));
  form.button("§7Назад");
  showForm(player, form, () => openStats(player));
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
console.warn("[ZERO RPG] Version 1.0.0 development build loaded");
