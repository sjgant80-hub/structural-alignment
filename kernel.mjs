// structural-alignment · the kernels
//
// Four alignment primitives as pure, total functions — no I/O, no state, garbage in
// returns { ok:false, why } and never throws. The claim of this repo is not "alignment
// solved"; it is that these boundaries can be BUILT INTO a system as load-bearing code
// (and mutation-tested), rather than supervised onto it after the fact.
//
//   seamMetric        — measure whether an approval ritual still conducts to execution
//   twelvePowers      — completeness/containment lint over a build's declared powers
//   provenanceVerdict — the witness outranks the author's memory, always
//   honestGreen       — a green bought by deleting checks is named, not celebrated

// The healthy conduction band for seamMetric. Tuned constants, pinned numerically in
// the tests so a drifted band cannot pass silently.
export const BAND = Object.freeze({ low: 0.618, high: 0.687 });

/**
 * seamMetric({ approved, executed }) — the RISEN ratio: executed / approved.
 * An approval door is healthy when most — not all — of what it approves goes on to run:
 * below the band, approvals stop meaning execution (the ritual is becoming theater);
 * inside the band, approval conducts; above it, the door approves everything it sees
 * (rubber-stamp drift); past 1.0, things ran that were never approved (a breach).
 */
export function seamMetric(input) {
  if (typeof input !== 'object') return { ok: false, why: 'seamMetric reads { approved, executed } — an object of two counts' };
  if (input === null) return { ok: false, why: 'seamMetric reads { approved, executed } — an object of two counts' };
  if (Array.isArray(input)) return { ok: false, why: 'seamMetric reads { approved, executed } — an object of two counts' };
  const a = input.approved, e = input.executed;
  if (!Number.isInteger(a)) return { ok: false, why: 'approved and executed are non-negative integers — counts, not impressions' };
  if (!Number.isInteger(e)) return { ok: false, why: 'approved and executed are non-negative integers — counts, not impressions' };
  if (a < 0) return { ok: false, why: 'approved and executed are non-negative integers — counts, not impressions' };
  if (e < 0) return { ok: false, why: 'approved and executed are non-negative integers — counts, not impressions' };
  if (a === 0) {
    if (e === 0) return { ok: true, risen: null, verdict: 'idle', why: 'nothing approved, nothing executed — an unused seam is unused, not healthy' };
    return { ok: true, risen: null, verdict: 'breach', why: e + ' executed with zero approved — action without a door is not a metric problem, it is a breach' };
  }
  const risen = Math.round((e / a) * 1000) / 1000;
  if (risen > 1) return { ok: true, risen, verdict: 'breach', why: 'more executed than approved — some acts bypassed the door' };
  if (risen < BAND.low) return { ok: true, risen, verdict: 'theater', why: 'approval without execution — the ritual approves more than the system performs; the check is drifting toward theater' };
  if (risen <= BAND.high) return { ok: true, risen, verdict: 'healthy', why: 'approval conducts to execution inside the band' };
  return { ok: true, risen, verdict: 'rubber-stamp', why: 'nearly every approval executes — a door that never turns anything away may no longer be deciding' };
}

// The twelve powers a build can hold. Fixed vocabulary — an unknown power is refused,
// because a linter that accepts new powers on the fly cannot claim completeness.
export const POWERS = Object.freeze([
  'filesystem:read', 'filesystem:write', 'network:read', 'network:write',
  'shell', 'env', 'clipboard', 'browser',
  'database', 'tool:invoke', 'spend', 'identity:sign',
]);

const STANCES = Object.freeze(['denied', 'bounded', 'granted']);

/**
 * twelvePowers(manifest) — audit a build against the twelve powers, containment-first.
 * manifest maps power → 'denied' | 'bounded' | 'granted'. An UNDECLARED power is the
 * worst finding (HIGH): a power nobody named is a power nobody bounded. 'granted'
 * without a bound is MEDIUM. completeness = declared/12, containment = denied-or-bounded/12.
 */
export function twelvePowers(manifest) {
  if (typeof manifest !== 'object') return { ok: false, why: 'twelvePowers reads a manifest object: { "<power>": "denied"|"bounded"|"granted" }' };
  if (manifest === null) return { ok: false, why: 'twelvePowers reads a manifest object: { "<power>": "denied"|"bounded"|"granted" }' };
  if (Array.isArray(manifest)) return { ok: false, why: 'twelvePowers reads a manifest object: { "<power>": "denied"|"bounded"|"granted" }' };
  for (const k of Object.keys(manifest)) {
    if (!POWERS.includes(k)) return { ok: false, why: 'unknown power "' + k + '" — the twelve are fixed; completeness over an open list means nothing' };
  }
  const findings = [];
  let declared = 0, contained = 0;
  for (const p of POWERS) {
    const s = manifest[p];
    if (s === undefined) { findings.push({ power: p, level: 'HIGH', why: 'undeclared — a power nobody named is a power nobody bounded' }); continue; }
    if (!STANCES.includes(s)) return { ok: false, why: 'stance for ' + p + ' must be denied|bounded|granted, got "' + String(s) + '"' };
    declared++;
    if (s === 'granted') findings.push({ power: p, level: 'MEDIUM', why: 'granted without a bound — a power with no ceiling' });
    else contained++;
  }
  findings.sort((x, y) => (x.level === y.level ? POWERS.indexOf(x.power) - POWERS.indexOf(y.power) : (x.level === 'HIGH' ? -1 : 1)));
  const completeness = Math.round((declared / 12) * 100);
  const containment = Math.round((contained / 12) * 100);
  const verdict = findings.length === 0 ? 'contained' : (findings.some((f) => f.level === 'HIGH') ? 'unbounded' : 'loose');
  return { ok: true, completeness, containment, findings, verdict };
}

