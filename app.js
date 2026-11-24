/* From Waste to Wardrobe – bilingual flipbook (RO / EN)
   Pages are drawn straight from the PDFs with PDF.js, so text stays sharp at every size.
   Book view: StPageFlip page-turn effect. Read view: large pages, zoom, selectable text, search. */
import * as pdfjsLib from './pdf.min.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.js', import.meta.url).href;

const FILES = {
  ro: 'From_Waste_to_Wardrobe_Curriculum_RO.pdf',
  en: 'From_Waste_to_Wardrobe_Curriculum_EN.pdf',
};

const rezultate = n => (n % 100 === 0 || n % 100 >= 20) ? `${n} de rezultate` : `${n} rezultate`;
const T = {
  ro: {
    subtitle: 'Curriculum pentru moda sustenabilă', toc: 'Cuprins', search: 'Caută',
    toRead: 'Citire', toBook: 'Carte', tipRead: 'Mod citire: pagini mari, zoom, text selectabil',
    tipBook: 'Înapoi la carte', download: 'Descarcă PDF (română)', open: 'Deschide într-o filă nouă',
    full: 'Ecran complet', exitFull: 'Ieși din ecran complet', prev: 'Pagina anterioară',
    next: 'Pagina următoare', zoomIn: 'Mărește', zoomOut: 'Micșorează', close: 'Închide',
    pageLabel: 'Pagina', page: 'Pagina', cover: 'Copertă', lang: 'Limba',
    loading: 'Se încarcă cartea…', loadingPct: n => `Se încarcă cartea… ${n}%`,
    searchPh: 'Caută în carte, de ex. „cusătură”', searching: (a, b) => `Se caută… ${a} / ${b}`,
    results: n => n === 0 ? 'Niciun rezultat.' : n === 1 ? 'Un rezultat' : rezultate(n),
    tooMany: 'se afișează primele 200', short: 'Scrieți cel puțin 2 litere.',
    dlRo: 'PDF în limba română', dlEn: 'PDF în limba engleză',
    fund: 'Proiect Erasmus+ 2024-1-RO01-KA210-SCH-000251840 · Finanțat de Uniunea Europeană',
    err: 'Cartea nu a putut fi încărcată.', errFile: 'Cartea trebuie deschisă de pe un server web (de exemplu GitHub Pages), nu direct din fișier.',
    errLink: 'Descărcați PDF-ul', book: 'Carte', read: 'Citire',
  },
  en: {
    subtitle: 'A curriculum on sustainable fashion', toc: 'Contents', search: 'Search',
    toRead: 'Read', toBook: 'Book', tipRead: 'Reading mode: large pages, zoom, selectable text',
    tipBook: 'Back to the book', download: 'Download PDF (English)', open: 'Open in a new tab',
    full: 'Full screen', exitFull: 'Exit full screen', prev: 'Previous page',
    next: 'Next page', zoomIn: 'Zoom in', zoomOut: 'Zoom out', close: 'Close',
    pageLabel: 'Page', page: 'Page', cover: 'Cover', lang: 'Language',
    loading: 'Loading the book…', loadingPct: n => `Loading the book… ${n}%`,
    searchPh: 'Search the book, e.g. “stitch”', searching: (a, b) => `Searching… ${a} / ${b}`,
    results: n => n === 0 ? 'No results.' : n === 1 ? '1 result' : `${n} results`,
    tooMany: 'showing the first 200', short: 'Type at least 2 letters.',
    dlRo: 'PDF in Romanian', dlEn: 'PDF in English',
    fund: 'Erasmus+ project 2024-1-RO01-KA210-SCH-000251840 · Funded by the European Union',
    err: 'The book could not be loaded.', errFile: 'Open the book from a web server (for example GitHub Pages), not directly from the file.',
    errLink: 'Download the PDF', book: 'Book', read: 'Read',
  },
};

/* Small labels above the main chapters in the contents panel (matched by outline order). */
const KICK = {
  ro: ['Introducere', 'Introducere', 'Introducere', 'Partea I', 'Componentă transversală',
    ...Array.from({ length: 10 }, (_, i) => `Modulul ${i + 1}`),
    'Partea a II-a', 'Partea a III-a', 'Partea a IV-a', 'Partea a V-a', 'Extindere',
    ...Array.from({ length: 5 }, (_, i) => `Resursa R${i + 1}`)],
  en: ['Introduction', 'Introduction', 'Introduction', 'Part I', 'Cross-cutting strand',
    ...Array.from({ length: 10 }, (_, i) => `Module ${i + 1}`),
    'Part II', 'Part III', 'Part IV', 'Part V', 'Extension',
    ...Array.from({ length: 5 }, (_, i) => `Resource R${i + 1}`)],
};

const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dpr = () => clamp(window.devicePixelRatio || 1, 1, 3);
const narrow = () => window.innerWidth < 900;

const S = { lang: 'ro', mode: 'book', page: 1, zoomIdx: 0, query: '' };
const docs = {};
let doc = null;

