const DEFAULT_TIERS = [
  { id: 's', label: 'S', color: '#ff5c5c' },
  { id: 'a', label: 'A', color: '#ff9f4a' },
  { id: 'b', label: 'B', color: '#ffd54a' },
  { id: 'c', label: 'C', color: '#8de56c' },
  { id: 'd', label: 'D', color: '#66c0f4' },
  { id: 'f', label: 'F', color: '#b98cf2' }
];

let state = {
  apiKey: '',
  steamId: '',
  games: [],        // { appid, name, playtime_forever, icon }
  tiers: [],         // { id, label, color }
  assignments: {},   // appid -> tierId ('pool' if unranked)
};

const el = (id) => document.getElementById(id);

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function showToast(msg, ms = 2600) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function setLoading(on, text) {
  el('loading').classList.toggle('hidden', !on);
  if (text) el('loading-text').textContent = text;
}

/* ---------- Persistence ---------- */

async function persist() {
  await window.api.saveConfig({
    apiKey: state.apiKey,
    steamId: state.steamId,
    games: state.games,
    tiers: state.tiers,
    assignments: state.assignments
  });
}

async function init() {
  const cfg = await window.api.loadConfig();
  if (cfg) {
    state.apiKey = cfg.apiKey || '';
    state.steamId = cfg.steamId || '';
    state.games = cfg.games || [];
    state.tiers = (cfg.tiers && cfg.tiers.length) ? cfg.tiers : DEFAULT_TIERS.map(t => ({ ...t }));
    state.assignments = cfg.assignments || {};
  } else {
    state.tiers = DEFAULT_TIERS.map(t => ({ ...t }));
  }

  if (!state.games.length) {
    el('empty-state').classList.remove('hidden');
  } else {
    el('empty-state').classList.add('hidden');
  }
  render();
}

/* ---------- Steam import ---------- */

async function importLibrary(apiKey, steamIdOrVanity) {
  setLoading(true, 'Importing library…');
  try {
    const { steamId, games } = await window.api.fetchLibrary(apiKey, steamIdOrVanity);
    state.apiKey = apiKey;
    state.steamId = steamId;

    // Merge: keep existing assignments for games still owned, add new ones to pool.
    const newAssignments = {};
    for (const g of games) {
      newAssignments[g.appid] = state.assignments[g.appid] || 'pool';
    }
    state.games = games;
    state.assignments = newAssignments;
    if (!state.tiers.length) state.tiers = DEFAULT_TIERS.map(t => ({ ...t }));

    await persist();
    el('empty-state').classList.add('hidden');
    render();
    showToast(`${games.length} games imported.`);
  } catch (err) {
    throw err;
  } finally {
    setLoading(false);
  }
}

/* ---------- Rendering ---------- */

function gameCardHTML(game) {
  return `
    <div class="game-card icon-loading" draggable="true" data-appid="${game.appid}"
         data-icon="${escapeHtml(game.icon)}" title="${escapeHtml(game.name)}">
      <div class="fallback-name">${escapeHtml(game.name)}</div>
    </div>
  `;
}

const iconCache = new Map(); // url -> 'ok' | 'error'

function loadCardIcons(container) {
  container.querySelectorAll('.game-card[data-icon]').forEach(card => {
    const url = card.dataset.icon;
    if (!url) return;

    const cached = iconCache.get(url);
    if (cached === 'ok') {
      card.style.backgroundImage = `url('${url}')`;
      card.classList.remove('icon-loading', 'icon-error');
      return;
    }
    if (cached === 'error') {
      card.classList.remove('icon-loading');
      card.classList.add('icon-error');
      return;
    }

    const img = new Image();
    img.onload = () => {
      iconCache.set(url, 'ok');
      card.style.backgroundImage = `url('${url}')`;
      card.classList.remove('icon-loading', 'icon-error');
    };
    img.onerror = () => {
      iconCache.set(url, 'error');
      card.classList.remove('icon-loading');
      card.classList.add('icon-error');
    };
    img.src = url;
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function render() {
  const query = (el('search').value || '').toLowerCase().trim();
  const gameByAppid = Object.fromEntries(state.games.map(g => [String(g.appid), g]));

  // Tierlist rows
  const tierlistEl = el('tierlist');
  tierlistEl.innerHTML = '';
  state.tiers.forEach((tier, idx) => {
    const row = document.createElement('div');
    row.className = 'tier-row';
    row.innerHTML = `
      <div class="tier-label" contenteditable="true" spellcheck="false" style="background:${tier.color}" data-tier="${tier.id}">${escapeHtml(tier.label)}</div>
      <div class="tier-drop" data-tier="${tier.id}"></div>
      <div class="tier-side">
        <button data-action="up" title="Move up">▲</button>
        <button data-action="down" title="Move down">▼</button>
        <button data-action="color" title="Color">🎨</button>
        <button data-action="delete" title="Delete tier">✕</button>
      </div>
    `;
    tierlistEl.appendChild(row);

    const drop = row.querySelector('.tier-drop');
    const appids = Object.keys(state.assignments).filter(id => state.assignments[id] === tier.id);
    appids.forEach(appid => {
      const g = gameByAppid[appid];
      if (!g) return;
      if (query && !g.name.toLowerCase().includes(query)) return;
      drop.insertAdjacentHTML('beforeend', gameCardHTML(g));
    });

    // side buttons
    row.querySelector('[data-action="up"]').onclick = () => moveTier(idx, -1);
    row.querySelector('[data-action="down"]').onclick = () => moveTier(idx, 1);
    row.querySelector('[data-action="delete"]').onclick = () => deleteTier(tier.id);
    row.querySelector('[data-action="color"]').onclick = (e) => pickColor(tier.id, e.target);

    const label = row.querySelector('.tier-label');
    label.addEventListener('blur', () => {
      tier.label = label.textContent.trim() || tier.label;
      persist();
    });
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); label.blur(); }
    });
  });

  // Pool
  const pool = el('pool');
  pool.innerHTML = '';
  const poolAppids = Object.keys(state.assignments).filter(id => state.assignments[id] === 'pool');
  let visibleCount = 0;
  poolAppids
    .map(id => gameByAppid[id])
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(g => {
      if (query && !g.name.toLowerCase().includes(query)) return;
      visibleCount++;
      pool.insertAdjacentHTML('beforeend', gameCardHTML(g));
    });
  el('pool-count').textContent = `(${visibleCount})`;

  attachDnD();
  loadCardIcons(tierlistEl);
  loadCardIcons(pool);
}

