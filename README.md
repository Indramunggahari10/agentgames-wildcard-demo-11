# Steal-the-VFY Turn Checker

A Steal the VFY turn response with a missing or mismatched required
field is treated as HOLD, no proof. This tool catches those shape
errors before submission: paste the expected `matchId` and `turn`
from the signed turn envelope, paste the turn response JSON, and get
a per-rule checks report against the published protocol (SPEC.md
§4–§5).

Zero dependencies. Node.js built-ins only. No persistence: pasted
responses are processed in memory and never stored or logged.

## Honest scope

- This tool performs **schema/shape validation only**. It generates
  no proofs, verifies no proofs, computes no `publicInputsHash`,
  makes no platform calls, and holds no live data.
- A "valid" verdict means only that every documented shape rule this
  tool can check locally passed. The platform still independently
  verifies the proof and computes its own `publicInputsHash`.
- The exact `publicInputsHash` construction is **NOT public** and is
  never computed or claimed here. See the explainer below.
- Every bundled example uses plainly fake values (placeholder match
  ids, sequential decimal strings). No real match, turn, proof, or
  platform hash appears anywhere in this demo.

## The validation rules

All rules come from SPEC.md §4 (Steal the VFY tournament protocol)
and §5 (circuits). Section references are carried on every check in
the report.

| # | Rule | Source |
|---|---|---|
| 1 | Echo `matchId` and `turn` exactly as in the turn envelope. Comparison is strict: same value AND same type, no coercion. Turn `"7"` (string) does not echo turn `7` (number). | §4 |
| 2 | `action` must be a documented action: `STEAL`, `HOLD`, or `FORTIFY` — as a string (`action: "STEAL"`) or as an object with a string `type` field (`action: { type: "STEAL", ... }`), which mirrors the §4 notation `action.amount`. Anything else is an unknown action (error). Names are case-sensitive. | §4 |
| 3 | **`amount` OMITTED ENTIRELY for HOLD/FORTIFY.** The key must not be present at all, neither as `action.amount` nor as a top-level `amount`. The schema rejects the field even when 0. Present as `0`, `null`, or `""` is still present, and still an error. Delete the key; do not zero it. | §4 |
| 4 | For `STEAL`, a present `amount` must be a finite number or a decimal string (shape only). No published rule states whether STEAL requires an amount, and no platform range rule is claimed — absence is not flagged, and negative/fractional values are warnings only. | §4 |
| 5 | `idempotencyKey` present and a non-empty string. Unique per turn; only the first submission per key counts. Uniqueness against the platform is NOT checked (no platform state) — stated as documented context only. | §4 |
| 6 | `circuitVersion` present and a non-empty string. It must match the registered strategy commitment, but that match is NOT checked — the commitment is dashboard state this tool cannot see. | §4 |
| 7 | Policy proof shape: `proof` is an object with `pi_a` (2 decimal strings), `pi_b` (2×2 decimal strings), `pi_c` (2 decimal strings), `protocol` exactly `"groth16"`, `curve` exactly `"bn128"`; `public_signals` is a non-empty array of decimal strings. Shape only — never verified. | §4, §5 |
| 8 | `public_signals` count note (warning only): the published vfy-policy verification key has 9 public inputs (§5). A different count warns, never fails, because signal names/order are unpublished. | §5 |
| 9 | `proofReference` and `publicInputsHash` are optional audit pointers; when present they must be non-empty strings. `publicInputsHash` is noted only — never computed or compared. | §4 |

### The action enum: the tool's reading

HOLD and FORTIFY are named explicitly in SPEC §4 (the amount-omission
rule applies to both). STEAL is the action named by the event itself
(Steal the VFY). The platform's full action list is not published
beyond these, so any other action value is flagged as an unknown
action (error). No additional actions are invented here. If the
platform documents further actions in dashboard-only materials, this
tool would flag them — that is a deliberate fail-closed choice, stated
here rather than hidden.

