// Steal-the-VFY Turn Checker UI. All validation happens server-side
// via /api/check; this file only renders results and example presets.
"use strict";

const $ = (id) => document.getElementById(id);
const matchIdInput = $("matchId");
const turnInput = $("turn");
const responseInput = $("response");
const chipsEl = $("chips");
const errorEl = $("error");
const resultEl = $("result");

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// The turn box is text so a user can paste either form. A bare integer
// is sent as a JSON number; anything else is sent as a string, which
// keeps the strict echo check demonstrable (turn "7" !== turn 7).
function parseTurn(raw) {
  const trimmed = raw.trim();
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function renderReport(data, expectedVerdict) {
  errorEl.innerHTML = "";
  const verdictClass = data.verdict === "valid" ? "valid" : "invalid";
  const verdictWord = data.verdict === "valid" ? "VALID" : "INVALID";
  const matchNote =
    expectedVerdict !== undefined
      ? data.verdict === expectedVerdict
        ? " — matches this example's expected verdict."
        : ` — NOTE: this example's expected verdict is ${expectedVerdict.toUpperCase()}.`
      : "";
  const rows = data.checks
    .map(
      (c) =>
        `<tr><td><span class="badge ${esc(c.status)}">${esc(c.status)}</span></td>` +
        `<td><strong>${esc(c.name)}</strong><br>${esc(c.detail)}</td>` +
        `<td class="muted">${esc(c.specRef)}</td></tr>`,
    )
    .join("");
  resultEl.innerHTML =
    `<div class="verdict ${verdictClass}"><strong>Verdict: ${verdictWord}</strong> ` +
    `(${data.errors} error(s), ${data.warnings} warning(s))${esc(matchNote)}</div>` +
    `<p>${esc(data.summary)}</p>` +
    `<table><thead><tr><th>Status</th><th>Check</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<p class="muted">${esc(data.scope)}</p>`;
}

function renderError(message) {
  errorEl.innerHTML = `<div class="error">${esc(message)}</div>`;
}

let lastExpectedVerdict;
async function checkCurrent() {
  const matchId = matchIdInput.value.trim();
  const turnRaw = turnInput.value;
  if (matchId === "" || turnRaw.trim() === "") {
    renderError("Fill in the expected matchId and turn from the turn envelope first.");
    return;
  }
  let response;
  try {
    response = JSON.parse(responseInput.value);
  } catch {
    renderError("The turn response is not valid JSON. Fix the JSON and try again — a well-formed response with protocol errors returns a checks report, not this error.");
    return;
  }
  try {
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expected: { matchId, turn: parseTurn(turnRaw) },
        response,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      renderError(data.error || "Check failed.");
      return;
    }
    renderReport(data, lastExpectedVerdict);
  } catch {
    renderError("Could not reach the check API.");
  }
}

$("checkBtn").addEventListener("click", checkCurrent);

async function loadExamples() {
  try {
    const res = await fetch("/api/examples");
    const data = await res.json();
    for (const ex of data.examples) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${ex.label} — expected: ${ex.expectedVerdict}`;
      btn.title = ex.note;
      btn.addEventListener("click", () => {
        matchIdInput.value = ex.expected.matchId;
        turnInput.value = String(ex.expected.turn);
        responseInput.value = JSON.stringify(ex.response, null, 2);
        lastExpectedVerdict = ex.expectedVerdict;
        checkCurrent();
      });
      chipsEl.appendChild(btn);
    }
    // Show the valid STEAL on load: it is the passing shape, and the
    // baseline every failing example is compared against.
    const first =
      data.examples.find((e) => e.id === "valid-steal") || data.examples[0];
    if (first) {
      matchIdInput.value = first.expected.matchId;
      turnInput.value = String(first.expected.turn);
      responseInput.value = JSON.stringify(first.response, null, 2);
      lastExpectedVerdict = first.expectedVerdict;
      checkCurrent();
    }
  } catch {
    chipsEl.innerHTML = `<span class="muted">Examples unavailable.</span>`;
  }
}

async function loadRules() {
  try {
    const res = await fetch("/api/rules");
    const data = await res.json();
    const r = data.rules;

    // Rules list.
    $("rules").innerHTML =
      `<p><strong>Documented actions:</strong> <code>${r.actions.valid.map(esc).join("</code>, <code>")}</code>. ${esc(r.actions.basis)}</p>` +
      `<ol>` +
      r.rules
        .map(
          (rule) =>
            `<li><strong>${esc(rule.name)}.</strong> ${esc(rule.rule)} ` +
            `<em>${esc(rule.consequence)}</em> <span class="muted">(${esc(rule.specRef)})</span></li>`,
        )
        .join("") +
      `</ol>`;

    // publicInputsHash explainer.
    const h = r.publicInputsHash;
    $("hashExplainer").innerHTML =
      h.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("") +
      `<div class="num"><span class="lbl">${esc(h.illustrativeExample.label)}</span>${esc(h.illustrativeExample.value)}</div>` +
      `<p class="muted">${esc(h.illustrativeExample.note)}</p>` +
      `<p><strong>What to do instead of guessing the hash:</strong></p><ol>` +
      h.whatToDo.map((step) => `<li>${esc(step)}</li>`).join("") +
      `</ol><p class="muted">Source: ${esc(h.specRef)}.</p>`;

    // Not-checked list.
    $("notChecked").innerHTML =
      `<ul>` +
      r.notChecked.map((item) => `<li>${esc(item)}</li>`).join("") +
      `</ul><p>${esc(r.scope)}</p>`;
  } catch {
    $("rules").innerHTML = `<p class="muted">Rules unavailable.</p>`;
    $("hashExplainer").innerHTML = `<p class="muted">Explainer unavailable.</p>`;
    $("notChecked").innerHTML = `<p class="muted">Unavailable.</p>`;
  }
}

loadExamples();
loadRules();
