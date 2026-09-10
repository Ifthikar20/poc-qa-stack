<script setup>
/**
 * The one page a stranger can reach.
 *
 * A port of the Cansee landing page (ftb-ui, src/pages/LandingPage.vue): the
 * same editorial cream-and-ink system — Instrument Serif for display, Inter for
 * everything else, hierarchy from serif against sans rather than from bold —
 * and the same floating nav pill, split hero, trust strip, alternating feature
 * rows, sticky FAQ aside and ink footer. What changed on the way over:
 *
 *   - The words are ghostclick's, and every claim is one the product backs up
 *     on the next screen. A landing page that oversells a tool is one the first
 *     real run contradicts.
 *   - The fonts are bundled from @fontsource rather than fetched from Google.
 *     The runner serves this app under `default-src 'self'`, which refuses the
 *     stylesheet and the font files from any other origin.
 *   - The watercolour videos are LandingWell, a CSS gradient — the same CSP,
 *     and the clips are tens of megabytes.
 *   - Every call to action is sign in.
 *
 * Signed in, the router never sends anyone here (meta.anonymousOnly), and with
 * no control plane there is nothing to sign in to, so the guard sends you to
 * the suites. This page exists for exactly one state.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import LandingWell from '@/components/landing/LandingWell.vue';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';

const signIn = { name: 'login' };

const scrolled = ref(false);
const activeFlow = ref(0);
const activeWhy = ref(0);
const hero = ref(null);

const flows = ['sign in', 'check out', 'reset a password', 'update a profile'];

const useCases = [
  {
    key: 'watch', label: 'Watch a failing step happen', feature: 'Live console', anchor: '#why',
    blurb: 'A real Chromium streamed to you, with the cursor it is clicking with.',
    icon: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  },
  {
    key: 'markup', label: 'Survive a markup rewrite', feature: 'Case language', anchor: '#uc-language',
    blurb: 'Steps name the button and the role it plays, so a renamed class breaks nothing.',
    icon: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'],
  },
  {
    key: 'sso', label: 'Record a flow behind SSO', feature: 'Extension', anchor: '#uc-record',
    blurb: 'Record in your own signed-in Chrome, then replay it in ghostclick.',
    icon: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
  },
  {
    key: 'secrets', label: 'Keep passwords out of scripts', feature: 'Vault', anchor: '#uc-language',
    blurb: 'A $KEY is read on the server as the field is filled — never logged.',
    icon: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  },
  {
    key: 'onboard', label: 'Onboard an app from one URL', feature: 'Suites', anchor: '#uc-suites',
    blurb: 'It opens the page, asserts you reached it, and runs that.',
    icon: ['M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  },
  {
    key: 'defects', label: 'Find what is actually broken', feature: 'Defects', anchor: '#uc-defects',
    blurb: 'Failures grouped by the sentence they stopped on, closing themselves when fixed.',
    icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M12 8v4', 'M12 16h.01'],
  },
];

/** The hero's step list, labelled the way vocabulary.js labels steps. */
const heroSteps = [
  { label: '▶ staging.acme.com/login', ms: '212ms' },
  { label: 'fill Email ← vault', ms: '1540ms' },
  { label: 'fill Password ← vault', ms: '1250ms' },
  { label: 'click Sign in', ms: '1040ms' },
  { label: 'url ~ /dashboard', ms: '310ms' },
  { label: 'text: Welcome back', ms: '120ms' },
];

const whyItems = [
  { num: '01', label: 'Watch the run, not a log.' },
  { num: '02', label: 'Name the button, not the markup.' },
  { num: '03', label: 'The diagram cannot drift from the test.' },
];

/** The end of the bundled Meridian run, whose username field keeps 16 of 20 characters. */
const lastSteps = [
  { n: 8, label: 'fill profile.username' },
  { n: 9, label: 'click profile.save' },
  { n: 10, label: 'text: Profile saved' },
  { n: 11, label: 'profile.username = 20 chars', failed: true },
];

/** The same run as the report draws it (diagram.js, block-beta). */
const reportCells = [
  { t: '1 ▶ localhost:3000/demo.html', wide: true },
  { t: '2 fill auth.email ← vault' },
  { t: '3 fill auth.password ← vault' },
  { t: '4 click auth.submit' },
  { t: '5 click nav.settings' },
  { t: '6 url ~ /settings', check: true },
  { t: '7 click settings.profileTab' },
  { t: '8 fill profile.username' },
  { t: '9 click profile.save' },
  { t: '10 text: Profile saved', check: true },
  { t: '11 profile.username = 20 chars', check: true, fail: true, wide: true },
];

const showcaseFeatures = [
  {
    key: 'language',
    nav: 'Case language',
    eyebrow: 'CASE LANGUAGE',
    headline: 'Write the steps a person would read aloud.',
    desc: 'A case names what is on the screen and the role it plays — the button called Sign in, the textbox called Password — which is how the browser itself describes the page. Every case is parsed and validated with the same function the executor uses, so one that cannot run is refused at save rather than discovered at 2am.',
    bullets: [
      'Targets by role, label, text, placeholder or test id — matched exactly',
      'A $KEY is read from the vault on the server, at the moment the field is filled',
      'No evaluate and no raw selectors: an unknown step is an error, never a skipped one',
    ],
  },
  {
    key: 'record',
    nav: 'Recording',
    eyebrow: 'TEACH MODE & EXTENSION',
    headline: 'Record a flow instead of writing it.',
    desc: 'Press Record and use your app on the canvas — or open the Chrome extension where your own browser is already signed in, behind SSO, a VPN or a real login. The page proposes several names for each element you touch, and ghostclick keeps one only if it resolves to exactly that element.',
    bullets: [
      'Names tried most stable first: test id, label, role and name, placeholder, text',
      'A typed password is dropped in the browser and recorded as $TODO',
      'Recordings pass the same validation as everything else, and never run on their own',
    ],
  },
  {
    key: 'suites',
    nav: 'Suites',
    eyebrow: 'SUITES',
    headline: 'Onboard a project from one URL.',
    desc: "Paste your app's address and press Add and test. ghostclick opens the page, names the suite from its title, asserts you reached it and runs that — so you learn whether it can drive your app before deciding how much to invest. A suite covers one origin, and allowing it is a decision a person makes, once.",
    bullets: [
      'Same-origin links on the page become one-click pages to add',
      "A scan reads each page's accessibility tree; tick what should always be there",
      'Each suite is one readable JSON file that diffs, reviews and merges like source',
    ],
  },
  {
    key: 'defects',
    nav: 'Defects',
    eyebrow: 'RUN HISTORY & DEFECTS',
    headline: 'What is actually broken, not just what happened.',
    desc: 'Every run lands in history with the step it stopped on. Defects group those failures by the sentence they stopped on, so one broken step that takes down four cases is one defect with four cases attached — and it closes itself when an affected case passes again.',
    bullets: [
      'Runs per day, pass rate and median run time, per suite and overall',
      'One row per distinct failure: how often, which step, which cases',
      'Nothing hand-managed, so there is no status to remember to update',
    ],
  },
];

/* ── Case language mock ── */
const caseLines = [
  { text: 'testcase TD' },
  { text: '  home(("https://staging.acme.com/login"))', reads: [['Is', 'the entry — goto, on an allowed origin']], drawn: '▶ staging.acme.com/login' },
  { text: '  dash["/dashboard"]', reads: [['On arrival', 'the URL contains /dashboard']], drawn: 'url ~ /dashboard' },
  { text: '  home --> dash' },
  { text: "    fill 'Email' : textbox = $QA_USER", reads: [['Locator', "getByRole('textbox', { name: 'Email', exact: true })"], ['Value', 'vault key QA_USER, read on the server']], drawn: 'fill Email ← vault' },
  { text: "    fill 'Password' : textbox = $QA_PASS", reads: [['Locator', "getByRole('textbox', { name: 'Password', exact: true })"], ['Value', 'vault key QA_PASS, read on the server']], drawn: 'fill Password ← vault' },
  { text: "    click 'Sign in' : button", reads: [['Locator', "getByRole('button', { name: 'Sign in', exact: true })"]], drawn: 'click Sign in' },
  { text: "    see 'Welcome back'", reads: [['Checks', 'the text is visible on the page']], drawn: 'text: Welcome back' },
  { text: '    click css:#usr_nm_2', error: 'Unknown target strategy "css"' },
];
const pinnedLine = ref(6);
const pinned = computed(() => caseLines[pinnedLine.value]);

/* ── Recording mock ── */
const recordedFlow = `testcase TD
  n0(("https://staging.acme.com/login"))
  n1["/dashboard"]

  n0 --> n1
    fill 'Email' : label = 'qa@acme.com'
    fill 'Password' : label = $TODO
    click 'Sign in' : button`;

const candidates = [
  { target: 'testid:', result: 'no test id on it', verdict: 'none' },
  { target: 'label:Sign in', result: 'no match', verdict: 'none' },
  { target: 'button:Sign in', result: 'exactly one — the button you clicked', verdict: 'kept' },
  { target: 'text:Sign in', result: 'two matches — the header has one too', verdict: 'ambiguous' },
];

/* ── Suites mock ── */
const suiteLinks = [
  { name: 'Pricing', path: '/pricing' },
  { name: 'Billing', path: '/#/billing' },
  { name: 'Settings', path: '/settings' },
  { name: 'Docs', path: '/docs' },
];
const addedPages = ref(['/#/billing']);
function togglePage(path) {
  addedPages.value = addedPages.value.includes(path)
    ? addedPages.value.filter((p) => p !== path)
    : [...addedPages.value, path];
}

/* ── Defects mock ── */
const defects = [
  {
    error: 'expected the URL to contain "/dashboard"', open: true, hits: 6, step: 5, last: '2 h ago', suite: 'Acme staging',
    cases: ['Sign in works', 'Invite a member', 'Update profile', 'Change plan'],
  },
  {
    error: 'profile.username is 16 chars, expected 20 chars', open: true, hits: 3, step: 11, last: '1 d ago', suite: 'Meridian',
    cases: ['Username length boundary'],
  },
  {
    error: 'expected HTTP 200, got 404 at https://staging.acme.com/pricing', open: false, hits: 2, step: 2, last: '4 d ago', suite: 'Acme staging',
    cases: ['Pricing page loads'],
  },
];
const pinnedDefect = ref(defects[0].error);
function toggleDefect(d) {
  pinnedDefect.value = pinnedDefect.value === d.error ? null : d.error;
}

