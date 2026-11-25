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
