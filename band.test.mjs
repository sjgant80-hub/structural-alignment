import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BAND, bandScore, classify, sortingGate, lcgNext, degrade, lineage, collapseGate, runFilter, bookingGate, bandGateVerdict } from './band.mjs';

const LIVING = 'a gate that cannot fail is not a gate because the proof it gives you is the same proof it gives everyone who never ran it';
const LABELLED = [
  { text: 'the cat sat the cat sat the cat sat the cat sat', label: 'slop' },
  { text: 'buy now buy now buy now buy now buy now buy now', label: 'slop' },
  { text: 'the quick brown fox jumps over the lazy dog and then the dog runs back over the same field to find the fox again', label: 'living' },
  { text: LIVING, label: 'living' },
  { text: 'name email address phone city country postcode company title date', label: 'rote' },
  { text: 'click here submit continue accept confirm proceed next finish done', label: 'rote' },
];

// ── the scorer
test('bandScore: pinned on the labelled material', () => {
  assert.equal(bandScore(LABELLED[0].text).score, 0.25);       // 3/12
  assert.equal(bandScore(LABELLED[1].text).score, 0.1667);     // 2/12
  assert.equal(bandScore(LIVING).score, 0.6923);               // 18/26
  assert.equal(bandScore(LABELLED[4].text).score, 1);          // 10/10
  assert.equal(bandScore('one two three four five six seven eight').words, 8);
});

test('bandScore: total on garbage, needs 8 words', () => {
  assert.equal(bandScore(42).ok, false);
  assert.equal(bandScore(null).ok, false);
  assert.equal(bandScore('seven words are not quite enough here'.slice(0, 30)).ok, false);
  assert.equal(bandScore('one two three four five six seven').ok, false);   // exactly 7
  assert.equal(bandScore('one two three four five six seven eight').ok, true); // exactly 8 (kills < 8 → <= 8)
});

test('the default band is pinned', () => {
  assert.equal(DEFAULT_BAND.lo, 0.35);
  assert.equal(DEFAULT_BAND.hi, 0.85);
});

test('classify: slop below, living inside (inclusive), rote above', () => {
  assert.equal(classify(LABELLED[0].text, DEFAULT_BAND).cls, 'slop');
  assert.equal(classify(LIVING, DEFAULT_BAND).cls, 'living');
  assert.equal(classify(LABELLED[4].text, DEFAULT_BAND).cls, 'rote');
  // exact band edges are LIVING (inclusive) — kills < → <= and > → >=
  const atLo = 'a b c d e f g a b c d e f g a b c d e f';        // 20 words, 7 distinct = 0.35
  assert.equal(bandScore(atLo).score, 0.35);
  assert.equal(classify(atLo, DEFAULT_BAND).cls, 'living');
  const atHi = 'a a a a b c d e f g h i j k l m n o p q';        // 20 words, 17 distinct = 0.85
  assert.equal(bandScore(atHi).score, 0.85);
  assert.equal(classify(atHi, DEFAULT_BAND).cls, 'living');
});

test('classify: band guards, each alone', () => {
  assert.equal(classify(LIVING, null).ok, false);
  assert.equal(classify(LIVING, { lo: 'x', hi: 0.8 }).ok, false);
  assert.equal(classify(LIVING, { lo: 0.3, hi: Infinity }).ok, false);
  assert.equal(classify(LIVING, { lo: -0.1, hi: 0.8 }).ok, false);
  assert.equal(classify(LIVING, { lo: 0.3, hi: 1.1 }).ok, false);
  assert.equal(classify(LIVING, { lo: 0.8, hi: 0.8 }).ok, false);   // lo must be < hi
  assert.equal(classify(LIVING, { lo: 0, hi: 1 }).ok, true);        // 0 and 1 are valid bounds
});

// ── GATE 1 · sorting
test('GATE 1 passes: the labelled set sorts 6/6', () => {
  const g = sortingGate(LABELLED, DEFAULT_BAND);
  assert.equal(g.ok, true);
  assert.equal(g.pass, true);
  assert.equal(g.correct, 6);
  assert.equal(g.total, 6);
});

test('GATE 1 mutation check: one swapped label KILLS the gate', () => {
  const swapped = LABELLED.map((x, i) => (i === 0 ? { text: x.text, label: 'living' } : x));
  const g = sortingGate(swapped, DEFAULT_BAND);
  assert.equal(g.ok, true);
  assert.equal(g.pass, false);
  assert.equal(g.correct, 5);
});

