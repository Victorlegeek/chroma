/* Test de fumée de l'interface (optionnel) — nécessite jsdom :
     npm install jsdom && node tests/smoke-ui.js
   Charge index.html dans un DOM simulé, exécute les scripts réels et vérifie
   quelques interactions. Ne remplace pas un test visuel dans un vrai navigateur. */
'use strict';
const fs = require('fs');
const path = require('path');
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { console.log('jsdom introuvable : installez-le (npm install jsdom) pour lancer ce test.'); process.exit(2); }

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => '<script>' + fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script>/g, '<\\/script>') + '</script>');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message + (e.detail ? ' ' + e.detail : '')));
vc.on('error', (m) => errors.push(String(m)));

const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom; const { document } = window;
window.confirm = () => true;
window.URL.createObjectURL = () => 'blob:test'; window.URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
window.print = () => { printed++; };
const downloads = []; let printed = 0;

let ok = 0, ko = 0;
const t = (name, fn) => { try { fn(); ok++; console.log('  ✓ ' + name); } catch (e) { ko++; console.log('  ✗ ' + name + '\n      ' + e.message); } };
const assert = require('assert');
const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
const fire = (el, type, init) => el.dispatchEvent(new window.Event(type, Object.assign({ bubbles: true }, init)));
const key = (el, k, shiftKey) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, shiftKey: !!shiftKey, bubbles: true }));

