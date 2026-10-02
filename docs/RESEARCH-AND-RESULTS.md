# Compaction reliability and request efficiency

This fork retains the original compaction policy and makes three targeted improvements: zero-length previews stay empty, invalid probabilities cause an error, and results that must always stay are not submitted for a decision.

## Method selected

The user selected the Codex-native `autoresearch` workflow, supported by `autoresearch-x` for evaluation planning and release checks. The relevant design is a fixed evaluation, one production change per experiment, separate correctness checks, measured acceptance, and a recoverable previous version.

The local capability inventory also considered the `autoresearch-agent` Python engine and its five `ar:` shortcuts, `benchmark-optimization-loop`, Claude's Engram/Sibyl autoresearch variant, Claude's ten autoresearch-x routes, wiki-autoresearch, and research specialist agents. The alternative Python engine and Claude variants contain destructive Git-reset or foreign scheduling assumptions. The benchmark skill is useful for measurement but provides less experiment-state management. Research agents gather evidence; they do not replace a fixed scoring procedure. The Codex-native workflow best matched a shared working tree and a small TypeScript library.

Primary-source research informed the evaluation design:

- [Karpathy autoresearch](https://github.com/karpathy/autoresearch): fixed evaluation and bounded experiments provide a useful design pattern; its training-specific objective is not a compaction metric.
- [Codex autoresearch](https://github.com/leo-lilinxiao/codex-autoresearch): native adaptation of the iterative experiment workflow.
- [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents): context reduction must preserve useful task state; reducing context volume alone is insufficient evidence of quality.
- [SWE-Pruner](https://arxiv.org/html/2601.16746v4): task-aware context pruning motivates measuring preservation and downstream behavior alongside reduced inputs. Its reported results do not establish performance for this plugin.
- [Upstream Jev Compaction Plus](https://github.com/cth9191/jev-compaction-plus): the existing small-result retention rule and recovery drawer are the behavior preserved here.

## Recorded experiments

Baseline source: `e2ca81cdb71c709b5f5a2f07a15e5f3a700f884a`.

| Change | Baseline | Accepted result | Correctness checks |
|---|---:|---:|---|
| Zero-character preview | 3 nonempty outputs in 4 cases | 0 | Ordinary bounded previews remain unchanged |
| Probability validation | 4 invalid finite values accepted | 0 | Valid values including 0 and 1 remain accepted |
| Skip always-retained results | 138 unnecessary questions | 0 | Dialogue, protected results, tool identity, and exact recovery contents preserved |

The efficiency fixtures contain 83 results across small-only, mixed, boundary, and opt-out scenarios. Total questions decreased from 166 to 28; requests from 9 to 4; serialized request characters from 110,411 to 35,260. This is about 83% fewer questions, 56% fewer requests, and 68% fewer request characters on these fixtures. Character counts are not provider tokens or billed cost. No claim of live latency, billing savings, or model relevance quality is made.

The first efficiency attempt failed two existing transport tests because their tiny results no longer required a request. The experiment was not accepted. Those tests were explicitly configured with `minDropChars: 0` so their original network-error assertions still execute. A new baseline was then recorded. No failing assertion was removed.

The replacement experiment runner checked the baseline contract hash, the full protected file set including hook types, and the unchanged evaluation files. An intentional TypeScript error was rejected and recorded; automatic restoration produced the exact baseline source hash. The real candidate then passed all 36 existing tests, both type checks, the metric evaluation, and a repeated evaluation.

## Reproduce the release checks

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run verify:release
npx tsx benchmarks/compaction-contract.ts all
```

`verify:release` builds the public library and runs additional post-selection scenarios through that built output and an injected HTTP transport. It checks 141 results across three other thresholds, recent-message protection, Unicode text, exact recovery contents, no-request behavior, and invalid probability handling. These are additional deterministic scenarios, not a blinded external benchmark. The HTTP responses are synthetic and produce no provider charges.

## Audit boundaries

- Local run records are retained under ignored `autoresearch-results/`; they include source snapshots, hashes, logs, failed attempts, and acceptance records. Experimental runners are local audit tools and are excluded from this fork's tracked release files.
- The original runner's `final` phase repeated the same inputs. It is repeatability evidence, not unseen testing. The later runner labels that phase `repeat-pass`.
- Review found a remaining failure-path issue in the historical second runner: a failure while saving the accepted snapshot could retain a success status. No such failure occurred in the recorded run. Do not reuse that runner without repairing its catch status and starting a new contract.
- A frozen contract stored in the same writable directory detects accidental drift; it is not an adversarial security boundary.
- Offline source and library checks do not establish installed Claude Code behavior or paid provider quality.

## Codex compatibility

The TypeScript library can be called by any compatible Node.js application. The Claude Code integration uses `session.compact` and returns replacement messages. Codex's documented `PreCompact` hook does not expose an equivalent replacement-message result. See [Codex hooks](https://developers.openai.com/codex/hooks) and the [Codex compact hook source](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/events/compact.rs).

Therefore a direct Codex hook port is **BLOCKED for behavioral parity** on the inspected interface. A helper that stores recovery files would be a different integration and must not be represented as replacing native Codex compaction. No Codex compaction configuration is changed by this fork.

## Deployment status

Fork publication and local installation are separate steps. The user approved a GitHub fork plus local installation; the target runtime and any paid-test budget still require their answer. The existing Claude installation remains unchanged until that choice is made. No upstream pull request is included in this work.
