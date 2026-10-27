/* ============================================================
   script.js — Interface de Chromatique
   Dépend de : ColorEngine, Harmonies, Outfit, ClothingData
   ============================================================ */
(function () {
  'use strict';
  const CE = window.ColorEngine, H = window.Harmonies, O = window.Outfit, D = window.ClothingData, K = window.Combos;
  const { clamp, mod360, round } = CE;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 1) => round(v, d).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d });
  const STORE = 'chromatique.v1';
  const SPREAD_IDX = { analogous: [0, 2], split: [1, 2], double: [1, 3], rectangle: [1, 3] };
  const METHOD_NAMES = {};
  H.HARMONY_IDS.forEach((id) => { METHOD_NAMES[id] = H.DEFS[id].name; });

  /* ---------------- État et persistance ---------------- */

  function defaults() {
    return {
      base: '#203A5B', baseHsl: CE.hexToHsl('#203A5B'), method: 'complementary', spread: {}, customOffsets: [0, 90, 180],
      equalize: false, adj: { contrast: 0, lightness: 0, saturation: 0 }, overrides: {}, theme: null, cvd: 'none',
      outfit: { pieces: null, ratio: [60, 30, 10], level: 'casual' }, variants: [], favorites: [], history: [],
      combos: { one: '#203A5B', twoA: '#203A5B', twoB: '#C49A24' },
    };
  }
  let state = defaults();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!raw) return;
      const d = defaults();
      if (raw.base) { d.base = CE.normalizeHex(raw.base); d.baseHsl = CE.hexToHsl(d.base); }
      if (H.DEFS[raw.method]) d.method = raw.method;
      if (raw.spread && typeof raw.spread === 'object') d.spread = raw.spread;
      if (Array.isArray(raw.customOffsets) && raw.customOffsets.length >= 2) d.customOffsets = raw.customOffsets.slice(0, 8);
      d.equalize = !!raw.equalize;
      if (raw.adj) d.adj = Object.assign(d.adj, raw.adj);
      if (raw.theme) d.theme = raw.theme;
      if (['none', 'protanopie', 'deuteranopie', 'tritanopie'].includes(raw.cvd)) d.cvd = raw.cvd;
      if (raw.outfit) d.outfit = Object.assign(d.outfit, raw.outfit);
      ['variants', 'favorites', 'history'].forEach((k) => { if (Array.isArray(raw[k])) d[k] = raw[k]; });
      if (raw.combos && typeof raw.combos === 'object') {
        ['one', 'twoA', 'twoB'].forEach((k) => { try { d.combos[k] = CE.normalizeHex(raw.combos[k]); } catch (e) { /* valeur invalide : on garde celle par défaut */ } });
      }
      state = d;
    } catch (e) { /* stockage indisponible ou corrompu : on repart des valeurs par défaut */ }
  }
  function save() {
    try {
      const { base, method, spread, customOffsets, equalize, adj, theme, cvd, outfit, variants, favorites, history, combos } = state;
      localStorage.setItem(STORE, JSON.stringify({ base, method, spread, customOffsets, equalize, adj, theme, cvd, outfit, variants, favorites, history, combos }));
    } catch (e) { /* quota ou mode privé : ignoré */ }
  }

  /* ---------------- Utilitaires UI ---------------- */

  let toastTimer;
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
  }
  const disp = (hex) => CE.simulateCvd(hex, state.cvd);
  const textOn = (hex) => CE.readableTextColor(disp(hex));

  function copyText(text) {
    const done = () => toast('Copié : ' + text, 'ok');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => fallback());
    } else fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? done() : toast('Copie impossible', 'err'); } catch (e) { toast('Copie impossible', 'err'); }
      ta.remove();
    }
  }
  function download(name, mime, text) {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Fichier généré : ' + name, 'ok');
  }
  const baseName = (hex) => {
    const n = D.nearestName(hex);
    return n.deltaE < 6 ? n.name : 'proche de ' + n.name;
  };
  const labTxt = (d) => `L* ${fmt(d.lab.L)} · a* ${fmt(d.lab.a)} · b* ${fmt(d.lab.b)}`;

  /* ---------------- Calcul de la palette courante ---------------- */

  let cur = null;
  function compute() {
    const def = H.DEFS[state.method];
    const spread = def.spread ? (state.spread[state.method] != null ? state.spread[state.method] : def.spread.def) : 0;
    const result = H.generate(state.method, state.base, { spread, equalize: state.equalize, customOffsets: state.customOffsets });
    const baseHexes = result.colors.map((c) => c.hex);
    const adjusted = H.adjustPalette(baseHexes, state.adj);
    const finals = adjusted.map((h, i) => state.overrides[i] || h);
    const descs = finals.map((h, i) => Object.assign(CE.describe(h), { label: result.colors[i].label, index: i, overridden: !!state.overrides[i], before: baseHexes[i] }));
    cur = { result, baseHexes, finals, descs, spread };
  }

  function setBase(hex, hsl) {
    const d = CE.describe(hex);
    state.base = d.hex;
    state.baseHsl = hsl ? { h: hsl.h, s: hsl.s, l: hsl.l } : Object.assign({}, d.hsl);
    state.overrides = {};
  }

  function refresh(opts) {
    try { compute(); } catch (e) { toast(e.message, 'err'); try { compute(); } catch (e2) { return; } }
    renderAll();
    save();
    if (!opts || opts.commit !== false) scheduleCommit();
  }
  let commitTimer;
  function scheduleCommit() { clearTimeout(commitTimer); commitTimer = setTimeout(pushHistory, 700); }

  /* ---------------- Snapshot / historique / favoris ---------------- */

  function snapshot(name) {
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || `${METHOD_NAMES[state.method]} · ${state.base}`,
      date: new Date().toISOString(), method: state.method, base: state.base,
      spread: cur.spread, customOffsets: state.customOffsets.slice(), equalize: state.equalize,
      adj: Object.assign({}, state.adj), overrides: Object.assign({}, state.overrides), hexes: cur.finals.slice(),
    };
  }
  const keyOf = (s) => s.method + '|' + s.hexes.join(',');
  function pushHistory() {
    if (!cur) return;
    const s = snapshot();
    if (state.history[0] && keyOf(state.history[0]) === keyOf(s)) return;
    state.history = [s].concat(state.history.filter((h) => keyOf(h) !== keyOf(s))).slice(0, 20);
    save(); renderLists();
  }
  const isFav = () => cur && state.favorites.some((f) => keyOf(f) === keyOf({ method: state.method, hexes: cur.finals }));
  function toggleFav() {
    const k = keyOf({ method: state.method, hexes: cur.finals });
    const i = state.favorites.findIndex((f) => keyOf(f) === k);
    if (i >= 0) { state.favorites.splice(i, 1); toast('Retiré des favoris'); }
    else { state.favorites.unshift(snapshot()); toast('Ajouté aux favoris', 'ok'); }
    save(); renderFavBtn(); renderLists();
  }
  function restoreSnapshot(s) {
    try {
      const d = CE.describe(s.base);
      state.base = d.hex; state.baseHsl = Object.assign({}, d.hsl);
      state.method = H.DEFS[s.method] ? s.method : 'complementary';
      if (H.DEFS[state.method].spread) state.spread[state.method] = s.spread;
      state.customOffsets = (s.customOffsets || [0, 90, 180]).slice();
      state.equalize = !!s.equalize; state.adj = Object.assign({ contrast: 0, lightness: 0, saturation: 0 }, s.adj);
      state.overrides = Object.assign({}, s.overrides);
      refresh({ commit: false });
      switchTab('harmonies');
      toast('Palette chargée', 'ok');
    } catch (e) { toast('Impossible de charger cette palette : ' + e.message, 'err'); }
  }

  /* ---------------- Onglets ---------------- */

  function switchTab(name) {
    $$('.tabs [role=tab]').forEach((b) => {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
    });
    $$('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
    if (name === 'outfit') { renderQuick(); renderOutfit(); }
    if (name === 'combos') renderCombos();
    if (name === 'example') renderExample();
    if (name === 'palettes') renderLists();
  }
  function initTabs() {
    const tabs = $$('.tabs [role=tab]');
    tabs.forEach((b, i) => {
      b.addEventListener('click', () => switchTab(b.dataset.tab));
      b.addEventListener('keydown', (e) => {
        let j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); tabs[j].focus(); switchTab(tabs[j].dataset.tab); }
      });
    });
  }

  /* ---------------- Cercle chromatique SVG ---------------- */

  const NS = 'http://www.w3.org/2000/svg';
  const CX = 220, CY = 220, R_OUT = 172, R_IN = 124, R_MK = 148, R_LAB = 195, R_DISC = 116;
  const pt = (a, r) => { const t = a * Math.PI / 180; return [CX + r * Math.sin(t), CY - r * Math.cos(t)]; };
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  }
  const HALO = 'paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round';

  function buildWheel() {
    const w = $('#wheel'); w.innerHTML = '';
    const ring = el('g', { class: 'ring' }, w);
    for (let a = 0; a < 360; a += 2) {
      const [x0, y0] = pt(a, R_OUT), [x1, y1] = pt(a + 2.4, R_OUT), [x2, y2] = pt(a + 2.4, R_IN), [x3, y3] = pt(a, R_IN);
      const fill = disp(CE.hslToHex({ h: a + 1, s: 85, l: 52 }));
      el('path', { d: `M${x0},${y0} A${R_OUT},${R_OUT} 0 0 1 ${x1},${y1} L${x2},${y2} A${R_IN},${R_IN} 0 0 0 ${x3},${y3}Z`, fill, stroke: fill, 'stroke-width': '0.6' }, ring);
    }
    for (let a = 0; a < 360; a += 10) {
      const major = a % 30 === 0;
      const [x0, y0] = pt(a, R_OUT + 1), [x1, y1] = pt(a, R_OUT + (major ? 8 : 4));
      el('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'var(--muted)', 'stroke-width': major ? 1.5 : 1 }, w);
      if (major) {
        const [tx, ty] = pt(a, R_LAB + 4);
        const t = el('text', { x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'tick-label' }, w);
        t.textContent = a + '°';
      }
    }
    el('g', { id: 'wheelDyn' }, w);
  }

  const markerAngle = (d) => (d.hueReliable ? d.hsl.h : state.baseHsl.h);

  function renderWheel() {
    const g = $('#wheelDyn'); g.innerHTML = '';
    const { descs, result } = cur;
    el('circle', { cx: CX, cy: CY, r: R_DISC, fill: disp(descs[result.baseIndex].hex), stroke: 'var(--border)', 'stroke-width': 1 }, g);
    const order = descs.map((d, i) => ({ i, a: markerAngle(d) })).sort((p, q) => p.a - q.a);
    const pts = order.map((o) => pt(o.a, R_MK).join(','));
    if (descs.length === 2) {
      const [x0, y0] = pt(markerAngle(descs[0]), R_MK), [x1, y1] = pt(markerAngle(descs[1]), R_MK);
      el('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'var(--text)', 'stroke-width': 1.6, 'stroke-dasharray': '5 4', opacity: .8, 'pointer-events': 'none' }, g);
    } else if (descs.length > 2) {
      el('polygon', { points: pts.join(' '), fill: 'none', stroke: 'var(--text)', 'stroke-width': 1.6, 'stroke-dasharray': '5 4', opacity: .8, 'pointer-events': 'none' }, g);
    }
    const bAng = markerAngle(descs[result.baseIndex]);
    const [bx, by] = pt(bAng, R_DISC);
    el('line', { x1: CX, y1: CY, x2: bx, y2: by, stroke: textOn(descs[result.baseIndex].hex), 'stroke-width': 2, opacity: .7, 'pointer-events': 'none' }, g);

    descs.forEach((d, i) => {
      const ang = markerAngle(d);
      const label = `${d.label}, ${d.hex}, ${d.hueReliable ? 'teinte ' + fmt(ang) + ' degrés' : 'teinte non significative'}`;
      const m = el('g', { class: 'marker', 'data-i': i, 'data-angle': ang, tabindex: 0, role: 'slider', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 360, 'aria-valuenow': Math.round(ang) }, g);
      const [x, y] = pt(ang, R_MK);
      const r = i === result.baseIndex ? 17 : 13;
      el('circle', { cx: x, cy: y, r: r + 2.5, fill: 'none', stroke: '#000', 'stroke-opacity': .55, 'stroke-width': 1 }, m);
      el('circle', { class: 'mk', cx: x, cy: y, r, fill: disp(d.hex), stroke: '#fff', 'stroke-width': 3, 'stroke-dasharray': d.hueReliable ? '' : '3 2' }, m);
      el('title', {}, m).textContent = label;
      const [lx, ly] = pt(ang, R_DISC - 15);
      const t = el('text', { x: lx, y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'middle', style: HALO + ';font-weight:700;font-size:11px' }, g);
      t.textContent = d.hueReliable ? fmt(ang) + '°' : 'n.s.';
      t.setAttribute('pointer-events', 'none');
    });
    const c1 = el('text', { x: CX, y: CY - 6, 'text-anchor': 'middle', style: HALO + ';font-weight:700;font-size:13px', 'pointer-events': 'none' }, g);
    c1.textContent = descs[result.baseIndex].hex;
    const c2 = el('text', { x: CX, y: CY + 12, 'text-anchor': 'middle', style: HALO + ';font-size:10.5px', 'pointer-events': 'none' }, g);
    c2.textContent = 'couleur de base';

    const parts = descs.map((d) => `${d.label} : ${d.hueReliable ? fmt(markerAngle(d)) + '°' : 'teinte non significative'}`);
    $('#wheelInfo').textContent = parts.join(' · ') + '. Anneau : teintes à saturation fixe ; marqueurs : couleurs réellement calculées.';
  }

  /* Interaction */
  let drag = null;
  function angleFrom(e) {
    const w = $('#wheel'), rect = w.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (440 / rect.width) - CX;
    const y = (e.clientY - rect.top) * (440 / rect.height) - CY;
    return mod360(Math.atan2(x, -y) * 180 / Math.PI);
  }
  function setBaseHue(h) {
    if (state.baseHsl.s < 5) state.baseHsl.s = 50; // une base grise n'a pas de teinte à faire tourner
    state.baseHsl.h = mod360(h);
    state.base = CE.hslToHex(state.baseHsl);
    state.overrides = {};
  }
  function applyAngle(angle, idx) {
    const r = cur.result, def = H.DEFS[state.method];
    const baseH = state.baseHsl.h;
    if (idx === r.baseIndex) setBaseHue(angle);
    else if (def.editable === 'spread' && (SPREAD_IDX[state.method] || []).includes(idx)) {
      const off = H.signedAngle(baseH, angle);
      state.spread[state.method] = clamp(Math.round(def.spreadFromOffset(idx, off)), def.spread.min, def.spread.max);
      state.overrides = {};
    } else if (def.editable === 'custom') {
      state.customOffsets[idx] = Math.round(mod360(angle - baseH));
      state.overrides = {};
    } else setBaseHue(angle - (r.offsets[idx] || 0));
    refresh({ commit: false });
  }
  function initWheel() {
    const w = $('#wheel');
    w.addEventListener('pointerdown', (e) => {
      const m = e.target.closest('.marker');
      if (m) drag = { idx: +m.dataset.i };
      else if (e.target.closest('.ring')) { drag = { idx: cur.result.baseIndex }; applyAngle(angleFrom(e), drag.idx); }
      else return;
      try { w.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
      e.preventDefault();
    });
    w.addEventListener('pointermove', (e) => { if (drag) applyAngle(angleFrom(e), drag.idx); });
    const end = () => { if (drag) { drag = null; scheduleCommit(); } };
    w.addEventListener('pointerup', end); w.addEventListener('pointercancel', end);
    w.addEventListener('keydown', (e) => {
      const m = e.target.closest('.marker');
      if (!m) return;
      const step = e.shiftKey ? 10 : 1;
      let delta = 0;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = step;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -step;
      else return;
      e.preventDefault();
      const idx = +m.dataset.i;
      applyAngle(mod360(parseFloat(m.dataset.angle) + delta), idx);
      const again = $(`#wheel .marker[data-i="${idx}"]`);
      if (again) again.focus();
    });
  }

  /* ---------------- Rendus : palette, relations, infos ---------------- */

  function renderPalette() {
    $('#palette').innerHTML = cur.descs.map((d, i) => {
      const t = H.temperature(d.hex);
      const nm = baseName(d.hex);
      return `<article class="swatch" aria-label="${esc(d.label)} ${d.hex}">
        <div class="chip" style="background:${disp(d.hex)};color:${textOn(d.hex)}"><span>${esc(d.label)}</span><span>${d.hex}</span></div>
        <div class="meta">
          <strong>${esc(nm.charAt(0).toUpperCase() + nm.slice(1))}</strong>
          <code>RGB ${d.rgb.r}, ${d.rgb.g}, ${d.rgb.b}</code>
          <code>HSL ${fmt(d.hsl.h)}°, ${fmt(d.hsl.s)} %, ${fmt(d.hsl.l)} %</code>
          <code>${labTxt(d)}</code>
          <span>${d.hueReliable ? 'Teinte ' + fmt(d.hsl.h) + '° · ' + t : 'Teinte non significative (quasi neutre)'}</span>
          ${d.overridden ? '<span class="badge">modifiée manuellement</span>' : ''}
          <div class="acts">
            <button type="button" data-act="copy" data-i="${i}">Copier HEX</button>
            <input type="color" data-act="edit" data-i="${i}" value="${d.hex.toLowerCase()}" aria-label="Modifier cette couleur seule">
            ${d.overridden ? `<button type="button" data-act="revert" data-i="${i}" title="Revenir à la couleur calculée">↺</button>` : ''}
            <button type="button" data-act="base" data-i="${i}" title="Utiliser comme nouvelle base">Base</button>
          </div></div></article>`;
    }).join('');
  }

  function renderBeforeAfter() {
    const active = state.adj.contrast || state.adj.lightness || state.adj.saturation || Object.keys(state.overrides).length;
    if (!active) { $('#beforeAfter').innerHTML = '<p class="small">Aucun réglage actif : avant = après.</p>'; return; }
    $('#beforeAfter').innerHTML = '<div class="ba-row"><strong>Avant</strong><strong>Après</strong></div>' + cur.descs.map((d) =>
      `<div class="ba-row"><div style="background:${disp(d.before)};color:${textOn(d.before)}">${d.before}</div><div style="background:${disp(d.hex)};color:${textOn(d.hex)}">${d.hex}${d.overridden ? ' ✎' : ''}</div></div>`).join('');
  }

  function renderRelations() {
    const ds = cur.descs;
    let summary = '';
    const reliable = ds.filter((d) => d.hueReliable);
    if (ds.length === 2 && reliable.length === 2) {
      const c = H.classifyTwo(ds[0].hsl.h, ds[1].hsl.h, 2);
      summary = `Écart de teinte HSL : <strong>${fmt(c.distance, 2)}°</strong>. ${c.isComplementary ? 'Les deux teintes sont complémentaires (180° à ±2° près).' : 'Pas complémentaires strictes (écart de ' + fmt(c.deviationFromComplement, 1) + '° à 180°).'}`;
    } else if (ds.length === 3 && reliable.length === 3) {
      const c = H.classifyThree(ds.map((d) => d.hsl.h), 2);
      summary = `Écarts successifs : <strong>${c.gapsSorted.map((v) => fmt(v, 1) + '°').join(' / ')}</strong>. ` + (c.isStrictTriad ? 'Triade équilatérale (à ±2°).' : `Pas une triade stricte (écart max à 120° : ${fmt(c.triadDeviation, 1)}°). Structure la plus proche : ${c.best.name.toLowerCase()}, écart ${fmt(c.best.maxDeviation, 1)}°.`);
    } else if (reliable.length >= 2) {
      summary = `Écarts successifs entre teintes : <strong>${H.circularGaps(reliable.map((d) => d.hsl.h)).map((v) => fmt(v, 1) + '°').sort().join(' · ')}</strong>.`;
    } else summary = 'Moins de deux teintes significatives : aucune relation angulaire à afficher.';
    let rows = '';
    for (let i = 0; i < ds.length; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const a = ds[i], b = ds[j];
        const gap = a.hueReliable && b.hueReliable ? H.hueDistance(a.hsl.h, b.hsl.h) : null;
        const comp = gap !== null && Math.abs(gap - 180) <= 2 ? ' <span class="badge">complémentaires</span>' : '';
        rows += `<tr><td>${esc(a.label)} – ${esc(b.label)}</td><td>${gap === null ? 'n.s.' : fmt(gap, 1) + '°'}${comp}</td><td>${fmt(CE.deltaE2000(a.lab, b.lab))}</td><td>${fmt(CE.contrastRatio(a.hex, b.hex), 2)}</td><td>${fmt(Math.abs(a.lab.L - b.lab.L))}</td></tr>`;
      }
    }
    $('#relations').innerHTML = `<p>${summary}</p>
      <div class="tablewrap"><table><thead><tr><th>Paire</th><th>Écart HSL <small>(géométrique)</small></th><th>ΔE00 <small>(perceptuel)</small></th><th>Contraste WCAG</th><th>ΔL*</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint">L'écart HSL décrit une position sur la roue ; le ΔE00 estime une différence perçue. Ce sont deux mesures distinctes (n.s. = teinte non significative).</p>`;
  }

  function renderMethodInfo() {
    const m = D.METHODS[state.method];
    $('#methodInfo').innerHTML = `<h3>${esc(METHOD_NAMES[state.method])}</h3><dl>
      <div><dt>Définition</dt><dd>${esc(m.definition)}</dd></div><div><dt>Logique</dt><dd>${esc(m.logique)}</dd></div>
      <div><dt>Avantages</dt><dd>${esc(m.avantages)}</dd></div><div><dt>Limites</dt><dd>${esc(m.limites)}</dd></div>
      <div><dt>Quand l'utiliser</dt><dd>${esc(m.situations)}</dd></div></dl>
      <p class="hint">Une relation géométrique sur le cercle n'est pas une garantie esthétique.</p>`;
  }

  function renderBaseDetail() {
    const d = CE.describe(state.base);
    const t = H.temperature(d.hex);
    $('#baseDetail').innerHTML = `<div class="name"><span class="dot" style="background:${disp(d.hex)}"></span>${esc(baseName(d.hex))} · ${d.hex}</div>
      <div>RGB ${d.rgb.r}, ${d.rgb.g}, ${d.rgb.b} · HSL ${fmt(d.hsl.h)}°, ${fmt(d.hsl.s)} %, ${fmt(d.hsl.l)} %</div>
      <div>${labTxt(d)} · C* ${fmt(d.lch.C)} · h* ${fmt(d.lch.h)}°</div>
      <div>${d.hueReliable ? 'Température de teinte : ' + t : '⚠ Teinte HSL non significative (couleur quasi neutre) : les angles ne reflètent pas une vraie teinte.'}</div>`;
  }

  function renderWarnings() {
    const w = cur.result.warnings;
    $('#warnings').innerHTML = w.map((x) => `<div class="note warn"><b class="tag">Attention</b>${esc(x)}</div>`).join('');
  }

  function renderFavBtn() { const f = isFav(); const b = $('#favBtn'); b.textContent = f ? '★ Favori' : '☆ Favori'; b.setAttribute('aria-pressed', f); }

  function setField(id, v) { const e = $(id); if (document.activeElement !== e) e.value = v; }
  function renderInputs() {
    const d = CE.describe(state.base);
    setField('#hexInput', d.hex);
    $('#nativeColor').value = d.hex.toLowerCase();
    setField('#rIn', d.rgb.r); setField('#gIn', d.rgb.g); setField('#bIn', d.rgb.b);
    setField('#hIn', round(state.baseHsl.h, 1)); setField('#sIn', round(state.baseHsl.s, 1)); setField('#lIn', round(state.baseHsl.l, 1));
    $('#methodSelect').value = state.method;
    $('#equalizeChk').checked = state.equalize;
    $('#adjContrast').value = state.adj.contrast; $('#adjLight').value = state.adj.lightness; $('#adjSat').value = state.adj.saturation;
    $('#adjContrastOut').textContent = state.adj.contrast; $('#adjLightOut').textContent = state.adj.lightness; $('#adjSatOut').textContent = state.adj.saturation;
    const def = H.DEFS[state.method];
    $('#spreadBox').hidden = def.editable !== 'spread';
    if (def.editable === 'spread') {
      const r = $('#spreadRange'); r.min = def.spread.min; r.max = def.spread.max; r.value = cur.spread;
      $('#spreadOut').textContent = cur.spread + '°';
    }
    $('#customBox').hidden = state.method !== 'custom';
    if (state.method === 'custom' && !$('#customAngles').contains(document.activeElement)) {
      $('#customCount').value = state.customOffsets.length;
      $('#customAngles').innerHTML = state.customOffsets.map((o, i) => i === 0
        ? '<label class="field">Base<input type="number" value="0" disabled aria-label="Angle de la base"></label>'
        : `<label class="field">Couleur ${i + 1} (°)<input type="number" min="0" max="360" step="1" value="${o}" data-ci="${i}"></label>`).join('');
    }
  }

  function renderAll() {
    renderInputs(); renderWheel(); renderPalette(); renderBeforeAfter(); renderRelations();
    renderMethodInfo(); renderBaseDetail(); renderWarnings(); renderFavBtn(); renderQuick();
    if (!$('#tab-outfit').hidden) renderOutfit();
  }

  /* ---------------- Entrées de couleur ---------------- */

  function showBaseError(msg, ids) {
    $('#baseError').textContent = msg || '';
    $$('#tab-harmonies input').forEach((i) => i.classList.remove('invalid'));
    (ids || []).forEach((id) => $(id).classList.add('invalid'));
  }
  function initInputs() {
    const hex = $('#hexInput');
    hex.addEventListener('input', () => {
      const v = hex.value.trim();
      if (/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) { showBaseError(''); setBase(CE.normalizeHex(v)); refresh(); }
    });
    hex.addEventListener('change', () => {
      try { setBase(CE.normalizeHex(hex.value)); showBaseError(''); refresh(); }
      catch (e) { showBaseError(e.message, ['#hexInput']); }
    });
    $('#nativeColor').addEventListener('input', (e) => { showBaseError(''); setBase(CE.normalizeHex(e.target.value)); refresh({ commit: false }); });
    $('#nativeColor').addEventListener('change', () => scheduleCommit());
    const rgbChange = () => {
      try {
        const rgb = CE.validateRgb({ r: $('#rIn').value, g: $('#gIn').value, b: $('#bIn').value });
        setBase(CE.rgbToHex(rgb)); showBaseError(''); refresh();
      } catch (e) { showBaseError(e.message, ['#rIn', '#gIn', '#bIn']); }
    };
    ['#rIn', '#gIn', '#bIn'].forEach((s) => $(s).addEventListener('change', rgbChange));
    const hslChange = () => {
      try {
        const hsl = CE.validateHsl({ h: $('#hIn').value, s: $('#sIn').value, l: $('#lIn').value });
        setBase(CE.hslToHex(hsl), hsl); showBaseError(''); refresh();
      } catch (e) { showBaseError(e.message, ['#hIn', '#sIn', '#lIn']); }
    };
    ['#hIn', '#sIn', '#lIn'].forEach((s) => $(s).addEventListener('change', hslChange));
    $('#randomBtn').addEventListener('click', () => { showBaseError(''); setBase(H.randomBase()); refresh(); toast('Couleur aléatoire (saturation et luminosité contrôlées)'); });

    const ms = $('#methodSelect');
    ms.innerHTML = H.HARMONY_IDS.map((id, i) => `<option value="${id}">${i + 1}. ${esc(METHOD_NAMES[id])}</option>`).join('');
    ms.addEventListener('change', () => { state.method = ms.value; state.overrides = {}; refresh(); });
    $('#spreadRange').addEventListener('input', (e) => { state.spread[state.method] = +e.target.value; state.overrides = {}; refresh({ commit: false }); });
    $('#spreadRange').addEventListener('change', scheduleCommit);
    $('#equalizeChk').addEventListener('change', (e) => { state.equalize = e.target.checked; state.overrides = {}; refresh(); });
    $('#customCount').addEventListener('change', (e) => {
      const n = clamp(Math.round(+e.target.value) || 3, 2, 8);
      while (state.customOffsets.length < n) state.customOffsets.push(mod360((state.customOffsets[state.customOffsets.length - 1] || 0) + 60));
      state.customOffsets.length = n; state.overrides = {}; refresh();
    });
    $('#customAngles').addEventListener('change', (e) => {
      const i = e.target.dataset.ci; if (i === undefined) return;
      const v = e.target.value;
      if (v === '' || !Number.isFinite(+v)) { e.target.classList.add('invalid'); toast('Angle invalide : saisissez un nombre', 'err'); return; }
      state.customOffsets[+i] = mod360(+v); state.overrides = {}; refresh();
    });
    [['#adjContrast', 'contrast'], ['#adjLight', 'lightness'], ['#adjSat', 'saturation']].forEach(([s, k]) => {
      $(s).addEventListener('input', (e) => { state.adj[k] = +e.target.value; refresh({ commit: false }); });
      $(s).addEventListener('change', scheduleCommit);
    });
    $('#adjReset').addEventListener('click', () => { state.adj = { contrast: 0, lightness: 0, saturation: 0 }; state.overrides = {}; refresh(); });

    $('#palette').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const i = +b.dataset.i;
      if (b.dataset.act === 'copy') copyText(cur.finals[i]);
      else if (b.dataset.act === 'revert') { delete state.overrides[i]; refresh(); }
      else if (b.dataset.act === 'base') { setBase(cur.finals[i]); refresh(); }
    });
    $('#palette').addEventListener('change', (e) => {
      const inp = e.target.closest('input[data-act=edit]'); if (!inp) return;
      state.overrides[+inp.dataset.i] = CE.normalizeHex(inp.value); refresh();
    });
    $('#favBtn').addEventListener('click', toggleFav);
    $('#copyAllBtn').addEventListener('click', () => copyText(cur.finals.join(', ')));
    $('#toOutfitBtn').addEventListener('click', () => { generateOutfit(); switchTab('outfit'); });
    $('#expJson').addEventListener('click', () => download(fileName('palette', 'json'), 'application/json', JSON.stringify(record(snapshot()), null, 2)));
    $('#expCsv').addEventListener('click', () => download(fileName('palette', 'csv'), 'text/csv', toCsv([record(snapshot())])));
    $('#expPrint').addEventListener('click', () => printSheet(snapshot()));
  }

  /* ---------------- Bibliothèque ---------------- */

  function renderLibrary() {
    const fam = $('#familyFilter').value, q = $('#libSearch').value.trim().toLowerCase();
    const items = D.LIBRARY.filter((c) => (fam === 'all' || c.family === fam) && (!q || c.name.toLowerCase().includes(q) || c.hex.toLowerCase().includes(q)));
    $('#library').innerHTML = items.length ? items.map((c) => `<button type="button" data-hex="${c.hex}" title="${esc(c.name)} ${c.hex}">
      <span class="dot" style="background:${disp(c.hex)}"></span><span>${esc(c.name)}<small>${c.hex}</small></span></button>`).join('') : '<p class="small">Aucune couleur trouvée.</p>';
  }
  function initLibrary() {
    $('#familyFilter').innerHTML = '<option value="all">Toutes les familles</option>' + D.FAMILIES.map((f) => `<option>${esc(f)}</option>`).join('');
    $('#familyFilter').addEventListener('change', renderLibrary);
    $('#libSearch').addEventListener('input', renderLibrary);
    $('#library').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-hex]'); if (!b) return;
      showBaseError(''); setBase(b.dataset.hex); refresh();
    });
    renderLibrary();
  }

  /* ---------------- Image ---------------- */

  function initImage() {
    $('#imgInput').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const status = $('#imgStatus');
      if (!/^image\//.test(f.type)) { status.textContent = ''; toast('Ce fichier n\'est pas une image', 'err'); return; }
      if (f.size > 20 * 1024 * 1024) { toast('Image trop volumineuse (20 Mo maximum)', 'err'); return; }
      status.innerHTML = '<span class="spinner"></span>Analyse en cours…'; $('#imgColors').innerHTML = '';
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => {
        setTimeout(() => {
          try {
            const s = Math.min(1, 96 / Math.max(img.width, img.height));
            const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.width * s)); cv.height = Math.max(1, Math.round(img.height * s));
            const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, cv.width, cv.height);
            const data = ctx.getImageData(0, 0, cv.width, cv.height).data, px = [];
            for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) px.push([data[i], data[i + 1], data[i + 2]]);
            const pal = CE.extractPalette(px, 6);
            status.textContent = 'Couleurs dominantes de l\'image (approximation : l\'éclairage et l\'appareil faussent les couleurs réelles).';
            $('#imgColors').innerHTML = pal.map((c) => `<button type="button" data-hex="${c.hex}"><span class="dot" style="background:${disp(c.hex)}"></span>${c.hex} · ${Math.round(c.share * 100)} %</button>`).join('');
          } catch (err) { status.textContent = ''; toast('Analyse impossible : ' + err.message, 'err'); }
          URL.revokeObjectURL(url);
        }, 30);
      };
      img.onerror = () => { status.textContent = ''; URL.revokeObjectURL(url); toast('Impossible de lire cette image', 'err'); };
      img.src = url;
    });
    $('#imgColors').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-hex]'); if (!b) return;
      setBase(b.dataset.hex); refresh();
    });
  }

  /* ---------------- Exports ---------------- */

  const fileName = (p, ext) => `${p}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  function record(s) {
    return {
      nom: s.name, methode: METHOD_NAMES[s.method] || s.method, base: s.base, date: s.date,
      couleurs: s.hexes.map((h, i) => {
        const d = CE.describe(h);
        return { index: i + 1, hex: d.hex, rgb: d.rgb, hsl: { h: round(d.hsl.h, 2), s: round(d.hsl.s, 2), l: round(d.hsl.l, 2) },
          lab: { L: round(d.lab.L, 2), a: round(d.lab.a, 2), b: round(d.lab.b, 2) }, teinteSignificative: d.hueReliable };
      }),
      avertissement: 'Valeurs indicatives d\'écran : le rendu réel d\'un tissu varie selon la matière et l\'éclairage.',
    };
  }
  function toCsv(recs) {
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const rows = [['palette', 'methode', 'index', 'hex', 'r', 'g', 'b', 'h', 's', 'l', 'L*', 'a*', 'b*']];
    recs.forEach((r) => r.couleurs.forEach((c) => rows.push([r.nom, r.methode, c.index, c.hex, c.rgb.r, c.rgb.g, c.rgb.b, c.hsl.h, c.hsl.s, c.hsl.l, c.lab.L, c.lab.a, c.lab.b])));
    return '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
  }
  function printSheet(s) {
    const r = record(s);
    $('#printSheet').innerHTML = `<h1 style="font-size:1.4rem">Fiche de palette — ${esc(r.nom)}</h1>
      <p>Méthode : ${esc(r.methode)} · Base : ${r.base} · ${new Date(r.date).toLocaleDateString('fr-FR')}</p>
      <div class="palette">${r.couleurs.map((c) => `<div class="swatch"><div class="chip" style="background:${c.hex};color:${CE.readableTextColor(c.hex)};-webkit-print-color-adjust:exact;print-color-adjust:exact"><span>${c.index}</span><span>${c.hex}</span></div>
        <div class="meta"><strong>${esc(baseName(c.hex))}</strong><code>RGB ${c.rgb.r}, ${c.rgb.g}, ${c.rgb.b}</code><code>HSL ${c.hsl.h}°, ${c.hsl.s} %, ${c.hsl.l} %</code><code>L* ${c.lab.L} · a* ${c.lab.a} · b* ${c.lab.b}</code></div></div>`).join('')}</div>
      <p style="font-size:.85rem">${esc(r.avertissement)} Les relations d'angles HSL sont géométriques ; elles ne garantissent pas une harmonie esthétique.</p>`;
    window.print();
  }

  /* ---------------- Tenues : saisie ---------------- */

  const slotEls = {};
  function buildSlots() {
    $('#slots').innerHTML = O.SLOTS.map((s) => `<div class="slot" data-slot="${s.id}">
      <h3>${esc(s.label)}</h3>
      <div class="row wrap">
        <select class="s-type" aria-label="Type — ${esc(s.label)}">${s.types.map((t) => `<option>${esc(t)}</option>`).join('')}</select>
        <input type="color" class="s-color" aria-label="Couleur — ${esc(s.label)}">
        <input type="text" class="s-hex" maxlength="7" size="8" aria-label="Code HEX — ${esc(s.label)}" spellcheck="false">
        <select class="s-role" aria-label="Rôle — ${esc(s.label)}">${Object.keys(O.ROLES).map((r) => `<option value="${r}">${O.ROLES[r]}</option>`).join('')}</select>
      </div>
      <div class="quick" role="group" aria-label="Couleurs de la palette"></div>
      <p class="error s-err" role="alert"></p></div>`).join('');
    $$('.slot').forEach((n) => { slotEls[n.dataset.slot] = n; });
    $('#slots').addEventListener('change', (e) => {
      const n = e.target.closest('.slot'); if (!n) return;
      const p = pieceOf(n.dataset.slot);
      if (e.target.classList.contains('s-type')) p.type = e.target.value;
      else if (e.target.classList.contains('s-role')) p.role = e.target.value;
      else if (e.target.classList.contains('s-color')) p.hex = CE.normalizeHex(e.target.value);
      else if (e.target.classList.contains('s-hex')) {
        try { p.hex = CE.normalizeHex(e.target.value); $('.s-err', n).textContent = ''; e.target.classList.remove('invalid'); }
        catch (err) { $('.s-err', n).textContent = err.message; e.target.classList.add('invalid'); return; }
      }
      syncSlots(); renderOutfit(); save();
    });
    $('#slots').addEventListener('input', (e) => {
      if (e.target.classList.contains('s-color')) { const n = e.target.closest('.slot'); pieceOf(n.dataset.slot).hex = CE.normalizeHex(e.target.value); $('.s-hex', n).value = pieceOf(n.dataset.slot).hex; renderOutfit(); }
    });
    $('#slots').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-hex]'); if (!b) return;
      pieceOf(b.closest('.slot').dataset.slot).hex = b.dataset.hex; syncSlots(); renderOutfit(); save();
    });
  }
  const pieceOf = (slot) => state.outfit.pieces.find((p) => p.slot === slot);
  function syncSlots() {
    state.outfit.pieces.forEach((p) => {
      const n = slotEls[p.slot]; if (!n) return;
      $('.s-type', n).value = p.type; $('.s-role', n).value = p.role;
      $('.s-color', n).value = p.hex.toLowerCase(); $('.s-hex', n).value = p.hex;
      const off = !O.isActive(p);
      ['.s-color', '.s-hex', '.s-role'].forEach((s) => { $(s, n).disabled = off; });
      $('.s-hex', n).classList.remove('invalid'); $('.s-err', n).textContent = '';
    });
  }
  function renderQuick() {
    if (!cur) return;
    $$('.slot .quick').forEach((q) => {
      q.innerHTML = cur.finals.map((h) => `<button type="button" data-hex="${h}" title="${h}" aria-label="Utiliser ${h}" style="background:${disp(h)}"></button>`).join('');
    });
  }
  function generateOutfit() {
    try {
      state.outfit.pieces = O.generateOutfit(cur.finals, state.outfit.level);
      syncSlots(); renderOutfit(); save();
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ---------------- Tenues : aperçu et analyse ---------------- */

  function renderMannequin() {
    const P = (s) => pieceOf(s), C = (s) => disp(P(s).hex), on = (s) => O.isActive(P(s));
    let svg = '<ellipse cx="100" cy="318" rx="62" ry="6" fill="rgba(0,0,0,.12)"/>';
    svg += '<circle cx="100" cy="30" r="19" fill="var(--surface-2)" stroke="var(--border)" stroke-width="2"/>';
    const bas = P('bas'), short = bas.type === 'Short';
    svg += `<rect x="62" y="170" width="38" height="${short ? 55 : 112}" rx="7" fill="${C('bas')}" stroke="#0004"/><rect x="100" y="170" width="38" height="${short ? 55 : 112}" rx="7" fill="${C('bas')}" stroke="#0004"/>`;
    svg += `<rect x="54" y="284" width="46" height="24" rx="11" fill="${C('chaussures')}" stroke="#0004"/><rect x="100" y="284" width="46" height="24" rx="11" fill="${C('chaussures')}" stroke="#0004"/>`;
    if (on('couche')) {
      svg += `<rect x="38" y="58" width="124" height="116" rx="18" fill="${C('couche')}" stroke="#0004"/><rect x="26" y="66" width="22" height="92" rx="10" fill="${C('couche')}" stroke="#0004"/><rect x="152" y="66" width="22" height="92" rx="10" fill="${C('couche')}" stroke="#0004"/>`;
      svg += `<rect x="78" y="58" width="44" height="112" rx="6" fill="${C('haut')}" stroke="#0004"/>`;
    } else {
      svg += `<rect x="50" y="58" width="100" height="116" rx="16" fill="${C('haut')}" stroke="#0004"/><rect x="32" y="64" width="24" height="88" rx="11" fill="${C('haut')}" stroke="#0004"/><rect x="144" y="64" width="24" height="88" rx="11" fill="${C('haut')}" stroke="#0004"/>`;
    }
    if (on('accessoire')) {
      const a = P('accessoire'), c = C('accessoire');
      if (a.type === 'Ceinture') svg += `<rect x="62" y="166" width="76" height="8" rx="2" fill="${c}" stroke="#0004"/>`;
      else if (a.type === 'Sac') svg += `<rect x="150" y="150" width="36" height="30" rx="5" fill="${c}" stroke="#0004"/><path d="M158 150 Q168 128 178 150" fill="none" stroke="${c}" stroke-width="3"/>`;
      else if (a.type === 'Casquette') svg += `<path d="M81 28 Q100 4 119 28 Z" fill="${c}" stroke="#0004"/><rect x="100" y="24" width="30" height="6" rx="3" fill="${c}" stroke="#0004"/>`;
      else if (a.type === 'Montre') svg += `<rect x="28" y="146" width="16" height="10" rx="3" fill="${c}" stroke="#0004"/>`;
      else if (a.type === 'Écharpe') svg += `<rect x="76" y="48" width="48" height="14" rx="6" fill="${c}" stroke="#0004"/><rect x="104" y="58" width="12" height="40" rx="4" fill="${c}" stroke="#0004"/>`;
    }
    $('#mannequin').innerHTML = svg;
  }

  const pieceName = (p) => `${O.slotInfo(p.slot).label} (${p.type})`;
  function swatchHtml(hex) { return `<span class="dot" style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${disp(hex)};border:1px solid var(--border);vertical-align:-2px"></span>`; }

  function analysisHtml(a, items, opts) {
    const o = Object.assign({ actions: true }, opts || {});
    const active = items.filter(O.isActive);
    const by = (role) => active.filter((p) => p.role === role).map((p) => `${swatchHtml(p.hex)} ${esc(pieceName(p))} ${p.hex}`).join('<br>') || '—';
    const slotLine = (slot) => { const p = items.find((x) => x.slot === slot); return p && O.isActive(p) ? `${swatchHtml(p.hex)} ${esc(p.type)} ${p.hex}` : '—'; };
    const act = a.proportions.actual, tg = a.proportions.target;
    const bar = (v, cols) => `<div class="share">${['dominant', 'secondary', 'accent'].map((k, i) => v[k] > 0 ? `<span style="width:${v[k]}%;background:${cols[i]}">${Math.round(v[k])}</span>` : '').join('')}</div>`;
    const cols = ['#4a5568', '#718096', '#a0aec0'];
    let sugg = '';
    if (a.suggestions.length) {
      sugg = '<h3>Substitutions suggérées</h3>' + a.suggestions.map((s, i) => `<div class="list-item"><div>${swatchHtml(s.from)} ${s.from} → ${swatchHtml(s.to)} ${s.to} <span class="badge">${esc(s.toName)}</span></div><div class="small">${esc(s.reason)}</div>${o.actions ? `<div><button type="button" data-sug="${i}">Appliquer</button></div>` : ''}</div>`).join('');
    }
    const strip = (hexes) => `<div class="strip" role="img" aria-label="${hexes.join(', ')}">${hexes.map((h, i) => `<span style="background:${disp(h)}" title="${h}"></span>`).join('')}</div>`;
    const kinds = { mesure: 'Mesure', risque: 'Risque', conseil: 'Conseil' };
    return `<div class="tablewrap"><table><tbody>
        <tr><th>Couleur principale</th><td>${by('dominant')}</td></tr><tr><th>Couleur secondaire</th><td>${by('secondary')}</td></tr>
        <tr><th>Couleur d'accent</th><td>${by('accent')}</td></tr><tr><th>Neutres</th><td>${by('neutral')}</td></tr>
        <tr><th>Bas</th><td>${slotLine('bas')}</td></tr><tr><th>Chaussures</th><td>${slotLine('chaussures')}</td></tr><tr><th>Accessoire</th><td>${slotLine('accessoire')}</td></tr>
      </tbody></table></div>
      <h3>Logique colorimétrique</h3><p>${esc(a.logic)}</p>
      <p><span class="pill">Contraste : ${a.contrastLevel}</span><span class="pill">${a.strongCount} couleur(s) vive(s)</span><span class="pill">ΔE00 max ${fmt(a.maxDeltaE, 0)}</span></p>
      <p>Facilité de port (indice heuristique) : <span class="score">${a.ease.score}</span>/100 — ${esc(a.ease.label)}</p>
      <h3>Répartition visuelle <small>(heuristique)</small></h3>
      <div class="small">Estimée : ${bar(act, cols)}</div><div class="small">Cible ${tg.join(' / ')} : ${bar({ dominant: tg[0], secondary: tg[1], accent: tg[2] }, cols)}</div>
      <h3>Observations</h3><div class="notes">${a.notes.map((n) => `<div class="note ${n.kind}"><b class="tag">${kinds[n.kind]}</b>${esc(n.text)}${n.swatches ? ' ' + n.swatches.map((h) => swatchHtml(h)).join(' ') : ''}</div>`).join('')}</div>
      ${sugg}
      <h3>Alternatives</h3><div class="alts">
        <div>Plus sobre (saturation réduite) ${strip(a.alternatives.sober)} ${o.actions ? '<button type="button" data-alt="sober">Appliquer</button>' : ''}</div>
        <div>Plus audacieuse (saturation accrue) ${strip(a.alternatives.bold)} ${o.actions ? '<button type="button" data-alt="bold">Appliquer</button>' : ''}</div></div>
      <details><summary>Détail des paires (mesures)</summary><div class="tablewrap"><table><thead><tr><th>Paire</th><th>Écart HSL</th><th>ΔE00</th><th>ΔL*</th><th>WCAG</th><th>Lecture</th></tr></thead><tbody>
        ${a.pairs.map((p) => `<tr><td>${esc(p.aLabel)} – ${esc(p.bLabel)}</td><td>${p.hueGap === null ? 'n.s.' : fmt(p.hueGap, 0) + '°'}</td><td>${fmt(p.deltaE)}</td><td>${fmt(p.dL, 0)}</td><td>${fmt(p.contrast, 1)}</td><td>${p.level}</td></tr>`).join('')}</tbody></table></div></details>
      <p class="hint">Les mesures (ΔE00, L*, chroma, WCAG) sont calculées ; les conseils sont des heuristiques de stylisme, pas des verdicts.</p>`;
  }

  let lastAnalysis = null;
  function renderOutfit() {
    if (!state.outfit.pieces) return;
    renderMannequin();
    lastAnalysis = O.analyzeOutfit(state.outfit.pieces, { target: state.outfit.ratio });
    $('#outfitAnalysis').innerHTML = analysisHtml(lastAnalysis, state.outfit.pieces);
    renderVariants();
  }
  function initOutfit() {
    buildSlots();
    $('#levelSel').value = state.outfit.level;
    $('#ratioSel').value = state.outfit.ratio.join(',');
    $('#levelSel').addEventListener('change', (e) => { state.outfit.level = e.target.value; save(); });
    $('#genOutfit').addEventListener('click', () => { generateOutfit(); toast('Tenue générée à partir de la palette', 'ok'); });
    $('#ratioSel').addEventListener('change', (e) => { state.outfit.ratio = e.target.value.split(',').map(Number); renderOutfit(); save(); });
    $('#outfitAnalysis').addEventListener('click', (e) => {
      const s = e.target.closest('button[data-sug]'), a = e.target.closest('button[data-alt]');
      if (s) {
        const sg = lastAnalysis.suggestions[+s.dataset.sug];
        pieceOf(sg.slot).hex = sg.to; syncSlots(); renderOutfit(); save(); toast('Substitution appliquée', 'ok');
      } else if (a) {
        const hexes = lastAnalysis.alternatives[a.dataset.alt];
        state.outfit.pieces.forEach((p, i) => { p.hex = hexes[i]; });
        syncSlots(); renderOutfit(); save(); toast('Alternative appliquée', 'ok');
      }
    });
    $('#saveVariant').addEventListener('click', () => {
      if (state.variants.length >= 6) { toast('6 variantes maximum : supprimez-en une', 'err'); return; }
      state.variants.push({ id: Date.now().toString(36), name: 'Variante ' + (state.variants.length + 1), pieces: JSON.parse(JSON.stringify(state.outfit.pieces)) });
      save(); renderVariants(); toast('Variante enregistrée', 'ok');
    });
    $('#variants').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      const i = state.variants.findIndex((v) => v.id === b.dataset.id); if (i < 0) return;
      if (b.dataset.v === 'load') { state.outfit.pieces = JSON.parse(JSON.stringify(state.variants[i].pieces)); syncSlots(); renderOutfit(); save(); toast('Variante chargée', 'ok'); }
      else { state.variants.splice(i, 1); save(); renderVariants(); }
    });
    $('#variants').addEventListener('change', (e) => {
      if (!e.target.matches('input[data-name]')) return;
      const v = state.variants.find((x) => x.id === e.target.dataset.name); if (v) { v.name = e.target.value.trim() || v.name; save(); renderVariants(); }
    });
  }
  function renderVariants() {
    if (!state.variants.length) { $('#variants').innerHTML = '<p class="small">Aucune variante. Composez une tenue puis « Enregistrer comme variante » pour comparer plusieurs versions.</p>'; return; }
    const rows = state.variants.map((v) => {
      const a = O.analyzeOutfit(v.pieces, { target: state.outfit.ratio });
      return { v, a };
    });
    $('#variants').innerHTML = rows.map(({ v }) => `<div class="list-item"><div class="row wrap">
      <input type="text" data-name="${v.id}" value="${esc(v.name)}" aria-label="Nom de la variante">
      <div class="strip" role="img" aria-label="${v.pieces.filter(O.isActive).map((p) => p.hex).join(', ')}">${v.pieces.filter(O.isActive).map((p) => `<span style="background:${disp(p.hex)}"></span>`).join('')}</div>
      <button type="button" data-v="load" data-id="${v.id}">Charger</button><button type="button" class="danger" data-v="del" data-id="${v.id}">Supprimer</button></div></div>`).join('') +
      (rows.length >= 2 ? `<div class="tablewrap"><table><thead><tr><th>Variante</th><th>Vives</th><th>Neutres</th><th>Contraste</th><th>ΔE00 max</th><th>Facilité</th></tr></thead><tbody>${rows.map(({ v, a }) =>
        `<tr><td>${esc(v.name)}</td><td>${a.strongCount}</td><td>${a.neutralCount}</td><td>${a.contrastLevel}</td><td>${fmt(a.maxDeltaE, 0)}</td><td>${a.ease.score}</td></tr>`).join('')}</tbody></table></div>` : '');
  }

  /* ---------------- Associations de couleurs ---------------- */

  const COMBO_PICKERS = [
    { key: 'one', host: '#pickOne', label: 'Votre couleur', kind: 'one' },
    { key: 'twoA', host: '#pickTwoA', label: 'Première couleur', kind: 'two' },
    { key: 'twoB', host: '#pickTwoB', label: 'Seconde couleur', kind: 'two' },
  ];
  const COMBO_DOM = { trio: ['#comboTrio', null], one: ['#comboOne', '#comboOneWarn'], two: ['#comboTwo', '#comboTwoWarn'] };
  const randSeed = () => 1 + Math.floor(Math.random() * 2147483646);
  // Graine 0 : les meilleures propositions ; autre graine : tirage varié parmi les bonnes (bouton « Autres propositions »)
  const comboSeed = { trio: randSeed(), one: 0, two: 0 };
  const comboRes = { trio: [], one: [], two: [] };

  function computeCombo(kind) {
    const o = { count: 6, seed: comboSeed[kind] };
    try {
      if (kind === 'trio') return K.suggestTrios(o);
      if (kind === 'one') return K.completeOne(state.combos.one, o);
      return K.completeTwo(state.combos.twoA, state.combos.twoB, o);
    } catch (e) { return { results: [], warnings: [e.message] }; }
  }

  function comboHtml(c, i) {
    const cells = c.hexes.map((h, j) => `<div class="cb" style="background:${disp(h)};color:${textOn(h)}"><b>${esc(c.names[j])}</b><code>${h}</code>${c.fixed[j] ? '<small>Votre couleur</small>' : ''}</div>`).join('');
    const why = c.reasons.slice(0, 2).map((r) => `<div class="note ${r.tone === '+' ? 'conseil' : 'risque'}"><b class="tag">${r.tone === '+' ? 'Atout' : 'Attention'}</b>${esc(r.text)}</div>`).join('');
    return `<article class="combo" aria-label="Association ${i + 1} : ${esc(c.names.join(', '))}">
      <div class="cb-strip">${cells}</div>
      <div class="combo-body">
        <div class="combo-title"><strong>${esc(c.label)}</strong><span class="pill" title="Heuristique de stylisme, pas un verdict">Indice ${c.score}/100</span></div>
        <div class="notes">${why}</div>
        <div class="row wrap"><button type="button" data-act="outfit" data-i="${i}">→ Tenue</button><button type="button" data-act="copy" data-i="${i}">Copier les HEX</button></div>
      </div></article>`;
  }

  function renderComboCard(kind) {
    const r = computeCombo(kind);
    comboRes[kind] = r.results;
    const [list, warn] = COMBO_DOM[kind];
    $(list).innerHTML = r.results.length ? r.results.map(comboHtml).join('') : '<p class="small">Aucune association à proposer.</p>';
    if (warn) $(warn).innerHTML = r.warnings.map((w) => `<div class="note warn"><b class="tag">Attention</b>${esc(w)}</div>`).join('');
  }

  function syncComboPickers() {
    COMBO_PICKERS.forEach((p) => {
      const host = $(p.host), hex = state.combos[p.key], hx = $('.c-hex', host);
      $('.c-color', host).value = hex.toLowerCase();
      if (document.activeElement !== hx) { hx.value = hex; hx.classList.remove('invalid'); $('.c-err', host).textContent = ''; }
      $('.c-name', host).textContent = K.info(hex).name;
    });
  }

  function setCombo(key, hex) {
    state.combos[key] = CE.normalizeHex(hex); // lève une erreur si le code est invalide : l'état n'est alors pas modifié
    save(); syncComboPickers();
    const kind = COMBO_PICKERS.find((x) => x.key === key).kind;
    comboSeed[kind] = 0; // nouvelle couleur : on repart des meilleures propositions
    renderComboCard(kind);
  }

  function renderCombos() { syncComboPickers(); ['trio', 'one', 'two'].forEach(renderComboCard); }

  function initCombos() {
    COMBO_PICKERS.forEach((p) => {
      const host = $(p.host);
      host.innerHTML = `<div class="row wrap">
        <input type="color" class="c-color" aria-label="${esc(p.label)} — sélecteur de couleur">
        <label class="field">${esc(p.label)} (HEX)<input type="text" class="c-hex" maxlength="7" size="8" spellcheck="false" autocomplete="off"></label>
        <label class="field">ou dans la bibliothèque<select class="c-lib" aria-label="${esc(p.label)} — choisir dans la bibliothèque"><option value="">Choisir…</option>${D.LIBRARY.map((c) => `<option value="${c.hex}">${esc(c.name)}</option>`).join('')}</select></label>
        <button type="button" class="c-circle">Couleur du cercle</button>
      </div>
      <p class="small c-name" aria-live="polite"></p>
      <p class="error c-err" role="alert"></p>`;
      host.addEventListener('input', (e) => { if (e.target.classList.contains('c-color')) setCombo(p.key, e.target.value); });
      host.addEventListener('change', (e) => {
        const t = e.target;
        if (t.classList.contains('c-hex')) {
          try { setCombo(p.key, t.value); }
          catch (err) { $('.c-err', host).textContent = err.message; t.classList.add('invalid'); }
        } else if (t.classList.contains('c-lib') && t.value) { setCombo(p.key, t.value); t.value = ''; }
      });
      host.addEventListener('click', (e) => { if (e.target.closest('.c-circle')) setCombo(p.key, state.base); });
    });
    [['#trioMore', 'trio'], ['#oneMore', 'one'], ['#twoMore', 'two']].forEach(([btn, kind]) => {
      $(btn).addEventListener('click', () => { comboSeed[kind] = randSeed(); renderComboCard(kind); });
    });
    Object.keys(COMBO_DOM).forEach((kind) => {
      $(COMBO_DOM[kind][0]).addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]'); if (!b) return;
        const c = comboRes[kind][+b.dataset.i]; if (!c) return;
        if (b.dataset.act === 'copy') copyText(c.hexes.join(', '));
        else {
          state.outfit.pieces = O.generateOutfit(c.ordered, state.outfit.level);
          syncSlots(); save(); switchTab('outfit'); toast('Tenue générée à partir de l\'association', 'ok');
        }
      });
    });
  }

  /* ---------------- Exemple moutarde / marine / rouge ---------------- */

  const EX = { mustard: '#C49A24', navy: '#203A5B', brick: '#A83232' };
  const mk = (slot, type, hex, role) => ({ slot, type, hex, role });
  const EX_VERSIONS = [
    { id: 'classic', title: 'Version classique', sub: 'Marine dominant, moutarde en secondaire, rouge en détail',
      pieces: [mk('haut', 'Chemise', EX.mustard, 'secondary'), mk('couche', 'Veste', EX.navy, 'dominant'), mk('bas', 'Pantalon habillé', EX.navy, 'dominant'), mk('chaussures', 'Chaussures en cuir', '#4A3126', 'neutral'), mk('accessoire', 'Écharpe', EX.brick, 'accent')],
      why: 'Le marine occupe la veste et le pantalon (la plus grande surface), la chemise moutarde apporte le secondaire et le rouge reste cantonné à une écharpe. Chaussures en cuir brun : un neutre chaud qui fait le lien avec la moutarde.',
      alt: 'Moutarde → ocre, camel ou jaune pâle. Rouge brique → bordeaux ou terracotta. Marine → gris anthracite ou vert forêt. Version plus sobre : écharpe bordeaux, chemise écrue.' },
    { id: 'casual', title: 'Version casual', sub: 'Jean bleu, haut moutarde, chaussures neutres',
      pieces: [mk('haut', 'Pull', EX.mustard, 'dominant'), mk('couche', 'Aucune', '#EDE3CF', 'neutral'), mk('bas', 'Jean', '#3F5F8A', 'neutral'), mk('chaussures', 'Sneakers', '#EDE3CF', 'neutral'), mk('accessoire', 'Casquette', EX.brick, 'accent')],
      why: 'Le denim joue le rôle du bleu (il remplace le marine) et reste un neutre ; le pull moutarde est la seule grande surface colorée ; le rouge se limite à une casquette. Les sneakers écrues allègent l\'ensemble.',
      alt: 'Pull moutarde → ocre ou sauge. Casquette rouge → bordeaux ou marine. Sneakers → blanc cassé ou gris clair. Jean → denim brut plus foncé pour un rendu plus habillé.' },
    { id: 'bold', title: 'Version audacieuse', sub: 'Trois couleurs bien visibles',
      pieces: [mk('haut', 'Pull', EX.mustard, 'dominant'), mk('couche', 'Aucune', '#F4F1EA', 'neutral'), mk('bas', 'Pantalon chino', EX.navy, 'secondary'), mk('chaussures', 'Bottes', EX.brick, 'accent'), mk('accessoire', 'Ceinture', '#4A3126', 'neutral')],
      why: 'Les trois couleurs sont visibles mais chacune occupe une zone distincte (haut / bas / pieds) et le marine, plus calme, forme le bloc de repos. Pour éviter la surcharge : pas de quatrième couleur, ceinture et montre neutres, rouge limité aux chaussures, une seule couleur vive en grande surface.',
      alt: 'Rouge brique des bottes → cognac ou bordeaux pour adoucir. Pull moutarde → ocre. Pantalon marine → gris anthracite. Retirer le rouge ne laisse qu\'une paire moutarde/marine, plus simple.' },
  ];

  function renderExample() {
    const ds = [EX.mustard, EX.navy, EX.brick].map((h) => CE.describe(h));
    const names = ['Jaune moutarde', 'Bleu marine', 'Rouge brique'];
    const hues = ds.map((d) => d.hsl.h);
    const cls = H.classifyThree(hues);
    const dist = (i, j) => H.hueDistance(hues[i], hues[j]);
    const rows = ds.map((d, i) => `<tr><td><span class="dot" style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${disp(d.hex)};border:1px solid var(--border);vertical-align:-2px"></span> ${names[i]}</td><td>${d.hex}</td><td>${fmt(d.hsl.h, 2)}°</td><td>${fmt(d.hsl.s)} %</td><td>${fmt(d.hsl.l)} %</td><td>${fmt(d.lab.L)}</td><td>${fmt(d.lch.C)}</td></tr>`).join('');
    const de = (i, j) => fmt(CE.deltaE2000(ds[i].lab, ds[j].lab));
    const sorted = cls.gapsSorted.map((v) => fmt(v, 1) + '°').join(' / ');
    const split = cls.fits.find((f) => f.id === 'split');
    $('#exampleRoot').innerHTML = `<div class="card"><h2>Analyse : moutarde, marine et rouge brique</h2>
      <div class="tablewrap"><table><thead><tr><th>Couleur</th><th>HEX</th><th>Teinte HSL</th><th>S</th><th>L</th><th>L*</th><th>C*</th></tr></thead><tbody>${rows}</tbody></table></div>
      <h3>Est-ce une triade équilatérale ?</h3>
      <p><strong>${cls.isStrictTriad ? 'Oui' : 'Non.'}</strong> Les écarts réels de teinte HSL sont : moutarde–marine <strong>${fmt(dist(0, 1), 1)}°</strong>, marine–rouge <strong>${fmt(dist(1, 2), 1)}°</strong>, rouge–moutarde <strong>${fmt(dist(2, 0), 1)}°</strong> (écarts successifs triés : ${sorted}). Une triade mathématique stricte exigerait 120° / 120° / 120° ; ici l'écart maximal à ce modèle est de <strong>${fmt(cls.triadDeviation, 1)}°</strong>.</p>
      <p>Le moutarde (${fmt(hues[0], 1)}°) et le rouge brique (${fmt(hues[2], 1)}°) sont deux teintes <em>chaudes voisines</em> (analogues), tandis que le marine (${fmt(hues[1], 1)}°) se trouve presque en face d'elles : il est à ${fmt(dist(0, 1), 1)}° du moutarde, soit ${fmt(Math.abs(180 - dist(0, 1)), 1)}° de l'opposition exacte. La structure la plus proche est celle des <strong>${split.name.toLowerCase().split(' (')[0]}</strong> (écart au modèle : ${fmt(split.maxDeviation, 1)}°), centrées sur le marine — et non une triade. On peut donc parler d'une association <em>inspirée</em> d'une triade ou d'un contraste « une teinte froide face à deux chaudes voisines », sans la qualifier de triade.</p>
      <h3>Mesures perceptuelles (CIEDE2000, distinctes des angles)</h3>
      <p>ΔE00 : moutarde–marine <strong>${de(0, 1)}</strong>, marine–rouge <strong>${de(1, 2)}</strong>, rouge–moutarde <strong>${de(2, 0)}</strong>. Le marine est nettement plus foncé (L* ${fmt(ds[1].lab.L, 0)}) que les deux autres (L* ${fmt(ds[0].lab.L, 0)} et ${fmt(ds[2].lab.L, 0)}) : en pratique, le contraste de clarté structure l'ensemble plus que l'angle de teinte.</p>
      <div class="row wrap"><button type="button" id="exWheel" class="primary">Voir dans le cercle (accord personnalisé)</button></div>
      <p class="hint">Valeurs HEX indicatives d'écran : le rendu d'un tissu varie selon la matière et l'éclairage.</p></div>
      <div class="example-grid" style="margin-top:1.2rem">${EX_VERSIONS.map((v) => {
        const a = O.analyzeOutfit(v.pieces, { target: state.outfit.ratio });
        const act = a.proportions.actual;
        return `<div class="card"><h2>${v.title}</h2><p class="hint">${esc(v.sub)}</p>
          <div class="strip" role="img" aria-label="${v.pieces.filter(O.isActive).map((p) => p.hex).join(', ')}" style="margin-bottom:.6rem">${v.pieces.filter(O.isActive).map((p) => `<span style="background:${disp(p.hex)}"></span>`).join('')}</div>
          <ul>${v.pieces.filter(O.isActive).map((p) => `<li>${swatchHtml(p.hex)} <strong>${esc(O.slotInfo(p.slot).label)}</strong> : ${esc(p.type)} ${p.hex} <span class="badge">${O.ROLES[p.role]}</span></li>`).join('')}</ul>
          <h3>Logique des proportions</h3><p>${esc(v.why)}</p>
          <p class="small">Répartition estimée (surfaces non neutres) : ${Math.round(act.dominant)} / ${Math.round(act.secondary)} / ${Math.round(act.accent)} — contraste ${a.contrastLevel}, ${a.strongCount} couleur(s) vive(s), facilité ${a.ease.score}/100.</p>
          <h3>Alternatives</h3><p>${esc(v.alt)}</p>
          <div class="row wrap"><button type="button" data-ex="${v.id}" class="primary">Charger dans l'analyse</button></div></div>`;
      }).join('')}</div>`;
    $('#exWheel').addEventListener('click', () => {
      setBase(EX.navy); state.method = 'custom';
      state.customOffsets = [0, H.signedAngle(hues[1], hues[0]), H.signedAngle(hues[1], hues[2])].map(mod360);
      refresh(); switchTab('harmonies'); toast('Les trois couleurs sont placées sur le cercle (base : marine)', 'ok');
    });
    $$('#exampleRoot button[data-ex]').forEach((b) => b.addEventListener('click', () => {
      const v = EX_VERSIONS.find((x) => x.id === b.dataset.ex);
      state.outfit.pieces = JSON.parse(JSON.stringify(v.pieces)); save(); switchTab('outfit'); syncSlots(); renderOutfit(); toast(v.title + ' chargée', 'ok');
    }));
  }

  /* ---------------- Palettes : favoris, historique, comparaison ---------------- */

  function listHtml(arr, kind) {
    if (!arr.length) return '<p class="small">Rien pour le moment.</p>';
    return arr.map((s) => `<div class="list-item">
      <div class="row wrap"><label class="check" style="margin:0"><input type="checkbox" data-cmp="${kind}:${s.id}" aria-label="Comparer ${esc(s.name)}"></label>
        ${kind === 'fav' ? `<input type="text" data-rename="${s.id}" value="${esc(s.name)}" aria-label="Nom de la palette">` : `<strong>${esc(s.name)}</strong>`}</div>
      <div class="strip" role="img" aria-label="${s.hexes.join(', ')}">${s.hexes.map((h) => `<span style="background:${disp(h)}" title="${h}"></span>`).join('')}</div>
      <div class="small">${esc(METHOD_NAMES[s.method] || s.method)} · ${new Date(s.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</div>
      <div class="row wrap"><button type="button" data-l="load" data-k="${kind}" data-id="${s.id}">Charger</button>
        <button type="button" data-l="json" data-k="${kind}" data-id="${s.id}">JSON</button><button type="button" data-l="csv" data-k="${kind}" data-id="${s.id}">CSV</button>
        <button type="button" data-l="print" data-k="${kind}" data-id="${s.id}">Fiche</button>
        ${kind === 'hist' ? `<button type="button" data-l="fav" data-k="${kind}" data-id="${s.id}">★ Garder</button>` : `<button type="button" class="danger" data-l="del" data-k="${kind}" data-id="${s.id}">Supprimer</button>`}</div></div>`).join('');
  }
  function renderLists() {
    $('#favList').innerHTML = listHtml(state.favorites, 'fav');
    $('#histList').innerHTML = listHtml(state.history, 'hist');
  }
  const findEntry = (k, id) => (k === 'fav' ? state.favorites : state.history).find((x) => x.id === id);
  function compare() {
    const picks = $$('input[data-cmp]:checked').map((c) => { const [k, id] = c.dataset.cmp.split(':'); return findEntry(k, id); }).filter(Boolean);
    if (picks.length < 2 || picks.length > 3) { toast('Sélectionnez 2 ou 3 palettes à comparer', 'err'); return; }
    const stats = picks.map((s) => {
      const ds = s.hexes.map((h) => CE.describe(h));
      let sum = 0, n = 0;
      for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) { sum += CE.deltaE2000(ds[i].lab, ds[j].lab); n++; }
      const Ls = ds.map((d) => d.lab.L);
      const temps = s.hexes.map((h) => H.temperature(h));
      return { s, count: ds.length, mean: n ? sum / n : 0, lr: Math.max(...Ls) - Math.min(...Ls), C: ds.reduce((a, d) => a + d.lch.C, 0) / ds.length,
        warm: temps.filter((t) => t === 'chaud').length, cool: temps.filter((t) => t === 'froid').length, neutral: temps.filter((t) => t === 'neutre').length };
    });
    $('#compareBox').innerHTML = `<div class="tablewrap"><table><thead><tr><th>Palette</th><th>Couleurs</th><th>ΔE00 moyen entre couleurs</th><th>Amplitude L*</th><th>Chroma C* moyen</th><th>Chaud / froid / neutre</th></tr></thead><tbody>${stats.map((x) =>
      `<tr><td>${esc(x.s.name)}<div class="strip">${x.s.hexes.map((h) => `<span style="background:${disp(h)}"></span>`).join('')}</div></td><td>${x.count}</td><td>${fmt(x.mean)}</td><td>${fmt(x.lr, 0)}</td><td>${fmt(x.C, 0)}</td><td>${x.warm} / ${x.cool} / ${x.neutral}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Chiffres calculés en CIELAB/CIEDE2000 ; leur lecture stylistique reste une affaire de goût.</p>`;
  }
  function initLists() {
    const onClick = (e) => {
      const b = e.target.closest('button[data-l]'); if (!b) return;
      const s = findEntry(b.dataset.k, b.dataset.id); if (!s) return;
      const a = b.dataset.l;
      if (a === 'load') restoreSnapshot(s);
      else if (a === 'json') download(fileName('palette', 'json'), 'application/json', JSON.stringify(record(s), null, 2));
      else if (a === 'csv') download(fileName('palette', 'csv'), 'text/csv', toCsv([record(s)]));
      else if (a === 'print') printSheet(s);
      else if (a === 'del') { state.favorites = state.favorites.filter((x) => x.id !== s.id); save(); renderLists(); renderFavBtn(); }
      else if (a === 'fav') { if (!state.favorites.some((f) => keyOf(f) === keyOf(s))) { state.favorites.unshift(Object.assign({}, s, { id: Date.now().toString(36) })); save(); renderLists(); renderFavBtn(); toast('Ajouté aux favoris', 'ok'); } else toast('Déjà dans les favoris'); }
    };
    $('#favList').addEventListener('click', onClick); $('#histList').addEventListener('click', onClick);
    $('#favList').addEventListener('change', (e) => {
      if (!e.target.matches('input[data-rename]')) return;
      const s = state.favorites.find((x) => x.id === e.target.dataset.rename); if (s) { s.name = e.target.value.trim() || s.name; save(); }
    });
    $('#compareBtn').addEventListener('click', compare);
    const confirmClear = (what, fn) => { if (window.confirm('Effacer ' + what + ' ?')) { fn(); save(); renderLists(); renderFavBtn(); } };
    $('#clearFav').addEventListener('click', () => confirmClear('tous les favoris', () => { state.favorites = []; }));
    $('#clearHist').addEventListener('click', () => confirmClear('tout l\'historique', () => { state.history = []; }));
    $('#expAllJson').addEventListener('click', () => state.favorites.length ? download(fileName('favoris', 'json'), 'application/json', JSON.stringify(state.favorites.map(record), null, 2)) : toast('Aucun favori à exporter', 'err'));
    $('#expAllCsv').addEventListener('click', () => state.favorites.length ? download(fileName('favoris', 'csv'), 'text/csv', toCsv(state.favorites.map(record))) : toast('Aucun favori à exporter', 'err'));
  }

  /* ---------------- Thème, daltonisme, réinitialisation ---------------- */

  function applyTheme() {
    const dark = state.theme ? state.theme === 'dark' : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const b = $('#themeBtn'); b.setAttribute('aria-pressed', dark); b.textContent = dark ? 'Mode clair' : 'Mode sombre';
  }
  function initGlobal() {
    $('#themeBtn').addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      state.theme = dark ? 'light' : 'dark'; applyTheme(); save();
    });
    $('#cvdSelect').value = state.cvd;
    $('#cvdHelp').hidden = state.cvd === 'none';
    $('#cvdSelect').addEventListener('change', (e) => {
      state.cvd = e.target.value; $('#cvdHelp').hidden = state.cvd === 'none';
      buildWheel(); renderAll(); renderLibrary(); renderLists(); if (!$('#tab-example').hidden) renderExample(); if (!$('#tab-combos').hidden) renderCombos(); save();
    });
    $('#resetBtn').addEventListener('click', () => {
      if (!window.confirm('Réinitialiser la couleur, la méthode, les réglages et la tenue ? Les favoris et l\'historique sont conservés.')) return;
      const keep = { favorites: state.favorites, history: state.history, theme: state.theme, cvd: state.cvd, variants: state.variants };
      state = Object.assign(defaults(), keep);
      showBaseError('');
      compute(); state.outfit.pieces = O.generateOutfit(cur.finals, state.outfit.level);
      $('#levelSel').value = state.outfit.level; $('#ratioSel').value = state.outfit.ratio.join(',');
      syncSlots(); refresh({ commit: false }); toast('Réinitialisé', 'ok');
    });
  }

  /* ---------------- Démarrage ---------------- */

  function init() {
    load();
    applyTheme();
    try { compute(); } catch (e) { state = defaults(); compute(); }
    if (!Array.isArray(state.outfit.pieces) || state.outfit.pieces.length !== O.SLOTS.length) state.outfit.pieces = O.generateOutfit(cur.finals, state.outfit.level);
    initTabs(); initGlobal(); initInputs(); initLibrary(); initImage(); initOutfit(); initCombos(); initLists(); initWheel();
    buildWheel(); syncSlots(); renderAll(); renderLists(); renderVariants();
    save();
  }
  init();
  window.Chromatique = { get state() { return state; }, get current() { return cur; }, switchTab };
})();
