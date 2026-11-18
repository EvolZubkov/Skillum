// app/eligibility/gate.js
// PRD-6 retake gate runtime — barrier A, the calendar cooldown BETWEEN assignments
// (PRD-31 §3). Evaluates the configured eligibility plugin and either renders the
// cooldown state on the start page (blocked) or hands straight to the normal course
// with NO extra gate-shell (PRD-19 FR-19: an elapsed-cooldown test is
// indistinguishable from an ordinary one). Non-gated tests never reach here.
//
// PRD-31 moved the VERDICT to just after Initialize. Before it, `suspend_data` is
// unreadable (SCORM 2004 answers GetValue with error 122), so the package could not
// tell a NEW assignment from a re-entry into the current one — and the LMS grid
// carries no identifier that would (refuted by probes 2026-07-16 and 2026-08-01).
// Since a record turns finished after the FIRST attempt, the old placement blocked a
// learner INSIDE their own assignment with attempts left. NFR-01 now reads through
// its result (PRD-6 §9.1): a blocked launch writes no `cmi.*` and is closed at once
// with Terminate, so it never becomes a completed record.
//
// Side effects (fetch, suspend_data read, render) live here; the pure logic is
// EligibilityEngine/EligibilityPlugins.
var RetakeGate = (function () {
  // NFR-06. The budget used to be a fixed 5 s, and a learner with a long learning
  // history timed out on it: WebTutor takes that long to answer the records query. It
  // is now the plugin config's `timeoutMs`, with this as the default.
  var DEFAULT_TIMEOUT_MS = 30000;

  // How long the waiting indicator shows the bare line before it adds the note that
  // the check may take a while (approved wireframe prd6-gate-waiting.html).
  var WAIT_HINT_DELAY_MS = 5000;

  // The records request started at script parse time (see prefetch). `run` consumes
  // it, so the request is already in flight while the page finishes loading.
  var pending = null;

  // Set once the verdict is reached, so the delayed hint never writes into a page
  // that has already moved on.
  var waitingDone = false;

  // Monotonic clock for the gate's own budget: a wall-clock jump (NTP step after the
  // machine wakes) must not eat the plugin's remaining time. Wall time stays in
  // resolveToday, where comparing against the server clock IS the point.
  var monotonicNow = (typeof performance !== 'undefined' && performance && performance.now)
    ? function () { return performance.now(); }
    : function () { return Date.now(); };

  // Diagnostics. The gate used to emit ONE line, after deciding, carrying only the
  // normalized reason — so a broken integration was indistinguishable from a
  // non-gated package: `failPolicy` defaults to failOpen, which turns every error
  // (object_id/SECID not resolved, HTTP 403, timeout) into a plain `allowed`, and
  // the underlying message never left `result.data.error`. These trace the whole
  // resolution chain so a live WebTutor run can be read straight from the console.
  function glog() {
    if (typeof console === 'undefined' || !console.log) return;
    var args = ['[PRD-6 gate]'];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    console.log.apply(console, args);
  }

  function esc(s) {
    return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s);
  }

  function isGated(td) {
    var rp = td && td.retakePolicy;
    return !!(
      rp && rp.enabled === true &&
      rp.eligibilityPlugin && rp.eligibilityPlugin.key &&
      td.retakePlugin && td.retakePlugin.runtimeEntry
    );
  }

  // UTC calendar day of an epoch-ms value. The whole cooldown math is UTC-calendar on
  // both hosts (the web server uses toIsoDateUTC), and taking the day in UTC keeps the
  // learner's TIME ZONE out of the decision — otherwise a TZ set to UTC+14 would hand
  // out "tomorrow" without touching the clock.
  function isoDayFromMs(ms) {
    return EligibilityEngine.formatIsoDate(Math.floor(ms / 86400000));
  }

  /** The gate budget in ms: the plugin config's `timeoutMs`, else DEFAULT_TIMEOUT_MS. */
  function gateTimeoutMs(td) {
    var cfg = td && td.retakePlugin && td.retakePlugin.config;
    var v = cfg ? cfg.timeoutMs : undefined;
    return (typeof v === 'number' && isFinite(v) && v > 0) ? v : DEFAULT_TIMEOUT_MS;
  }

  // Trusted "today" (PRD-6 trusted-date). The clock itself, its sub-budget and every
  // degradation branch live in the shared TrustedNow module (app/utils/trusted-now.js),
  // because PRD-31's hour interval needs the same portal clock — with a full instant
  // rather than a day. The gate keeps only the day conversion.
  //
  // The day is resolved AFTER the records arrive, not before: the verdict is the only
  // place that needs it, and the `Date` header of the records response is the freshest
  // server stamp available. Without a usable one, TrustedNow reads the portal chrome —
  // already fetched for the SECID, so that costs no extra request either.
  function resolveToday(config, preferredHeader) {
    var src = (config && config.secidSource) || {};
    return TrustedNow.resolveNowMs(src.endpoint || '/', preferredHeader || '').then(function (ms) {
      return isoDayFromMs(ms);
    });
  }

  // The name the course carries IN THE LMS. The WebTutor adapter searches records by it
  // and keeps only those whose name equals it exactly, so a course named differently
  // from the test (e.g. «… (предфинальный тест)») is matched only through the author's
  // `lmsCourseName`; without it the test title stands in, as it always did.
  function lmsCourseName(td) {
    var own = td.retakePolicy && typeof td.retakePolicy.lmsCourseName === 'string'
      ? td.retakePolicy.lmsCourseName.replace(/^\s+|\s+$/g, '') : '';
    return own || td.title || '';
  }

  // The plugin context WITHOUT the day: the records request needs only the course name
  // and the config, so it can start before the clock is known. `runtime.todayDate` is
  // filled in by `evaluate` once the records (and their `Date` header) are in.
  function buildContext(td) {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
    var config = td.retakePlugin.config || {};
    var courseName = lmsCourseName(td);
    glog('LMS course name:', courseName,
      (courseName === (td.title || '') ? '(the test title)' : '(set by the author; test title: ' + (td.title || '') + ')'));
    return {
      test: { id: td.id || '', title: td.title || '' },
      retakePolicy: {
        cooldownPeriodDays: td.retakePolicy.cooldownPeriodDays,
        cooldownByOutcome: td.retakePolicy.cooldownByOutcome,
        cooldownPeriodDaysPassed: td.retakePolicy.cooldownPeriodDaysPassed,
        cooldownPeriodDaysFailed: td.retakePolicy.cooldownPeriodDaysFailed
      },
      runtime: {
        todayDate: '',
        timezone: tz,
        launchUrl: typeof location !== 'undefined' ? location.href : ''
      },
      lms: { scormVersion: '2004', courseName: courseName },
      config: config
    };
  }

  // Normalize the WebTutor collection response to a flat array of records. The
  // ExtJS json collection returns them under `results` ({success, total, results}).
  function extractRecords(json) {
    if (Array.isArray(json)) return json;
    if (!json || typeof json !== 'object') return [];
    return json.results || json.data || json.rows || json.records || json.items || [];
  }

  // `{{test.title}}` in an admin template is the title the LMS knows the course by, so it
  // resolves to the LMS course name (see lmsCourseName), which IS the title unless the
  // author named the course differently.
  function resolveTemplate(tpl, ctx, personId) {
    return String(tpl == null ? '' : tpl)
      .replace(/\{\{\s*test\.title\s*\}\}/g, ctx.lms.courseName)
      .replace(/\{\{\s*personId\s*\}\}/g, personId || '');
  }

  // The portal windows around the course frame, nearest first: the parent chain up to
  // `top`, then the window that opened the player. They share the course's origin
  // (confirmed 2026-08-01), so their HTML is readable with no request at all. A window
  // of another origin throws on `.document` and is skipped.
  function portalWindows() {
    var out = [];
    if (typeof window === 'undefined') return out;
    function add(w) { if (w && w !== window && out.indexOf(w) === -1) out.push(w); }
    var w = window;
    for (var i = 0; i < 10; i++) {
      var p = null;
      try { p = w.parent; } catch (e) { p = null; }
      if (!p || p === w) break;
      add(p);
      w = p;
    }
    try { add(window.top && window.top.opener); } catch (e) { /* cross-origin opener */ }
    try { add(window.opener); } catch (e) { /* cross-origin opener */ }
    return out;
  }

  /** First match of `pattern` in the HTML of an already loaded portal window, or null. */
  function scanPortalWindows(pattern) {
    var re = new RegExp(pattern);
    var wins = portalWindows();
    for (var i = 0; i < wins.length; i++) {
      var html = '';
      try { html = wins[i].document.documentElement.outerHTML || ''; } catch (e) { html = ''; }
      var m = re.exec(html);
      if (m) return m;
    }
    return null;
  }

  function secidPattern(config) {
    return (config.secidSource && config.secidSource.pattern) || '[A-F0-9]{32}';
  }

  // Scrape the session SECID (32-hex) the collection POST requires. It is taken from
  // the portal page ALREADY LOADED around the course first. Fetching the portal home
  // page (`secidSource.endpoint`, default "/") is the fallback only: that page lists the
  // learner's learnings, and for a learner with a long list WebTutor rendered it longer
  // than the whole gate budget (live log 2026-11-18: the page never answered within
  // 30 s, while the records query itself took 62 ms).
  function resolveSecid(config) {
    var local = scanPortalWindows(secidPattern(config));
    if (local) return Promise.resolve({ value: local[0], source: 'portal window' });
    var src = config.secidSource || {};
    return TrustedNow.fetchPortalChrome(src.endpoint || '/').then(function (page) {
      var m = new RegExp(secidPattern(config)).exec(page.text || '');
      return { value: m ? m[0] : '', source: 'GET ' + (src.endpoint || '/') };
    });
  }

  // Resolve cur_person_id. WebTutor's collection query is scoped to the learner by
  // `cur_person_id`; it is not in SCORM (pre-Initialize) so it is scraped — from the
  // loaded portal windows first, then from the portal page — via
  // `personIdSource.pattern`, with an optional config override.
  // NOTE: the live contract allows an EMPTY value (the endpoint is session-scoped),
  // so a miss here is not an error.
  function resolvePersonId(config) {
    if (config.personId) return Promise.resolve(String(config.personId));
    var src = config.personIdSource || {};
    if (!src.pattern) return Promise.resolve('');
    var local = scanPortalWindows(src.pattern);
    if (local) return Promise.resolve(local[1] || local[0]);
    return TrustedNow.fetchPortalChrome(src.endpoint || '/').then(function (page) {
      var m = new RegExp(src.pattern).exec(page.text || '');
      return m ? (m[1] || m[0]) : '';
    });
  }

  /** Whether the gate can do without the portal page: SECID (and person id) are local. */
  function portalPageNeeded(config) {
    if (!scanPortalWindows(secidPattern(config))) return true;
    var pid = config.personIdSource || {};
    return !!(pid.pattern && !config.personId && !scanPortalWindows(pid.pattern));
  }

  function formEncode(obj) {
    var out = [];
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        out.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
      }
    }
    return out.join('&');
  }

  // webtutor_cooldown adapter — reads the learner's LEARNING RECORDS (all attempts,
  // any outcome) from WebTutor's ExtJS json collection endpoint, same-origin with the
  // learner session, and decides the cooldown from the latest FINISHED record's date
  // (PRD-6 §3.3/§4.2). This is the correct source per the requirement "cooldown fires
  // after ANY completion, passed OR failed": the course CARD only carries a date for a
  // PASSED course, so it can never gate a failed attempt — the records grid carries
  // `last_usage_date` + `state` («Пройден»/«Не пройден») for every attempt.
  //
  // The request contract (confirmed against the live RT portal, «Мои обучения» grid):
  // POST form fields `secid`, `collection_code`, `parameters` (a `;`-joined string with
  // cur_person_id + sCatalogName), `referer_url`, `page`, `start`, header
  // `X-Requested-With: XMLHttpRequest`. Records come back under `results`, sorted
  // last_usage_date DESC; all assignments of one course share `name` (matched via the
  // filter's nameField = the test title). Endpoint/collection/filter are admin-config.
  //
  // Resolves to `{ dateHeader, decide }`: the records are fetched without knowing the
  // day, and `decide(ctx)` produces the verdict once `ctx.runtime.todayDate` is set from
  // `dateHeader` (the `Date` of THIS response) — see evaluate.
  function webtutorFetch(ctx, config) {
    var endpoint = config.collectionEndpoint || '';
    if (!endpoint) return Promise.reject(new Error('collection_endpoint_not_configured'));
    return Promise.all([resolveSecid(config), resolvePersonId(config)]).then(function (ids) {
      var secid = ids[0].value, personId = ids[1];
      glog('secid:', secid ? 'found (' + ids[0].source + ')' : '(NOT FOUND, ' + ids[0].source + ')',
        '| cur_person_id:', personId || '(session-scoped)');
      if (!secid) throw new Error('secid_not_resolved');
      var refererUrl = typeof location !== 'undefined' ? location.href : '';
      var body = formEncode({
        secid: secid,
        limit: config.limit || 500,
        collection_code: config.collectionCode || '',
        parameters: resolveTemplate(config.parametersTemplate || '', ctx, personId),
        referer_url: refererUrl,
        page: 1,
        start: 0
      });
      // `_dc` is ExtJS's cache-buster: any value unique per request will do, and the day
      // is not known yet at this point.
      var url = endpoint + (endpoint.indexOf('?') === -1 ? '?' : '&') + '_dc=' + Date.now();
      var postAt = monotonicNow();
      glog('collection POST:', endpoint, '| collection_code:', config.collectionCode);
      return fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        },
        body: body
      }).then(function (r) {
        glog('collection HTTP', r.status, '| answered in', Math.round(monotonicNow() - postAt), 'ms');
        if (!r.ok) throw new Error('webtutor_http_' + r.status);
        var dateHeader = '';
        try { dateHeader = (r.headers && r.headers.get && r.headers.get('Date')) || ''; } catch (e) { dateHeader = ''; }
        return r.json().then(function (json) { return { json: json, dateHeader: dateHeader }; });
      }).then(function (res) {
        var json = res.json;
        if (json && json.success === false) throw new Error('collection_error: ' + (json.messageText || 'unknown'));
        var records = extractRecords(json);
        glog('records:', records.length, '| total:', (json && json.total), '| course:', ctx.lms.courseName,
          '| filter:', JSON.stringify(config.attemptFilter || {}));
        return {
          dateHeader: res.dateHeader,
          decide: function (dayCtx) {
            var result = EligibilityPlugins.webtutorCooldownDecide(
              records, config.attemptFilter || {}, dayCtx, dayCtx.lms.courseName);
            glog('selected lastAttemptDate:',
              (result.data && result.data.lastAttemptDate) || '(none — no finished attempt for this course)');
            return result;
          }
        };
      });
    });
  }

  function startPlugin(td, ctx) {
    var entry = td.retakePlugin.runtimeEntry;
    if (entry === 'webtutorCooldown') return webtutorFetch(ctx, td.retakePlugin.config || {});
    // unknown adapter => allow (core default spirit)
    return Promise.resolve({ dateHeader: '', decide: function () { return true; } });
  }

  /**
   * Start the records request NOW and remember it for `run`. Called at script parse
   * time for a gated package (bottom of this module), i.e. before `window.load`,
   * SCORM.Initialize and the suspend_data read — the request is the slow part of the
   * gate, so it gets the whole budget instead of what the other steps left over.
   * The budget is counted from here, on the monotonic clock.
   */
  function prefetch(td) {
    // A fresh evaluation: drop any portal response cached by a previous run in this
    // window (e.g. a prior failed fetch) so the portal is always asked again.
    TrustedNow.reset();
    waitingDone = false;
    var startedAt = monotonicNow();
    var ctx = buildContext(td);
    var work;
    try { work = Promise.resolve(startPlugin(td, ctx)); } catch (e) { work = Promise.reject(e); }
    // `run` attaches the real handler later; this keeps an early failure from being
    // reported as an unhandled rejection in the meantime.
    work.catch(function () {});
    // The fallback day. When the portal page has to be fetched anyway (SECID not found in
    // the loaded windows), it is started NOW: it reads that same page's headers under
    // TrustedNow's own 2500 ms sub-budget, so it has long settled when the gate budget
    // runs out and the whole gate stays inside `timeoutMs`. When SECID is local, the
    // portal page is NOT requested up front at all — it is the slow request — and the
    // day is asked for only if the records response carries no usable `Date`.
    var fallbackToday = portalPageNeeded(ctx.config) ? resolveToday(ctx.config, '') : null;
    glog('records request started | budget:', gateTimeoutMs(td), 'ms | portal page:',
      fallbackToday ? 'requested (SECID not in the loaded portal windows)' : 'not needed');
    pending = { td: td, ctx: ctx, startedAt: startedAt, work: work, fallbackToday: fallbackToday };
    showWaiting(td, startedAt);
    return pending;
  }

  // The plugin gets the REMAINDER of the budget counted from `prefetch`, so the worst
  // case stays `timeoutMs` however long the page took to load around the request. The
  // day comes from the records response's `Date` header when it carries a usable one,
  // otherwise from the fallback day `prefetch` started (the portal chrome, then the
  // machine clock). A failed plugin still needs the day: the verdict state carries it.
  function evaluate(p) {
    var td = p.td, ctx = p.ctx;
    var failPolicy = (td.retakePolicy.eligibilityPlugin && td.retakePolicy.eligibilityPlugin.failPolicy) || 'failOpen';
    var config = td.retakePlugin.config || {};
    var budgetLeft = Math.max(0, gateTimeoutMs(td) - (monotonicNow() - p.startedAt));
    var timer = null;
    var timeout = new Promise(function (_resolve, reject) {
      timer = setTimeout(function () { reject(new Error('eligibility_timeout')); }, budgetLeft);
    });
    function withDay(header) {
      var headerMs = header ? Date.parse(header) : NaN;
      var day = (headerMs && isFinite(headerMs))
        ? resolveToday(config, header)
        : (p.fallbackToday || resolveToday(config, ''));
      return day.then(function (todayDate) {
        ctx.runtime.todayDate = todayDate;
        return ctx;
      });
    }
    return Promise.race([p.work, timeout])
      .then(function (raw) {
        clearTimeout(timer);
        return withDay(raw && raw.dateHeader).then(function (dayCtx) {
          return { ctx: dayCtx, result: EligibilityEngine.normalizeVerdict(raw.decide(dayCtx)) };
        });
      })
      .catch(function (e) {
        clearTimeout(timer);
        var msg = (e && e.message) ? e.message : String(e);
        glog('plugin FAILED:', msg, '- applying failPolicy:', failPolicy,
          failPolicy === 'failClosed' ? '(blocked)' : '(ALLOWED — the gate is now inert)');
        return withDay('').then(function (dayCtx) {
          return { ctx: dayCtx, result: EligibilityEngine.applyFailPolicy(failPolicy, msg) };
        });
      });
  }

  // Russian plural of «секунда» for the waiting hint: 1 секунду, 2–4 секунды, 5+ секунд.
  function secondsWord(n) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'секунду';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'секунды';
    return 'секунд';
  }

  // The waiting indicator (approved wireframe docs/wireframes/approved/prd6-gate-waiting.html).
  // It replaces the «Загрузка теста...» line inside `#loading`, so whatever renders next
  // into `#app` removes it with no extra step. The template is not loaded yet, so the
  // SVG carries its own size and stroke: a template without the `.tb-gate-wait` rules
  // still shows a ring of sane size, just not spinning.
  function showWaiting(td, startedAt) {
    if (typeof document === 'undefined') return;
    var host = document.getElementById('loading');
    if (!host) return;
    // The DS tokens resolve only under `.ou`, which templateCore puts on <html> once the
    // template manifest says which theme to use — after the gate. Until then the page is
    // the browser's white, so the indicator is its own light DS root.
    host.className = 'ou ou--light ou--normal tb-gate-wait';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.innerHTML =
      '<svg class="tb-gate-wait__spinner" width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<circle class="tb-gate-wait__track" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" opacity="0.18"></circle>' +
      '<circle class="tb-gate-wait__head" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5"' +
      ' stroke-linecap="round" stroke-dasharray="62.83" stroke-dashoffset="47"></circle>' +
      '</svg>' +
      '<p class="tb-gate-wait__text">Проверяем доступ к прохождению…</p>';
    var seconds = Math.ceil(gateTimeoutMs(td) / 1000);
    var delay = Math.max(0, WAIT_HINT_DELAY_MS - (monotonicNow() - startedAt));
    setTimeout(function () {
      if (waitingDone) return;
      var el = document.getElementById('loading');
      if (!el || !el.classList.contains('tb-gate-wait') || el.querySelector('.tb-gate-wait__hint')) return;
      var hint = document.createElement('p');
      hint.className = 'tb-gate-wait__hint';
      hint.textContent = 'Проверка может занять до ' + seconds + ' ' + secondsWord(seconds) + '. Не закрывайте окно.';
      el.appendChild(hint);
    }, delay);
  }

  function appEl() {
    return typeof document !== 'undefined' ? document.getElementById('app') : null;
  }

  function fmtDateHuman(iso) {
    if (!iso) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? (m[3] + '.' + m[2] + '.' + m[1]) : iso;
  }

  // The block page is a SYSTEM PAGE of the design template (PRD-6 §4.4): the gate
  // renders the template's `system.blocked` layout and fills `retake.*` via the
  // shared path-DSL. The template manifest/layouts are NOT loaded yet at gate time
  // (loadDesignTemplate runs inside runCourse, which the blocked path never reaches),
  // so the gate loads them itself — a pure fetch of package-local files that does NOT
  // touch SCORM, so NFR-01/02 (no Initialize before the gate decides) still holds.
  function ensureTemplate() {
    var layouts = (typeof state !== 'undefined' && state) ? state.templateLayouts : null;
    // `state.templateLayouts` is initialised to an EMPTY object (state.js), and
    // loadDesignTemplate runs only inside runCourse — which the gate never reaches.
    // So an empty map means "not loaded yet": load it ourselves (a pure package-local
    // fetch, no SCORM). Treating {} as loaded made the gate render its built-in wall
    // instead of the template's system.blocked / start screens.
    if (layouts && Object.keys(layouts).length > 0) return Promise.resolve(layouts);
    if (typeof loadDesignTemplate !== 'function') return Promise.resolve(null);
    var settled = false;
    var load = loadDesignTemplate()
      .then(function () { settled = true; return (typeof state !== 'undefined' && state) ? state.templateLayouts : null; })
      .catch(function () { settled = true; return null; });
    // Safety net: the template fetch can HANG (not reject) on WebTutor's cplayer —
    // the SCO runs in a sandboxed iframe and package-local fetches may stall with no
    // response and no error, leaving the learner on «Загрузка теста…» forever. Cap it
    // so the blocked screen always renders (null => built-in wall fallback). `settled`
    // keeps the timer quiet once the load has already resolved (setTimeout still fires).
    var timeout = new Promise(function (resolve) {
      setTimeout(function () {
        if (settled) return;
        glog('ensureTemplate timed out — falling back to built-in wall');
        resolve(null);
      }, 4000);
    });
    return Promise.race([load, timeout]);
  }

  function blockedLayoutKey(td) {
    var rp = td && td.retakePolicy;
    return (rp && rp.blockedPageId) || 'system.blocked';
  }

  function tbInternal() {
    var tb = (typeof window !== 'undefined' && window.TestBuilder) ||
      (typeof TestBuilder !== 'undefined' ? TestBuilder : null);
    return (tb && tb._internal) || null;
  }

  function setShown(node, shown) {
    if (!node) return;
    node.style.display = shown ? '' : 'none';
    // Also toggle the `hidden` attribute: the layout hides inactive branches with it
    // initially, and a scene rule keys off `[hidden]` — clearing style.display alone
    // would leave a shown branch hidden by the attribute.
    if (shown) node.removeAttribute('hidden');
    else node.setAttribute('hidden', '');
  }

  // Toggle the layout's `data-retake-branch` blocks to the relevant message:
  // cooldown (default) or error (failClosed). The unused `availableDate` line is
  // hidden when the plugin could not report a next-available date.
  function applyBlockBranches(el, retake) {
    var isError = !!(retake && retake.reason === 'plugin_error_fail_closed');
    setShown(el.querySelector('[data-retake-branch="default"]'), false);
    setShown(el.querySelector('[data-retake-branch="cooldown"]'), !isError);
    setShown(el.querySelector('[data-retake-branch="error"]'), isError);
    if (!isError && !(retake && retake.availableDate)) {
      setShown(el.querySelector('[data-retake-available]'), false);
    }
  }

  // Fallback wall used only when the template carries no `system.blocked` layout
  // (e.g. a template without it) so the learner never sees a blank screen.
  function renderBlockWallBuiltin(retake, el) {
    var avail = retake.availableDate ? fmtDateHuman(retake.availableDate) : null;
    var errorNote = retake.reason === 'plugin_error_fail_closed'
      ? '<p class="retake-wall__note">Не удалось проверить доступ. Обратитесь к администратору теста.</p>'
      : '';
    el.innerHTML =
      '<div class="retake-wall" data-testid="retake-wall">' +
      '<div class="retake-wall__card">' +
      '<h1 class="retake-wall__title">Повторное прохождение пока недоступно</h1>' +
      '<p class="retake-wall__lead">Этот тест можно проходить не чаще, чем раз в ' +
      esc(retake.cooldownPeriodDays) + ' дн.</p>' +
      (avail ? '<p class="retake-wall__date">Повторный запуск будет доступен с <strong>' + esc(avail) + '</strong>.</p>' : '') +
      errorNote +
      '</div></div>';
  }

  function renderBlockWall(retake, td) {
    ensureTemplate().then(function (layouts) {
      // Re-fetch #app AFTER the template loads: applyTemplateShell (mountShell) may
      // have REPLACED #app with the shell's node, detaching the one captured earlier.
      var el = appEl();
      if (!el) return;
      var html = layouts && layouts[blockedLayoutKey(td)];
      if (!html) { renderBlockWallBuiltin(retake, el); return; }
      el.innerHTML = html;
      var view = {
        // Shared header: test title + attempt subtitle (path-only DSL fills data-path).
        course: {
          title: (td && td.title) || (typeof TEST_DATA !== 'undefined' && TEST_DATA ? TEST_DATA.title : '') || '',
          subtitle: (typeof scormCourseSubtitle === 'function') ? scormCourseSubtitle() : ''
        },
        retake: {
          cooldownPeriodDays: retake.cooldownPeriodDays,
          availableDate: retake.availableDate,
          availableDateHuman: retake.availableDate ? fmtDateHuman(retake.availableDate) : ''
        }
      };
      var internal = tbInternal();
      if (internal && internal.renderPathOnlyDsl) internal.renderPathOnlyDsl(el, view);
      applyBlockBranches(el, retake);
    });
  }

  // PRD-19 FR-20: the cooldown state is shown ON the normal start page — and it is
  // drawn by the normal start page itself (`renderStartPage`, startPage.js), which
  // reads the verdict from `state.retake` (set by `run` before this is called). The
  // gate used to assemble a second copy of that screen and it drifted: it dropped the
  // description format (raw HTML tags on screen) and everything else it did not repeat
  // (testuniver.rt.ru, 2026-09-29). One renderer means the screen reached through
  // «Пройти заново» and the one reached through «Просмотреть» cannot differ.
  //
  // `runCourse` is deliberately NOT called: it installs the unload handler that writes
  // the result to the LMS, and a blocked launch must write nothing (NFR-01/02). The
  // session is already terminated by `run`, so the screen reads an empty run state —
  // a fresh learning has no prior attempt to offer. Falls back to the block-wall if
  // the active template ships no `start` layout (every conformant template does).
  function renderCooldownStart(retake, td) {
    if (typeof document === 'undefined') return;
    glog('rendering cooldown state...');
    // Last-resort safety net: whatever hangs or throws below (template fetch stall,
    // renderScreenInto error), guarantee the learner sees the cooldown message rather
    // than an endless «Загрузка теста…». Fires the built-in wall if nothing rendered.
    // Always re-fetch #app at write time: applyTemplateShell (mountShell) REPLACES
    // #app with the shell's node — writing to a pre-captured reference renders into a
    // detached node (visible symptom: content invisible, «Загрузка теста…» stays).
    var rendered = false;
    function fallbackWall() {
      if (rendered) return;
      var elw = appEl();
      if (!elw) return;
      try { renderBlockWallBuiltin(retake, elw); rendered = true; } catch (e) { glog('built-in wall failed:', (e && e.message) || e); }
    }
    setTimeout(function () {
      if (rendered) return;
      glog('cooldown render did not complete in time — forcing built-in wall');
      fallbackWall();
    }, 4500);
    ensureTemplate().then(function (layouts) {
      if (rendered) return;
      var el = appEl(); // fresh: #app may have been replaced by the shell mount
      if (!el) return;
      var TB = (typeof window !== 'undefined') ? window.TBTemplate : null;
      var layout = layouts && layouts['start'];
      glog('template ready. start layout:', !!layout, '| TBTemplate:', !!(TB && TB.renderScreenInto), '| #app:', !!el);
      if (!layout || !TB || !TB.renderScreenInto || typeof renderStartPage !== 'function') {
        renderBlockWall(retake, td);
        rendered = true;
        return;
      }
      if (typeof state !== 'undefined' && state) state.phase = 'start';
      renderStartPage();
      rendered = true;
      glog('cooldown state rendered on start page');
    }).catch(function (e) {
      // A throw here (renderScreenInto / buildStartState) was previously an unhandled
      // rejection: no log, learner stuck on the loading text. Fall back to the wall.
      glog('cooldown render error:', (e && e.message) || e);
      fallbackWall();
    });
  }

  /**
   * Has this SCORM registration — i.e. THIS assignment — already been played? The
   * answer lives in suspend_data and is readable only after Initialize, which is why
   * the verdict moved here (see the module header). A registration that already
   * carries attempts is a RE-ENTRY, and barrier A does not apply to it: the learner
   * is inside the assignment they were given, where only `maxAttempts` and the hour
   * interval (barrier B, enforced on the start screen) govern the next run.
   */
  function alreadyPlayedThisRegistration() {
    var raw = '';
    try {
      raw = (typeof SCORM !== 'undefined' && SCORM.getValue) ? (SCORM.getValue('cmi.suspend_data') || '') : '';
    } catch (e) {
      // A suspend_data read must never decide the launch by throwing; treat an
      // unreadable store as "not played" and let the barrier evaluate normally.
      glog('suspend_data unreadable while checking re-entry:', (e && e.message) || e);
      return false;
    }
    if (!raw) return false;
    try {
      var obj = JSON.parse(raw);
      if (!obj) return false;
      // Read DIRECTLY rather than through suspendAttempts' helpers: the gate must not
      // depend on another part of the flat bundle being present, or a change in the
      // concatenation order would silently revert this to the old behaviour — and the
      // old behaviour is the defect.
      if (typeof obj.attemptsUsed === 'number' && obj.attemptsUsed > 0) return true;
      // PRD-36: format 2 keeps the best summary instead of a list. The legacy array is
      // still checked — packages built before PRD-36 keep writing it inside their own runs,
      // and a learner re-entering one of those must not be sent back to the cooldown.
      if (obj.best) return true;
      if (obj.attempts && obj.attempts.length > 0) return true;
      // A suspended session counts too: an attempt in progress means this assignment
      // is already in play. It is not covered by the two checks above — for a test
      // with no attempt limit `registerAttemptStart` never increments the counter, and
      // `attempts[]` only fills on completion.
      if (obj.currentSession) return true;
      return false;
    } catch (e) {
      glog('suspend_data unparseable while checking re-entry:', (e && e.message) || e);
      return false;
    }
  }

  function run(td, onAllowedStart) {
    // Take the request `prefetch` started at parse time. No `TrustedNow.reset()` here
    // any more: it would throw away the portal response that request is built on. A run
    // without a prefetch (another TEST_DATA, or a host that skipped it) starts one now,
    // which resets the cache itself.
    var p;
    try {
      p = (pending && pending.td === td) ? pending : prefetch(td);
    } catch (e) {
      // bootstrap/main.js calls run() with no try/catch: a throw here would leave the
      // learner on the loading screen for good. Start the course (failOpen spirit).
      glog('GATE CRASHED (context build):', (e && e.stack) || e, '- starting the course (failOpen spirit)');
      pending = null;
      onAllowedStart();
      return;
    }
    pending = null;

    // Open the session FIRST: suspend_data is what distinguishes a new assignment
    // from a re-entry, and it cannot be read before Initialize. runCourse calls
    // SCORM.init() again — the wrapper makes that a no-op.
    try {
      if (typeof SCORM !== 'undefined' && SCORM.init) SCORM.init();
    } catch (e) {
      glog('SCORM.init failed before the verdict:', (e && e.message) || e);
    }

    if (alreadyPlayedThisRegistration()) {
      // The records request already in flight is simply left to settle unread: it only
      // reads, so an extra one costs nothing but the round trip.
      waitingDone = true;
      glog('re-entry into the CURRENT assignment (suspend_data carries attempts)' +
        ' — barrier A does not apply; the start screen enforces the interval');
      onAllowedStart();
      return;
    }

    glog('gated. plugin:', td.retakePlugin.runtimeEntry,
      '| cooldownPeriodDays:', p.ctx.retakePolicy.cooldownPeriodDays);
    evaluate(p).then(function (outcome) {
      waitingDone = true;
      var ctx = outcome.ctx, result = outcome.result;
      glog('today:', ctx.runtime.todayDate);
      var retake = EligibilityEngine.buildRetakeState(result, {
        todayDate: ctx.runtime.todayDate,
        cooldownPeriodDays: ctx.retakePolicy.cooldownPeriodDays
      });
      if (typeof state !== 'undefined' && state) state.retake = retake;
      if (typeof console !== 'undefined' && console.log) {
        console.log('PRD-6 retake gate:', result.allowed ? 'allowed' : 'blocked',
          '(' + (retake.reason || '') + (retake.availableDate ? ', available ' + retake.availableDate : '') + ')');
      }
      // buildRetakeState drops `data`, so the underlying error would otherwise be
      // lost even though the verdict was decided by failPolicy rather than by data.
      if (result.data && result.data.error) glog('decided by failPolicy. error was:', result.data.error);
      glog('lastAttemptDate:', (result.data && result.data.lastAttemptDate) || '(none)',
        '| availableDate:', retake.availableDate || '(none)');
      // PRD-19 FR-19: eligible => NO gate-shell. Hand straight to the normal
      // course (onAllowedStart = runCourse: the standard start page), so an
      // elapsed-cooldown test is indistinguishable from an ordinary one.
      // FR-20: blocked => the cooldown state renders ON the standard start page,
      // not a separate wall.
      if (!result.allowed) {
        // PRD-6 §9.1: nothing was written to `cmi.*` on this path, so closing the
        // session at once keeps a blocked launch from becoming a completed record —
        // which is what NFR-01 actually protects. Failure to terminate must not
        // swallow the cooldown screen, hence the try.
        try {
          if (typeof SCORM !== 'undefined' && SCORM.terminate) SCORM.terminate();
        } catch (e) {
          glog('terminate after a blocked launch failed:', (e && e.message) || e);
        }
        renderCooldownStart(retake, td);
      } else onAllowedStart();
    }).catch(function (e) {
      // evaluate() already absorbs plugin errors via failPolicy, so reaching here means
      // the GATE itself broke after the verdict (retake state build / template render).
      // Previously this was an unhandled rejection: no log, and a learner left on a
      // blank #app.
      glog('GATE CRASHED (verdict handling):', (e && e.stack) || e,
        '- starting the course (failOpen spirit)');
      try { onAllowedStart(); } catch (e2) { glog('course start also failed:', (e2 && e2.stack) || e2); }
    });
  }

  // Start the records request at parse time, before the page finishes loading. The
  // module is concatenated after testData.js, so TEST_DATA is already defined here; a
  // host that evaluates the gate without it (unit tests) leaves the start to `run`.
  if (typeof TEST_DATA !== 'undefined' && isGated(TEST_DATA)) {
    try { prefetch(TEST_DATA); } catch (e) { glog('records prefetch failed to start:', (e && e.message) || e); }
  }

  return { isGated: isGated, run: run };
})();
