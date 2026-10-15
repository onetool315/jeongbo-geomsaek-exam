// stage 2: labour board (slips, weeding, hunting, upgrade, failure)
import assert from "node:assert/strict";
import { state, emit, makePlayer, makePet, makeMonster, putBlock, pushForm, world } from "@minecraft/server";
import "./src/items.js";
import { openBoard, tickJobs } from "./src/board.js";
import { K, getJson, setJson, countItem } from "./src/util.js";

const tick = () => new Promise((r) => setTimeout(r, 5));
let n = 0;
const ok = (m) => console.log(`ok ${++n} - ${m}`);
const reset = () => { state.messages.length = 0; state.blocks.clear(); state.monsters = []; state.forms.length = 0; state.worldProps = {}; };
const slipsOf = (key) => getJson(world, "ck:board:" + key).slips;
const inv = (pet, id) => pet.container.slots.filter((s) => s?.typeId === id).reduce((a, s) => a + s.amount, 0);

const player = makePlayer("p1"); state.players = [player];
const board = putBlock("chiikawa:labor_board", 0, 64, 5);
const KEY = "overworld|0,64,5";

// 1) open board: lv1 -> 3 weeding slips for today
reset(); state.players = [player]; const board1 = putBlock("chiikawa:labor_board", 0, 64, 5);
let pet = makePet("popularbiology:wusaqi", 1); pet.props[K.owner] = "p1"; state.pets = [pet];
pushForm({ canceled: true });
openBoard(player, board1); await tick();
let slips = slipsOf(KEY);
assert.equal(slips.length, 3); assert.ok(slips.every((s) => s.type === "weeding" && s.state === "open")); ok("board generates 3 weeding slips at level 1");

// 2) take slip 0 with the pet, weeds get cleared, reward lands in the pet bag
const need = slips[0].need;
for (let i = 0; i < need + 4; i++) putBlock("minecraft:short_grass", 3 + i, 64, 0);
pushForm({ selection: 0 }); pushForm({ selection: 0 });
openBoard(player, board1); await tick(); await tick();
assert.equal(slipsOf(KEY)[0].state, "taken"); assert.ok(getJson(pet, K.slip)); ok("pet takes a slip");
for (let i = 0; i < 40 && getJson(pet, K.slip); i++) tickJobs();
assert.equal(getJson(pet, K.slip), undefined, "slip finished");
assert.equal(slipsOf(KEY)[0].state, "done");
assert.ok(inv(pet, "minecraft:emerald") >= 1, "reward in bag");
assert.equal(pet.props[K.practice], 1);
const left = [...state.blocks.values()].filter((b) => b.typeId === "minecraft:short_grass").length;
assert.equal(left, 4, `exactly ${need} weeds removed`);
assert.ok(pet.location.x > 1, "pet walked toward the grass"); ok("weeding: walk, clear, reward, practice");

// 3) taken slip can't be taken twice
pushForm({ selection: 0 }); openBoard(player, board1); await tick();
assert.match(state.messages.join("\n"), /이미 처리된 작업표/); ok("finished slip cannot be taken again");

// 4) upgrade to lv2 costs 8 emeralds, adds a slip
state.messages.length = 0;
player.container.setItem(0, { typeId: "minecraft:emerald", amount: 7 });
pushForm({ selection: 3 }); openBoard(player, board1); await tick();
assert.match(state.messages.join("\n"), /에메랄드가 부족/); assert.equal(getJson(world, "ck:board:" + KEY).lv, 1);
player.container.setItem(0, { typeId: "minecraft:emerald", amount: 8 });
pushForm({ selection: 3 }); openBoard(player, board1); await tick();
assert.equal(getJson(world, "ck:board:" + KEY).lv, 2); assert.equal(countItem(player, "minecraft:emerald"), 0);
assert.equal(slipsOf(KEY).length, 4); ok("upgrade needs 8 emeralds and adds a slip");

// 5) melee hunting: pet walks to zombies, kills them, completes
const st = getJson(world, "ck:board:" + KEY);
st.slips[1] = { type: "melee", need: 2, reward: [{ id: "minecraft:emerald", n: 3 }], state: "open", taker: "" };
setJson(world, "ck:board:" + KEY, st);
state.monsters = [makeMonster(14), makeMonster(16)];
pushForm({ selection: 1 }); pushForm({ selection: 0 }); openBoard(player, board1); await tick(); await tick();
assert.equal(getJson(pet, K.slip).type, "melee");
const before = inv(pet, "minecraft:emerald");
for (let i = 0; i < 60 && getJson(pet, K.slip); i++) tickJobs();
assert.equal(getJson(pet, K.slip), undefined); assert.equal(state.monsters.length, 0);
assert.ok(inv(pet, "minecraft:emerald") >= before + 3); assert.equal(slipsOf(KEY)[1].state, "done"); ok("melee hunting end to end");

// 6) monsters not killed by the pet don't count
st.slips[2] = { type: "melee", need: 1, reward: [{ id: "minecraft:emerald", n: 1 }], state: "open", taker: "" };
setJson(world, "ck:board:" + KEY, st);
pushForm({ selection: 2 }); pushForm({ selection: 0 }); openBoard(player, board1); await tick(); await tick();
const mob = makeMonster(40); state.monsters = [mob];
mob.applyDamage(99, { damagingEntity: player });
assert.equal(getJson(pet, K.slip).done, 0); ok("player kills don't count for the pet");

// 7) pet dies -> slip fails
emit("after.entityDie", { deadEntity: pet, damageSource: {} });
assert.equal(slipsOf(KEY)[2].state, "failed"); assert.match(state.messages.join("\n"), /쓰러져 작업표가 실패/); ok("pet death fails its slip");

console.log(`\n${n} board checks passed`);
