/**
 * @module tests/eligibility-gate-prefetch
 *
 * PRD-6 gate: the records request starts at SCRIPT PARSE time and the learner sees a
 * waiting indicator while it runs. Both over the REAL gate runtime, assembled the way
 * the package concatenates it (TrustedNow, engine, plugins, gate) with `TEST_DATA`
 * defined beforehand, as testData.js defines it in the package.
 *
 * Covered:
 * 1. Prefetch — evaluating the gate module of a gated package fires the portal chrome
 *    fetch at once, before `run` (i.e. before `window.load` and SCORM.Initialize), and
 *    `run` consumes that request instead of starting a second one.
 * 2. Re-entry — a registration that already carries attempts starts the course at once;
 *    the request in flight is left unread.
 * 3. Waiting indicator — `#loading` gets the spinner and the line from the approved
 *    wireframe (docs/wireframes/approved/prd6-gate-waiting.html); after 5 s without a
 *    verdict the note naming the budget appears; a verdict reached first suppresses it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const trustedNowSrc = read("server/scorm/template/app/utils/trusted-now.js");
const engineSrc = read("server/scorm/template/app/eligibility/engine.js");
const pluginsSrc = read("server/scorm/template/app/eligibility/plugins.js");
const gateSrc = read("server/scorm/template/app/eligibility/gate.js");

/** Evaluate the gate runtime with `TEST_DATA` in scope, exactly as the package does. */
function loadGate(testData: unknown, state: Record<string, unknown>, SCORM: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    "TEST_DATA",
    "state",
    "SCORM",
    "escapeHtml",
    "loadDesignTemplate",
    `${trustedNowSrc}\n${engineSrc}\n${pluginsSrc}\n${gateSrc}\n;return RetakeGate;`,
  );
  return factory(testData, state, SCORM, (s: unknown) => String(s == null ? "" : s), () => Promise.resolve(null));
}

/** Gated test data: one finished attempt on 20.05.2026, 30-day cooldown. */
function gatedTest(extraConfig: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Курс",
    retakePolicy: {
      enabled: true,
      cooldownPeriodDays: 30,
      eligibilityPlugin: { key: "webtutor_cooldown", failPolicy: "failOpen" },
    },
    retakePlugin: {
      runtimeEntry: "webtutorCooldown",
      config: {
        collectionEndpoint: "/pp/Ext5/extjs_json_collection_data.html",
        secidSource: { endpoint: "/", pattern: "[A-F0-9]{32}" },
        attemptFilter: {
          stateField: "state",
          stateIn: ["Пройден", "Не пройден"],
          dateField: "last_usage_date",
          dateFormat: "dd.MM.yyyy",
        },
        ...extraConfig,
      },
    },
  };
}

/**
 * Answer the portal chrome and the records POST. `holdRecords` keeps the POST pending
 * until the returned `release` is called, to model a slow WebTutor.
 */
function stubFetch(opts: { holdRecords?: boolean } = {}) {
  const calls: string[] = [];
  let release: () => void = () => {};
  const headers = { get: (k: string) => (String(k).toLowerCase() === "date" ? "Sat, 30 May 2026 09:00:00 GMT" : null) };
  vi.stubGlobal("fetch", (url: string) => {
    calls.push(String(url));
    if (String(url).indexOf("extjs_json_collection_data") !== -1) {
      const answer = {
        ok: true,
        status: 200,
        headers,
        json: () => Promise.resolve({
          success: true,
          total: 1,
          results: [{ state: "Пройден", last_usage_date: "20.05.2026" }],
        }),
      };
      if (!opts.holdRecords) return Promise.resolve(answer);
      return new Promise((res) => { release = () => res(answer); });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers,
      text: () => Promise.resolve("ABCDEF0123456789ABCDEF0123456789"),
    });
  });
  return { calls, release: () => release() };
}

async function flush() {
  for (let i = 0; i < 32; i++) await Promise.resolve();
}

const SCORM_FRESH = { getValue: () => "", init: () => {}, terminate: () => {} };

