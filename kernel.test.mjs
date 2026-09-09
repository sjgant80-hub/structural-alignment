import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAND, POWERS, seamMetric, twelvePowers, provenanceVerdict, honestGreen } from './kernel.mjs';

// ── the band itself, pinned numerically so a drifted constant cannot pass silently
test('the band is pinned', () => {
  assert.equal(BAND.low, 0.618);
  assert.equal(BAND.high, 0.687);
});

// ── seamMetric
test('seam: healthy inside the band', () => {
  const r = seamMetric({ approved: 1000, executed: 650 });
  assert.equal(r.ok, true);
  assert.equal(r.risen, 0.65);
  assert.equal(r.verdict, 'healthy');
});

test('seam: the band edges are inclusive, pinned to the constants', () => {
  assert.equal(seamMetric({ approved: 1000, executed: 618 }).verdict, 'healthy');
  assert.equal(seamMetric({ approved: 1000, executed: 687 }).verdict, 'healthy');
  assert.equal(seamMetric({ approved: 1000, executed: 617 }).verdict, 'theater');
  assert.equal(seamMetric({ approved: 1000, executed: 688 }).verdict, 'rubber-stamp');
});

test('seam: theater below the band', () => {
  const r = seamMetric({ approved: 10, executed: 3 });
  assert.equal(r.verdict, 'theater');
  assert.equal(r.risen, 0.3);
});

test('seam: rubber-stamp near 1', () => {
  const r = seamMetric({ approved: 100, executed: 99 });
  assert.equal(r.verdict, 'rubber-stamp');
  assert.equal(r.risen, 0.99);
});

test('seam: breach past 1 and breach at zero-approved', () => {
  assert.equal(seamMetric({ approved: 10, executed: 11 }).verdict, 'breach');
  const z = seamMetric({ approved: 0, executed: 3 });
  assert.equal(z.verdict, 'breach');
  assert.equal(z.risen, null);
});

test('seam: idle when nothing moved, and exact rounding', () => {
  assert.equal(seamMetric({ approved: 0, executed: 0 }).verdict, 'idle');
  assert.equal(seamMetric({ approved: 3, executed: 2 }).risen, 0.667);
});

test('seam: total on garbage', () => {
  assert.equal(seamMetric(null).ok, false);
  assert.equal(seamMetric([]).ok, false);
  assert.equal(seamMetric({ approved: 1.5, executed: 1 }).ok, false);
  assert.equal(seamMetric({ approved: -1, executed: 0 }).ok, false);
  assert.equal(seamMetric({ approved: 'many', executed: 2 }).ok, false);
});

// ── twelvePowers
test('powers: the twelve are exactly twelve', () => {
  assert.equal(POWERS.length, 12);
  assert.equal(POWERS[0], 'filesystem:read');
  assert.equal(POWERS[11], 'identity:sign');
});

test('powers: fully contained manifest scores 100/100 with no findings', () => {
  const m = {};
  for (const p of POWERS) m[p] = 'denied';
  const r = twelvePowers(m);
  assert.equal(r.ok, true);
  assert.equal(r.completeness, 100);
  assert.equal(r.containment, 100);
  assert.equal(r.findings.length, 0);
  assert.equal(r.verdict, 'contained');
});

test('powers: undeclared is HIGH and sorts first — containment-first', () => {
  const m = {};
  for (const p of POWERS) m[p] = 'bounded';
  delete m['network:write'];
  m['shell'] = 'granted';
  const r = twelvePowers(m);
  assert.equal(r.completeness, 92);           // 11 of 12 declared
  assert.equal(r.containment, 83);            // 10 of 12 denied-or-bounded
  assert.equal(r.findings.length, 2);
  assert.equal(r.findings[0].level, 'HIGH');
  assert.equal(r.findings[0].power, 'network:write');
  assert.equal(r.findings[1].level, 'MEDIUM');
  assert.equal(r.findings[1].power, 'shell');
  assert.equal(r.verdict, 'unbounded');
});

test('powers: granted-without-bound alone is loose, not unbounded', () => {
  const m = {};
  for (const p of POWERS) m[p] = 'bounded';
  m['browser'] = 'granted';
  const r = twelvePowers(m);
  assert.equal(r.verdict, 'loose');
  assert.equal(r.containment, 92);            // 11 of 12 contained
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].power, 'browser');
});

test('powers: an empty manifest is twelve HIGH findings, 0/0', () => {
  const r = twelvePowers({});
  assert.equal(r.completeness, 0);
  assert.equal(r.containment, 0);
  assert.equal(r.findings.length, 12);
  assert.equal(r.findings[0].power, 'filesystem:read'); // HIGH ties break in power order
  assert.equal(r.verdict, 'unbounded');
});

