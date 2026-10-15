import { ItemStack } from "@minecraft/server";
import { world, K, PET_NAMES, today, getJson, setJson, ownedPets, petName, say, speak, removeItem, addToContainer, findPlayer, ownerId, isPet } from "./util.js";
import { ActionFormData } from "@minecraft/server-ui";

const MAX_LEVEL = 5;
const WEEDS = new Set(["minecraft:short_grass", "minecraft:tallgrass", "minecraft:tall_grass", "minecraft:fern", "minecraft:large_fern", "minecraft:double_plant"]);
const TYPE_LABEL = { weeding: "잡초 제거", melee: "몬스터 사냥", ranged: "몬스터 원거리 사냥" };
const LICENCE_BONUS = { 0: 1, 3: 1.25, 2: 1.5, 1: 2 };

const boardKey = (block) => `${block.dimension.id}|${block.location.x},${block.location.y},${block.location.z}`;
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function amountText(slip) {
  return slip.type === "weeding" ? `잡초 ${slip.need}개` : `${slip.need}마리 처치`;
}

function generate(lv) {
  const types = lv >= 2 ? ["weeding", "melee", "ranged"] : ["weeding"];
  const slips = [];
  for (let i = 0; i < lv + 2; i++) {
    const type = types[rand(0, types.length - 1)];
    const hunt = type !== "weeding";
    const need = hunt ? rand(3, 6) : rand(6, 12);
    const reward = [{ id: "minecraft:emerald", n: hunt ? rand(2, 4) : rand(1, 2) }];
    if (hunt) reward.push({ id: "minecraft:iron_ingot", n: rand(1, 3) });
    slips.push({ type, need, reward, state: "open", taker: "" });
  }
  return slips;
}

function load(key) {
  const st = getJson(world, "ck:board:" + key) ?? { lv: 1, day: -1, slips: [] };
  if (st.day !== today()) {
    st.day = today();
    st.slips = generate(st.lv);
  }
  return st;
}

const save = (key, st) => setJson(world, "ck:board:" + key, st);

export function openBoard(player, block) {
  const key = boardKey(block);
  const st = load(key);
  save(key, st);
  const known = boardKeys();
  if (!known.includes(key)) setJson(world, "ck:boards", [...known, key]);
  const stateText = { open: "", taken: " §7(수령 완료)", done: " §a(완료)", failed: " §c(실패)" };
  const form = new ActionFormData()
    .title("노동 게시판")
    .body(`레벨 ${st.lv}${st.lv >= MAX_LEVEL ? " (최대 레벨)" : ""} · 하루 ${st.lv + 2}개\n오늘 ${st.slips.length}개 등록됨`);
  for (const s of st.slips) {
    const rw = s.reward.map((r) => `${r.id.split(":")[1]}×${r.n}`).join(", ");
    form.button(`${TYPE_LABEL[s.type]} - ${amountText(s)}${stateText[s.state]}\n§8보상: ${rw}`);
  }
  const cost = 8 * st.lv;
  if (st.lv < MAX_LEVEL) form.button(`에메랄드 ${cost}개로 업그레이드\n§8레벨 ${st.lv + 1}: 하루 ${st.lv + 3}개` + (st.lv === 1 ? ", 사냥 작업표 추가" : ""));
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === st.slips.length) return upgrade(player, key, cost);
    take(player, key, res.selection);
  }).catch(() => {});
}

function upgrade(player, key, cost) {
  const st = load(key);
  if (st.lv >= MAX_LEVEL) return;
  if (!removeItem(player, "minecraft:emerald", cost)) return say(player, `§c에메랄드가 부족합니다 (필요: ${cost}개)`);
  st.lv++;
  st.slips.push(...generate(st.lv).slice(0, 1));
  save(key, st);
  say(player, `§a노동 게시판이 레벨 ${st.lv}이(가) 되었습니다`);
}

function take(player, key, idx) {
  const st = load(key);
  const slip = st.slips[idx];
  if (!slip || slip.state !== "open") return say(player, "§7이미 처리된 작업표입니다");
  const pets = ownedPets(player, 24).filter((p) => !getJson(p, K.slip));
  if (!pets.length) return say(player, "§7근처에 작업표를 받을 수 있는 내 펫이 없습니다");
  const form = new ActionFormData().title(`${TYPE_LABEL[slip.type]} - ${amountText(slip)}`).body("작업표를 맡길 펫을 선택하세요");
  for (const p of pets) form.button(petName(p));
  form.show(player).then((res) => {
    if (res.canceled) return;
    const pet = pets[res.selection];
    const fresh = load(key);
    const s = fresh.slips[idx];
    if (!pet.isValid || !s || s.state !== "open") return say(player, "§7이미 처리된 작업표입니다");
    s.state = "taken";
    s.taker = pet.id;
    save(key, fresh);
    setJson(pet, K.slip, { board: key, idx, type: s.type, need: s.need, done: 0, reward: s.reward });
    say(player, `§a${petName(pet)}이(가) 작업표를 받았습니다: ${TYPE_LABEL[s.type]} - ${amountText(s)}`);
    speak(pet, s.type === "weeding" ? "idle" : "hunt");
  }).catch(() => {});
}

function setBoardState(slip, state) {
  const st = getJson(world, "ck:board:" + slip.board);
  if (st && st.slips[slip.idx]) {
    st.slips[slip.idx].state = state;
    save(slip.board, st);
  }
}

