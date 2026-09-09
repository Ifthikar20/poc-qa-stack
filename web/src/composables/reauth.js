/**
 * A sensitive change, and the proof the control plane may ask for first.
 *
 * Every view that changes something the control plane guards — the
 * password, the address, an authenticator, the recovery codes, a Google
 * identity, an allowed origin on the runner — has the same shape: try it;
 * if the answer is "prove it is you first", show the reauthentication
 * sheet; when the sheet says done, try the same thing again. This is that
 * shape once, so no view carries its own copy of the retry.
 *
 *   const guard = useGuarded();
 *   guard.run(() => session.changeEmail(email))   // 'ok' | 'reauthenticate' | 'error' | ...
 *   <ReauthSheet v-if="guard.flow" :flow="guard.flow" @done="guard.proved()" @cancel="guard.cancel()" />
 *
 * `run` answers 'reauthenticate' when the sheet is up, whatever kind of
 * proof was asked for; the store's outcome is passed through otherwise.
 */
import { ref } from 'vue';

const WANTS_PROOF = new Set(['reauthenticate', 'mfa_reauthenticate']);

export function useGuarded() {
  const flow = ref(null);     // 'reauthenticate' | 'mfa_reauthenticate' | null while the sheet is up
  let retry = null;

  async function run(action) {
    const outcome = await action();
    if (WANTS_PROOF.has(outcome)) {
      flow.value = outcome;
      retry = action;
      return 'reauthenticate';
    }
    return outcome;
  }

  /** The sheet proved it: run the thing that was waiting. */
  async function proved() {
    flow.value = null;
    const again = retry;
    retry = null;
    return again ? run(again) : 'ok';
  }

  function cancel() {
    flow.value = null;
    retry = null;
  }

  return { flow, run, proved, cancel };
}
