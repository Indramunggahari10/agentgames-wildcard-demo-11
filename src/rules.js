// The validation rules, the publicInputsHash explainer, and the honest
// scope statement — shared by the checker, the /api/rules endpoint,
// and (via that endpoint) the UI. Every rule cites the SPEC.md section
// it comes from. Nothing here claims knowledge the public docs do not
// contain: in particular, the exact publicInputsHash construction is
// NOT public and is never computed by this tool.
export const RULES = {
  source: "SPEC.md §4 (Steal the VFY tournament protocol), §5 (circuits)",
  actions: {
    valid: ["STEAL", "HOLD", "FORTIFY"],
    basis:
      "HOLD and FORTIFY are named explicitly in SPEC §4 (the amount-omission rule applies to both). STEAL is the action named by the event itself (Steal the VFY) and required by this tool's brief. The platform's full action list is not published beyond these, so any other action value is flagged as an unknown action (error). Action names are case-sensitive. No other actions are invented here.",
  },
  rules: [
    {
      id: "echo",
      name: "Echo matchId and turn exactly",
      rule: "The response must echo matchId and turn exactly as they appear in the turn envelope. Comparison is strict: same value AND same type, with no coercion. Turn \"7\" (string) does not echo turn 7 (number).",
      consequence: "A missing/mismatched required field is treated as HOLD, no proof.",
      specRef: "SPEC.md §4",
    },
    {
      id: "action-enum",
      name: "Action must be a documented action",
      rule: "action must be STEAL, HOLD, or FORTIFY — as a string (action: \"STEAL\") or as an object carrying a string type field (action: { type: \"STEAL\", ... }), which mirrors the SPEC §4 notation action.amount. Anything else is an unknown action (error).",
      consequence: "An unknown action cannot be checked against the amount rule and fails validation.",
      specRef: "SPEC.md §4",
    },
    {
      id: "amount-omitted",
      name: "amount OMITTED ENTIRELY for HOLD/FORTIFY",
      rule: "For HOLD or FORTIFY, the amount field must be omitted entirely — the key must not be present at all, neither as action.amount nor as a top-level amount field. The schema rejects the field even when 0. Present as 0, null, or an empty string is still present, and still an error. Do not send 0 or null: delete the key.",
      consequence: "A HOLD/FORTIFY response carrying amount fails validation and, per the platform schema, is rejected.",
      specRef: "SPEC.md §4",
    },
    {
      id: "amount-steal",
      name: "amount for STEAL is shape-checked only",
      rule: "For STEAL, a present amount must be a finite number or a decimal string. No published rule states whether STEAL requires an amount, and no platform range rule is claimed — so absence is not flagged, and negative/fractional values are warnings only.",
      consequence: "A non-numeric amount (null, boolean, object, array) fails validation.",
      specRef: "SPEC.md §4",
    },
    {
      id: "idempotency",
      name: "idempotencyKey present and non-empty",
      rule: "idempotencyKey must be present and a non-empty string. It is unique per turn; only the first submission per key counts. Uniqueness against the platform is NOT checked — this tool has no platform state; the uniqueness rule is stated as documented context only.",
      consequence: "A missing or empty idempotencyKey fails validation.",
      specRef: "SPEC.md §4",
    },
    {
      id: "circuit-version",
      name: "circuitVersion present and non-empty",
      rule: "circuitVersion must be present and a non-empty string, and it must match the registered strategy commitment. Whether it matches the commitment is NOT checked — the commitment is dashboard state this tool cannot see; only presence and shape are checked.",
      consequence: "A missing or empty circuitVersion fails validation.",
      specRef: "SPEC.md §4",
    },
    {
      id: "proof-shape",
      name: "Policy proof shape (Groth16)",
      rule: "proof must be an object with pi_a (array of 2 decimal strings), pi_b (2x2 array of decimal strings), pi_c (array of 2 decimal strings), protocol exactly \"groth16\", and curve exactly \"bn128\" (SPEC §5: both arena circuits are Groth16/BN128). public_signals must be a non-empty array of decimal strings. Shape only — the proof is NEVER verified here.",
      consequence: "A missing field or malformed shape fails validation.",
      specRef: "SPEC.md §4, §5",
    },
    {
      id: "public-signals-count",
      name: "public_signals count note (warning only)",
      rule: "The published vfy-policy verification key has 9 public inputs (SPEC §5, verified locally against the published VK). A different public_signals count is a warning, never a failure, because the circuits' signal names and order are not published (SPEC §5 gap, §9).",
      consequence: "Warning only; the verdict is unaffected.",
      specRef: "SPEC.md §5",
    },
    {
      id: "audit-pointers",
      name: "Optional audit pointers",
      rule: "proofReference and publicInputsHash are optional on-chain audit pointers. When present they must be non-empty strings. publicInputsHash is noted only: its value is never computed or compared by this tool.",
      consequence: "A present-but-malformed pointer fails validation; absence is fine.",
      specRef: "SPEC.md §4",
    },
  ],
  publicInputsHash: {
    title: "Why publicInputsHash field order matters",
    paragraphs: [
      "The platform independently computes publicInputsHash from the game state it knows, and rejects proofs where hashes diverge. Compute it BEFORE submitting to zkVerify so the proof covers the correct game state. Field order matters: skipping it or using the wrong order means immediate rejection — and the turn becomes a HOLD.",
      "That is why this check exists at all: a turn response can look complete — right matchId, right turn, right action, a well-shaped proof — and still die on a hash the agent never saw diverge. The hash binds the proof to one exact game state; a different field order is a different hash, even when every field value is the same.",
      "The exact hash construction is NOT public. The published docs do not state the hash function, the field list, or the field order, and the circuits' signal names and order are undocumented (SPEC §5 gap). This tool therefore NEVER computes the platform's hash, never claims to, and never compares a pasted hash against anything. Any hash-like value shown in this demo is illustrative only.",
    ],
    illustrativeExample: {
      label: "ILLUSTRATIVE ONLY — not a real platform hash, not computed from any game state",
      value: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
      note: "This placeholder exists only to show the shape of the field. Do not submit it, do not compare against it, and do not treat it as evidence about any real turn.",
    },
    whatToDo: [
      "Build the proof over the exact game state from the signed turn envelope — the same state the platform will hash.",
      "Fix the field order once, from the dashboard / practice mode / starter materials (the only places the layout is documented), and never reorder fields between turns.",
      "Compute the hash BEFORE submitting to zkVerify, so the proof covers the correct game state.",
      "Then paste the finished response here to catch the shape errors — wrong echo, stray amount, malformed proof — before the platform turns the turn into a HOLD.",
    ],
    specRef: "SPEC.md §4, §5",
  },
  notChecked: [
    "Proof verification — no proof is generated or verified; Groth16 verification needs the registered verification key and the circuit, and this tool performs shape checks only.",
    "publicInputsHash computation or comparison — the exact construction is not public.",
    "idempotencyKey uniqueness against the platform — needs platform state.",
    "circuitVersion match against the registered strategy commitment — dashboard state.",
    "HMAC signatures, deadlines, balances, or Swiss pairing — outside the pasted response.",
    "Whether STEAL requires an amount, and any amount range — no published rule; absence is not flagged.",
    "Turn numbering range (the match has 20 turns per SPEC §4, but turn indexing is undocumented, so no range is enforced).",
  ],
  scope:
    "Schema/shape validation only. No live data, no proofs generated or verified, no publicInputsHash computed, no platform calls, nothing stored. Pasted content is processed in memory and never logged.",
};
