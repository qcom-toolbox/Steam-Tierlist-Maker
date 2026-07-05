const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf-8'));
  } catch (e) {
    return null;
  }
}

function saveConfig(data) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(data, null, 2), 'utf-8');
  return true;
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} on ${url}`));
        return;
      }
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error('Invalid Steam response (malformed JSON)'));
        }
      });
    }).on('error', reject);
  });
}

async function resolveVanityUrl(apiKey, vanity) {
  const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${encodeURIComponent(apiKey)}&vanityurl=${encodeURIComponent(vanity)}`;
  const data = await httpsGetJson(url);
  if (data && data.response && data.response.success === 1) {
    return data.response.steamid;
  }
  throw new Error('Unable to resolve Steam ID (vanity URL). Check your username or enter your SteamID64 directly.');
}

async function fetchOwnedGames(apiKey, steamId) {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&format=json&include_appinfo=true&include_played_free_games=true`;
  const data = await httpsGetJson(url);
  if (!data || !data.response || !data.response.games) {
    throw new Error('No games returned. Make sure your Steam profile and game details are public, and that your API key and SteamID are correct.');
  }
  return data.response.games.map((g) => ({
    appid: g.appid,
    name: g.name,
    playtime_forever: g.playtime_forever || 0,
    icon: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/capsule_184x69.jpg`
  }));
}

ipcMain.handle('shell:open-external', (_evt, url) => shell.openExternal(url));

ipcMain.handle('config:load', () => loadConfig());
ipcMain.handle('config:save', (_evt, data) => saveConfig(data));

ipcMain.handle('steam:fetch-library', async (_evt, { apiKey, steamIdOrVanity }) => {
  let steamId = steamIdOrVanity.trim();
  if (!/^\d{17}$/.test(steamId)) {
    steamId = await resolveVanityUrl(apiKey, steamId);
  }
  const games = await fetchOwnedGames(apiKey, steamId);
  return { steamId, games };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#12151a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
