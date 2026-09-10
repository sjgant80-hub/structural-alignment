// band.mjs — band-filtered training, WITH THE GATE THAT EARNS IT THE RUNNING COLUMN.
//
// Contribution 7 of this repo shipped honestly labelled SPEC: a filter that "should work"
// is a belief, and this estate's law is that only a witness says what happened. This file
// is the missing piece — not the filter, the GATE: three falsifiable, mutation-tested
// checks. All three pass → contribution 7 moves SPEC → RUNNING. Any fails → it stays SPEC.
//
//   GATE 1  sortingGate    — the scorer sorts a hand-labelled set 100% correctly
//   GATE 2  collapseGate   — a band-filtered lineage HOLDS where an unfiltered one DECAYS
//   GATE 3  bookingGate    — the filter cannot cheat its own booking (no silent band-widening)
//
// THE SCORER, honestly: an explicit lexical-redundancy proxy. Natural language lives in a
// band of redundancy — degenerate repetition (slop) sits below it, disconnected boilerplate
// (rote: field lists, button labels, keyword stuffing) sits above it. score = distinct
// words / total words. A semantic scorer plugs into the same port; the three GATES are
// scorer-agnostic machinery and gate whatever is wired to that port. The collapse run is a
// SIMULATION of the degenerate-feedback dynamic (each generation injects repetition, the
// way model-collapse compounds scraped model output); it demonstrates the filter dynamic,
// not language-model semantics — said plainly here and on the page.
//
// Pure and total; Number.isFinite guards, one condition per line, deterministic PRNG.

const isFin = (v) => Number.isFinite(v);

export const DEFAULT_BAND = Object.freeze({ lo: 0.35, hi: 0.85 });

const words = (text) => text.toLowerCase().match(/[a-z]+/g) || [];

// The band score: distinct words / total words, rounded to 4dp. Needs at least 8 words —
// a fragment has no measurable redundancy.
export function bandScore(text) {
  if (typeof text !== 'string') return { ok: false, why: 'bandScore reads a text string' };
  const w = words(text);
  if (w.length < 8) return { ok: false, why: 'need at least 8 words to measure redundancy, got ' + w.length };
  const distinct = new Set(w).size;
  const score = Math.round((distinct / w.length) * 10000) / 10000;
  return { ok: true, score, words: w.length, distinct };
}

function badBand(band) {
  if (typeof band !== 'object') return 'band is { lo, hi }';
  if (band === null) return 'band is { lo, hi }';
  if (!isFin(band.lo)) return 'band.lo must be a finite number';
  if (!isFin(band.hi)) return 'band.hi must be a finite number';
  if (band.lo < 0) return 'band.lo cannot be negative';
  if (band.hi > 1) return 'band.hi cannot exceed 1';
  if (!(band.lo < band.hi)) return 'band.lo must be below band.hi';
  return null;
}

// Classify one text: below the band is slop, above it is rote, inside (inclusive) is living.
export function classify(text, band) {
  const bb = badBand(band);
  if (bb !== null) return { ok: false, why: bb };
  const s = bandScore(text);
  if (!s.ok) return { ok: false, why: s.why };
  let cls = 'living';
  if (s.score < band.lo) cls = 'slop';
  if (s.score > band.hi) cls = 'rote';
  return { ok: true, cls, score: s.score };
}

// ── GATE 1 · THE SORTING GATE ────────────────────────────────────────────────────────────
// A hand-labelled set must sort 100% correctly. One misclassification kills the gate.
const LABELS = Object.freeze(['slop', 'living', 'rote']);

