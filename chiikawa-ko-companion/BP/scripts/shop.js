import { world, K, getJson, setJson, allPets, isTamed, ownerId, petName, say, speak, countItem, removeItem, giveItem, findPlayer, itemName, heal, ownedPets } from "./util.js";
import { ActionFormData } from "@minecraft/server-ui";

const BUY = [
  { id: "minecraft:cookie", n: 4, price: 1 },
  { id: "minecraft:bread", n: 2, price: 1 },
  { id: "minecraft:pumpkin_pie", n: 1, price: 1 },
  { id: "minecraft:cooked_salmon", n: 2, price: 1 },
  { id: "minecraft:cooked_beef", n: 2, price: 2 },
  { id: "minecraft:honey_bottle", n: 1, price: 2 },
  { id: "chiikawa:simple_dish", n: 1, price: 2 },
  { id: "chiikawa:whistle_candy", n: 1, price: 3 },
];
const SELL = [
  { id: "minecraft:wheat", n: 8, price: 1 },
  { id: "minecraft:carrot", n: 8, price: 1 },
  { id: "minecraft:potato", n: 8, price: 1 },
  { id: "minecraft:beetroot", n: 8, price: 1 },
];
/** what each pet likes to buy when shopping on its own */
const LIKES = {
  "popularbiology:jiyi": ["minecraft:cookie", "minecraft:pumpkin_pie"],
  "popularbiology:xiaoba": ["minecraft:bread", "minecraft:cooked_salmon"],
  "popularbiology:wusaqi": ["minecraft:cooked_beef", "minecraft:pumpkin_pie"],
  "popularbiology:laishi": ["minecraft:cooked_salmon", "minecraft:cooked_beef"],
  "popularbiology:shisa": ["minecraft:honey_bottle", "minecraft:bread"],
  "popularbiology:lizimantou": ["minecraft:cookie", "minecraft:bread"],
  "popularbiology:feishu": ["minecraft:honey_bottle", "minecraft:cookie"],
};
const SHOP_RANGE = 24;
const SHOP_COOLDOWN = 20 * 60 * 3;

// ---- shop block registry (pets look for the nearest registered shop) ----
const shopKey = (block) => `${block.dimension.id}|${block.location.x},${block.location.y},${block.location.z}`;
const loadShops = () => getJson(world, "ck:shops") ?? [];

world.afterEvents.playerPlaceBlock.subscribe((ev) => {
  if (ev.block.typeId !== "chiikawa:shop") return;
  const list = loadShops();
  const k = shopKey(ev.block);
  if (!list.includes(k)) list.push(k);
  setJson(world, "ck:shops", list);
});
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  if (ev.brokenBlockPermutation.type.id !== "chiikawa:shop") return;
  setJson(world, "ck:shops", loadShops().filter((k) => k !== shopKey(ev.block)));
});

function shopNear(pet) {
  for (const k of loadShops()) {
    const [dim, xyz] = k.split("|");
    if (dim !== pet.dimension.id) continue;
    const [x, y, z] = xyz.split(",").map(Number);
    const dx = x - pet.location.x, dy = y - pet.location.y, dz = z - pet.location.z;
    if (dx * dx + dy * dy + dz * dz <= SHOP_RANGE * SHOP_RANGE) return true;
  }
  return false;
}

// ---- player counter ----
export function openShop(player) {
  const form = new ActionFormData().title("상점").body(`보유: 에메랄드 × ${countItem(player, "minecraft:emerald")}`);
  for (const g of BUY) form.button(`${itemName(g.id)} × ${g.n} 구매\n§8에메랄드 ${g.price}개`);
  for (const g of SELL) form.button(`${itemName(g.id)} × ${g.n} 판매\n§8에메랄드 ${g.price}개 받음`);
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection < BUY.length) {
      const g = BUY[res.selection];
      if (!removeItem(player, "minecraft:emerald", g.price)) return say(player, "§c에메랄드가 부족합니다");
      giveItem(player, g.id, g.n);
      say(player, `§a${itemName(g.id)} × ${g.n}을(를) 구매했습니다`);
    } else {
      const g = SELL[res.selection - BUY.length];
      if (!removeItem(player, g.id, g.n)) return say(player, `§c${itemName(g.id)}이(가) ${g.n}개 필요합니다`);
      giveItem(player, "minecraft:emerald", g.price);
      say(player, `§a${itemName(g.id)} × ${g.n}을(를) 팔고 에메랄드 ${g.price}개를 받았습니다`);
    }
    openShop(player);
  }).catch(() => {});
}

// ---- pets shopping and delivering gifts (called every 5 s) ----
export function tickPets() {
  const now = world.getAbsoluteTime();
  for (const pet of allPets()) {
    if (!isTamed(pet) || !ownerId(pet)) continue;
    const owner = findPlayer(ownerId(pet));

    // deliver a gift when the owner is close
    const gift = getJson(pet, K.gift);
    if (gift && owner && owner.dimension.id === pet.dimension.id) {
      const d = Math.hypot(owner.location.x - pet.location.x, owner.location.z - pet.location.z);
      if (d < 5) {
        giveItem(owner, gift.id, gift.amount);
        setJson(pet, K.gift, undefined);
        say(owner, `§d${petName(pet)}이(가) ${itemName(gift.id)}을(를) 주었습니다`);
        speak(pet, "gift");
      }
      continue;
    }

    // go shopping with the pocket money in the bag
    if (gift || (pet.getDynamicProperty(K.shopNext) ?? 0) > now || !shopNear(pet)) continue;
    const inv = pet.getComponent("minecraft:inventory")?.container;
    const likes = LIKES[pet.typeId];
    if (!inv || !likes) continue;
    let slot = -1;
    for (let i = 0; i < inv.size; i++) {
      const s = inv.getItem(i);
      if (s && s.typeId === "minecraft:emerald") { slot = i; break; }
    }
    if (slot < 0) continue;
    pet.setDynamicProperty(K.shopNext, now + SHOP_COOLDOWN);
    if (Math.random() < 0.4) continue;

    const s = inv.getItem(slot);
    s.amount > 1 ? ((s.amount -= 1), inv.setItem(slot, s)) : inv.setItem(slot, undefined);
    const id = likes[Math.floor(Math.random() * likes.length)];
    speak(pet, "shop");
    if (Math.random() < 0.3) {
      setJson(pet, K.gift, { id, amount: 2 });
      if (owner) say(owner, `§d${petName(pet)}이(가) 상점에서 에메랄드 × 1을(를) 사용했고, 당신을 위한 선물이라고 합니다`);
    } else {
      heal(pet, 6);
      pet.addEffect("regeneration", 100, { showParticles: true });
      if (owner) say(owner, `§7${petName(pet)}이(가) 상점에서 ${itemName(id)} × 1을(를) 사서 그 자리에서 먹었습니다`);
    }
  }
}
