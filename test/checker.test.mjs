// Checker unit tests: every validation rule, its boundaries, and the
// transport-vs-finding distinction. Expected values are hardcoded;
// nothing here calls the code under test to produce expectations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ValidationError, checkTurn } from "../src/checker.js";
import { EXAMPLES } from "../src/examples.js";

function validResponse(overrides = {}) {
  return {
    matchId: "match_demo_001",
    turn: 7,
    action: { type: "STEAL", amount: 25 },
    idempotencyKey: "key-demo-001",
    circuitVersion: "vfy-policy-demo-v1",
    proof: {
      pi_a: ["11", "22"],
      pi_b: [
        ["1", "2"],
        ["3", "4"],
      ],
      pi_c: ["5", "6"],
      protocol: "groth16",
      curve: "bn128",
    },
    public_signals: ["101", "102", "103", "104", "105", "106", "107", "108", "109"],
    ...overrides,
  };
}

function expected(overrides = {}) {
  return { matchId: "match_demo_001", turn: 7, ...overrides };
}

function run(response, exp = expected()) {
  return checkTurn({ expected: exp, response });
}

function statuses(report, idPrefix) {
  return report.checks
    .filter((c) => c.id.startsWith(idPrefix))
    .map((c) => c.status);
}

function hasStatus(report, id, status) {
  return report.checks.some((c) => c.id === id && c.status === status);
}

// --- Valid shapes ---

test("valid STEAL (object action) passes with zero errors", () => {
  const report = run(validResponse());
  assert.equal(report.verdict, "valid");
  assert.equal(report.errors, 0);
  assert.equal(report.action, "STEAL");
});

test("valid STEAL (string action + top-level amount) passes", () => {
  const response = validResponse({ action: "STEAL", amount: 25 });
  const report = run(response);
  assert.equal(report.verdict, "valid");
});

test("valid STEAL with a decimal-string amount passes", () => {
  const report = run(validResponse({ action: { type: "STEAL", amount: "25" } }));
  assert.equal(report.verdict, "valid");
});

test("valid STEAL without any amount passes (no published requirement)", () => {
  const report = run(validResponse({ action: { type: "STEAL" } }));
  assert.equal(report.verdict, "valid");
  assert.ok(hasStatus(report, "amount-present-steal", "info"));
});

test("valid HOLD with amount omitted entirely passes", () => {
  const report = run(validResponse({ action: { type: "HOLD" } }));
  assert.equal(report.verdict, "valid");
  assert.ok(hasStatus(report, "amount-omitted", "pass"));
});

test("valid FORTIFY with amount omitted entirely passes", () => {
  const report = run(validResponse({ action: "FORTIFY" }));
  assert.equal(report.verdict, "valid");
});

// --- The amount rule: presence is the error ---

test("HOLD with amount: 0 fails (the field is rejected even when 0)", () => {
  const report = run(validResponse({ action: { type: "HOLD", amount: 0 } }));
  assert.equal(report.verdict, "invalid");
  assert.ok(statuses(report, "amount-omitted").includes("fail"));
});

test("HOLD with amount: null fails (null is still present)", () => {
  const report = run(validResponse({ action: { type: "HOLD", amount: null } }));
  assert.equal(report.verdict, "invalid");
});

test("HOLD with amount: '' fails (empty string is still present)", () => {
  const report = run(validResponse({ action: { type: "HOLD", amount: "" } }));
  assert.equal(report.verdict, "invalid");
});

test("HOLD string action with top-level amount fails", () => {
  const report = run(validResponse({ action: "HOLD", amount: 0 }));
  assert.equal(report.verdict, "invalid");
});

test("FORTIFY with amount fails", () => {
  const report = run(validResponse({ action: { type: "FORTIFY", amount: 10 } }));
  assert.equal(report.verdict, "invalid");
});

test("STEAL with amount: null fails the shape check", () => {
  const report = run(validResponse({ action: { type: "STEAL", amount: null } }));
  assert.equal(report.verdict, "invalid");
});

test("STEAL with a negative amount warns but stays valid", () => {
  const report = run(validResponse({ action: { type: "STEAL", amount: -5 } }));
  assert.equal(report.verdict, "valid");
  assert.equal(report.warnings, 1);
});

test("STEAL with amount in both places warns but stays valid", () => {
  const report = run(
    validResponse({ action: { type: "STEAL", amount: 5 }, amount: 5 }),
  );
  assert.equal(report.verdict, "valid");
  assert.ok(hasStatus(report, "amount-both-places", "warn"));
});