const steps = [
  { title: 'Allow an origin', desc: "Paste your app's address. The first time, ghostclick stops and asks a person to allow that origin — nothing generated can press that button." },
  { title: 'Add and test', desc: 'It opens the page, names the suite from its title, asserts you reached it and runs that — so you learn whether it can drive your app before investing more.' },
  { title: 'Record your flows', desc: 'Press Record and use your app on the canvas, or the Chrome extension where you are already signed in. Passwords become vault references.' },
  { title: 'Watch, then read the defects', desc: 'Run the suite and watch each step land. Failures group into defects that close themselves when an affected case passes again.' },
];

const faqItems = [
  { q: 'Does it take over my mouse?',
    a: 'No. A run drives a separate browser that ghostclick launched and streams a video of it to your console; the arrow is drawn over that video. Your own cursor and tabs are never involved — which is also why a run behaves the same on a laptop, a server and in CI.' },
  { q: 'Do I have to write CSS selectors?',
    a: 'No, and you cannot. A target is a small grammar of semantic locators — button:Sign in, label:Username, text:Profile saved, placeholder:Search, testid:save-btn — matched exactly, so one target always names one element.' },
  { q: 'Where do passwords go?',
    a: 'Into a vault beside the runner. A case refers to $QA_PASS by name and the value is read on the server as the field is filled, so it never reaches the page you are reading, a log, or the diagram. A password typed while recording is written as $TODO.' },
  { q: 'Can it test an app behind SSO or a VPN?',
    a: 'Record it with the Chrome extension, where your own browser is already signed in. The extension holds your next click, asks what you meant by it, and sends the flow to ghostclick through the same validation as everything else. It is never run automatically.' },
  { q: 'Why not just replay my clicks by coordinates?',
    a: 'Every recorded click does keep where the pointer was, as a comment beside the step. The step itself names the element instead, because a coordinate is only right for the layout it was recorded on.' },
  { q: 'Can it open any website?',
    a: 'Only origins a person has allowed, one at a time — a generated plan or a script can never add one. The private network is refused by name even when the list says everything.' },
  { q: 'Who can sign up?',
    a: 'Accounts are by invitation while ghostclick is in preview. Organisations have owners, admins and members: origins and the vault are an owner’s or admin’s to change, and members run and view.' },
];

/* ── Mobile nav sheet ──
   The desktop pill collapses below 1024px, so everything inside it needs a
   home. The sheet owns focus while open and hands it back on close. */
const navOpen = ref(false);
const navSheet = ref(null);
let navReturnFocus = null;

function openNav() {
  navReturnFocus = document.activeElement;
  navOpen.value = true;
}
function closeNav() {
  navOpen.value = false;
}
function toggleNav() {
  if (navOpen.value) closeNav();
  else openNav();
}

function onNavKeydown(ev) {
  if (!navOpen.value) return;
  if (ev.key === 'Escape') { closeNav(); return; }
  if (ev.key !== 'Tab' || !navSheet.value) return;
  const focusables = navSheet.value.querySelectorAll('a[href], button:not([disabled])');
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
}

/**
 * In-page links scroll here instead of going through the router.
 *
 * A bare `#features` would reach vue-router as a navigation, and this router's
 * scrollBehavior answers "the top" for every navigation — so the page would
 * land on the section and be sent straight back up.
 */
function onAnchor(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest?.('a[href^="#"]');
  if (!link) return;
  const target = document.getElementById(link.getAttribute('href').slice(1));
  if (!target) return;
  e.preventDefault();
  closeNav();
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
}

watch(navOpen, async (open) => {
  document.body.style.overflow = open ? 'hidden' : '';
  updateStickyCta();
  if (open) {
    await nextTick();
    navSheet.value?.querySelector('a[href], button:not([disabled])')?.focus();
  } else if (navReturnFocus && document.contains(navReturnFocus)) {
    navReturnFocus.focus();
    navReturnFocus = null;
  }
});

/* ── Count-up stats ── */
const STAT_TARGETS = [5, 10, 6];
const stats = ref([0, 0, 0]);
const statDisplay = computed(() => stats.value.map((n) => Math.round(n)));
const statsSection = ref(null);
let statsAnimated = false;

function animateStats() {
  if (statsAnimated) return;
  statsAnimated = true;
  const start = performance.now();
  const frame = (t) => {
    const p = Math.min(1, (t - start) / 1600);
    const eased = 1 - (1 - p) ** 3;
    stats.value = STAT_TARGETS.map((n) => n * eased);
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ── Sticky CTA: after the hero, never over the final CTA ── */
const showStickyCta = ref(false);
const finalCtaSection = ref(null);
let pastHero = false;
let onFinalCta = false;

function updateStickyCta() {
  showStickyCta.value = pastHero && !onFinalCta && !navOpen.value;
}

const cleanups = [];

onMounted(() => {
  const onScroll = () => { scrolled.value = window.scrollY > 40; };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  cleanups.push(() => window.removeEventListener('scroll', onScroll));

  const reveal = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const delay = Number(e.target.dataset.delay || 0);
      setTimeout(() => e.target.classList.add('in'), delay);
      reveal.unobserve(e.target);
    }
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.lp .anim').forEach((el) => reveal.observe(el));
  cleanups.push(() => reveal.disconnect());

  const cycle = setInterval(() => { activeFlow.value = (activeFlow.value + 1) % flows.length; }, 2800);
  cleanups.push(() => clearInterval(cycle));

  const desktop = window.matchMedia('(min-width: 1024px)');
  const onDesktop = (e) => { if (e.matches) closeNav(); };
  desktop.addEventListener('change', onDesktop);
  document.addEventListener('keydown', onNavKeydown);
  cleanups.push(() => {
    desktop.removeEventListener('change', onDesktop);
    document.removeEventListener('keydown', onNavKeydown);
  });

  const statsObs = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { animateStats(); statsObs.disconnect(); }
  }, { threshold: 0.3 });
  statsObs.observe(statsSection.value);

  const heroObs = new IntersectionObserver(([e]) => {
    pastHero = !e.isIntersecting || e.intersectionRatio < 0.2;
    updateStickyCta();
  }, { threshold: [0, 0.2, 0.5] });
  heroObs.observe(hero.value);

  const finalObs = new IntersectionObserver(([e]) => {
    onFinalCta = e.isIntersecting;
    updateStickyCta();
  }, { threshold: 0.2 });
  finalObs.observe(finalCtaSection.value);

  cleanups.push(() => { statsObs.disconnect(); heroObs.disconnect(); finalObs.disconnect(); });
});

onUnmounted(() => {
  cleanups.forEach((fn) => fn());
  document.body.style.overflow = '';
});
</script>

