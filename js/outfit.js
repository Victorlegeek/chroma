/* ============================================================
   outfit.js — Génération et analyse de tenues
   Séparation stricte : les MESURES (ΔE2000, L*, chroma, ratio WCAG)
   sont calculées ; les CONSEILS sont des heuristiques de stylisme.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./color-engine.js'), require('./harmonies.js'));
  else root.Outfit = factory(root.ColorEngine, root.Harmonies);
})(typeof self !== 'undefined' ? self : this, function (CE, H) {
  'use strict';

  const { clamp, round } = CE;

  // weight = part de surface visible estimée (heuristique, sert à la répartition 60/30/10)
  const SLOTS = [
    { id: 'haut', label: 'Haut', weight: 35, types: ['T-shirt', 'Polo', 'Chemise', 'Pull', 'Sweat'] },
    { id: 'couche', label: 'Veste / manteau', weight: 25, types: ['Aucune', 'Veste', 'Manteau', 'Surchemise', 'Gilet'] },
    { id: 'bas', label: 'Bas', weight: 30, types: ['Jean', 'Pantalon chino', 'Pantalon habillé', 'Short'] },
    { id: 'chaussures', label: 'Chaussures', weight: 8, types: ['Sneakers', 'Chaussures en cuir', 'Bottes', 'Mocassins', 'Derbies'] },
    { id: 'accessoire', label: 'Accessoire', weight: 6, types: ['Aucun', 'Ceinture', 'Sac', 'Casquette', 'Montre', 'Écharpe'] },
  ];
  const ROLES = { dominant: 'Dominante', secondary: 'Secondaire', accent: 'Accent', neutral: 'Neutre' };
  const slotInfo = (id) => SLOTS.find((s) => s.id === id) || { id, label: id, weight: 10, types: [] };
  const isActive = (p) => !/^aucun/i.test(p.type || '');

  const STRONG_CHROMA = 40;   // C* CIELAB à partir duquel une couleur est jugée « vive » (heuristique)
  const NEUTRAL_CHROMA = 12;  // en dessous : couleur quasi achromatique
  const SAME_DE = 1.0;        // ΔE00 < 1 : même couleur volontaire (ensemble assorti), pas un risque
  const CLOSE_DE = 8;         // ΔE00 entre 1 et 8 : très proches sans être identiques
  const NEAR_DE = 20;

  function isNeutral(d) {
    if (d.lch.C < NEUTRAL_CHROMA) return true;
    return H.nearestNeutral(d.hex).deltaE < 10;
  }
  function isStrong(d) { return d.lch.C >= STRONG_CHROMA && !isNeutral(d); }

  function levelOfDeltaE(de) {
    return de < CLOSE_DE ? 'très proches' : de < NEAR_DE ? 'proches' : de < 45 ? 'contraste moyen' : 'contraste fort';
  }

  /* ---------- Logique colorimétrique (angles HSL réels) ---------- */

  function describeLogic(pieces) {
    const chroma = pieces.map((p) => CE.describe(p.hex)).filter((d) => !isNeutral(d) && d.hueReliable);
    const hues = [];
    chroma.forEach((d) => { if (!hues.some((h) => H.hueDistance(h, d.hsl.h) < 15)) hues.push(d.hsl.h); });
    if (hues.length === 0) return 'Tenue essentiellement neutre : la cohérence repose sur les écarts de clarté et de matière. Aucune relation de teintes à analyser.';
    if (hues.length === 1) return `Une seule famille de teinte chromatique (≈ ${round(hues[0], 0)}° sur la roue HSL), le reste étant neutre : approche monochrome ou « accent unique ».`;
    if (hues.length === 2) {
      const c = H.classifyTwo(hues[0], hues[1], 10);
      const d = round(c.distance, 1);
      if (c.isComplementary) return `Deux teintes quasi complémentaires (écart HSL de ${d}°, soit ${round(c.deviationFromComplement, 1)}° d'écart à 180°) : relation de contraste fort.`;
      if (c.distance <= 45) return `Deux teintes voisines (écart HSL de ${d}°) : harmonie analogue, contraste de teinte doux.`;
      return `Deux teintes séparées de ${d}° sur la roue HSL : relation intermédiaire, ni analogue ni complémentaire stricte.`;
    }
    if (hues.length === 3) {
      const c = H.classifyThree(hues);
      const g = c.gapsSorted.map((v) => round(v, 1) + '°').join(' / ');
      if (c.isStrictTriad) return `Trois teintes formant une triade équilatérale (écarts ${g}).`;
      return `Trois teintes aux écarts HSL de ${g} : ce n'est pas une triade stricte (écart max à 120° : ${round(c.triadDeviation, 1)}°). Structure la plus proche : ${c.best.name.toLowerCase()}, avec ${round(c.best.maxDeviation, 1)}° d'écart au modèle.`;
    }
    return `Plus de trois familles de teintes (${hues.length}) : aucune structure géométrique nette et risque de surcharge visuelle.`;
  }

  /* ---------- Analyse ---------- */

  function analyzeOutfit(items, opts) {
    const o = Object.assign({ target: [60, 30, 10] }, opts || {});
    const pieces = items.filter(isActive).map((p) => {
      const d = CE.describe(p.hex);
      return Object.assign({}, p, { d, neutral: isNeutral(d), strong: isStrong(d), temp: H.temperature(p.hex), info: slotInfo(p.slot) });
    });
    const notes = [];
    const add = (kind, text, extra) => notes.push(Object.assign({ kind, text }, extra || {}));

    // Paires (mesures)
    const pairs = [];
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const A = pieces[i].d, B = pieces[j].d;
        const bothHue = A.hueReliable && B.hueReliable;
        const deltaE = CE.deltaE2000(A.lab, B.lab);
        pairs.push({
          a: i, b: j, aLabel: pieces[i].info.label, bLabel: pieces[j].info.label,
          deltaE, level: levelOfDeltaE(deltaE), contrast: CE.contrastRatio(A.hex, B.hex),
          dL: Math.abs(A.lab.L - B.lab.L), hueGap: bothHue ? H.hueDistance(A.hsl.h, B.hsl.h) : null,
        });
      }
    }

    const strongCount = pieces.filter((p) => p.strong).length;
    const neutralCount = pieces.filter((p) => p.neutral).length;
    const Ls = pieces.map((p) => p.d.lab.L);
    const lRange = Ls.length ? Math.max(...Ls) - Math.min(...Ls) : 0;
    const maxDE = pairs.length ? Math.max(...pairs.map((p) => p.deltaE)) : 0;
    const contrastLevel = lRange < 25 ? 'faible' : lRange < 50 ? 'moyen' : 'élevé';

    const chromatic = pieces.filter((p) => !p.neutral && p.d.hueReliable);
    const warm = chromatic.filter((p) => p.temp === 'chaud').length;
    const cool = chromatic.filter((p) => p.temp === 'froid').length;

    // Mesures
    add('mesure', `${strongCount} couleur(s) vive(s) (chroma CIELAB ≥ ${STRONG_CHROMA}), ${neutralCount} neutre(s) sur ${pieces.length} pièce(s).`);
    add('mesure', `Écart de clarté L* entre la pièce la plus claire et la plus foncée : ${round(lRange, 0)} → contraste ${contrastLevel}.`);
    if (warm && cool) add('mesure', `Sous-tons : ${warm} pièce(s) à teinte chaude et ${cool} à teinte froide (contraste de température).`);

    // Détections de paires
    pairs.filter((p) => p.deltaE >= SAME_DE && p.deltaE < CLOSE_DE).forEach((p) => {
      add('risque', `${p.aLabel} et ${p.bLabel} ont des couleurs très proches (ΔE00 ${round(p.deltaE, 1)}) : sans être identiques, elles peuvent donner l'impression d'un assortiment raté. Soit les rapprocher franchement, soit les différencier nettement.`);
    });
    pairs.filter((p) => p.deltaE >= CLOSE_DE && p.deltaE < 14 && p.dL < 10).forEach((p) => {
      add('risque', `${p.aLabel} et ${p.bLabel} sont proches en clarté et en teinte (ΔE00 ${round(p.deltaE, 1)}) : le détail de la tenue peut se perdre.`);
    });
    pairs.filter((p) => p.deltaE > 60 && pieces[p.a].strong && pieces[p.b].strong).forEach((p) => {
      add('risque', `${p.aLabel} et ${p.bLabel} sont très contrastées (ΔE00 ${round(p.deltaE, 1)}) et toutes deux vives : association difficile à équilibrer.`);
    });

    // Conseils (heuristiques)
    if (strongCount > 2) add('risque', `${strongCount} couleurs vives sont visibles simultanément. Heuristique courante : au-delà de deux, la tenue devient difficile à équilibrer au quotidien.`);
    if (strongCount === 0 && pieces.length) add('conseil', 'Aucune couleur vive : tenue très sobre et facile à porter. Un accent (accessoire, écharpe) peut l\'animer.');
    if (!neutralCount && strongCount >= 2) {
      const ud = warm >= cool ? ['Écru', 'Camel', 'Bleu marine'] : ['Blanc cassé', 'Gris clair', 'Denim'];
      add('conseil', 'Aucun neutre : introduire une pièce neutre (' + ud.join(', ') + ') peut séparer les couleurs et améliorer la cohérence.', { swatches: ud.map((n) => H.NEUTRALS.find((x) => x.name === n).hex) });
    }
    if (warm && cool && strongCount >= 2) add('conseil', 'Mélange de sous-tons chauds et froids avec plusieurs couleurs vives : privilégier un neutre de transition (écru, denim, marine) entre les deux.');
    if (lRange < 18 && pieces.length > 2) add('conseil', 'Les pièces sont toutes de clarté voisine : varier légèrement la clarté (une pièce plus claire ou plus foncée) donne du relief.');

    // Répartition visuelle
    const sums = { dominant: 0, secondary: 0, accent: 0, neutral: 0 };
    pieces.forEach((p) => { sums[p.role in sums ? p.role : 'neutral'] += p.info.weight; });
    const nn = sums.dominant + sums.secondary + sums.accent;
    const actual = nn ? { dominant: sums.dominant / nn * 100, secondary: sums.secondary / nn * 100, accent: sums.accent / nn * 100 } : { dominant: 0, secondary: 0, accent: 0 };
    const t = o.target;
    if (nn) {
      add('mesure', `Répartition estimée des surfaces non neutres : ${round(actual.dominant, 0)} % / ${round(actual.secondary, 0)} % / ${round(actual.accent, 0)} % (cible ${t.join(' / ')}). Estimation fondée sur des surfaces moyennes par pièce.`);
      if (actual.accent > t[2] + 15) add('conseil', `La couleur d'accent occupe environ ${round(actual.accent, 0)} % de la surface non neutre pour une cible de ${t[2]} % : la réduire (accessoire plutôt que vêtement) allège la tenue.`);
      if (sums.dominant === 0) add('conseil', 'Aucune couleur n\'est marquée comme dominante : en choisir une donne une direction claire à la tenue.');
    }

    // Substitutions
    const suggestions = [];
    if (strongCount > 2) {
      const cand = pieces.map((p, i) => ({ p, i })).filter((x) => x.p.strong && x.p.role !== 'dominant').sort((a, b) => b.p.info.weight - a.p.info.weight);
      const pick = cand[0] || pieces.map((p, i) => ({ p, i })).filter((x) => x.p.strong).pop();
      if (pick) {
        const nn2 = H.nearestNeutral(pick.p.hex);
        suggestions.push({ pieceIndex: pick.i, slot: pick.p.slot, from: pick.p.hex, to: nn2.neutral.hex, toName: nn2.neutral.name, reason: `Remplacer ${pick.p.info.label.toLowerCase()} par un neutre proche (${nn2.neutral.name}) ramène le nombre de couleurs vives à ${strongCount - 1}.` });
      }
    }
    pairs.filter((p) => p.deltaE >= SAME_DE && p.deltaE < CLOSE_DE).slice(0, 2).forEach((p) => {
      const target = pieces[p.b];
      const lab = Object.assign({}, target.d.lab);
      lab.L = lab.L < 60 ? lab.L + 16 : lab.L - 16;
      const to = CE.rgbToHex(CE.labToRgb(lab));
      suggestions.push({ pieceIndex: p.b, slot: target.slot, from: target.hex, to, toName: lab.L > target.d.lab.L ? 'version plus claire' : 'version plus foncée', reason: `Décaler la clarté de ${target.info.label.toLowerCase()} (≈ 16 points de L*) distingue nettement les deux pièces.` });
    });

    // Facilité de port (indice heuristique, 0–100)
    let score = 92;
    score -= Math.max(0, strongCount - 1) * 16;
    if (!neutralCount) score -= 12;
    if (warm && cool && strongCount >= 2) score -= 8;
    if (pairs.some((p) => p.deltaE >= SAME_DE && p.deltaE < CLOSE_DE)) score -= 10;
    if (maxDE > 70 && strongCount >= 2) score -= 6;
    score = clamp(Math.round(score), 5, 100);
    const ease = { score, label: score >= 75 ? 'facile à porter' : score >= 50 ? 'demande un peu d\'attention' : 'exigeante' };

    // Alternatives : plus sobre / plus audacieuse (sur les pièces non neutres uniquement)
    const alt = (sat) => items.map((p) => {
      if (!isActive(p)) return p.hex;
      const d = CE.describe(p.hex);
      return isNeutral(d) ? p.hex : H.adjustPalette([p.hex], { saturation: sat })[0];
    });
    const alternatives = { sober: alt(-40), bold: alt(25) };

    return {
      pieces: pieces.map((p) => ({ slot: p.slot, type: p.type, hex: p.hex, role: p.role, neutral: p.neutral, strong: p.strong, temp: p.temp, L: p.d.lab.L, C: p.d.lch.C })),
      pairs, strongCount, neutralCount, lRange, maxDeltaE: maxDE, contrastLevel, warm, cool,
      ease, notes, suggestions, alternatives, logic: describeLogic(pieces),
      proportions: { actual, target: t },
    };
  }

  /* ---------- Génération de tenue à partir d'une palette ---------- */

  function generateOutfit(palette, level) {
    if (!Array.isArray(palette) || palette.length === 0) throw new CE.ColorError('Palette vide.');
    const p0 = palette[0], p1 = palette[1 % palette.length], p2 = palette[2 % palette.length];
    const warm = H.temperature(p0) === 'chaud';
    const N = { light: warm ? '#EDE3CF' : '#F4F1EA', denim: '#3F5F8A', dark: warm ? '#4A3126' : '#3C4043', shoes: warm ? '#4A3126' : '#121212', marine: '#203A5B' };
    const muted = (hex) => H.adjustPalette([hex], { saturation: -35 })[0];
    const mk = (slot, type, hex, role) => ({ slot, type, hex: CE.normalizeHex(hex), role });
    if (level === 'sober') {
      return [mk('haut', 'Pull', muted(p0), 'dominant'), mk('couche', 'Aucune', N.light, 'neutral'), mk('bas', 'Pantalon habillé', N.dark, 'neutral'),
        mk('chaussures', 'Chaussures en cuir', N.shoes, 'neutral'), mk('accessoire', 'Ceinture', muted(p1), 'accent')];
    }
    if (level === 'bold') {
      return [mk('haut', 'Pull', p0, 'dominant'), mk('couche', 'Aucune', N.light, 'neutral'), mk('bas', 'Pantalon chino', p1, 'secondary'),
        mk('chaussures', 'Sneakers', p2, 'accent'), mk('accessoire', 'Montre', N.dark, 'neutral')];
    }
    return [mk('haut', 'Sweat', p0, 'dominant'), mk('couche', 'Aucune', N.light, 'neutral'), mk('bas', 'Jean', N.denim, 'neutral'),
      mk('chaussures', 'Sneakers', N.light, 'neutral'), mk('accessoire', 'Sac', p1, 'accent')];
  }

  return { SLOTS, ROLES, slotInfo, isActive, analyzeOutfit, generateOutfit, describeLogic, isNeutral, isStrong };
});
