#!/bin/sh
# copies the real BP scripts next to a fake @minecraft/server and runs the stage-1 checks
set -e
cd "$(dirname "$0")"
rm -rf src && mkdir src && cp ../BP/scripts/util.js ../BP/scripts/items.js ../BP/scripts/shop.js src/ && cp -r ../BP/scripts/data src/data
node stage1.test.mjs