// --- Echo rules: strict, no coercion ---

test("matchId mismatch fails", () => {
  const report = run(validResponse({ matchId: "match_demo_999" }));
  assert.equal(report.verdict, "invalid");
  assert.ok(hasStatus(report, "matchid-echo", "fail"));
});

test("missing matchId fails", () => {
  const response = validResponse();
  delete response.matchId;
  assert.equal(run(response).verdict, "invalid");
});

test("turn mismatch fails", () => {
  const report = run(validResponse({ turn: 8 }));
  assert.equal(report.verdict, "invalid");
  assert.ok(hasStatus(report, "turn-echo", "fail"));
});

test("turn as string vs number fails (no coercion)", () => {
  const report = run(validResponse({ turn: "7" }));
  assert.equal(report.verdict, "invalid");
  assert.ok(hasStatus(report, "turn-echo", "fail"));
});

test("missing turn fails", () => {
  const response = validResponse();
  delete response.turn;
  assert.equal(run(response).verdict, "invalid");
});

// --- Action enum ---

test("unknown action fails", () => {
  const report = run(validResponse({ action: { type: "ATTACK", amount: 5 } }));
  assert.equal(report.verdict, "invalid");
  assert.ok(hasStatus(report, "action-known", "fail"));
});

test("lowercase action fails (enum is case-sensitive)", () => {
  const report = run(validResponse({ action: "hold" }));
  assert.equal(report.verdict, "invalid");
});

test("missing action fails", () => {
  const response = validResponse();
  delete response.action;
  assert.equal(run(response).verdict, "invalid");
});

test("action object without a type field fails", () => {
  const report = run(validResponse({ action: { amount: 5 } }));
  assert.equal(report.verdict, "invalid");
  assert.ok(hasStatus(report, "action-shape", "fail"));
});

test("non-string, non-object action fails", () => {
  const report = run(validResponse({ action: 42 }));
  assert.equal(report.verdict, "invalid");
});

// --- idempotencyKey ---

test("missing idempotencyKey fails", () => {
  const response = validResponse();
  delete response.idempotencyKey;
  assert.equal(run(response).verdict, "invalid");
});

test("empty-string idempotencyKey fails", () => {
  const report = run(validResponse({ idempotencyKey: "" }));
  assert.equal(report.verdict, "invalid");
});

test("whitespace-only idempotencyKey fails", () => {
  const report = run(validResponse({ idempotencyKey: "   " }));
  assert.equal(report.verdict, "invalid");
});

test("non-string idempotencyKey fails", () => {
  const report = run(validResponse({ idempotencyKey: 123 }));
  assert.equal(report.verdict, "invalid");
});

// --- circuitVersion ---

test("missing circuitVersion fails", () => {
  const response = validResponse();
  delete response.circuitVersion;
  assert.equal(run(response).verdict, "invalid");
});

test("empty circuitVersion fails", () => {
  const report = run(validResponse({ circuitVersion: "" }));
  assert.equal(report.verdict, "invalid");
});

// --- Proof shape ---

test("missing proof fails", () => {
  const response = validResponse();
  delete response.proof;
  const report = run(response);
  assert.equal(report.verdict, "invalid");
  assert.ok(hasStatus(report, "proof-present", "fail"));
});

test("non-object proof fails", () => {
  const report = run(validResponse({ proof: "not-a-proof" }));
  assert.equal(report.verdict, "invalid");
  assert.ok(hasStatus(report, "proof-shape", "fail"));
});

test("proof missing pi_b fails and names the field", () => {
  const proof = validResponse().proof;
  delete proof.pi_b;
  const report = run(validResponse({ proof }));
  assert.equal(report.verdict, "invalid");
  assert.ok(hasStatus(report, "proof-field-pi_b", "fail"));
});

test("proof pi_a with the wrong length fails", () => {
  const proof = validResponse().proof;
  proof.pi_a = ["11"];
  assert.equal(run(validResponse({ proof })).verdict, "invalid");
});

test("proof pi_b that is not 2x2 fails", () => {
  const proof = validResponse().proof;
  proof.pi_b = [["1", "2"]];
  assert.equal(run(validResponse({ proof })).verdict, "invalid");
});

test("proof pi_a with a non-decimal element fails", () => {
  const proof = validResponse().proof;
  proof.pi_a = ["11", 22];
  assert.equal(run(validResponse({ proof })).verdict, "invalid");
});

