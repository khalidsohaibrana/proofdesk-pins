// Review page: click-to-drop-a-pin comments (ADR-0003 §D). Shares no module state with
// decide.js — decide.js re-reads what it needs from the #decision-slot data- attributes.
//
// Security note (carried forward from the #1 security review): `author.label` on a comment
// is attacker-influenced display text for guests (it is the label a member typed when issuing
// the link). Every place this page renders user-supplied text — a comment body, an author
// label — uses `textContent`, never `innerHTML` and never string interpolation into markup.

const params = new URLSearchParams(location.search);
const submissionId = params.get('submission');
let versionId = params.get('version');

// The guest token lives only in the URL fragment (ADR-0003 §B): never sent as a query
// parameter, never written to localStorage or the document, held in a module variable only
// and sent as the `x-guest-token` header.
const guestToken = (() => {
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  return fragment.has('t') ? (fragment.get('t') ?? '') : undefined;
})();

const titleEl = document.getElementById('submission-title');
const versionLabelEl = document.getElementById('version-label');
const errorEl = document.getElementById('error-message');
const identityBar = document.getElementById('identity-bar');
const asInput = document.getElementById('as-input');
const asApply = document.getElementById('as-apply');
const guestBadge = document.getElementById('guest-badge');
const wrapper = document.getElementById('drawing-wrapper');
const img = document.getElementById('drawing-image');
const pinHint = document.getElementById('pin-hint');
const form = document.getElementById('comment-form');
const bodyInput = document.getElementById('comment-body');
const listEl = document.getElementById('comment-list');
const decisionSlot = document.getElementById('decision-slot');

let currentUserId = params.get('as') ?? '';
if (asInput) asInput.value = currentUserId;

if (guestToken !== undefined) {
  if (identityBar) identityBar.hidden = true;
  if (guestBadge) guestBadge.hidden = false;
}

/** Headers for an authorized request: guest token takes priority with no fallback — the
 * same presence rule the server enforces (ADR-0003 §B). */
function authHeaders() {
  const headers = {};
  if (guestToken !== undefined) {
    headers['x-guest-token'] = guestToken;
  } else if (currentUserId) {
    headers['x-user-id'] = currentUserId;
  }
  return headers;
}

function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  if (!errorEl) return;
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

let pendingPin = null;
let pendingMarkerEl = null;

function clearPendingMarker() {
  if (pendingMarkerEl) {
    pendingMarkerEl.remove();
    pendingMarkerEl = null;
  }
}

function placeMarker(el, x, y) {
  el.style.left = `${x * 100}%`;
  el.style.top = `${y * 100}%`;
}

function showPendingMarker(pin) {
  clearPendingMarker();
  const marker = document.createElement('span');
  marker.className = 'pin-marker pending';
  placeMarker(marker, pin.x, pin.y);
  wrapper.appendChild(marker);
  pendingMarkerEl = marker;
}

function clearSavedMarkers() {
  wrapper.querySelectorAll('.pin-marker:not(.pending)').forEach((el) => el.remove());
}

function renderComments(comments) {
  clearSavedMarkers();
  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

  for (const comment of comments) {
    const marker = document.createElement('span');
    marker.className = 'pin-marker';
    marker.dataset.commentId = comment.id;
    placeMarker(marker, comment.pin.x, comment.pin.y);
    wrapper.appendChild(marker);

    const li = document.createElement('li');
    li.dataset.commentId = comment.id;
    const authorEl = document.createElement('strong');
    // textContent only: author.label is attacker-influenced for guests and must never be
    // parsed as markup.
    authorEl.textContent = comment.author.label;
    const bodyEl = document.createElement('p');
    bodyEl.textContent = comment.body;
    li.appendChild(authorEl);
    li.appendChild(bodyEl);
    listEl.appendChild(li);
  }
}

async function fetchComments() {
  const res = await fetch(`/api/versions/${encodeURIComponent(versionId)}/comments`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    showError('Could not load comments.');
    return;
  }
  clearError();
  const comments = await res.json();
  renderComments(comments);
}

async function loadContext() {
  if (!submissionId) {
    showError('Missing ?submission= in the URL.');
    return;
  }

  const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    showError('Could not load this submission.');
    return;
  }
  clearError();
  const data = await res.json();
  const versions = Array.isArray(data.versions) ? data.versions : [];
  const version = versionId
    ? versions.find((candidate) => candidate.id === versionId)
    : versions[versions.length - 1]; // versionsOf is ascending by number; last is latest.

  if (!version) {
    showError('Could not find that version.');
    return;
  }
  versionId = version.id;

  if (titleEl) titleEl.textContent = data.submission?.title ?? 'Review';
  if (versionLabelEl) versionLabelEl.textContent = version.title ?? '';
  img.src = version.imageUrl;
  img.alt = version.title ? `Drawing: ${version.title}` : 'Design drawing';

  if (decisionSlot) {
    decisionSlot.dataset.submissionId = submissionId;
    decisionSlot.dataset.versionId = versionId;
  }

  await fetchComments();
}

wrapper.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('.pin-marker')) return;
  if (!img.src) return;

  const rect = img.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const x = clamp01((event.clientX - rect.left) / rect.width);
  const y = clamp01((event.clientY - rect.top) / rect.height);
  pendingPin = { x, y };
  showPendingMarker(pendingPin);

  if (form) form.hidden = false;
  if (pinHint) pinHint.hidden = true;
  if (bodyInput) bodyInput.focus();
});

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!pendingPin) return;
    const body = bodyInput.value.trim();
    if (!body) return;

    const res = await fetch(`/api/versions/${encodeURIComponent(versionId)}/comments`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ body, pin: pendingPin }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => undefined);
      showError(payload?.error?.message ?? 'Could not post that comment.');
      return;
    }
    clearError();
    bodyInput.value = '';
    pendingPin = null;
    clearPendingMarker();
    form.hidden = true;
    if (pinHint) pinHint.hidden = false;
    await fetchComments();
  });
}

if (asApply) {
  asApply.addEventListener('click', () => {
    currentUserId = asInput.value.trim();
    clearError();
    fetchComments();
  });
}

await loadContext();
