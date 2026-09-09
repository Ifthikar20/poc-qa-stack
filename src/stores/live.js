/**
 * The live session: one WebSocket, one store, every view.
 *
 * There is exactly one driven browser, so there is exactly one of these. A
 * second socket would mean a second screencast subscriber and two views of the
 * same run that can disagree — so the store is a singleton and views read from
 * it rather than opening their own.
 *
 * Binary messages are screencast frames; text messages are events. Frames are
 * handed to whoever registered `onFrame` (the console's canvas), and the most
 * recent one is KEPT even when nobody is looking.
 *
 * That last part is not an optimisation, it is the fix for a black canvas.
 * Chrome's screencast is damage-driven: a page that is sitting still emits
 * nothing at all. The server primes each new socket with one frame, but the
 * socket opens when the app loads and the canvas only exists once you navigate
 * to the console — so that frame arrived, found no canvas, and was dropped.
 * Open the console on an idle page and you would wait forever for a second
 * frame that was never coming.
 */
import { defineStore } from 'pinia';
import { hasAuth, wsUrl } from '@/config';
import { api } from '@/api';
import { useSession } from '@/stores/session';

const MAX_LOG = 200;
/**
 * Reconnect timing. Fast at first — the server restarts often while you are
 * working on it — and doubling up to thirty seconds, so a runner that is down
 * for lunch is asked once every half minute rather than fifty times a minute,
 * each of which would mint a token and buy a ticket [session-4].
 */
const RECONNECT_MIN_MS = 1200;
const RECONNECT_MAX_MS = 30_000;