test("proof with the wrong protocol fails", () => {
  const proof = validResponse().proof;
  proof.protocol = "plonk";
  const report = run(validResponse({ proof }));
  assert.equal(report.verdict, "invalid");
  assert.ok(hasStatus(report, "proof-protocol", "fail"));
});

test("proof with the wrong curve fails", () => {
  const proof = validResponse().proof;
  proof.curve = "bls12-381";
  const report = run(validResponse({ proof }));
  assert.equal(report.verdict, "invalid");
  assert.ok(hasStatus(report, "proof-curve", "fail"));
});

// --- public_signals ---

test("missing public_signals fails", () => {
  const response = validResponse();
  delete response.public_signals;
  assert.equal(run(response).verdict, "invalid");
});

test("empty public_signals fails", () => {
  const report = run(validResponse({ public_signals: [] }));
  assert.equal(report.verdict, "invalid");
});

test("public_signals with a non-string element fails", () => {
  const signals = [...validResponse().public_signals];
  signals[0] = 101;
  assert.equal(run(validResponse({ public_signals: signals })).verdict, "invalid");
});

test("public_signals with a non-decimal string fails", () => {
  const signals = [...validResponse().public_signals];
  signals[0] = "0x65";
  assert.equal(run(validResponse({ public_signals: signals })).verdict, "invalid");
});

test("public_signals count other than 9 warns but stays valid", () => {
  const report = run(validResponse({ public_signals: ["1", "2"] }));
  assert.equal(report.verdict, "valid");
  assert.ok(hasStatus(report, "public-signals-count", "warn"));
});

// --- Optional pointers, extra fields ---

test("absent optional pointers are info, not failures", () => {
  const report = run(validResponse());
  assert.ok(hasStatus(report, "proofReference-optional", "info"));
  assert.ok(hasStatus(report, "publicInputsHash-optional", "info"));
});

test("present optional pointers must be non-empty strings", () => {
  const report = run(
    validResponse({ proofReference: "ref-1", publicInputsHash: "0xabc" }),
  );
  assert.equal(report.verdict, "valid");
  const bad = run(validResponse({ publicInputsHash: 42 }));
  assert.equal(bad.verdict, "invalid");
});

test("unrecognized top-level fields are ignored, not failed", () => {
  const report = run(validResponse({ somethingElse: true }));
  assert.equal(report.verdict, "valid");
  assert.ok(hasStatus(report, "extra-fields", "info"));
});

// --- Transport errors vs validation findings ---

test("missing expected throws ValidationError (caller's 400)", () => {
  assert.throws(() => checkTurn({ response: validResponse() }), ValidationError);
});

test("missing expected.matchId throws ValidationError", () => {
  assert.throws(
    () => checkTurn({ expected: { turn: 7 }, response: validResponse() }),
    ValidationError,
  );
});

test("missing expected.turn throws ValidationError", () => {
  assert.throws(
    () =>
      checkTurn({
        expected: { matchId: "match_demo_001" },
        response: validResponse(),
      }),
    ValidationError,
  );
});

test("non-object response throws ValidationError", () => {
  assert.throws(() => checkTurn({ expected: expected(), response: "nope" }), ValidationError);
  assert.throws(() => checkTurn({ expected: expected(), response: null }), ValidationError);
});

test("non-object request body throws ValidationError", () => {
  assert.throws(() => checkTurn(null), ValidationError);
  assert.throws(() => checkTurn([1, 2]), ValidationError);
});

// --- Bundled examples agree with their stated verdicts ---

test("every bundled example's actual verdict matches its expected verdict", () => {
  assert.ok(EXAMPLES.length >= 5, `expected at least 5 examples, got ${EXAMPLES.length}`);
  for (const ex of EXAMPLES) {
    const report = checkTurn({ expected: ex.expected, response: ex.response });
    assert.equal(
      report.verdict,
      ex.expectedVerdict,
      `example ${ex.id}: expected ${ex.expectedVerdict}, got ${report.verdict}`,
    );
    assert.equal(typeof ex.label, "string");
    assert.equal(typeof ex.note, "string");
  }
});

test("the invalid verdict summary cites the HOLD treatment", () => {
  const report = run(validResponse({ turn: 8 }));
  assert.match(report.summary, /treated as HOLD/);
});

test("the report carries the honest-scope statement", () => {
  const report = run(validResponse());
  assert.match(report.scope, /no publicInputsHash computed/i);
});
