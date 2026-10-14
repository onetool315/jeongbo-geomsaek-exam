// run: npm-free ->  node tests/stage1.test.mjs   (copies BP scripts next to the fake API first via tests/run.sh)
import assert from "node:assert/strict";
import { state, emit, flush, makePlayer, makePet } from "@minecraft/server";
import "./src/items.js";
import { K, countItem } from "./src/util.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reset = () => { state.tick = 1000; state.messages.length = 0; state.players = []; state.pets = []; };
const msgs = () => state.messages.join("\n");
let n = 0;
const ok = (name) => console.log(`ok ${++n} - ${name}`);

// M2: owner recorded on tame, nearest player
reset();
const p = makePlayer("p1"); state.players = [p];
let pet = makePet("popularbiology:wusaqi"); state.pets = [pet];
emit("after.dataDrivenEntityTrigger", { eventId: "minecraft:on_tame", entity: pet });
flush();
assert.equal(pet.props[K.owner], "p1"); ok("M2 owner recorded on tame");

// M2: pet tamed before the pack -> claimed on interaction
reset(); state.players = [p]; pet = makePet("popularbiology:jiyi"); state.pets = [pet];
emit("after.playerInteractWithEntity", { player: p, target: pet, itemStack: undefined });
assert.equal(pet.props[K.owner], "p1"); ok("M2 legacy pet claimed on interact");

// M3: bell teleports pets from other dimensions, then cooldown
reset(); const bellUser = makePlayer("p2", 10); state.players = [bellUser];
const far = makePet("popularbiology:xiaoba", 999, "nether"); far.props[K.owner] = "p2";
const other = makePet("popularbiology:shisa", 5); other.props[K.owner] = "someone-else";
state.pets = [far, other];
emit("after.itemUse", { source: bellUser, itemStack: { typeId: "chiikawa:pet_bell" } });
assert.equal(far.dimension.id, "overworld"); assert.equal(far.location.x, 10);
assert.equal(other.location.x, 5, "other owner's pet untouched");
assert.match(msgs(), /달려왔습니다/);
state.messages.length = 0; state.tick += 100;
emit("after.itemUse", { source: bellUser, itemStack: { typeId: "chiikawa:pet_bell" } });
assert.match(msgs(), /아직 울릴 수 없습니다/); ok("M3 bell cross-dimension + cooldown");
state.tick += 700;
emit("after.itemUse", { source: bellUser, itemStack: { typeId: "chiikawa:pet_bell" } });
assert.match(msgs(), /달려왔습니다/); ok("M3 bell works again after 30s");

// M4: whistle candy: use -> follow event; sneak -> switch to free; use -> sit(free) event
reset(); const w = makePlayer("p3"); state.players = [w];
pet = makePet("popularbiology:laishi", 8); pet.props[K.owner] = "p3"; state.pets = [pet];
emit("after.itemUse", { source: w, itemStack: { typeId: "chiikawa:whistle_candy" } });
assert.deepEqual(pet.events, ["minecraft:follow"]);
w.isSneaking = true; emit("after.itemUse", { source: w, itemStack: { typeId: "chiikawa:whistle_candy" } }); w.isSneaking = false;
assert.match(msgs(), /자유 행동/);
emit("after.itemUse", { source: w, itemStack: { typeId: "chiikawa:whistle_candy" } });
assert.deepEqual(pet.events, ["minecraft:follow", "minecraft:sit"]); ok("M4 whistle candy modes");

// M4: out of range pets ignored
reset(); state.players = [w]; const awayPet = makePet("popularbiology:laishi", 90); awayPet.props[K.owner] = "p3"; state.pets = [awayPet];
emit("after.itemUse", { source: w, itemStack: { typeId: "chiikawa:whistle_candy" } });
assert.deepEqual(awayPet.events, []); assert.match(msgs(), /들은 펫이 없습니다/); ok("M4 range limit 32");

// M5: allowance -> emerald moves to pet bag
reset(); const rich = makePlayer("p4"); state.players = [rich];
rich.container.setItem(0, { typeId: "minecraft:emerald", amount: 3 });
pet = makePet("popularbiology:wusaqi"); pet.props[K.owner] = "p4"; state.pets = [pet];
emit("after.playerInteractWithEntity", { player: rich, target: pet, itemStack: { typeId: "minecraft:emerald", amount: 3 } });
assert.equal(countItem(rich, "minecraft:emerald"), 2);
assert.equal(pet.container.slots.filter((s) => s?.typeId === "minecraft:emerald").length, 1); ok("M5 pocket money");

// M5: not the owner -> nothing
reset(); const stranger = makePlayer("p5"); stranger.container.setItem(0, { typeId: "minecraft:emerald", amount: 1 }); state.players = [stranger];
pet = makePet("popularbiology:wusaqi"); pet.props[K.owner] = "p4"; state.pets = [pet];
emit("after.playerInteractWithEntity", { player: stranger, target: pet, itemStack: { typeId: "minecraft:emerald", amount: 1 } });
assert.equal(countItem(stranger, "minecraft:emerald"), 1); ok("M5 only owner can give money");

// M7: simple dish
reset(); const cook = makePlayer("p6"); state.players = [cook]; cook.container.setItem(0, { typeId: "chiikawa:simple_dish", amount: 1 });
pet = makePet("popularbiology:jiyi"); pet.props[K.owner] = "p6"; state.pets = [pet];
emit("after.playerInteractWithEntity", { player: cook, target: pet, itemStack: { typeId: "chiikawa:simple_dish", amount: 1 } });
assert.equal(pet.effects.length, 2); assert.equal(countItem(cook, "chiikawa:simple_dish"), 0); ok("M7 simple dish buffs pet");

// M6: gift delivered when owner is near, not when far
import { tickPets } from "./src/shop.js";
import { setJson } from "./src/util.js";
reset(); const g = makePlayer("p7", 0); state.players = [g];
pet = makePet("popularbiology:wusaqi", 30); pet.props[K.owner] = "p7"; setJson(pet, K.gift, { id: "minecraft:cookie", amount: 2 }); state.pets = [pet];
tickPets(); assert.equal(countItem(g, "minecraft:cookie"), 0, "too far");
pet.location.x = 2; tickPets();
assert.equal(countItem(g, "minecraft:cookie"), 2); assert.equal(pet.props[K.gift], undefined); ok("M6 gift delivery");

console.log(`\n${n} checks passed`);
