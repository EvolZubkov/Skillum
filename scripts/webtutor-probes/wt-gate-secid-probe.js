/**
 * @module scripts/webtutor-probes/wt-gate-secid-probe
 * @description PRD-6 retake gate, 2.60.1 fix — live check in a WebTutor course window.
 *
 * Reproduces the fixed gate path by hand: the SECID is taken from the HTML of the portal
 * windows already loaded around the course (parent chain up to top, then opener), NOT from
 * the portal home page «/»; the learning-records POST is sent at once and the day is read
 * from its `Date` header. Prints where the SECID was found, how long the POST took, the
 * selected last attempt and the verdict for a 30-day cooldown.
 *
 * At the end it times the old path — GET «/» to headers and to body — in the background,
 * so the difference is visible in the same run. It does not block the main result.
 *
 * Usage: open the course in WebTutor, DevTools (F12) → Console, pick the frame of the
 * package (`index.html`) in the context selector, paste the whole file, press Enter.
 */
(async () => {
  const COLLECTION = '/pp/Ext5/extjs_json_collection_data.html';
  const COLLECTION_CODE = 'rostelecom_catalog_data_grid';
  const COOLDOWN_DAYS = 30;
  const SECID_RE = /[A-F0-9]{32}/;
  const now = () => performance.now();

  // Course name: the package title when the context is the package frame.
  let course = '';
  try { course = (typeof TEST_DATA !== 'undefined' && TEST_DATA && TEST_DATA.title) || ''; } catch (e) { course = ''; }
  if (!course) course = prompt('Название курса в LMS:') || '';
  console.log('курс:', course || '(не задан)');

  // 1. SECID from the loaded portal windows — what the fixed gate does.
  const wins = [];
  const add = (w, tag) => { if (w && w !== window && !wins.some((x) => x.w === w)) wins.push({ w, tag }); };
  let w = window;
  for (let i = 0; i < 10; i++) {
    let p = null;
    try { p = w.parent; } catch (e) { p = null; }
    if (!p || p === w) break;
    add(p, 'parent ' + (i + 1));
    w = p;
  }
  try { add(window.top && window.top.opener, 'top.opener'); } catch (e) { /* cross-origin */ }
  try { add(window.opener, 'opener'); } catch (e) { /* cross-origin */ }

  const t0 = now();
  let secid = '';
  let secidFrom = '';
  const scan = [];
  for (const { w: win, tag } of wins) {
    let html = '';
    let path = '';
    try { html = win.document.documentElement.outerHTML || ''; path = win.location.pathname; } catch (e) { scan.push([tag, '(чужой origin)', '-']); continue; }
    const m = SECID_RE.exec(html);
    scan.push([tag, path, m ? 'SECID есть' : 'нет']);
    if (m && !secid) { secid = m[0]; secidFrom = tag + ' ' + path; }
  }
  console.table(scan);
  console.log('SECID:', secid ? 'найден в ' + secidFrom + ' за ' + Math.round(now() - t0) + ' мс' : 'НЕ НАЙДЕН в окнах — гейт пойдёт на «/»');
  if (!secid) return;

  // 2. Records POST — the same contract the gate uses.
  const body = new URLSearchParams({
    secid,
    limit: '500',
    collection_code: COLLECTION_CODE,
    parameters: 'cur_person_id=;sSearchWord=' + course + ';sRoles=all;iCount=;sCatalogName=learning',
    referer_url: location.href,
    page: '1',
    start: '0',
  }).toString();
  const t1 = now();
  const r = await fetch(COLLECTION + '?_dc=' + Date.now(), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
    },
    body,
  });
  const dateHeader = r.headers.get('Date') || '';
  const json = await r.json();
  console.log('POST записей: HTTP', r.status, '| за', Math.round(now() - t1), 'мс | Date:', dateHeader || '(нет)',
    '| записей:', (json.results || []).length, '| total:', json.total);

  // 3. Verdict, as the gate computes it.
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const toIso = (s) => { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(s || '')); return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : null; };
  const mine = (json.results || []).filter((x) => norm(x.name) === norm(course) && ['Пройден', 'Не пройден'].includes(String(x.state)));
  console.table(mine.map((x) => ({ name: x.name, state: x.state, last_usage_date: x.last_usage_date })));
  const last = mine.map((x) => toIso(x.last_usage_date)).filter((d) => d && !d.startsWith('9999')).sort().pop() || null;
  const todayMs = Date.parse(dateHeader) || Date.now();
  const today = new Date(todayMs).toISOString().slice(0, 10);
  if (!last) {
    console.log('%cВЕРДИКТ: допуск (законченных попыток нет) | сегодня', 'font-weight:bold', today);
  } else {
    const days = Math.floor((Date.parse(today) - Date.parse(last)) / 86400000);
    const avail = new Date(Date.parse(last) + COOLDOWN_DAYS * 86400000).toISOString().slice(0, 10);
    console.log('%cВЕРДИКТ: ' + (days >= COOLDOWN_DAYS ? 'допуск' : 'блокировка до ' + avail), 'font-weight:bold',
      '| последняя попытка', last, '| сегодня', today, '(' + (dateHeader ? 'Date ответа' : 'часы машины') + ')',
      '| прошло дней:', days);
  }
  console.log('Итого гейт по новому пути:', Math.round(now() - t0), 'мс');

  // 4. The old path, for comparison: GET «/» to headers and to body. Runs in background.
  const t2 = now();
  console.log('Замер старого пути GET «/» запущен…');
  fetch('/', { credentials: 'include', cache: 'no-store' })
    .then((resp) => {
      console.log('GET «/»: заголовки за', Math.round(now() - t2), 'мс, HTTP', resp.status);
      return resp.text().then((t) => console.log('GET «/»: тело за', Math.round(now() - t2), 'мс,', t.length, 'симв.'));
    })
    .catch((e) => console.log('GET «/» упал:', e && e.message));
})();
