import { K, today, isDaytime, getJson, setJson, ownedPets, allPets, petName, say, speak, countItem, removeItem, findPlayer, ownerId, isTamed } from "./util.js";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";

const JOB = "잡초 제거";
const BASE = { 3: 60, 2: 40, 1: 25 };
const MAX_ODDS = 90;
const MIN_PRACTICE = 2;

const held = (p) => p.getDynamicProperty(K.licence) ?? 0;
const nextRank = (p) => (held(p) === 0 ? 3 : held(p) - 1);

function odds(pet) {
  const rank = nextRank(pet);
  const practice = Math.min(20, (pet.getDynamicProperty(K.practice) ?? 0) * 3);
  const book = pet.getDynamicProperty(K.book) ? 15 : 0;
  const failing = Math.min(15, (pet.getDynamicProperty(K.failing) ?? 0) * 5);
  const total = Math.min(MAX_ODDS, BASE[rank] + practice + book + failing);
  return { rank, practice, book, failing, total };
}

function ineligible(pet) {
  if (held(pet) === 1) return "최고 등급 면허 보유";
  if (getJson(pet, K.exam)) return "이미 등록했거나 결과를 기다리는 중";
  if ((pet.getDynamicProperty(K.practice) ?? 0) < MIN_PRACTICE) return "작업 경험이 더 필요함";
  return undefined;
}

export function openExamDesk(player) {
  if (!isDaytime()) return say(player, "§7낮에만 시험 등록이 가능합니다");
  const pets = ownedPets(player, 16);
  if (!pets.length) return say(player, "§7근처에 내 펫이 없습니다");
  const form = new ActionFormData().title("시험용 책상").body(`${JOB} 시험에 등록할 펫을 선택하세요\n비용 다이아몬드 ×1`);
  for (const p of pets) {
    const why = ineligible(p);
    const lic = held(p) ? ` (${held(p)}급 보유)` : " (아직 면허 없음)";
    form.button(why ? `§8${petName(p)}${lic}\n§c${why}` : `${petName(p)}${lic}\n§2${odds(p).rank}급 응시 가능`);
  }
  form.show(player).then((res) => {
    if (res.canceled) return;
    const pet = pets[res.selection];
    const why = ineligible(pet);
    if (why) return say(player, `§c${why}`);
    const o = odds(pet);
    const body = [
      `기본 확률 ${BASE[o.rank]}%`,
      `작업 경험 +${o.practice}%`,
      o.book ? `학습 가이드 +${o.book}%` : null,
      o.failing ? `이전 불합격 보정 +${o.failing}%` : null,
      `\n합격 확률 ${o.total}% (최대 ${MAX_ODDS}%)`,
    ].filter(Boolean).join("\n");
    new MessageFormData()
      .title(`${petName(pet)} - ${JOB} ${o.rank}급`)
      .body(body)
      .button1("취소")
      .button2(`${JOB} ${o.rank}급 등록`)
      .show(player)
      .then((r) => {
        if (r.canceled || r.selection !== 1) return;
        if (!pet.isValid) return;
        if (!removeItem(player, "minecraft:diamond", 1)) return say(player, "§c다이아몬드가 필요합니다");
        setJson(pet, K.exam, { day: today(), rank: o.rank });
        say(player, `§a${petName(pet)}을(를) ${JOB} ${o.rank}급 시험에 등록했습니다`);
        say(player, `§7${petName(pet)}이(가) ${JOB} 시험지를 제출했습니다. 결과는 내일 아침에 나옵니다`);
      })
      .catch(() => {});
  }).catch(() => {});
}

/** results come out the morning after (called every 5 s) */
export function resolveExams() {
  const day = today();
  for (const pet of allPets()) {
    if (!isTamed(pet)) continue;
    const ex = getJson(pet, K.exam);
    if (!ex || ex.day >= day) continue;
    const owner = findPlayer(ownerId(pet));
    const o = odds(pet);
    const pass = Math.random() * 100 < o.total;
    setJson(pet, K.exam, undefined);
    pet.setDynamicProperty(K.book, undefined);
    if (pass) {
      pet.setDynamicProperty(K.licence, ex.rank);
      pet.setDynamicProperty(K.failing, 0);
      if (owner) say(owner, `§6${petName(pet)}이(가) ${JOB} ${ex.rank}급 시험에 합격했습니다!`);
      speak(pet, "exam_pass");
    } else {
      pet.setDynamicProperty(K.failing, (pet.getDynamicProperty(K.failing) ?? 0) + 1);
      if (owner) say(owner, `§c${petName(pet)}이(가) ${JOB} ${ex.rank}급 시험에 불합격했습니다`);
      speak(pet, "exam_fail");
    }
  }
}

export function licenceLine(pet) {
  return held(pet) ? `${JOB} 면허: ${held(pet)}급` : `${JOB} 면허: 아직 없음`;
}
