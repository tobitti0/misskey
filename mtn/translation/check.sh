#!/usr/bin/env bash
set -euo pipefail

# All dependencies, configuration and build products stay inside the container.
snapshot=$(mktemp -d)
cp -a packages/misskey-js/src/autogen "$snapshot/autogen"
pnpm build-pre
pnpm --filter misskey-js build
pnpm build-misskey-js-with-types
diff -ru "$snapshot/autogen" packages/misskey-js/src/autogen
pnpm --filter backend typecheck
pnpm --filter misskey-bubble-game build
pnpm --filter frontend typecheck
pnpm --filter backend test --run test/unit/translation.ts test/unit/translation-cache.ts test/unit/notes-translate.ts
node scripts/check-shipping.mjs --base origin/develop