function moveTier(index, dir) {
  const j = index + dir;
  if (j < 0 || j >= state.tiers.length) return;
  const [t] = state.tiers.splice(index, 1);
  state.tiers.splice(j, 0, t);
  persist();
  render();
}

function deleteTier(tierId) {
  if (state.tiers.length <= 1) {
    showToast('You must keep at least one tier.');
    return;
  }
  state.tiers = state.tiers.filter(t => t.id !== tierId);
  Object.keys(state.assignments).forEach(appid => {
    if (state.assignments[appid] === tierId) state.assignments[appid] = 'pool';
  });
  persist();
  render();
}

function pickColor(tierId, anchor) {
  const input = document.createElement('input');
  input.type = 'color';
  const tier = state.tiers.find(t => t.id === tierId);
  input.value = rgbToHex(tier.color) || '#66c0f4';
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.click();
  input.addEventListener('input', () => {
    tier.color = input.value;
    persist();
    render();
  });
  input.addEventListener('change', () => document.body.removeChild(input));
}

function rgbToHex(color) {
  if (color.startsWith('#')) return color;
  return '#66c0f4';
}

function addTier() {
  state.tiers.push({ id: uid(), label: 'New', color: '#8b93a1' });
  persist();
  render();
}

/* ---------- Drag & drop ---------- */

let draggedAppid = null;

function attachDnD() {
  document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedAppid = card.dataset.appid;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedAppid = null;
    });
  });

  document.querySelectorAll('.tier-drop, .pool').forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (!draggedAppid) return;
      const tierId = zone.dataset.tier || 'pool';
      state.assignments[draggedAppid] = tierId;
      persist();
      render();
    });
  });
}

/* ---------- Export ---------- */

async function exportPNG() {
  const target = document.querySelector('.tierlist');
  showToast('Generating image…');
  const canvas = await html2canvas(target, {
    backgroundColor: '#12151a',
    scale: 2,
    useCORS: true
  });
  const link = document.createElement('a');
  link.download = `steam-tierlist-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/* ---------- Settings modal ---------- */

function openSettings() {
  el('input-apikey').value = state.apiKey;
  el('input-steamid').value = state.steamId;
  el('settings-error').classList.add('hidden');
  el('modal-settings').classList.remove('hidden');
}

function closeSettings() {
  el('modal-settings').classList.add('hidden');
}

/* ---------- Wiring ---------- */

el('btn-settings').onclick = openSettings;
el('btn-connect').onclick = openSettings;
el('btn-cancel-settings').onclick = closeSettings;
el('btn-add-tier').onclick = addTier;
el('btn-export').onclick = () => exportPNG().catch(err => showToast('Export failed: ' + err.message));
el('search').addEventListener('input', render);

el('link-apikey').onclick = (e) => {
  e.preventDefault();
  window.api.openExternal('https://steamcommunity.com/dev/apikey');
};
el('link-steamid').onclick = (e) => {
  e.preventDefault();
  window.api.openExternal('https://steamid.io/');
};

el('btn-save-settings').onclick = async () => {
  const apiKey = el('input-apikey').value.trim();
  const steamIdOrVanity = el('input-steamid').value.trim();
  if (!apiKey || !steamIdOrVanity) {
    el('settings-error').textContent = 'Enter your API key and SteamID/username.';
    el('settings-error').classList.remove('hidden');
    return;
  }
  closeSettings();
  try {
    await importLibrary(apiKey, steamIdOrVanity);
  } catch (err) {
    showToast('Error: ' + err.message, 5000);
  }
};

el('btn-refresh').onclick = async () => {
  if (!state.apiKey || !state.steamId) {
    openSettings();
    return;
  }
  try {
    await importLibrary(state.apiKey, state.steamId);
  } catch (err) {
    showToast('Error: ' + err.message, 5000);
  }
};

init();
