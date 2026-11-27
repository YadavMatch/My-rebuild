/**
 * Starts an identity verification.
 *
 * Called by the signed-in app. Creates a Persona inquiry tagged with the
 * caller's user id and hands back a single-use hosted-flow URL for the device
 * to open. Nothing is recorded here — the result arrives later, server to
 * server, at `verification-webhook`. A client cannot be trusted to report
 * whether it passed.
 *
 * Secrets this function needs (`supabase secrets set NAME=value`):
 *   PERSONA_API_KEY      — server-side Persona key
 *   PERSONA_TEMPLATE_ID  — the government-ID-plus-selfie template, `itmpl_...`.
 *                          Must be from the same Persona environment as the
 *                          key, or Persona rejects the inquiry.
 */

import { withSupabase } from 'npm:@supabase/server@1';

import { createInquiry } from '../_shared/persona.ts';

export default {
  // `auth: 'user'` rejects anything without a valid user JWT before the
  // handler runs, so `ctx.userClaims` is the authenticated caller and not a
  // user id the client chose for itself.
  fetch: withSupabase({ auth: 'user' }, async (_req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) {
      return Response.json({ error: 'Not signed in.' }, { status: 401 });
    }

    const apiKey = Deno.env.get('PERSONA_API_KEY');
    const templateId = Deno.env.get('PERSONA_TEMPLATE_ID');
    if (!apiKey || !templateId) {
      console.error('PERSONA_API_KEY or PERSONA_TEMPLATE_ID is not set');
      return Response.json(
        { error: 'Verification is not configured yet.' },
        { status: 503 },
      );
    }

    // Reading through the caller's own client, so row-level security applies
    // and this can only ever see the caller's row.
    const { data: profile, error } = await ctx.supabase
      .from('profiles')
      .select('verified')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Could not read the caller profile', error);
      return Response.json({ error: 'Could not start verification.' }, { status: 500 });
    }

    // Each inquiry is billable, so an already-verified caller is turned away
    // rather than charged for a second check.
    if (profile?.verified) {
      return Response.json({ error: 'Already verified.' }, { status: 409 });
    }

    try {
      const { oneTimeLink } = await createInquiry({ apiKey, templateId, userId });
      return Response.json({ url: oneTimeLink });
    } catch (cause) {
      // Logged in full, returned vague: the upstream message can carry
      // account detail the client has no business seeing.
      console.error('Persona inquiry creation failed', cause);
      return Response.json({ error: 'Could not start verification.' }, { status: 502 });
    }
  }),
};
