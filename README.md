# Chromatique — colorimétrie vestimentaire

Application web locale pour créer, analyser et comparer des associations de couleurs de vêtements à partir d'un cercle chromatique interactif. Aucun serveur, aucune clé API, aucune dépendance : HTML, CSS, JavaScript et SVG.

## Lancer l'application

1. Ouvrez le dossier `chromatique/`.
2. Double-cliquez sur `index.html` (ou glissez-le dans un navigateur récent : Chrome, Firefox, Safari, Edge).

C'est tout. Les favoris, l'historique, les variantes de tenue et les préférences sont conservés dans le `localStorage` du navigateur.

## Lancer les tests

```bash
node tests/run-tests.js          # moteur colorimétrique, harmonies, tenues (aucune dépendance)

# Optionnel : test de fumée de l'interface dans un DOM simulé
npm install jsdom
node tests/smoke-ui.js
```

Le test de fumée charge la vraie page, exécute les vrais scripts et simule des clics, des saisies et des touches. Il ne remplace pas un essai dans un vrai navigateur : le glisser-déposer à la souris/au doigt et le rendu visuel ne sont pas couverts.

## Organisation du code

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Structure, interface responsive, thèmes clair/sombre, impression |
| `script.js` | Interface : cercle SVG, palette, tenues, favoris, exports, onglets |
| `js/color-engine.js` | Conversions HEX/RGB/HSL/XYZ/CIELAB/CIELCh, CIEDE2000, contraste WCAG, simulation de daltonisme, extraction de couleurs (k-means) |
| `js/harmonies.js` | Les 13 méthodes d'harmonie, classification de triplets, réglages globaux |
| `js/outfit.js` | Génération et analyse de tenues (mesures et conseils séparés) |
| `js/combos.js` | Associations de couleurs : 3 couleurs libres, 1 ou 2 couleurs imposées, indice de compatibilité heuristique |
| `js/data.js` | Bibliothèque de ~40 couleurs vestimentaires, fiches pédagogiques des méthodes |
| `tests/` | Tests du moteur et test de fumée de l'interface |

Les modules `js/*.js` n'utilisent pas le DOM : ils fonctionnent dans le navigateur (globales `ColorEngine`, `Harmonies`, `Outfit`, `ClothingData`) et sous Node (`require`).

## Fonctionnalités

**Cercle et couleurs**
- Roue SVG avec graduations, marqueurs déplaçables à la souris, au doigt et au clavier (flèches ±1°, Maj ±10°), clic sur l'anneau pour choisir une teinte.
- Chaque marqueur correspond à une couleur réellement calculée ; l'angle affiché est celui de la couleur finale (après arrondi RGB).
- Sélection par : cercle, HEX, RGB, HSL, sélecteur natif, bibliothèque filtrable, image (couleurs dominantes), couleur aléatoire contrôlée.
- Pour chaque couleur : nom indicatif (couleur de la bibliothèque la plus proche en CIEDE2000), HEX, RGB, HSL, CIELAB, température.

**13 méthodes d'harmonie** : monochromatique, analogues, complémentaires, complémentaires divisées, triade, double complémentaire, rectangulaire, accord personnalisé (nombre et angles libres), associations neutres, harmonie tonale (L* égalisé), contrastes de température, de luminosité et de saturation. Chaque méthode a sa fiche (définition, logique, avantages, limites, situations). L'écart des méthodes à angle variable se règle au curseur ou en déplaçant un marqueur secondaire.

**Palettes** : réglages globaux de contraste, luminosité, saturation (en CIELCh) avec affichage avant/après ; modification d'une seule couleur sans toucher aux autres ; favoris ; historique des 20 dernières palettes ; comparaison de 2 ou 3 palettes ; exports JSON, CSV et fiche imprimable.

**Tenues** : cinq emplacements (haut, veste/manteau, bas, chaussures, accessoire) avec types de vêtements, rôle de chaque couleur (dominante, secondaire, accent, neutre), générateur à trois niveaux de style (sobre, casual, audacieux), répartition cible réglable (60/30/10, etc.), aperçu schématique, analyse détaillée, substitutions et alternatives applicables en un clic, variantes comparables.