<template>
  <div id="top" class="lp" @click="onAnchor">
    <!-- ═══ Nav — floating pill ═══ -->
    <header class="nav" :class="{ scrolled }">
      <div class="nav-pill">
        <a href="#top" class="brand">
          <span class="brand-mark" aria-hidden="true"><i /></span>
          <span class="brand-word">ghost<span>click</span></span>
          <span class="brand-beta">Preview</span>
        </a>

        <nav class="nav-links" aria-label="Primary">
          <div class="nav-uc">
            <a href="#features" class="nav-uc-trigger" aria-haspopup="true">
              Use Cases
              <svg class="nav-uc-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </a>
            <div class="nav-uc-panel" role="menu" aria-label="Use cases">
              <span class="nav-uc-eyebrow">By use case</span>
              <div class="nav-uc-grid">
                <a v-for="uc in useCases" :key="uc.key" :href="uc.anchor" class="nav-uc-item" role="menuitem">
                  <span class="nav-uc-ic" aria-hidden="true">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path v-for="(d, di) in uc.icon" :key="di" :d="d" />
                    </svg>
                  </span>
                  <span class="nav-uc-txt">
                    <span class="nav-uc-label">
                      {{ uc.label }}
                      <span class="nav-uc-tag">{{ uc.feature }}</span>
                    </span>
                    <span class="nav-uc-blurb">{{ uc.blurb }}</span>
                  </span>
                </a>
              </div>
              <a href="#how" class="nav-uc-foot">
                <span>Every use case runs in the same real, watchable browser.</span>
                <span class="nav-uc-foot-link">See how it works
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
              </a>
            </div>
          </div>
          <a href="#features">Features</a>
          <a href="#how">How It Works</a>
        </nav>

        <div class="nav-right">
          <RouterLink :to="signIn" class="nav-link-text">Sign in</RouterLink>
          <RouterLink :to="signIn" class="nav-cta">
            Get Started
            <span class="nav-cta-arrow" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9" /></svg>
            </span>
          </RouterLink>
        </div>

        <button
          class="nav-burger"
          type="button"
          :aria-expanded="navOpen ? 'true' : 'false'"
          aria-controls="nav-sheet"
          :aria-label="navOpen ? 'Close menu' : 'Open menu'"
          @click="toggleNav"
        >
          <span class="nav-burger-bar" />
          <span class="nav-burger-bar" />
        </button>
      </div>

      <div id="nav-sheet" ref="navSheet" class="nav-sheet" :class="{ 'is-open': navOpen }" :inert="!navOpen">
        <span class="nav-sheet-eyebrow">Use cases</span>
        <a v-for="uc in useCases" :key="uc.key" :href="uc.anchor" class="nav-sheet-uc">{{ uc.label }}</a>
        <span class="nav-sheet-eyebrow">More</span>
        <a href="#features">Features</a>
        <a href="#how">How It Works</a>
        <RouterLink :to="signIn" class="nav-sheet-login" @click="closeNav">Sign in</RouterLink>
        <RouterLink :to="signIn" class="nav-sheet-cta" @click="closeNav">Get Started</RouterLink>
      </div>
    </header>

    <!-- ═══ Hero ═══ -->
    <section ref="hero" class="hero">
      <div class="wrap hero-grid">
        <div class="hero-left">
          <h1 class="hero-h anim" data-anim="hero">
            BROWSER TESTING,<br />
            WATCHED.<br />
            RECORDED.<br />
            <em>NO SELECTORS.</em>
          </h1>
          <div class="hero-bottom anim" data-anim="fade-up" data-delay="60">
            <p class="hero-p">
              Watch a real Chromium
              <span class="hero-word-cycler" aria-live="off">
                <TransitionGroup name="word-cycle">
                  <span :key="flows[activeFlow]" class="hero-word">{{ flows[activeFlow] }}</span>
                </TransitionGroup>
              </span>
              on your app, one visible step at a time. Record a flow instead of writing it — and
              when something breaks, watch the step it broke on.
            </p>
            <div class="hero-actions">
              <RouterLink :to="signIn" class="hero-cta">
                Get Started
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </RouterLink>
              <span class="hero-note">Accounts are by invitation while this is in preview.</span>
            </div>
          </div>
        </div>

        <!-- The hero media: the console, drawn rather than streamed. The arrow is
             the real one's path (ConsoleView.vue) and the steps are labelled the
             way vocabulary.js labels them. Pure CSS — it costs no script. -->
        <div class="hero-right anim" data-anim="fade-up" data-delay="220">
          <div class="hero-stage">
            <LandingWell :variant="0" :tint="0.12" />
            <div
              class="console"
              role="img"
              aria-label="The ghostclick console running a case: a cursor fills in the email and password on a staging sign-in page and clicks Sign in."
            >
              <div class="console-bar">
                <span class="console-dots"><i /><i /><i /></span>
                <span class="console-url">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.5" y="7" width="9" height="6" rx="1.5" /><path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" /></svg>
                  <b>staging.acme.com</b><span>/login</span>
                </span>
                <span class="console-live"><i />Live</span>
              </div>
              <div class="console-page">
                <div class="console-login">
                  <span class="console-brand"><i />Acme</span>
                  <span class="console-h">Sign in to Acme</span>
                  <span class="console-field">
                    Email
                    <span class="console-input is-email"><span class="console-typed">qa@acme.com</span></span>
                  </span>
                  <span class="console-field">
                    Password
                    <span class="console-input is-password"><span class="console-typed">••••••••••••</span></span>
                  </span>
                  <span class="console-submit">Sign in</span>
                  <i class="console-ripple" />
                  <svg class="console-cursor" viewBox="0 0 24 24"><path d="M5 2l14 9-6 1.2L10.2 20z" fill="var(--brand)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" /></svg>
                </div>
              </div>
              <ol class="console-steps">
                <li v-for="(s, i) in heroSteps" :key="s.label">
                  <span class="n">{{ i + 1 }}</span>
                  <span class="ok">✓</span>
                  <span class="lbl">{{ s.label }}</span>
                  <span class="ms">{{ s.ms }}</span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ Trust strip ═══ -->
    <section class="trust anim" data-anim="fade-up">
      <div class="trust-row">
        <span class="trust-label">Drives</span>
        <span class="trust-item">A real Chromium</span>
        <span class="trust-item">Playwright locators</span>
        <span class="trust-item">Chrome DevTools screencast</span>
        <span class="trust-item">On a laptop, a server, or CI</span>
      </div>
    </section>

    <!-- ═══ Why this exists — split editorial layout ═══ -->
    <section id="why" class="why anim" data-anim="fade-up">
      <div class="wrap why-wrap">
        <div class="why-split">
          <div class="why-left">
            <h2 class="why-h">
              Most test failures arrive as a log.<br />
              <span class="why-h-quiet">You should get to watch them.</span>
            </h2>
            <p class="why-sub">
              A red build tells you that something broke, and rarely what the page looked like when
              it did. ghostclick drives a separate, real browser a step at a time and streams it to
              you — so a failure is something you saw, on the step it happened.
            </p>

            <ul class="why-list">
              <li v-for="(w, i) in whyItems" :key="w.num" class="why-row">
                <button
                  type="button"
                  class="why-item"
                  :class="{ 'is-active': activeWhy === i }"
                  :aria-pressed="activeWhy === i ? 'true' : 'false'"
                  @click="activeWhy = i"
                >
                  <span class="why-item-num">{{ w.num }}</span>
                  <span class="why-item-label">{{ w.label }}</span>
                  <span class="why-item-arrow" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9" /></svg>
                  </span>
                </button>
              </li>
            </ul>
          </div>

          <div class="why-right">
            <div class="why-panel">
              <div class="why-demo">
                <Transition name="why-demo-fade" mode="out-in">
                  <div v-if="activeWhy === 0" key="demo-0" class="why-demo-panel">
                    <div class="why-demo-head">
                      <span class="why-demo-dot" />
                      Run · Username length boundary
                    </div>
                    <div class="why-demo-body">
                      The end of the run, step by step:
                      <ol class="why-demo-list">
                        <li v-for="s in lastSteps" :key="s.n" :data-n="s.n" :class="s.failed ? 'is-failed' : 'hi'">
                          {{ s.label }}
                          <span v-if="s.failed" class="why-demo-you-tag">
                            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true"><path d="M13 5H1M1 5l4-4M1 5l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                            It broke here
                          </span>
                        </li>
                      </ol>
                    </div>
                    <div class="why-demo-foot">
                      The page said Profile saved. <strong>The field kept 16 characters.</strong>
                    </div>
                  </div>

                  <div v-else-if="activeWhy === 1" key="demo-1" class="why-demo-panel">
                    <div class="why-demo-head">
                      <span class="why-demo-dot" />
                      One button, two ways to point at it
                    </div>
                    <div class="why-demo-body">
                      <div class="why-target is-brittle">
                        <code>#login-form > div:nth-child(3) > button.btn-primary</code>
                        <span>breaks on the next redesign</span>
                      </div>
                      <div class="why-target">
                        <code>click 'Sign in' : button</code>
                        <span>what the page calls it, and the role it plays</span>
                      </div>
                      <p class="why-demo-label">On this page</p>
                      <div class="why-chips">
                        <span>Sign in</span><span>Email</span><span>Password</span><span>Forgot password?</span>
                      </div>
                    </div>
                    <div class="why-demo-foot">
                      Matched <strong>exactly</strong> — one target names one element.
                    </div>
                  </div>

                  <div v-else key="demo-2" class="why-demo-panel">
                    <div class="why-demo-head">
                      <span class="why-demo-dot" />
                      Run report · 11 steps · 1 failed
                    </div>
                    <div class="why-grid">
                      <span
                        v-for="c in reportCells"
                        :key="c.t"
                        class="why-cell"
                        :class="{ 'is-wide': c.wide, 'is-check': c.check, 'is-fail': c.fail }"
                      >{{ c.t }}</span>
                    </div>
                    <div class="why-demo-foot">
                      Drawn from <strong>the same structure the executor walks</strong> — so it cannot describe a different test.
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
        </div>

        <div class="why-cta anim" data-anim="fade-up" data-delay="300">
          <span class="why-cta-line">Every run is something you can <strong>watch, replay, and paste into a ticket</strong>.</span>
          <RouterLink :to="signIn" class="why-cta-btn">
            Sign in to run a suite
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ═══ Stats ═══ -->
    <section ref="statsSection" class="stats anim" data-anim="fade-up">
      <div class="wrap">
        <div class="stats-card anim" data-anim="framer">
          <LandingWell :variant="1" :tint="0.72" />

          <div class="stats-card-content">
            <div class="stats-card-top">
              <h2 class="stats-card-h anim" data-anim="hero" data-delay="400">
                A browser that goes where it is told<br />
                <em>should be told very little.</em>
              </h2>
              <p class="stats-card-sub anim" data-anim="fade-up" data-delay="550">
                Every navigation passes an origin allowlist that only a person can add to.
                Credentials are named in a case and resolved on the server. An automation that reads
                untrusted pages gets a small, fixed vocabulary — and nothing more.
              </p>
            </div>

            <div class="stats-card-bottom">
              <div class="stats-card-metric anim" data-anim="fade-up" data-delay="700">
                <div class="stats-card-num">{{ statDisplay[0] }}</div>
                <div class="stats-card-label">Verbs that act on a page</div>
                <div class="stats-card-note">click, hover, fill, wait and scroll — there is no evaluate, and no raw selector</div>
              </div>
              <div class="stats-card-metric anim" data-anim="fade-up" data-delay="850">
                <div class="stats-card-num"><span class="stats-card-prefix">~</span>{{ statDisplay[1] }}</div>
                <div class="stats-card-label">Frames a second</div>
                <div class="stats-card-note">streamed from the driven Chromium to your console while a run plays</div>
              </div>
              <div class="stats-card-metric anim" data-anim="fade-up" data-delay="1000">
                <div class="stats-card-num">{{ statDisplay[2] }}</div>
                <div class="stats-card-label">Ways to name an element</div>
                <div class="stats-card-note">role, label, text, placeholder or test id — or an alias that resolves to one</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ Feature showcase — alternating rows ═══ -->
    <section id="features" class="feature-showcase">
      <div class="wrap">
        <div
          v-for="(f, i) in showcaseFeatures"
          :id="`uc-${f.key}`"
          :key="f.key"
          class="feature-row anim"
          :class="{ 'is-reverse': i % 2 === 1 }"
          data-anim="fade-up"
        >
          <div class="feature-copy">
            <span class="feature-eyebrow">{{ f.eyebrow }}</span>
            <h2 class="feature-h">{{ f.headline }}</h2>
            <p class="feature-desc">{{ f.desc }}</p>
            <ul class="feature-bullets">
              <li v-for="b in f.bullets" :key="b"><span class="feature-bullet-dot" />{{ b }}</li>
            </ul>
          </div>

          <div class="feature-visual">
            <LandingWell :variant="i + 2" />

            <!-- CASE LANGUAGE — pick a line to see what it reads as. -->
            <div v-if="f.key === 'language'" class="mock-card">
              <div class="mock-head">
                <div class="mock-title">Case <span class="mock-count">Sign in works</span></div>
                <span class="mock-chip">validated on save</span>
              </div>
              <div class="mock-code">
                <button
                  v-for="(l, idx) in caseLines"
                  :key="idx"
                  type="button"
                  class="mock-code-line"
                  :class="{ 'is-pick': l.reads || l.error, 'is-pinned': pinnedLine === idx, 'is-bad': l.error }"
                  :disabled="!(l.reads || l.error)"
                  @click="pinnedLine = idx"
                >
                  <span class="mock-code-n">{{ idx + 1 }}</span>
                  <span class="mock-code-text">{{ l.text }}</span>
                  <span class="mock-code-mark">{{ l.error ? '✕' : l.reads ? '✓' : '' }}</span>
                </button>
              </div>
              <Transition name="why-demo-fade" mode="out-in">
                <div v-if="pinned.error" key="refused" class="mock-reads is-bad">
                  <div class="mock-reads-title">Refused at save</div>
                  <div class="mock-reads-error">{{ pinned.error }}</div>
                  <div class="mock-reads-note">A target is parsed into a fixed strategy and looked up — never read as a selector.</div>
                </div>
                <div v-else :key="pinnedLine" class="mock-reads">
                  <div class="mock-reads-title">Reads as</div>
                  <div v-for="[k, v] in pinned.reads" :key="k" class="mock-detail-row">
                    <span class="mock-detail-label">{{ k }}</span>
                    <span class="mock-detail-value mock-mono">{{ v }}</span>
                  </div>
                  <div class="mock-detail-row">
                    <span class="mock-detail-label">Drawn as</span>
                    <span class="mock-detail-value mock-mono">{{ pinned.drawn }}</span>
                  </div>
                </div>
              </Transition>
            </div>

            <!-- TEACH MODE — what the recorder wrote, and how one name was chosen. -->
            <div v-else-if="f.key === 'record'" class="mock-card">
              <div class="mock-head">
                <div class="mock-title">Recording <span class="mock-live" aria-hidden="true" /></div>
                <span class="mock-count">3 steps</span>
              </div>
              <pre class="mock-flow">{{ recordedFlow }}</pre>
              <div class="mock-cands">
                <div class="mock-reads-title">How “Sign in” got its name — most stable first</div>
                <div v-for="c in candidates" :key="c.target" class="mock-cand" :class="`is-${c.verdict}`">
                  <span class="mock-mono">{{ c.target }}</span>
                  <span class="mock-cand-result">{{ c.result }}</span>
                  <span class="mock-cand-mark">{{ c.verdict === 'kept' ? 'kept' : c.verdict === 'ambiguous' ? '✕' : '—' }}</span>
                </div>
              </div>
              <div class="mock-note">
                <span class="mock-mono">$TODO</span> — the typed password was dropped in the browser. It fails loudly on replay until it points at a vault key.
              </div>
            </div>

            <!-- SUITES — one URL in, one origin allowed, the first case run. -->
            <div v-else-if="f.key === 'suites'" class="mock-card">
              <div class="mock-head">
                <div class="mock-title">Test suites <span class="mock-count">1 suite</span></div>
              </div>
              <div class="mock-add">
                <span class="mock-url"><span class="mock-url-scheme">https://</span>staging.acme.com</span>
                <span class="mock-btn">Add and test</span>
              </div>
              <div class="mock-suite">
                <div>
                  <div class="mock-suite-name">Acme staging</div>
                  <div class="mock-suite-sub">named from the page title</div>
                </div>
                <span class="mock-chip is-ink">Passed</span>
              </div>
              <div>
                <div class="mock-detail-row">
                  <span class="mock-detail-label">Origin</span>
                  <span class="mock-detail-value">allowed by a person, once</span>
                </div>
                <div class="mock-detail-row">
                  <span class="mock-detail-label">First case</span>
                  <span class="mock-detail-value mock-mono">url ~ /</span>
                </div>
              </div>
              <div class="mock-reads-title">Linked from the pages you scanned</div>
              <div class="mock-links">
                <button
                  v-for="l in suiteLinks"
                  :key="l.path"
                  type="button"
                  class="mock-link"
                  :class="{ 'is-added': addedPages.includes(l.path) }"
                  :aria-pressed="addedPages.includes(l.path) ? 'true' : 'false'"
                  @click="togglePage(l.path)"
                >
                  {{ addedPages.includes(l.path) ? '✓' : '+' }} {{ l.name }} <span class="mock-mono">{{ l.path }}</span>
                </button>
              </div>
              <div class="mock-foot">
                <span>{{ addedPages.length + 1 }} page{{ addedPages.length ? 's' : '' }} in this suite</span>
                <span>Next — expectations</span>
              </div>
            </div>

            <!-- DEFECTS — one row per distinct failure; pick one for its cases. -->
            <div v-else class="mock-card">
              <div class="mock-head">
                <div class="mock-title">Defects <span class="mock-count">2 open</span></div>
                <span class="mock-count">last 14 days</span>
              </div>
              <div class="mock-def-list">
                <div
                  v-for="d in defects"
                  :key="d.error"
                  class="mock-def"
                  :class="{ 'is-pinned': pinnedDefect === d.error }"
                  @click="toggleDefect(d)"
                >
                  <div class="mock-def-head">
                    <span class="mock-def-state" :class="{ 'is-open': d.open }">{{ d.open ? 'Open' : 'Passing again' }}</span>
                    <span class="mock-def-meta">{{ d.hits }} times · step {{ d.step }}</span>
                  </div>
                  <div class="mock-def-error mock-mono">{{ d.error }}</div>
                  <div class="mock-def-sub">
                    {{ d.cases.length }} case{{ d.cases.length === 1 ? '' : 's' }} · last {{ d.last }} · {{ d.suite }}
                  </div>
                  <div v-if="pinnedDefect === d.error" class="mock-def-cases">
                    <span v-for="c in d.cases" :key="c" class="mock-chip">{{ c }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ How It Works ═══ -->
    <section id="how" class="how">
      <div class="wrap">
        <h2 class="sec-h anim" data-anim="hero">From one URL<br /><em>to a run you can watch.</em></h2>
        <div class="steps">
          <div v-for="(s, i) in steps" :key="s.title" class="step anim" data-anim="fade-up" :data-delay="i * 80">
            <div class="step-num">{{ i + 1 }}</div>
            <h3>{{ s.title }}</h3>
            <p>{{ s.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ FAQ ═══ -->
    <section id="faq" class="faq">
      <div class="wrap faq-wrap">
        <aside class="faq-aside anim" data-anim="fade-up">
          <span class="faq-eyebrow">FAQ</span>
          <h2 class="faq-h">Questions,<br /><em>answered plainly.</em></h2>
          <RouterLink :to="signIn" class="faq-aside-btn">Sign in</RouterLink>
        </aside>
        <div class="faq-list">
          <details v-for="(item, i) in faqItems" :key="item.q" class="faq-item anim" data-anim="fade-up" :data-delay="i * 60">
            <summary>
              <span>{{ item.q }}</span>
              <span class="faq-plus" aria-hidden="true" />
            </summary>
            <div class="faq-a"><p>{{ item.a }}</p></div>
          </details>
        </div>
      </div>
    </section>

    <!-- ═══ Final CTA ═══ -->
    <section ref="finalCtaSection" class="final-cta anim" data-anim="fade-up">
      <LandingWell :variant="2" :tint="0.74" />
      <div class="wrap cta-inner">
        <h2>Ready to watch <em>your first run?</em></h2>
        <p>Sign in, point ghostclick at an app you have allowed, and see it work through a case a step at a time.</p>
        <RouterLink :to="signIn" class="btn-primary">Get Started</RouterLink>
      </div>
    </section>

    <!-- ═══ Sticky CTA pill ═══ -->
    <Transition name="sticky-cta">
      <RouterLink v-if="showStickyCta" :to="signIn" class="sticky-cta">
        Sign in to ghostclick
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
      </RouterLink>
    </Transition>

    <!-- ═══ Footer ═══ -->
    <footer class="footer">
      <div class="wrap">
        <div class="footer-grid">
          <div class="footer-brand-col">
            <a href="#top" class="brand footer-brand">
              <span class="brand-mark is-inverse" aria-hidden="true"><i /></span>
              <span class="brand-word">ghost<span>click</span></span>
            </a>
            <p class="footer-tagline">
              Browser testing you can watch. A real Chromium, a visible cursor, and cases written the
              way a person reads the page.
            </p>
          </div>

          <div class="footer-col">
            <div class="footer-col-title">Product</div>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
          </div>

          <div class="footer-col">
            <div class="footer-col-title">Use cases</div>
            <a v-for="f in showcaseFeatures" :key="f.key" :href="`#uc-${f.key}`">{{ f.nav }}</a>
          </div>

          <div class="footer-col">
            <div class="footer-col-title">Account</div>
            <RouterLink :to="signIn">Sign in</RouterLink>
            <RouterLink :to="{ name: 'signup' }">Create an account</RouterLink>
            <RouterLink :to="{ name: 'forgot-password' }">Forgot password</RouterLink>
          </div>
        </div>

        <div class="footer-bottom">
          <span class="footer-copy">© 2026 ghostclick</span>
          <div class="footer-meta">
            <span class="footer-meta-item">
              <span class="footer-status-dot" />
              In preview — accounts are by invitation
            </span>
            <span class="footer-meta-divider">·</span>
            <span class="footer-meta-item">Browser testing you can watch</span>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════
   ghostclick landing — Cansee's editorial cream-and-ink system

   Two faces for words, and only two:
     · Instrument Serif 400 for display. Never bold. Line-height 1.1.
     · Inter 500 at 16/22.4 for everything else.
   Mono appears only inside the product pictures, because the product uses it.

   Hierarchy comes from serif-vs-sans and from size jumps in the serif, never
   from bolding the sans. The only colour is ghostclick's own: the magenta of
   the mark and the cursor, and the red a failure carries in the product.
   ═══════════════════════════════════════════════════════════ */

.lp {
  /* ground */
  --cream:        #fff9f0;
  --cream-alt:    #f5f3ee;
  --ink:          #000000;

  /* text */
  --on-ink:       #ffffff;
  --muted:        #474747;
  --muted-2:      #5c5c5c;
  --on-ink-mut:   #b0b0b0;
  --on-ink-dim:   #999999;

  /* lines */
  --hair:         rgba(0, 0, 0, .10);
  --hair-soft:    rgba(0, 0, 0, .06);
  --hair-ink:     rgba(255, 255, 255, .12);

  /* ghostclick */
  --brand:        #e6007c;
  --fail:         #d03b3b;

  /* Product panels read their tones off these, so the family moves together. */
  --card-fg:      var(--ink);
  --card-mut:     var(--muted);
  --card-dim:     var(--muted-2);
  --card-hair:    rgba(0, 0, 0, .10);
  --card-hair-2:  rgba(0, 0, 0, .20);
  --card-wash:    rgba(0, 0, 0, .035);
  --card-wash-2:  rgba(0, 0, 0, .06);
  --card-track:   rgba(0, 0, 0, .10);

  /* type */
  --serif: 'Instrument Serif', Georgia, 'Times New Roman', serif;
  --sans:  'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --mono:  ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;

  /* geometry */
  --r-media: 8px;
  --r-card: 16px;
  --r-pill: 32px;
  --sec-pad: 80px;

  /* motion */
  --ease: cubic-bezier(.22, 1, .36, 1);

  background: var(--cream);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;
  min-height: 100vh;
  width: 100%;
  max-width: 100vw;
  overflow-x: clip;
  -webkit-font-smoothing: antialiased;
  font-synthesis-weight: none;
}

/* ── Type scale ───────────────────────────────────────────── */

.lp h1, .lp h2, .lp h3 {
  font-family: var(--serif);
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
}
.lp h1 { font-size: 56px; }
.lp h2 { font-size: 44px; }
.lp h3 { font-size: 32px; }

/* Instrument Serif ships weight 400 and nothing else; anything borrowing it
   says so, or it inherits 500 and the browser draws a synthetic bold. */
.step-num,
.stats-card-num, .stats-card-prefix,
.why-item-num,
.nav-sheet a { font-weight: 400; }

.lp button { font: inherit; color: inherit; }
.lp p { margin: 0; }
.lp ul, .lp ol { margin: 0; padding: 0; list-style: none; }

/* The two-tone device: the emphasised half of a heading steps back to the
   muted tone instead of taking an accent colour. */
em {
  font-style: normal;
  font-weight: inherit;
  color: var(--muted);
}
.lp .stats-card em,
.lp .final-cta em,
.lp .faq-aside em { color: var(--on-ink-mut); }

strong { font-weight: 600; }

::selection { background: var(--ink); color: var(--cream); }

/* Focus rings. Ink surfaces need the inverse or the ring disappears. */
.lp a:focus-visible,
.lp button:focus-visible,
.lp summary:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 3px;
  border-radius: 4px;
}
.footer a:focus-visible,
.faq-aside a:focus-visible,
.final-cta a:focus-visible { outline-color: var(--on-ink); }

.wrap { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

.lp [id] { scroll-margin-top: 128px; }

/* ── Scroll reveal ────────────────────────────────────────────
   Fade and rise. Ends at transform:none so it never becomes the containing
   block for a position:sticky descendant. */
.anim {
  opacity: 0;
  transform: translateY(28px);
  transition: opacity .7s var(--ease), transform .7s var(--ease);
}
.anim.in { opacity: 1; transform: none; }

@media (prefers-reduced-motion: reduce) {
  .lp *,
  .lp *::before,
  .lp *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
    scroll-behavior: auto !important;
  }
  .anim { opacity: 1; transform: none; }
}

/* ═══ Nav ═══════════════════════════════════════════════════
   At rest it is invisible chrome sitting on the cream, aligned to the hero's
   container. On scroll it contracts into a white pill and lifts off the page,
   and Get Started inverts to solid ink so it keeps popping. */

.nav {
  position: fixed;
  top: 24px;
  left: 0;
  right: 0;
  z-index: 90;
  display: flex;
  justify-content: center;
  padding: 0 24px;
  pointer-events: none;
}
.nav > * { pointer-events: auto; }

.nav-pill {
  display: flex;
  align-items: center;
  gap: 32px;
  width: 100%;
  max-width: 1200px;
  height: 64px;
  padding: 0 24px;
  background: transparent;
  border-radius: 40px;
  transition: max-width .45s var(--ease), background .3s ease,
              box-shadow .35s var(--ease), padding .45s var(--ease);
}
.nav.scrolled .nav-pill {
  max-width: 880px;
  padding: 0 12px 0 24px;
  background: #ffffff;
  box-shadow: 0 6px 28px rgba(0, 0, 0, .10);
}

.brand { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; color: var(--ink); text-decoration: none; }
.brand-mark {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--ink);
}
.brand-mark i { width: 8px; height: 8px; border-radius: 50%; background: var(--brand); }
.brand-mark.is-inverse { background: var(--on-ink); }
.brand-word { font-size: 18px; font-weight: 600; letter-spacing: -.02em; }
.brand-word span { color: var(--brand); }
.brand-beta { font-size: 16px; color: var(--muted-2); }

.nav-links { display: flex; align-items: center; gap: 28px; margin-left: auto; }
.nav-links a { color: var(--ink); text-decoration: none; transition: opacity .2s ease; }
.nav-links a:hover { opacity: .55; }

/* ── Use Cases mega-menu ── */
.nav-uc { position: relative; display: flex; align-items: center; }
.nav-uc-trigger { display: inline-flex; align-items: center; gap: 5px; }
.nav-uc-caret { opacity: .7; transition: transform .25s var(--ease); }
.nav-uc:hover .nav-uc-caret,
.nav-uc:focus-within .nav-uc-caret { transform: rotate(180deg); }

.nav-uc-panel {
  position: absolute;
  top: 100%;
  left: 50%;
  margin-top: 14px;
  width: 620px;
  max-width: min(92vw, 620px);
  background: var(--cream);
  border: 1px solid var(--hair);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .16);
  padding: 18px;
  text-align: left;
  opacity: 0;
  visibility: hidden;
  transform: translateX(-50%) translateY(8px);
  pointer-events: none;
  transition: opacity .22s var(--ease), transform .22s var(--ease), visibility .22s;
  z-index: 100;
}
/* An invisible bridge across the gap, so the panel doesn't drop mid-reach. */
.nav-uc-panel::before { content: ''; position: absolute; top: -16px; left: 0; right: 0; height: 16px; }
.nav-uc:hover .nav-uc-panel,
.nav-uc:focus-within .nav-uc-panel {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
  pointer-events: auto;
}

