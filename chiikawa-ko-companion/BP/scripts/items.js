import { ItemStack } from "@minecraft/server";
import { world, system, K, isPet, isTamed, ownerId, petName, ownedPets, allPets, say, speak, removeItem } from "./util.js";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import { MANUAL } from "./data/manual.js";

const BELL_COOLDOWN = 30 * 20;
const bellLast = new Map();
const WHISTLE_MODES = ["follow", "free"];
const WHISTLE_LABEL = { follow: "따라오기", free: "자유 행동" };

// ---- ownership: remember who tamed a pet (the Bedrock API exposes no owner) ----
world.afterEvents.dataDrivenEntityTrigger.subscribe((ev) => {
  if (ev.eventId !== "minecraft:on_tame" || !isPet(ev.entity)) return;
  const pet = ev.entity;
  system.run(() => {
    try {
      if (ownerId(pet)) return;
      const near = pet.dimension.getPlayers({ location: pet.location, closest: 1, maxDistance: 16 });
      if (near[0]) pet.setDynamicProperty(K.owner, near[0].id);
    } catch {
      /* pet gone */
    }
  });
});

// ---- interactions with pets: allowance, dish, study book, legacy owner claim ----
world.afterEvents.playerInteractWithEntity.subscribe((ev) => {
  const { player, target: pet, itemStack } = ev;
  if (!isPet(pet) || !isTamed(pet)) return;
  if (!ownerId(pet)) pet.setDynamicProperty(K.owner, player.id); // pets tamed before this pack existed
  if (ownerId(pet) !== player.id || !itemStack) return;

  if (itemStack.typeId === "minecraft:emerald") {
    const inv = pet.getComponent("minecraft:inventory")?.container;
    if (inv && removeItem(player, "minecraft:emerald", 1)) {
      inv.addItem(new ItemStack("minecraft:emerald", 1));
      say(player, `§a${petName(pet)}에게 용돈으로 에메랄드 1개를 주었습니다`);
      speak(pet, "paid");
    }
  } else if (itemStack.typeId === "chiikawa:simple_dish") {
    if (removeItem(player, "chiikawa:simple_dish", 1)) {
      pet.addEffect("speed", 6000, { amplifier: 0, showParticles: false });
      pet.addEffect("haste", 6000, { amplifier: 0, showParticles: false });
      pet.setDynamicProperty(K.eager, world.getAbsoluteTime() + 6000);
      say(player, `§a${petName(pet)}의 의욕이 5분 동안 올라갔습니다`);
      speak(pet, "treated");
    }
  } else if (itemStack.typeId === "chiikawa:weeding_book") {
    if (pet.getDynamicProperty(K.book)) return say(player, `§7${petName(pet)}은(는) 이미 학습 가이드를 읽었습니다`);
    if (removeItem(player, "chiikawa:weeding_book", 1)) {
      pet.setDynamicProperty(K.book, true);
      say(player, `§a${petName(pet)}이(가) 잡초 제거 학습 가이드를 읽었습니다`);
    }
  }
});

// ---- items used in the air ----
world.afterEvents.itemUse.subscribe((ev) => {
  const { source: player, itemStack } = ev;
  switch (itemStack.typeId) {
    case "chiikawa:pet_bell":
      return petBell(player);
    case "chiikawa:whistle_candy":
      return whistleCandy(player);
    case "chiikawa:handbook":
      return handbook(player);
  }
});

function petBell(player) {
  const now = system.currentTick;
  const last = bellLast.get(player.id);
  if (last !== undefined && now - last < BELL_COOLDOWN) {
    return say(player, `§7아직 울릴 수 없습니다 (${Math.ceil((BELL_COOLDOWN - (now - last)) / 20)}초 남음)`);
  }
  const mine = allPets().filter((p) => isTamed(p) && ownerId(p) === player.id);
  if (!mine.length) return say(player, "§7부를 수 있는 펫이 없습니다");
  bellLast.set(player.id, now);
  for (const pet of mine) {
    try {
      pet.teleport(player.location, { dimension: player.dimension });
      say(player, `§a${petName(pet)}이(가) 달려왔습니다`);
      speak(pet, "whistle");
    } catch {
      say(player, `§c${petName(pet)}이(가) 응답하지 않습니다. 마지막으로 보였던 곳에서 사라졌습니다`);
    }
  }
}

function whistleCandy(player) {
  let mode = player.getDynamicProperty("ck:whistle") ?? "follow";
  if (player.isSneaking) {
    mode = WHISTLE_MODES[(WHISTLE_MODES.indexOf(mode) + 1) % WHISTLE_MODES.length];
    player.setDynamicProperty("ck:whistle", mode);
    return say(player, `§e호루라기 사탕: ${WHISTLE_LABEL[mode]}`);
  }
  const pets = ownedPets(player, 32);
  if (!pets.length) return say(player, "§7호루라기 소리를 들은 펫이 없습니다");
  for (const pet of pets) {
    try {
      pet.triggerEvent(mode === "follow" ? "minecraft:follow" : "minecraft:sit");
      speak(pet, "whistle");
    } catch {
      /* event not defined on this pet */
    }
  }
  say(player, mode === "follow" ? `§a펫 ${pets.length}마리가 달려왔습니다` : `§a펫 ${pets.length}마리가 자유롭게 돌아다니기 시작했습니다`);
}

function handbook(player) {
  const form = new ActionFormData().title("치이카와의 작업 안내서").body("읽고 싶은 항목을 고르세요");
  for (const sec of MANUAL) form.button(sec.title);
  form.show(player).then((res) => {
    if (res.canceled) return;
    const sec = MANUAL[res.selection];
    new MessageFormData()
      .title(sec.title)
      .body(sec.lines.map((l, i) => `${i + 1}. ${l}`).join("\n\n"))
      .button1("닫기")
      .button2("목록으로")
      .show(player)
      .then((r) => {
        if (!r.canceled && r.selection === 1) handbook(player);
      });
  });
}