**Associations** (onglet dédié) : trois générateurs qui puisent dans la bibliothèque de couleurs vestimentaires. (1) Trois couleurs qui vont ensemble, six propositions. (2) Vous choisissez une couleur (sélecteur, HEX, bibliothèque ou couleur du cercle) et l'application propose six couples de deux autres couleurs. (3) Vous choisissez deux couleurs et elle propose six troisièmes couleurs. « Autres propositions » tire d'autres alternatives, « → Tenue » envoie l'association au générateur de tenues. Chaque proposition affiche sa structure de teintes, un indice de compatibilité et ses atouts ou points d'attention.

**Exemple** : moutarde `#C49A24`, marine `#203A5B`, rouge brique `#A83232`, avec calculs réels et trois versions vestimentaires.

**Accessibilité** : navigation clavier, étiquettes ARIA, libellés textuels en plus des couleurs, simulation de protanopie/deutéranopie/tritanopie, thèmes clair et sombre, respect de `prefers-reduced-motion`.

## Ce que dit l'exemple moutarde / marine / rouge

Teintes HSL réelles : moutarde **44,25°**, marine **213,56°**, rouge brique **0°**. Écarts successifs : 44,3° / 146,4° / 169,3°.

- Ce **n'est pas une triade stricte** (120°/120°/120°) : l'écart maximal à ce modèle est de **75,8°**.
- La structure la plus proche est celle des **complémentaires divisées** centrées sur le marine (écart au modèle : 11,4°) : deux teintes chaudes voisines (moutarde et rouge, 44° d'écart) face à une teinte froide presque opposée.
- En perception (CIEDE2000) : moutarde–marine 58,4 ; marine–rouge 38,1 ; rouge–moutarde 43,9. Le marine est bien plus foncé (L* 24) que le moutarde (L* 66) : le contraste de clarté pèse plus que l'angle de teinte.

## Limites (à lire)

- **Associations** : l'indice (0–100) est une heuristique (structure des teintes HSL, écarts de clarté et ΔE00, nombre de couleurs vives, présence de neutres), pas un verdict. Les couleurs ajoutées viennent de la bibliothèque (~40 couleurs) ; pour ce module, un neutre est une couleur de chroma < 12 ou à ΔE00 < 6 d'un neutre de référence (le bleu roi ou l'ocre ne sont donc pas neutres).

- **Mesure ≠ esthétique.** Les angles HSL sont géométriques ; les ΔE00 sont perceptuels ; les conseils (couleurs vives, 60/30/10, facilité de port) sont des heuristiques de stylisme, jamais des verdicts. Les seuils (chroma ≥ 40 = « vive », ΔE00 < 8 = « très proches »…) sont des choix pratiques, modifiables dans `js/outfit.js`.
- **Couleurs peu saturées** (noir, blanc, gris, beiges pâles) : la teinte HSL n'est pas significative. Elles sont repérées (chroma CIELAB < 8) et signalées « n.s. » ; aucun angle n'en est tiré. Une base grise déclenche un avertissement.
- **Écran ≠ tissu.** Matière, texture, éclairage et écran modifient le rendu. Les HEX de la bibliothèque sont indicatifs.
- **Photos** : l'extraction (k-means en CIELAB sur une image réduite) donne des points de départ, pas les couleurs réelles du tissu.
- **Température** chaud/froid : classement par plage de teinte ; verts et violets sont « tempérés ».
- **Pas de colorimétrie personnelle** : le sous-ton d'une couleur n'est pas celui d'une personne ; l'application n'attribue aucune « saison ».
- **Répartition 60/30/10** : estimée à partir de surfaces moyennes par pièce (haut 35, veste 25, bas 30, chaussures 8, accessoire 6), c'est une approximation.
- **Gamut** : en CIELCh, un réglage extrême peut sortir du gamut sRGB ; la couleur est alors ramenée dans le gamut (donc modifiée).
- **Simulation de daltonisme** : matrices de Machado et al. (2009), sévérité maximale, approximation.
- Modifier la base ou la méthode efface les modifications manuelles d'une couleur (elles dépendent de la palette calculée).
- Le test de fumée tourne dans jsdom, pas dans un vrai navigateur ; le glisser-déposer au pointeur n'a pas été testé automatiquement.