### Deliberately not checked

- Proof verification, `publicInputsHash` computation or comparison,
  `idempotencyKey` uniqueness, and the `circuitVersion`-to-commitment
  match (all need platform or dashboard state).
- HMAC signatures, deadlines, balances, and Swiss pairing (outside
  the pasted response).
- Whether STEAL requires an amount, and any amount range (no
  published rule).
- Turn numbering range: the match has 20 turns (§4), but turn
  indexing is undocumented, so no range is enforced.
- Unrecognized top-level fields are ignored and reported as ignored;
  extra fields are neither accepted nor rejected.

## Why publicInputsHash field order matters

The platform independently computes `publicInputsHash` from the game
state it knows and rejects proofs where hashes diverge. Compute it
BEFORE submitting to zkVerify so the proof covers the correct game
state. Field order matters; skipping it or wrong order means
immediate rejection — and the turn becomes a HOLD (§4).

A turn response can look complete — right `matchId`, right turn,
right action, a well-shaped proof — and still die on a hash the agent
never saw diverge. The hash binds the proof to one exact game state;
a different field order is a different hash, even when every field
value is the same.

**The exact hash construction is NOT public.** The published docs do
not state the hash function, the field list, or the field order, and
the circuits' signal names and order are undocumented (§5 gap). This
tool therefore NEVER computes the platform's hash, never claims to,
and never compares a pasted hash against anything. The only
hash-like value shown anywhere in this demo is the placeholder below:

```
0xdeadbeef00000000000000000000000000000000000000000000000000000000
```

**ILLUSTRATIVE ONLY** — not a real platform hash, not computed from
any game state. Do not submit it, do not compare against it, and do
not treat it as evidence about any real turn.

What to do instead of guessing the hash: build the proof over the
exact game state from the signed turn envelope; fix the field order
once, from the dashboard / practice mode / starter materials (the
only places the layout is documented); compute the hash BEFORE
submitting to zkVerify; then paste the finished response here to
catch the shape errors before the platform turns the turn into a
HOLD.

## API

- `GET /health` and `GET /api/health` → `{ok, service, version}`
- `GET /api/examples` → the bundled examples, each with its expected verdict
- `GET /api/rules` → the rules, the action-enum basis, the
  `publicInputsHash` explainer, and the not-checked list
- `POST /api/check` (alias: `POST /api/validate`) with
  `{"expected": {"matchId": "...", "turn": 7}, "response": {...}}` →
  `{verdict, summary, action, errors, warnings, checks, scope}`.
  A well-formed request whose response has protocol errors returns
  **200 + a checks report**, not a 400: validation findings are data.
  Only transport errors are 400s (malformed JSON, missing `expected`
  / `response`, non-object `response`); bodies over 64 KB are 413s.

## Examples

10 bundled examples, each labeled with its expected verdict (served
by `/api/examples`, loadable as presets in the UI):

| Example | Expected |
|---|---|
| Valid STEAL | valid |
| Valid HOLD (no amount) | valid |
| HOLD with amount: 0 | invalid |
| HOLD with amount: null (string-action form) | invalid |
| FORTIFY with amount | invalid |
| Missing idempotencyKey | invalid |
| Wrong turn echo (string `"7"` vs number `7`) | invalid |
| Wrong matchId echo | invalid |
| Malformed proof shape | invalid |
| Unknown action | invalid |

## Run

```
npm start        # listens on $PORT (default 3000)
npm test         # node --test, no dependencies
```

## Tests

70 tests, all passing (checker unit tests + HTTP round-trips for
every route). Coverage: every validation rule; boundaries
(`amount: 0`, `amount: null`, `amount: ""`, amount absent; empty and
whitespace-only `idempotencyKey`; turn as string vs number; proof
missing fields; wrong protocol/curve; empty and non-decimal
`public_signals`); malformed input and the 400-vs-200 distinction;
the 64 KB body cap; and agreement between every bundled example and
its stated expected verdict.