.nav-uc-eyebrow {
  display: block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--muted-2);
  padding: 2px 8px 12px;
}
.nav-uc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }
.nav-links .nav-uc-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 11px 10px;
  border-radius: 12px;
  transition: background .16s ease;
}
.nav-links .nav-uc-item:hover { background: var(--cream-alt); opacity: 1; }
.nav-uc-ic {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--cream-alt);
  color: var(--ink);
  transition: background .16s ease, color .16s ease;
}
.nav-uc-item:hover .nav-uc-ic { background: var(--ink); color: var(--on-ink); }
.nav-uc-txt { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.nav-uc-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.2;
}
.nav-uc-tag {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--muted);
  background: var(--hair-soft);
  padding: 1px 7px;
  border-radius: 999px;
  white-space: nowrap;
}
.nav-uc-blurb { font-size: 12.5px; color: var(--muted); line-height: 1.4; }

.nav-links .nav-uc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;
  padding: 13px 12px 4px;
  border-top: 1px solid var(--hair);
  font-size: 13px;
  color: var(--muted);
}
.nav-links .nav-uc-foot:hover { opacity: 1; }
.nav-uc-foot-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
}
.nav-uc-foot:hover .nav-uc-foot-link { text-decoration: underline; }

.nav-sheet-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--muted-2);
  padding: 12px 4px 2px;
}
.nav-sheet .nav-sheet-uc {
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;
  padding: 8px 4px;
  color: var(--ink);
}

