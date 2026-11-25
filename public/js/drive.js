// Google Drive storage for the tracker state, kept in the hidden appDataFolder
// (scope drive.appdata), so the app can only see its own file.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ACNHDrive = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILE_NAME = 'acnh-progress.json';
  const FILES = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

  class DriveError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  /**
   * @param {{ fetch: typeof fetch, getToken: () => string | null }} deps
   */
  function createDriveStore({ fetch, getToken }) {
    let fileId = null;

    async function request(url, init = {}) {
      const token = getToken();
      if (!token) throw new DriveError(401, 'Not signed in to Google');
      const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new DriveError(res.status, `Google Drive: ${res.status} ${await res.text().catch(() => '')}`.trim());
      return res;
    }

    async function findFile() {
      if (fileId) return fileId;
      const q = new URLSearchParams({
        spaces: 'appDataFolder',
        q: `name = '${FILE_NAME}' and trashed = false`,
        fields: 'files(id, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: '1',
      });
      const { files } = await (await request(`${FILES}?${q}`)).json();
      fileId = files?.[0]?.id ?? null;
      return fileId;
    }

    /** Returns the stored state object, or null when nothing was saved yet. */
    async function load() {
      const id = await findFile();
      if (!id) return null;
      return (await request(`${FILES}/${id}?alt=media`)).json();
    }

    async function save(state) {
      const body = JSON.stringify(state);
      const id = await findFile();
      if (id) {
        await request(`${UPLOAD}/${id}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        return;
      }
      const boundary = `acnh-${Math.random().toString(36).slice(2)}`;
      const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
      const res = await request(`${UPLOAD}?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart,
      });
      fileId = (await res.json()).id;
    }

    return { load, save, reset: () => (fileId = null) };
  }

  return { SCOPE, FILE_NAME, DriveError, createDriveStore };
});
