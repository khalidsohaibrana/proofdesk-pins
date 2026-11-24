// Members page: list a workspace's members and let an owner add one.
// Demo identity (ADR-0002): this page sets the x-user-id header itself, via the
// "Acting as" selector — there is no real sign-in in this slice.
const USER_HEADER = 'x-user-id';

const actorSelect = document.getElementById('actor');
const workspaceInput = document.getElementById('workspace-id');
const statusEl = document.getElementById('status');
const membersBody = document.getElementById('members-body');
const form = document.getElementById('add-member-form');
const userIdInput = document.getElementById('new-user-id');
const roleSelect = document.getElementById('new-role');

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = kind === 'error' ? 'error' : kind === 'success' ? 'success' : '';
}

function renderMembers(members) {
  membersBody.replaceChildren();
  for (const member of members) {
    const row = document.createElement('tr');
    for (const value of [member.name, member.email, member.role]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    membersBody.append(row);
  }
}

function membersUrl() {
  return `/api/workspaces/${encodeURIComponent(workspaceInput.value.trim())}/members`;
}

async function loadMembers() {
  setStatus('Loading…');
  try {
    const res = await fetch(membersUrl(), { headers: { [USER_HEADER]: actorSelect.value } });
    const body = await res.json();
    if (!res.ok) {
      setStatus(body?.error?.message ?? 'Something went wrong', 'error');
      return;
    }
    renderMembers(body.members);
    setStatus('');
  } catch {
    setStatus('Could not reach the server', 'error');
  }
}

actorSelect.addEventListener('change', loadMembers);
workspaceInput.addEventListener('change', loadMembers);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Adding…');
  let message = 'Member added.';
  let kind = 'success';
  try {
    const res = await fetch(membersUrl(), {
      method: 'POST',
      headers: { [USER_HEADER]: actorSelect.value, 'content-type': 'application/json' },
      body: JSON.stringify({ userId: userIdInput.value.trim(), role: roleSelect.value }),
    });
    const body = await res.json();
    if (!res.ok) {
      message = body?.error?.message ?? 'Something went wrong';
      kind = 'error';
    } else {
      form.reset();
    }
  } catch {
    message = 'Could not reach the server';
    kind = 'error';
  }
  // Always re-fetch rather than trusting only this response: another actor (or, in the
  // test suite, another Playwright project sharing the same in-memory server) may have
  // changed the membership list concurrently, including a 409 conflict that itself means
  // "already there" rather than "not there".
  await loadMembers();
  setStatus(message, kind);
});

loadMembers();
