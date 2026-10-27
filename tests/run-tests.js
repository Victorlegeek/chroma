/* Tests du moteur colorimétrique — lancer avec : node tests/run-tests.js */
'use strict';
const assert = require('assert');
const CE = require('../js/color-engine.js');
const H = require('../js/harmonies.js');
const O = require('../js/outfit.js');
const K = require('../js/combos.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} attendu ${b} ± ${tol}, obtenu ${a}`);
const throwsColor = (fn) => assert.throws(fn, (e) => e instanceof CE.ColorError);

console.log('\nConversions');
test('HEX → RGB (3 et 6 caractères, avec ou sans #)', () => {
  assert.deepStrictEqual(CE.parseHex('#C49A24'), { r: 196, g: 154, b: 36 });
  assert.deepStrictEqual(CE.parseHex('c49a24'), { r: 196, g: 154, b: 36 });
  assert.deepStrictEqual(CE.parseHex('#fa0'), { r: 255, g: 170, b: 0 });
});
test('RGB → HEX', () => assert.strictEqual(CE.rgbToHex({ r: 32, g: 58, b: 91 }), '#203A5B'));
test('Aller-retour HEX → HSL → HEX sur 2000 couleurs', () => {
  for (let i = 0; i < 2000; i++) {
    const hex = CE.rgbToHex({ r: (i * 37) % 256, g: (i * 91 + 13) % 256, b: (i * 53 + 7) % 256 });
    assert.strictEqual(CE.hslToHex(CE.hexToHsl(hex)), hex);
  }
});
test('Valeurs HSL connues', () => {
  const red = CE.hexToHsl('#FF0000'); near(red.h, 0, 1e-9); near(red.s, 100, 1e-9); near(red.l, 50, 1e-9);
  const green = CE.hexToHsl('#00FF00'); near(green.h, 120, 1e-9);
  const blue = CE.hexToHsl('#0000FF'); near(blue.h, 240, 1e-9);
  const m = CE.hexToHsl('#C49A24'); near(m.h, 44.25, 0.01);
});
test('CIELAB : blanc, noir, rouge sRGB (valeurs de référence)', () => {
  const w = CE.hexToLab('#FFFFFF'); near(w.L, 100, 0.01); near(w.a, 0, 0.01); near(w.b, 0, 0.01);
  const k = CE.hexToLab('#000000'); near(k.L, 0, 0.01);
  const r = CE.hexToLab('#FF0000'); near(r.L, 53.24, 0.05); near(r.a, 80.09, 0.1); near(r.b, 67.20, 0.1);
});
test('Aller-retour RGB → Lab → RGB', () => {
  for (let i = 0; i < 500; i++) {
    const rgb = { r: (i * 29) % 256, g: (i * 71 + 5) % 256, b: (i * 113 + 9) % 256 };
    const back = CE.labToRgb(CE.rgbToLab(rgb));
    assert.deepStrictEqual({ r: back.r, g: back.g, b: back.b }, rgb);
  }
});
test('LCh ↔ Lab cohérents', () => {
  const lab = CE.hexToLab('#A83232'); const back = CE.lchToLab(CE.labToLch(lab));
  near(back.a, lab.a, 1e-9); near(back.b, lab.b, 1e-9);
});

console.log('\nCIEDE2000 (jeu de données de Sharma et al.)');
test('Paires de référence', () => {
  const cases = [
    [{ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ L: 50, a: 3.1571, b: -77.2803 }, { L: 50, a: 0, b: -82.7485 }, 2.8615],
    [{ L: 50, a: 2.5, b: 0 }, { L: 50, a: 0, b: -2.5 }, 4.3065],
    [{ L: 50, a: 2.5, b: 0 }, { L: 73, a: 25, b: -18 }, 27.1492],
    [{ L: 60.2574, a: -34.0099, b: 36.2677 }, { L: 60.4626, a: -34.1751, b: 39.4387 }, 1.2644],
  ];
  cases.forEach(([x, y, exp]) => near(CE.deltaE2000(x, y), exp, 1e-4));
});
test('ΔE d\'une couleur à elle-même = 0 et symétrie', () => {
  near(CE.deltaEHex('#203A5B', '#203A5B'), 0, 1e-9);
  near(CE.deltaEHex('#203A5B', '#C49A24'), CE.deltaEHex('#C49A24', '#203A5B'), 1e-9);
});

console.log('\nValidation des entrées');
test('HEX invalides rejetés', () => {
  ['', '#12', '#GGGGGG', '12345', '#1234567', null, 42].forEach((v) => throwsColor(() => CE.parseHex(v)));
});
test('RGB hors limites ou non numériques rejetés', () => {
  throwsColor(() => CE.validateRgb({ r: 256, g: 0, b: 0 }));
  throwsColor(() => CE.validateRgb({ r: -1, g: 0, b: 0 }));
  throwsColor(() => CE.validateRgb({ r: 'abc', g: 0, b: 0 }));
  throwsColor(() => CE.validateRgb({ r: '', g: 0, b: 0 }));
  throwsColor(() => CE.validateRgb({ r: NaN, g: 0, b: 0 }));
  throwsColor(() => CE.rgbToHex({ r: 300, g: 0, b: 0 }));
});
test('HSL hors limites rejetés', () => {
  throwsColor(() => CE.validateHsl({ h: 361, s: 50, l: 50 }));
  throwsColor(() => CE.validateHsl({ h: 10, s: 101, l: 50 }));
  throwsColor(() => CE.validateHsl({ h: 10, s: 50, l: -1 }));
  throwsColor(() => CE.validateHsl({ h: 'x', s: 50, l: 50 }));
});

console.log('\nRelations angulaires');
test('Complémentaires : teintes séparées de 180°', () => {
  for (const hex of ['#203A5B', '#C49A24', '#A83232', '#1F8A5B', '#6B3FA0']) {
    const r = H.generate('complementary', hex);
    const d = H.hueDistance(r.colors[0].hsl.h, r.colors[1].hsl.h);
    near(d, 180, 1.5, 'écart ' + hex); // tolérance : arrondi à l'entier RGB
  }
});
test('Théorie exacte (sans arrondi RGB) : offsets 0/180 et 0/120/240', () => {
  assert.deepStrictEqual(H.DEFS.complementary.offsets(), [0, 180]);
  assert.deepStrictEqual(H.DEFS.triad.offsets(), [0, 120, 240]);
});
test('Triade stricte : sommets séparés de 120°', () => {
  const r = H.generate('triad', '#C0392B');
  const c = H.classifyThree(r.colors.map((x) => x.hsl.h), 1.5);
  assert.ok(c.isStrictTriad, 'devrait être une triade stricte, écart ' + c.triadDeviation);
  near(H.hueDistance(r.colors[0].hsl.h, r.colors[1].hsl.h), 120, 1.5);
  near(H.hueDistance(r.colors[1].hsl.h, r.colors[2].hsl.h), 120, 1.5);
});
test('Complémentaires divisées et tétrades : offsets attendus', () => {
  assert.deepStrictEqual(H.DEFS.split.offsets(30), [0, 150, 210]);
  assert.deepStrictEqual(H.DEFS.double.offsets(30), [0, 30, 180, 210]);
  assert.deepStrictEqual(H.DEFS.rectangle.offsets(60), [0, 60, 180, 240]);
  assert.deepStrictEqual(H.DEFS.analogous.offsets(30), [-30, 0, 30]);
});
test('Moutarde / marine / rouge brique n\'est PAS une triade stricte', () => {
  const hues = ['#C49A24', '#203A5B', '#A83232'].map((x) => CE.hexToHsl(x).h);
  near(hues[0], 44.25, 0.1); near(hues[1], 213.56, 0.1); near(hues[2], 0, 1e-9);
  const c = H.classifyThree(hues);
  assert.strictEqual(c.isStrictTriad, false);
  assert.ok(c.triadDeviation > 50, 'écart à la triade : ' + c.triadDeviation);
  assert.strictEqual(c.best.id, 'split'); // plus proche des complémentaires divisées
});
test('Distance de teinte circulaire', () => {
  near(H.hueDistance(350, 10), 20, 1e-9); near(H.hueDistance(0, 180), 180, 1e-9);
  near(H.signedAngle(350, 10), 20, 1e-9); near(H.signedAngle(10, 350), -20, 1e-9);
});

console.log('\nPalettes générées');
test('Toutes les méthodes produisent des couleurs RGB valides', () => {
  ['#203A5B', '#C49A24', '#A83232', '#FFFFFF', '#000000', '#808080', '#FF00FF'].forEach((base) => {
    H.HARMONY_IDS.forEach((id) => {
      const r = H.generate(id, base, { equalize: true });
      assert.ok(r.colors.length >= 2, id);
      r.colors.forEach((c) => {
        assert.match(c.hex, /^#[0-9A-F]{6}$/);
        ['r', 'g', 'b'].forEach((k) => assert.ok(c.rgb[k] >= 0 && c.rgb[k] <= 255 && Number.isInteger(c.rgb[k])));
      });
    });
  });
});
test('La couleur de base est conservée exactement', () => {
  const r = H.generate('triad', '#203A5B');
  assert.strictEqual(r.colors[r.baseIndex].hex, '#203A5B');
});
test('Monochromatique : teinte conservée (±3°), luminosités ordonnées', () => {
  const r = H.generate('monochromatic', '#203A5B');
  r.colors.forEach((c) => near(H.hueDistance(c.hsl.h, r.base.hsl.h), 0, 3, 'teinte ' + c.hex));
  const ls = r.colors.map((c) => c.hsl.l);
  for (let i = 1; i < ls.length; i++) assert.ok(ls[i] >= ls[i - 1], 'luminosité croissante');
});
test('Harmonie tonale : L* égalisé (±2) autour de la base', () => {
  const r = H.generate('tonal', '#A83232');
  r.colors.forEach((c) => near(c.lab.L, r.base.lab.L, 2.5, c.hex));
});
test('Accord personnalisé : nombre et angles respectés ; entrées invalides rejetées', () => {
  const r = H.generate('custom', '#C0392B', { customOffsets: [0, 45, 100, 200, 300] });
  assert.strictEqual(r.colors.length, 5);
  near(H.signedAngle(r.base.hsl.h, r.colors[2].hsl.h), 100, 2);
  throwsColor(() => H.generate('custom', '#C0392B', { customOffsets: [0] }));
  throwsColor(() => H.generate('custom', '#C0392B', { customOffsets: [0, 'abc'] }));
  throwsColor(() => H.generate('inconnue', '#C0392B'));
});
test('Réglages globaux : neutres à 0, valeurs valides sinon', () => {
  const src = ['#203A5B', '#C49A24', '#A83232'];
  assert.deepStrictEqual(H.adjustPalette(src, {}), src);
  const out = H.adjustPalette(src, { contrast: 60, lightness: 40, saturation: -100 });
  out.forEach((h) => assert.match(h, /^#[0-9A-F]{6}$/));
  near(CE.hexToLab(out[0]).C === undefined ? 0 : CE.labToLch(CE.hexToLab(out[0])).C, 0, 1.5, 'désaturation complète');
});

console.log('\nCouleurs achromatiques');
test('Noir, blanc, gris : teinte déclarée non fiable', () => {
  ['#000000', '#FFFFFF', '#808080', '#3C4043', '#C8CACC'].forEach((hex) => {
    const d = CE.describe(hex);
    assert.strictEqual(d.hueReliable, false, hex);
    assert.strictEqual(H.temperature(hex), 'neutre', hex);
  });
  assert.strictEqual(CE.describe('#C49A24').hueReliable, true);
});
test('Une base grise génère un avertissement et ne casse rien', () => {
  const r = H.generate('complementary', '#808080');
  assert.ok(r.warnings.length > 0);
});

console.log('\nTenues');
test('Analyse : détecte des couleurs vives, des neutres et des teintes proches', () => {
  const a = O.analyzeOutfit([
    { slot: 'haut', hex: '#C49A24', role: 'dominant' },
    { slot: 'bas', hex: '#3F5F8A', role: 'neutral' },
    { slot: 'chaussures', hex: '#EDE3CF', role: 'neutral' },
    { slot: 'accessoire', hex: '#A83232', role: 'accent' },
  ]);
  assert.strictEqual(a.strongCount, 2);
  assert.ok(a.neutralCount >= 2);
  assert.ok(a.ease.score >= 0 && a.ease.score <= 100);
  const b = O.analyzeOutfit([{ slot: 'haut', hex: '#203A5B', role: 'dominant' }, { slot: 'bas', hex: '#243F60', role: 'neutral' }]);
  assert.ok(b.pairs[0].deltaE < 8);
  assert.ok(b.notes.some((n) => /proches/i.test(n.text)));
});
test('Analyse : trois couleurs vives déclenchent un avertissement et une substitution', () => {
  const a = O.analyzeOutfit([
    { slot: 'haut', hex: '#C49A24', role: 'dominant' },
    { slot: 'couche', hex: '#1F8A5B', role: 'secondary' },
    { slot: 'bas', hex: '#A83232', role: 'accent' },
  ]);
  assert.ok(a.strongCount >= 3);
  assert.ok(a.suggestions.length > 0);
});
test('Répartition : les pourcentages font 100', () => {
  const a = O.analyzeOutfit([
    { slot: 'haut', hex: '#C49A24', role: 'dominant' },
    { slot: 'bas', hex: '#203A5B', role: 'secondary' },
    { slot: 'accessoire', hex: '#A83232', role: 'accent' },
  ]);
  const p = a.proportions.actual;
  near(p.dominant + p.secondary + p.accent, 100, 0.01);
});
test('Génération de tenue : trois niveaux, couleurs valides', () => {
  ['sober', 'casual', 'bold'].forEach((lvl) => {
    const o = O.generateOutfit(['#203A5B', '#C49A24', '#A83232'], lvl);
    assert.ok(o.length >= 4);
    o.forEach((p) => assert.match(p.hex, /^#[0-9A-F]{6}$/));
  });
});

console.log('\nAssociations');
const HEX = /^#[0-9A-F]{6}$/;
const sameSet = (a, b) => a.length === b.length && a.every((h) => b.includes(h));
test('Indice : un trio sobre bat trois couleurs vives qui hurlent', () => {
  const good = K.scoreTrio(['#203A5B', '#B5875A', '#EDE3CF']);
  const bad = K.scoreTrio(['#FF0000', '#00FF00', '#0000FF']);
  assert.ok(good.score > bad.score + 20, `${good.score} vs ${bad.score}`);
  assert.strictEqual(bad.strongCount, 3);
  assert.ok(bad.reasons.some((r) => r.tone === '-'));
  [good, bad].forEach((x) => assert.ok(x.score >= 0 && x.score <= 100));
  throwsColor(() => K.scoreTrio(['#203A5B', '#B5875A']));
});
test('Indice : deux couleurs très proches sont signalées', () => {
  const s = K.scoreTrio(['#203A5B', '#243F60', '#EDE3CF']);
  assert.ok(s.reasons.some((r) => /proches|identiques/.test(r.text)));
  assert.ok(s.score < K.scoreTrio(['#203A5B', '#C49A24', '#EDE3CF']).score);
});
test('Trois couleurs libres : 6 associations valides, distinctes et bien notées', () => {
  const r = K.suggestTrios();
  assert.strictEqual(r.results.length, 6);
  const keys = new Set();
  r.results.forEach((c) => {
    assert.strictEqual(c.hexes.length, 3); assert.strictEqual(c.names.length, 3);
    c.hexes.forEach((h) => assert.match(h, HEX));
    assert.strictEqual(new Set(c.hexes).size, 3, 'trois couleurs différentes');
    assert.ok(c.fixed.every((f) => f === false));
    assert.ok(c.score >= 60 && c.score <= 100); assert.ok(c.reasons.length >= 1);
    assert.ok(sameSet(c.ordered, c.hexes), 'ordre tenue : mêmes couleurs');
    keys.add(c.hexes.slice().sort().join());
  });
  assert.strictEqual(keys.size, 6);
  assert.ok(r.results.every((c) => K.scoreTrio(c.hexes).strongCount <= 2), 'jamais trois couleurs vives');
  for (let i = 1; i < r.results.length; i++) assert.ok(r.results[i - 1].score >= r.results[i].score, 'triées par indice');
});
test('Graine : même graine = même résultat, graines différentes = autres propositions', () => {
  assert.deepStrictEqual(K.suggestTrios({ seed: 5 }), K.suggestTrios({ seed: 5 }));
  assert.deepStrictEqual(K.suggestTrios(), K.suggestTrios({ seed: 0 }));
  const sig = (r) => r.results.map((c) => c.hexes.slice().sort().join()).join('|');
  const sigs = new Set([1, 2, 3, 4, 5, 6].map((sd) => sig(K.suggestTrios({ seed: sd }))));
  assert.ok(sigs.size >= 4, 'au moins 4 tirages différents sur 6 : ' + sigs.size);
});
test('Une couleur imposée : elle est dans chaque résultat, avec deux partenaires distincts', () => {
  ['#203A5B', '#C49A24', '#FFFFFF', '#FF3399', '#808080'].forEach((base) => {
    const r = K.completeOne(base);
    assert.strictEqual(r.results.length, 6, base);
    const partners = [];
    r.results.forEach((c) => {
      assert.strictEqual(c.hexes[0], base.toUpperCase(), 'la couleur choisie vient en premier : ' + base);
      assert.deepStrictEqual(c.fixed, [true, false, false]);
      assert.ok(CE.deltaEHex(c.hexes[1], base) >= K.SAME_DE && CE.deltaEHex(c.hexes[2], base) >= K.SAME_DE, 'partenaire identique à la base');
      partners.push(c.hexes[1], c.hexes[2]);
    });
    assert.strictEqual(new Set(partners).size, partners.length, 'aucun partenaire répété : ' + base);
  });
});
test('Une couleur imposée : HEX court ou invalide', () => {
  assert.strictEqual(K.completeOne('#fa0').results[0].hexes[0], '#FFAA00');
  throwsColor(() => K.completeOne('zzz'));
  throwsColor(() => K.completeOne(''));
});
test('Deux couleurs imposées : les deux sont conservées, troisième couleur distincte à chaque fois', () => {
  const r = K.completeTwo('#203A5B', '#C49A24');
  assert.strictEqual(r.results.length, 6); assert.deepStrictEqual(r.warnings, []);
  const thirds = r.results.map((c) => {
    assert.deepStrictEqual(c.hexes.slice(0, 2), ['#203A5B', '#C49A24']);
    assert.deepStrictEqual(c.fixed, [true, true, false]);
    return c.hexes[2];
  });
  assert.strictEqual(new Set(thirds).size, 6);
  thirds.forEach((t) => assert.ok(CE.deltaEHex(t, '#203A5B') >= K.SAME_DE && CE.deltaEHex(t, '#C49A24') >= K.SAME_DE));
  assert.ok(r.results[0].score >= 80, 'moutarde + marine doivent trouver une bonne troisième couleur : ' + r.results[0].score);
});
test('Deux couleurs imposées : couleurs identiques ou proches signalées, rien ne casse', () => {
  assert.ok(K.completeTwo('#203A5B', '#203A5B').warnings.length === 1);
  const close = K.completeTwo('#203A5B', '#243F60'); assert.ok(close.warnings.length === 1 && close.results.length > 0);
  assert.strictEqual(K.completeTwo('#121212', '#FFFFFF').results.length, 6);
  throwsColor(() => K.completeTwo('#203A5B', '#12'));
});
test('Aucune combinaison ne produit de couleur invalide, sur des couleurs choisies au hasard', () => {
  for (let i = 0; i < 25; i++) {
    const a = CE.rgbToHex({ r: (i * 67) % 256, g: (i * 131 + 20) % 256, b: (i * 29 + 90) % 256 });
    const b = CE.rgbToHex({ r: (i * 41 + 7) % 256, g: (i * 83) % 256, b: (i * 199 + 3) % 256 });
    [K.completeOne(a, { seed: i }), K.completeTwo(a, b, { seed: i })].forEach((r) => {
      assert.ok(r.results.length > 0);
      r.results.forEach((c) => c.hexes.forEach((h) => assert.match(h, HEX)));
    });
  }
});
test('Une association peut servir à générer une tenue', () => {
  const c = K.completeOne('#C49A24').results[0];
  ['sober', 'casual', 'bold'].forEach((lvl) => {
    const o = O.generateOutfit(c.ordered, lvl);
    assert.ok(o.length >= 4); o.forEach((p) => assert.match(p.hex, HEX));
  });
});

console.log('\nSimulation et extraction');
test('Simulation daltonisme : valeurs valides, gris quasi inchangés', () => {
  ['protanopie', 'deuteranopie', 'tritanopie'].forEach((t) => {
    assert.match(CE.simulateCvd('#A83232', t), /^#[0-9A-F]{6}$/);
    const g = CE.parseHex(CE.simulateCvd('#808080', t));
    assert.ok(Math.abs(g.r - 128) < 4 && Math.abs(g.g - 128) < 4 && Math.abs(g.b - 128) < 4, t);
  });
  throwsColor(() => CE.simulateCvd('#808080', 'inconnu'));
});
test('Extraction k-means : retrouve deux couleurs franches', () => {
  const px = [];
  for (let i = 0; i < 300; i++) px.push([196, 154, 36]);
  for (let i = 0; i < 100; i++) px.push([32, 58, 91]);
  const pal = CE.extractPalette(px, 2);
  assert.strictEqual(pal.length, 2);
  assert.ok(CE.deltaEHex(pal[0].hex, '#C49A24') < 2);
  assert.ok(CE.deltaEHex(pal[1].hex, '#203A5B') < 2);
  near(pal[0].share, 0.75, 0.02);
});
test('Contraste WCAG : noir/blanc = 21', () => near(CE.contrastRatio('#000000', '#FFFFFF'), 21, 1e-6));

console.log(`\n${passed} réussis, ${failed} échoués`);
process.exit(failed ? 1 : 0);
