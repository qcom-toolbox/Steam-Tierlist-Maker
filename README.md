# Steam Tierlist

Electron app that imports your Steam library and lets you build a drag-and-drop tier list with each game's icon, exportable as PNG.

## Run On Mac :
```
- xattr -dr com.apple.quarantine /Applications/Steam\ Tierlist.app
```

1. A Steam API key (free): https://steamcommunity.com/dev/apikey
2. Your **SteamID64** or username (vanity URL), available at https://steamid.io/
3. Your Steam profile + game details set to **public** (Steam → Settings → Privacy), otherwise the API returns an empty list.

Icons are loaded directly from the Steam CDN (`capsule_184x69.jpg` per `appid`), no manual download required.

## Installation (dev)

```bash
npm install
npm start
```

## Usage

1. Launch the app, click **Connect Steam**, paste your API key + SteamID/username.
2. Your games appear in "Unranked" at the bottom.
3. Drag and drop icons into tiers (S/A/B/C/D/F by default).
4. Tiers are editable: rename (click the label), change color (🎨), reorder (▲▼), delete, or add a tier (+ Add tier).
5. **Refresh** re-fetches your Steam library (already ranked games keep their tier, new ones go to the pool).
6. **Export PNG** generates an image ready to share.

Everything is saved automatically locally (API key, SteamID, games, rankings) in the app's config folder — no account, no remote server.

## Stack

- Electron (main process handles HTTP calls to the Steam API, no CORS issues)
- Vanilla JS/HTML/CSS on the renderer, native HTML5 drag and drop
- html2canvas for PNG export
- electron-builder to package Windows (portable + NSIS) and Linux (AppImage)
