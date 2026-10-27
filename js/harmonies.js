/* ============================================================
   harmonies.js — Les 13 méthodes d'harmonie + outils angulaires
   Rappel : les offsets angulaires sont des relations GÉOMÉTRIQUES sur
   la roue HSL. Elles ne garantissent aucun résultat esthétique.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./color-engine.js'));
  else root.Harmonies = factory(root.ColorEngine);
})(typeof self !== 'undefined' ? self : this, function (CE) {
  'use strict';

  const { clamp, mod360, round, ColorError } = CE;

  /* ---------- Outils angulaires ---------- */

  function hueDistance(a, b) {
    const d = Math.abs(mod360(a) - mod360(b));
    return d > 180 ? 360 - d : d;
  }
  // Angle signé de `from` vers `to`, dans ]-180, 180]
  function signedAngle(from, to) {
    const d = mod360(to - from);
    return d > 180 ? d - 360 : d;
  }
  function circularGaps(hues) {
    const s = hues.map(mod360).sort((a, b) => a - b);
    return s.map((h, i) => (i < s.length - 1 ? s[i + 1] - h : s[0] + 360 - h));
  }

  /* ---------- Température (heuristique de teinte, pas une mesure physique) ---------- */

  function temperature(hex) {
    const d = CE.describe(hex);
    if (!d.hueReliable) return 'neutre';
    const h = d.hsl.h;
    if (h <= 75 || h >= 330) return 'chaud';
    if (h >= 150 && h <= 270) return 'froid';
    return 'tempéré';
  }

  /* ---------- Neutres de référence ---------- */

  const NEUTRALS = [
    { name: 'Blanc cassé', hex: '#F4F1EA', undertone: 'chaud' },
    { name: 'Écru', hex: '#EDE3CF', undertone: 'chaud' },
    { name: 'Beige', hex: '#D6BF9C', undertone: 'chaud' },
    { name: 'Camel', hex: '#B5875A', undertone: 'chaud' },
    { name: 'Taupe', hex: '#8B7B6E', undertone: 'chaud' },
    { name: 'Brun chocolat', hex: '#4A3126', undertone: 'chaud' },
    { name: 'Gris clair', hex: '#C8CACC', undertone: 'froid' },
    { name: 'Gris anthracite', hex: '#3C4043', undertone: 'froid' },
    { name: 'Denim', hex: '#3F5F8A', undertone: 'froid' },
    { name: 'Bleu marine', hex: '#203A5B', undertone: 'froid' },
    { name: 'Noir', hex: '#121212', undertone: 'neutre' },
  ];
  const neutralByName = (n) => NEUTRALS.find((x) => x.name === n);

  function nearestNeutral(hex) {
    const lab = CE.hexToLab(hex);
    let best = null;
    NEUTRALS.forEach((n) => {
      const d = CE.deltaE2000(lab, CE.hexToLab(n.hex));
      if (!best || d < best.deltaE) best = { neutral: n, deltaE: d };
    });
    return best;
  }

  /* ---------- Définition des méthodes ---------- */

  const DEFS = {
    monochromatic: { name: 'Monochromatique', kind: 'derived' },
    analogous: {
      name: 'Analogues', kind: 'angles', editable: 'spread', spread: { def: 30, min: 10, max: 60 },
      baseIndex: 1, offsets: (s) => [-s, 0, s], spreadFromOffset: (i, off) => Math.abs(off),
    },
    complementary: { name: 'Complémentaires', kind: 'angles', editable: null, baseIndex: 0, offsets: () => [0, 180] },
    split: {
      name: 'Complémentaires divisées', kind: 'angles', editable: 'spread', spread: { def: 30, min: 10, max: 60 },
      baseIndex: 0, offsets: (s) => [0, 180 - s, 180 + s], spreadFromOffset: (i, off) => 180 - Math.abs(off),
    },
    triad: { name: 'Triade équilatérale', kind: 'angles', editable: null, baseIndex: 0, offsets: () => [0, 120, 240] },
    double: {
      name: 'Double complémentaire (tétrade)', kind: 'angles', editable: 'spread', spread: { def: 30, min: 10, max: 45 },
      baseIndex: 0, offsets: (s) => [0, s, 180, 180 + s],
      spreadFromOffset: (i, off) => (i === 1 ? mod360(off) : mod360(off - 180)),
    },
    rectangle: {
      name: 'Harmonie rectangulaire', kind: 'angles', editable: 'spread', spread: { def: 60, min: 45, max: 80 },
      baseIndex: 0, offsets: (s) => [0, s, 180, 180 + s],
      spreadFromOffset: (i, off) => (i === 1 ? mod360(off) : mod360(off - 180)),
    },
    custom: { name: 'Accord personnalisé', kind: 'angles', editable: 'custom', baseIndex: 0 },
    neutral: { name: 'Associations neutres', kind: 'derived' },
    tonal: { name: 'Harmonie tonale', kind: 'derived' },
    temperature: { name: 'Contraste de température', kind: 'derived' },
    lightness: { name: 'Contraste de luminosité', kind: 'derived' },
    saturation: { name: 'Contraste de saturation', kind: 'derived' },
  };
  const HARMONY_IDS = Object.keys(DEFS);

  /* ---------- Fabrication de couleurs ---------- */

  // Cherche la luminosité HSL qui donne la clarté perceptuelle L* visée (dichotomie).
  function matchLstar(h, s, targetL) {
    let lo = 0, hi = 100;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2;
      const L = CE.rgbToLab(CE.hslToRgb({ h, s, l: mid })).L;
      if (L < targetL) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function hslColor(h, s, l, label, equalizeTo) {
    h = mod360(h); s = clamp(s, 0, 100);
    let ll = clamp(l, 0, 100);
    if (typeof equalizeTo === 'number') ll = matchLstar(h, s, equalizeTo);
    const hex = CE.hslToHex({ h, s, l: ll });
    return Object.assign(CE.describe(hex), { label });
  }
  const fromHex = (hex, label) => Object.assign(CE.describe(hex), { label });

  function sanitizeOffsets(list) {
    if (!Array.isArray(list) || list.length < 2) throw new ColorError('Un accord personnalisé demande au moins 2 couleurs.');
    if (list.length > 8) throw new ColorError('Un accord personnalisé est limité à 8 couleurs.');
    const out = list.map((v, i) => {
      if (i === 0) return 0; // la couleur de base reste le repère de l'accord
      const n = Number(v);
      if (v === '' || v === null || !Number.isFinite(n)) throw new ColorError('Angle personnalisé invalide (nombre attendu).');
      return mod360(n);
    });
    return out;
  }

  /* ---------- Génération ---------- */

  function generate(id, baseHex, params) {
    const def = DEFS[id];
    if (!def) throw new ColorError('Méthode d\'harmonie inconnue : ' + id);
    const base = CE.describe(baseHex);
    const p = Object.assign({ spread: def.spread ? def.spread.def : 0, equalize: false, customOffsets: [0, 90, 180] }, params || {});
    const warnings = [];
    if (!base.hueReliable) {
      warnings.push('La couleur de base est (quasi) achromatique : sa teinte HSL n\'est pas significative. Les relations angulaires ne produiront pas de vraies teintes différentes ; privilégiez les méthodes neutres, de luminosité ou de saturation.');
    }
    const bHue = base.hsl.h, bS = base.hsl.s, bL = base.hsl.l;
    const eq = p.equalize ? base.lab.L : undefined;
    let colors = [], offsets = [], baseIndex = 0, spread = p.spread;

    if (def.kind === 'angles') {
      if (def.spread) spread = clamp(Number(p.spread), def.spread.min, def.spread.max);
      offsets = id === 'custom' ? sanitizeOffsets(p.customOffsets) : def.offsets(spread);
      baseIndex = def.baseIndex;
      colors = offsets.map((o, i) => {
        if (i === baseIndex) return fromHex(base.hex, 'Base');
        const sign = o > 0 ? '+' : '';
        const shown = o > 180 ? o - 360 : o;
        return hslColor(bHue + o, bS, bL, `${shown > 0 ? '+' : sign}${round(shown, 1)}°`, eq);
      });
    } else if (id === 'monochromatic') {
      baseIndex = 2;
      const ls = [bL - 30, bL - 15, bL, bL + 15, bL + 28].map((v) => clamp(v, 8, 94));
      const ss = [bS, bS, bS, bS * 0.85, bS * 0.7];
      const names = ['Très foncé', 'Foncé', 'Base', 'Clair', 'Très clair'];
      colors = ls.map((l, i) => (i === 2 ? fromHex(base.hex, names[i]) : hslColor(bHue, ss[i], l, names[i])));
    } else if (id === 'neutral') {
      const t = temperature(base.hex);
      const pick = t === 'chaud' ? ['Écru', 'Beige', 'Camel', 'Brun chocolat', 'Bleu marine']
        : t === 'neutre' ? ['Blanc cassé', 'Denim', 'Bleu marine', 'Brun chocolat', 'Noir']
          : ['Blanc cassé', 'Gris clair', 'Denim', 'Bleu marine', 'Gris anthracite'];
      colors = [fromHex(base.hex, 'Base')].concat(pick.map((n) => fromHex(neutralByName(n).hex, n)));
      baseIndex = 0;
    } else if (id === 'tonal') {
      baseIndex = 0;
      const target = base.lab.L;
      colors = [fromHex(base.hex, 'Base')].concat([50, 130, 200, 280].map((o) => hslColor(bHue + o, bS, bL, '+' + o + '° (L* égalisé)', target)));
    } else if (id === 'temperature') {
      baseIndex = 0;
      const t = temperature(base.hex);
      const opposite = t === 'chaud' ? [200, 228] : [22, 46];
      const neighborShift = t === 'chaud' || t === 'froid' ? 22 : 0;
      const s0 = base.hueReliable ? bS : 45;
      const h0 = base.hueReliable ? bHue : 30;
      colors = [
        fromHex(base.hex, 'Base (' + t + ')'),
        hslColor(h0 + neighborShift, s0, bL, 'Voisine même température'),
        hslColor(opposite[0], s0 * 0.85, bL, 'Température opposée'),
        hslColor(opposite[1], s0 * 0.9, bL - 14, 'Opposée, plus foncée'),
      ];
      if (t === 'tempéré') warnings.push('La teinte de base est « tempérée » (vert, violet…) : le contraste chaud/froid est moins net.');
    } else if (id === 'lightness') {
      baseIndex = 1;
      colors = [
        hslColor(bHue, bS * 0.9, 20, 'Foncé'),
        fromHex(base.hex, 'Base (moyen)'),
        hslColor(bHue + 20, bS * 0.7, 86, 'Clair'),
        hslColor(bHue + 180, bS * 0.5, 26, 'Foncé complémentaire'),
      ];
    } else if (id === 'saturation') {
      baseIndex = 0;
      let intense;
      if (bS >= 60) intense = fromHex(base.hex, 'Intense (base)');
      else {
        intense = hslColor(bHue, 75, clamp(bL, 35, 60), 'Intense (base intensifiée)');
        warnings.push('La base est peu saturée : une version plus intense a été utilisée comme couleur forte.');
      }
      colors = [
        intense,
        hslColor(bHue + 30, 22, clamp(bL + 20, 20, 85), 'Sourde voisine'),
        hslColor(bHue + 180, 16, clamp(bL - 10, 15, 80), 'Sourde complémentaire'),
        hslColor(bHue - 30, 28, clamp(bL + 10, 20, 85), 'Sourde analogue'),
        hslColor(bHue, 10, clamp(bL + 35, 25, 92), 'Greige'),
      ];
    }

    if (def.kind === 'derived') {
      offsets = colors.map((c) => (c.hueReliable && base.hueReliable ? signedAngle(bHue, c.hsl.h) : 0));
    }
    return { id, name: def.name, base, colors, offsets, baseIndex, spread, editable: def.editable || null, warnings };
  }

  /* ---------- Classification d'un triplet de teintes (honnête, avec écarts) ---------- */

  function classifyThree(hues, strictTolerance) {
    const tol = typeof strictTolerance === 'number' ? strictTolerance : 1;
    if (!Array.isArray(hues) || hues.length !== 3) throw new ColorError('Trois teintes sont nécessaires.');
    const gaps = circularGaps(hues);
    const g = gaps.slice().sort((a, b) => a - b);
    const triadDev = Math.max(...g.map((v) => Math.abs(v - 120)));
    // Complémentaires divisées généralisées : gaps = [2s, 180-s, 180-s]
    const s = g[0] / 2;
    const splitDev = Math.max(Math.abs(g[1] - (180 - s)), Math.abs(g[2] - (180 - s)));
    // Analogues généralisées : gaps = [s, s, 360-2s]
    const a = (g[0] + g[1]) / 2;
    const analogDev = Math.max(Math.abs(g[0] - a), Math.abs(g[1] - a), Math.abs(g[2] - (360 - 2 * a)));
    const fits = [
      { id: 'triad', name: 'Triade équilatérale (120° / 120° / 120°)', maxDeviation: triadDev },
      { id: 'split', name: 'Complémentaires divisées (une teinte + deux voisines de sa complémentaire)', maxDeviation: splitDev },
      { id: 'analogous', name: 'Analogues (trois teintes voisines)', maxDeviation: analogDev },
    ].sort((x, y) => x.maxDeviation - y.maxDeviation);
    return { gaps, gapsSorted: g, fits, best: fits[0], isStrictTriad: triadDev <= tol, triadDeviation: triadDev };
  }

  function classifyTwo(hueA, hueB, tol) {
    const t = typeof tol === 'number' ? tol : 1;
    const d = hueDistance(hueA, hueB);
    return { distance: d, isComplementary: Math.abs(d - 180) <= t, deviationFromComplement: Math.abs(d - 180) };
  }

  /* ---------- Réglages globaux (contraste / luminosité / saturation) ---------- */

  // contrast, lightness, saturation : pourcentages (-100 à 100). Travail en CIELCh.
  function adjustPalette(hexes, adj) {
    const a = Object.assign({ contrast: 0, lightness: 0, saturation: 0 }, adj || {});
    if (!a.contrast && !a.lightness && !a.saturation) return hexes.slice();
    return hexes.map((hex) => {
      const lch = CE.labToLch(CE.hexToLab(hex));
      const L = clamp(50 + (lch.L - 50) * (1 + a.contrast / 100) + a.lightness * 0.4, 0, 100);
      const C = Math.max(0, lch.C * (1 + a.saturation / 100));
      return CE.rgbToHex(CE.labToRgb(CE.lchToLab({ L, C, h: lch.h })));
    });
  }

  function randomBase(rng) {
    const r = typeof rng === 'function' ? rng : Math.random;
    return CE.hslToHex({ h: Math.floor(r() * 360), s: 40 + r() * 40, l: 32 + r() * 28 });
  }

  return {
    DEFS, HARMONY_IDS, NEUTRALS, hueDistance, signedAngle, circularGaps, temperature, nearestNeutral,
    matchLstar, generate, classifyThree, classifyTwo, adjustPalette, randomBase, sanitizeOffsets,
  };
});