beforeEach(() => {
  document.body.innerHTML = '<div id="app"><div id="loading">Загрузка теста...</div></div>';
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PRD-6 gate — records request at parse time", () => {
  it("starts the portal request when the module is evaluated, before run", () => {
    const { calls } = stubFetch();
    loadGate(gatedTest(), { templateLayouts: {} }, SCORM_FRESH);
    expect(calls).toContain("/");
  });

  it("does not start anything for a package that is not gated", () => {
    const { calls } = stubFetch();
    const td = gatedTest();
    td.retakePolicy.enabled = false;
    loadGate(td, { templateLayouts: {} }, SCORM_FRESH);
    expect(calls).toHaveLength(0);
  });

  it("run consumes the prefetched request instead of issuing a second one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T10:00:00Z"));
    const { calls } = stubFetch();
    const td = gatedTest();
    const state: Record<string, unknown> = { templateLayouts: {} };
    const gate = loadGate(td, state, SCORM_FRESH);
    await flush();

    gate.run(td, () => {});
    await flush();

    expect(calls.filter((u) => u === "/")).toHaveLength(1);
    expect(calls.filter((u) => u.indexOf("extjs_json_collection_data") !== -1)).toHaveLength(1);
    // The verdict used the portal day from the headers: 30.05 is inside the cooldown.
    expect((state.retake as any)?.todayDate).toBe("2026-05-30");
    expect((state.retake as any)?.allowed).toBe(false);
  });

  it("counts the budget from the prefetch, not from run", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T10:00:00Z"));
    vi.stubGlobal("fetch", () => new Promise(() => {})); // never settles
    const td = gatedTest({ timeoutMs: 8000 });
    const gate = loadGate(td, { templateLayouts: {} }, SCORM_FRESH);

    // The page takes 3 s to finish loading before boot() calls run.
    await vi.advanceTimersByTimeAsync(3000);
    let started = false;
    gate.run(td, () => { started = true; });

    await vi.advanceTimersByTimeAsync(4999);
    await flush();
    expect(started).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(started).toBe(true);
  });

  it("starts the course at once on a re-entry, leaving the request unread", async () => {
    stubFetch({ holdRecords: true });
    const td = gatedTest();
    const state: Record<string, unknown> = { templateLayouts: {} };
    const SCORM = { ...SCORM_FRESH, getValue: (k: string) => (k === "cmi.suspend_data" ? '{"attemptsUsed":1}' : "") };
    const gate = loadGate(td, state, SCORM);

    let started = false;
    gate.run(td, () => { started = true; });

    expect(started).toBe(true);
    expect(state.retake).toBeUndefined();
  });
});

/**
 * Make `window.parent` a same-origin portal window whose HTML is `html`, as the course
 * frame sees it inside the WebTutor player. Returns the restore function.
 */
function withPortalParent(html: string): () => void {
  const portal: Record<string, unknown> = { document: { documentElement: { outerHTML: html } } };
  portal.parent = portal;
  const prev = Object.getOwnPropertyDescriptor(window, "parent");
  Object.defineProperty(window, "parent", { configurable: true, get: () => portal });
  return () => {
    if (prev) Object.defineProperty(window, "parent", prev);
  };
}

/**
 * Live WebTutor, 2026-11-18: for a learner with a long learning list the portal home
 * page («/») did not answer within the 30 s budget, while the records query took 62 ms.
 * The SECID is in the portal page that already surrounds the course, so the gate takes
 * it from there and never requests «/».
 */
