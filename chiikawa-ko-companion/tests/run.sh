#!/bin/sh
# copies the real BP scripts next to a fake @minecraft/server and runs the checks
set -e
cd "$(dirname "$0")"
rm -rf src && mkdir src && cp ../BP/scripts/*.js src/ && cp -r ../BP/scripts/data src/data
rm -f src/main.js
node stage1.test.mjs
node stage2.test.mjs