/* ───────────── text folding for search (keeps string length, ignores diacritics) ───────────── */
const foldCache = new Map();
function fold(ch) {
  let r = foldCache.get(ch);
  if (r === undefined) {
    const lo = ch.toLowerCase();
    const d = lo.normalize('NFD').replace(/[̀-ͯ]/g, '');
    r = d.length === 1 ? d : (lo.length === 1 ? lo : ch);
    if (r === 'ı') r = 'i';
    foldCache.set(ch, r);
  }
  return r;
}
function norm(str) { let o = ''; for (let i = 0; i < str.length; i++) o += fold(str[i]); return o; }

/* ───────────── loading the PDFs ───────────── */
async function resolveDest(pdf, dest) {
  try {
    if (typeof dest === 'string') dest = await pdf.getDestination(dest);
    if (!Array.isArray(dest)) return null;
    const ref = dest[0];
    if (ref && typeof ref === 'object') return (await pdf.getPageIndex(ref)) + 1;
    if (Number.isInteger(ref)) return ref + 1;
  } catch (e) { /* ignore broken destinations */ }
  return null;
}

async function loadDoc(lang) {
  if (docs[lang]) return docs[lang];
  showLoader(T[lang].loading, 0);
  const task = pdfjsLib.getDocument({ url: FILES[lang], isEvalSupported: false, enableXfa: false });
  let opened = false;
  task.onProgress = ({ loaded, total }) => {
    if (opened || !total) return; // pdf.js keeps fetching ranges in the background after the book is shown
    const f = Math.min(1, loaded / total);
    showLoader(T[lang].loadingPct(Math.round(f * 100)), f);
  };
  const pdf = await task.promise;
  opened = true;
  const first = await pdf.getPage(1);
  const vp = first.getViewport({ scale: 1 });
  const rec = { lang, pdf, n: pdf.numPages, w: vp.width, h: vp.height, tree: [], flat: [], links: new Map(), text: null };
  const outline = (await pdf.getOutline()) || [];
  const walk = (items, level, out) => {
    for (const it of items) {
      const node = { title: (it.title || '').trim(), level, dest: it.dest, page: null, children: [] };
      rec.flat.push(node); out.push(node);
      if (it.items && it.items.length) walk(it.items, level + 1, node.children);
    }
  };
  walk(outline, 0, rec.tree);
  await Promise.all(rec.flat.map(async nd => { nd.page = await resolveDest(pdf, nd.dest); }));
  docs[lang] = rec;
  return rec;
}

/* Same place in the other language: follow the matching outline entry (both PDFs share one structure). */
function mapPage(a, b, p) {
  if (a === b) return p;
  if (p >= a.n) return b.n;
  const A = a.flat, B = b.flat;
  if (A.length && A.length === B.length) {
    let idx = -1;
    for (let i = 0; i < A.length; i++) if (A[i].page != null && A[i].page <= p) idx = i;
    if (idx >= 0 && B[idx].page != null) {
      let t = B[idx].page + (p - A[idx].page);
      const nxt = B.slice(idx + 1).find(x => x.page != null && x.page > B[idx].page);
      if (nxt) t = Math.min(t, nxt.page);
      else t = Math.min(t, b.n - 1);
      return clamp(t, 1, b.n);
    }
  }
  return clamp(Math.round((p - 1) * (b.n - 1) / Math.max(1, a.n - 1)) + 1, 1, b.n);
}

async function getLinks(rec, p) {
  if (rec.links.has(p)) return rec.links.get(p);
  const page = await rec.pdf.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const anns = await page.getAnnotations({ intent: 'display' });
  const out = [];
  for (const a of anns) {
    if (a.subtype !== 'Link' || !a.rect) continue;
    const [x1, y1, x2, y2] = vp.convertToViewportRectangle(a.rect);
    const r = { l: Math.min(x1, x2) / vp.width * 100, t: Math.min(y1, y2) / vp.height * 100,
      w: Math.abs(x2 - x1) / vp.width * 100, h: Math.abs(y2 - y1) / vp.height * 100 };
    if (a.url && /^(https?:|mailto:)/i.test(a.url)) out.push({ ...r, url: a.url });
    else if (a.dest) { const tp = await resolveDest(rec.pdf, a.dest); if (tp) out.push({ ...r, page: tp }); }
  }
  rec.links.set(p, out);
  return out;
}

function makeLinks(list) {
  const box = document.createElement('div');
  box.className = 'links';
  for (const L of list) {
    const a = document.createElement('a');
    Object.assign(a.style, { left: L.l + '%', top: L.t + '%', width: L.w + '%', height: L.h + '%' });
    if (L.url) {
      a.href = L.url; a.title = L.url;
      if (!L.url.startsWith('mailto:')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      a.setAttribute('aria-label', L.url);
    } else {
      a.href = '#'; a.dataset.goto = L.page;
      a.setAttribute('aria-label', `${T[S.lang].page} ${L.page}`);
    }
    box.appendChild(a);
  }
  return box;
}

/* ───────────── rendering helpers ───────────── */
const imgCache = new Map(); // key -> object URL
function cacheGet(key) { const u = imgCache.get(key); if (u) { imgCache.delete(key); imgCache.set(key, u); } return u; }
function cachePut(key, url) {
  imgCache.set(key, url);
  if (imgCache.size > 36) {
    const shown = new Set([...document.querySelectorAll('.page img')].map(i => i.dataset.key));
    for (const k of imgCache.keys()) {
      if (imgCache.size <= 30) break;
      if (!shown.has(k)) { URL.revokeObjectURL(imgCache.get(k)); imgCache.delete(k); }
    }
  }
}

async function rasterize(rec, p, pxW) {
  const page = await rec.pdf.getPage(p);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: pxW / vp1.width });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  c.width = c.height = 0;
  return URL.createObjectURL(blob);
}