export function sortingGate(labelled, band) {
  if (!Array.isArray(labelled)) return { ok: false, why: 'labelled must be an array of { text, label }' };
  if (labelled.length === 0) return { ok: false, why: 'labelled must be non-empty — an empty gate proves nothing' };
  const bb = badBand(band);
  if (bb !== null) return { ok: false, why: bb };
  const results = [];
  for (const item of labelled) {
    if (typeof item !== 'object') return { ok: false, why: 'each labelled item is { text, label }' };
    if (item === null) return { ok: false, why: 'each labelled item is { text, label }' };
    if (!LABELS.includes(item.label)) return { ok: false, why: 'label must be slop|living|rote, got "' + String(item.label) + '"' };
    const c = classify(item.text, band);
    if (!c.ok) return { ok: false, why: c.why };
    results.push({ label: item.label, cls: c.cls, score: c.score, correct: c.cls === item.label });
  }
  const correct = results.filter((r) => r.correct).length;
  return { ok: true, pass: correct === results.length, correct, total: results.length, results };
}

// ── GATE 2 · THE COLLAPSE-RESISTANCE GATE ────────────────────────────────────────────────
// Deterministic degenerate-feedback: each generation duplicates a phrase of its own output
// (an LCG picks where), the way collapse compounds. Unfiltered lineages accept every
// generation; filtered lineages refuse any generation the band rejects.
export function lcgNext(seed) {
  if (!Number.isInteger(seed)) return { ok: false, why: 'seed must be an integer' };
  if (seed < 0) return { ok: false, why: 'seed cannot be negative' };
  return { ok: true, seed: (Math.imul(seed, 1664525) + 1013904223) >>> 0 };
}

export function degrade(text, seed) {
  const s = bandScore(text);
  if (!s.ok) return { ok: false, why: s.why };
  const n = lcgNext(seed);
  if (!n.ok) return { ok: false, why: n.why };
  const w = words(text);
  const start = n.seed % Math.max(1, w.length - 3);
  const phrase = w.slice(start, start + 3).join(' ');
  const injected = Array.from({ length: 8 }, () => phrase).join(' ');
  return { ok: true, text: text + ' ' + injected, seed: n.seed };
}

export function lineage(text, rounds, band, filtered, seed) {
  if (!Number.isInteger(rounds)) return { ok: false, why: 'rounds must be an integer' };
  if (rounds < 1) return { ok: false, why: 'rounds must be at least 1' };
  if (typeof filtered !== 'boolean') return { ok: false, why: 'filtered must be a boolean' };
  const bb = badBand(band);
  if (bb !== null) return { ok: false, why: bb };
  const first = bandScore(text);
  if (!first.ok) return { ok: false, why: first.why };
  let current = text;
  let s = seed;
  let refusals = 0;
  const trajectory = [first.score];
  let bad = null;
  Array.from({ length: rounds }).forEach(() => {
    if (bad !== null) return;
    const d = degrade(current, s);
    if (!d.ok) { bad = d.why; return; }
    s = d.seed;
    const c = classify(d.text, band);
    if (!c.ok) { bad = c.why; return; }
    if (filtered) {
      if (c.cls === 'living') current = d.text;
      else refusals = refusals + 1;
    } else {
      current = d.text;
    }
    trajectory.push(bandScore(current).score);
  });
  if (bad !== null) return { ok: false, why: bad };
  return { ok: true, trajectory, final: trajectory[trajectory.length - 1], refusals };
}

export function collapseGate(text, rounds, band, threshold, seed) {
  if (!isFin(threshold)) return { ok: false, why: 'threshold must be a finite number' };
  if (!(threshold > 0)) return { ok: false, why: 'threshold must be positive — a zero bar is not a bar' };
  const unfiltered = lineage(text, rounds, band, false, seed);
  if (!unfiltered.ok) return { ok: false, why: 'unfiltered lineage: ' + unfiltered.why };
  const filtered = lineage(text, rounds, band, true, seed);
  if (!filtered.ok) return { ok: false, why: 'filtered lineage: ' + filtered.why };
  const delta = Math.round((filtered.final - unfiltered.final) * 10000) / 10000;
  const decayed = unfiltered.final < unfiltered.trajectory[0];
  return { ok: true, pass: delta > threshold && decayed, delta, decayed, filtered, unfiltered };
}

