/**
 * @module generate-prd1-template-previews
 * @description Wrapper script that generates preview.html for every template it can
 * find: the built-in ones under server/scorm/templates/ and the ones VENDORED OUT into
 * their own repositories (certification, standard-rt), which live side by side in the
 * templates directory. All HTML, CSS, JS, and data are read from the template directory
 * and the PRD1 runtime; the script itself contains no layout or styling logic.
 *
 * A vendored-out template keeps its package under `<repo>/template/`, so the scan accepts
 * both shapes: a manifest directly in the directory and one a `template/` level deeper.
 * Its preview is written back into ITS OWN repository — that is where the file belongs.
 *
 * VENDORED-OUT TEMPLATES ONLY ON REQUEST (`--external`). By default the script writes the
 * previews of the built-in templates alone. `npm run build` starts with this script, and
 * the vendored-out repositories sit at ONE path shared by every worktree: a default run
 * used to rewrite their previews from whatever branch was being built, the product commit
 * never took those files, and they hung modified in the template repositories with nobody
 * to commit them. A vendored-out preview is regenerated when THAT template releases a
 * version, and goes into the template's own commit.
 *
 * ONE TEMPLATE AT A TIME (`--template-dir`). A template repository cannot build its preview
 * alone — half of the file is the product runtime — so its `build.ps1` calls this script
 * with its own package directory. Only that preview is written: neither the built-in one
 * (it would hang modified in the product) nor the neighbouring vendored-out template.
 * The directory is taken as given, so a worktree of a template repository works too.
 *
 * The directory holding those repositories comes from SKILLUM_TEMPLATES_DIR, falling back
 * to the agreed location next to the product.
 *
 * Usage:
 *   node scripts/docs/generate-prd1-template-previews.mjs
 *       built-in templates only (what `npm run build` runs)
 *   node scripts/docs/generate-prd1-template-previews.mjs --external
 *       plus every vendored-out template
 *   node scripts/docs/generate-prd1-template-previews.mjs --external=standard-rt
 *       plus the named vendored-out templates (comma-separated manifest ids)
 *   node scripts/docs/generate-prd1-template-previews.mjs --template-dir=<path>
 *       exactly one template package (the directory holding its manifest.json)
 *
 * Exit code is 1 when any preview failed to build.
 */

import fs from "node:fs";
import path from "node:path";
import { buildSync } from "esbuild";

const root = process.cwd();

/** Where the repositories of the vendored-out templates live. */
const externalTemplatesDir =
  process.env.SKILLUM_TEMPLATES_DIR && process.env.SKILLUM_TEMPLATES_DIR.trim().length > 0
    ? process.env.SKILLUM_TEMPLATES_DIR
    : path.join("C:", "Repositories", "skill'um", "templates");

/**
 * Parsed command line.
 *
 * @typedef {object} PreviewOptions
 * @property {boolean} includeExternal Whether vendored-out repositories are scanned.
 * @property {Set<string>|null} externalIds Manifest ids to keep among vendored-out
 *   templates; `null` keeps all of them.
 * @property {string|null} templateDir A single template package to build, or `null`.
 */

/**
 * Read the options from the command line.
 *
 * @param {string[]} args Arguments after the script name.
 * @returns {PreviewOptions} Parsed options.
 */
