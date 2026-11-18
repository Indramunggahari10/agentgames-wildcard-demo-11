// Steal-the-VFY Turn Checker — schema/shape validation ONLY.
//
// Validates a pasted turn response against the published protocol in
// SPEC.md section 4. It generates no proofs, verifies no proofs,
// computes no publicInputsHash, makes no platform calls, and holds no
// live data. A "valid" verdict means only: every documented shape rule
// this tool can check locally passed. The platform still independently
// verifies the proof and computes its own publicInputsHash.
import { RULES } from "./rules.js";

export const VALID_ACTIONS = ["STEAL", "HOLD", "FORTIFY"];
export const AMOUNT_FORBIDDEN_ACTIONS = ["HOLD", "FORTIFY"];
export const EXPECTED_PUBLIC_SIGNALS = 9;

const DECIMAL_RE = /^\d+$/;
const KNOWN_RESPONSE_FIELDS = new Set([
  "matchId",
  "turn",
  "action",
  "amount",
  "idempotencyKey",
  "circuitVersion",
  "proof",
  "public_signals",
  "proofReference",
  "publicInputsHash",
]);

export class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function short(value) {
  const text =
    typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > 80 ? text.slice(0, 77) + "..." : text;
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isDecimalString(value) {
  return typeof value === "string" && DECIMAL_RE.test(value);
}

function check(id, name, status, detail, specRef) {
  return { id, name, status, detail, specRef };
}

// Extract the action name from either supported encoding:
//   - action: "STEAL" (string form)
//   - action: { type: "STEAL", amount?: ... } (object form, mirrors the
//     SPEC.md section 4 notation `action.amount`)
// Returns { name, form } where name is null when no usable name exists.
function actionName(action) {
  if (typeof action === "string") return { name: action, form: "string" };
  if (isPlainObject(action) && typeof action.type === "string") {
    return { name: action.type, form: "object" };
  }
  return { name: null, form: isPlainObject(action) ? "object" : typeOf(action) };
}

// Where an `amount` key is present, if anywhere. Presence is what the
// rule cares about: for HOLD/FORTIFY the field must be omitted
// entirely, so even amount: 0 or amount: null counts as present.
function amountLocations(response) {
  const locations = [];
  if (isPlainObject(response.action) && hasOwn(response.action, "amount")) {
    locations.push({ loc: "action.amount", value: response.action.amount });
  }
  if (hasOwn(response, "amount")) {
    locations.push({ loc: "amount", value: response.amount });
  }
  return locations;
}

function checkProofShape(proof, checks) {
  if (!isPlainObject(proof)) {
    checks.push(
      check(
        "proof-shape",
        "Policy proof is an object",
        "fail",
        `proof must be an object carrying the Groth16 fields; received ${typeOf(proof)}.`,
        "SPEC.md §4, §5",
      ),
    );
    return;
  }

  const fields = ["pi_a", "pi_b", "pi_c", "protocol", "curve"];
  for (const field of fields) {
    if (!hasOwn(proof, field)) {
      checks.push(
        check(
          `proof-field-${field}`,
          `Proof field ${field} present`,
          "fail",
          `proof.${field} is missing. A Groth16 proof carries pi_a, pi_b, pi_c, protocol, and curve.`,
          "SPEC.md §4, §5",
        ),
      );
    }
  }
  const missing = fields.filter((field) => !hasOwn(proof, field));

  // pi_a / pi_c: arrays of exactly 2 decimal strings (checked only
  // when present; absence is already reported above).
  for (const field of ["pi_a", "pi_c"]) {
    if (missing.includes(field)) continue;
    const value = proof[field];
    const ok =
      Array.isArray(value) &&
      value.length === 2 &&
      value.every(isDecimalString);
    checks.push(
      check(
        `proof-${field}`,
        `Proof ${field} shape`,
        ok ? "pass" : "fail",
        ok
          ? `${field} is an array of 2 decimal strings.`
          : `${field} must be an array of exactly 2 decimal strings; received ${short(value)}.`,
        "SPEC.md §5",
      ),
    );
  }

  // pi_b: a 2x2 array of decimal strings (when present).
  if (!missing.includes("pi_b")) {
    const piB = proof.pi_b;
    const piBOk =
      Array.isArray(piB) &&
      piB.length === 2 &&
      piB.every(
        (row) => Array.isArray(row) && row.length === 2 && row.every(isDecimalString),
      );
    checks.push(
      check(
        "proof-pi_b",
        "Proof pi_b shape",
        piBOk ? "pass" : "fail",
        piBOk
          ? "pi_b is a 2x2 array of decimal strings."
          : `pi_b must be a 2x2 array of decimal strings; received ${short(piB)}.`,
        "SPEC.md §5",
      ),
    );
  }

  // protocol / curve: the arena circuits are Groth16 / BN128 (SPEC §5).
  if (!missing.includes("protocol")) {
    checks.push(
      check(
        "proof-protocol",
        "Proof protocol is groth16",
        proof.protocol === "groth16" ? "pass" : "fail",
        proof.protocol === "groth16"
          ? 'protocol is "groth16".'
          : `protocol must be "groth16" (SPEC §5: both arena circuits are Groth16); received ${short(proof.protocol)}.`,
        "SPEC.md §5",
      ),
    );
  }
  if (!missing.includes("curve")) {
    checks.push(
      check(
        "proof-curve",
        "Proof curve is bn128",
        proof.curve === "bn128" ? "pass" : "fail",
        proof.curve === "bn128"
          ? 'curve is "bn128".'
          : `curve must be "bn128" (SPEC §5: both arena circuits are Groth16/BN128); received ${short(proof.curve)}.`,
        "SPEC.md §5",
      ),
    );
  }
}

function checkPublicSignals(value, checks) {
  if (!Array.isArray(value)) {
    checks.push(
      check(
        "public-signals-shape",
        "public_signals is a non-empty array",
        "fail",
        `public_signals must be a non-empty array of decimal strings; received ${typeOf(value)}.`,
        "SPEC.md §4",
      ),
    );
    return;
  }
  if (value.length === 0) {
    checks.push(
      check(
        "public-signals-shape",
        "public_signals is a non-empty array",
        "fail",
        "public_signals must be a non-empty array of decimal strings; received an empty array.",
        "SPEC.md §4",
      ),
    );
    return;
  }
  const badIndex = value.findIndex((el) => !isDecimalString(el));
  checks.push(
    check(
      "public-signals-shape",
      "public_signals are decimal strings",
      badIndex === -1 ? "pass" : "fail",
      badIndex === -1
        ? `public_signals holds ${value.length} decimal string(s). Shape only — values are not verified.`
        : `public_signals[${badIndex}] must be a decimal string; received ${short(value[badIndex])}.`,
      "SPEC.md §4",
    ),
  );
  // Count note only: the vfy-policy verification key has 9 public
  // inputs (SPEC §5, verified locally against the published VK). The
  // signal names/order are undocumented, so a different count is a
  // warning, never a failure.
  if (value.length !== EXPECTED_PUBLIC_SIGNALS) {
    checks.push(
      check(
        "public-signals-count",
        "public_signals count vs vfy-policy VK",
        "warn",
        `public_signals holds ${value.length} value(s); the published vfy-policy VK has ${EXPECTED_PUBLIC_SIGNALS} public inputs (SPEC §5). A different count may mean the proof covers different inputs — warning only, because the signal layout is not published.`,
        "SPEC.md §5",
      ),
    );
  }
}

function checkAmountShape(locations, checks) {
  for (const { loc, value } of locations) {
    if (typeof value === "number" && Number.isFinite(value)) {
      if (Number.isInteger(value) && value >= 0) {
        checks.push(
          check(
            `amount-shape-${loc}`,
            `Amount shape (${loc})`,
            "pass",
            `${loc} is a non-negative integer. No platform range rule is claimed.`,
            "SPEC.md §4",
          ),
        );
      } else {
        checks.push(
          check(
            `amount-shape-${loc}`,
            `Amount shape (${loc})`,
            "warn",
            `${loc} is ${value}. A STEAL amount is expected to be a non-negative integer; a negative or fractional value is unusual. Warning only — no platform range rule is published.`,
            "SPEC.md §4",
          ),
        );
      }
    } else if (typeof value === "string" && DECIMAL_RE.test(value)) {
      checks.push(
        check(
          `amount-shape-${loc}`,
          `Amount shape (${loc})`,
          "pass",
          `${loc} is a decimal string. No platform range rule is claimed.`,
          "SPEC.md §4",
        ),
      );
    } else if (typeof value === "string" && /^\d+\.\d+$/.test(value)) {
      checks.push(
        check(
          `amount-shape-${loc}`,
          `Amount shape (${loc})`,
          "warn",
          `${loc} is the fractional decimal string ${short(value)}. Warning only — no platform amount format is published.`,
          "SPEC.md §4",
        ),
      );
    } else {
      checks.push(
        check(
          `amount-shape-${loc}`,
          `Amount shape (${loc})`,
          "fail",
          `${loc} must be a finite number or a decimal string when present; received ${typeOf(value)} (${short(value)}).`,
          "SPEC.md §4",
        ),
      );
    }
  }
  if (locations.length > 1) {
    checks.push(
      check(
        "amount-both-places",
        "Amount in one place only",
        "warn",
        "amount is present in both action.amount and the top-level amount field. The tool checks both; the platform schema is not published, so this is a warning, not a failure.",
        "SPEC.md §4",
      ),
    );
  }
}

// Validate one turn response against the expected envelope values.
// `expected` must carry matchId and turn (the caller pastes them from
// the turn envelope); `response` is the pasted turn response object.
// Returns a checks report. Transport-level misuse (missing expected /
// response) throws ValidationError and is the caller's 400, NOT a
// validation finding: a well-formed response with protocol errors
// returns a report, never an exception.
export function checkTurn(input) {
  if (!isPlainObject(input)) {
    throw new ValidationError("request body must be a JSON object", {
      received: typeOf(input),
    });
  }
  if (!isPlainObject(input.expected)) {
    throw new ValidationError("expected must be an object with matchId and turn", {
      received: typeOf(input.expected),
    });
  }
  if (input.expected.matchId === undefined || input.expected.matchId === null) {
    throw new ValidationError("expected.matchId is required (paste it from the turn envelope)");
  }
  if (input.expected.turn === undefined || input.expected.turn === null) {
    throw new ValidationError("expected.turn is required (paste it from the turn envelope)");
  }
  if (!isPlainObject(input.response)) {
    throw new ValidationError("response must be a JSON object (the pasted turn response)", {
      received: typeOf(input.response),
    });
  }

  const { expected, response } = input;
  const checks = [];

  // 1. matchId echo — exact, strict, no coercion.
  if (!hasOwn(response, "matchId") || response.matchId === null || response.matchId === undefined) {
    checks.push(
      check(
        "matchid-present",
        "matchId present",
        "fail",
        "matchId is missing from the response. The response must echo matchId exactly.",
        "SPEC.md §4",
      ),
    );
  } else if (response.matchId === expected.matchId) {
    checks.push(
      check(
        "matchid-echo",
        "matchId echoed exactly",
        "pass",
        "matchId matches the turn envelope exactly (same value and same type).",
        "SPEC.md §4",
      ),
    );
  } else {
    checks.push(
      check(
        "matchid-echo",
        "matchId echoed exactly",
        "fail",
        `matchId mismatch: envelope ${short(expected.matchId)} (${typeOf(expected.matchId)}), response ${short(response.matchId)} (${typeOf(response.matchId)}). The echo must be exact — no coercion is applied.`,
        "SPEC.md §4",
      ),
    );
  }

  // 2. turn echo — exact, strict, no coercion. Turn "7" (string) does
  // NOT echo turn 7 (number).
  if (!hasOwn(response, "turn") || response.turn === null || response.turn === undefined) {
    checks.push(
      check(
        "turn-present",
        "turn present",
        "fail",
        "turn is missing from the response. The response must echo turn exactly.",
        "SPEC.md §4",
      ),
    );
  } else if (response.turn === expected.turn) {
    checks.push(
      check(
        "turn-echo",
        "turn echoed exactly",
        "pass",
        "turn matches the turn envelope exactly (same value and same type).",
        "SPEC.md §4",
      ),
    );
  } else {
    checks.push(
      check(
        "turn-echo",
        "turn echoed exactly",
        "fail",
        `turn mismatch: envelope ${short(expected.turn)} (${typeOf(expected.turn)}), response ${short(response.turn)} (${typeOf(response.turn)}). The echo must be exact — turn "7" (string) does not echo turn 7 (number).`,
        "SPEC.md §4",
      ),
    );
  }

  // 3. action enum.
  const { name: actionNameValue, form } = actionName(response.action);
  if (!hasOwn(response, "action") || response.action === null || response.action === undefined) {
    checks.push(
      check(
        "action-present",
        "action present",
        "fail",
        "action is missing from the response. The response must declare an action.",
        "SPEC.md §4",
      ),
    );
  } else if (actionNameValue === null) {
    checks.push(
      check(
        "action-shape",
        "action carries a name",
        "fail",
        form === "object"
          ? "action is an object but carries no string `type` field. Use action: \"STEAL\" or action: { type: \"STEAL\", ... }."
          : `action must be a string or an object with a string type field; received ${form}.`,
        "SPEC.md §4",
      ),
    );
  } else if (VALID_ACTIONS.includes(actionNameValue)) {
    checks.push(
      check(
        "action-known",
        "action is a documented action",
        "pass",
        `action is ${actionNameValue} (${form} form). Documented actions: ${VALID_ACTIONS.join(", ")}.`,
        "SPEC.md §4",
      ),
    );
  } else {
    checks.push(
      check(
        "action-known",
        "action is a documented action",
        "fail",
        `Unknown action ${short(actionNameValue)}. The documented actions are ${VALID_ACTIONS.join(", ")} — the platform's full action list is not published beyond these, so anything else is flagged. Action names are case-sensitive.`,
        "SPEC.md §4",
      ),
    );
  }

  // 4. The amount rule. For HOLD/FORTIFY, amount must be OMITTED
  // ENTIRELY — present even as 0 or null is an error. For STEAL, a
  // present amount is shape-checked only.
  const locations = amountLocations(response);
  if (actionNameValue !== null && AMOUNT_FORBIDDEN_ACTIONS.includes(actionNameValue)) {
    if (locations.length === 0) {
      checks.push(
        check(
          "amount-omitted",
          "amount omitted for HOLD/FORTIFY",
          "pass",
          `amount is omitted entirely, as required for ${actionNameValue}.`,
          "SPEC.md §4",
        ),
      );
    } else {
      for (const { loc, value } of locations) {
        checks.push(
          check(
            `amount-omitted-${loc}`,
            "amount omitted for HOLD/FORTIFY",
            "fail",
            `${loc} is present (${short(value)}, ${typeOf(value)}) on a ${actionNameValue} response. The schema rejects the field even when 0 — omit the key entirely, do not send 0 or null.`,
            "SPEC.md §4",
          ),
        );
      }
    }
  } else if (actionNameValue === "STEAL") {
    if (locations.length === 0) {
      checks.push(
        check(
          "amount-present-steal",
          "amount for STEAL",
          "info",
          "No amount field is present. No published rule in SPEC §4 states whether STEAL requires one, so absence is not flagged.",
          "SPEC.md §4",
        ),
      );
    } else {
      checkAmountShape(locations, checks);
    }
  } else if (locations.length > 0 && actionNameValue !== null) {
    // Unknown action: still report amount presence for completeness.
    checks.push(
      check(
        "amount-unknown-action",
        "amount with unknown action",
        "info",
        `amount is present (${locations.map((l) => l.loc).join(", ")}) but the action itself is unknown, so no amount rule applies.`,
        "SPEC.md §4",
      ),
    );
  }

  // 5. idempotencyKey — present and non-empty. Uniqueness against the
  // platform is NOT checked (it needs platform state this tool has no
  // access to); the uniqueness rule is stated as documented context.
  if (!hasOwn(response, "idempotencyKey") || response.idempotencyKey === null || response.idempotencyKey === undefined) {
    checks.push(
      check(
        "idempotency-present",
        "idempotencyKey present",
        "fail",
        "idempotencyKey is missing. It must be present and non-empty, unique per turn; only the first submission per key counts.",
        "SPEC.md §4",
      ),
    );
  } else if (typeof response.idempotencyKey !== "string" || response.idempotencyKey.trim().length === 0) {
    checks.push(
      check(
        "idempotency-present",
        "idempotencyKey present",
        "fail",
        `idempotencyKey must be a non-empty string; received ${typeOf(response.idempotencyKey)} (${short(response.idempotencyKey)}). Uniqueness against the platform is not checked here — only presence and shape.`,
        "SPEC.md §4",
      ),
    );
  } else {
    checks.push(
      check(
        "idempotency-present",
        "idempotencyKey present",
        "pass",
        "idempotencyKey is present and non-empty. Uniqueness against the platform is NOT checked: only the first submission per key counts, and this tool has no platform state.",
        "SPEC.md §4",
      ),
    );
  }

  // 6. circuitVersion — present and a non-empty string. Whether it
  // matches the registered strategy commitment is NOT checked: the
  // commitment lives in the dashboard, not in this tool.
  if (!hasOwn(response, "circuitVersion") || response.circuitVersion === null || response.circuitVersion === undefined) {
    checks.push(
      check(
        "circuit-version-present",
        "circuitVersion present",
        "fail",
        "circuitVersion is missing. The policy proof must carry circuitVersion, and it must match the registered strategy commitment.",
        "SPEC.md §4",
      ),
    );
  } else if (typeof response.circuitVersion !== "string" || response.circuitVersion.trim().length === 0) {
    checks.push(
      check(
        "circuit-version-present",
        "circuitVersion present",
        "fail",
        `circuitVersion must be a non-empty string; received ${typeOf(response.circuitVersion)} (${short(response.circuitVersion)}).`,
        "SPEC.md §4",
      ),
    );
  } else {
    checks.push(
      check(
        "circuit-version-present",
        "circuitVersion present",
        "pass",
        "circuitVersion is present and non-empty. Whether it matches the registered strategy commitment is NOT checked — the commitment is dashboard state this tool cannot see.",
        "SPEC.md §4",
      ),
    );
  }

  // 7. Policy proof shape.
  if (!hasOwn(response, "proof") || response.proof === null || response.proof === undefined) {
    checks.push(
      check(
        "proof-present",
        "proof present",
        "fail",
        "proof is missing. The policy proof must carry circuitVersion, a Groth16 proof, and public_signals. Shape only — nothing here is verified.",
        "SPEC.md §4",
      ),
    );
  } else {
    checks.push(
      check(
        "proof-present",
        "proof present",
        "pass",
        "proof is present. Its shape is checked below; it is never verified.",
        "SPEC.md §4",
      ),
    );
    checkProofShape(response.proof, checks);
  }

  // 8. public_signals shape.
  if (!hasOwn(response, "public_signals") || response.public_signals === null || response.public_signals === undefined) {
    checks.push(
      check(
        "public-signals-present",
        "public_signals present",
        "fail",
        "public_signals is missing. The policy proof must carry public_signals as a non-empty array of decimal strings.",
        "SPEC.md §4",
      ),
    );
  } else {
    checkPublicSignals(response.public_signals, checks);
  }

  // 9. Optional audit pointers: proofReference / publicInputsHash. If
  // present they must be non-empty strings. publicInputsHash is noted
  // only — this tool NEVER computes or compares the platform's hash.
  for (const field of ["proofReference", "publicInputsHash"]) {
    if (!hasOwn(response, field) || response[field] === null || response[field] === undefined) {
      checks.push(
        check(
          `${field}-optional`,
          `${field} (optional)`,
          "info",
          field === "publicInputsHash"
            ? "publicInputsHash is absent (optional). This tool never computes the platform's hash — the exact construction is not public."
            : "proofReference is absent (optional on-chain audit pointer).",
          "SPEC.md §4",
        ),
      );
    } else if (typeof response[field] !== "string" || response[field].trim().length === 0) {
      checks.push(
        check(
          `${field}-optional`,
          `${field} (optional)`,
          "fail",
          `${field} must be a non-empty string when present; received ${typeOf(response[field])} (${short(response[field])}).`,
          "SPEC.md §4",
        ),
      );
    } else {
      checks.push(
        check(
          `${field}-optional`,
          `${field} (optional)`,
          "pass",
          field === "publicInputsHash"
            ? "publicInputsHash is present and a non-empty string. Presence only — its value is never computed or compared here; the platform computes its own hash and rejects proofs where hashes diverge."
            : "proofReference is present and a non-empty string.",
          "SPEC.md §4",
        ),
      );
    }
  }

  // 10. Unrecognized top-level fields are ignored, and the report says so.
  const extra = Object.keys(response).filter((k) => !KNOWN_RESPONSE_FIELDS.has(k));
  checks.push(
    check(
      "extra-fields",
      "Unrecognized fields",
      "info",
      extra.length === 0
        ? "No unrecognized top-level fields."
        : `Unrecognized top-level field(s) ignored: ${extra.join(", ")}. Extra fields are neither accepted nor rejected — the published schema beyond SPEC §4 is not available to this tool.`,
      "SPEC.md §4",
    ),
  );

  const errors = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const verdict = errors === 0 ? "valid" : "invalid";

  return {
    verdict,
    summary:
      verdict === "valid"
        ? "All documented shape rules passed. This is schema/shape validation only: the proof is not verified and the platform's publicInputsHash is not computed. The platform still verifies the proof independently."
        : "One or more documented shape rules failed. Per SPEC §4, a response with a missing/mismatched required field is treated as HOLD with no proof — fix the failures before submitting.",
    action: actionNameValue,
    errors,
    warnings,
    checks,
    scope: RULES.scope,
  };
}
