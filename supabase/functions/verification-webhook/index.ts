/**
 * Receives Persona's verdict on a selfie verification.
 *
 * This is the only thing in the system that may award a Verified badge.
 * `0001_initial_schema.sql` revokes writes on `verification_attempts` from
 * `authenticated` and revokes `update` on `profiles.verified`, so the service
 * role reached through `ctx.supabaseAdmin` is the sole writer.
 *
 * Order matters: record the result, then redact the selfie at Persona. The
 * other order risks deleting the evidence and then failing to record it,
 * which would cost the user their verification and leave nothing to retry
 * from.
 *
 * Secrets this function needs (`supabase secrets set NAME=value`):
 *   PERSONA_API_KEY        — server-side Persona key, for the redact call
 *   PERSONA_WEBHOOK_SECRET — the webhook signing secret from the dashboard
 *
 * `verify_jwt` is false for this function in `supabase/config.jsonc`, because
 * Persona has no Supabase JWT to present. The signature check below is what
 * takes its place, and it is the only thing standing between this endpoint
 * and anyone who can POST to it.
 */

import { withSupabase } from 'npm:@supabase/server@1';

import { redactInquiry, verifyPersonaSignature } from '../_shared/persona.ts';

/**
 * The events worth recording, and what they mean for the badge. Everything
 * else in the inquiry lifecycle — created, started, completed,
 * marked-for-review — is acknowledged and ignored: `completed` means the user
 * finished the flow, not that they passed it.
 */
const VERDICTS: Record<string, boolean> = {
  'inquiry.approved': true,
  'inquiry.declined': false,
  'inquiry.failed': false,
};

export default {
  // `auth: 'none'` disables every credential check, which is correct here and
  // nowhere else in this project.
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const secret = Deno.env.get('PERSONA_WEBHOOK_SECRET');
    const apiKey = Deno.env.get('PERSONA_API_KEY');
    if (!secret || !apiKey) {
      console.error('PERSONA_WEBHOOK_SECRET or PERSONA_API_KEY is not set');
      return new Response('Not configured', { status: 503 });
    }

    // Read as text, not JSON: the signature covers the bytes as sent.
    const rawBody = await req.text();
    const signature = req.headers.get('Persona-Signature');

    if (!signature || !(await verifyPersonaSignature({ header: signature, rawBody, secret }))) {
      // No detail in the response. An attacker probing this endpoint learns
      // only that it rejected them.
      console.error('Rejected a webhook with a missing or invalid signature');
      return new Response('Invalid signature', { status: 401 });
    }

    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response('Malformed body', { status: 400 });
    }

    const attributes = (event as Record<string, any>)?.data?.attributes;
    const name: string | undefined = attributes?.name;
    const inquiry = attributes?.payload?.data;
    const inquiryId: string | undefined = inquiry?.id;
    const userId: string | undefined = inquiry?.attributes?.['reference-id'];
    const occurredAt: string | undefined = attributes?.['created-at'];

    if (!name || !inquiryId) {
      return new Response('Unrecognised event shape', { status: 400 });
    }

    // Acknowledged so Persona stops retrying. Deliveries are not ordered and
    // most of them are not verdicts.
    if (!(name in VERDICTS)) {
      return new Response(null, { status: 204 });
    }

    if (!userId) {
      // A verdict with nothing to attach it to. Loud rather than silent: the
      // inquiry is still visible in Persona's dashboard, and the cause is a
      // template misconfiguration someone has to fix.
      console.error(`${name} for ${inquiryId} carried no reference-id`);
      return new Response('No reference-id on the inquiry', { status: 400 });
    }

    const passed = VERDICTS[name];

    // Upsert, not insert. Persona retries a delivery up to seven more times
    // and does not guarantee order, so the same verdict can arrive twice. The
    // unique index on (provider, inquiry_id) from migration 0002 turns the
    // repeat into a no-op rather than a second attempt row.
    //
    // `ignoreDuplicates` keeps the first verdict recorded for an inquiry
    // instead of letting a later, possibly out-of-order delivery overwrite
    // it. The badge below is a separate, idempotent update, and nothing here
    // ever takes a badge away.
    const { error: attemptError } = await ctx.supabaseAdmin
      .from('verification_attempts')
      .upsert(
        { user_id: userId, passed, provider: 'persona', inquiry_id: inquiryId },
        { onConflict: 'provider,inquiry_id', ignoreDuplicates: true },
      );

    if (attemptError) {
      // Non-2xx so Persona retries. Losing a verdict silently is worse than
      // handling it twice.
      console.error(`Could not record the attempt for ${inquiryId}`, attemptError);
      return new Response('Could not record the attempt', { status: 500 });
    }

    if (passed) {
      const { error: badgeError } = await ctx.supabaseAdmin
        .from('profiles')
        .update({ verified: true, verified_at: occurredAt ?? new Date().toISOString() })
        .eq('id', userId);

      if (badgeError) {
        console.error(`Recorded the pass but could not set the badge for ${userId}`, badgeError);
        return new Response('Could not set the badge', { status: 500 });
      }
    }

    try {
      await redactInquiry({ apiKey, inquiryId });
    } catch (cause) {
      // The result is safely recorded, so this could return 204 and move on.
      // It does not. The app tells people their photo is not stored, and a
      // failed redaction means it still is — so this fails loudly and lets
      // Persona retry, at the cost of a duplicate attempt row per retry.
      console.error(`Could not redact ${inquiryId} — the selfie is still at Persona`, cause);
      return new Response('Could not redact the inquiry', { status: 500 });
    }

    return new Response(null, { status: 204 });
  }),
};