function makeQueue() {
  let jobs = [], busy = false;
  const pump = async () => {
    busy = true;
    while (jobs.length) { const j = jobs.shift(); try { await j(); } catch (e) { console.warn(e); } }
    busy = false;
  };
  return { set(list) { jobs = list.slice(); if (!busy) pump(); } };
}
const bookQueue = makeQueue();

/* ───────────── book view ───────────── */
const Book = { flip: null, el: null, pages: [], map: [], pw: 0, ph: 0, landscape: true, lang: null, target: null };

function bookDims() {
  const v = $('#bookView'); const cs = getComputedStyle(v);
  const W = v.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const H = v.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 18;
  const r = doc.w / doc.h;
  let pw = H * r, landscape;
  if (W >= 2 * pw) landscape = true;
  else if (W / 2 >= 250 && W > H * 0.95) { landscape = true; pw = W / 2; }
  else { landscape = false; pw = Math.min(pw, W); }
  pw = Math.max(120, Math.floor(pw));
  return { pw, ph: Math.floor(pw / r), landscape };
}

function destroyBook() {
  if (Book.flip) { try { Book.flip.destroy(); } catch (e) { /* already gone */ } }
  Book.flip = null; Book.pages = []; $('#bookHolder').textContent = '';
}

function buildBook(p) {
  destroyBook();
  const d = bookDims();
  Object.assign(Book, { pw: d.pw, ph: d.ph, landscape: d.landscape, lang: S.lang });
  const map = []; for (let i = 1; i <= doc.n; i++) map.push(i);
  if (map.length % 2 === 1) map.splice(map.length - 1, 0, null); // blank inside back cover
  Book.map = map;

  const el = document.createElement('div');
  el.className = 'book';
  el.style.width = (d.landscape ? 2 * d.pw : d.pw) + 'px';
  el.style.height = d.ph + 'px';
  $('#bookHolder').appendChild(el);

  Book.pages = map.map((pg, i) => {
    const div = document.createElement('div');
    div.className = 'page' + (pg ? '' : ' blank');
    div.dataset.idx = i;
    if (pg) {
      const img = new Image(); img.alt = ''; img.draggable = false; img.decoding = 'async';
      div.appendChild(img);
    }
    return div;
  });

  const start = Math.max(0, map.indexOf(p));
  Book.target = p;
  const flip = new St.PageFlip(el, {
    width: d.pw, height: d.ph, size: 'fixed', showCover: true, usePortrait: true, autoSize: false,
    maxShadowOpacity: 0.45, flippingTime: 650, startPage: start, mobileScrollSupport: true,
    clickEventForward: true, swipeDistance: 30, showPageCorners: true, drawShadow: true,
  });
  Book.flip = flip; Book.el = el;
  flip.on('flip', e => onBookFlip(e.data));
  flip.on('changeOrientation', () => onBookFlip(flip.getCurrentPageIndex()));
  flip.loadFromHTML(Book.pages);
  onBookFlip(flip.getCurrentPageIndex());
}

function visibleIdx(idx) {
  const N = Book.map.length;
  if (!Book.flip || Book.flip.getOrientation() === 'portrait') return [idx];
  if (idx === 0) return [0];
  const left = idx % 2 === 1 ? idx : idx - 1;
  return [left, left + 1].filter(i => i < N);
}

function onBookFlip(idx) {
  if (!Book.flip) return;
  const vis = visibleIdx(idx);
  const real = vis.map(i => Book.map[i]).filter(Boolean);
  if (Book.target && real.includes(Book.target)) { S.page = Book.target; Book.target = null; }
  else if (!real.includes(S.page)) S.page = real[0] || Book.map[vis[0] + 1] || S.page;
  const land = Book.flip.getOrientation() !== 'portrait';
  const N = Book.map.length;

  // spine shading + centring when only one cover is showing
  Book.pages.forEach(pg => pg.classList.remove('side-l', 'side-r'));
  let shift = 0;
  if (land && vis.length === 2) { Book.pages[vis[0]].classList.add('side-l'); Book.pages[vis[1]].classList.add('side-r'); }
  if (land && vis.length === 1) shift = vis[0] === 0 ? -Book.pw / 2 : Book.pw / 2;
  Book.el.style.transition = 'transform .45s ease';
  Book.el.style.transform = shift ? `translateX(${shift}px)` : '';
  Book.el.style.setProperty('--shadow-l', land && vis.length === 1 && vis[0] === 0 ? '50%' : '0');
  Book.el.style.setProperty('--shadow-r', land && vis.length === 1 && vis[0] !== 0 ? '50%' : '0');

  const second = real.length === 2 ? real[1] : null;
  updatePageUI(real[0] || S.page, second);
  $('#btnPrev').disabled = vis[0] <= 0;
  $('#btnNext').disabled = vis[vis.length - 1] >= N - 1;

  // render: what is visible first, then the next spread, then the previous one
  const lo = Math.min(...vis), hi = Math.max(...vis);
  const order = [...vis];
  for (const k of [1, 2, 3, 4, -1, -2, 5, 6, -3, -4]) {
    const i = k > 0 ? hi + k : lo + k;
    if (i >= 0 && i < N && !order.includes(i)) order.push(i);
  }
  const lang = S.lang, pages = Book.pages;
  bookQueue.set(order.map(i => () => renderBookPage(i, lang, pages)));
  // free far pages
  pages.forEach((pg, i) => {
    if (i < lo - 7 || i > hi + 8) { const img = pg.querySelector('img'); if (img && img.dataset.key) { img.removeAttribute('src'); img.classList.remove('on'); delete img.dataset.key; } }
  });
}