/**
 * provenanceVerdict({ claim, witness }) — self-reported provenance is a memory, not a gate.
 * claim   = { artifact, passed } — what the author says about what they built.
 * witness = { artifact, passed } — what the gate actually ran, on what.
 * The verdict follows the witness, always. A claim naming a different artifact than the
 * witness ran is refused outright. A disagreement on the result is a confabulation —
 * named as a finding, never smoothed over — and only a witnessed pass ships.
 */
export function provenanceVerdict(input) {
  if (typeof input !== 'object') return { ok: false, why: 'provenanceVerdict reads { claim, witness }' };
  if (input === null) return { ok: false, why: 'provenanceVerdict reads { claim, witness }' };
  if (Array.isArray(input)) return { ok: false, why: 'provenanceVerdict reads { claim, witness }' };
  const misshapen = (s) => {
    if (typeof s !== 'object') return true;
    if (s === null) return true;
    if (typeof s.artifact !== 'string') return true;
    if (s.artifact.length === 0) return true;
    if (typeof s.passed !== 'boolean') return true;
    return false;
  };
  if (misshapen(input.claim)) return { ok: false, why: 'claim is { artifact: non-empty string, passed: boolean } — what the author says' };
  if (misshapen(input.witness)) return { ok: false, why: 'witness is { artifact: non-empty string, passed: boolean } — what the gate ran' };
  const { claim, witness } = input;
  if (claim.artifact !== witness.artifact) {
    return { ok: true, ship: false, confabulation: true, verdict: 'REFUSED', why: 'the claim names "' + claim.artifact + '" but the witness ran "' + witness.artifact + '" — the story and the receipt are about different things' };
  }
  const confabulation = claim.passed !== witness.passed;
  if (!witness.passed) {
    return { ok: true, ship: false, confabulation, verdict: 'REFUSED', why: confabulation ? 'the author remembers a green the witness never saw — refused, and the disagreement is itself the finding' : 'the witness is red — an honest failure, and honest failures do not ship' };
  }
  return { ok: true, ship: true, confabulation, verdict: confabulation ? 'SHIP-WITH-CORRECTION' : 'SHIP', why: confabulation ? 'the witness passed though the author believed otherwise — ship the witnessed artifact and correct the memory' : 'claim and witness agree, and the witness passed' };
}

/**
 * honestGreen({ before, after }) — a revision loop's anti-reward-hacking law.
 * before/after = { assertions, pinned } — the shape of the test suite around a revision.
 * A suite that got smaller or looser between revisions "passed" by lowering the bar:
 * that is BAR-LOWERED, and the flags name exactly what was traded for the green.
 */
export function honestGreen(input) {
  if (typeof input !== 'object') return { ok: false, why: 'honestGreen reads { before, after } suite shapes' };
  if (input === null) return { ok: false, why: 'honestGreen reads { before, after } suite shapes' };
  if (Array.isArray(input)) return { ok: false, why: 'honestGreen reads { before, after } suite shapes' };
  const misshapen = (s) => {
    if (typeof s !== 'object') return true;
    if (s === null) return true;
    if (!Number.isInteger(s.assertions)) return true;
    if (!Number.isInteger(s.pinned)) return true;
    if (s.assertions < 0) return true;
    if (s.pinned < 0) return true;
    if (s.pinned > s.assertions) return true;
    return false;
  };
  if (misshapen(input.before)) return { ok: false, why: 'before is { assertions, pinned } — non-negative integers, pinned <= assertions' };
  if (misshapen(input.after)) return { ok: false, why: 'after is { assertions, pinned } — non-negative integers, pinned <= assertions' };
  const flags = [];
  if (input.after.assertions < input.before.assertions) {
    flags.push('assertions deleted (' + input.before.assertions + ' → ' + input.after.assertions + ') — a green bought by removing the checks');
  }
  if (input.after.pinned < input.before.pinned) {
    flags.push('pinned expectations loosened (' + input.before.pinned + ' → ' + input.after.pinned + ') — exactness traded for a pass');
  }
  const honest = flags.length === 0;
  return { ok: true, honest, flags, verdict: honest ? 'HONEST' : 'BAR-LOWERED', why: honest ? 'the suite got no weaker between revisions' : flags.join('; ') };
}
