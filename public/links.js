// Guest review links page (ticket #3, ADR-0003 §B). Token hygiene is load-bearing here:
// the plaintext token is held only in a short-lived local variable long enough to build the
// shareable URL fragment and fill the copy field — never written to localStorage, never put
// in a query string, never logged, never re-requested after the 201 response that issued it.

const submissionSelect = document.getElementById('submission-select');
const actorSelect = document.getElementById('actor-select');
const labelInput = document.getElementById('label-input');
const expiresSelect = document.getElementById('expires-select');
const createButton = document.getElementById('create-button');
const errorEl = document.getElementById('error');
const newLinkBox = document.getElementById('new-link-box');
const newLinkInput = document.getElementById('new-link-input');
const copyButton = document.getElementById('copy-button');
const linkList = document.getElementById('link-list');
const emptyState = document.getElementById('empty-state');

function showError(message) {
  errorEl.textContent = message;
}

function clearError() {
  errorEl.textContent = '';
}

async function apiRequest(path, init = {}) {
  const headers = { 'content-type': 'application/json', 'x-user-id': actorSelect.value, ...init.headers };
  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body && body.error && body.error.message ? body.error.message : 'Request failed';
    throw new Error(message);
  }
  return body;
}

function statusOf(link) {
  if (link.revokedAt) return { text: 'Revoked', className: 'status-revoked' };
  if (Date.parse(link.expiresAt) <= Date.now()) return { text: 'Expired', className: 'status-expired' };
  return { text: 'Active', className: 'status-active' };
}

function buildLinkCard(link) {
  const card = document.createElement('li');
  card.className = 'link-card';

  const labelEl = document.createElement('div');
  labelEl.className = 'label';
  // textContent only: `label` is attacker-influenced (a studio member can type anything,
  // including markup like <img src=x onerror=...>) and must never be parsed as HTML.
  labelEl.textContent = link.label;
  card.appendChild(labelEl);

  const status = statusOf(link);
  const statusEl = document.createElement('span');
  statusEl.className = `status-badge ${status.className}`;
  statusEl.textContent = status.text;
  card.appendChild(statusEl);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `Created ${new Date(link.createdAt).toLocaleString()} · Expires ${new Date(link.expiresAt).toLocaleString()}`;
  card.appendChild(meta);

  if (!link.revokedAt) {
    const revokeButton = document.createElement('button');
    revokeButton.type = 'button';
    revokeButton.className = 'secondary';
    revokeButton.textContent = 'Revoke';
    revokeButton.addEventListener('click', () => revoke(link.id));
    card.appendChild(revokeButton);
  }

  return card;
}

async function refreshList() {
  clearError();
  try {
    const { links } = await apiRequest(`/api/submissions/${submissionSelect.value}/guest-links`);
    linkList.replaceChildren(...links.map(buildLinkCard));
    emptyState.hidden = links.length > 0;
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Could not load links');
  }
}

async function revoke(linkId) {
  clearError();
  try {
    await apiRequest(`/api/guest-links/${linkId}/revoke`, { method: 'POST' });
    await refreshList();
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Could not revoke link');
  }
}

async function createLink() {
  clearError();
  newLinkBox.hidden = true;
  createButton.disabled = true;
  try {
    const expiresAt = new Date(Date.now() + Number(expiresSelect.value) * 24 * 60 * 60 * 1000).toISOString();
    const label = labelInput.value.trim();
    const body = label.length > 0 ? { expiresAt, label } : { expiresAt };

    const { token, link } = await apiRequest(`/api/submissions/${submissionSelect.value}/guest-links`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    // Fragment only — never a query string. Fragments are never sent to the server, so
    // the token never reaches a server log, a Referer header or browser history on the server side.
    const shareUrl = `${location.origin}/review.html?submission=${encodeURIComponent(link.submissionId)}#t=${token}`;
    newLinkInput.value = shareUrl;
    newLinkBox.hidden = false;

    labelInput.value = '';
    await refreshList();
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Could not create link');
  } finally {
    createButton.disabled = false;
  }
}

createButton.addEventListener('click', createLink);
submissionSelect.addEventListener('change', () => {
  newLinkBox.hidden = true;
  void refreshList();
});
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(newLinkInput.value);
    copyButton.textContent = 'Copied!';
    setTimeout(() => {
      copyButton.textContent = 'Copy link';
    }, 1500);
  } catch {
    // Clipboard API can be unavailable (permissions, insecure context); fall back to
    // manual selection so the user can still copy the value themselves.
    newLinkInput.select();
  }
});

void refreshList();