.nav-right { display: flex; align-items: center; gap: 16px; margin-left: auto; }
.nav-link-text { color: var(--ink); text-decoration: none; transition: opacity .2s ease; }
.nav-link-text:hover { opacity: .55; }

.nav-cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 6px 0 18px;
  background: var(--cream-alt);
  color: var(--ink);
  text-decoration: none;
  border-radius: var(--r-pill);
  white-space: nowrap;
  transition: background .3s ease, color .3s ease;
}
.nav-cta-arrow {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  color: inherit;
  transition: transform .35s var(--ease), background .3s ease,
              border-color .3s ease, color .3s ease;
}
.nav-cta:hover .nav-cta-arrow { transform: translate(2px, -2px); }
.nav.scrolled .nav-cta { background: var(--ink); color: var(--on-ink); }
.nav.scrolled .nav-cta-arrow { background: var(--on-ink); border-color: var(--on-ink); color: var(--ink); }

/* burger */
.nav-burger {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 44px;
  height: 44px;
  margin-left: auto;
  padding: 0 10px;
  background: none;
  border: 0;
  cursor: pointer;
}
.nav-burger-bar {
  display: block;
  height: 1.5px;
  width: 100%;
  background: var(--ink);
  transition: transform .35s var(--ease), opacity .2s ease;
}
.nav-burger[aria-expanded="true"] .nav-burger-bar:first-child { transform: translateY(3.25px) rotate(45deg); }
.nav-burger[aria-expanded="true"] .nav-burger-bar:last-child { transform: translateY(-3.25px) rotate(-45deg); }

/* sheet — `inert` owns tab order and focus; CSS only animates. */
.nav-sheet {
  position: absolute;
  top: 76px;
  left: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
  padding: 20px;
  background: #ffffff;
  border-radius: 24px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .12);
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
  transition: opacity .25s ease, transform .35s var(--ease);
}
.nav-sheet.is-open { opacity: 1; transform: none; pointer-events: auto; }
.nav-sheet a {
  padding: 12px 4px;
  font-family: var(--serif);
  font-size: 32px;
  line-height: 1.1;
  color: var(--ink);
  text-decoration: none;
}
.nav-sheet .nav-sheet-login,
.nav-sheet .nav-sheet-cta {
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;
}
.nav-sheet .nav-sheet-login {
  color: var(--muted);
  border-top: 1px solid var(--hair);
  margin-top: 12px;
  padding-top: 16px;
}
.nav-sheet .nav-sheet-cta {
  margin-top: 8px;
  text-align: center;
  background: var(--ink);
  color: var(--on-ink);
  border-radius: var(--r-pill);
  padding: 12px 18px;
}

/* ═══ Hero ══════════════════════════════════════════════════ */

.hero { padding: 168px 0 40px; }
.hero-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: stretch;
}
.hero-left {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 460px;
  gap: 40px;
}
.hero-h { max-width: 21ch; }
.hero-bottom { display: flex; flex-direction: column; gap: 24px; }
.hero-p { max-width: 500px; color: var(--muted); }

.hero-word-cycler {
  display: inline-grid;
  vertical-align: bottom;
  overflow: hidden;
  height: 1.4em;
}
.hero-word { grid-area: 1 / 1; color: var(--ink); white-space: nowrap; }
.word-cycle-enter-active, .word-cycle-leave-active { transition: opacity .4s ease, transform .4s var(--ease); }
.word-cycle-enter-from { opacity: 0; transform: translateY(100%); }
.word-cycle-leave-to { opacity: 0; transform: translateY(-100%); }

.hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; }
.hero-cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 20px;
  background: var(--ink);
  color: var(--on-ink);
  border-radius: var(--r-pill);
  text-decoration: none;
  transition: opacity .2s ease;
}
.hero-cta:hover { opacity: .85; }
.hero-cta svg { transition: transform .35s var(--ease); }
.hero-cta:hover svg { transform: translateX(3px); }
.hero-note { font-size: 13px; color: var(--muted-2); }

/* ── Hero media: the console on a colour well ── */
.hero-right { display: flex; }
.hero-stage {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 460px;
  padding: 28px;
  border-radius: var(--r-media);
  background: var(--ink);
}

.console {
  --cycle: 7s;
  width: 100%;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(255, 252, 247, .97);
  box-shadow: 0 30px 80px rgba(0, 0, 0, .35);
  font-size: 13px;
  line-height: 1.4;
}
.console-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--card-hair);
  background: #f4f1ea;
}
.console-dots { display: inline-flex; gap: 5px; }
.console-dots i { width: 8px; height: 8px; border-radius: 50%; background: rgba(0, 0, 0, .14); }
.console-url {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--card-hair);
  border-radius: 8px;
  background: #fff;
  font-family: var(--mono);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
}
.console-url svg { flex: 0 0 auto; color: #0ca30c; }
.console-url b { font-weight: 600; color: var(--ink); }
.console-url span { color: var(--muted-2); }
.console-live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
.console-live i { width: 6px; height: 6px; border-radius: 50%; background: var(--brand); animation: live-pulse 1.4s ease-in-out infinite; }

/* The page being driven. Sized in container units so the whole picture scales
   with the column, and the cursor's percentages keep landing on the fields. */
.console-page {
  position: relative;
  aspect-ratio: 16 / 10;
  display: grid;
  place-items: center;
  overflow: hidden;
  container-type: inline-size;
  background: linear-gradient(180deg, #f4f5f9, #e8ebf2);
}
.console-login {
  position: relative;
  width: 50cqw;
  display: flex;
  flex-direction: column;
  gap: 1.5cqw;
  padding: 3.2cqw 3.4cqw;
  border-radius: 1.6cqw;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .06), 0 10px 30px rgba(15, 23, 42, .08);
  color: #0f172a;
  font-family: var(--sans);
  line-height: 1.2;
}
.console-brand { display: flex; align-items: center; gap: 1cqw; font-size: 2.3cqw; font-weight: 600; }
.console-brand i { width: 2.5cqw; height: 2.5cqw; border-radius: .7cqw; background: #0f172a; }
.console-h { margin-bottom: .5cqw; font-size: 3.3cqw; font-weight: 600; letter-spacing: -.02em; }
.console-field { display: flex; flex-direction: column; gap: .6cqw; font-size: 1.9cqw; color: #475569; }
.console-input {
  display: flex;
  align-items: center;
  height: 5.2cqw;
  padding: 0 1.3cqw;
  border: 1px solid #dfe3ea;
  border-radius: 1cqw;
  color: #0f172a;
  font-size: 2.1cqw;
}
.console-typed {
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  vertical-align: bottom;
  font-family: var(--mono);
}
.is-email { animation: focus-email var(--cycle) infinite; }
.is-password { animation: focus-password var(--cycle) infinite; }
.is-email .console-typed { width: 11ch; animation: type-email var(--cycle) steps(11, end) infinite; }
.is-password .console-typed { width: 12ch; animation: type-password var(--cycle) steps(12, end) infinite; }
.console-submit {
  display: grid;
  place-items: center;
  height: 5.4cqw;
  margin-top: .6cqw;
  border-radius: 1cqw;
  background: #0f172a;
  color: #fff;
  font-size: 2.1cqw;
  font-weight: 600;
  animation: press var(--cycle) infinite;
}
.console-cursor {
  position: absolute;
  left: 88%;
  top: 112%;
  z-index: 2;
  width: 22px;
  height: 22px;
  margin: -2px 0 0 -4px;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .25));
  animation: glide var(--cycle) cubic-bezier(.45, .05, .2, 1) infinite;
}
.console-ripple {
  position: absolute;
  z-index: 1;
  width: 30px;
  height: 30px;
  margin: -15px 0 0 -15px;
  border: 2px solid var(--brand);
  border-radius: 50%;
  opacity: 0;
  animation: ripple var(--cycle) linear infinite;
}

.console-steps {
  display: grid;
  gap: 3px;
  padding: 12px 14px 14px;
  border-top: 1px solid var(--card-hair);
  font-family: var(--mono);
  font-size: 12px;
}
.console-steps li {
  display: grid;
  grid-template-columns: 14px 12px minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 8px;
  color: var(--ink);
}
.console-steps .n, .console-steps .ms { color: var(--muted-2); }
.console-steps .n { text-align: right; }
.console-steps .lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.console-steps .ok, .console-steps .ms { animation: tick-2 var(--cycle) infinite; }
.console-steps li:nth-child(1) .ok, .console-steps li:nth-child(1) .ms { animation: none; }
.console-steps li:nth-child(3) .ok, .console-steps li:nth-child(3) .ms { animation-name: tick-3; }
.console-steps li:nth-child(4) .ok, .console-steps li:nth-child(4) .ms { animation-name: tick-4; }
.console-steps li:nth-child(5) .ok, .console-steps li:nth-child(5) .ms { animation-name: tick-5; }
.console-steps li:nth-child(6) .ok, .console-steps li:nth-child(6) .ms { animation-name: tick-6; }

/* One seven-second take: glide to Email, type; to Password, type; press Sign in;
   the checks tick through; park and go again. */
@keyframes glide {
  0%, 6%    { left: 88%; top: 112%; }
  20%, 34%  { left: 19%; top: 45%; }
  44%, 58%  { left: 19%; top: 68%; }
  70%, 82%  { left: 50%; top: 86%; }
  96%, 100% { left: 88%; top: 112%; }
}
@keyframes ripple {
  0%, 21%   { opacity: 0; transform: scale(.3); left: 19%; top: 45%; }
  22%       { opacity: .9; transform: scale(.3); left: 19%; top: 45%; }
  28%       { opacity: 0; transform: scale(1.5); left: 19%; top: 45%; }
  45%       { opacity: 0; transform: scale(.3); left: 19%; top: 68%; }
  46%       { opacity: .9; transform: scale(.3); left: 19%; top: 68%; }
  52%       { opacity: 0; transform: scale(1.5); left: 19%; top: 68%; }
  71%       { opacity: 0; transform: scale(.3); left: 50%; top: 86%; }
  72%       { opacity: .9; transform: scale(.3); left: 50%; top: 86%; }
  78%, 100% { opacity: 0; transform: scale(1.5); left: 50%; top: 86%; }
}
@keyframes focus-email {
  0%, 21%   { border-color: #dfe3ea; box-shadow: none; }
  22%, 42%  { border-color: #0f172a; box-shadow: 0 0 0 .5cqw rgba(15, 23, 42, .08); }
  43%, 100% { border-color: #dfe3ea; box-shadow: none; }
}
@keyframes focus-password {
  0%, 45%   { border-color: #dfe3ea; box-shadow: none; }
  46%, 66%  { border-color: #0f172a; box-shadow: 0 0 0 .5cqw rgba(15, 23, 42, .08); }
  67%, 100% { border-color: #dfe3ea; box-shadow: none; }
}
@keyframes type-email { 0%, 22% { width: 0; } 34%, 100% { width: 11ch; } }
@keyframes type-password { 0%, 46% { width: 0; } 58%, 100% { width: 12ch; } }
@keyframes press { 0%, 71% { transform: none; } 72%, 75% { transform: scale(.96); } 78%, 100% { transform: none; } }
@keyframes tick-2 { 0%, 33% { opacity: 0; } 34%, 100% { opacity: 1; } }
@keyframes tick-3 { 0%, 57% { opacity: 0; } 58%, 100% { opacity: 1; } }
@keyframes tick-4 { 0%, 77% { opacity: 0; } 78%, 100% { opacity: 1; } }
@keyframes tick-5 { 0%, 85% { opacity: 0; } 86%, 100% { opacity: 1; } }
@keyframes tick-6 { 0%, 91% { opacity: 0; } 92%, 100% { opacity: 1; } }
@keyframes live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }

/* ═══ Trust strip ═══════════════════════════════════════════ */

.trust { background: var(--cream-alt); }
.trust-row {
  max-width: 1200px;
  margin: 0 auto;
  padding: 28px 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 28px;
}
.trust-label { color: var(--muted); }
.trust-item { color: var(--ink); }

/* ═══ Why this exists ═══════════════════════════════════════ */

.why { padding: var(--sec-pad) 0; }
.why-split { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
.why-h { margin-bottom: 20px; }
.why-h-quiet { color: var(--muted); }
.why-sub { max-width: 500px; color: var(--muted); margin-bottom: 32px; }

.why-list { border-top: 1px solid var(--hair); }
.why-row { border-bottom: 1px solid var(--hair); }
.why-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 48px;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 20px 0;
  background: none;
  border: 0;
  text-align: left;
  cursor: pointer;
  color: var(--muted);
  transition: color .2s ease;
}
.why-item:hover, .why-item.is-active { color: var(--ink); }
.why-item-num { font-family: var(--serif); font-size: 20px; color: inherit; }
.why-item-arrow {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border: 1px solid var(--hair);
  border-radius: 50%;
  color: inherit;
  transition: transform .35s var(--ease), background .2s ease, border-color .2s ease;
}
.why-item:hover .why-item-arrow,
.why-item.is-active .why-item-arrow {
  transform: translate(2px, -2px);
  background: var(--ink);
  border-color: var(--ink);
  color: var(--on-ink);
}

.why-panel {
  padding: 24px;
  background: #fffcf7;
  border: 1px solid var(--card-hair);
  border-radius: var(--r-card);
  box-shadow: 0 14px 40px rgba(0, 0, 0, .07);
  min-height: 420px;
  display: flex;
  color: var(--card-fg);
}
.why-demo { width: 100%; }
.why-demo-panel { display: flex; flex-direction: column; gap: 16px; height: 100%; }
.why-demo-fade-enter-active, .why-demo-fade-leave-active { transition: opacity .3s ease, transform .3s var(--ease); }
.why-demo-fade-enter-from { opacity: 0; transform: translateY(8px); }
.why-demo-fade-leave-to { opacity: 0; transform: translateY(-8px); }

.why-demo-head { display: flex; align-items: center; gap: 10px; color: var(--card-fg); }
.why-demo-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--card-fg); }
.why-demo-body { color: var(--card-mut); }
.why-demo-list { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.why-demo-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--card-hair);
  color: var(--card-mut);
  font-family: var(--mono);
  font-size: 13.5px;
}
.why-demo-list li::before { content: attr(data-n); min-width: 22px; color: var(--muted-2); font-family: var(--sans); font-size: 14px; }
.why-demo-list li.hi { color: var(--card-fg); }
.why-demo-list li.is-failed { color: var(--fail); }
.why-demo-you-tag {
  display: inline-flex; align-items: center; gap: 6px;
  margin-left: auto; padding: 3px 10px;
  border: 1px solid currentColor; border-radius: var(--r-pill);
  font-family: var(--sans); font-size: 13px; white-space: nowrap;
}
.why-demo-foot { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--card-hair); color: var(--card-dim); }
.why-demo-foot strong { color: var(--card-fg); }

.why-target { display: flex; flex-direction: column; gap: 4px; padding: 12px 0; border-bottom: 1px solid var(--card-hair); }
.why-target code { font-family: var(--mono); font-size: 13.5px; color: var(--card-fg); overflow-wrap: anywhere; }
.why-target.is-brittle code { color: var(--card-dim); text-decoration: line-through; text-decoration-color: var(--fail); }
.why-target span { color: var(--card-dim); font-size: 14px; }
.why-demo-label {
  margin-top: 18px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--card-dim);
}
.why-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.why-chips span { padding: 2px 10px; border: 1px solid var(--card-hair-2); border-radius: var(--r-pill); color: var(--card-mut); font-size: 14px; }

.why-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.why-cell {
  padding: 8px 9px;
  border: 1px solid var(--card-hair);
  border-radius: 6px;
  background: var(--card-wash);
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.35;
  color: var(--card-fg);
  overflow-wrap: anywhere;
}
.why-cell.is-wide { grid-column: 1 / -1; }
.why-cell.is-check { border-radius: 16px; }
.why-cell.is-fail { border-color: rgba(208, 59, 59, .45); background: rgba(208, 59, 59, .07); color: var(--fail); }

.why-cta {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 16px;
  margin-top: 48px; padding-top: 32px; border-top: 1px solid var(--hair);
}
.why-cta-line { color: var(--muted); }
.why-cta-line strong { color: var(--ink); }
.why-cta-btn {
  display: inline-flex; align-items: center; gap: 10px;
  height: 42px; padding: 0 18px;
  background: var(--ink); color: var(--on-ink);
  border-radius: var(--r-pill); text-decoration: none;
  transition: opacity .2s ease;
}
.why-cta-btn:hover { opacity: .85; }
.why-cta-btn svg { transition: transform .35s var(--ease); }
.why-cta-btn:hover svg { transform: translateX(3px); }

/* ═══ Stats card ════════════════════════════════════════════ */

.stats { padding: var(--sec-pad) 0; }
.stats-card {
  position: relative;
  overflow: hidden;
  border-radius: var(--r-card);
  background: var(--ink);
  padding: 48px;
  isolation: isolate;
  /* Tall enough that the colour is the subject and the type sits on it. */
  min-height: 74vh;
  display: flex;
}
/* space-between, not a fixed gap: the empty middle is the point. */
.stats-card-content {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  gap: 40px;
  width: 100%;
}
.stats-card-top { display: grid; grid-template-columns: 1fr 400px; gap: 24px; align-items: start; }
.stats-card-h { color: var(--on-ink); }
.stats-card-sub { color: var(--on-ink-mut); }
.stats-card-bottom {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 28px;
  max-width: 780px;
}
.stats-card-metric { display: flex; flex-direction: column; gap: 2px; }
.stats-card-num {
  font-family: var(--serif);
  font-size: 30px;
  line-height: 1.05;
  color: var(--on-ink);
}
.stats-card-prefix { font-family: var(--serif); }
.stats-card-label { margin-top: 4px; font-size: 11.5px; font-weight: 600; color: var(--on-ink); }
.stats-card-note { font-size: 10.5px; line-height: 1.4; color: var(--on-ink-mut); }

/* ═══ Feature showcase ══════════════════════════════════════ */

.feature-showcase { padding: var(--sec-pad) 0; display: flex; flex-direction: column; }
.feature-showcase .wrap { display: flex; flex-direction: column; gap: 96px; }
.feature-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: center; }
.feature-row.is-reverse .feature-copy { order: 2; }

