/**
 * Asserts the webhook signature check in
 * `supabase/functions/_shared/persona.ts`.
 *
 * Checked against an INDEPENDENT HMAC implementation (node:crypto) rather
 * than against itself, so a bug in the verifier cannot agree with a matching
 * bug in the test.
 *
 * This is the only thing standing between the verification webhook and
 * anyone who can POST to it: `verify_jwt` is false for that function, so a
 * forged request that passed this check could award a Verified badge.
 *
 *   node --experimental-strip-types supabase/tests/verification_signature.mjs
 *
 * Node reads the TypeScript source directly by stripping its types, which
 * needs Node 22 or newer. Nothing is compiled and nothing is installed.
 */

import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const persona = fileURLToPath(new URL('../functions/_shared/persona.ts', import.meta.url));
const { verifyPersonaSignature } = await import(persona);

const secret = 'whsec_test_secret_value';
const rawBody = JSON.stringify({
  data: {
    type: 'event',
    id: 'evt_abc',
    attributes: {
      name: 'inquiry.approved',
      'created-at': '2026-11-26T12:00:00.000Z',
      payload: {
        data: { id: 'inq_xyz', attributes: { status: 'approved', 'reference-id': 'u-1' } },
      },
    },
  },
});
const t = '1764158400';

/** Independent: node:crypto, not the Web Crypto the verifier uses. */
const sign = (ts, body, key) => createHmac('sha256', key).update(`${ts}.${body}`).digest('hex');
const good = sign(t, rawBody, secret);

let failures = 0;
const check = async (label, expected, header, body = rawBody, key = secret) => {
  const actual = await verifyPersonaSignature({ header, rawBody: body, secret: key });
  const ok = actual === expected;
  if (!ok) {
    failures += 1;
  }

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} (expected ${expected}, got ${actual})`);
};

await check('valid signature accepted', true, `t=${t},v1=${good}`);
await check(
  'tampered body rejected',
  false,
  `t=${t},v1=${good}`,
  rawBody.replace('approved', 'declined'),
);
await check('wrong secret rejected', false, `t=${t},v1=${good}`, rawBody, 'whsec_wrong');
await check('wrong timestamp rejected', false, `t=9999999999,v1=${good}`);
await check('missing v1 rejected', false, `t=${t}`);
await check('empty header rejected', false, '');
await check('garbage header rejected', false, 'not-a-signature');

// Persona sends one set per active secret during a rotation, space separated,
// and the request is genuine if ANY of them matches.
await check(
  'rotation — match in 2nd set accepted',
  true,
  `t=${t},v1=${sign(t, rawBody, 'whsec_old')} t=${t},v1=${good}`,
);
await check(
  'rotation — neither set matching rejected',
  false,
  `t=${t},v1=${sign(t, rawBody, 'whsec_old')} t=${t},v1=${sign(t, rawBody, 'whsec_older')}`,
);

// Proves the raw-bytes requirement is real rather than a comment: the same
// JSON re-serialised must not verify.
await check(
  're-serialised body rejected',
  false,
  `t=${t},v1=${good}`,
  JSON.stringify(JSON.parse(rawBody), null, 2),
);

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