describe("PRD-6 gate — SECID from the loaded portal window", () => {
  it("takes the SECID from the parent window and does not request the portal page", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T10:00:00Z"));
    const restore = withPortalParent('<html><body data-secid="0123456789ABCDEF0123456789ABCDEF"></body></html>');
    try {
      const calls: string[] = [];
      const bodies: unknown[] = [];
      vi.stubGlobal("fetch", (url: string, init?: { body?: unknown }) => {
        calls.push(String(url));
        bodies.push(init?.body);
        if (String(url).indexOf("extjs_json_collection_data") !== -1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: (k: string) => (k.toLowerCase() === "date" ? "Sat, 30 May 2026 09:00:00 GMT" : null) },
            json: () => Promise.resolve({ success: true, total: 1, results: [{ state: "Пройден", last_usage_date: "20.05.2026" }] }),
          });
        }
        return new Promise(() => {}); // the portal page never answers
      });
      const td = gatedTest();
      const state: Record<string, unknown> = { templateLayouts: {} };
      const gate = loadGate(td, state, SCORM_FRESH);
      gate.run(td, () => {});
      await flush();

      expect(calls).not.toContain("/");
      expect(String(bodies[0])).toContain("secid=0123456789ABCDEF0123456789ABCDEF");
      // Verdict reached at once, on the records response's clock.
      expect((state.retake as any)?.todayDate).toBe("2026-05-30");
      expect((state.retake as any)?.allowed).toBe(false);
    } finally {
      restore();
    }
  });

  // Live WebTutor 2026-11-18: the course opens in its own window, so there is no parent
  // chain; the SECID sits in the portal page that opened it (`top.opener`).
  it("takes the SECID from the window that opened the player", async () => {
    const opener = { document: { documentElement: { outerHTML: "<p>FEDCBA9876543210FEDCBA9876543210</p>" } } };
    const prev = Object.getOwnPropertyDescriptor(window, "opener");
    Object.defineProperty(window, "opener", { configurable: true, get: () => opener });
    try {
      const calls: string[] = [];
      const bodies: unknown[] = [];
      vi.stubGlobal("fetch", (url: string, init?: { body?: unknown }) => {
        calls.push(String(url));
        bodies.push(init?.body);
        if (String(url).indexOf("extjs_json_collection_data") !== -1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: (k: string) => (k.toLowerCase() === "date" ? "Sat, 30 May 2026 09:00:00 GMT" : null) },
            json: () => Promise.resolve({ success: true, total: 0, results: [] }),
          });
        }
        return new Promise(() => {});
      });
      const td = gatedTest();
      const state: Record<string, unknown> = { templateLayouts: {} };
      loadGate(td, state, SCORM_FRESH).run(td, () => {});
      await flush();

      expect(calls).not.toContain("/");
      expect(String(bodies[0])).toContain("secid=FEDCBA9876543210FEDCBA9876543210");
      expect((state.retake as any)?.checked).toBe(true);
    } finally {
      if (prev) Object.defineProperty(window, "opener", prev);
    }
  });

  it("asks the portal page for the day only when the records response has no Date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T10:00:00Z"));
    const restore = withPortalParent('<div>0123456789ABCDEF0123456789ABCDEF</div>');
    try {
      const calls: string[] = [];
      vi.stubGlobal("fetch", (url: string) => {
        calls.push(String(url));
        if (String(url).indexOf("extjs_json_collection_data") !== -1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: () => Promise.resolve({ success: true, total: 0, results: [] }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: (k: string) => (k.toLowerCase() === "date" ? "Sat, 30 May 2026 09:00:00 GMT" : null) },
          text: () => new Promise(() => {}), // the body never arrives: the day must not wait for it
        });
      });
      const td = gatedTest();
      const state: Record<string, unknown> = { templateLayouts: {} };
      const gate = loadGate(td, state, SCORM_FRESH);
      gate.run(td, () => {});
      await flush();

      expect(calls.filter((u) => u === "/")).toHaveLength(1);
      expect((state.retake as any)?.todayDate).toBe("2026-05-30");
    } finally {
      restore();
    }
  });
});

describe("PRD-6 gate — waiting indicator", () => {
  it("replaces the loading line with the spinner and the wireframe text", () => {
    stubFetch({ holdRecords: true });
    loadGate(gatedTest(), { templateLayouts: {} }, SCORM_FRESH);

    const host = document.getElementById("loading")!;
    // Its own light DS root: the template puts `.ou` on <html> only after the gate.
    expect(host.className).toBe("ou ou--light ou--normal tb-gate-wait");
    expect(host.getAttribute("role")).toBe("status");
    expect(host.getAttribute("aria-live")).toBe("polite");
    expect(host.querySelector("svg.tb-gate-wait__spinner")).not.toBeNull();
    expect(host.querySelector(".tb-gate-wait__text")?.textContent).toBe("Проверяем доступ к прохождению…");
    expect(host.querySelector(".tb-gate-wait__hint")).toBeNull();
  });

  it("adds the note naming the default budget after 5 s without a verdict", async () => {
    vi.useFakeTimers();
    stubFetch({ holdRecords: true });
    loadGate(gatedTest(), { templateLayouts: {} }, SCORM_FRESH);

    await vi.advanceTimersByTimeAsync(4999);
    expect(document.querySelector(".tb-gate-wait__hint")).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector(".tb-gate-wait__hint")?.textContent)
      .toBe("Проверка может занять до 30 секунд. Не закрывайте окно.");
  });

  it.each([
    [21000, "до 21 секунду"],
    [3500, "до 4 секунды"],
    [12000, "до 12 секунд"],
  ])("names a configured budget of %i ms as «%s»", async (timeoutMs, phrase) => {
    vi.useFakeTimers();
    stubFetch({ holdRecords: true });
    loadGate(gatedTest({ timeoutMs }), { templateLayouts: {} }, SCORM_FRESH);

    await vi.advanceTimersByTimeAsync(5000);
    expect(document.querySelector(".tb-gate-wait__hint")?.textContent).toContain(phrase);
  });

  it("does not add the note once the verdict is reached", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T10:00:00Z"));
    stubFetch();
    // An adapter the runtime does not know allows at once; the no-op course start keeps
    // #loading in place, so only the verdict flag can stop the note.
    const td = gatedTest();
    td.retakePlugin.runtimeEntry = "unknownAdapter";
    const gate = loadGate(td, { templateLayouts: {} }, SCORM_FRESH);
    let started = false;
    gate.run(td, () => { started = true; });
    await flush();
    expect(started).toBe(true);
    expect(document.getElementById("loading")).not.toBeNull();

    await vi.advanceTimersByTimeAsync(5000);
    expect(document.querySelector(".tb-gate-wait__hint")).toBeNull();
  });
});
