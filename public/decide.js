// Approval decision control (ADR-0003 §C, §E). Reads only `#decision-slot`'s
// `data-submission-id` / `data-version-id` attributes and `location.hash` — shares no
// module state with review.js, which owns the page this script is loaded into.
//
// Rendering rule (binding, from the #1 security review): a decider's label and a
// decision's note are attacker-influenced display text for a guest. They are rendered
// as text nodes only, never through a markup-injection API or string-built markup, so a
// label like `<img src=x onerror=alert(1)>` is always shown as literal text.
//
// Identity rule (round 2 review): a demo `x-user-id` is not a secret, so it is kept in
// `sessionStorage` to survive a reload — otherwise a member who already decided sees the
// form again, contradicting the permanent record. The guest token is never stored
// anywhere (ADR-0003 §B): it lives only in the `guestToken` argument threaded through
// each call, read fresh from `location.hash` every time.

const SLOT_ID = 'decision-slot';
const USER_ID_STORAGE_KEY = 'proofdesk:decide:demo-user-id';

export function guestTokenFromHash(hash) {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const token = new URLSearchParams(raw).get('t');
  return token && token.length > 0 ? token : undefined;
}

function getStoredUserId() {
  try {
    return sessionStorage.getItem(USER_ID_STORAGE_KEY) ?? '';
  } catch {
    // sessionStorage can throw (e.g. disabled storage); the demo id just won't persist.
    return '';
  }
}

function setStoredUserId(value) {
  try {
    if (value) sessionStorage.setItem(USER_ID_STORAGE_KEY, value);
    else sessionStorage.removeItem(USER_ID_STORAGE_KEY);
  } catch {
    // Same as above: persistence is best-effort, never required for correctness.
  }
}

/**
 * Reads `#decision-slot`'s two data attributes, or `undefined` if either is still empty.
 * #4's `review.html` ships the section with both attributes empty and fills them at
 * runtime from `review.js`; this script must never read them exactly once at load.
 */
function readSlotIds(root) {
  const submissionId = root.dataset.submissionId;
  const versionId = root.dataset.versionId;
  return submissionId && versionId ? { submissionId, versionId } : undefined;
}

/**
 * Resolves the slot's ids, waiting for `review.js` to populate them if they start empty.
 * Never gives up and never proceeds with an empty id: it observes the slot's attributes
 * until both are present. This makes `decide.js` resilient on its own, with no new
 * contract required from #4.
 */
function waitForSlotIds(root) {
  const immediate = readSlotIds(root);
  if (immediate) return Promise.resolve(immediate);
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const ids = readSlotIds(root);
      if (ids) {
        observer.disconnect();
        resolve(ids);
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-submission-id', 'data-version-id'] });
  });
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

function decisionHeaders(guestToken, userId) {
  const headers = {};
  if (guestToken !== undefined) headers['x-guest-token'] = guestToken;
  else if (userId) headers['x-user-id'] = userId;
  return headers;
}

async function fetchExisting(submissionId, versionId, guestToken, userId) {
  const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/decisions`, {
    headers: decisionHeaders(guestToken, userId),
  });
  if (!res.ok) return undefined;
  const all = await res.json();
  return all.find((decision) => decision.versionId === versionId);
}

async function submitDecision(root, submissionId, versionId, outcome, guestToken, userId) {
  const res = await fetch(`/api/versions/${encodeURIComponent(versionId)}/decisions`, {
    method: 'POST',
    headers: { ...decisionHeaders(guestToken, userId), 'content-type': 'application/json' },
    body: JSON.stringify({ outcome }),
  });

  if (res.status === 201) {
    renderFinal(root, await res.json());
    return;
  }
  if (res.status === 409) {
    // Someone (possibly this same reload-surviving identity, via a double-click) already
    // has a final decision on this version — show it, exactly as a reload would.
    const existing = await fetchExisting(submissionId, versionId, guestToken, userId);
    if (existing) {
      renderFinal(root, existing);
      return;
    }
  }
  const body = await res.json().catch(() => undefined);
  renderError(root, body?.error?.message ?? 'Could not record the decision.');
}

// A plain container, not a <form>: a text input plus two type="button" controls can never
// trigger HTML implicit submission on Enter, so there is no page navigation to lose
// `?submission=` or the `#t=` guest-token fragment to.
function renderForm(root, submissionId, versionId, guestToken) {
  root.replaceChildren();
  const container = el('div', { class: 'decision-form' });

  let userIdInput;
  if (guestToken === undefined) {
    const label = el('label', { for: 'decision-user-id' });
    label.appendChild(document.createTextNode('Your user id (demo)'));
    userIdInput = el('input', { id: 'decision-user-id', name: 'userId', type: 'text', autocomplete: 'off' });
    userIdInput.value = getStoredUserId();
    container.appendChild(label);
    container.appendChild(userIdInput);
  }

  const decide = (outcome) => {
    const userId = userIdInput?.value.trim();
    if (guestToken === undefined) setStoredUserId(userId ?? '');
    void submitDecision(root, submissionId, versionId, outcome, guestToken, userId);
  };

  const approveBtn = el('button', { type: 'button', class: 'decision-approve' });
  approveBtn.appendChild(document.createTextNode('Approve'));
  approveBtn.addEventListener('click', () => decide('approved'));

  const changesBtn = el('button', { type: 'button', class: 'decision-changes' });
  changesBtn.appendChild(document.createTextNode('Request changes'));
  changesBtn.addEventListener('click', () => decide('changes_requested'));

  container.appendChild(approveBtn);
  container.appendChild(changesBtn);
  root.appendChild(container);
}

async function init() {
  const root = document.getElementById(SLOT_ID);
  if (!root) return;

  const { submissionId, versionId } = await waitForSlotIds(root);

  const guestToken = guestTokenFromHash(location.hash);
  const userId = guestToken === undefined ? getStoredUserId() : undefined;
  const existing = await fetchExisting(submissionId, versionId, guestToken, userId);
  if (existing) renderFinal(root, existing);
  else renderForm(root, submissionId, versionId, guestToken);
}

void init();
