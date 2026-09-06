/**
 * The live session: one WebSocket, one store, every view.
 *
 * There is exactly one driven browser, so there is exactly one of these. A
 * second socket would mean a second screencast subscriber and two views of the
 * same run that can disagree — so the store is a singleton and views read from
 * it rather than opening their own.
 *
 * Binary messages are screencast frames; text messages are events. Frames are
 * handed to whoever registered `onFrame` (the console's canvas) and dropped
 * otherwise — decoding video for a page that is not showing it is pure waste.
 */
import { defineStore } from 'pinia';

const MAX_LOG = 200;

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
    diagram: null,
    ws: null,
    onFrame: null,      // set by the console view while it is mounted
  }),

  getters: {
    // A run is finished when every step has a verdict or one of them failed.
    lastError: (s) => s.run?.steps.find((x) => x.state === 'fail')?.error ?? null,
  },

  actions: {
    connect() {
      if (this.ws && this.ws.readyState <= 1) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.binaryType = 'blob';
      this.ws = ws;

      ws.onopen = () => { this.connected = true; };
      ws.onclose = () => {
        this.connected = false;
        // The server restarts often while you are working on it. Reconnecting
        // quietly beats a page that looks broken until you reload it.
        setTimeout(() => this.connect(), 1200);
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') return void this.onFrame?.(e.data);
        let ev; try { ev = JSON.parse(e.data); } catch { return; }
        this.handle(ev);
      };
    },

    send(msg) {
      if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
    },

    say(msg, level = 'info') {
      this.log.unshift({ id: `${Date.now()}-${Math.random()}`, at: Date.now(), level, msg });
      if (this.log.length > MAX_LOG) this.log.length = MAX_LOG;
    },

    handle(ev) {
      switch (ev.t) {
        case 'ready':
          this.url = ev.url; this.origins = ev.origins; this.secrets = ev.secrets;
          break;
        case 'origins': this.origins = ev.origins; break;
        case 'secrets': this.secrets = ev.secrets; break;
        case 'targets': this.url = ev.url; this.targets = ev.items; break;
        case 'cursor': this.cursor = { x: ev.x, y: ev.y }; break;
        case 'press': this.ripple++; break;
        case 'diagram': this.diagram = ev.mermaid; break;
        case 'needs.origin': this.needsOrigin = { origin: ev.origin, url: ev.url }; break;

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