export const useLive = defineStore('live', {
  state: () => ({
    connected: false,
    url: null,
    origins: [],
    secrets: [],
    targets: [],
    running: false,
    recording: false,
    recordedFlow: '',
    recordedCount: 0,
    // The run in progress, as the steps report themselves.
    run: null,          // { suite, total, steps: [{i, state, ms, error}] }
    suiteRun: null,     // { suite, cases, done, passed }
    log: [],
    cursor: { x: 0, y: 0 },
    ripple: 0,
    needsOrigin: null,
    navs: [],           // recent navigations, newest first
    console: [],        // the DRIVEN page's console, newest first
    showConsole: false, // off by default: a chatty app would bury the script
    /**
     * How much of a run to perform: 'watch' is the server's own pace, 'fast'
     * removes the performance entirely.
     *
     * Kept here rather than in a view because two different paths start runs —
     * the console over the socket, a suite over HTTP — and a setting that only
     * one of them honoured would be worse than not having it.
     *
     * Per-viewer and remembered, so choosing it once is choosing it. It is not
     * shared state: two people watching the same runner can legitimately
     * disagree about whether they want to watch.
     */
    pace: (() => { try { return localStorage.getItem('gc.pace') === 'fast' ? 'fast' : 'watch'; } catch { return 'watch'; } })(),
    diagram: null,
    ws: null,
    onFrame: null,      // set by the console view while it is mounted
    lastFrame: null,    // held for whoever attaches next
    painted: false,     // has a canvas actually drawn one?
    backoff: RECONNECT_MIN_MS,   // the next reconnect delay; reset on a clean open
    reconnectTimer: null,
    wanted: false,      // did someone ask for a socket? off after disconnect()
  }),

  getters: {
    // A run is finished when every step has a verdict or one of them failed.
    lastError: (s) => s.run?.steps.find((x) => x.state === 'fail')?.error ?? null,
    /**
     * What to send with a run. `undefined` for 'watch' rather than a number:
     * the server's own default is the right answer and it may not be 420.
     */
    paceMs: (s) => (s.pace === 'fast' ? 0 : undefined),
  },

  actions: {
    /**
     * Open the socket — with a ticket, if there is a control plane.
     *
     * A browser cannot set headers on a WebSocket, so whatever proves who is
     * connecting has to ride in the URL, and a URL is what logs and history
     * keep. So the TOKEN never goes there. It buys a ticket over a Bearer
     * header instead — thirty seconds, one use, bound to the token's claims —
     * and the ticket is what opens the socket (docs/AUTH.md §9). A `?t=` in
     * the socket URL is refused by the runner, on purpose.
     *
     * Async, and done EVERY time rather than once at startup: the ticket is
     * single-use, the token behind it lasts ten minutes, and the runner closes
     * the socket when that token expires — so each reconnect is a fresh ticket
     * from a fresh-enough token, and a console after a lunch break comes back
     * rather than sitting on "connecting" with nothing saying why.
     */
    async connect() {
      this.wanted = true;
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
      if (this.ws && this.ws.readyState <= 1) return;

      let ticket = null;
      if (hasAuth()) {
        try { ticket = (await api.socketTicket()).ticket; }
        catch (err) {
          // Signed out, the control plane is down, or the token was refused.
          // A terminal 401 from the control plane has already routed to the
          // login page by now (session.js); anything else is worth another
          // try later, and nothing is gained by opening a socket that the
          // runner will only refuse.
          if (this.wanted && useSession().signedIn) this.scheduleReconnect();
          return;
        }
      }

      // Re-check: awaiting above yields, and a second caller may have opened
      // one in the meantime. Two sockets means two screencast subscribers.
      if (!this.wanted) return;
      if (this.ws && this.ws.readyState <= 1) return;

      const ws = new WebSocket(wsUrl('/ws') + (ticket ? `?ticket=${encodeURIComponent(ticket)}` : ''));
      ws.binaryType = 'blob';
      this.ws = ws;

      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.connected = true;
        this.backoff = RECONNECT_MIN_MS;    // a clean open earns a fast retry next time
        // A reconnect starts with no picture, and the page may be idle.
        this.send({ t: 'frame.request' });
      };
      ws.onclose = (e) => {
        this.connected = false;
        // We no longer know what the executor is doing; `ready` will say.
        this.running = false;
        if (this.ws === ws) this.ws = null;
        // 4401 is the runner closing the socket because the token that
        // bought its ticket has expired. The token is spent; forget it so
        // the next ticket is bought with a fresh one, and reconnect at once
        // rather than backing off — nothing is wrong, it is the clock.
        if (e?.code === 4401) { useSession().forgetToken(); this.backoff = RECONNECT_MIN_MS; }
        // Only when the upgrade was REFUSED — a socket that opened and later
        // dropped is a restarted runner, not a bad token. Forgetting on every
        // close would mint a new token against the control plane on every
        // retry for as long as the runner is down.
        else if (!opened) useSession().forgetToken();
        // The server restarts often while you are working on it. Reconnecting
        // quietly beats a page that looks broken until you reload it — unless
        // disconnect() said not to, which is sign-out.
        if (this.wanted) this.scheduleReconnect();
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') {
          this.lastFrame = e.data;
          return void this.onFrame?.(e.data);
        }
        let ev; try { ev = JSON.parse(e.data); } catch { return; }
        this.handle(ev);
      };
    },

    scheduleReconnect() {
      if (this.reconnectTimer) return;
      const delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
      this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
    },

    /**
     * Close the socket and stop reconnecting: sign-out, and the moment before
     * a new sign-in. The runner drops a socket that says goodbye at once
     * rather than leaving it to time out, so the next person to sign in on
     * this page is not still attached as the previous one [session-3].
     */
    disconnect() {
      this.wanted = false;
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
      this.backoff = RECONNECT_MIN_MS;
      const ws = this.ws;
      this.ws = null;
      if (ws && ws.readyState <= 1) {
        try { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'bye' })); } catch { /* already going */ }
        try { ws.close(1000, 'bye'); } catch { /* already gone */ }
      }
      this.connected = false;
      this.running = false;
    },

    send(msg) {
      if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
    },

    setPace(pace) {
      this.pace = pace === 'fast' ? 'fast' : 'watch';
      try { localStorage.setItem('gc.pace', this.pace); } catch { /* private window */ }
    },

    /**
     * A canvas is ready. Give it the frame we already have, if any, and ask
     * the server for a fresh one — the page may not have moved since.
     */
    attachCanvas(fn) {
      this.onFrame = fn;
      if (this.lastFrame) fn(this.lastFrame);
      this.send({ t: 'frame.request' });
    },

    detachCanvas() {
      this.onFrame = null;
      this.painted = false;
    },

    say(msg, level = 'info') {
      this.log.unshift({ id: `${Date.now()}-${Math.random()}`, at: Date.now(), level, msg });
      if (this.log.length > MAX_LOG) this.log.length = MAX_LOG;
    },

    handle(ev) {
      switch (ev.t) {
        case 'ready':
          this.url = ev.url; this.origins = ev.origins; this.secrets = ev.secrets;
          // Trust the server over whatever we last saw. A socket that dropped
          // mid-run never received run.end, so `running` stayed true here and
          // the Run button was disabled until someone reloaded the page.
          this.running = !!ev.running;
          this.recording = !!ev.recording;
          break;
        case 'origins': this.origins = ev.origins; break;
        case 'secrets': this.secrets = ev.secrets; break;
        // Cheap and immediate; `targets` carries the same URL but arrives
        // after discovery, which is far too late for an address bar.
        case 'url': this.url = ev.url; break;
        case 'targets': this.url = ev.url; this.targets = ev.items; break;
        case 'cursor': this.cursor = { x: ev.x, y: ev.y }; break;
        case 'press': this.ripple++; break;
        case 'diagram': this.diagram = ev.mermaid; break;
        case 'needs.origin':
          this.needsOrigin = { origin: ev.origin, url: ev.url, redirected: ev.redirected };
          break;
        // The runner said no to something this socket asked for. The reason
        // arrives as a log line too; this is for a view that wants to offer
        // the remedy — sign in again — rather than only show the sentence.
        case 'refused':
          if (ev.error === 'step_up_required') this.say('Allowing an origin needs a recent sign-in — sign in again, then retry', 'error');
          break;
        // The driven page's own console. Capped like the log — a page in a
        // render loop can print faster than anyone can read.
        case 'console':
          this.console.unshift({ id: `${Date.now()}-${Math.random()}`, ...ev });
          if (this.console.length > MAX_LOG) this.console.length = MAX_LOG;
          break;
        case 'nav':
          this.navs.unshift({ id: `${Date.now()}-${Math.random()}`, ...ev });
          if (this.navs.length > 25) this.navs.length = 25;
          break;

        case 'record.state': this.recording = ev.on; break;
        case 'recorded':
          this.recordedFlow = ev.flow ?? this.recordedFlow;
          this.recordedCount = ev.count ?? this.recordedCount;
          break;

        case 'suite.start':
          this.suiteRun = { suite: ev.suite, cases: ev.cases, done: 0, passed: 0 };
          this.say(`running ${ev.cases} case${ev.cases === 1 ? '' : 's'} of ${ev.suite}`);
          break;
        case 'suite.end':
          this.suiteRun = null;
          this.say(`${ev.suite}: ${ev.passed}/${ev.total} cases passed`,
                   ev.passed === ev.total ? 'info' : 'error');
          break;

        case 'run.start':
          this.running = true;
          this.run = {
            suite: ev.suite, caseName: ev.caseName ?? null, total: ev.total,
            steps: Array.from({ length: ev.total }, (_, i) => ({ i, state: 'idle', ms: null, error: null })),
          };
          break;
        case 'step.start': if (this.run) this.run.steps[ev.i] = { ...this.run.steps[ev.i], state: 'run', step: ev.step }; break;
        case 'step.pass':  if (this.run) this.run.steps[ev.i] = { ...this.run.steps[ev.i], state: 'pass', ms: ev.ms }; break;
        case 'step.fail':
          if (this.run) this.run.steps[ev.i] = { ...this.run.steps[ev.i], state: 'fail', ms: ev.ms, error: ev.error };
          break;
        case 'run.end':
          this.running = false;
          if (this.suiteRun) { this.suiteRun.done++; if (ev.ok) this.suiteRun.passed++; }
          break;

        case 'imported':
          this.recordedFlow = ev.flow;
          this.recordedCount = ev.steps;
          break;
        case 'log': this.say(ev.msg, ev.level); break;
      }
    },
  },
});