test('GATE 1: total on garbage', () => {
  assert.equal(sortingGate('x', DEFAULT_BAND).ok, false);
  assert.equal(sortingGate([], DEFAULT_BAND).ok, false);
  assert.equal(sortingGate([{ text: LIVING, label: 'good' }], DEFAULT_BAND).ok, false);
  assert.equal(sortingGate([null], DEFAULT_BAND).ok, false);
  assert.equal(sortingGate(LABELLED, { lo: 0.9, hi: 0.1 }).ok, false);
});

// ── GATE 2 · collapse resistance
test('the PRNG is deterministic and total', () => {
  assert.equal(lcgNext(42).seed, lcgNext(42).seed);
  assert.equal(lcgNext(1.5).ok, false);
  assert.equal(lcgNext(-1).ok, false);
  assert.equal(lcgNext(0).ok, true);          // 0 is a valid seed (kills < 0 → <= 0)
});

test('degrade injects repetition and lowers the score', () => {
  const d = degrade(LIVING, 42);
  assert.equal(d.ok, true);
  assert.ok(bandScore(d.text).score < bandScore(LIVING).score);
  assert.equal(degrade('too few words here', 42).ok, false);
});

test('GATE 2 passes: filtered HOLDS where unfiltered DECAYS — exact pinned trajectories', () => {
  const g = collapseGate(LIVING, 6, DEFAULT_BAND, 0.15, 42);
  assert.equal(g.ok, true);
  assert.equal(g.pass, true);
  assert.equal(g.decayed, true);
  assert.equal(g.delta, 0.2541);
  assert.deepEqual(g.unfiltered.trajectory, [0.6923, 0.36, 0.2432, 0.1837, 0.1475, 0.1233, 0.1059]);
  assert.deepEqual(g.filtered.trajectory, [0.6923, 0.36, 0.36, 0.36, 0.36, 0.36, 0.36]);
  assert.equal(g.filtered.refusals, 5);
  assert.equal(g.filtered.final, 0.36);
  assert.equal(g.unfiltered.final, 0.1059);
});

test('GATE 2 mutation check: fed slop anyway (filter off), the lineage decays', () => {
  const fed = lineage(LIVING, 6, DEFAULT_BAND, false, 42);
  assert.equal(fed.ok, true);
  assert.ok(fed.final < fed.trajectory[0], 'unfiltered must decay: ' + fed.final);
  assert.equal(fed.refusals, 0);
});

test('GATE 2: threshold and shape guards', () => {
  assert.equal(collapseGate(LIVING, 6, DEFAULT_BAND, 0, 42).ok, false);       // zero bar is not a bar
  assert.equal(collapseGate(LIVING, 6, DEFAULT_BAND, Infinity, 42).ok, false);
  assert.equal(collapseGate(LIVING, 0, DEFAULT_BAND, 0.15, 42).ok, false);    // rounds >= 1
  assert.equal(lineage(LIVING, 1, DEFAULT_BAND, false, 42).ok, true);         // exactly 1 round valid
  assert.equal(lineage(LIVING, 6, DEFAULT_BAND, 'yes', 42).ok, false);        // filtered must be boolean
  // a threshold ABOVE the real delta fails the gate honestly
  assert.equal(collapseGate(LIVING, 6, DEFAULT_BAND, 0.3, 42).pass, false);   // 0.2541 < 0.3 (kills > → >=? no: pins the bar)
});

// ── GATE 3 · honest booking
test('runFilter books the run: band, counts, audit sample, distribution — frozen', () => {
  const texts = LABELLED.map((x) => x.text);
  const r = runFilter(texts, DEFAULT_BAND);
  assert.equal(r.ok, true);
  assert.equal(r.booking.total, 6);
  assert.equal(r.booking.kept, 2);
  assert.equal(r.booking.dropped, 4);
  assert.deepEqual({ ...r.booking.distribution }, { slop: 2, living: 2, rote: 2 });
  assert.equal(typeof r.booking.droppedSample, 'string');
  assert.equal(Object.isFrozen(r.booking), true);
  assert.equal(Object.isFrozen(r.booking.band), true);
  assert.equal(r.kept.length, 2);
});

