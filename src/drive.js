const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

let tokenClient;

function waitForGoogleIdentity(timeout = 10000) {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        window.clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt >= timeout) {
        window.clearInterval(timer);
        reject(new Error('Google Drive sign-in could not load. Check your connection and try again.'));
      }
    }, 100);
  });
}

async function getAccessToken() {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google Drive uploads are not configured yet.');
  await waitForGoogleIdentity();

  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {},
        error_callback: () => {}
      });
    }

    tokenClient.callback = (response) => {
      if (response.error) reject(new Error(response.error_description || 'Google Drive access was not granted.'));
      else resolve(response.access_token);
    };
    tokenClient.error_callback = (error) => {
      const message = error?.type === 'popup_closed'
        ? 'Google Drive sign-in was closed before it finished.'
        : 'Google Drive sign-in could not open. Allow pop-ups and try again.';
      reject(new Error(message));
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function driveRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = result.error?.message || 'Google Drive could not complete the upload.';
    throw new Error(reason);
  }
  return result;
}

async function getOrCreateClassFolder(token, classroom) {
  const query = [
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    `appProperties has { key='jajiClassId' and value='${classroom.id}' }`
  ].join(' and ');
  const params = new URLSearchParams({ q: query, fields: 'files(id,name)', pageSize: '1' });
  const found = await driveRequest(`${DRIVE_API}/files?${params}`, token);
  if (found.files?.[0]) return found.files[0].id;

  const folder = await driveRequest(`${DRIVE_API}/files?fields=id`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Jaji — ${classroom.name}`,
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { jajiClassId: classroom.id }
    })
  });
  return folder.id;
}

async function uploadFile(token, folderId, file) {
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify({
    name: file.name,
    parents: [folderId],
    appProperties: { uploadedBy: 'jaji' }
  })], { type: 'application/json' }));
  body.append('file', file);

  const uploaded = await driveRequest(
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,size`,
    token,
    { method: 'POST', body }
  );
  await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(uploaded.id)}/permissions`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'anyone', role: 'reader' })
  });

  return {
    name: uploaded.name || file.name,
    type: uploaded.mimeType || file.type || 'application/octet-stream',
    size: Number(uploaded.size || file.size),
    driveFileId: uploaded.id,
    url: `https://drive.google.com/file/d/${uploaded.id}/view`
  };
}

export async function uploadAssignmentFiles(classroom, files) {
  if (!files.length) return [];
  const token = await getAccessToken();
  const folderId = await getOrCreateClassFolder(token, classroom);
  const attachments = [];
  for (const file of files) attachments.push(await uploadFile(token, folderId, file));
  return attachments;
}

export async function uploadProfilePhoto(file) {
  const token = await getAccessToken();
  const folderId = await getOrCreateClassFolder(token, { id: 'profiles', name: 'Profile photos' });
  const uploaded = await uploadFile(token, folderId, file);
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(uploaded.driveFileId)}&sz=w400`;
}