function parseOptions(args) {
  /** @type {PreviewOptions} */
  const options = { includeExternal: false, externalIds: null, templateDir: null };
  for (const arg of args) {
    if (arg === "--external") {
      options.includeExternal = true;
    } else if (arg.startsWith("--external=")) {
      options.includeExternal = true;
      const ids = arg.slice("--external=".length).split(",").map((v) => v.trim()).filter(Boolean);
      options.externalIds = new Set([...(options.externalIds ?? []), ...ids]);
    } else if (arg.startsWith("--template-dir=")) {
      options.templateDir = path.resolve(arg.slice("--template-dir=".length));
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return options;
}

const options = parseOptions(process.argv.slice(2));
const includeExternal = options.includeExternal;

/**
 * Roots scanned for template packages: the built-in dir, plus the vendored-out repos when
 * `--external` is given.
 */
const TEMPLATE_ROOTS = [
  path.join(root, "server", "scorm", "templates"),
  ...(includeExternal ? [externalTemplatesDir] : []),
];
const runtimeDir    = path.join(root, "server", "scorm", "template", "app");

/** PRD1 runtime files inlined into every preview. */
const PRD1_RUNTIME_FILES = [
  path.join(runtimeDir, "templateCore.js"),
  path.join(runtimeDir, "render", "renderers.js"),
  path.join(runtimeDir, "render", "contentPage.js"),
  path.join(runtimeDir, "routerFlow.js"),
];

/** Shared browser bootstrap (route switching, DSL, question interactions). */
const BOOTSTRAP_FILE = path.join(root, "scripts", "docs", "_preview-bootstrap.js");

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Read a source file with line endings NORMALISED to LF.
 *
 * Every caller ends up embedding the text into `preview.html` — layouts and styles as
 * JS string literals through `JSON.stringify`, the runtime inline in a `<script>`. On a
 * Windows checkout (`core.autocrlf=true`) the bytes on disk carry CRLF, so without this
 * the literals gain `\r\n` while the committed previews hold `\n`: regeneration then
 * produces a diff of thousands of invisible differences on top of the real edit, and two
 * developers on different systems rewrite the file after each other forever. Normalising
 * on READ (rather than on write) keeps the rule in ONE place — every embedding path goes
 * through here.
 */
function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function scriptSafe(src) {
  return src.replace(/<\/script/gi, "<\\/script");
}

function jsonInline(value) {
  return scriptSafe(JSON.stringify(value, null, 2));
}

function escAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Template discovery ───────────────────────────────────────────────────────

/**
 * Read a template's id from its manifest.
 *
 * @param {string} dir Template package directory (holds `manifest.json`).
 * @param {string} fallback Id to use when the manifest declares none or is unreadable.
 * @returns {string} The id declared by the template.
 */
function manifestId(dir, fallback) {
  try {
    const declared = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")).id;
    if (typeof declared === "string" && declared.length > 0) return declared;
  } catch {
    /* unreadable manifest: fall back and let the build report it */
  }
  return fallback;
}

/**
 * Template packages to build, per the command line.
 *
 * @returns {{id: string, dir: string}[]} Packages in build order.
 */
function discoverTemplateDirs() {
  if (options.templateDir) {
    const dir = options.templateDir;
    if (!fs.existsSync(path.join(dir, "manifest.json"))) {
      console.error(`No manifest.json in ${dir}`);
      process.exit(1);
    }
    return [{ id: manifestId(dir, path.basename(dir)), dir }];
  }
  const builtInRoot = TEMPLATE_ROOTS[0];
  const seen = new Set();
  const out = [];
  for (const base of TEMPLATE_ROOTS) {
    if (!fs.existsSync(base)) continue;
    for (const e of fs.readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      // Built-in: the manifest lies in the directory itself. Vendored out: the package
      // sits under `template/`, because the repository also carries a README, the build
      // script and the font/logo sources.
      const candidates = [path.join(base, e.name), path.join(base, e.name, "template")];
      const dir = candidates.find((c) => fs.existsSync(path.join(c, "manifest.json")));
      if (!dir) continue;
      // The id is the template's own, declared in its manifest — a repository is named
      // after its package (`skillum-template-certification`), not after the template.
      const id = manifestId(dir, e.name);
      if (base !== builtInRoot && options.externalIds && !options.externalIds.has(id)) continue;
      if (seen.has(id)) continue; // first root wins on id collision
      seen.add(id);
      out.push({ id, dir });
    }
  }
  return out;
}

// ─── Template file reading ────────────────────────────────────────────────────

function readLayouts(templateDir, manifest) {
  const layouts = manifest.layouts || {};
  const result = {};

  for (const [key, relPath] of Object.entries(layouts)) {
    const full = path.join(templateDir, relPath);
    if (fs.existsSync(full)) {
      result[key] = readText(full);
    } else {
      console.warn(`  [warn] layout "${key}" not found: ${relPath}`);
      result[key] = "";
    }
  }

  // System page layouts — keyed by page id (e.g. "system.locked")
  for (const page of (manifest.systemPages || [])) {
    if (page.id && page.layout) {
      const full = path.join(templateDir, page.layout);
      if (fs.existsSync(full)) {
        result[page.id] = readText(full);
      } else {
        console.warn(`  [warn] system page layout "${page.id}" not found: ${page.layout}`);
      }
    }
  }

  // Partials — keyed by partial name for {{> name }} resolution in bootstrap
  for (const [key, relPath] of Object.entries(manifest.partials || {})) {
    const full = path.join(templateDir, relPath);
    if (fs.existsSync(full)) {
      result[key] = readText(full);
    } else {
      console.warn(`  [warn] partial "${key}" not found: ${relPath}`);
    }
  }

  return result;
}

/**
 * The design system, inlined into every preview BEFORE the template's own CSS —
 * the same order the SCORM package assembles (`assemblePackageStyles`: DS first,
 * theme.css over it).
 *
 * Without it the preview had `.ou` on <html> but no DS stylesheet behind it, so
 * every `var(--ou-*)` in a template resolved to nothing: `gap: var(--ou-space-9)`
 * fell back to `normal` and the start screen's facts row collapsed into one glued
 * line. The scene is authored against DS tokens and `.ou-*` components, so a
 * preview without them shows a different template than either host renders.
 *
 * `url('../fonts/…')` is authored relative to the ui-kit `css/` dir; the preview is
 * served from `/api/templates/<id>/assets/preview.html`, so the path is rewritten to
 * the app-absolute `/fonts/…` that `client/public/fonts/` answers.
 */
function readDsCss() {
  const dsPath = path.join(root, "vendor", "ui-kit", "css", "skillum-ds.css");
  if (!fs.existsSync(dsPath)) {
    console.warn(`  [warn] DS stylesheet not found: ${path.relative(root, dsPath)}`);
    return "";
  }
  return readText(dsPath).replace(/url\('\.\.\/fonts\//g, "url('/fonts/");
}

function readAssetStyles(templateDir, manifest) {
  const styles = (manifest.assets || {}).styles || [];
  return styles
    .map((rel) => {
      const full = path.join(templateDir, rel);
      if (fs.existsSync(full)) return `/* ${rel} */\n${readText(full)}`;
      console.warn(`  [warn] style not found: ${rel}`);
      return "";
    })
    .join("\n");
}

function readAssetScripts(templateDir, manifest) {
  const scripts = (manifest.assets || {}).scripts || [];
  return scripts
    .map((rel) => {
      const full = path.join(templateDir, rel);
      if (fs.existsSync(full)) return `/* ${rel} */\n${readText(full)}`;
      console.warn(`  [warn] script not found: ${rel}`);
      return "";
    })
    .join("\n");
}

function readDemoData(templateDir, manifest) {
  const demoDataPath = (manifest.preview || {}).demoData;
  if (!demoDataPath) return {};
  const full = path.join(templateDir, demoDataPath);
  if (!fs.existsSync(full)) {
    console.warn(`  [warn] demoData not found: ${demoDataPath}`);
    return {};
  }
  return readJson(full);
}

function readPrd1Runtime() {
  return PRD1_RUNTIME_FILES
    .map((file) => {
      if (!fs.existsSync(file)) {
        console.warn(`  [warn] PRD1 runtime file not found: ${file}`);
        return "";
      }
      // The marker is written with `/` on every OS: the platform separator made each build on
      // Windows rewrite the committed preview (and each build on Linux rewrite it back), so the
      // tree was dirty after every build with no real change in it.
      return `/* ${path.relative(root, file).split(path.sep).join("/")} */\n${readText(file)}`;
    })
    .join("\n\n");
}

function readBootstrap() {
  if (!fs.existsSync(BOOTSTRAP_FILE)) {
    throw new Error(`Preview bootstrap not found: ${BOOTSTRAP_FILE}`);
  }
  return readText(BOOTSTRAP_FILE);
}

/**
 * Bundles the REAL shared DSL (shared/template/dsl.ts) into a browser IIFE exposed
 * as `window.TBDsl`, so the preview renders with the SAME `renderTemplate` the
 * SCORM/web hosts use — nested blocks and in-loop conditionals included — instead
 * of a second, drifting regex DSL. dsl.ts is dependency-free, so the bundle is tiny.
 */
let _dslBundle = null;
function readDslBundle() {
  if (_dslBundle != null) return _dslBundle;
  const dslPath = path.join(root, "shared", "template", "dsl.ts");
  const result = buildSync({
    entryPoints: [dslPath],
    bundle: true,
    format: "iife",
    globalName: "TBDsl",
    platform: "browser",
    target: "es2018",
    write: false,
    logLevel: "silent",
  });
  _dslBundle = result.outputFiles[0].text;
  return _dslBundle;
}

/**
 * Bundles the REAL shared renderer (shared/template/render-screen.ts, which
 * exports renderScreenInto) into a browser IIFE exposed as `window.TBTemplate`,
 * so the runtime content renderers (renderContentPage / renderGalleryPage /
 * renderSectionIntro) that call `window.TBTemplate.renderScreenInto` run in the
 * preview exactly as in production — instead of falling back to the bare skeleton.
 */
let _tbtBundle = null;
function readTbtBundle() {
  if (_tbtBundle != null) return _tbtBundle;
  const p = path.join(root, "shared", "template", "runtime-entry.ts");
  const result = buildSync({
    entryPoints: [p],
    bundle: true,
    format: "iife",
    globalName: "TBTemplate",
    platform: "browser",
    target: "es2018",
    write: false,
    logLevel: "silent",
  });
  _tbtBundle = result.outputFiles[0].text;
  return _tbtBundle;
}

// ─── Preview chrome CSS (builder UI mock + two-panel dialog) ─────────────────

function previewChromeCss() {
  return `
    :root{--pv-bg:#fff;--pv-fg:hsl(0 0% 9%);--pv-border:hsl(0 0% 89%);--pv-card:hsl(0 0% 98%);--pv-card-b:hsl(0 0% 94%);--pv-sidebar:hsl(0 0% 96%);--pv-sidebar-b:hsl(0 0% 92%);--pv-primary:hsl(217 91% 42%);--pv-muted:hsl(217 10% 92%);--pv-muted-fg:hsl(0 0% 35%);--pv-radius:9px;--pv-radius-sm:4px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Inter,system-ui,sans-serif;font-size:14px;background:#e5e7eb;color:var(--pv-fg);line-height:1.5}
    .shell{display:flex;background:var(--pv-bg);min-height:100vh}
    .pv-sidebar{width:224px;flex-shrink:0;background:var(--pv-sidebar);border-right:1px solid var(--pv-sidebar-b);display:flex;flex-direction:column;height:100vh}
    .pv-sidebar-head{padding:16px;border-bottom:1px solid var(--pv-sidebar-b);display:flex;align-items:center;gap:8px}
    .pv-logo{width:28px;height:28px;background:var(--pv-primary);border-radius:5px;display:grid;place-items:center;color:#fff;font-size:11px;font-weight:700}
    .pv-app-name{font-size:13px;font-weight:600}
    .pv-main{flex:1;display:flex;flex-direction:column;min-width:0;filter:blur(1px);opacity:.4}
    .pv-topbar{border-bottom:1px solid var(--pv-border);padding:10px 20px;display:flex;align-items:center;gap:12px}
    .pv-test-title{font-size:15px;font-weight:600;flex:1}
    .pv-overlay{position:absolute;inset:0;background:rgba(0,0,0,.52);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px}
    .pv-dialog{background:var(--pv-bg);border-radius:var(--pv-radius);box-shadow:0 24px 64px rgba(0,0,0,.35);width:100%;max-width:1140px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden}
    .pv-dialog-head{padding:14px 20px;border-bottom:1px solid var(--pv-border);display:flex;align-items:center;gap:12px;flex-shrink:0}
    .pv-dialog-title{font-size:15px;font-weight:600}
    .pv-dialog-sub{font-size:12px;color:var(--pv-muted-fg)}
    .pv-theme{margin-left:auto;display:inline-flex;gap:2px;background:var(--pv-muted);border-radius:6px;padding:2px}
    .pv-theme-btn{border:0;background:transparent;color:var(--pv-fg);font:inherit;font-size:12px;padding:4px 10px;border-radius:4px;cursor:pointer;transition:background .12s}
    .pv-theme-btn:hover:not(.pv-theme-active){background:rgba(0,0,0,.05)}
    .pv-theme-btn.pv-theme-active{background:var(--pv-bg);box-shadow:0 1px 2px rgba(0,0,0,.14);font-weight:600}
    .pv-body{display:flex;flex:1;overflow:hidden;min-height:0}
    .pv-nav{width:220px;flex-shrink:0;border-right:1px solid var(--pv-border);overflow-y:auto;padding:6px 0;background:var(--pv-sidebar)}
    .pv-nav-item{display:block;width:calc(100% - 12px);margin:0 6px 1px;padding:7px 8px;border:0;border-radius:3px;background:transparent;color:var(--pv-fg);text-align:left;font:inherit;font-size:13px;cursor:pointer;transition:background .12s,color .12s}
    .pv-nav-item:hover{background:var(--pv-muted)}
    .pv-nav-item.pv-active{background:var(--pv-primary);color:#fff}
    .pv-stage-wrap{flex:1;overflow-y:auto;background:hsl(0 0% 91%);padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:10px}
    .pv-stage{width:100%;max-width:960px;border-radius:var(--pv-radius-sm);overflow:hidden;box-shadow:0 2px 18px rgba(0,0,0,.14)}
    .pv-caption{font-size:11px;color:hsl(0 0% 55%)}
    .pv-dialog-foot{padding:10px 20px;border-top:1px solid var(--pv-border);display:flex;align-items:center;gap:12px;flex-shrink:0;color:var(--pv-muted-fg);font-size:12px}
    .pv-btn{display:inline-flex;align-items:center;justify-content:center;padding:0 14px;height:32px;border-radius:var(--pv-radius-sm);font-size:12px;font-weight:500;cursor:pointer;border:1px solid var(--pv-border);background:var(--pv-bg);color:var(--pv-fg);font-family:inherit;margin-left:auto}
    @media(max-width:860px){.pv-sidebar{display:none}.pv-overlay{padding:8px}.pv-nav{width:100%;max-height:160px;border-right:0;border-bottom:1px solid var(--pv-border)}.pv-body{flex-direction:column}.pv-stage{max-width:100%}}
  `;
}

// ─── Post-template override CSS ───────────────────────────────────────────────
// Applied after template CSS so these rules win regardless of template resets.

function previewFixesCss() {
  return `
    /* Undo template global resets that break the preview chrome */
    html,body{overflow:auto!important;display:block!important;height:auto!important;min-height:100vh!important;background:#e5e7eb!important}
    /* The runtime marks the scene root with the DS theme classes (.ou plus .ou--dark or
       .ou--light). In a package the html element IS that root; here it also carries the
       preview chrome, so the DS background/color declarations on .ou would repaint the
       builder mock in the template's theme - a dark template left the chrome
       light-on-light. Keep the chrome neutral and give the STAGE the themed ground. */
    html,body{color:var(--pv-fg)!important}
    #pv-stage{background:var(--ou-bg-page);color:var(--ou-fg-default)}
    /* Force top-level player elements to fill the stage container instead of the viewport.
       The template's own aspect-ratio rule (if any) is preserved — only width/max-width are fixed. */
    #pv-stage>*{position:relative!important;width:100%!important;max-width:100%!important;height:auto!important;max-height:none!important}
  `;
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildPreviewHtml(manifest, templateDir) {
  const demoData       = readDemoData(templateDir, manifest);
  const layouts        = readLayouts(templateDir, manifest);
  const dsCss          = readDsCss();
  const templateCss    = readAssetStyles(templateDir, manifest);
  const templateScript = readAssetScripts(templateDir, manifest);
  const prd1Runtime    = readPrd1Runtime();
  const bootstrap      = readBootstrap();

  const routeCount    = ((manifest.preview || {}).routes || []).length;
  const contentCount  = (manifest.contentTemplates || []).length;
  const footerInfo    = `${routeCount} экранов · ${contentCount} шаблонов контента · шаблон «${escAttr(manifest.name)}» v${escAttr(manifest.version)}`;
  const testTitle     = ((demoData.course || {}).title) || manifest.name;

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escAttr(manifest.name)} · preview</title>
  <style>${previewChromeCss()}</style>
  <style id="ds-styles">${dsCss}</style>
  <style id="tpl-styles">${templateCss}</style>
  <style id="pv-fixes">${previewFixesCss()}</style>
</head>
<body>
<div id="s-preview" class="shell" style="position:relative;">
  <div class="pv-sidebar">
    <div class="pv-sidebar-head">
      <div class="pv-logo">TB</div>
      <div class="pv-app-name">Test Builder</div>
    </div>
  </div>
  <div class="pv-main">
    <div class="pv-topbar"><span class="pv-test-title">${escAttr(testTitle)}</span></div>
  </div>

  <div class="pv-overlay">
    <div class="pv-dialog">
      <div class="pv-dialog-head">
        <div class="pv-dialog-title">Шаблон «${escAttr(manifest.name)}» — элементы и их вид</div>
        <div class="pv-dialog-sub">Демо-данные · элементы управления работают</div>
        <div class="pv-theme" id="pv-theme" role="group" aria-label="Тема оформления">
          <button type="button" class="pv-theme-btn pv-theme-active" data-theme-set="auto">Авто</button>
          <button type="button" class="pv-theme-btn" data-theme-set="light">Светлая</button>
          <button type="button" class="pv-theme-btn" data-theme-set="dark">Тёмная</button>
        </div>
      </div>

      <div class="pv-body">
        <nav class="pv-nav" id="pv-nav" aria-label="Навигация по элементам шаблона"></nav>

        <div class="pv-stage-wrap">
          <div class="pv-stage" id="pv-stage"></div>
          <div class="pv-caption" id="pv-caption">${escAttr(manifest.name)}</div>
        </div>
      </div>

      <div class="pv-dialog-foot">
        <span>${footerInfo}</span>
        <button type="button" class="pv-btn">Закрыть</button>
      </div>
    </div>
  </div>
</div>

<script>
  /* ── Manifest and demo data ── */
  window.PRD1_PREVIEW_MANIFEST  = ${jsonInline(manifest)};
  window.PRD1_PREVIEW_DEMO_DATA = ${jsonInline(demoData)};
  window.PRD1_PREVIEW_LAYOUTS   = ${jsonInline(layouts)};

  /* ── Shared helpers expected by contentPage.js ── */
  window.escapeHtml = function(v) {
    return String(v == null ? "" : v)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  };
  window.advancePageSequence = function() {};
</script>

<!-- PRD1 runtime: templateCore, renderers, contentPage -->
<script>${scriptSafe(prd1Runtime)}</script>

<!-- Template-specific script -->
<script>${scriptSafe(templateScript)}</script>

<!-- Shared DSL: the REAL renderer (shared/template/dsl.ts), bundled -->
<script>${readDslBundle()}</script>

<!-- Shared template renderer (renderScreenInto), bundled as window.TBTemplate -->
<script>${readTbtBundle()}</script>

<!-- Preview bootstrap: nav, routing, DSL, question interactions -->
<script>${scriptSafe(bootstrap)}</script>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const templateDirs = discoverTemplateDirs();
console.log(`Found ${templateDirs.length} template(s): ${templateDirs.map((t) => t.id).join(", ")}`);

for (const { id, dir: templateDir } of templateDirs) {
  try {
    const manifest = readJson(path.join(templateDir, "manifest.json"));
    const output   = path.join(templateDir, "preview.html");
    const html     = buildPreviewHtml(manifest, templateDir);
    fs.writeFileSync(output, html, "utf8");
    console.log(`  ✓ ${path.relative(root, output)}`);
  } catch (err) {
    console.error(`  ✗ ${id}: ${err.message}`);
    process.exitCode = 1;
  }
}

if (options.externalIds) {
  const found = new Set(templateDirs.map((t) => t.id));
  const missing = [...options.externalIds].filter((id) => !found.has(id));
  if (missing.length > 0) {
    console.error(`  ✗ not found in ${externalTemplatesDir}: ${missing.join(", ")}`);
    process.exitCode = 1;
  }
}
