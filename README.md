# Structural Alignment

**Live demo: https://sjgant80-hub.github.io/structural-alignment/**

A working demonstration of **structural self-alignment** — alignment built into a system's
architecture as load-bearing, mutation-tested code, rather than supervised onto its
behavior after the fact. With receipts, not claims.

## The thesis

Supervisory alignment (test, catch bad behavior, patch) is path-by-path, and the paths are
infinite — a capable agent's defining edge is finding the path nobody tested. Structural
alignment puts the boundary *inside* the system, present on every path, so it holds against
behaviors nobody anticipated. This repo demonstrates the pattern two ways: four alignment
primitives as small pure kernels you can run (and whose mutation gate you can re-run), and
public receipts from systems already exhibiting the behavior.

## The seven contributions

| # | primitive | status |
|---|-----------|--------|
| 1 | **Structural self-refusal** — an autonomous system caught its own confabulated provenance and refused to publish itself; the refusal is documented in the shipped README | running · receipt: [pixelwhisperer](https://github.com/sjgant80-hub/pixelwhisperer) |
| 2 | **Honest gate / no faked green** — never delete assertions to fake a pass, never weaken the code to dodge a test; bar-lowering made detectable | running ([witness-kit](https://github.com/sjgant80-hub/witness-kit), [the-bell](https://github.com/sjgant80-hub/the-bell)) + `honestGreen` kernel here |
| 3 | **Seam metric** — a number and verdict on whether an approval ritual still conducts to execution (theater / healthy / rubber-stamp / breach) | `seamMetric` kernel here, gated |
| 4 | **Twelve-powers lint** — containment-first completeness audit; an undeclared power outranks every feature gap | `twelvePowers` kernel here, gated |
| 5 | **Bidirectional review** — the governed agent audited its maker's own gate code, found a real silent-narrowing vulnerability, twice; the overseer's gates got stronger | running · related public gate: [ui-gate](https://github.com/sjgant80-hub/ui-gate) |
| 6 | **Provenance is a witness, not a memory** — the verdict follows the gate's run, never the author's story; disagreement is itself the finding | running doctrine + `provenanceVerdict` kernel here |
| 7 | **Band-filtered training (anti-slop)** — train only on material gated from both sides | **spec — honestly not yet running** |

## The proof line

- `kernel.mjs` — 4 pure, total kernels. Mutation gate **CLEAN: 52/52 mutants killed, zero
  survivors, zero exemptions** (31 tests, every constant and boundary pinned numerically).
  The exact invocation, which CI re-runs on every push:

  ```
  node tools/witness.mjs mutate kernel.mjs --timeout 30000 --cap 160 --test node --test kernel.test.mjs
  ```

- `index.html` — carries `kernel.mjs` verbatim between generated markers (`make-page.mjs`).
  CI regenerates the page and diffs it: **the demo cannot quietly diverge from the gated code.**
- The gate refuses its own theatre: if the per-mutant timeout is not comfortably above the
  suite's own runtime, it refuses to run rather than let every mutant time out as "killed."

## The honest split

**This is:** a demonstration that alignment boundaries can be built as small, pure,
mutation-tested code, plus public receipts of the pattern running (a self-refusal that
shipped, a bidirectional audit that fixed real gates).

**This is not:** a claim that alignment is solved. Contribution 7 is a spec and is labeled
as one. The seam band's default pins (0.618–0.687) are tuned constants — pinned numerically
in the tests so they cannot drift silently; recalibrate against your own system's history
before trusting a verdict.

MIT.