async function renderBookPage(i, lang, pages) {
  if (pages !== Book.pages || lang !== S.lang) return;
  const p = Book.map[i]; if (!p) return;
  const div = pages[i]; const img = div.querySelector('img');
  let pxW = Math.round(Book.pw * dpr());
  const maxW = Math.floor(Math.sqrt(14e6 * doc.w / doc.h)); pxW = Math.min(pxW, maxW);
  const key = `${lang}:${p}:${pxW}`;
  if (img.dataset.key === key) return;
  let url = cacheGet(key);
  if (!url) {
    // show any earlier rendering of this page (other size) while the sharp one is drawn
    const prefix = `${lang}:${p}:`;
    if (!img.dataset.key) for (const [k, u] of imgCache) if (k.startsWith(prefix)) { img.src = u; img.classList.add('on'); break; }
    url = await rasterize(doc, p, pxW); cachePut(key, url);
  }
  if (pages !== Book.pages) return;
  img.onload = () => img.classList.add('on');
  img.src = url; img.dataset.key = key;
  if (!div.querySelector('.links')) div.appendChild(makeLinks(await getLinks(doc, p)));
}

/* ───────────── read view ───────────── */
const Read = { els: [], io: null, base: 0, want: new Set(), tasks: new Map(), lang: null, built: false };
const readPending = new Set(); let readBusy = false;
const PAD_T = 22, GAP = 18;

function readBase() { return Math.max(200, Math.min($('#readView').clientWidth - 32, 980)); }
function readGeom() { const w = Math.floor(Read.base * ZOOMS[S.zoomIdx]); return { w, h: Math.floor(w * doc.h / doc.w) }; }

function teardownRead() {
  if (Read.io) Read.io.disconnect();
  for (const t of Read.tasks.values()) t.cancel();
  Read.tasks.clear(); Read.want.clear(); readPending.clear();
  Read.els.forEach(clearReadEl);
  Read.els = []; $('#pages').textContent = ''; Read.built = false;
}

function buildRead() {
  teardownRead();
  Read.base = readBase(); Read.lang = S.lang;
  const { w, h } = readGeom();
  const box = $('#pages'); const frag = document.createDocumentFragment();
  for (let p = 1; p <= doc.n; p++) {
    const d = document.createElement('div');
    d.className = 'rpage'; d.dataset.page = p;
    d.style.width = w + 'px'; d.style.height = h + 'px';
    const num = document.createElement('span'); num.className = 'num'; num.textContent = p;
    d.appendChild(num); frag.appendChild(d); Read.els.push(d);
  }
  box.appendChild(frag);
  Read.io = new IntersectionObserver(onReadIO, { root: $('#readView'), rootMargin: '120% 0px' });
  Read.els.forEach(e => Read.io.observe(e));
  Read.built = true;
}

function onReadIO(entries) {
  for (const en of entries) {
    const p = +en.target.dataset.page;
    if (en.isIntersecting) { Read.want.add(p); readAdd(p); }
    else { Read.want.delete(p); releaseRead(p); }
  }
}
function readAdd(p) { readPending.add(p); if (!readBusy) readPump(); }
async function readPump() {
  readBusy = true;
  while (readPending.size) {
    let best = null, bd = Infinity;
    for (const p of readPending) { const d = Math.abs(p - S.page); if (d < bd) { bd = d; best = p; } }
    readPending.delete(best);
    if (Read.want.has(best)) { try { await renderRead(best); } catch (e) { if (e && e.name !== 'RenderingCancelledException') console.warn(e); } }
  }
  readBusy = false;
}

function clearReadEl(el) {
  el.querySelectorAll('canvas').forEach(c => { c.width = c.height = 0; c.remove(); });
  el.querySelectorAll('.textLayer,.links').forEach(x => x.remove());
  delete el.dataset.key;
}
function releaseRead(p) { const t = Read.tasks.get(p); if (t) t.cancel(); const el = Read.els[p - 1]; if (el) clearReadEl(el); }

