// Version history + "add a new version" form (capability 5). Phone-first.
// Reads the submission id from the query string, never anything else, matching the
// server-side rule that identifiers come from the path (here, the query string plays
// the client-side role of "path"; the server route itself reads only its own :id).

const ACTOR_STORAGE_KEY = 'proofdesk-demo-actor';

const params = new URLSearchParams(window.location.search);
const submissionId = params.get('submission') ?? '';

const titleEl = document.getElementById('submission-title');
const statusEl = document.getElementById('status');
const listEl = document.getElementById('version-list');
const actorSelect = document.getElementById('actor-select');
const form = document.getElementById('add-version');

function setStatus(message, tone) {
  statusEl.textContent = message ?? '';
  if (tone) {
    statusEl.dataset.tone = tone;
  } else {
    delete statusEl.dataset.tone;
  }
}

function currentActor() {
  return actorSelect.value;
}

function restoreActor() {
  const saved = window.localStorage.getItem(ACTOR_STORAGE_KEY);
  if (saved) actorSelect.value = saved;
}

actorSelect.addEventListener('change', () => {
  window.localStorage.setItem(ACTOR_STORAGE_KEY, currentActor());
  void loadSubmission();
});

function renderVersions(versions) {
  listEl.innerHTML = '';
  for (const version of versions) {
    const item = document.createElement('li');
    item.className = 'version-card';
    item.dataset.versionId = version.id;

    const number = document.createElement('p');
    number.className = 'version-number';
    number.textContent = `Version ${version.number}`;
    item.appendChild(number);

    const meta = document.createElement('p');
    meta.className = 'version-meta';
    meta.textContent = `${version.title} · added ${new Date(version.createdAt).toLocaleString()}`;
    item.appendChild(meta);

    const link = document.createElement('a');
    link.className = 'review-link';
    link.href = `/review.html?submission=${encodeURIComponent(submissionId)}&version=${encodeURIComponent(version.id)}`;
    link.textContent = 'Open in review';
    item.appendChild(link);

    listEl.appendChild(item);
  }
}

async function loadSubmission() {
  if (!submissionId) {
    setStatus('No submission specified.', 'error');
    return;
  }
  setStatus('');
  try {
    const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}`, {
      headers: { 'x-user-id': currentActor() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => undefined);
      setStatus(body?.error?.message ?? `Could not load this submission (${res.status}).`, 'error');
      titleEl.textContent = '';
      listEl.innerHTML = '';
      return;
    }
    const data = await res.json();
    titleEl.textContent = data.submission.title;
    renderVersions(data.versions);
  } catch {
    setStatus('Could not reach the server.', 'error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = document.getElementById('title').value;
  const imageUrl = document.getElementById('imageUrl').value;

  try {
    const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': currentActor() },
      body: JSON.stringify({ title, imageUrl }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => undefined);
      setStatus(body?.error?.message ?? `Could not add this version (${res.status}).`, 'error');
      return;
    }
    form.reset();
    setStatus('Version added.');
    await loadSubmission();
  } catch {
    setStatus('Could not reach the server.', 'error');
  }
});

restoreActor();
void loadSubmission();