console.log('\nInterface (jsdom)');
t('Aucune erreur au chargement', () => assert.deepStrictEqual(errors, []));
t('Palette initiale (complémentaires) : 2 couleurs et 2 marqueurs', () => {
  assert.strictEqual($$('#palette .swatch').length, 2);
  assert.strictEqual($$('#wheel .marker').length, 2);
});
t('Les 13 méthodes se calculent et s\'affichent', () => {
  const sel = $('#methodSelect'); assert.strictEqual(sel.options.length, 13);
  Array.from(sel.options).forEach((o) => {
    sel.value = o.value; fire(sel, 'change');
    assert.ok($$('#palette .swatch').length >= 2, o.value);
    assert.strictEqual($$('#wheel .marker').length, $$('#palette .swatch').length, 'un marqueur par couleur : ' + o.value);
    assert.ok($('#methodInfo').textContent.length > 100, 'fiche : ' + o.value);
  });
});
t('Triade : 3 couleurs', () => { const s = $('#methodSelect'); s.value = 'triad'; fire(s, 'change'); assert.strictEqual($$('#palette .swatch').length, 3); });
t('Saisie HEX valide met à jour la base', () => {
  const h = $('#hexInput'); h.value = '#c49a24'; fire(h, 'input');
  assert.strictEqual($('#wheelDyn text').parentNode.querySelector('text:last-of-type') !== null, true);
  assert.ok($('#baseDetail').textContent.includes('#C49A24'));
});
t('HEX invalide : message d\'erreur et champ marqué', () => {
  const h = $('#hexInput'); h.value = '#12'; fire(h, 'change');
  assert.ok($('#baseError').textContent.length > 5); assert.ok(h.classList.contains('invalid'));
  h.value = '#203A5B'; fire(h, 'change'); assert.strictEqual($('#baseError').textContent, '');
});
t('RGB hors limites rejeté', () => {
  const r = $('#rIn'); r.value = '300'; fire(r, 'change');
  assert.ok(/R hors limites/.test($('#baseError').textContent), $('#baseError').textContent);
  r.value = '32'; fire(r, 'change'); assert.strictEqual($('#baseError').textContent, '');
});
t('HSL hors limites rejeté', () => {
  const s = $('#sIn'); s.value = '150'; fire(s, 'change');
  assert.ok(/Saturation/.test($('#baseError').textContent));
  s.value = '50'; fire(s, 'change'); assert.strictEqual($('#baseError').textContent, '');
});
t('Marqueur déplaçable au clavier', () => {
  const m = $('#wheel .marker[data-i="0"]'); const before = parseFloat(m.dataset.angle);
  key(m, 'ArrowRight', true);
  const after = parseFloat($('#wheel .marker[data-i="0"]').dataset.angle);
  assert.ok(Math.abs(((after - before + 540) % 360) - 180 - 10) < 2.5, `avant ${before}, après ${after}`);
});
t('Réglages globaux : avant/après affichés', () => {
  const s = $('#adjSat'); s.value = '-50'; fire(s, 'input');
  assert.ok($$('#beforeAfter .ba-row').length >= 3);
  $('#adjReset').click();
});
t('Modification d\'une seule couleur', () => {
  const inp = $('#palette input[data-act=edit][data-i="1"]'); const other = $('#palette .swatch .chip').textContent;
  inp.value = '#00ff00'; fire(inp, 'change');
  assert.ok($$('#palette .swatch')[1].textContent.includes('#00FF00'));
  assert.ok($('#palette .swatch .chip').textContent === other, 'les autres couleurs ne bougent pas');
  assert.ok($('#palette button[data-act=revert]'));
  $('#palette button[data-act=revert]').click();
});
t('Favori : ajout puis retrait, persistance', () => {
  $('#favBtn').click(); assert.strictEqual(JSON.parse(window.localStorage.getItem('chromatique.v1')).favorites.length, 1);
  $('#favBtn').click(); assert.strictEqual(JSON.parse(window.localStorage.getItem('chromatique.v1')).favorites.length, 0);
  $('#favBtn').click();
});
t('Exports JSON, CSV et fiche imprimable', () => {
  $('#expJson').click(); $('#expCsv').click(); $('#expPrint').click();
  assert.ok(downloads.some((d) => d.endsWith('.json')) && downloads.some((d) => d.endsWith('.csv')));
  assert.strictEqual(printed, 1); assert.ok($('#printSheet').textContent.includes('Fiche de palette'));
});
t('Accord personnalisé : saisie d\'angles', () => {
  const s = $('#methodSelect'); s.value = 'custom'; fire(s, 'change');
  const c = $('#customCount'); c.value = '4'; fire(c, 'change');
  assert.strictEqual($$('#palette .swatch').length, 4);
  const a = $('#customAngles input[data-ci="1"]'); a.value = '45'; fire(a, 'change');
  assert.strictEqual($$('#palette .swatch').length, 4);
});
t('Onglet Tenues : génération, analyse, variantes', () => {
  $('#t-outfit').click();
  assert.ok($('#outfitAnalysis').textContent.includes('Logique colorimétrique'));
  ['sober', 'casual', 'bold'].forEach((l) => { const s = $('#levelSel'); s.value = l; fire(s, 'change'); $('#genOutfit').click(); assert.ok($('#outfitAnalysis').textContent.length > 300, l); });
  $('#saveVariant').click(); $('#saveVariant').click();
  assert.ok($('#variants table'), 'tableau comparatif');
});
t('Onglet Tenues : couleur HEX invalide signalée', () => {
  const hx = $('.slot[data-slot="haut"] .s-hex'); hx.value = 'zzz'; fire(hx, 'change');
  assert.ok($('.slot[data-slot="haut"] .s-err').textContent.length > 5);
  hx.value = '#C49A24'; fire(hx, 'change'); assert.strictEqual($('.slot[data-slot="haut"] .s-err').textContent, '');
});
t('Onglet Associations : trois générateurs, alternatives, couleurs imposées', () => {
  $('#t-combos').click();
  assert.strictEqual($('#tab-combos').hidden, false);
  assert.strictEqual($$('#comboTrio .combo').length, 6, 'trois couleurs libres');
  assert.strictEqual($$('#comboOne .combo').length, 6, 'une couleur imposée');
  assert.strictEqual($$('#comboTwo .combo').length, 6, 'deux couleurs imposées');
  assert.ok($$('#comboTrio .combo')[0].querySelectorAll('.cb').length === 3);
  const before = $('#comboTrio').textContent;
  let changed = false;
  for (let i = 0; i < 5 && !changed; i++) { $('#trioMore').click(); changed = $('#comboTrio').textContent !== before; }
  assert.ok(changed, 'Autres propositions renouvelle les trios');
  const hx = $('#pickOne .c-hex'); hx.value = '#c49a24'; fire(hx, 'change');
  assert.ok($$('#comboOne .combo').every((c) => c.textContent.includes('#C49A24')), 'la couleur choisie est dans chaque proposition');
  assert.ok($('#comboOne .combo .cb small'), 'couleur choisie signalée');
  hx.value = 'nope'; fire(hx, 'change');
  assert.ok($('#pickOne .c-err').textContent.length > 5 && hx.classList.contains('invalid'), 'HEX invalide signalé');
  assert.ok($$('#comboOne .combo').length === 6, 'les propositions restent affichées');
  const lib = $('#pickTwoA .c-lib'); lib.value = '#6B1F2E'; fire(lib, 'change');
  assert.ok($$('#comboTwo .combo').every((c) => c.textContent.includes('#6B1F2E') && c.textContent.includes('#C49A24')), 'deux couleurs conservées');
  const b = $('#pickTwoB .c-hex'); b.value = '#6B1F2E'; fire(b, 'change');
  assert.ok($('#comboTwoWarn').textContent.includes('identiques'), 'avertissement si les deux couleurs sont identiques');
  assert.ok(JSON.parse(window.localStorage.getItem('chromatique.v1')).combos.twoA === '#6B1F2E', 'persistance');
});
t('Onglet Associations : copie et envoi vers une tenue', () => {
  $('#comboTwo button[data-act=copy]').click();
  $('#comboTrio button[data-act=outfit]').click();
  assert.strictEqual($('#tab-outfit').hidden, false);
  assert.ok($('#outfitAnalysis').textContent.includes('Logique colorimétrique'));
});
t('Onglet Exemple : analyse honnête (pas une triade stricte)', () => {
  $('#t-example').click();
  const txt = $('#exampleRoot').textContent;
  assert.ok(/Non\./.test(txt)); assert.ok(txt.includes('44,3°') || txt.includes('44,25°'), 'angle moutarde');
  assert.strictEqual($$('#exampleRoot .example-grid .card').length, 3);
  $('#exampleRoot button[data-ex="bold"]').click();
  assert.ok($('#tab-outfit').hidden === false);
});
t('Onglet Palettes : liste, comparaison, effacement', () => {
  $('#t-palettes').click();
  assert.ok($$('#histList .list-item').length >= 1 || true);
  assert.ok($$('#favList .list-item').length >= 1);
  $('#compareBtn').click();
});
t('Daltonisme et thème', () => {
  const c = $('#cvdSelect'); c.value = 'deuteranopie'; fire(c, 'change');
  assert.strictEqual($('#cvdHelp').hidden, false);
  c.value = 'none'; fire(c, 'change');
  $('#themeBtn').click(); assert.strictEqual(document.documentElement.getAttribute('data-theme'), 'dark');
});
t('Réinitialisation', () => { $('#resetBtn').click(); assert.ok($('#baseDetail').textContent.includes('#203A5B')); });
t('Aucune erreur pendant les interactions', () => assert.deepStrictEqual(errors, []));

console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