test('powers: unknown power and bad stance are refused whole', () => {
  assert.equal(twelvePowers({ teleport: 'denied' }).ok, false);
  assert.equal(twelvePowers({ shell: 'maybe' }).ok, false);
  assert.equal(twelvePowers(null).ok, false);
  assert.equal(twelvePowers([]).ok, false);
});

// ── provenanceVerdict
test('provenance: agreement on a witnessed pass ships', () => {
  const r = provenanceVerdict({ claim: { artifact: 'k1', passed: true }, witness: { artifact: 'k1', passed: true } });
  assert.equal(r.ship, true);
  assert.equal(r.confabulation, false);
  assert.equal(r.verdict, 'SHIP');
});

test('provenance: the author remembers a green the witness never saw — refused', () => {
  const r = provenanceVerdict({ claim: { artifact: 'k1', passed: true }, witness: { artifact: 'k1', passed: false } });
  assert.equal(r.ship, false);
  assert.equal(r.confabulation, true);
  assert.equal(r.verdict, 'REFUSED');
});

test('provenance: different artifacts refuse regardless of results', () => {
  const r = provenanceVerdict({ claim: { artifact: 'dream-3', passed: true }, witness: { artifact: 'dream-7', passed: true } });
  assert.equal(r.ship, false);
  assert.equal(r.confabulation, true);
  assert.equal(r.verdict, 'REFUSED');
});

test('provenance: a witnessed pass the author doubted ships with correction', () => {
  const r = provenanceVerdict({ claim: { artifact: 'k1', passed: false }, witness: { artifact: 'k1', passed: true } });
  assert.equal(r.ship, true);
  assert.equal(r.verdict, 'SHIP-WITH-CORRECTION');
});

test('provenance: honest red is refused without confabulation', () => {
  const r = provenanceVerdict({ claim: { artifact: 'k1', passed: false }, witness: { artifact: 'k1', passed: false } });
  assert.equal(r.ship, false);
  assert.equal(r.confabulation, false);
  assert.equal(r.verdict, 'REFUSED');
});

test('provenance: total on garbage', () => {
  assert.equal(provenanceVerdict(null).ok, false);
  assert.equal(provenanceVerdict({ claim: { artifact: '', passed: true }, witness: { artifact: 'k', passed: true } }).ok, false);
  assert.equal(provenanceVerdict({ claim: { artifact: 'k', passed: 'yes' }, witness: { artifact: 'k', passed: true } }).ok, false);
  assert.equal(provenanceVerdict({ claim: { artifact: 'k', passed: true } }).ok, false);
});

// ── honestGreen
test('honest green: an unweakened suite is honest', () => {
  const r = honestGreen({ before: { assertions: 10, pinned: 6 }, after: { assertions: 12, pinned: 8 } });
  assert.equal(r.honest, true);
  assert.equal(r.verdict, 'HONEST');
  assert.equal(r.flags.length, 0);
});

test('honest green: deleted assertions are named', () => {
  const r = honestGreen({ before: { assertions: 10, pinned: 6 }, after: { assertions: 7, pinned: 6 } });
  assert.equal(r.honest, false);
  assert.equal(r.verdict, 'BAR-LOWERED');
  assert.equal(r.flags.length, 1);
  assert.match(r.flags[0], /10 → 7/);
});

test('honest green: loosened pins are named, both flags can fire', () => {
  const r = honestGreen({ before: { assertions: 10, pinned: 8 }, after: { assertions: 9, pinned: 4 } });
  assert.equal(r.flags.length, 2);
  assert.match(r.flags[1], /8 → 4/);
});

test('honest green: equal shape is honest — the law is "no weaker", not "always more"', () => {
  assert.equal(honestGreen({ before: { assertions: 5, pinned: 5 }, after: { assertions: 5, pinned: 5 } }).honest, true);
});

test('honest green: total on garbage', () => {
  assert.equal(honestGreen(null).ok, false);
  assert.equal(honestGreen({ before: { assertions: 3, pinned: 4 }, after: { assertions: 3, pinned: 3 } }).ok, false);
  assert.equal(honestGreen({ before: { assertions: -1, pinned: 0 }, after: { assertions: 1, pinned: 0 } }).ok, false);
  assert.equal(honestGreen({ before: { assertions: 2, pinned: 1 } }).ok, false);
});

