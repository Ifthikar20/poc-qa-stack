/**
 * Passkeys, between the control plane's JSON and the browser's API.
 *
 * The control plane speaks the WebAuthn JSON shapes (every byte string as
 * base64url); `navigator.credentials` wants ArrayBuffers and hands back
 * ArrayBuffers. Modern browsers convert both ways themselves
 * (parseCreationOptionsFromJSON, credential.toJSON); the fallbacks here do
 * the same for the ones that do not yet, so a passkey works or fails for a
 * reason the control plane decided, never for a base64 detail.
 *
 * Nothing here decides anything. The control plane pins the relying party
 * and the origin and demands user verification on every ceremony
 * (docs/AUTH.md §5.7); a browser that ignores the request is refused there.
 */

/** Is there any point offering a passkey on this device? */
export const passkeysAvailable = () =>
  typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function'
  && typeof navigator?.credentials?.get === 'function';

const fromB64u = (s) => {
  const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out.buffer;
};
const toB64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const withBuffers = (pk) => ({
  ...pk,
  challenge: fromB64u(pk.challenge),
  ...(pk.user ? { user: { ...pk.user, id: fromB64u(pk.user.id) } } : {}),
  ...(pk.excludeCredentials ? { excludeCredentials: pk.excludeCredentials.map((c) => ({ ...c, id: fromB64u(c.id) })) } : {}),
  ...(pk.allowCredentials ? { allowCredentials: pk.allowCredentials.map((c) => ({ ...c, id: fromB64u(c.id) })) } : {}),
});

const toJSON = (cred) => {
  if (typeof cred.toJSON === 'function') return cred.toJSON();
  const r = cred.response;
  const response = {
    clientDataJSON: toB64u(r.clientDataJSON),
    ...(r.attestationObject ? { attestationObject: toB64u(r.attestationObject) } : {}),
    ...(r.authenticatorData ? { authenticatorData: toB64u(r.authenticatorData) } : {}),
    ...(r.signature ? { signature: toB64u(r.signature) } : {}),
    ...(r.userHandle ? { userHandle: toB64u(r.userHandle) } : {}),
  };
  return {
    id: cred.id, rawId: toB64u(cred.rawId), type: cred.type, response,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
  };
};

/** Make a credential from the control plane's creation options; returns the JSON to post back. */
export async function create(creationOptions) {
  const publicKey = window.PublicKeyCredential.parseCreationOptionsFromJSON
    ? window.PublicKeyCredential.parseCreationOptionsFromJSON(creationOptions.publicKey)
    : withBuffers(creationOptions.publicKey);
  return toJSON(await navigator.credentials.create({ publicKey }));
}

/** Sign the control plane's request options with a passkey; returns the JSON to post back. */
export async function get(requestOptions) {
  const publicKey = window.PublicKeyCredential.parseRequestOptionsFromJSON
    ? window.PublicKeyCredential.parseRequestOptionsFromJSON(requestOptions.publicKey)
    : withBuffers(requestOptions.publicKey);
  return toJSON(await navigator.credentials.get({ publicKey }));
}
