// Bundled examples. Every value here is plainly fake: placeholder
// match ids, sequential decimal strings for proof elements, and
// obviously invented keys and versions. No real match, turn, proof,
// or platform hash appears anywhere in this demo. Each example states
// its expected verdict; the test suite asserts the checker agrees.

// A well-shaped but entirely fake Groth16 proof. These numbers prove
// nothing — they only have the right shape (pi_a / pi_b / pi_c as
// decimal strings, protocol groth16, curve bn128).
const FAKE_PROOF = {
  pi_a: ["11", "22"],
  pi_b: [
    ["1", "2"],
    ["3", "4"],
  ],
  pi_c: ["5", "6"],
  protocol: "groth16",
  curve: "bn128",
};

// Nine fake public signals: the published vfy-policy VK has 9 public
// inputs (SPEC §5). Values are sequential placeholders, not real
// circuit outputs.
const FAKE_SIGNALS = ["101", "102", "103", "104", "105", "106", "107", "108", "109"];

function fakeProof() {
  return JSON.parse(JSON.stringify(FAKE_PROOF));
}

export const EXAMPLES = [
  {
    id: "valid-steal",
    label: "Valid STEAL",
    expectedVerdict: "valid",
    note: "Everything checks out: exact echo, STEAL with an amount, idempotencyKey, circuitVersion, and a well-shaped proof with 9 public signals. Try this one first — it shows what a passing turn looks like.",
    expected: { matchId: "match_demo_001", turn: 7 },
    response: {
      matchId: "match_demo_001",
      turn: 7,
      action: { type: "STEAL", amount: 25 },
      idempotencyKey: "key-demo-steal-001",
      circuitVersion: "vfy-policy-demo-v1",
      proof: fakeProof(),
      public_signals: [...FAKE_SIGNALS],
    },
  },
  {
    id: "valid-hold",
    label: "Valid HOLD (no amount)",
    expectedVerdict: "valid",
    note: "A HOLD with the amount key omitted entirely. This is the correct way to hold — compare with the next two examples, where the key is present.",
    expected: { matchId: "match_demo_001", turn: 3 },
    response: {
      matchId: "match_demo_001",
      turn: 3,
      action: { type: "HOLD" },
      idempotencyKey: "key-demo-hold-001",
      circuitVersion: "vfy-policy-demo-v1",
      proof: fakeProof(),
      public_signals: [...FAKE_SIGNALS],
    },
  },
  {
    id: "hold-amount-zero",
    label: "HOLD with amount: 0 (error)",
    expectedVerdict: "invalid",
    note: "The headline trap: amount is present as 0. The schema rejects the field even when 0 — the key must be omitted entirely, not zeroed.",
    expected: { matchId: "match_demo_001", turn: 4 },
    response: {
      matchId: "match_demo_001",
      turn: 4,
      action: { type: "HOLD", amount: 0 },
      idempotencyKey: "key-demo-hold-002",
      circuitVersion: "vfy-policy-demo-v1",
      proof: fakeProof(),
      public_signals: [...FAKE_SIGNALS],
    },
  },
  {
    id: "hold-amount-null",
    label: "HOLD with amount: null (error)",
    expectedVerdict: "invalid",
    note: "Same rule, string-action form: action is the string \"HOLD\" and a top-level amount key is present as null. Null is still present — omit the key entirely.",
    expected: { matchId: "match_demo_002", turn: 2 },
    response: {
      matchId: "match_demo_002",
      turn: 2,
      action: "HOLD",
      amount: null,
      idempotencyKey: "key-demo-hold-003",
      circuitVersion: "vfy-policy-demo-v1",
      proof: fakeProof(),
      public_signals: [...FAKE_SIGNALS],
    },
  },
  {
    id: "fortify-with-amount",
    label: "FORTIFY with amount (error)",
    expectedVerdict: "invalid",
    note: "FORTIFY follows the same rule as HOLD: amount must be omitted entirely. A FORTIFY carrying amount: 10 fails.",
    expected: { matchId: "match_demo_002", turn: 5 },
    response: {
      matchId: "match_demo_002",
      turn: 5,
      action: { type: "FORTIFY", amount: 10 },
      idempotencyKey: "key-demo-fortify-001",
      circuitVersion: "vfy-policy-demo-v1",
      proof: fakeProof(),
      public_signals: [...FAKE_SIGNALS],
    },
  },
  {
    id: "missing-key",
    label: "Missing idempotencyKey (error)",
    expectedVerdict: "invalid",
    note: "An otherwise fine STEAL with no idempotencyKey at all. The key must be present and non-empty, unique per turn — only the first submission per key counts.",
    expected: { matchId: "match_demo_003", turn: 1 },
    response: {
      matchId: "match_demo_003",
      turn: 1,
      action: { type: "STEAL", amount: 40 },
      circuitVersion: "vfy-policy-demo-v1",
      proof: fakeProof(),
      public_signals: [...FAKE_SIGNALS],
    },
  },
  {
    id: "wrong-turn",
    label: "Wrong turn echo (error)",
    expectedVerdict: "invalid",
    note: "The envelope says turn 7 (number); the response echoes \"7\" (string). The echo must be exact — same value AND same type, no coercion — so this fails.",
    expected: { matchId: "match_demo_001", turn: 7 },
    response: {
      matchId: "match_demo_001",
      turn: "7",
      action: { type: "STEAL", amount: 25 },
      idempotencyKey: "key-demo-steal-002",
      circuitVersion: "vfy-policy-demo-v1",
      proof: fakeProof(),
      public_signals: [...FAKE_SIGNALS],
    },
  },
  {
    id: "wrong-matchid",
    label: "Wrong matchId echo (error)",
    expectedVerdict: "invalid",
    note: "The response echoes a different matchId than the envelope. A mismatched required field is treated as HOLD, no proof.",
    expected: { matchId: "match_demo_001", turn: 7 },
    response: {
      matchId: "match_demo_999",
      turn: 7,
      action: { type: "STEAL", amount: 25 },
      idempotencyKey: "key-demo-steal-003",
      circuitVersion: "vfy-policy-demo-v1",
      proof: fakeProof(),
      public_signals: [...FAKE_SIGNALS],
    },
  },
  {
    id: "malformed-proof",
    label: "Malformed proof shape (error)",
    expectedVerdict: "invalid",
    note: "The proof is missing pi_b and has the wrong protocol, and public_signals is empty. Shape only — nothing is verified — but a proof that is not even well-shaped cannot be a policy proof.",
    expected: { matchId: "match_demo_004", turn: 6 },
    response: {
      matchId: "match_demo_004",
      turn: 6,
      action: { type: "STEAL", amount: 15 },
      idempotencyKey: "key-demo-steal-004",
      circuitVersion: "vfy-policy-demo-v1",
      proof: {
        pi_a: ["11", "22"],
        pi_c: ["5", "6"],
        protocol: "plonk",
        curve: "bn128",
      },
      public_signals: [],
    },
  },
  {
    id: "unknown-action",
    label: "Unknown action (error)",
    expectedVerdict: "invalid",
    note: "ATTACK is not a documented action. Only STEAL, HOLD, and FORTIFY are accepted; the platform's full action list is not published beyond these.",
    expected: { matchId: "match_demo_005", turn: 9 },
    response: {
      matchId: "match_demo_005",
      turn: 9,
      action: { type: "ATTACK", amount: 5 },
      idempotencyKey: "key-demo-attack-001",
      circuitVersion: "vfy-policy-demo-v1",
      proof: fakeProof(),
      public_signals: [...FAKE_SIGNALS],
    },
  },
];
