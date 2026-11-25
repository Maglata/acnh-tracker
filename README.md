# ACNH Critter Tracker

Local tracker for **Animal Crossing: New Horizons** fish, bugs and deep-sea creatures — the same
information as the Animal Crossing Wiki monthly guides (e.g.
[November deep-sea creature list](https://animalcrossing.fandom.com/wiki/Guide:November_deep-sea_creature_list_(New_Horizons))),
plus checkboxes for **caught** and **donated** that are saved automatically.

No dependencies — only Node.js 20+.

## Usage

```sh
npm start          # http://localhost:4747 (opens the browser on macOS; add -- --no-open to skip)
```

- Progress is auto-saved to `save/progress.json` on every click (plus a daily backup in
  `save/backups/`, the last 30 days are kept). `save/` is git-ignored; remove it from
  `.gitignore` if you want to version your progress.
- You can also just open `public/index.html` directly — then progress is stored in the browser
  (localStorage) only.
- **Export JSON / Import…** — back up or move your progress (import replaces the current progress
  after confirmation). **Export CSV** — spreadsheet with all critters and your status.

## Google Drive sync (optional)

With a Google OAuth Client ID in [public/js/config.js](public/js/config.js), a **Sign in with Google**
button appears. Progress is then also saved to the user's own Google Drive (one file in the hidden
app folder, scope `drive.appdata` — the app cannot see any other files) and synced between devices.
There is no backend: everything runs in the browser.

- Changes on different devices are merged per critter, so signing in on a new device never wipes
  the progress stored in Drive.
- Google sign-in tokens last about an hour; after that (or after closing the tab) the button shows
  **Reconnect Google** and one click resumes syncing.
- Works on `http://localhost:4747` and on GitHub Pages, not when opening `index.html` as a file.

Setup:

1. Create a project: <https://console.cloud.google.com/projectcreate>
2. Enable the Google Drive API: <https://console.cloud.google.com/apis/library/drive.googleapis.com>
3. Branding (app name, support email, audience **External**): <https://console.cloud.google.com/auth/branding>
4. Data Access → add scope `https://www.googleapis.com/auth/drive.appdata`: <https://console.cloud.google.com/auth/scopes>
5. Clients → **Web application**, Authorized JavaScript origins `http://localhost:4747` and
   `https://<github-user>.github.io`: <https://console.cloud.google.com/auth/clients>
6. Put the Client ID (`….apps.googleusercontent.com`, not the secret) into `public/js/config.js`.
7. Audience → **Publish app** so anyone can sign in: <https://console.cloud.google.com/auth/audience>
   (`drive.appdata` is a non-sensitive scope; brand verification is only needed to show a logo).
   The privacy policy page is [public/privacy.html](public/privacy.html).

## GitHub Pages

[.github/workflows/pages.yml](.github/workflows/pages.yml) runs the tests and publishes `public/` on
every push to `main`. In the GitHub repository, open **Settings → Pages** and set **Source** to
**GitHub Actions**. On GitHub Pages there is no local server, so progress is kept in the browser and,
after signing in, in Google Drive.

## Features

- Fish (80), bugs (80) and deep-sea creatures (40) with icon, price, location / swimming pattern,
  shadow size and time, for both hemispheres.
- **Monthly list** view like the wiki: *Available in*, *New in* and *Leaving after* the month.
- **Full year** view with the 12-month availability grid.
- Filter by hour (or press **Now** for the current month and hour), by status (not caught,
  not donated, …) and by text search; sortable columns; progress bars per category.

## Updating the data

```sh
npm run update-data            # re-reads the wiki and regenerates public/data/critters.js
npm run update-data -- --force # also re-downloads all icons into public/img/
```

## Tests

```sh
npm test
```