async function renderRead(p) {
  const el = Read.els[p - 1]; if (!el) return;
  const key = `${S.lang}:${S.zoomIdx}:${Read.base}`;
  if (el.dataset.key === key) return;
  const rec = doc, els = Read.els;
  const page = await rec.pdf.getPage(p);
  const vp1 = page.getViewport({ scale: 1 });
  const cssScale = parseFloat(el.style.width) / vp1.width;
  const vp = page.getViewport({ scale: cssScale });
  let pr = dpr();
  const MAXPX = 14e6;
  if (vp.width * vp.height * pr * pr > MAXPX) pr = Math.sqrt(MAXPX / (vp.width * vp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width * pr); canvas.height = Math.floor(vp.height * pr);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvasContext: ctx, viewport: vp, transform: pr !== 1 ? [pr, 0, 0, pr, 0, 0] : null });
  Read.tasks.set(p, task);
  try { await task.promise; } finally { Read.tasks.delete(p); }
  if (els !== Read.els || !Read.want.has(p) || rec !== doc) { canvas.width = canvas.height = 0; return; }
  clearReadEl(el);
  el.appendChild(canvas);
  el.style.setProperty('--scale-factor', cssScale);
  const tl = document.createElement('div'); tl.className = 'textLayer';
  el.appendChild(tl);
  try {
    const layer = new pdfjsLib.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: vp });
    await layer.render();
    highlightIn(tl);
  } catch (e) { console.warn('text layer', e); }
  el.appendChild(makeLinks(await getLinks(rec, p)));
  el.dataset.key = key;
}

