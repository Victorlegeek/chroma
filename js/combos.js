/* ============================================================
   combos.js — Associations de couleurs pour s'habiller
   Propose des trios de couleurs pris dans la bibliothèque de couleurs
   vestimentaires (js/data.js) :
     - suggestTrios : trois couleurs qui vont ensemble, sans contrainte ;
     - completeOne  : une couleur imposée, le module propose les deux autres ;
     - completeTwo  : deux couleurs imposées, le module propose la troisième.
   Séparation stricte : les MESURES (ΔE2000, L*, chroma, angles HSL) sont
   calculées ; l'« indice de compatibilité » est une HEURISTIQUE de stylisme,
   jamais un verdict esthétique.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./color-engine.js'), require('./harmonies.js'), require('./outfit.js'), require('./data.js'));
  } else root.Combos = factory(root.ColorEngine, root.Harmonies, root.Outfit, root.ClothingData);
})(typeof self !== 'undefined' ? self : this, function (CE, H, O, D) {
  'use strict';

  const { clamp, round } = CE;

  const SAME_DE = 1.0;       // ΔE00 < 1 : couleurs identiques pour l'œil (mêmes seuils que outfit.js)
  const CLOSE_DE = 8;        // ΔE00 < 8 : très proches sans être identiques
  const DEFAULT_COUNT = 6;   // nombre d'alternatives proposées
  const JITTER = 8;          // amplitude (en points d'indice) du tirage quand une graine est fournie
  const STRONG_CHROMA = 40;  // C* CIELAB à partir duquel une couleur est jugée « vive » (heuristique)
  const NEUTRAL_CHROMA = 12; // en dessous : couleur quasi achromatique
  const NEUTRAL_NEAR_DE = 6; // ΔE00 maximal à un neutre de référence (marine, denim, camel…) pour compter comme neutre

  /* ---------- Fiches de couleur (mises en cache) ---------- */

  // Définition du neutre un peu plus stricte que celle de outfit.js (seuil de 10) : ici un bleu roi
  // ou un ocre franc ne doivent pas être traités comme des neutres.
  const isNeutralColor = (d, hex) => d.lch.C < NEUTRAL_CHROMA || H.nearestNeutral(hex).deltaE < NEUTRAL_NEAR_DE;

  function colorName(hex) {
    const n = D.nearestName(hex);
    if (n.deltaE < 6) return n.name;
    return n.deltaE < 25 ? 'proche de ' + n.name.toLowerCase() : 'Couleur personnalisée';
  }

  const infoCache = new Map();
  function info(hexIn, knownName) {
    const hex = CE.normalizeHex(hexIn);
    let i = infoCache.get(hex);
    if (!i) {
      const d = CE.describe(hex);
      const neutral = isNeutralColor(d, hex);
      i = { hex, d, name: knownName || colorName(hex), neutral, strong: d.lch.C >= STRONG_CHROMA && !neutral, temp: H.temperature(hex) };
      if (infoCache.size > 3000) infoCache.clear();
      infoCache.set(hex, i);
    }
    return i;
  }

  let POOL = null;
  function pool() {
    if (!POOL) POOL = D.LIBRARY.map((c) => Object.assign({ family: c.family }, info(c.hex, c.name)));
    return POOL;
  }

  const deMemo = new Map();
  function deltaE(a, b) {
    const key = a.hex < b.hex ? a.hex + b.hex : b.hex + a.hex;
    let v = deMemo.get(key);
    if (v === undefined) {
      v = CE.deltaE2000(a.d.lab, b.d.lab);
      if (deMemo.size > 30000) deMemo.clear();
      deMemo.set(key, v);
    }
    return v;
  }

  /* ---------- Indice de compatibilité (heuristique) ---------- */

  function hueFamilies(infos) {
    const hues = [];
    infos.filter((i) => !i.neutral && i.d.hueReliable).forEach((i) => {
      if (!hues.some((h) => H.hueDistance(h, i.d.hsl.h) < 15)) hues.push(i.d.hsl.h);
    });
    return hues;
  }

  const THREE_NAMES = { triad: 'Triade', split: 'Complémentaires divisées', analogous: 'Analogues' };
  const THREE_BONUS = { triad: 6, split: 14, analogous: 12 };

  function scoreInfos(infos) {
    let score = 60;
    const head = [];   // lecture de la structure de teintes
    const minus = [];  // points d'attention
    const plus = [];   // atouts
    const strong = infos.filter((i) => i.strong).length;
    const neutrals = infos.filter((i) => i.neutral).length;
    const chromatic = infos.length - neutrals;
    const Ls = infos.map((i) => i.d.lab.L);
    const lRange = Math.max(...Ls) - Math.min(...Ls);
    const pairs = [];
    for (let a = 0; a < infos.length; a++) {
      for (let b = a + 1; b < infos.length; b++) pairs.push({ a, b, de: deltaE(infos[a], infos[b]), dL: Math.abs(Ls[a] - Ls[b]) });
    }

    // Structure des teintes (angles HSL réels, neutres exclus)
    const hues = hueFamilies(infos);
    let label;
    if (hues.length === 0) {
      label = 'Tons neutres'; score += 6;
      head.push({ tone: '+', text: 'Uniquement des tons neutres : très facile à porter, le relief vient de la clarté et de la matière.' });
    } else if (hues.length === 1) {
      if (chromatic >= 2) {
        label = 'Camaïeu'; score += 12;
        head.push({ tone: '+', text: `Une seule famille de teinte (≈ ${round(hues[0], 0)}° sur la roue HSL) déclinée en nuances : camaïeu, harmonie très sûre.` });
      } else {
        label = 'Une couleur + neutres'; score += 12;
        head.push({ tone: '+', text: `Une seule couleur de teinte (≈ ${round(hues[0], 0)}°) soutenue par des neutres : un accent unique, facile à doser.` });
      }
    } else if (hues.length === 2) {
      const c = H.classifyTwo(hues[0], hues[1], 20);
      const d = round(c.distance, 0);
      if (c.isComplementary) {
        label = neutrals ? 'Complémentaires + neutre' : 'Complémentaires'; score += 14 - c.deviationFromComplement / 4;
        head.push({ tone: '+', text: `Deux teintes quasi complémentaires (écart HSL de ${d}°) : contraste de teinte fort.` });
      } else if (c.distance <= 45) {
        label = 'Analogues'; score += 10 - c.distance / 15;
        head.push({ tone: '+', text: `Deux teintes voisines (écart HSL de ${d}°) : harmonie analogue, transition douce.` });
      } else {
        label = 'Teintes intermédiaires'; score += 1;
        head.push({ tone: '-', text: `Deux teintes séparées de ${d}° : ni analogues ni complémentaires, l'harmonie est moins évidente.` });
      }
    } else if (hues.length === 3) {
      const c = H.classifyThree(hues);
      if (c.best.maxDeviation <= 25) {
        label = THREE_NAMES[c.best.id]; score += THREE_BONUS[c.best.id] - c.best.maxDeviation / 5;
        head.push({ tone: '+', text: `Trois teintes proches d'une structure « ${THREE_NAMES[c.best.id].toLowerCase()} » (écart au modèle : ${round(c.best.maxDeviation, 0)}°).` });
      } else {
        label = 'Sans structure nette'; score -= 8;
        head.push({ tone: '-', text: `Trois teintes sans structure géométrique nette (écart au plus proche modèle : ${round(c.best.maxDeviation, 0)}°).` });
      }
    }

    // Couleurs vives et neutres
    if (strong >= 3) { score -= 26; minus.push({ tone: '-', text: 'Trois couleurs vives en même temps : difficile à équilibrer au quotidien.' }); }
    else if (strong === 2 && !neutrals) { score -= 8; minus.push({ tone: '-', text: 'Deux couleurs vives sans neutre pour les séparer.' }); }
    if (neutrals && chromatic) { score += 8; plus.push({ tone: '+', text: 'Un neutre sépare et calme les couleurs.' }); }
    const warm = infos.filter((i) => !i.neutral && i.temp === 'chaud').length;
    const cool = infos.filter((i) => !i.neutral && i.temp === 'froid').length;
    if (warm && cool && strong >= 2 && !neutrals) { score -= 8; minus.push({ tone: '-', text: 'Sous-tons chauds et froids avec plusieurs couleurs vives et aucun neutre de transition.' }); }

    // Clarté
    if (lRange < 18) { score -= 10; minus.push({ tone: '-', text: `Clarté très voisine (écart de L* : ${round(lRange, 0)}) : l'ensemble peut paraître plat.` }); }
    else {
      score += Math.min(lRange, 60) / 10; // 0 à 6 points : plus les pièces se distinguent en clarté, mieux c'est
      if (lRange >= 40) plus.push({ tone: '+', text: `Bon écart de clarté (L* : ${round(lRange, 0)}) : les pièces se distinguent bien.` });
    }

    // Paires
    pairs.forEach((p) => {
      const nm = `${infos[p.a].name} et ${infos[p.b].name}`;
      if (p.de < SAME_DE) { score -= 40; minus.push({ tone: '-', text: `${nm} sont quasi identiques.` }); }
      else if (p.de < CLOSE_DE) { score -= 18; minus.push({ tone: '-', text: `${nm} sont très proches (ΔE00 ${round(p.de, 1)}) : risque d'assortiment raté.` }); }
      else if (p.de < 14 && p.dL < 10) { score -= 6; minus.push({ tone: '-', text: `${nm} sont proches en clarté et en teinte (ΔE00 ${round(p.de, 1)}).` }); }
      else if (p.de > 60 && infos[p.a].strong && infos[p.b].strong) { score -= 6; minus.push({ tone: '-', text: `${nm} sont très contrastées et toutes deux vives.` }); }
    });

    return { score: clamp(Math.round(score), 0, 100), label: label || 'Sans structure nette', reasons: head.concat(minus, plus), strong, neutrals };
  }

  // Évalue un trio de couleurs HEX (trois codes exigés)
  function scoreTrio(hexes) {
    if (!Array.isArray(hexes) || hexes.length !== 3) throw new CE.ColorError('Trois couleurs sont nécessaires.');
    const s = scoreInfos(hexes.map((h) => info(h)));
    return { score: s.score, label: s.label, reasons: s.reasons, strongCount: s.strong, neutralCount: s.neutrals };
  }

  /* ---------- Tirage et sélection diversifiée ---------- */

  // Générateur pseudo-aléatoire à graine (mulberry32). Graine 0 ou absente : aucun hasard.
  function rngFrom(seed) {
    if (!seed) return null;
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Choisit `count` candidats de bon indice, variés : pas plus de 2 par structure,
  // et pas de couleur libre répétée (ou quasi identique) d'une proposition à l'autre.
  function pickDiverse(cands, count, rng, maxShared) {
    const ranked = cands
      .map((c) => ({ c, k: c.score + (rng ? rng() * JITTER : 0) }))
      .sort((x, y) => y.k - x.k)
      .map((x) => x.c);
    const out = [];
    const perLabel = {};
    const shared = (a, b) => a.free.filter((x) => b.free.some((y) => x.hex === y.hex || deltaE(x, y) < CLOSE_DE)).length;
    const pass = (maxLabel, maxSh) => {
      for (const c of ranked) {
        if (out.length >= count) return;
        if (out.includes(c)) continue;
        if ((perLabel[c.label] || 0) >= maxLabel) continue;
        if (out.some((o) => shared(c, o) > maxSh)) continue;
        out.push(c); perLabel[c.label] = (perLabel[c.label] || 0) + 1;
      }
    };
    pass(2, maxShared); pass(3, maxShared); pass(count, maxShared); pass(count, maxShared + 1); pass(count, 99);
    return out.sort((a, b) => b.score - a.score);
  }

  // Ordre conseillé pour générer une tenue : couleurs franches d'abord, neutres ensuite.
  function outfitOrder(infos) {
    return infos.slice().sort((a, b) => (a.neutral - b.neutral) || (b.d.lch.C - a.d.lch.C)).map((i) => i.hex);
  }

  function format(c) {
    const infos = c.infos;
    return {
      hexes: infos.map((i) => i.hex),
      names: infos.map((i) => i.name),
      fixed: infos.map((i) => !!c.fixedHex && c.fixedHex.includes(i.hex)),
      score: c.score, label: c.label, reasons: c.reasons,
      ordered: outfitOrder(infos),
    };
  }

  const finish = (picked) => picked.map(format);

  /* ---------- Trois modes ---------- */

  let ALL_TRIOS = null;
  function allTrios() {
    if (ALL_TRIOS) return ALL_TRIOS;
    const P = pool();
    ALL_TRIOS = [];
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        if (deltaE(P[i], P[j]) < SAME_DE) continue;
        for (let k = j + 1; k < P.length; k++) {
          if (deltaE(P[i], P[k]) < SAME_DE || deltaE(P[j], P[k]) < SAME_DE) continue;
          const infos = [P[i], P[j], P[k]];
          const s = scoreInfos(infos);
          if (s.score < 60) continue; // on ne garde que les associations honorables
          ALL_TRIOS.push({ infos, free: infos, score: s.score, label: s.label, reasons: s.reasons });
        }
      }
    }
    return ALL_TRIOS;
  }

  // Trois couleurs qui vont ensemble, sans contrainte.
  function suggestTrios(opts) {
    const o = Object.assign({ count: DEFAULT_COUNT, seed: 0 }, opts || {});
    return { results: finish(pickDiverse(allTrios(), o.count, rngFrom(o.seed), 1)), warnings: [] };
  }

  // Une couleur imposée : propose deux autres couleurs.
  function completeOne(hexA, opts) {
    const o = Object.assign({ count: DEFAULT_COUNT, seed: 0 }, opts || {});
    const A = info(hexA);
    const P = pool().filter((p) => deltaE(A, p) >= SAME_DE);
    const cands = [];
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        if (deltaE(P[i], P[j]) < SAME_DE) continue;
        const infos = [A, P[i], P[j]];
        const s = scoreInfos(infos);
        cands.push({ infos, free: [P[i], P[j]], fixedHex: [A.hex], score: s.score, label: s.label, reasons: s.reasons });
      }
    }
    return { results: finish(pickDiverse(cands, o.count, rngFrom(o.seed), 0)), warnings: [] };
  }

  // Deux couleurs imposées : propose la troisième.
  function completeTwo(hexA, hexB, opts) {
    const o = Object.assign({ count: DEFAULT_COUNT, seed: 0 }, opts || {});
    const A = info(hexA), B = info(hexB);
    const warnings = [];
    const dAB = deltaE(A, B);
    if (dAB < SAME_DE) warnings.push('Les deux couleurs sont identiques ou quasi identiques : choisissez-en deux différentes pour obtenir de vraies associations.');
    else if (dAB < CLOSE_DE) warnings.push(`Vos deux couleurs sont très proches (ΔE00 ${round(dAB, 1)}) : la troisième peut servir à les différencier.`);
    const P = pool().filter((p) => deltaE(A, p) >= SAME_DE && deltaE(B, p) >= SAME_DE);
    const cands = P.map((p) => {
      const infos = [A, B, p];
      const s = scoreInfos(infos);
      return { infos, free: [p], fixedHex: [A.hex, B.hex], score: s.score, label: s.label, reasons: s.reasons };
    });
    return { results: finish(pickDiverse(cands, o.count, rngFrom(o.seed), 0)), warnings };
  }

  return { SAME_DE, CLOSE_DE, pool, info, scoreTrio, suggestTrios, completeOne, completeTwo };
});
