// Approval decision control (ADR-0003 §C, §E). Reads only `#decision-slot`'s
// `data-submission-id` / `data-version-id` attributes and `location.hash` — shares no
// module state with review.js, which owns the page this script is loaded into.
//
// Rendering rule (binding, from the #1 security review): a decider's label and a
// decision's note are attacker-influenced display text for a guest. They are rendered
// as text nodes only, never through a markup-injection API or string-built markup, so a
// label like `<img src=x onerror=alert(1)>` is always shown as literal text.

const SLOT_ID = 'decision-slot';

export function guestTokenFromHash(hash) {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const token = new URLSearchParams(raw).get('t');
  return token && token.length > 0 ? token : undefined;
}

function el(tag, props = {}) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  return node;
}

/** Renders the final, read-only decision as text nodes only: label and note are untrusted. */
export function renderFinal(root, decision) {
  root.replaceChildren();
  const outcomeLabel = decision.outcome === 'approved' ? 'Approved' : 'Changes requested';

  const summary = el('p', { class: 'decision-final', 'data-outcome': decision.outcome });
  summary.appendChild(document.createTextNode(`${outcomeLabel} by `));
  const by = el('strong');
  by.appendChild(document.createTextNode(decision.decidedByLabel));
  summary.appendChild(by);
  summary.appendChild(document.createTextNode('.'));
  root.appendChild(summary);

  if (decision.note) {
    const note = el('p', { class: 'decision-note' });
    note.appendChild(document.createTextNode(decision.note));
    root.appendChild(note);
  }
}

function renderError(root, message) {
  const error = el('p', { class: 'decision-error', role: 'alert' });
  error.appendChild(document.createTextNode(message));
  root.appendChild(error);
}

async function fetchExisting(submissionId, versionId, guestToken) {
  const headers = {};
  if (guestToken !== undefined) headers['x-guest-token'] = guestToken;
  const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/decisions`, { headers });
  if (!res.ok) return undefined;
  const all = await res.json();
  return all.find((decision) => decision.versionId === versionId);
}

async function submitDecision(root, submissionId, versionId, outcome, guestToken, userId) {
  const headers = { 'content-type': 'application/json' };
  if (guestToken !== undefined) headers['x-guest-token'] = guestToken;
  else if (userId) headers['x-user-id'] = userId;

  const res = await fetch(`/api/versions/${encodeURIComponent(versionId)}/decisions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ outcome }),
  });

  if (res.status === 201) {
    renderFinal(root, await res.json());
    return;
  }
  if (res.status === 409) {
    const existing = await fetchExisting(submissionId, versionId, guestToken);
    if (existing) {
      renderFinal(root, existing);
      return;
    }
  }
  const body = await res.json().catch(() => undefined);
  renderError(root, body?.error?.message ?? 'Could not record the decision.');
}

function renderForm(root, submissionId, versionId, guestToken) {
  root.replaceChildren();
  const form = el('form', { class: 'decision-form' });

  let userIdInput;
  if (guestToken === undefined) {
    const label = el('label', { for: 'decision-user-id' });
    label.appendChild(document.createTextNode('Your user id (demo)'));
    userIdInput = el('input', { id: 'decision-user-id', name: 'userId', type: 'text', autocomplete: 'off' });
    form.appendChild(label);
    form.appendChild(userIdInput);
  }

  const approveBtn = el('button', { type: 'button', class: 'decision-approve' });
  approveBtn.appendChild(document.createTextNode('Approve'));
  const changesBtn = el('button', { type: 'button', class: 'decision-changes' });
  changesBtn.appendChild(document.createTextNode('Request changes'));

  approveBtn.addEventListener('click', () => {
    void submitDecision(root, submissionId, versionId, 'approved', guestToken, userIdInput?.value.trim());
  });
  changesBtn.addEventListener('click', () => {
    void submitDecision(root, submissionId, versionId, 'changes_requested', guestToken, userIdInput?.value.trim());
  });

  form.appendChild(approveBtn);
  form.appendChild(changesBtn);
  root.appendChild(form);
}

async function init() {
  const root = document.getElementById(SLOT_ID);
  if (!root) return;
  const submissionId = root.dataset.submissionId;
  const versionId = root.dataset.versionId;
  if (!submissionId || !versionId) return;

  const guestToken = guestTokenFromHash(location.hash);
  const existing = await fetchExisting(submissionId, versionId, guestToken);
  if (existing) renderFinal(root, existing);
  else renderForm(root, submissionId, versionId, guestToken);
}

void init();
