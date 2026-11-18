// Server tests: spin up the real server on an ephemeral port and hit
// it over HTTP. No mocks.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function postCheck(body, raw, path = "/api/check") {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
}

function validBody() {
  return {
    expected: { matchId: "match_demo_001", turn: 7 },
    response: {
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
    },
  };
}

test("GET /health returns ok", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.service, "vfy-turn-checker");
  assert.equal(data.version, "1.0.0");
});

test("GET /api/health returns the same shape", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.service, "vfy-turn-checker");
  assert.equal(data.version, "1.0.0");
});

test("GET / serves the UI with the scope and amount-rule statements", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const html = await res.text();
  assert.match(html, /Steal-the-VFY Turn Checker/);
  assert.match(html, /Honest scope/);
  assert.match(html, /omitted entirely/);
  assert.match(html, /publicInputsHash/);
});

test("GET /app.js serves the client script", async () => {
  const res = await fetch(`${base}/app.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /javascript/);
});

test("GET /api/examples returns at least 5 labeled examples", async () => {
  const res = await fetch(`${base}/api/examples`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.examples));
  assert.ok(data.examples.length >= 5);
  for (const ex of data.examples) {
    assert.equal(typeof ex.label, "string");
    assert.ok(["valid", "invalid"].includes(ex.expectedVerdict));
    assert.equal(typeof ex.expected.matchId, "string");
    assert.equal(typeof ex.response, "object");
  }
});

test("GET /api/rules documents the amount rule and the hash non-claim", async () => {
  const res = await fetch(`${base}/api/rules`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.rules.actions.valid, ["STEAL", "HOLD", "FORTIFY"]);
  const amountRule = data.rules.rules.find((r) => r.id === "amount-omitted");
  assert.match(amountRule.rule, /omitted entirely/i);
  assert.match(data.rules.publicInputsHash.paragraphs.join(" "), /NOT public/);
  assert.match(
    data.rules.publicInputsHash.illustrativeExample.label,
    /ILLUSTRATIVE ONLY/,
  );
  assert.match(data.rules.scope, /no publicInputsHash computed/i);
});

test("POST /api/check returns 200 + valid for a valid STEAL", async () => {
  const res = await postCheck(validBody());
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.verdict, "valid");
  assert.equal(data.errors, 0);
  assert.ok(Array.isArray(data.checks));
  assert.ok(data.checks.length > 5);
});

test("POST /api/check returns 200 + invalid for HOLD with amount: 0 (not a 400)", async () => {
  const body = validBody();
  body.response.action = { type: "HOLD", amount: 0 };
  const res = await postCheck(body);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.verdict, "invalid");
  assert.ok(data.errors >= 1);
  assert.ok(
    data.checks.some(
      (c) => c.status === "fail" && /amount/i.test(c.name + c.detail),
    ),
  );
});

test("POST /api/check returns 200 + invalid for a wrong turn echo", async () => {
  const body = validBody();
  body.response.turn = "7";
  const res = await postCheck(body);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.verdict, "invalid");
});

test("POST /api/validate is an alias for /api/check", async () => {
  const res = await postCheck(validBody(), undefined, "/api/validate");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.verdict, "valid");
});

test("POST /api/check rejects malformed JSON with 400", async () => {
  const res = await postCheck(null, "{not json");
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /valid JSON/);
});

test("POST /api/check rejects a missing expected block with 400", async () => {
  const res = await postCheck({ response: validBody().response });
  assert.equal(res.status, 400);
});

test("POST /api/check rejects a missing response with 400", async () => {
  const res = await postCheck({ expected: { matchId: "m", turn: 1 } });
  assert.equal(res.status, 400);
});

test("POST /api/check rejects a non-object response with 400", async () => {
  const res = await postCheck({
    expected: { matchId: "m", turn: 1 },
    response: "nope",
  });
  assert.equal(res.status, 400);
});

test("POST /api/check rejects an oversized body with 413", async () => {
  const res = await postCheck(null, JSON.stringify({ pad: "x".repeat(70 * 1024) }));
  assert.equal(res.status, 413);
});

test("GET unknown route returns 404 JSON", async () => {
  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error, "not found");
});