.feature-copy { display: flex; flex-direction: column; gap: 20px; }
.feature-eyebrow { color: var(--muted); }
.feature-h { font-family: var(--serif); font-size: 44px; line-height: 1.1; font-weight: 400; }
.feature-desc { color: var(--muted); max-width: 500px; }
.feature-bullets { display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--hair); padding-top: 20px; }
.feature-bullets li { display: flex; align-items: baseline; gap: 12px; color: var(--muted); }
.feature-bullet-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--ink); flex: 0 0 auto; transform: translateY(-3px); }

/* The well is the frame; the mock floats on it. */
.feature-visual {
  position: relative;
  overflow: hidden;
  border-radius: var(--r-card);
  background: var(--ink);
  padding: 24px;
  min-height: 420px;
  display: flex;
  isolation: isolate;
}

/* — shared mock atoms — */
.mock-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  background: rgba(255, 252, 247, .96);
  border: 1px solid rgba(255, 255, 255, .55);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, .18);
  color: var(--card-fg);
  font-size: 14px;
  line-height: 1.45;
}
.mock-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--card-hair); }
.mock-title { display: inline-flex; align-items: center; gap: 8px; color: var(--card-fg); }
.mock-count { color: var(--card-dim); }
.mock-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border: 1px solid var(--card-hair-2);
  border-radius: var(--r-pill);
  color: var(--card-dim);
  font-size: 12.5px;
  white-space: nowrap;
}
.mock-chip.is-ink { background: var(--card-fg); border-color: var(--card-fg); color: var(--cream); }
.mock-mono { font-family: var(--mono); font-size: 12.5px; }
.mock-detail-row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 7px 0; border-bottom: 1px solid var(--card-hair); }
.mock-detail-row:last-child { border-bottom: 0; }
.mock-detail-label { flex: 0 0 auto; color: var(--card-dim); }
.mock-detail-value { min-width: 0; color: var(--card-fg); text-align: right; overflow-wrap: anywhere; }
.mock-reads-title { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--card-dim); }
.mock-foot {
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px;
  margin-top: auto; padding-top: 12px; border-top: 1px solid var(--card-hair);
  color: var(--card-dim); font-size: 13px;
}
.mock-live { width: 7px; height: 7px; border-radius: 50%; background: var(--fail); animation: live-pulse 1.4s ease-in-out infinite; }

/* — Case language — */
.mock-code {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  border: 1px solid var(--card-hair);
  border-radius: 10px;
  background: #fffdf9;
  overflow-x: auto;
}
.mock-code-line {
  display: grid;
  grid-template-columns: 2.6em minmax(max-content, 1fr) 1.8em;
  align-items: center;
  width: 100%;
  min-width: max-content;
  min-height: 1.9em;
  padding: 0;
  background: none;
  border: 0;
  font-family: var(--mono);
  font-size: 12.5px;
  color: var(--card-fg);
  text-align: left;
  white-space: pre;
}
.mock-code-line:disabled { cursor: default; }
.mock-code-line:active { transform: none; }
.mock-code-line.is-pick { cursor: pointer; }
.mock-code-line.is-pick:hover { background: var(--card-wash); }
.mock-code-line.is-pinned { background: var(--card-wash-2); box-shadow: inset 2px 0 0 var(--brand); }
.mock-code-n { padding-right: 12px; text-align: right; color: var(--card-dim); opacity: .55; }
.mock-code-mark { text-align: center; }
.mock-code-line.is-bad .mock-code-text { color: var(--fail); text-decoration: underline wavy rgba(208, 59, 59, .55); text-underline-offset: 4px; }
.mock-code-line.is-bad .mock-code-mark { color: var(--fail); }
.mock-reads { display: flex; flex-direction: column; gap: 2px; min-height: 104px; }
.mock-reads .mock-detail-value { font-size: 12px; }
.mock-reads.is-bad { gap: 6px; padding: 12px 14px; border: 1px solid rgba(208, 59, 59, .25); border-radius: 10px; background: rgba(208, 59, 59, .05); }
.mock-reads-error { font-family: var(--mono); font-size: 12.5px; color: var(--fail); }
.mock-reads-note { color: var(--card-dim); font-size: 13px; }

/* — Recording — */
.mock-flow {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--card-hair);
  border-radius: 10px;
  background: #fffdf9;
  font-family: var(--mono);
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--card-fg);
  white-space: pre;
  overflow-x: auto;
}
.mock-cands { display: flex; flex-direction: column; }
.mock-cands .mock-reads-title { margin-bottom: 4px; }
.mock-cand {
  display: grid;
  grid-template-columns: minmax(0, 9.5rem) minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid var(--card-hair);
  color: var(--card-mut);
}
.mock-cand:last-child { border-bottom: 0; }
.mock-cand .mock-mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--card-fg); }
.mock-cand-result { font-size: 13px; }
.mock-cand-mark { font-size: 12px; color: var(--card-dim); }
.mock-cand.is-none { opacity: .65; }
.mock-cand.is-kept .mock-cand-result { color: var(--card-fg); }
.mock-cand.is-kept .mock-cand-mark { padding: 1px 9px; border-radius: var(--r-pill); background: var(--card-fg); color: var(--cream); }
.mock-cand.is-ambiguous .mock-cand-mark { color: var(--fail); }
.mock-note { padding: 10px 12px; border-radius: 8px; background: var(--card-wash-2); color: var(--card-mut); font-size: 13px; }
.mock-note .mock-mono { color: var(--card-fg); }

