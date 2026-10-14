#!/usr/bin/env python3
"""Generate manifests, item / block / recipe definitions of the companion packs."""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VERSION = [0, 1, 0]
RP_UUID = "d4a1c7e2-3b65-4f0a-9c1e-5a7f2b8d6e01"
BP_UUID = "8e2b9f40-71c3-4d6a-b5e8-0c9a3d1f7a02"
RP_MOD = "1f6a0c35-92d7-4be1-8a43-6c5e0d9b7f03"
BP_MOD = "a3c58e17-4d90-42f6-b71a-9e0c2d4f8b04"
BP_SCRIPT = "5b7d1e92-0a64-4c38-9f25-d8e3a6c1b405"


def write(rel, obj):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


META = {
    "authors": ["Companion add-on (Korean localisation + Java-mod feature port)"],
    "license": "Companion packs only. Does NOT contain files of 'Chikawa Mob (Popular Biology)'.",
}

write("RP/manifest.json", {
    "format_version": 2,
    "header": {
        "name": "§d치이카와 모브 한글화 §7[RP]",
        "description": "치이카와 모브(Popular Biology) 애드온 한국어 번역 + 추가 아이템/블록 텍스처",
        "uuid": RP_UUID,
        "version": VERSION,
        "min_engine_version": [1, 21, 60],
    },
    "modules": [{"type": "resources", "uuid": RP_MOD, "version": VERSION}],
    "dependencies": [{"uuid": BP_UUID, "version": VERSION}],
    "metadata": META,
})

write("BP/manifest.json", {
    "format_version": 2,
    "header": {
        "name": "§d치이카와 모브 확장 §7[BP]",
        "description": "자바판 치이카와 모드 기능 이식: 노동 게시판, 시험용 책상, 상점, 펫 종, 호루라기 사탕, 선물 (치이카와 모브 애드온 필요)",
        "uuid": BP_UUID,
        "version": VERSION,
        "min_engine_version": [1, 21, 60],
    },
    "modules": [
        {"type": "data", "uuid": BP_MOD, "version": VERSION},
        {
            "type": "script",
            "language": "javascript",
            "uuid": BP_SCRIPT,
            "version": VERSION,
            "entry": "scripts/main.js",
        },
    ],
    "dependencies": [
        {"module_name": "@minecraft/server", "version": "1.17.0"},
        {"module_name": "@minecraft/server-ui", "version": "1.3.0"},
    ],
    "metadata": META,
})


def item(name, category="items"):
    return {
        "format_version": "1.20.30",
        "minecraft:item": {
            "description": {
                "identifier": f"chiikawa:{name}",
                "menu_category": {"category": category},
            },
            "components": {
                "minecraft:max_stack_size": 64,
                "minecraft:icon": {"texture": name},
            },
        },
    }


for n in ["pet_bell", "whistle_candy", "handbook", "weeding_book", "simple_dish"]:
    it = item(n, "equipment" if n in ("pet_bell", "whistle_candy") else "items")
    if n in ("pet_bell", "whistle_candy", "handbook"):
        it["minecraft:item"]["components"]["minecraft:max_stack_size"] = 1
    write(f"BP/items/{n}.json", it)


def block(name, color):
    return {
        "format_version": "1.20.80",
        "minecraft:block": {
            "description": {
                "identifier": f"chiikawa:{name}",
                "menu_category": {"category": "construction"},
            },
            "components": {
                "minecraft:geometry": "minecraft:geometry.full_block",
                "minecraft:material_instances": {
                    "*": {"texture": f"chiikawa_{name}", "render_method": "opaque"}
                },
                "minecraft:destructible_by_mining": {"seconds_to_destroy": 2.0},
                "minecraft:destructible_by_explosion": {"explosion_resistance": 5.0},
                "minecraft:map_color": color,
            },
        },
    }


write("BP/blocks/labor_board.json", block("labor_board", "#aa7d4b"))
write("BP/blocks/exam_desk.json", block("exam_desk", "#be965f"))
write("BP/blocks/shop.json", block("shop", "#c8a064"))


def shapeless(name, ingredients, count=1):
    return {
        "format_version": "1.20.10",
        "minecraft:recipe_shapeless": {
            "description": {"identifier": f"chiikawa:{name}"},
            "tags": ["crafting_table"],
            "ingredients": [{"item": i} for i in ingredients],
            "result": {"item": f"chiikawa:{name}", "count": count},
        },
    }


def shaped(name, pattern, key):
    return {
        "format_version": "1.20.10",
        "minecraft:recipe_shaped": {
            "description": {"identifier": f"chiikawa:{name}"},
            "tags": ["crafting_table"],
            "pattern": pattern,
            "key": key,
            "result": {"item": f"chiikawa:{name}", "count": 1},
        },
    }


write("BP/recipes/pet_bell.json", shapeless("pet_bell", ["minecraft:bell", "minecraft:lead"]))
write("BP/recipes/whistle_candy.json", shapeless("whistle_candy", ["minecraft:sugar", "minecraft:sugar", "minecraft:stick"]))
write("BP/recipes/handbook.json", shapeless("handbook", ["minecraft:book", "minecraft:cookie"]))
write("BP/recipes/weeding_book.json", shapeless("weeding_book", ["minecraft:book", "minecraft:wheat_seeds", "minecraft:wheat_seeds"]))
write("BP/recipes/simple_dish.json", shapeless("simple_dish", ["minecraft:bowl", "minecraft:carrot", "minecraft:cooked_beef"]))
write("BP/recipes/labor_board.json", shaped("labor_board", ["PPP", "PEP", "PPP"], {"P": {"tag": "minecraft:planks"}, "E": {"item": "minecraft:emerald"}}))
write("BP/recipes/exam_desk.json", shaped("exam_desk", ["PPP", "S S"], {"P": {"tag": "minecraft:planks"}, "S": {"item": "minecraft:stick"}}))
write("BP/recipes/shop.json", shaped("shop", ["WWW", "PEP", "PPP"], {"W": {"item": "minecraft:red_wool"}, "P": {"tag": "minecraft:planks"}, "E": {"item": "minecraft:emerald"}}))

with open(os.path.join(ROOT, "BP/texts/ko_KR.lang"), "w", encoding="utf-8") as f:
    f.write("pack.name=치이카와 모브 확장\n")
print("defs generated")
