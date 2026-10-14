import { world, system } from "@minecraft/server";
import "./items.js";
import { openBoard, tickWeeding } from "./board.js";
import { openExamDesk, resolveExams } from "./exam.js";
import { openShop, tickPets } from "./shop.js";

// Companion add-on for "Chikawa Mob (Popular Biology)":
// ports the Java mod's labour board, licence exam, shop, gifts, pet bell and whistle candy.

const guard = new Map();

world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
  const { player, block } = ev;
  const handler = { "chiikawa:labor_board": openBoard, "chiikawa:exam_desk": openExamDesk, "chiikawa:shop": openShop }[block.typeId];
  if (!handler) return;
  // the event can fire twice per tap on touch screens
  const last = guard.get(player.id) ?? -100;
  if (system.currentTick - last < 10) return;
  guard.set(player.id, system.currentTick);
  handler(player, block);
});

let tick = 0;
system.runInterval(() => {
  tick += 20;
  try {
    if (tick % 40 === 0) tickWeeding();
    if (tick % 100 === 0) {
      tickPets();
      resolveExams();
    }
  } catch (e) {
    console.warn(`[chiikawa-ko] ${e}`);
  }
}, 20);

world.afterEvents.playerLeave.subscribe((ev) => guard.delete(ev.playerId));