/* — Suites — */
.mock-add { display: flex; align-items: center; gap: 8px; }
.mock-url {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--card-hair-2);
  border-radius: var(--r-pill);
  background: #fff;
  font-family: var(--mono);
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
}
.mock-url-scheme { color: var(--card-dim); }
.mock-btn {
  display: inline-flex;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  border-radius: var(--r-pill);
  background: var(--card-fg);
  color: var(--cream);
  font-size: 13.5px;
  white-space: nowrap;
}
.mock-suite {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--card-hair);
  border-radius: 10px;
  background: var(--card-wash);
}
.mock-suite-name { color: var(--card-fg); }
.mock-suite-sub { color: var(--card-dim); font-size: 13px; }
.mock-links { display: flex; flex-wrap: wrap; gap: 6px; }
.mock-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 11px;
  border: 1px dashed var(--card-hair-2);
  border-radius: var(--r-pill);
  background: none;
  color: var(--card-mut);
  font-size: 13px;
  cursor: pointer;
  transition: background .2s ease, color .2s ease, border-color .2s ease;
}
.mock-link .mock-mono { font-size: 11.5px; opacity: .6; }
.mock-link:hover { border-color: var(--card-fg); color: var(--card-fg); }
.mock-link.is-added { border-style: solid; border-color: var(--card-fg); background: var(--card-fg); color: var(--cream); }

/* — Defects — */
.mock-def-list { display: flex; flex-direction: column; }
.mock-def { padding: 12px 0; border-bottom: 1px solid var(--card-hair); cursor: pointer; }
.mock-def:last-child { border-bottom: 0; }
.mock-def:hover { background: var(--card-wash); }
.mock-def.is-pinned { background: var(--card-wash-2); }
.mock-def-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.mock-def-state { padding: 1px 10px; border-radius: var(--r-pill); background: var(--card-wash-2); color: var(--card-mut); font-size: 12px; }
.mock-def-state.is-open { background: rgba(208, 59, 59, .1); color: var(--fail); }
.mock-def-meta { color: var(--card-dim); font-size: 13px; }
.mock-def-error { margin: 6px 0 2px; color: var(--card-fg); overflow-wrap: anywhere; }
.mock-def-sub { color: var(--card-dim); font-size: 13px; }
.mock-def-cases { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }

/* ═══ How it works ══════════════════════════════════════════ */

.how { padding: var(--sec-pad) 0; }
.sec-h { margin-bottom: 40px; }
.steps { border-top: 1px solid var(--hair); }
.step {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 1fr;
  gap: 24px;
  align-items: baseline;
  padding: 24px 0;
  border-bottom: 1px solid var(--hair);
}
.step-num { font-family: var(--serif); font-size: 32px; line-height: 1.1; color: var(--muted); }
.step h3 { font-size: 32px; }
.step p { color: var(--muted); }

/* ═══ FAQ ═══════════════════════════════════════════════════ */

.faq { padding: var(--sec-pad) 0; }
.faq-wrap { display: grid; grid-template-columns: 420px minmax(0, 1fr); gap: 48px; align-items: start; }
.faq-aside {
  position: sticky;
  top: 120px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 32px;
  background: var(--ink);
  border-radius: var(--r-card);
}
.faq-eyebrow { color: var(--on-ink-dim); }
.faq-h { color: var(--on-ink); }
.faq-aside-btn {
  align-self: flex-start;
  display: inline-flex; align-items: center;
  height: 42px; padding: 0 22px;
  margin-top: 8px;
  background: var(--cream); color: var(--ink);
  border-radius: var(--r-pill); text-decoration: none;
  transition: opacity .2s ease;
}
.faq-aside-btn:hover { opacity: .88; }

.faq-list { border-top: 1px solid var(--hair); }
.faq-item { border-bottom: 1px solid var(--hair); }
.faq-item summary {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 22px 0;
  cursor: pointer;
  list-style: none;
  color: var(--ink);
}
.faq-item summary::-webkit-details-marker { display: none; }
.faq-plus {
  position: relative;
  width: 12px; height: 12px;
  flex: 0 0 auto;
  transition: transform .35s var(--ease);
}
.faq-plus::before, .faq-plus::after {
  content: ''; position: absolute; left: 0; top: 5px;
  width: 8px; height: 1.5px; background: var(--ink);
}
.faq-plus::before { transform: rotate(45deg); transform-origin: left center; }
.faq-plus::after { left: auto; right: 0; transform: rotate(-45deg); transform-origin: right center; }
.faq-item[open] .faq-plus { transform: rotate(180deg); }
.faq-a { padding-bottom: 22px; max-width: 60ch; }
.faq-a p { color: var(--muted); }
.faq-item[open] .faq-a { animation: faq-open .35s var(--ease) both; }
@keyframes faq-open { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }

/* ═══ Final CTA — the crown on the footer ═══════════════════ */

.final-cta {
  position: relative;
  overflow: hidden;
  background: var(--ink);
  padding: 120px 0 100px;
  isolation: isolate;
  text-align: center;
}
.cta-inner { display: flex; flex-direction: column; align-items: center; gap: 20px; }
.final-cta h2 { color: var(--on-ink); max-width: 18ch; }
.final-cta p { color: var(--on-ink-mut); max-width: 52ch; }
.btn-primary {
  display: inline-flex; align-items: center;
  height: 42px; padding: 0 26px; margin-top: 8px;
  background: var(--cream); color: var(--ink);
  border-radius: var(--r-pill); text-decoration: none;
  transition: opacity .2s ease, transform .35s var(--ease);
}
.btn-primary:hover { opacity: .9; transform: translateY(-2px); }

/* ═══ Sticky CTA pill ═══════════════════════════════════════ */

.sticky-cta {
  position: fixed;
  right: 24px; bottom: 24px;
  z-index: 80;
  display: inline-flex; align-items: center; gap: 10px;
  height: 46px; padding: 0 20px;
  background: var(--ink); color: var(--on-ink);
  border-radius: var(--r-pill); text-decoration: none;
  box-shadow: 0 8px 30px rgba(0, 0, 0, .2);
  transition: transform .35s var(--ease);
}
.sticky-cta:hover { transform: translateY(-2px); }
.sticky-cta-enter-active, .sticky-cta-leave-active { transition: opacity .3s ease, transform .35s var(--ease); }
.sticky-cta-enter-from, .sticky-cta-leave-to { opacity: 0; transform: translateY(12px); }

/* ═══ Footer ════════════════════════════════════════════════ */

.footer { background: var(--ink); padding: 80px 0 24px; color: var(--on-ink-mut); }
.footer-grid { display: grid; grid-template-columns: 1.6fr repeat(3, 1fr); gap: 40px 24px; padding-bottom: 48px; border-bottom: 1px solid var(--hair-ink); }
.footer-brand { margin-bottom: 16px; color: var(--on-ink); }
.footer-tagline { color: var(--on-ink-mut); max-width: 34ch; }
.footer-col { display: flex; flex-direction: column; gap: 12px; }
.footer-col-title { font-size: 24px; line-height: 1.2; color: var(--on-ink); margin-bottom: 4px; }
.footer-col a { color: var(--on-ink-mut); text-decoration: none; transition: color .2s ease; }
.footer-col a:hover { color: var(--on-ink); }
.footer-bottom { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding-top: 24px; }
.footer-copy { color: var(--on-ink-dim); }
.footer-meta { display: flex; align-items: center; gap: 10px; color: var(--on-ink-dim); }
.footer-meta-item { display: inline-flex; align-items: center; gap: 8px; }
.footer-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--brand); }
.footer-meta-divider { color: var(--on-ink-dim); }

/* ═══ Responsive — two breakpoints only ═════════════════════ */

@media (max-width: 1023px) {
  .lp h1 { font-size: 48px; }
  .lp h2, .feature-h, .step h3 { font-size: 32px; }
  .lp { --sec-pad: 56px; }

  .nav { top: 16px; }
  .nav-pill { height: 60px; padding: 0 8px 0 20px; }
  .nav-links, .nav-right { display: none; }
  .nav-burger { display: flex; }

  .hero { padding: 128px 0 40px; }
  .hero-grid, .why-split, .feature-row, .stats-card-top, .faq-wrap { grid-template-columns: 1fr; }
  .hero-left { min-height: 0; gap: 28px; }
  .hero-stage { min-height: 0; padding: 20px; }
  .feature-row.is-reverse .feature-copy { order: 0; }
  .feature-showcase .wrap { gap: 64px; }
  .stats-card { padding: 32px; }
  .stats-card-bottom { grid-template-columns: 1fr; gap: 20px; }
  .faq-wrap { gap: 32px; }
  .faq-aside { position: static; }
  .step { grid-template-columns: 40px minmax(0, 1fr); gap: 8px 16px; }
  .step p { grid-column: 2; }
  .footer-grid { grid-template-columns: 1fr 1fr; }
  .final-cta { padding: 88px 0 72px; }
}

@media (max-width: 767px) {
  .lp h1 { font-size: 40px; }
  .lp { --sec-pad: 48px; }
  .wrap, .trust-row { padding-left: 16px; padding-right: 16px; }
  .nav { padding: 0 16px; }
  .nav-sheet { left: 16px; right: 16px; }
  .nav-sheet a { font-size: 28px; }

  .hero { padding: 112px 0 32px; }
  .hero-stage { padding: 12px; }

  .why-item { grid-template-columns: auto minmax(0, 1fr); gap: 12px; padding: 16px 0; }
  .why-item-arrow { display: none; }
  .why-panel { padding: 20px; min-height: 0; }
  .why-cta { flex-direction: column; align-items: flex-start; }
  .why-grid { grid-template-columns: 1fr 1fr; }

  .stats-card { padding: 24px; }
  .stats-card-num { font-size: 36px; }

  .feature-visual { padding: 16px; min-height: 340px; }
  .mock-card { padding: 16px; gap: 12px; }
  .mock-cand { grid-template-columns: minmax(0, 1fr) auto; }
  .mock-cand-result { grid-column: 1; grid-row: 2; }

  .faq-aside { padding: 24px; }
  .final-cta { padding: 72px 0 56px; }
  .footer-grid { grid-template-columns: 1fr; gap: 32px; }
  .sticky-cta { right: 16px; bottom: 16px; }
}
</style>

<style>
/* Unscoped, but every selector is gated on the landing page being mounted,
   so nothing here reaches the rest of the app. The cream has to reach the
   overscroll area too, not stop at .lp's box. */
html:has(.lp),
html:has(.lp) body,
html:has(.lp) #app {
  overflow-x: clip;
  max-width: 100vw;
  background: #fff9f0;
}
</style>
