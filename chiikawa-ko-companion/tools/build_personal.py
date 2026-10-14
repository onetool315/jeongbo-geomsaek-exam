#!/usr/bin/env python3
"""Build a PERSONAL all-in-one .mcaddon from your own copy of the original add-on.

usage: python3 tools/build_personal.py /path/to/ChikawaMob_BehRes_v1_2.mcaddon

The result goes to personal/ (git-ignored). The original add-on is "all rights
reserved", so the patched copy is for your own device only - never commit or share it.
Patches applied to the original copy:
  * pbmobres/texts/ko_KR.lang   (Korean strings)  + ko_KR in texts/languages.json
Our BP / RP are added next to the original packs.
"""
import json, os, shutil, sys, tempfile, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "personal")


def main(src):
    if not os.path.isfile(src):
        sys.exit(f"not found: {src}")
    tmp = tempfile.mkdtemp(prefix="chiikawa_")
    with zipfile.ZipFile(src) as z:
        for n in z.namelist():  # refuse path traversal
            if n.startswith("/") or ".." in n.split("/"):
                sys.exit(f"unsafe path in archive: {n}")
        z.extractall(tmp)
    res = os.path.join(tmp, "pbmobres")
    beh = os.path.join(tmp, "pbmobbeh")
    if not (os.path.isdir(res) and os.path.isdir(beh)):
        sys.exit("pbmobres / pbmobbeh not found in the archive")

    shutil.copy(os.path.join(ROOT, "RP/texts/ko_KR.lang"), os.path.join(res, "texts/ko_KR.lang"))
    lj = os.path.join(res, "texts/languages.json")
    langs = json.load(open(lj, encoding="utf-8"))
    if "ko_KR" not in langs:
        langs.append("ko_KR")
    json.dump(langs, open(lj, "w", encoding="utf-8"), indent=4)

    shutil.copytree(os.path.join(ROOT, "BP"), os.path.join(tmp, "ChiikawaKR_BP"))
    shutil.copytree(os.path.join(ROOT, "RP"), os.path.join(tmp, "ChiikawaKR_RP"))

    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, "Chiikawa_Personal.mcaddon")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(tmp):
            for f in files:
                full = os.path.join(base, f)
                z.write(full, os.path.relpath(full, tmp))
    # same four packs as separate .mcpack files (some phones open these more reliably)
    for name, label in [("pbmobbeh", "1_Original_BP"), ("pbmobres", "2_Original_RP"), ("ChiikawaKR_BP", "3_Extra_BP"), ("ChiikawaKR_RP", "4_Extra_RP")]:
        folder = os.path.join(tmp, name)
        with zipfile.ZipFile(os.path.join(OUT, f"Chiikawa_{label}.mcpack"), "w", zipfile.ZIP_DEFLATED) as z:
            for base, _, files in os.walk(folder):
                for f in files:
                    full = os.path.join(base, f)
                    z.write(full, os.path.relpath(full, folder))
    shutil.rmtree(tmp)
    print("built", out, os.path.getsize(out), "bytes")


if len(sys.argv) != 2:
    sys.exit(__doc__)
main(sys.argv[1])