function pageFromScroll() {
  const v = $('#readView'); const { h } = readGeom();
  return clamp(Math.floor((v.scrollTop + v.clientHeight * 0.35 - PAD_T) / (h + GAP)) + 1, 1, doc.n);
}
function scrollReadTo(p, flash) {
  const v = $('#readView'); const { h } = readGeom();
  v.scrollTop = PAD_T + (p - 1) * (h + GAP) - 8;
  v.scrollLeft = (v.scrollWidth - v.clientWidth) / 2;
  S.page = p; updatePageUI(p, null);
  if (flash) { const el = Read.els[p - 1]; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}

function applyReadSize() {
  const { w, h } = readGeom();
  for (const el of Read.els) { el.style.width = w + 'px'; el.style.height = h + 'px'; }
}

function setZoom(i) {
  i = clamp(i, 0, ZOOMS.length - 1);
  if (i === S.zoomIdx || S.mode !== 'read') return;
  const v = $('#readView'); const old = readGeom();
  const pos = (v.scrollTop + v.clientHeight * 0.35 - PAD_T) / (old.h + GAP);
  const fx = (v.scrollLeft + v.clientWidth / 2) / Math.max(1, v.scrollWidth);
  S.zoomIdx = i; applyReadSize();
  const g = readGeom();
  v.scrollTop = PAD_T + pos * (g.h + GAP) - v.clientHeight * 0.35;
  v.scrollLeft = fx * v.scrollWidth - v.clientWidth / 2;
  for (const p of Read.want) readAdd(p);
  updateZoomUI();
}
function updateZoomUI() {
  $('#zoomLevel').textContent = Math.round(ZOOMS[S.zoomIdx] * 100) + '%';
  $('#btnZoomOut').disabled = S.zoomIdx === 0;
  $('#btnZoomIn').disabled = S.zoomIdx === ZOOMS.length - 1;
}

/* ───────────── search ───────────── */
let searchSeq = 0;
async function ensureText(rec, onProg) {
  if (rec.text) return rec.text;
  const arr = new Array(rec.n);
  for (let p = 1; p <= rec.n; p++) {
    const tc = await (await rec.pdf.getPage(p)).getTextContent();
    let s = '';
    for (const it of tc.items) if ('str' in it) { s += it.str; if (it.hasEOL) s += ' '; }
    arr[p - 1] = s.replace(/\s+/g, ' ');
    if (onProg && p % 5 === 0) onProg(p, rec.n);
  }
  rec.text = arr;
  return arr;
}

async function runSearch(raw) {
  const seq = ++searchSeq;
  const L = T[S.lang];
  const q = norm(raw.trim());
  const st = $('#searchStatus'), ul = $('#searchResults');
  ul.textContent = '';
  S.query = q.length >= 2 ? q : '';
  if (q.length < 2) { st.textContent = raw.trim() ? L.short : ''; refreshHighlights(); return; }
  const rec = doc;
  const text = await ensureText(rec, (a, b) => { if (seq === searchSeq) st.textContent = L.searching(a, b); });
  if (seq !== searchSeq || rec !== doc) return;
  const res = [];
  for (let p = 1; p <= rec.n && res.length < 200; p++) {
    const s = text[p - 1], ns = norm(s);
    let from = 0, i;
    while ((i = ns.indexOf(q, from)) !== -1 && res.length < 200) { res.push({ p, i, s }); from = i + q.length; }
  }
  st.textContent = L.results(res.length) + (res.length >= 200 ? ` · ${L.tooMany}` : '');
  const frag = document.createDocumentFragment();
  for (const r of res) {
    const a = Math.max(0, r.i - 55), b = Math.min(r.s.length, r.i + q.length + 75);
    const li = document.createElement('li'); const btn = document.createElement('button'); btn.type = 'button';
    const pp = document.createElement('span'); pp.className = 'rp'; pp.textContent = `${L.page} ${r.p}`;
    const sn = document.createElement('span'); sn.className = 'rs';
    const bold = document.createElement('b'); bold.textContent = r.s.slice(r.i, r.i + q.length);
    sn.append((a > 0 ? '…' : '') + r.s.slice(a, r.i), bold, r.s.slice(r.i + q.length, b) + (b < r.s.length ? '…' : ''));
    btn.append(pp, sn);
    btn.addEventListener('click', () => openResult(r.p));
    li.appendChild(btn); frag.appendChild(li);
  }
  ul.appendChild(frag);
  refreshHighlights();
}

function highlightIn(tl) {
  const q = S.query;
  tl.querySelectorAll('span').forEach(sp => {
    if (sp.classList.contains('markedContent') || sp.querySelector('span')) return;
    const orig = sp.dataset.o !== undefined ? sp.dataset.o : sp.textContent;
    if (!q) { if (sp.dataset.o !== undefined) sp.textContent = orig; return; }
    const n = norm(orig); let i = n.indexOf(q);
    if (i === -1) { if (sp.dataset.o !== undefined) sp.textContent = orig; return; }
    sp.dataset.o = orig; sp.textContent = '';
    let from = 0;
    while (i !== -1) {
      if (i > from) sp.append(orig.slice(from, i));
      const m = document.createElement('mark'); m.textContent = orig.slice(i, i + q.length); sp.append(m);
      from = i + q.length; i = n.indexOf(q, from);
    }
    if (from < orig.length) sp.append(orig.slice(from));
  });
}
function refreshHighlights() { document.querySelectorAll('#pages .textLayer').forEach(highlightIn); }

async function openResult(p) {
  if (narrow()) closePanels();
  await setMode('read');
  scrollReadTo(p, true);
}

/* ───────────── contents panel ───────────── */
function buildToc() {
  const ol = $('#tocList'); ol.textContent = '';
  const kick = doc.tree.length === KICK[S.lang].length ? KICK[S.lang] : null;
  ol.appendChild(tocItem({ title: T[S.lang].cover, page: 1, level: 0, children: [] }, null));
  doc.tree.forEach((nd, i) => ol.appendChild(tocItem(nd, kick ? kick[i] : null)));
  markToc();
}
function tocItem(nd, kicker) {
  const li = document.createElement('li'); li.className = 'lvl' + nd.level; li.dataset.page = nd.page || '';
  const row = document.createElement('div'); row.className = 'row';
  const go = document.createElement('button'); go.type = 'button'; go.className = 'go';
  const t = document.createElement('span'); t.className = 't';
  if (kicker) { const k = document.createElement('span'); k.className = 'k'; k.textContent = kicker; t.appendChild(k); }
  t.append(nd.title);
  const pg = document.createElement('span'); pg.className = 'p'; pg.textContent = nd.page || '';
  go.append(t, pg);
  go.addEventListener('click', () => { if (nd.page) { goTo(nd.page); if (narrow()) closePanels(); } });
  row.appendChild(go); li.appendChild(row);
  const kids = nd.level === 0 ? (nd.children || []).filter(c => c.page) : [];
  if (kids.length) {
    const tog = document.createElement('button'); tog.type = 'button'; tog.className = 'tog';
    tog.setAttribute('aria-expanded', 'false'); tog.setAttribute('aria-label', nd.title);
    tog.innerHTML = '<svg><use href="#i-chev"/></svg>';
    const sub = document.createElement('ol'); sub.hidden = true;
    kids.forEach(c => sub.appendChild(tocItem(c, null)));
    tog.addEventListener('click', () => { const open = sub.hidden; sub.hidden = !open; li.classList.toggle('open', open); tog.setAttribute('aria-expanded', String(open)); });
    row.appendChild(tog); li.appendChild(sub);
  }
  return li;
}
function markToc() {
  const items = [...document.querySelectorAll('#tocList > li')];
  let cur = null;
  for (const li of items) { const p = +li.dataset.page; if (p && p <= S.page) cur = li; }
  items.forEach(li => li.classList.toggle('cur', li === cur));
}

/* ───────────── panels ───────────── */
function openPanel(id) {
  const panel = $(id); const wasOpen = !panel.hidden;
  closePanels();
  if (wasOpen) return;
  panel.hidden = false; $('#scrim').hidden = false;
  $(id === '#tocPanel' ? '#btnToc' : '#btnSearch').setAttribute('aria-expanded', 'true');
  if (id === '#searchPanel') setTimeout(() => $('#searchInput').focus(), 30);
  else { const cur = panel.querySelector('.cur .go'); if (cur) cur.scrollIntoView({ block: 'center' }); }
}
function closePanels() {
  ['#tocPanel', '#searchPanel'].forEach(s => { $(s).hidden = true; });
  $('#scrim').hidden = true;
  $('#btnToc').setAttribute('aria-expanded', 'false'); $('#btnSearch').setAttribute('aria-expanded', 'false');
}

/* ───────────── shared UI ───────────── */
function updatePageUI(p, second) {
  const inp = $('#pageInput');
  if (document.activeElement !== inp) inp.value = p;
  $('#pageSpread').textContent = second ? `–${second}` : '';
  $('#pageTotal').textContent = doc.n;
  if (S.mode === 'read') { $('#btnPrev').disabled = p <= 1; $('#btnNext').disabled = p >= doc.n; }
  updateHash(); markToc();
}

function updateHash() {
  const h = `#${S.lang}-${S.page}${S.mode === 'read' ? '-read' : ''}`;
  if (location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) { /* sandboxed */ } }
  const open = $('#btnOpen'); if (!open.hidden) open.href = location.href.split('#')[0] + h;
}