test('GATE 3 passes on an honest booking', () => {
  const r = runFilter(LABELLED.map((x) => x.text), DEFAULT_BAND);
  const g = bookingGate(r.booking, DEFAULT_BAND);
  assert.equal(g.ok, true);
  assert.equal(g.pass, true);
  assert.equal(g.failures.length, 0);
});

test('GATE 3 mutation check: a silently WIDENED band FAILS the gate', () => {
  const r = runFilter(LABELLED.map((x) => x.text), { lo: 0.2, hi: 0.85 });   // filter ran widened
  const g = bookingGate(r.booking, DEFAULT_BAND);                            // vs the declared band
  assert.equal(g.pass, false);
  assert.equal(g.failures.some((f) => f.includes('the band moved')), true);
});

test('GATE 3: an unfrozen booking, vanished samples, and a missing audit sample all fail', () => {
  const good = runFilter(LABELLED.map((x) => x.text), DEFAULT_BAND).booking;
  const thawed = { ...good };                                   // structurally same, NOT frozen
  assert.equal(bookingGate(thawed, DEFAULT_BAND).pass, false);
  const vanished = Object.freeze({ ...good, kept: 1 });         // 1 + 4 !== 6
  assert.equal(bookingGate(vanished, DEFAULT_BAND).failures.some((f) => f.includes('vanished')), true);
  const hidden = Object.freeze({ ...good, droppedSample: '' });
  assert.equal(bookingGate(hidden, DEFAULT_BAND).failures.some((f) => f.includes('audit sample')), true);
  assert.equal(bookingGate(null, DEFAULT_BAND).ok, false);
  assert.equal(bookingGate(good, { lo: 0.9, hi: 0.2 }).ok, false);
});

// ── the verdict
test('the verdict: all three pass → RUNNING; any fails → SPEC', () => {
  const p = { ok: true, pass: true };
  const f = { ok: true, pass: false };
  assert.equal(bandGateVerdict(p, p, p).running, true);
  assert.equal(bandGateVerdict(p, p, p).column, 'RUNNING');
  assert.equal(bandGateVerdict(f, p, p).column, 'SPEC');
  assert.equal(bandGateVerdict(p, f, p).column, 'SPEC');
  assert.equal(bandGateVerdict(p, p, f).column, 'SPEC');
  assert.equal(bandGateVerdict(null, p, p).ok, false);
  assert.equal(bandGateVerdict(p, { ok: false, pass: true }, p).ok, false);
  assert.equal(bandGateVerdict(p, p, { ok: true, pass: 'yes' }).ok, false);
});

test('END TO END: the three real gates all pass — contribution 7 earns RUNNING', () => {
  const g1 = sortingGate(LABELLED, DEFAULT_BAND);
  const g2 = collapseGate(LIVING, 6, DEFAULT_BAND, 0.15, 42);
  const g3 = bookingGate(runFilter(LABELLED.map((x) => x.text), DEFAULT_BAND).booking, DEFAULT_BAND);
  const v = bandGateVerdict(g1, g2, g3);
  assert.equal(v.ok, true);
  assert.equal(v.running, true);
  assert.equal(v.column, 'RUNNING');
});

// ── the last boundaries
test('the PRNG constant is pinned — a drifted generator is a different experiment', () => {
  assert.equal(lcgNext(42).seed, 1083814273);       // Math.imul(42,1664525) + 1013904223
  assert.equal(lcgNext(0).seed, 1013904223);
});

test('the collapse bar is strict: delta exactly at threshold does NOT pass', () => {
  assert.equal(collapseGate(LIVING, 6, DEFAULT_BAND, 0.2541, 42).pass, false);  // delta == threshold
});

test('a run that drops nothing needs no audit sample — and passes', () => {
  const onlyLiving = [LIVING, 'the quick brown fox jumps over the lazy dog and then the dog runs back over the same field to find the fox again'];
  const r = runFilter(onlyLiving, DEFAULT_BAND);
  assert.equal(r.booking.dropped, 0);
  assert.equal(r.booking.droppedSample, null);
  assert.equal(bookingGate(r.booking, DEFAULT_BAND).pass, true);   // kills dropped > 0 → >= 0
});

test('the verdict refuses non-object gate results outright', () => {
  const p = { ok: true, pass: true };
  assert.equal(bandGateVerdict('x', p, p).ok, false);
  assert.equal(bandGateVerdict(p, 42, p).ok, false);
});
