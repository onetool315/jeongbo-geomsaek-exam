import { world, system, ItemStack } from "@minecraft/server";
import { VOICES } from "./data/voices.js";

export const K = {
  owner: "ck:owner",
  licence: "ck:licence", // 0 = none, 3 -> 2 -> 1 (1 is top)
  practice: "ck:practice",
  failing: "ck:failing",
  book: "ck:book",
  exam: "ck:exam", // JSON {day, rank}
  slip: "ck:slip", // JSON {board, idx, type, need, done, reward}
  gift: "ck:gift", // JSON {id, amount}
  shopNext: "ck:shop_next",
  eager: "ck:eager",
};

export const PET_NAMES = {
  "popularbiology:jiyi": "치이카와",
  "popularbiology:xiaoba": "하치와레",
  "popularbiology:wusaqi": "우사기",
  "popularbiology:laishi": "랏코",
  "popularbiology:shisa": "시사",
  "popularbiology:lizimantou": "쿠리만쥬",
  "popularbiology:feishu": "모몽가",
  "popularbiology:yuguigou": "시나모롤",
  "popularbiology:nailong": "나이룡",
};

const DIMS = ["overworld", "nether", "the_end"];

export function isPet(e) {
  try {
    return e.isValid && e.typeId in PET_NAMES;
  } catch {
    return false;
  }
}

export function isTamed(e) {
  try {
    return e.getComponent("minecraft:is_tamed") !== undefined;
  } catch {
    return false;
  }
}

export function ownerId(e) {
  return e.getDynamicProperty(K.owner);
}

export function petName(e) {
  return e.nameTag || PET_NAMES[e.typeId] || "펫";
}

export function allPets() {
  const out = [];
  for (const id of DIMS) {
    try {
      for (const e of world.getDimension(id).getEntities({ families: ["popularbiology"] })) {
        if (isPet(e)) out.push(e);
      }
    } catch {
      /* dimension not loaded */
    }
  }
  return out;
}

/** pets owned by `player`; with `radius` only those in the same dimension within that range */
export function ownedPets(player, radius) {
  return allPets().filter((p) => {
    if (!isTamed(p) || ownerId(p) !== player.id) return false;
    if (radius === undefined) return true;
    if (p.dimension.id !== player.dimension.id) return false;
    const dx = p.location.x - player.location.x;
    const dy = p.location.y - player.location.y;
    const dz = p.location.z - player.location.z;
    return dx * dx + dy * dy + dz * dz <= radius * radius;
  });
}

export function findPlayer(id) {
  return world.getAllPlayers().find((p) => p.id === id);
}

export function getJson(entityOrWorld, key) {
  const raw = entityOrWorld.getDynamicProperty(key);
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function setJson(entityOrWorld, key, value) {
  entityOrWorld.setDynamicProperty(key, value === undefined ? undefined : JSON.stringify(value));
}

export function today() {
  return Math.floor(world.getAbsoluteTime() / 24000);
}

export function isDaytime() {
  const t = world.getTimeOfDay();
  return t >= 0 && t < 12000;
}

export function countItem(player, typeId) {
  const c = player.getComponent("minecraft:inventory").container;
  let n = 0;
  for (let i = 0; i < c.size; i++) {
    const s = c.getItem(i);
    if (s && s.typeId === typeId) n += s.amount;
  }
  return n;
}

export function removeItem(player, typeId, amount) {
  if (countItem(player, typeId) < amount) return false;
  const c = player.getComponent("minecraft:inventory").container;
  let left = amount;
  for (let i = 0; i < c.size && left > 0; i++) {
    const s = c.getItem(i);
    if (!s || s.typeId !== typeId) continue;
    const take = Math.min(left, s.amount);
    left -= take;
    if (s.amount - take <= 0) c.setItem(i, undefined);
    else {
      s.amount -= take;
      c.setItem(i, s);
    }
  }
  return true;
}

/** add to a container; whatever does not fit is dropped at `dropAt` */
export function addToContainer(container, typeId, amount, dim, dropAt) {
  let left = amount;
  while (left > 0) {
    const n = Math.min(left, 64);
    left -= n;
    const stack = new ItemStack(typeId, n);
    const rest = container.addItem(stack);
    if (rest) dim.spawnItem(rest, dropAt);
  }
}

export function giveItem(player, typeId, amount) {
  addToContainer(player.getComponent("minecraft:inventory").container, typeId, amount, player.dimension, player.location);
}

export function say(player, text) {
  try {
    player.sendMessage(text);
  } catch {
    /* player left */
  }
}

/** chat-style speech line of a pet, shown to players within 16 blocks */
export function speak(pet, event) {
  const lines = VOICES[pet.typeId.split(":")[1]]?.[event];
  if (!lines || !lines.length) return;
  const line = lines[Math.floor(Math.random() * lines.length)];
  try {
    for (const p of pet.dimension.getPlayers({ location: pet.location, maxDistance: 16 })) {
      p.sendMessage(`§e<${petName(pet)}>§r ${line}`);
    }
  } catch {
    /* ignore */
  }
}

export function itemName(typeId) {
  const NAMES = {
    "minecraft:emerald": "에메랄드",
    "minecraft:diamond": "다이아몬드",
    "minecraft:cookie": "쿠키",
    "minecraft:bread": "빵",
    "minecraft:cooked_beef": "스테이크",
    "minecraft:cooked_salmon": "구운 연어",
    "minecraft:pumpkin_pie": "호박 파이",
    "minecraft:honey_bottle": "꿀 병",
    "minecraft:sweet_berries": "달콤한 열매",
    "minecraft:apple": "사과",
    "minecraft:iron_ingot": "철 주괴",
    "minecraft:wheat": "밀",
    "minecraft:carrot": "당근",
    "minecraft:potato": "감자",
    "minecraft:beetroot": "비트",
    "chiikawa:whistle_candy": "호루라기 사탕",
    "chiikawa:simple_dish": "간단한 요리",
    "chiikawa:weeding_book": "잡초 제거 면허 시험 학습 가이드",
  };
  return NAMES[typeId] ?? typeId.split(":")[1];
}

export function heal(pet, amount) {
  try {
    const h = pet.getComponent("minecraft:health");
    h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + amount));
  } catch {
    /* ignore */
  }
}

export { world, system };