function applyStrings() {
  const L = T[S.lang];
  document.documentElement.lang = S.lang;
  $('#subtitle').textContent = L.subtitle;
  document.querySelectorAll('[data-t]').forEach(el => { const v = L[el.dataset.t]; if (typeof v === 'string') el.textContent = v; });
  const lab = { btnToc: L.toc, btnSearch: L.search, btnDownload: L.download, btnOpen: L.open, btnPrev: L.prev, btnNext: L.next, btnZoomIn: L.zoomIn, btnZoomOut: L.zoomOut };
  for (const [id, txt] of Object.entries(lab)) { const el = document.getElementById(id); el.title = txt; el.setAttribute('aria-label', txt); }
  document.querySelectorAll('[data-close]').forEach(b => { b.title = L.close; b.setAttribute('aria-label', L.close); });
  document.querySelector('.lang').setAttribute('aria-label', L.lang);
  document.querySelectorAll('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === S.lang)));
  $('#btnDownload').href = FILES[S.lang];
  $('#searchInput').placeholder = L.searchPh;
  $('#searchInput').setAttribute('aria-label', L.search);
  $('#bookView').setAttribute('aria-label', L.book); $('#readView').setAttribute('aria-label', L.read);
  updateModeBtn(); updateFullBtn();
}
function updateModeBtn() {
  const L = T[S.lang]; const b = $('#btnMode'); const toRead = S.mode === 'book';
  b.querySelector('use').setAttribute('href', toRead ? '#i-read' : '#i-book');
  b.querySelector('.lbl').textContent = toRead ? L.toRead : L.toBook;
  b.title = toRead ? L.tipRead : L.tipBook; b.setAttribute('aria-label', b.title);
}
function updateFullBtn() {
  const b = $('#btnFull'); if (b.hidden) return;
  const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  b.querySelector('use').setAttribute('href', on ? '#i-exit' : '#i-full');
  const t = on ? T[S.lang].exitFull : T[S.lang].full; b.title = t; b.setAttribute('aria-label', t);
}

function showLoader(text, frac) {
  const l = $('#loader'); l.classList.remove('done');
  $('#loaderText').textContent = text;
  $('#loaderFill').style.width = Math.round((frac || 0) * 100) + '%';
}
function hideLoader() { $('#loader').classList.add('done'); }

function showError(e) {
  console.error(e);
  const L = T[S.lang]; const box = $('#error'); box.textContent = '';
  const inner = document.createElement('div');
  const p1 = document.createElement('p'); p1.textContent = location.protocol === 'file:' ? L.errFile : L.err;
  const p2 = document.createElement('p');
  for (const lg of ['ro', 'en']) {
    const a = document.createElement('a'); a.href = FILES[lg]; a.textContent = `${L.errLink} (${lg.toUpperCase()})`;
    p2.append(a, ' ');
  }
  inner.append(p1, p2); box.appendChild(inner); box.hidden = false; hideLoader();
}

/* ───────────── navigation ───────────── */
function goTo(p, opts = {}) {
  p = clamp(Math.round(p) || 1, 1, doc.n);
  if (S.mode === 'book' && Book.flip) {
    const idx = Book.map.indexOf(p); if (idx < 0) return;
    const cur = Book.flip.getCurrentPageIndex();
    if (visibleIdx(cur).includes(idx)) { Book.target = p; onBookFlip(cur); return; }
    Book.target = p;
    if (!opts.instant && Math.abs(idx - cur) <= 2) Book.flip.flip(idx);
    else { Book.flip.turnToPage(idx); onBookFlip(Book.flip.getCurrentPageIndex()); }
  } else if (S.mode === 'read') scrollReadTo(p, opts.flash);
}
function step(dir) {
  Book.target = null;
  if (S.mode === 'book' && Book.flip) { dir > 0 ? Book.flip.flipNext() : Book.flip.flipPrev(); }
  else goTo(S.page + dir);
}

async function setMode(m) {
  if (S.mode === m) return;
  S.mode = m;
  $('#bookView').hidden = m !== 'book';
  $('#readView').hidden = m !== 'read';
  $('#zoomBox').hidden = m !== 'read';
  if (m === 'read') {
    destroyBook();
    if (!Read.built || Read.lang !== S.lang || Read.base !== readBase()) buildRead();
    await new Promise(r => requestAnimationFrame(r));
    scrollReadTo(S.page);
    updateZoomUI();
  } else {
    teardownRead();
    buildBook(S.page);
  }
  updateModeBtn(); updateHash();
}

async function setLang(l) {
  if (l === S.lang || !FILES[l]) return;
  const from = doc, p = S.page;
  let to;
  try { to = docs[l] || await loadDoc(l); } catch (e) { showError(e); return; }
  hideLoader();
  S.lang = l; doc = to;
  S.page = mapPage(from, to, p);
  applyStrings(); buildToc();
  if (S.mode === 'book') buildBook(S.page);
  else { buildRead(); await new Promise(r => requestAnimationFrame(r)); scrollReadTo(S.page); }
  const q = $('#searchInput').value;
  if (q.trim()) runSearch(q); else { $('#searchResults').textContent = ''; $('#searchStatus').textContent = ''; }
}

/* ───────────── events ───────────── */
function bindEvents() {
  document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  $('#btnToc').addEventListener('click', () => openPanel('#tocPanel'));
  $('#btnSearch').addEventListener('click', () => openPanel('#searchPanel'));
  $('#btnMode').addEventListener('click', () => setMode(S.mode === 'book' ? 'read' : 'book'));
  $('#btnPrev').addEventListener('click', () => step(-1));
  $('#btnNext').addEventListener('click', () => step(1));
  $('#btnZoomIn').addEventListener('click', () => setZoom(S.zoomIdx + 1));
  $('#btnZoomOut').addEventListener('click', () => setZoom(S.zoomIdx - 1));
  $('#scrim').addEventListener('click', closePanels);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closePanels));

  const inp = $('#pageInput');
  inp.addEventListener('focus', () => inp.select());
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { goTo(parseInt(inp.value, 10), { instant: true }); inp.blur(); } });
  inp.addEventListener('blur', () => { inp.value = S.page; });

  let st; $('#searchInput').addEventListener('input', e => { clearTimeout(st); st = setTimeout(() => runSearch(e.target.value), 250); });
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); clearTimeout(st); runSearch($('#searchInput').value); });

  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[data-goto]');
    if (a) { e.preventDefault(); goTo(+a.dataset.goto, { flash: true }); }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePanels(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.altKey || e.metaKey || e.ctrlKey) return;
    if (!$('#tocPanel').hidden || !$('#searchPanel').hidden) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if ((e.key === '+' || e.key === '=') && S.mode === 'read') setZoom(S.zoomIdx + 1);
    else if (e.key === '-' && S.mode === 'read') setZoom(S.zoomIdx - 1);
  });

  // trackpad pinch / ctrl+wheel zoom in reading mode
  let wheelLock = 0;
  $('#readView').addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const now = Date.now(); if (now - wheelLock < 180) return; wheelLock = now;
    setZoom(S.zoomIdx + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  let ticking = false;
  $('#readView').addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { ticking = false; if (S.mode === 'read' && Read.built) { const p = pageFromScroll(); if (p !== S.page) { S.page = p; updatePageUI(p, null); } } });
  }, { passive: true });

  let rt;
  const onResize = () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (!doc) return;
      if (S.mode === 'book') {
        const d = bookDims();
        if (Math.abs(d.pw - Book.pw) > 2 || d.landscape !== Book.landscape) buildBook(S.page);
      } else if (Read.built && Math.abs(readBase() - Read.base) > 2) {
        const p = S.page; buildRead(); requestAnimationFrame(() => scrollReadTo(p));
      }
    }, 180);
  };
  window.addEventListener('resize', onResize);
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe($('#stage'));

  const fsOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (fsOk) {
    $('#btnFull').hidden = false;
    $('#btnFull').addEventListener('click', async () => {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else { const r = document.documentElement; await (r.requestFullscreen || r.webkitRequestFullscreen).call(r); }
      } catch (e) { /* refused */ }
    });
    document.addEventListener('fullscreenchange', updateFullBtn);
    document.addEventListener('webkitfullscreenchange', updateFullBtn);
  }

  let embedded = false; try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  if (embedded) $('#btnOpen').hidden = false;

  window.addEventListener('hashchange', () => {
    const h = parseHash(); if (!h || !doc) return;
    if (h.lang !== S.lang) { setLang(h.lang).then(() => goTo(h.page, { instant: true })); return; }
    if (h.page && h.page !== S.page) goTo(h.page, { instant: true });
  });
}

function parseHash() {
  const m = /^#?(ro|en)(?:-(\d+))?(-read)?$/i.exec(location.hash || '');
  if (m) return { lang: m[1].toLowerCase(), page: m[2] ? +m[2] : 1, read: !!m[3] };
  const q = new URLSearchParams(location.search);
  const lang = (q.get('lang') || '').toLowerCase();
  if (FILES[lang]) return { lang, page: +q.get('page') || 1, read: q.get('mode') === 'read' };
  return null;
}

/* ───────────── start ───────────── */
async function init() {
  const h = parseHash();
  if (h) S.lang = h.lang;
  applyStrings();
  bindEvents();
  if (location.protocol === 'file:') { showError(new Error('file protocol')); return; }
  try { doc = await loadDoc(S.lang); } catch (e) { showError(e); return; }
  S.page = clamp(h ? h.page : 1, 1, doc.n);
  buildToc();
  $('#pageTotal').textContent = doc.n;
  if (h && h.read) await setMode('read'); else buildBook(S.page);
  hideLoader();
}
init();