// ── GATE 3 · THE HONEST-BOOKING GATE ─────────────────────────────────────────────────────
// The filter books every run: the band it USED, what it kept, what it dropped (with an
// audit sample), and the corpus distribution. The booking is frozen. The gate refuses a
// booking whose band is not EXACTLY the declared band — the anti-silent-widening check,
// the ConsentNarrows lesson turned on the filter itself.
export function runFilter(texts, band) {
  if (!Array.isArray(texts)) return { ok: false, why: 'texts must be an array' };
  if (texts.length === 0) return { ok: false, why: 'texts must be non-empty' };
  const bb = badBand(band);
  if (bb !== null) return { ok: false, why: bb };
  const kept = [];
  const distribution = { slop: 0, living: 0, rote: 0 };
  let dropped = 0;
  let droppedSample = null;
  let bad = null;
  texts.forEach((t) => {
    if (bad !== null) return;
    const c = classify(t, band);
    if (!c.ok) { bad = c.why; return; }
    distribution[c.cls] = distribution[c.cls] + 1;
    if (c.cls === 'living') kept.push(t);
    else {
      dropped = dropped + 1;
      if (droppedSample === null) droppedSample = String(t).slice(0, 120);
    }
  });
  if (bad !== null) return { ok: false, why: bad };
  const booking = Object.freeze({
    band: Object.freeze({ lo: band.lo, hi: band.hi }),
    total: texts.length, kept: kept.length, dropped, droppedSample,
    distribution: Object.freeze(distribution),
  });
  return { ok: true, kept, booking };
}

export function bookingGate(booking, declaredBand) {
  if (typeof booking !== 'object') return { ok: false, why: 'booking must be an object' };
  if (booking === null) return { ok: false, why: 'booking must be an object' };
  const bb = badBand(declaredBand);
  if (bb !== null) return { ok: false, why: 'declared ' + bb };
  const failures = [];
  if (!Object.isFrozen(booking)) failures.push('booking is not frozen — a mutable booking is no booking');
  if (typeof booking.band !== 'object') failures.push('booking carries no band');
  else if (booking.band === null) failures.push('booking carries no band');
  else {
    if (booking.band.lo !== declaredBand.lo) failures.push('band.lo ' + booking.band.lo + ' is not the declared ' + declaredBand.lo + ' — the band moved');
    if (booking.band.hi !== declaredBand.hi) failures.push('band.hi ' + booking.band.hi + ' is not the declared ' + declaredBand.hi + ' — the band moved');
  }
  if (!Number.isInteger(booking.total)) failures.push('total must be an integer');
  else {
    if (booking.kept + booking.dropped !== booking.total) failures.push('kept + dropped does not equal total — samples vanished');
    const d = booking.distribution;
    if (typeof d !== 'object') failures.push('no distribution recorded');
    else if (d === null) failures.push('no distribution recorded');
    else if (d.slop + d.living + d.rote !== booking.total) failures.push('distribution does not sum to total');
  }
  if (booking.dropped > 0) {
    if (typeof booking.droppedSample !== 'string') failures.push('samples were dropped but no audit sample kept');
    else if (booking.droppedSample.length === 0) failures.push('samples were dropped but no audit sample kept');
  }
  return { ok: true, pass: failures.length === 0, failures };
}

// ── THE VERDICT · how contribution 7 moves columns ───────────────────────────────────────
export function bandGateVerdict(g1, g2, g3) {
  const shaped = (g) => {
    if (typeof g !== 'object') return false;
    if (g === null) return false;
    if (g.ok !== true) return false;
    if (typeof g.pass !== 'boolean') return false;
    return true;
  };
  if (!shaped(g1)) return { ok: false, why: 'gate 1 result malformed or not ok' };
  if (!shaped(g2)) return { ok: false, why: 'gate 2 result malformed or not ok' };
  if (!shaped(g3)) return { ok: false, why: 'gate 3 result malformed or not ok' };
  const running = g1.pass && g2.pass && g3.pass;
  return { ok: true, running, column: running ? 'RUNNING' : 'SPEC' };
}
