#!/usr/bin/env node
/**
 * Run the test suite once per timezone.
 *
 * Dates are the spine of this archive, and the bug worth guarding against is
 * the host timezone leaking into a rendered date. A suite that only ever runs
 * at UTC cannot see that class of failure at all — the assertion passes on the
 * machine where it is wrong and on the machine where it is right.
 *
 * So the same tests run three times: behind UTC, ahead of UTC, and at UTC. A
 * date bug on one side of the meridian is invisible if you only test the other.
 *
 * Why a script rather than `TZ=... node --test`: on Windows that prefix never
 * reaches the process — verified, `process.env.TZ` arrives undefined and the
 * offset does not change. Passing env explicitly to a spawned child is the only
 * form that works on both Windows and POSIX, and this project is maintained
 * from Windows.
 */

import { spawnSync } from 'node:child_process';

const ZONES = ['America/Chicago', 'Asia/Tokyo', 'UTC'];
const PATTERN = 'scripts/test/**/*.test.mjs';

const only = process.argv[2];
const zones = only ? [only] : ZONES;

let failed = 0;

for (const zone of zones) {
  process.stdout.write(`\n──────── TZ=${zone} ────────\n`);

  const result = spawnSync(
    process.execPath,
    ['--test', ...(process.argv.includes('--watch') ? ['--watch'] : []), PATTERN],
    {
      stdio: 'inherit',
      // The whole point: TZ has to be in the child's environment, not the shell's.
      env: { ...process.env, TZ: zone },
      shell: false,
    },
  );

  if (result.status !== 0) {
    failed += 1;
    process.stdout.write(`\n✗ failures under TZ=${zone}\n`);
  }
}

if (failed > 0) {
  process.stdout.write(`\n${failed} of ${zones.length} timezone runs failed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`\n✓ suite passes in all ${zones.length} timezones.\n`);
}
