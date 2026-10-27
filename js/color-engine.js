/* ============================================================
   color-engine.js — Moteur colorimétrique (sans dépendance)
   Modèles : sRGB / HEX, HSL (géométrie du cercle), CIE XYZ (D65),
   CIELAB, CIELCh, CIEDE2000, contraste WCAG, simulation de daltonisme.
   Fonctionne dans le navigateur (global ColorEngine) et sous Node.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ColorEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class ColorError extends Error {
    constructor(message) { super(message); this.name = 'ColorError'; }
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const mod360 = (h) => ((h % 360) + 360) % 360;
  const round = (v, d = 0) => { const f = Math.pow(10, d); return Math.round(v * f) / f; };

  // Point blanc D65 (observateur 2°), référence sRGB
  const WHITE = { X: 0.95047, Y: 1.0, Z: 1.08883 };

  /* ---------- Validation et HEX ---------- */

  function parseHex(input) {
    if (typeof input !== 'string') throw new ColorError('Le code HEX doit être une chaîne de caractères.');
    let s = input.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(s)) {
      throw new ColorError('Code HEX invalide : utilisez 3 ou 6 caractères hexadécimaux (ex. #C49A24).');
    }
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
  }

  function toNumber(v, label, lo, hi) {
    if (v === '' || v === null || v === undefined || typeof v === 'boolean') {
      throw new ColorError(`Valeur manquante : ${label}.`);
    }
    const n = Number(v);
    if (!Number.isFinite(n)) throw new ColorError(`Valeur non numérique : ${label}.`);
    if (n < lo || n > hi) throw new ColorError(`${label} hors limites (${lo} à ${hi}).`);
    return n;
  }

  // Rejette (et ne corrige pas) toute valeur hors de 0–255 ; arrondit à l'entier.
  function validateRgb(c) {
    if (!c || typeof c !== 'object') throw new ColorError('Couleur RGB invalide.');
    return {
      r: Math.round(toNumber(c.r, 'R', 0, 255)),
      g: Math.round(toNumber(c.g, 'G', 0, 255)),
      b: Math.round(toNumber(c.b, 'B', 0, 255)),
    };
  }

  function validateHsl(c) {
    if (!c || typeof c !== 'object') throw new ColorError('Couleur HSL invalide.');
    return {
      h: toNumber(c.h, 'Teinte (H)', 0, 360),
      s: toNumber(c.s, 'Saturation (S)', 0, 100),
      l: toNumber(c.l, 'Luminosité (L)', 0, 100),
    };
  }

  function rgbToHex(c) {
    const { r, g, b } = validateRgb(c);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function normalizeHex(input) { return rgbToHex(parseHex(input)); }

  /* ---------- HSL ---------- */

  function rgbToHsl(c) {
    const { r, g, b } = validateRgb(c);
    const R = r / 255, G = g / 255, B = b / 255;
    const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === R) h = 60 * (((G - B) / d) % 6);
      else if (max === G) h = 60 * ((B - R) / d + 2);
      else h = 60 * ((R - G) / d + 4);
    }
    return { h: mod360(h), s: clamp(s, 0, 1) * 100, l: l * 100 };
  }

  function hslToRgb(c) {
    const { h, s, l } = validateHsl(c);
    const S = s / 100, L = l / 100, H = mod360(h);
    const k = (1 - Math.abs(2 * L - 1)) * S;
    const x = k * (1 - Math.abs(((H / 60) % 2) - 1));
    const m = L - k / 2;
    let r1 = 0, g1 = 0, b1 = 0;
    if (H < 60) { r1 = k; g1 = x; }
    else if (H < 120) { r1 = x; g1 = k; }
    else if (H < 180) { g1 = k; b1 = x; }
    else if (H < 240) { g1 = x; b1 = k; }
    else if (H < 300) { r1 = x; b1 = k; }
    else { r1 = k; b1 = x; }
    const f = (v) => clamp(Math.round((v + m) * 255), 0, 255);
    return { r: f(r1), g: f(g1), b: f(b1) };
  }

  const hslToHex = (hsl) => rgbToHex(hslToRgb(hsl));
  const hexToHsl = (hex) => rgbToHsl(parseHex(hex));

  /* ---------- sRGB ↔ XYZ ↔ CIELAB ↔ CIELCh ---------- */

  const toLinear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const fromLinear = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return v * 255;
  };

  function rgbToXyz(c) {
    const { r, g, b } = validateRgb(c);
    const R = toLinear(r), G = toLinear(g), B = toLinear(b);
    return {
      X: 0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
      Y: 0.2126729 * R + 0.7151522 * G + 0.0721750 * B,
      Z: 0.0193339 * R + 0.1191920 * G + 0.9503041 * B,
    };
  }

  function xyzToRgbRaw(xyz) {
    const { X, Y, Z } = xyz;
    const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
    const G = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
    const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
    return [R, G, B];
  }

  const EPS = 216 / 24389, KAPPA = 24389 / 27;
  const labF = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  const labFinv = (t) => { const t3 = t * t * t; return t3 > EPS ? t3 : (116 * t - 16) / KAPPA; };

  function xyzToLab(xyz) {
    const fx = labF(xyz.X / WHITE.X), fy = labF(xyz.Y / WHITE.Y), fz = labF(xyz.Z / WHITE.Z);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }

  function labToXyz(lab) {
    const fy = (lab.L + 16) / 116, fx = fy + lab.a / 500, fz = fy - lab.b / 200;
    return { X: WHITE.X * labFinv(fx), Y: WHITE.Y * labFinv(fy), Z: WHITE.Z * labFinv(fz) };
  }

  const rgbToLab = (rgb) => xyzToLab(rgbToXyz(rgb));
  const hexToLab = (hex) => rgbToLab(parseHex(hex));

  // Retourne un RGB valide ; `clipped` indique que la couleur Lab sort du gamut sRGB.
  function labToRgb(lab) {
    const raw = xyzToRgbRaw(labToXyz(lab));
    let clipped = false;
    const out = raw.map((v) => {
      const eps = 1e-4;
      if (v < -eps || v > 1 + eps) clipped = true;
      return clamp(Math.round(fromLinear(clamp(v, 0, 1))), 0, 255);
    });
    return { r: out[0], g: out[1], b: out[2], clipped };
  }

  function labToLch(lab) {
    const C = Math.hypot(lab.a, lab.b);
    return { L: lab.L, C, h: C < 1e-9 ? 0 : mod360(Math.atan2(lab.b, lab.a) * 180 / Math.PI) };
  }
  function lchToLab(lch) {
    const r = lch.h * Math.PI / 180;
    return { L: lch.L, a: lch.C * Math.cos(r), b: lch.C * Math.sin(r) };
  }

  /* ---------- CIEDE2000 (Sharma, Wu, Dalal 2005) ---------- */

  function deltaE2000(lab1, lab2) {
    const rad = Math.PI / 180, deg = 180 / Math.PI;
    const { L: L1, a: a1, b: b1 } = lab1, { L: L2, a: a2, b: b2 } = lab2;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    const Cb7 = Math.pow((C1 + C2) / 2, 7);
    const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + Math.pow(25, 7))));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h1p = (a1p === 0 && b1 === 0) ? 0 : mod360(Math.atan2(b1, a1p) * deg);
    const h2p = (a2p === 0 && b2 === 0) ? 0 : mod360(Math.atan2(b2, a2p) * deg);
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * rad / 2);
    const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp;
    if (C1p * C2p === 0) hbp = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = (h1p + h2p < 360) ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
      + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
    const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const Cbp7 = Math.pow(Cbp, 7);
    const Rc = 2 * Math.sqrt(Cbp7 / (Cbp7 + Math.pow(25, 7)));
    const Sl = 1 + 0.015 * Math.pow(Lbp - 50, 2) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
    const Rt = -Math.sin(2 * dTheta * rad) * Rc;
    const tl = dLp / Sl, tc = dCp / Sc, th = dHp / Sh;
    return Math.sqrt(tl * tl + tc * tc + th * th + Rt * tc * th);
  }

  const deltaEHex = (h1, h2) => deltaE2000(hexToLab(h1), hexToLab(h2));

  /* ---------- Luminance et contraste WCAG ---------- */

  function relativeLuminance(rgb) {
    const { r, g, b } = validateRgb(rgb);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }
  function contrastRatio(hexA, hexB) {
    const la = relativeLuminance(parseHex(hexA)), lb = relativeLuminance(parseHex(hexB));
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function readableTextColor(hex) {
    return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#111111') ? '#FFFFFF' : '#111111';
  }

  /* ---------- Description complète d'une couleur ---------- */

  // Au-dessous de ce chroma CIELAB, la teinte HSL n'a pas de signification perceptive fiable.
  const MIN_CHROMA_FOR_HUE = 8;

  function describe(hexInput) {
    const hex = normalizeHex(hexInput);
    const rgb = parseHex(hex);
    const hsl = rgbToHsl(rgb);
    const lab = rgbToLab(rgb);
    const lch = labToLch(lab);
    const hueReliable = lch.C >= MIN_CHROMA_FOR_HUE && hsl.s >= 5;
    return { hex, rgb, hsl, lab, lch, hueReliable, luminance: relativeLuminance(rgb) };
  }

  /* ---------- Simulation de daltonisme (Machado et al. 2009, sévérité 1,0) ---------- */

  const CVD = {
    protanopie: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deuteranopie: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    tritanopie: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
  };

  function simulateCvd(hex, type) {
    if (!type || type === 'none') return normalizeHex(hex);
    const m = CVD[type];
    if (!m) throw new ColorError('Type de simulation inconnu : ' + type);
    const { r, g, b } = parseHex(hex);
    const lin = [toLinear(r), toLinear(g), toLinear(b)];
    const out = m.map((row) => clamp(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2], 0, 1))
      .map((v) => clamp(Math.round(fromLinear(v)), 0, 255));
    return rgbToHex({ r: out[0], g: out[1], b: out[2] });
  }

  /* ---------- Extraction de couleurs dominantes (k-means en CIELAB) ---------- */

  // pixels : tableau de [r, g, b]. Initialisation déterministe de type « farthest point ».
  function extractPalette(pixels, k = 5, iterations = 12) {
    if (!Array.isArray(pixels) || pixels.length === 0) throw new ColorError('Aucun pixel à analyser.');
    const step = Math.max(1, Math.floor(pixels.length / 4000));
    const pts = [];
    for (let i = 0; i < pixels.length; i += step) {
      const p = pixels[i];
      const lab = rgbToLab({ r: p[0], g: p[1], b: p[2] });
      pts.push([lab.L, lab.a, lab.b]);
    }
    const dist2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
    k = Math.min(k, pts.length);
    const centers = [pts[0].slice()];
    while (centers.length < k) {
      let best = -1, bestD = -1;
      pts.forEach((p, i) => {
        const d = Math.min(...centers.map((c) => dist2(p, c)));
        if (d > bestD) { bestD = d; best = i; }
      });
      centers.push(pts[best].slice());
    }
    let assign = new Array(pts.length).fill(0);
    for (let it = 0; it < iterations; it++) {
      pts.forEach((p, i) => {
        let bi = 0, bd = Infinity;
        centers.forEach((c, j) => { const d = dist2(p, c); if (d < bd) { bd = d; bi = j; } });
        assign[i] = bi;
      });
      const sums = centers.map(() => [0, 0, 0, 0]);
      pts.forEach((p, i) => { const s = sums[assign[i]]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; });
      sums.forEach((s, j) => { if (s[3] > 0) centers[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    }
    const counts = centers.map(() => 0);
    assign.forEach((j) => counts[j]++);
    return centers.map((c, j) => {
      const rgb = labToRgb({ L: c[0], a: c[1], b: c[2] });
      return { hex: rgbToHex(rgb), share: counts[j] / pts.length };
    }).filter((x) => x.share > 0).sort((a, b) => b.share - a.share);
  }

  return {
    ColorError, clamp, mod360, round, WHITE, MIN_CHROMA_FOR_HUE,
    parseHex, validateRgb, validateHsl, rgbToHex, normalizeHex,
    rgbToHsl, hslToRgb, hslToHex, hexToHsl,
    rgbToXyz, xyzToLab, labToXyz, rgbToLab, hexToLab, labToRgb, labToLch, lchToLab,
    deltaE2000, deltaEHex, relativeLuminance, contrastRatio, readableTextColor,
    describe, simulateCvd, extractPalette,
  };
});
