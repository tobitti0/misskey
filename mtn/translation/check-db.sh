#!/usr/bin/env bash
set -euo pipefail

# This runs only against the isolated services in compose.check.yml.
node --input-type=module <<'JS'
import fs from 'node:fs';
import * as yaml from 'js-yaml';
const config = yaml.load(fs.readFileSync('.github/misskey/test.yml', 'utf8'));
config.db.host = 'db';
config.db.port = 5432;
config.redis.host = 'redis';
config.redis.port = 6379;
fs.writeFileSync('.config/test.yml', yaml.dump(config));
JS
export MISSKEY_CONFIG_YML=test.yml
# Test-only chart entities intentionally have no production migrations.
export NODE_ENV=production
pnpm --filter backend migrate
pnpm --filter backend check-migrations
pnpm --filter backend revert
pnpm --filter backend migrate
pnpm --filter backend check-migrations
export NODE_ENV=test
pnpm --filter backend test:e2e --run test/e2e/endpoints.ts test/e2e/note.ts -t 'OpenAI translation model|notes/translate'