function complete(pet, slip) {
  const mult = LICENCE_BONUS[pet.getDynamicProperty(K.licence) ?? 0] ?? 1;
  const inv = pet.getComponent("minecraft:inventory")?.container;
  for (const r of slip.reward) {
    const n = Math.max(1, Math.round(r.n * mult));
    if (inv) addToContainer(inv, r.id, n, pet.dimension, pet.location);
    else pet.dimension.spawnItem(new ItemStack(r.id, n), pet.location);
  }
  setBoardState(slip, "done");
  setJson(pet, K.slip, undefined);
  pet.setDynamicProperty(K.practice, (pet.getDynamicProperty(K.practice) ?? 0) + 1);
  const owner = findPlayer(ownerId(pet));
  if (owner) say(owner, `§a${petName(pet)}이(가) ${TYPE_LABEL[slip.type]} 작업을 마쳤습니다. 보상은 펫의 가방에 있습니다`);
  speak(pet, "paid");
}

const HOP = 3; // blocks a pet covers per work tick (2 s) while walking to its job
const SCAN = 10;

function nearestWeed(pet) {
  const b0 = pet.location;
  let best, bd = Infinity;
  for (let dx = -SCAN; dx <= SCAN; dx++) {
    for (let dz = -SCAN; dz <= SCAN; dz++) {
      for (let dy = -2; dy <= 2; dy++) {
        let b;
        try {
          b = pet.dimension.getBlock({ x: Math.floor(b0.x) + dx, y: Math.floor(b0.y) + dy, z: Math.floor(b0.z) + dz });
        } catch {
          continue;
        }
        if (!b || !WEEDS.has(b.typeId)) continue;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd) { bd = d; best = b; }
      }
    }
  }
  return best ? { block: best, dist: Math.sqrt(bd) } : undefined;
}

function hopToward(pet, target, stopAt) {
  const l = pet.location;
  const dx = target.x - l.x, dz = target.z - l.z;
  const d = Math.hypot(dx, dz);
  if (d <= stopAt) return;
  const step = Math.min(HOP, d - stopAt);
  try {
    pet.teleport({ x: l.x + (dx / d) * step, y: l.y, z: l.z + (dz / d) * step }, { facingLocation: { x: target.x, y: l.y, z: target.z } });
  } catch {
    /* blocked / unloaded */
  }
}

function addProgress(pet, slip, n) {
  slip.done = Math.min(slip.need, slip.done + n);
  if (slip.done >= slip.need) complete(pet, slip);
  else setJson(pet, K.slip, slip);
}

function weed(pet, slip) {
  const found = nearestWeed(pet);
  if (!found) return;
  if (found.dist > 2.5) return hopToward(pet, found.block.location, 1.5);
  let cleared = 0;
  const b0 = found.block.location;
  for (let dx = -1; dx <= 1 && cleared < 2; dx++) {
    for (let dz = -1; dz <= 1 && cleared < 2; dz++) {
      for (let dy = -1; dy <= 1 && cleared < 2; dy++) {
        let b;
        try {
          b = pet.dimension.getBlock({ x: b0.x + dx, y: b0.y + dy, z: b0.z + dz });
        } catch {
          continue;
        }
        if (b && WEEDS.has(b.typeId) && slip.done + cleared < slip.need) {
          b.setType("minecraft:air");
          cleared++;
        }
      }
    }
  }
  if (cleared) addProgress(pet, slip, cleared);
}

function hunt(pet, slip) {
  let target;
  try {
    target = pet.dimension.getEntities({ families: ["monster"], location: pet.location, maxDistance: 16, closest: 1 })[0];
  } catch {
    return;
  }
  if (!target) return;
  const d = Math.hypot(target.location.x - pet.location.x, target.location.z - pet.location.z);
  const ranged = slip.type === "ranged";
  const reach = ranged ? 8 : 2.5;
  if (d > reach) return hopToward(pet, target.location, ranged ? 6 : 1.5);
  try {
    target.applyDamage(ranged ? 3 : 4, { cause: "entityAttack", damagingEntity: pet });
  } catch {
    /* target gone */
  }
}

/** pets with a work slip walk to their job and do it (called every 2 s) */
export function tickJobs() {
  for (const owner of world.getAllPlayers()) {
    for (const pet of ownedPets(owner)) {
      const slip = getJson(pet, K.slip);
      if (!slip) continue;
      if (slip.type === "weeding") weed(pet, slip);
      else hunt(pet, slip);
    }
  }
}

function boardKeys() {
  return getJson(world, "ck:boards") ?? [];
}

/** the dead pet may already be invalid, so look its slips up on the boards by entity id */
function failSlipsOf(petId) {
  for (const key of boardKeys()) {
    const st = getJson(world, "ck:board:" + key);
    if (!st) continue;
    let changed = false;
    for (const s of st.slips) {
      if (s.taker === petId && s.state === "taken") {
        s.state = "failed";
        changed = true;
      }
    }
    if (changed) save(key, st);
  }
}

world.afterEvents.entityDie.subscribe((ev) => {
  const dead = ev.deadEntity;
  let deadType;
  try {
    deadType = dead.typeId;
  } catch {
    return;
  }
  if (deadType in PET_NAMES) {
    failSlipsOf(dead.id);
    for (const p of world.getAllPlayers()) say(p, `§c${PET_NAMES[deadType]}이(가) 쓰러져 작업표가 실패했습니다`);
    return;
  }
  const killer = ev.damageSource?.damagingEntity;
  if (!killer || !isPet(killer)) return;
  const slip = getJson(killer, K.slip);
  if (!slip || slip.type === "weeding") return;
  try {
    if (!dead.matches({ families: ["monster"] })) return;
  } catch {
    // dead entity already invalid: still count it, the damage came from the pet
  }
  addProgress(killer, slip, 1);
});
