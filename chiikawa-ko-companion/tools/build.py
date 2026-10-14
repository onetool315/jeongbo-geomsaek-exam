#!/usr/bin/env python3
"""Zip BP and RP into dist/ChiikawaKR_Companion.mcaddon (also separate .mcpack files)."""
import os, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist")
os.makedirs(DIST, exist_ok=True)


def pack(folder, out):
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(os.path.join(ROOT, folder)):
            for f in files:
                full = os.path.join(base, f)
                z.write(full, os.path.relpath(full, os.path.join(ROOT, folder)))


pack("BP", os.path.join(DIST, "ChiikawaKR_BP.mcpack"))
pack("RP", os.path.join(DIST, "ChiikawaKR_RP.mcpack"))
with zipfile.ZipFile(os.path.join(DIST, "ChiikawaKR_Companion.mcaddon"), "w", zipfile.ZIP_DEFLATED) as z:
    for name in ("BP", "RP"):
        for base, _, files in os.walk(os.path.join(ROOT, name)):
            for f in files:
                full = os.path.join(base, f)
                z.write(full, os.path.join(f"ChiikawaKR_{name}", os.path.relpath(full, os.path.join(ROOT, name))))
print("built", os.listdir(DIST))
