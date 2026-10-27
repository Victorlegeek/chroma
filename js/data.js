/* ============================================================
   data.js — Bibliothèque de couleurs vestimentaires et fiches des méthodes
   Les codes HEX sont des valeurs INDICATIVES d'écran : le rendu réel d'un
   tissu dépend de la matière, de l'éclairage et de l'écran.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./color-engine.js'));
  else root.ClothingData = factory(root.ColorEngine);
})(typeof self !== 'undefined' ? self : this, function (CE) {
  'use strict';

  const FAMILIES = ['Bleus', 'Verts', 'Jaunes & orangés', 'Rouges', 'Neutres', 'Bruns', 'Autres teintes'];

  const LIBRARY = [
    ['Bleu marine', '#203A5B', 0], ['Bleu roi', '#2B4FA3', 0], ['Bleu ciel', '#8DB8E0', 0], ['Bleu gris', '#6C8294', 0],
    ['Denim', '#3F5F8A', 0], ['Denim clair', '#7A97BA', 0], ['Bleu pétrole', '#1F5A67', 0],
    ['Vert forêt', '#234B33', 1], ['Vert olive', '#6B6B2A', 1], ['Kaki', '#7A7547', 1], ['Sauge', '#9CAF94', 1], ['Vert émeraude', '#1F8A5B', 1],
    ['Jaune moutarde', '#C49A24', 2], ['Ocre', '#BF7B2A', 2], ['Jaune pâle', '#F0E3A0', 2], ['Orange brûlé', '#CC5A1F', 2],
    ['Rouge brique', '#A83232', 3], ['Bordeaux', '#6B1F2E', 3], ['Rouge profond', '#8F1D21', 3], ['Terracotta', '#C0694A', 3],
    ['Blanc', '#FFFFFF', 4], ['Blanc cassé', '#F4F1EA', 4], ['Écru', '#EDE3CF', 4], ['Crème', '#F5EBD0', 4], ['Beige', '#D6BF9C', 4],
    ['Taupe', '#8B7B6E', 4], ['Gris clair', '#C8CACC', 4], ['Gris anthracite', '#3C4043', 4], ['Noir', '#121212', 4],
    ['Brun chocolat', '#4A3126', 5], ['Camel', '#B5875A', 5], ['Cognac', '#8B4A1F', 5], ['Marron', '#6E4B32', 5], ['Noisette', '#9A7350', 5],
    ['Violet', '#6B3FA0', 6], ['Prune', '#5A2845', 6], ['Rose poudré', '#E3B7B5', 6], ['Vieux rose', '#C98E96', 6], ['Lavande grisée', '#A79BBE', 6],
  ].map(([name, hex, f]) => ({ name, hex, family: FAMILIES[f] }));

  function nearestName(hex) {
    const lab = CE.hexToLab(hex);
    let best = null;
    LIBRARY.forEach((c) => {
      const d = CE.deltaE2000(lab, CE.hexToLab(c.hex));
      if (!best || d < best.deltaE) best = { name: c.name, hex: c.hex, deltaE: d };
    });
    return best;
  }

  const METHODS = {
    monochromatic: {
      definition: 'Une seule teinte déclinée en plusieurs luminosités et saturations.',
      logique: 'On garde la même direction sur la roue et on fait varier uniquement la clarté (et légèrement la saturation).',
      avantages: 'Très cohérent, quasi impossible à rater, allonge visuellement la silhouette.',
      limites: 'Peut sembler plat sans variation de matière ; les tons doivent rester assez distincts pour ne pas se confondre.',
      situations: 'Tenue de bureau tout bleu ou tout brun, total look sobre, ensemble pull + pantalon de la même famille.',
    },
    analogous: {
      definition: 'Trois teintes voisines sur la roue (par défaut ±30° autour de la base).',
      logique: 'Des teintes proches partagent des sous-tons communs : la transition est douce.',
      avantages: 'Harmonie naturelle et apaisante, facile à porter.',
      limites: 'Contraste de teinte faible : il faut jouer sur la clarté pour éviter l\'effet « tout pareil ».',
      situations: 'Association vert olive / kaki / jaune moutarde, bleu / bleu-vert, rouge brique / orange brûlé.',
    },
    complementary: {
      definition: 'Deux teintes opposées sur la roue HSL (écart de 180°).',
      logique: 'Le contraste de teinte maximal sur la roue crée une tension qui met chaque couleur en valeur.',
      avantages: 'Impact fort, lisible, simple à construire.',
      limites: 'L\'opposition HSL n\'est pas une opposition perceptive exacte ; à pleine saturation et à surface égale, l\'effet est dur.',
      situations: 'Marine + moutarde, bleu + orange : une couleur en grande surface, l\'autre en touche.',
    },
    split: {
      definition: 'Une teinte + les deux voisines de sa complémentaire (180° ± 30° par défaut).',
      logique: 'On garde un contraste marqué tout en adoucissant la tension du complémentaire pur.',
      avantages: 'Plus nuancé que le complémentaire, offre une teinte intermédiaire pour les accessoires.',
      limites: 'Trois couleurs actives : plus facile à surcharger ; demande des neutres.',
      situations: 'Marine avec brique et moutarde, vert avec rouge brique et rose, ensemble casual avec denim comme neutre.',
    },
    triad: {
      definition: 'Trois teintes régulièrement espacées de 120° sur la roue.',
      logique: 'Équilibre géométrique maximal entre trois familles de teintes.',
      avantages: 'Riche et dynamique tout en restant structuré.',
      limites: 'Une triade stricte à saturation pleine est très voyante ; à utiliser avec une couleur dominante et des neutres.',
      situations: 'Looks créatifs, pièces à motifs, tenue streetwear : une teinte dominante, une secondaire, une touche.',
    },
    double: {
      definition: 'Deux paires de complémentaires voisines (base, base+30°, et leurs opposées).',
      logique: 'Deux contrastes complémentaires superposés, avec des teintes proches deux à deux.',
      avantages: 'Palette riche en nuances exploitables.',
      limites: 'Quatre couleurs actives : très exigeant à doser ; un neutre est presque indispensable.',
      situations: 'Palette de saison (ex. orange/rouge face à bleu/bleu-vert) en gardant 2 couleurs au maximum en vêtements.',
    },
    rectangle: {
      definition: 'Quatre teintes formant un rectangle sur la roue (par défaut 60° et 120° d\'écart).',
      logique: 'Deux paires de complémentaires plus espacées que la tétrade double, sans être un carré.',
      avantages: 'Grande variété, deux axes de contraste.',
      limites: 'Peu de teintes dominantes évidentes ; il faut hiérarchiser fortement.',
      situations: 'Choix de pièces polyvalentes dans une garde-robe capsule ; une dominante et deux accents au plus par tenue.',
    },
    custom: {
      definition: 'Accord défini par l\'utilisateur : nombre de couleurs et angles libres.',
      logique: 'Chaque couleur est placée à l\'angle indiqué par rapport à la base. La géométrie ne vaut que ce que vaut le résultat visuel.',
      avantages: 'Liberté totale, permet d\'explorer des structures non standard.',
      limites: 'Aucune garantie d\'harmonie ; un angle choisi au hasard donne un résultat incertain.',
      situations: 'Reproduire une association observée, tester une variante d\'une harmonie classique.',
    },
    neutral: {
      definition: 'Une couleur de base accompagnée de neutres choisis selon son sous-ton (blanc cassé, écru, gris, noir, marine, denim, bruns).',
      logique: 'Les neutres laissent la couleur forte respirer ; ils sont choisis chauds ou froids selon la teinte de la base.',
      avantages: 'Très facile à porter, très polyvalent, sécurise les tenues quotidiennes.',
      limites: 'Peut manquer de caractère ; les sous-tons doivent rester cohérents entre eux.',
      situations: 'Tenue de bureau, base de garde-robe, mise en valeur d\'une seule pièce colorée.',
    },
    tonal: {
      definition: 'Teintes différentes mais de même clarté perçue (L* CIELAB égalisé) et de même saturation HSL.',
      logique: 'On égalise la clarté perçue pour que les couleurs semblent « du même ton ».',
      avantages: 'Les couleurs cohabitent sans qu\'aucune ne domine par sa clarté ; rendu doux.',
      limites: 'Contraste de clarté faible : peu de relief ; à compléter par un neutre plus clair ou plus foncé.',
      situations: 'Pulls et chemises en tons sourds, palette automnale cohérente.',
    },
    temperature: {
      definition: 'Association d\'une teinte avec des teintes de température opposée (chaudes face aux froides).',
      logique: 'Chaud/froid est une classification par plage de teinte (heuristique), pas une mesure physique.',
      avantages: 'Contraste lisible, très utilisé en stylisme (camel + marine, brique + bleu).',
      limites: 'Les verts et violets sont « tempérés » : la classification y est ambiguë.',
      situations: 'Veste camel et pantalon marine, pull terracotta et jean.',
    },
    lightness: {
      definition: 'Association de couleurs claires, moyennes et foncées.',
      logique: 'Le contraste de clarté structure la silhouette plus fortement que le contraste de teinte.',
      avantages: 'Lisible de loin, flatteur, fonctionne même avec des teintes proches.',
      limites: 'Si la teinte varie beaucoup en plus de la clarté, l\'ensemble peut devenir chargé.',
      situations: 'Haut clair + bas foncé, manteau foncé sur pull moyen, accessoire clair en rappel.',
    },
    saturation: {
      definition: 'Une couleur intense associée à des teintes sourdes (peu saturées).',
      logique: 'La couleur vive attire l\'œil ; les tons sourds l\'encadrent sans concurrence.',
      avantages: 'Effet « accent » net, très contemporain, facile à doser.',
      limites: 'Si la couleur vive est en trop grande surface, l\'effet s\'inverse ; vérifier le rendu en lumière réelle.',
      situations: 'Pull moutarde vif sur base grège et denim, écharpe rouge sur manteau gris.',
    },
  };

  return { FAMILIES, LIBRARY, METHODS, nearestName };
});
