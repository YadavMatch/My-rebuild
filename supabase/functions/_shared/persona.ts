/**
 * The parts of Persona's API this integration uses.
 *
 * Shared by both functions so the endpoint shapes, the version pin and the
 * signature check exist once. Everything here runs server-side only: the API
 * key bypasses nothing in our schema, but it can read every selfie and
 * identity record in the Persona account, so it must never reach the client.
 */

const API = 'https://api.withpersona.com/api/v1';

/**
 * Pinned on purpose. `Persona-Version` is optional, and omitting it means the
 * key's dashboard-configured version applies — so someone changing a setting
 * in Persona could change response shapes under us without a deploy. Pinning
 * makes a version bump a code change. Move it only after reading their
 * changelog.
 */
const API_VERSION = '2026-09-29';

function headers(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Persona-Version': API_VERSION,
  };
}

/**
 * Carries Persona's HTTP status so the caller can report it without having to
 * read function logs. The status alone separates the causes that matter: 401
 * is the key, 400 is our request, 404 is a template the key cannot see.
 */
export class PersonaApiError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`Persona rejected the request: ${status} ${body}`);
    this.name = 'PersonaApiError';
    this.status = status;
  }
}

export type CreatedInquiry = {
  inquiryId: string;
  /** The hosted-flow URL to open on the device. Single-use. */
  oneTimeLink: string;
};

/**
 * Creates an inquiry and returns a one-time hosted-flow link for it.
 *
 * `auto-create-one-time-link` means the link comes back on this response, so
 * there is no second round trip to the generate-link endpoint.
 *
 * The user's id is sent twice, deliberately. `reference-id` on the inquiry is
 * marked deprecated in Persona's current docs, but it is the field that shows
 * up as `reference-id` on the webhook payload, which is how the webhook maps
 * the result back to a user. `auto-create-account-reference-id` is the
 * non-deprecated replacement and sets the same value on the Persona account.
 * Sending both means the mapping survives either field going away.
 *
 * NOTE: which of the two actually populates the webhook payload was not
 * confirmed against a live inquiry — only against the docs. Verify it on the
 * first sandbox run and drop whichever is redundant.
 */
export async function createInquiry(opts: {
  apiKey: string;
  templateId: string;
  userId: string;
}): Promise<CreatedInquiry> {
  const response = await fetch(`${API}/inquiries`, {
    method: 'POST',
    headers: headers(opts.apiKey),
    body: JSON.stringify({
      data: {
        attributes: {
          'inquiry-template-id': opts.templateId,
          'reference-id': opts.userId,
        },
      },
      meta: {
        'auto-create-account-reference-id': opts.userId,
        'auto-create-one-time-link': true,
      },
    }),
  });

  if (!response.ok) {
    throw new PersonaApiError(response.status, await response.text());
  }

  const body = await response.json();
  const inquiryId = body?.data?.id;
  const oneTimeLink = body?.meta?.['one-time-link'];

  if (!inquiryId || !oneTimeLink) {
    throw new Error('Persona created an inquiry without a one-time link');
  }

  return { inquiryId, oneTimeLink };
}

/**
 * Redacts an inquiry: permanently deletes the PII Persona holds for it,
 * identity document and selfie included. Cannot be undone, which is the point.
 *
 * A 404 counts as success. It means the inquiry is already gone — a retried
 * webhook, or a redaction we already did — and the desired end state holds
 * either way.
 */
export async function redactInquiry(opts: {
  apiKey: string;
  inquiryId: string;
}): Promise<void> {
  const response = await fetch(`${API}/inquiries/${opts.inquiryId}`, {
    method: 'DELETE',
    headers: headers(opts.apiKey),
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Persona refused to redact ${opts.inquiryId}: ${response.status} ${await response.text()}`,
    );
  }
}

/** Compares two hex digests without branching on their contents. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verifies a `Persona-Signature` header against the raw request body.
 *
 * The header holds one or more space-separated sets of `t=<unix>,v1=<hmac>`.
 * There is normally one; during a secret rotation there is one per active
 * secret, and the request is genuine if *any* of them matches. The signed
 * string is the timestamp, a literal dot, then the raw body.
 *
 * The body must be the bytes as received. Re-serialising the parsed JSON
 * changes key order and whitespace and the signature stops matching.
 *
 * There is deliberately no freshness window on `t`. Persona retries a failed
 * delivery up to seven more times with exponential backoff, so a tight window
 * would reject legitimate retries — and `t` is inside the signed string, so it
 * cannot be altered without invalidating the signature.
 */
export async function verifyPersonaSignature(opts: {
  header: string;
  rawBody: string;
  secret: string;
}): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(opts.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  for (const set of opts.header.trim().split(/\s+/)) {
    const parts = new Map(
      set
        .split(',')
        .map((pair) => pair.split('='))
        .filter((pair): pair is [string, string] => pair.length === 2)
        .map(([name, value]) => [name.trim(), value.trim()]),
    );

    const timestamp = parts.get('t');
    const provided = parts.get('v1');
    if (!timestamp || !provided) {
      continue;
    }

    const expected = toHex(
      await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(`${timestamp}.${opts.rawBody}`),
      ),
    );

    if (constantTimeEqual(expected, provided)) {
      return true;
    }
  }

  return false;
}