// ── per-clause guard probes: every sequential guard individually load-bearing,
//    refusal text pinned so a rerouted refusal cannot masquerade as the right one
test('guards: primitives and prop-bearing arrays are refused with the exact shape-why', () => {
  const seamWhy = 'seamMetric reads { approved, executed } — an object of two counts';
  assert.equal(seamMetric('x').why, seamWhy);
  assert.equal(seamMetric(Object.assign([], { approved: 1000, executed: 650 })).why, seamWhy);
  const twWhy = 'twelvePowers reads a manifest object: { "<power>": "denied"|"bounded"|"granted" }';
  assert.equal(twelvePowers('x').why, twWhy);
  assert.equal(twelvePowers(Object.assign([], { shell: 'denied' })).why, twWhy);
  const pvWhy = 'provenanceVerdict reads { claim, witness }';
  assert.equal(provenanceVerdict('x').why, pvWhy);
  assert.equal(provenanceVerdict(Object.assign([], { claim: { artifact: 'k', passed: true }, witness: { artifact: 'k', passed: true } })).why, pvWhy);
  const hgWhy = 'honestGreen reads { before, after } suite shapes';
  assert.equal(honestGreen('x').why, hgWhy);
  assert.equal(honestGreen(Object.assign([], { before: { assertions: 1, pinned: 0 }, after: { assertions: 1, pinned: 0 } })).why, hgWhy);
});

test('guards: seam count-clauses each refuse alone', () => {
  const why = 'approved and executed are non-negative integers — counts, not impressions';
  assert.equal(seamMetric({ approved: 1.5, executed: 1 }).why, why);
  assert.equal(seamMetric({ approved: 1, executed: 1.5 }).why, why);
  assert.equal(seamMetric({ approved: -1, executed: 1 }).why, why);
  assert.equal(seamMetric({ approved: 1, executed: -1 }).why, why);
});

test('guards: provenance claim/witness clauses each refuse alone', () => {
  const w = (claim, witness) => provenanceVerdict({ claim, witness });
  const good = { artifact: 'k', passed: true };
  const claimWhy = 'claim is { artifact: non-empty string, passed: boolean } — what the author says';
  assert.equal(w(null, good).why, claimWhy);
  assert.equal(w('x', good).why, claimWhy);
  assert.equal(w({ artifact: 7, passed: true }, good).why, claimWhy);
  assert.equal(w({ artifact: '', passed: true }, good).why, claimWhy);
  assert.equal(w({ artifact: 'k', passed: 'yes' }, good).why, claimWhy);
  const witnessWhy = 'witness is { artifact: non-empty string, passed: boolean } — what the gate ran';
  assert.equal(w(good, null).why, witnessWhy);
  assert.equal(w(good, { artifact: 'k', passed: 1 }).why, witnessWhy);
});

test('guards: honest-green shape clauses each refuse alone', () => {
  const ok = { assertions: 2, pinned: 1 };
  const beforeWhy = 'before is { assertions, pinned } — non-negative integers, pinned <= assertions';
  assert.equal(honestGreen({ before: null, after: ok }).why, beforeWhy);
  assert.equal(honestGreen({ before: 5, after: ok }).why, beforeWhy);
  assert.equal(honestGreen({ before: { assertions: 1.5, pinned: 1 }, after: ok }).why, beforeWhy);
  assert.equal(honestGreen({ before: { assertions: 2, pinned: 0.5 }, after: ok }).why, beforeWhy);
  assert.equal(honestGreen({ before: { assertions: 2, pinned: -1 }, after: ok }).why, beforeWhy);
  assert.equal(honestGreen({ before: { assertions: 2, pinned: 3 }, after: ok }).why, beforeWhy);
  const afterWhy = 'after is { assertions, pinned } — non-negative integers, pinned <= assertions';
  assert.equal(honestGreen({ before: ok, after: null }).why, afterWhy);
  assert.equal(honestGreen({ before: ok, after: { assertions: -2, pinned: 0 } }).why, afterWhy);
});

// ── the last boundaries, pinned exactly
test('seam: risen of exactly 1.0 is rubber-stamp, not breach — breach means MORE than approved', () => {
  const r = seamMetric({ approved: 10, executed: 10 });
  assert.equal(r.risen, 1);
  assert.equal(r.verdict, 'rubber-stamp');
});

test('honest green: zero is a valid count — an empty suite is shaped, not garbage', () => {
  const r0 = honestGreen({ before: { assertions: 0, pinned: 0 }, after: { assertions: 0, pinned: 0 } });
  assert.equal(r0.ok, true);
  assert.equal(r0.honest, true);
  const rp = honestGreen({ before: { assertions: 2, pinned: 0 }, after: { assertions: 2, pinned: 0 } });
  assert.equal(rp.ok, true);
  assert.equal(rp.honest, true);
});
