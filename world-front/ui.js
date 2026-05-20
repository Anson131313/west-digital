// ui.js - World Front UI: menus, HUD, build panel, overlays

'use strict';

const WFUI = (function() {

  // ============================================================
  // MAP SELECT SCREEN
  // ============================================================
  function renderMapSelect(state, container, onMapSelect, onDifficulty, onSpeed, onStart) {
    container.innerHTML = `
      <div class="screen-panel">
        <h1>🌍 World Front</h1>
        <p class="subtitle">Territory · Economy · Conquest</p>

        <div id="mapSelectGrid">
          ${MAP_ORDER.map(m => `
            <div class="map-btn ${m === state.mapName ? 'selected' : ''}" id="mapbtn-${m}" onclick="WFUI.selectMap('${m}')">
              <canvas id="minimap-${m}" width="140" height="88"></canvas>
              <span>${CONTINENT_LABELS[m]}</span>
            </div>
          `).join('')}
        </div>

        <div class="options-row">
          <div>
            <label>Difficulty</label>
            <div class="btn-group">
              ${['easy','medium','hard'].map(d =>
                `<button class="opt-btn ${d === state.difficulty ? 'active' : ''}" onclick="WFUI.setDifficulty('${d}')">${d.charAt(0).toUpperCase()+d.slice(1)}</button>`
              ).join('')}
            </div>
          </div>
          <div>
            <label>Economy</label>
            <div class="btn-group">
              ${['slow','fast'].map(s =>
                `<button class="opt-btn ${s === state.economySpeed ? 'active' : ''}" onclick="WFUI.setSpeed('${s}')">${s.charAt(0).toUpperCase()+s.slice(1)}</button>`
              ).join('')}
            </div>
          </div>
        </div>

        <button class="play-btn" onclick="WFUI.doStartGame()">▶ CHOOSE YOUR TERRITORY</button>
      </div>`;

    // Store callbacks
    WFUI._cb = { onMapSelect, onDifficulty, onSpeed, onStart };
  }

  function selectMap(mapName) {
    document.querySelectorAll('.map-btn').forEach(el => el.classList.remove('selected'));
    const el = document.getElementById('mapbtn-' + mapName);
    if (el) el.classList.add('selected');
    if (WFUI._cb) WFUI._cb.onMapSelect(mapName);
  }

  function setDifficulty(diff) {
    document.querySelectorAll('.opt-btn').forEach(el => {
      if (['easy','medium','hard'].some(d => el.textContent.toLowerCase() === d))
        el.classList.remove('active');
    });
    document.querySelectorAll('.opt-btn').forEach(el => {
      if (el.textContent.toLowerCase() === diff) el.classList.add('active');
    });
    if (WFUI._cb) WFUI._cb.onDifficulty(diff);
  }

  function setSpeed(speed) {
    document.querySelectorAll('.opt-btn').forEach(el => {
      if (['slow','fast'].some(s => el.textContent.toLowerCase() === s))
        el.classList.remove('active');
    });
    document.querySelectorAll('.opt-btn').forEach(el => {
      if (el.textContent.toLowerCase() === speed) el.classList.add('active');
    });
    if (WFUI._cb) WFUI._cb.onSpeed(speed);
  }

  function doStartGame() {
    if (WFUI._cb) WFUI._cb.onStart();
  }

  // ============================================================
  // PLAYER SETUP SCREEN
  // ============================================================
  function renderPlayerSetup(state, container, onChange) {
    container.innerHTML = `
      <div class="screen-panel" id="playerSetupPanel" style="max-width:520px;text-align:center">
        <h1 style="font-size:1.6rem">Choose Your Territory</h1>
        <p class="subtitle">Enter your name, pick a color, then click anywhere on land</p>

        <input type="text" id="playerNameInput" placeholder="Your empire's name…"
               maxlength="24" value="${state.playerName}" autocomplete="off">
        <div id="nameError"></div>

        <div id="colorPicker">
          ${PLAYER_COLORS.map(c =>
            `<div class="color-swatch ${c === state.playerColor ? 'selected' : ''}"
                  style="background:${c}"
                  onclick="WFUI.pickColor('${c}')"></div>`
          ).join('')}
        </div>
        <p id="setupInstruct">⬇️ Close this panel and click on the map to place your starting point</p>
        <button class="play-btn" onclick="WFUI.confirmSetup()">Confirm Name & Color →</button>
      </div>`;

    WFUI._setupCb = onChange;
    WFUI._setupState = state;
  }

  function pickColor(color) {
    document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.color-swatch').forEach(el => {
      if (el.style.background === color || el.style.backgroundColor === color)
        el.classList.add('selected');
    });
    if (WFUI._setupState) WFUI._setupState.playerColor = color;
    if (WFUI._setupCb) WFUI._setupCb(null, color);
  }

  function confirmSetup() {
    const nameEl = document.getElementById('playerNameInput');
    const errEl  = document.getElementById('nameError');
    const name   = nameEl ? nameEl.value.trim() : '';
    if (!name) {
      if (errEl) errEl.textContent = 'Please enter a name!';
      return;
    }
    if (WFUI._setupState) WFUI._setupState.playerName = name;
    if (WFUI._setupCb) WFUI._setupCb(name, WFUI._setupState.playerColor);
    // Make overlay pass-through so map clicks reach the canvas
    const overlayEl = document.getElementById('overlay');
    if (overlayEl) {
      overlayEl.style.pointerEvents = 'none';
      overlayEl.innerHTML = `<div style="position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,10,30,0.92);border:1px solid rgba(68,170,255,0.5);padding:8px 28px;border-radius:20px;color:#4af;font-size:0.9rem;font-weight:600;white-space:nowrap">
        🎯 Click anywhere on land to place your start!
      </div>`;
    }
  }

  // ============================================================
  // WAR HUD
  // ============================================================
  function showWarHUD(state) {
    document.getElementById('hud').style.display = 'flex';
    document.getElementById('leaderboard').style.display = 'block';
    renderHUDOverlay(state, null);
  }

  function renderHUDOverlay(state, uiCtx) {
    const player = state.entities.find(e => e.isPlayer);
    if (!player) return;

    const pct = state.totalLandPixels > 0
      ? (player.territoryCount / state.totalLandPixels * 100).toFixed(1)
      : '0.0';

    // Update HUD
    const hudEl = document.getElementById('hud');
    if (!hudEl) return;

    const alliesStr = [...player.alliances]
      .map(id => {
        const ally = state.entities.find(e => e.id === id);
        return ally && !ally.isDefeated
          ? `<span class="ally-tag" style="background:${ally.color}22;border-color:${ally.color}66">${ally.name}</span>`
          : '';
      }).join('');

    hudEl.innerHTML = `
      <div class="hud-box">
        <div class="hud-name" style="color:${player.color}">${player.name}</div>
        <div class="hud-stat"><span>💰</span><span class="hud-val">$${player.money}</span></div>
        <div class="hud-stat"><span>⚔️</span><span class="hud-val">${player.troops} troops</span></div>
        <div class="hud-stat"><span>🗺️</span><span class="hud-val">${pct}%</span></div>
        <div class="hud-stat"><span>📈</span><span class="hud-val">$${player.income}/tick</span></div>
      </div>
      <div class="hud-box" style="flex:1">
        <div style="font-size:0.72rem;color:#6a8aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Alliances</div>
        <div id="allianceList">${alliesStr || '<span style="color:#444;font-size:0.72rem">None</span>'}</div>
      </div>
    `;

    // Update leaderboard
    const sorted = [...state.entities]
      .filter(e => !e.isDefeated)
      .sort((a, b) => b.territoryCount - a.territoryCount)
      .slice(0, 10);

    const lb = document.getElementById('leaderboard');
    if (lb) {
      lb.innerHTML = `<h3>🏆 Standings</h3>` +
        sorted.map((e, i) => {
          const p = state.totalLandPixels > 0
            ? (e.territoryCount / state.totalLandPixels * 100).toFixed(1) : '0';
          return `<div class="lb-row">
            <span style="color:#888;font-size:0.65rem">${i+1}.</span>
            <div class="lb-dot" style="background:${e.color}"></div>
            <span class="lb-name ${e.isPlayer ? 'font-weight:700' : ''}">${e.name}</span>
            <span class="lb-pct">${p}%</span>
          </div>`;
        }).join('');
    }
  }

  // ============================================================
  // DIPLOMACY BUTTONS (shown near troop slider)
  // ============================================================
  function showDiploButtons(player, target, state, cb) {
    const slider = document.getElementById('troopSlider');
    let diploDiv = document.getElementById('diploButtons');
    if (!diploDiv) {
      diploDiv = document.createElement('div');
      diploDiv.id = 'diploButtons';
      diploDiv.style.marginTop = '8px';
      slider.appendChild(diploDiv);
    }

    const isAlly = player.alliances.has(target.id);
    const wasBetrayed = target.betrayedBy && target.betrayedBy.has(player.id);
    const refusedUs = target.refusedAlliance && target.refusedAlliance.has(player.id);

    diploDiv.innerHTML = '';
    if (!isAlly && !wasBetrayed && !refusedUs) {
      const allyBtn = document.createElement('button');
      allyBtn.className = 'diplo-btn';
      allyBtn.textContent = '🤝 Offer Alliance';
      allyBtn.onclick = () => { cb('ally'); };
      diploDiv.appendChild(allyBtn);
    }
  }

  // ============================================================
  // GAME OVER
  // ============================================================
  function showGameOver(state, won, winner, container, onRestart) {
    const player = state.entities.find(e => e.isPlayer);
    const pct = player && state.totalLandPixels > 0
      ? (player.territoryCount / state.totalLandPixels * 100).toFixed(1)
      : '0';

    const alive = state.entities.filter(e => !e.isDefeated).length;

    container.innerHTML = `
      <div class="screen-panel" id="gameOverPanel">
        <h1>${won ? '🏆 VICTORY!' : '💀 DEFEATED'}</h1>
        <p class="subtitle">${won ? 'You have conquered the world!' : 'Your empire has fallen.'}</p>
        <div class="final-stats">
          <p>Final Territory: <span>${pct}%</span></p>
          <p>Survivors: <span>${alive}</span> empires</p>
          ${player ? `<p>Money: <span>$${player.money}</span> &nbsp; Troops: <span>${player.troops}</span></p>` : ''}
        </div>
        <div style="margin:20px 0">
          ${[...state.entities].sort((a,b)=>b.territoryCount-a.territoryCount).slice(0,8).map(e => {
            const p = state.totalLandPixels > 0
              ? (e.territoryCount / state.totalLandPixels * 100).toFixed(1) : '0';
            return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size:0.82rem">
              <div style="width:10px;height:10px;border-radius:50%;background:${e.color}"></div>
              <span style="flex:1">${e.name}</span>
              <span style="color:#4af">${p}%</span>
              ${e.isDefeated ? '<span style="color:#f66;font-size:0.7rem">❌</span>' : '<span style="color:#4f4;font-size:0.7rem">✓</span>'}
            </div>`;
          }).join('')}
        </div>
        <button class="play-btn" onclick="WFUI._restartCb()">↩ Play Again</button>
      </div>`;

    WFUI._restartCb = onRestart;
  }

  // ============================================================
  // PUBLIC
  // ============================================================
  return {
    renderMapSelect,
    renderPlayerSetup,
    showWarHUD,
    renderHUDOverlay,
    showDiploButtons,
    showGameOver,
    // Event handlers bound to global scope
    selectMap,
    setDifficulty,
    setSpeed,
    doStartGame,
    pickColor,
    confirmSetup,
    _cb: null,
    _setupCb: null,
    _setupState: null,
    _restartCb: null,
  };
})();

window.WFUI = WFUI;
