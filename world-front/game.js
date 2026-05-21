// game.js - World Front main game engine

'use strict';

const WFGame = (function() {

  const W = 960, H = 580;

  // ============================================================
  // STATE
  // ============================================================
  let state = {
    screen: 'loading',        // loading | mapSelect | playerSetup | expansion | war | gameOver
    mapName: 'world',
    difficulty: 'medium',
    economySpeed: 'normal',
    playerName: '',
    playerColor: '#00FF88',
    playerLat: 0,
    playerLon: 0,
    entities: [],
    territory: null,          // Uint16Array: pixelIdx -> entityId (0=unclaimed, 65535=water)
    landMask: null,           // Uint8Array:  pixelIdx -> 1 if land
    imageData: null,
    worldData: null,
    frontiers: new Map(),     // entityId -> Uint32Array frontier (flat)
    frontierLen: new Map(),   // entityId -> used length in frontier array
    totalLandPixels: 0,
    claimedPixels: 0,
    adjacency: new Map(),     // entityId -> Set<entityId>
    combatQueue: [],
    activeCombat: null,
    economyInterval: null,
    phase1Done: false,
    selectedEntityId: null,
    attackMode: false,
    pendingAttackDefenderId: null,
    buildMenuEntityId: null,
    buildMenuPos: { x: 0, y: 0 },
    troopSliderState: null,
    betrayalPending: null,
    notifTimer: null,
    winnerAnnounced: false,
    mouseX: 0,
    mouseY: 0,
    pixelColors: null,        // Uint32Array for fast ImageData
  };

  // DOM refs
  let canvas, ctx, uiCanvas, uiCtx, overlay;

  // ============================================================
  // PROJECTION HELPERS
  // ============================================================
  function getBounds() {
    return CONTINENT_BOUNDS[state.mapName] || CONTINENT_BOUNDS.world;
  }

  function project(lon, lat) {
    const b = getBounds();
    const x = ((lon - b.minLon) / (b.maxLon - b.minLon)) * W;
    const y = (1 - (lat - b.minLat) / (b.maxLat - b.minLat)) * H;
    return [Math.round(x), Math.round(y)];
  }

  function unproject(x, y) {
    const b = getBounds();
    const lon = b.minLon + (x / W) * (b.maxLon - b.minLon);
    const lat = b.maxLat - (y / H) * (b.maxLat - b.minLat);
    return [lon, lat];
  }

  function pxIndex(x, y) { return y * W + x; }
  function pxXY(idx)     { return [idx % W, Math.floor(idx / W)]; }

  // ============================================================
  // COLOR HELPERS
  // ============================================================
  function hexToRGB(hex) {
    const n = parseInt(hex.replace('#',''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Pack RGBA into Uint32 (little-endian: ABGR in memory but RGBA in view)
  function packColor(r, g, b, a) {
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  const SEA_COLOR  = packColor(15, 25, 55, 255);
  const LAND_UNCLAIMED = packColor(35, 45, 70, 255);

  // entityId -> packed color cache
  let colorCache = null;

  function buildColorCache(entities) {
    const maxId = Math.max(...entities.map(e => e.id)) + 1;
    colorCache = new Uint32Array(maxId + 1);
    colorCache[0] = LAND_UNCLAIMED;  // 0 = unclaimed
    for (const e of entities) {
      const [r, g, b] = hexToRGB(e.color);
      colorCache[e.id] = packColor(r, g, b, 255);
    }
  }

  // ============================================================
  // MAP RENDERING (shared by mini-maps and main game)
  // ============================================================
  function drawCountriesToCanvas(targetCtx, tW, tH, boundsName, filterSet) {
    if (!state.worldData) return;
    const countries = topojson.feature(state.worldData, state.worldData.objects.countries);
    const b = CONTINENT_BOUNDS[boundsName] || CONTINENT_BOUNDS.world;

    function proj(lon, lat) {
      const x = ((lon - b.minLon) / (b.maxLon - b.minLon)) * tW;
      const y = (1 - (lat - b.minLat) / (b.maxLat - b.minLat)) * tH;
      return [x, y];
    }

    function drawPolygon(coords) {
      targetCtx.beginPath();
      let first = true;
      for (const [lon, lat] of coords) {
        const [px, py] = proj(lon, lat);
        if (first) { targetCtx.moveTo(px, py); first = false; }
        else         targetCtx.lineTo(px, py);
      }
      targetCtx.closePath();
    }

    for (const feature of countries.features) {
      const id = parseInt(feature.id, 10);
      if (filterSet && !filterSet.has(id)) continue;

      targetCtx.fillStyle   = '#2a3a5a';
      targetCtx.strokeStyle = '#0a0e1a';
      targetCtx.lineWidth   = 0.5;

      const g = feature.geometry;
      if (!g) continue;

      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const poly of polys) {
        for (const ring of poly) {
          let prevLon = null;
          targetCtx.beginPath();
          for (const [lon, lat] of ring) {
            if (prevLon !== null && Math.abs(lon - prevLon) > 90) {
              targetCtx.closePath(); targetCtx.fill(); targetCtx.stroke();
              targetCtx.beginPath();
            }
            const [px, py] = proj(lon, lat);
            if (prevLon === null || Math.abs(lon - prevLon) > 90) targetCtx.moveTo(px, py);
            else targetCtx.lineTo(px, py);
            prevLon = lon;
          }
          targetCtx.closePath();
          targetCtx.fill();
          targetCtx.stroke();
        }
      }
    }
  }

  // ============================================================
  // LAND MASK COMPUTATION
  // ============================================================
  function computeLandMask() {
    // Render all relevant countries to an offscreen canvas, then read pixels
    const offscreen = document.createElement('canvas');
    offscreen.width  = W;
    offscreen.height = H;
    const offCtx = offscreen.getContext('2d');
    offCtx.fillStyle = '#000000';
    offCtx.fillRect(0, 0, W, H);

    offCtx.fillStyle   = '#ffffff';
    offCtx.strokeStyle = '#ffffff';
    offCtx.lineWidth   = 1;

    const countries = topojson.feature(state.worldData, state.worldData.objects.countries);
    const filterSet  = CONTINENT_COUNTRIES[state.mapName];

    function drawPoly(coords) {
      offCtx.beginPath();
      let first = true;
      for (const [lon, lat] of coords) {
        const [px, py] = project(lon, lat);
        if (first) { offCtx.moveTo(px, py); first = false; }
        else         offCtx.lineTo(px, py);
      }
      offCtx.closePath();
      offCtx.fill();
    }

    for (const feature of countries.features) {
      const id = parseInt(feature.id, 10);
      if (filterSet && !filterSet.has(id)) continue;
      const g = feature.geometry;
      if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const poly of polys) {
        // Use ring drawing with antimeridian-wrap guard
        for (const ring of poly) {
          let prevLon = null;
          offCtx.beginPath();
          for (const [lon, lat] of ring) {
            if (prevLon !== null && Math.abs(lon - prevLon) > 90) {
              offCtx.closePath(); offCtx.fill();
              offCtx.beginPath();
            }
            const [px, py] = project(lon, lat);
            if (prevLon === null || Math.abs(lon - prevLon) > 90) offCtx.moveTo(px, py);
            else offCtx.lineTo(px, py);
            prevLon = lon;
          }
          offCtx.closePath();
          offCtx.fill();
        }
      }
    }

    const imgData = offCtx.getImageData(0, 0, W, H);
    const d = imgData.data;
    const mask = new Uint8Array(W * H);
    let count = 0;
    for (let i = 0; i < W * H; i++) {
      if (d[i * 4] > 128) { mask[i] = 1; count++; }
    }
    state.landMask       = mask;
    state.totalLandPixels = count;
  }

  // ============================================================
  // TERRITORY CANVAS
  // ============================================================
  function initTerritoryCanvas() {
    state.territory  = new Uint16Array(W * H);
    state.imageData  = ctx.createImageData(W, H);

    // Fill sea pixels initially
    const d32 = new Uint32Array(state.imageData.data.buffer);
    for (let i = 0; i < W * H; i++) {
      d32[i] = state.landMask[i] ? LAND_UNCLAIMED : SEA_COLOR;
    }
    ctx.putImageData(state.imageData, 0, 0);
    state.pixelColors = d32;
  }

  function renderTerritory() {
    if (!state.pixelColors) return;
    ctx.putImageData(state.imageData, 0, 0);
  }

  // Update a single pixel's color in the buffer
  function setPixelColor(idx, entityId) {
    state.pixelColors[idx] = colorCache[entityId] || LAND_UNCLAIMED;
  }

  // ============================================================
  // ENTITY START POSITIONS
  // ============================================================
  function findNearestLandPixel(lon, lat) {
    const [cx, cy] = project(lon, lat);
    // BFS outward to find nearest land pixel
    const maxR = 40;
    for (let r = 0; r <= maxR; r++) {
      for (let angle = 0; angle < 360; angle += Math.max(1, 360 / (r * 8 + 1))) {
        const rad = angle * Math.PI / 180;
        const nx  = Math.round(cx + r * Math.cos(rad));
        const ny  = Math.round(cy + r * Math.sin(rad));
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const idx = pxIndex(nx, ny);
        if (state.landMask[idx]) return idx;
      }
    }
    return -1;
  }

  // ============================================================
  // PHASE 1 - FLOOD FILL EXPANSION
  // ============================================================
  function initExpansion() {
    state.claimedPixels = 0;
    state.frontiers.clear();
    state.frontierLen.clear();
    buildColorCache(state.entities);

    const INIT_FRONTIER_CAP = 4096;

    for (const e of state.entities) {
      const startPx = e.startPx;
      if (startPx < 0 || !state.landMask[startPx]) continue;

      // Claim start pixel
      state.territory[startPx] = e.id;
      setPixelColor(startPx, e.id);
      state.claimedPixels++;
      e.territoryCount = 1;

      // Init frontier as growing array
      const frontier = new Int32Array(INIT_FRONTIER_CAP);
      frontier[0] = startPx;
      state.frontiers.set(e.id, { arr: frontier, head: 0, tail: 1, cap: INIT_FRONTIER_CAP });
    }
  }

  const EXPAND_OFFSETS = [-1, 1, -W, W]; // left, right, up, down

  function expansionTick() {
    let anyActive = false;
    const territory = state.territory;
    const landMask  = state.landMask;

    for (const e of state.entities) {
      const fData = state.frontiers.get(e.id);
      if (!fData || fData.head === fData.tail) continue;

      anyActive = true;

      // Process up to BATCH pixels per entity per tick
      const BATCH = 60;
      let processed = 0;

      while (fData.head !== fData.tail && processed < BATCH) {
        const px = fData.arr[fData.head % fData.cap];
        fData.head++;
        processed++;

        const px_x = px % W;
        const px_y = Math.floor(px / W);

        for (const off of EXPAND_OFFSETS) {
          const ni = px + off;
          // Boundary checks
          if (off === -1 && px_x === 0) continue;
          if (off ===  1 && px_x === W - 1) continue;
          if (ni < 0 || ni >= W * H) continue;

          if (landMask[ni] && territory[ni] === 0) {
            territory[ni] = e.id;
            setPixelColor(ni, e.id);
            e.territoryCount++;
            state.claimedPixels++;

            // Add to frontier (grow ring buffer if needed)
            if (fData.tail - fData.head >= fData.cap - 1) {
              const newCap = fData.cap * 2;
              const newArr = new Int32Array(newCap);
              for (let i = fData.head; i < fData.tail; i++) {
                newArr[i % newCap] = fData.arr[i % fData.cap];
              }
              fData.arr = newArr;
              fData.cap = newCap;
            }
            fData.arr[fData.tail % fData.cap] = ni;
            fData.tail++;
          }
        }
      }
    }

    // Render once per tick
    renderTerritory();

    // Check done
    const pct = state.totalLandPixels > 0 ? state.claimedPixels / state.totalLandPixels : 1;
    updateExpansionBar(pct);

    if (!anyActive || pct >= 0.99) {
      endPhase1();
    }
  }

  let expansionIntervalId = null;

  function startExpansion() {
    state.screen = 'expansion';
    showExpansionHUD(true);
    initExpansion();
    expansionIntervalId = setInterval(expansionTick, 30);
  }

  function endPhase1() {
    if (state.phase1Done) return;
    state.phase1Done = true;
    clearInterval(expansionIntervalId);
    renderTerritory();
    computeAdjacency();
    showExpansionHUD(false);
    setTimeout(startPhase2, 800);
  }

  // ============================================================
  // ADJACENCY COMPUTATION
  // ============================================================
  function computeAdjacency() {
    state.adjacency.clear();
    const territory = state.territory;
    for (let i = 0; i < W * H; i++) {
      const a = territory[i];
      if (!a) continue;
      const x = i % W, y = Math.floor(i / W);
      // Check right and down
      if (x < W - 1) {
        const b = territory[i + 1];
        if (b && b !== a) {
          addAdj(a, b);
          addAdj(b, a);
        }
      }
      if (y < H - 1) {
        const b = territory[i + W];
        if (b && b !== a) {
          addAdj(a, b);
          addAdj(b, a);
        }
      }
    }
  }

  function addAdj(a, b) {
    if (!state.adjacency.has(a)) state.adjacency.set(a, new Set());
    state.adjacency.get(a).add(b);
  }

  function refreshAdjacency(aId, bId) {
    addAdj(aId, bId);
    addAdj(bId, aId);
  }

  // ============================================================
  // PHASE 2 - ECONOMY & WAR
  // ============================================================
  function startPhase2() {
    state.screen = 'war';
    WFUI.showWarHUD(state);

    // Start economy interval
    const ms = state.economySpeed === 'fast' ? 1500 : 3000;
    state.economyInterval = setInterval(economyTick, ms);

    // Start combat processing
    requestAnimationFrame(warLoop);
  }

  let lastWarRender = 0;

  function warLoop(ts) {
    if (state.screen !== 'war') return;

    // Process one combat step per frame
    processCombat();

    // Re-render territory at ~30fps
    if (ts - lastWarRender > 33) {
      renderTerritory();
      WFUI.renderHUDOverlay(state, uiCtx);
      lastWarRender = ts;
    }

    requestAnimationFrame(warLoop);
  }

  function economyTick() {
    if (state.screen !== 'war') return;

    for (const e of state.entities) {
      if (e.isDefeated) continue;
      if (e.isPlayer) {
        e.money  += e.income;
        e.troops += e.troopIncome;
      } else {
        WFBots.tick(e, state);
      }
    }

    // Process bot combat queue
    flushCombatQueue();

    // Check win/lose
    checkVictory();
    WFUI.renderHUDOverlay(state, uiCtx);
  }

  // ============================================================
  // COMBAT SYSTEM
  // ============================================================
  function flushCombatQueue() {
    if (state.activeCombat) return; // wait for current
    if (state.combatQueue.length === 0) return;
    const next = state.combatQueue.shift();
    state.activeCombat = {
      ...next,
      borderPixels: [],
      frontierIdx: 0,
      totalTaken: 0,
    };
    // Build border pixel list
    buildCombatBorder(state.activeCombat);
  }

  function buildCombatBorder(combat) {
    const territory = state.territory;
    const aId = combat.attackerId;
    const dId = combat.defenderId;
    const border = [];
    for (let i = 0; i < W * H; i++) {
      if (territory[i] !== aId) continue;
      const x = i % W, y = Math.floor(i / W);
      for (const off of [-1, 1, -W, W]) {
        if (off === -1 && x === 0) continue;
        if (off ===  1 && x === W-1) continue;
        const ni = i + off;
        if (ni >= 0 && ni < W * H && territory[ni] === dId) {
          border.push(ni);
        }
      }
    }
    // Shuffle for organic look
    for (let i = border.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [border[i], border[j]] = [border[j], border[i]];
    }
    combat.borderPixels = border;
    combat.frontierIdx  = 0;
  }

  function processCombat() {
    if (!state.activeCombat) {
      flushCombatQueue();
      return;
    }

    const combat = state.activeCombat;
    const attacker = state.entities.find(e => e.id === combat.attackerId);
    const defender = state.entities.find(e => e.id === combat.defenderId);

    if (!attacker || !defender || attacker.isDefeated || defender.isDefeated) {
      state.activeCombat = null;
      return;
    }

    const sentTroops  = combat.sent;
    const defTroops   = Math.max(1, defender.troops);
    const ratio       = sentTroops / defTroops;

    // How many pixels to advance per frame
    const speed = Math.max(1, Math.min(80, Math.floor(ratio * 20)));
    const territory = state.territory;

    let advanced = 0;
    const needsRefill = combat.frontierIdx >= combat.borderPixels.length;

    if (needsRefill) {
      buildCombatBorder(combat);
      if (combat.borderPixels.length === 0) {
        // Defender has no more adjacent territory — take all or done
        finalizeDefeat(attacker, defender);
        state.activeCombat = null;
        return;
      }
    }

    while (advanced < speed && combat.frontierIdx < combat.borderPixels.length) {
      if (combat.sent <= 0) break;

      const px = combat.borderPixels[combat.frontierIdx++];
      if (territory[px] !== combat.defenderId) continue; // already taken

      territory[px] = combat.attackerId;
      setPixelColor(px, combat.attackerId);
      attacker.territoryCount++;
      defender.territoryCount--;
      combat.totalTaken++;

      // Troop cost
      const cost = ratio >= 1.5 ? 0.5 : (ratio >= 1 ? 1.2 : 2.5);
      combat.sent = Math.max(0, combat.sent - cost);
      defender.troops = Math.max(0, defender.troops - 0.3);

      advanced++;
    }

    // Update adjacency for new borders
    if (advanced > 0) {
      refreshAdjacency(combat.attackerId, combat.defenderId);
    }

    // Check combat end
    if (combat.sent <= 0 || defender.territoryCount <= 0) {
      if (defender.territoryCount <= 0) {
        finalizeDefeat(attacker, defender);
      }
      state.activeCombat = null;
    }
  }

  function finalizeDefeat(attacker, defender) {
    // Claim all remaining defender pixels
    const territory = state.territory;
    for (let i = 0; i < W * H; i++) {
      if (territory[i] === defender.id) {
        territory[i] = attacker.id;
        setPixelColor(i, attacker.id);
        attacker.territoryCount++;
      }
    }
    defender.territoryCount = 0;
    defender.isDefeated = true;
    notify(`${defender.name} has been eliminated!`, '#f84');
    computeAdjacency();
  }

  // ============================================================
  // NUKE EFFECT
  // ============================================================
  function nukeEffect(attacker, target, nukeType, count) {
    const territory = state.territory;
    const damage = { atomic:0.15, hydrogen:0.25, mirv:0.4 }[nukeType] || 0.15;
    const pixels = [];
    for (let i = 0; i < W * H; i++) {
      if (territory[i] === target.id) pixels.push(i);
    }
    // Random sample
    const toDestroy = Math.min(pixels.length, Math.ceil(pixels.length * damage));
    for (let i = 0; i < toDestroy; i++) {
      const j = Math.floor(Math.random() * pixels.length);
      const px = pixels[j];
      territory[px] = attacker.id;
      setPixelColor(px, attacker.id);
      attacker.territoryCount++;
      target.territoryCount--;
    }
    if (target.territoryCount <= 0) finalizeDefeat(attacker, target);
    renderTerritory();
  }
  state.nukeEffect = nukeEffect;

  // ============================================================
  // PLAYER ACTIONS
  // ============================================================
  function playerAttack(defenderId, troopFraction) {
    const player   = state.entities.find(e => e.isPlayer);
    const defender = state.entities.find(e => e.id === defenderId);
    if (!player || !defender || defender.isDefeated) return;

    const sent = Math.floor(player.troops * troopFraction);
    if (sent <= 0) { notify('Not enough troops!', '#f66'); return; }

    // Check if attacking an ally
    if (player.alliances.has(defenderId)) {
      // Show betrayal confirm
      showBetrayalConfirm(defenderId, sent, troopFraction);
      return;
    }

    player.troops -= sent;
    state.combatQueue.push({
      attackerId: player.id,
      defenderId: defenderId,
      sent: sent,
      isBotAttack: false,
    });
    notify(`⚔️ Attacking ${defender.name} with ${sent} troops!`, '#fa4');
    closeTroopSlider();
  }

  function playerBuild(buildingKey) {
    const player = state.entities.find(e => e.isPlayer);
    const b = BUILDINGS[buildingKey];
    if (!player || !b) return;
    if (player.money < b.cost) {
      notify(`Not enough money! Need $${b.cost}`, '#f66');
      return;
    }
    if ((buildingKey === 'atomic' || buildingKey === 'hydrogen' || buildingKey === 'mirv') 
        && !player.buildings.silo) {
      notify('Build a Missile Silo first!', '#f66');
      return;
    }
    player.money -= b.cost;
    player.buildings[buildingKey] = (player.buildings[buildingKey] || 0) + 1;
    WFBots.recalcStats(player);
    notify(`${b.emoji} Built ${b.name}!`, '#4af');
    closeBuildMenu();
  }

  function playerAllianceOffer(targetId) {
    const player = state.entities.find(e => e.isPlayer);
    const target = state.entities.find(e => e.id === targetId);
    if (!player || !target || target.isDefeated) return;

    if (player.alliances.has(targetId)) {
      notify(`Already allied with ${target.name}`, '#888');
      return;
    }
    if (target.betrayedBy && target.betrayedBy.has(player.id)) {
      notify(`${target.name} refuses your offer after being betrayed!`, '#f66');
      return;
    }
    if (target.refusedAlliance && target.refusedAlliance.has(player.id)) {
      notify(`${target.name} refuses your alliance offer!`, '#f66');
      return;
    }

    // Bot acceptance chance
    const accept = target.difficulty === 'hard' ? 0.3 : (target.difficulty === 'medium' ? 0.6 : 0.8);
    if (Math.random() < accept) {
      WFBots.formAlliance(player, target, state);
      notify(`🤝 Alliance formed with ${target.name}!`, '#4af');
    } else {
      target.refusedAlliance.add(player.id);
      notify(`${target.name} declined your alliance offer.`, '#888');
    }
  }

  // ============================================================
  // WIN / LOSE
  // ============================================================
  function checkVictory() {
    if (state.winnerAnnounced) return;
    const player = state.entities.find(e => e.isPlayer);

    if (player && player.isDefeated) {
      state.winnerAnnounced = true;
      setTimeout(() => showGameOver(false, null), 1500);
      return;
    }

    const alive = state.entities.filter(e => !e.isDefeated);
    if (alive.length === 1 && alive[0].isPlayer) {
      state.winnerAnnounced = true;
      setTimeout(() => showGameOver(true, alive[0]), 1500);
    }
    // Check if player has >50% territory for win
    if (player && !player.isDefeated && state.totalLandPixels > 0) {
      const pct = player.territoryCount / state.totalLandPixels;
      if (pct >= 0.51) {
        state.winnerAnnounced = true;
        setTimeout(() => showGameOver(true, player), 1500);
      }
    }
  }

  function showGameOver(won, winner) {
    clearInterval(state.economyInterval);
    state.screen = 'gameOver';
    WFUI.showGameOver(state, won, winner, overlay, startNewGame);
  }

  // ============================================================
  // UI HELPERS
  // ============================================================
  function notify(msg, color) {
    const el = document.getElementById('notification');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || '#e0e8ff';
    el.style.display = 'block';
    clearTimeout(state.notifTimer);
    state.notifTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
  }
  state.notify = notify;

  function updateExpansionBar(pct) {
    const bar = document.getElementById('expansionBarFill');
    const lbl = document.getElementById('expansionLabel');
    if (bar) bar.style.width = Math.round(pct * 100) + '%';
    if (lbl) lbl.textContent = `Territory Expansion — ${Math.round(pct * 100)}%`;
  }

  function showExpansionHUD(show) {
    const el = document.getElementById('expansionBar');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  function closeBuildMenu() {
    const el = document.getElementById('buildMenu');
    if (el) el.style.display = 'none';
    state.buildMenuEntityId = null;
  }

  function closeTroopSlider() {
    const el = document.getElementById('troopSlider');
    if (el) el.style.display = 'none';
    state.troopSliderState = null;
    state.pendingAttackDefenderId = null;
    state.attackMode = false;
  }

  function showBetrayalConfirm(defenderId, sent, fraction) {
    state.betrayalPending = { defenderId, sent, fraction };
    const defender = state.entities.find(e => e.id === defenderId);
    const el = document.getElementById('betrayalConfirm');
    const p  = document.getElementById('betrayalText');
    if (!el || !p) return;
    p.textContent = `This will break your alliance with ${defender ? defender.name : 'this entity'}. Attack anyway?`;
    el.style.display = 'block';
  }

  // ============================================================
  // INPUT
  // ============================================================
  function setupInput() {
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', e => { e.preventDefault(); });

    document.getElementById('troopCancelBtn').addEventListener('click', () => closeTroopSlider());
    document.getElementById('troopAttackBtn').addEventListener('click', () => {
      if (!state.troopSliderState) return;
      const fraction = parseInt(document.getElementById('troopSliderInput').value) / 100;
      playerAttack(state.pendingAttackDefenderId, fraction);
    });
    document.getElementById('troopSliderInput').addEventListener('input', function() {
      const pct   = parseInt(this.value);
      const player = state.entities.find(e => e.isPlayer);
      if (!player) return;
      const sending = Math.floor(player.troops * pct / 100);
      document.getElementById('troopSliderCount').textContent =
        `Sending ${sending} of ${player.troops} troops`;
    });

    document.getElementById('betrayYesBtn').addEventListener('click', () => {
      if (!state.betrayalPending) return;
      const { defenderId, fraction } = state.betrayalPending;
      const player   = state.entities.find(e => e.isPlayer);
      const defender = state.entities.find(e => e.id === defenderId);
      if (player && defender) {
        WFBots.breakAlliance(player, defender, state);
        notify(`💔 Alliance with ${defender.name} broken!`, '#f84');
      }
      const sent = Math.floor(player.troops * fraction);
      player.troops -= sent;
      state.combatQueue.push({ attackerId: player.id, defenderId, sent, isBotAttack: false });
      document.getElementById('betrayalConfirm').style.display = 'none';
      closeTroopSlider();
      state.betrayalPending = null;
    });

    document.getElementById('betrayNoBtn').addEventListener('click', () => {
      document.getElementById('betrayalConfirm').style.display = 'none';
      state.betrayalPending = null;
    });
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    state.mouseX = Math.round(e.clientX - rect.left);
    state.mouseY = Math.round(e.clientY - rect.top);

    if (state.screen === 'war') {
      const idx = pxIndex(state.mouseX, state.mouseY);
      if (idx >= 0 && idx < W * H) {
        const eid = state.territory[idx];
        if (eid && eid !== state.lastHoverEid) {
          state.lastHoverEid = eid;
          const entity = state.entities.find(e => e.id === eid);
          if (entity) {
            const tip = document.getElementById('tooltip');
            tip.textContent = `${entity.name} — ${entity.troops} troops, $${entity.money}`;
            tip.style.display = 'block';
            tip.style.left = (state.mouseX + 12) + 'px';
            tip.style.top  = (state.mouseY + 12) + 'px';
          }
        }
      }
    }

    if (state.screen === 'playerSetup') {
      // Show land/sea indicator
      const idx = pxIndex(state.mouseX, state.mouseY);
      const onLand = idx >= 0 && idx < W * H && state.landMask[idx];
      canvas.style.cursor = onLand ? 'crosshair' : 'not-allowed';
    }
  }

  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x    = Math.round(e.clientX - rect.left);
    const y    = Math.round(e.clientY - rect.top);

    if (state.screen === 'playerSetup') {
      handlePlayerPlacement(x, y);
    } else if (state.screen === 'countdown') {
      // ignore clicks during countdown
      return;
    } else if (state.screen === 'war') {
      handleWarClick(x, y);
    }
  }

  function handlePlayerPlacement(x, y) {
    const idx = pxIndex(x, y);
    if (!state.landMask || !state.landMask[idx]) {
      notify('Click on land to place your starting position!', '#f66');
      return;
    }

    // Lock out further clicks
    state.screen = 'countdown';

    const [lon, lat] = unproject(x, y);
    state.playerLat = lat;
    state.playerLon = lon;

    // Build player entity
    const player = WFBots.createPlayerEntity(state.playerName, state.playerColor, lat, lon);
    player.startPx = idx;

    // Build bot entities
    const bots = getBotsForMap(state.mapName);
    const usedIds = new Set([0]);
    state.entities = [player];

    for (const bp of bots) {
      if (usedIds.has(bp.id)) continue;
      usedIds.add(bp.id);
      const bot = WFBots.createBotEntity(bp, state.difficulty);
      bot.startPx = findNearestLandPixel(bp.lon, bp.lat);
      if (bot.startPx >= 0) state.entities.push(bot);
    }

    buildColorCache(state.entities);

    // Show all starting dots, then count down 5 seconds
    drawStartingDots();
    startCountdown(5, () => {
      uiCtx.clearRect(0, 0, W, H);
      startExpansion();
    });
  }

  function handleWarClick(x, y) {
    const idx = pxIndex(x, y);
    if (idx < 0 || idx >= W * H) return;

    const clickedId = state.territory[idx];
    const player    = state.entities.find(e => e.isPlayer);
    if (!player || player.isDefeated) return;

    // Close existing menus
    const tip = document.getElementById('tooltip');
    if (tip) tip.style.display = 'none';

    if (clickedId === player.id) {
      // Clicked own territory - show build menu
      openBuildMenu(x, y, player);
    } else if (clickedId && clickedId !== player.id) {
      const target = state.entities.find(e => e.id === clickedId);
      if (!target || target.isDefeated) return;

      // Check adjacency
      const adj = state.adjacency.get(player.id);
      if (!adj || !adj.has(clickedId)) {
        notify(`${target.name} is not adjacent to your territory!`, '#f66');
        return;
      }

      // Open troop slider (attack or ally menu)
      openTroopSlider(x, y, player, target);
    } else {
      // Clicked unclaimed/sea
      closeBuildMenu();
      closeTroopSlider();
    }
  }

  function openBuildMenu(x, y, player) {
    closeTroopSlider();
    state.buildMenuEntityId = player.id;
    const menu = document.getElementById('buildMenu');
    if (!menu) return;

    // Build HTML
    let html = `<div class="build-close" onclick="document.getElementById('buildMenu').style.display='none'">✕</div>
      <h3>🏗️ Build Menu</h3>
      <div class="build-money">💰 $${player.money}</div>`;

    for (const [key, b] of Object.entries(BUILDINGS)) {
      const canAfford = player.money >= b.cost;
      const needsSilo = (key === 'atomic' || key === 'hydrogen' || key === 'mirv') && !player.buildings.silo;
      const count = player.buildings[key] || 0;
      html += `<div class="build-item" onclick="WFGame.buildItem('${key}')" style="opacity:${canAfford && !needsSilo ? 1 : 0.4}">
        <div>
          <div class="build-name">${b.emoji} ${b.name} ${count > 0 ? '('+count+')' : ''}</div>
          <div class="build-eff">${b.label}${needsSilo ? ' ⚠️ Needs Silo' : ''}</div>
        </div>
        <div class="build-cost">$${b.cost}</div>
      </div>`;
    }

    html += `<div class="build-info">⚔️ Troops: ${player.troops} &nbsp; 📈 Income: $${player.income}/tick</div>`;
    menu.innerHTML = html;

    // Position menu
    let mx = x + 10, my = y - 10;
    if (mx + 230 > W) mx = x - 240;
    if (my + 400 > H) my = H - 410;
    menu.style.left    = mx + 'px';
    menu.style.top     = my + 'px';
    menu.style.display = 'block';
  }

  function openTroopSlider(x, y, player, target) {
    closeBuildMenu();
    state.pendingAttackDefenderId = target.id;

    const slider = document.getElementById('troopSlider');
    const input  = document.getElementById('troopSliderInput');
    const count  = document.getElementById('troopSliderCount');
    const title  = document.getElementById('troopSliderTitle');
    const desc   = document.getElementById('troopSliderDesc');
    if (!slider) return;

    const isAlly = player.alliances.has(target.id);
    const sending = Math.floor(player.troops * 0.5);

    if (title) title.textContent = `⚔️ Attack ${target.name}`;
    if (desc) {
      const ratio = player.troops > 0 ? (player.troops / Math.max(1, target.troops)).toFixed(1) : '0';
      desc.textContent = `${target.name} has ${target.troops} troops. Your strength ratio: ${ratio}x.${isAlly ? ' ⚠️ ALLY!' : ''}`;
    }
    if (input) input.value = 50;
    if (count) count.textContent = `Sending ${sending} of ${player.troops} troops`;

    slider.style.display = 'block';
    state.troopSliderState = { defenderId: target.id };

    // Also show diplomacy buttons
    WFUI.showDiploButtons(player, target, state, (action) => {
      if (action === 'ally') playerAllianceOffer(target.id);
    });
  }

  // ============================================================
  // STARTUP FLOW
  // ============================================================
  function showMapSelectScreen() {
    state.screen = 'mapSelect';
    overlay.innerHTML = '';
    WFUI.renderMapSelect(state, overlay, onMapSelected, onDifficultyChanged, onSpeedChanged, onStartGame);

    // Draw mini-map previews after a short delay (let DOM render)
    setTimeout(drawMiniMaps, 100);
  }

  function drawMiniMaps() {
    for (const mapName of MAP_ORDER) {
      const cvs = document.getElementById('minimap-' + mapName);
      if (!cvs) continue;
      const mCtx = cvs.getContext('2d');
      const mW = cvs.width, mH = cvs.height;
      mCtx.fillStyle = '#0a1428';
      mCtx.fillRect(0, 0, mW, mH);

      const filterSet = CONTINENT_COUNTRIES[mapName];
      const b = CONTINENT_BOUNDS[mapName];
      const countries = topojson.feature(state.worldData, state.worldData.objects.countries);

      function proj(lon, lat) {
        return [
          ((lon - b.minLon) / (b.maxLon - b.minLon)) * mW,
          (1 - (lat - b.minLat) / (b.maxLat - b.minLat)) * mH
        ];
      }

      for (const feature of countries.features) {
        const id = parseInt(feature.id, 10);
        if (filterSet && !filterSet.has(id)) continue;
        const g = feature.geometry;
        if (!g) continue;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
        for (const poly of polys) {
          for (const ring of poly) {
            let prevLon = null;
            mCtx.beginPath();
            for (const [lon, lat] of ring) {
              if (prevLon !== null && Math.abs(lon - prevLon) > 90) {
                mCtx.closePath();
                mCtx.fillStyle = '#3a5a8a'; mCtx.strokeStyle = '#0a0e1a'; mCtx.lineWidth = 0.5;
                mCtx.fill(); mCtx.stroke();
                mCtx.beginPath();
              }
              const [px, py] = proj(lon, lat);
              if (prevLon === null || Math.abs(lon - prevLon) > 90) mCtx.moveTo(px, py);
              else mCtx.lineTo(px, py);
              prevLon = lon;
            }
            mCtx.closePath();
            mCtx.fillStyle = '#3a5a8a'; mCtx.strokeStyle = '#0a0e1a'; mCtx.lineWidth = 0.5;
            mCtx.fill();
            mCtx.stroke();
          }
        }
      }
    }
  }

  function onMapSelected(mapName) {
    state.mapName = mapName;
  }

  function onDifficultyChanged(diff) {
    state.difficulty = diff;
  }

  function onSpeedChanged(speed) {
    state.economySpeed = speed;
  }

  function onStartGame() {
    state.screen = 'playerSetup';
    overlay.innerHTML = '';

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    computeLandMask();
    initTerritoryCanvas();
    renderTerritory();

    // Draw country borders on uiCanvas overlay only (no glitch artifacts)
    drawBorderOverlay();

    WFUI.renderPlayerSetup(state, overlay, (name, color) => {
      state.playerName  = name || 'Player';
      state.playerColor = color;
      // buildColorCache is called later in handlePlayerPlacement when entities are populated
    });
  }

  // Draw a polygon ring while skipping antimeridian-wrap segments
  // (prevents horizontal glitch lines across the map)
  function drawRingNoWrap(targetCtx, ring, projFn) {
    let prevLon = null;
    let first = true;
    for (const [lon, lat] of ring) {
      if (prevLon !== null && Math.abs(lon - prevLon) > 90) {
        // Antimeridian crossing detected — lift pen to avoid wrap-around line
        first = true;
      }
      const [px, py] = projFn(lon, lat);
      if (first) { targetCtx.moveTo(px, py); first = false; }
      else         targetCtx.lineTo(px, py);
      prevLon = lon;
    }
  }

  // Draw crisp country borders on the transparent uiCanvas overlay
  function drawBorderOverlay() {
    if (!state.worldData) return;
    uiCtx.clearRect(0, 0, W, H);
    const countries = topojson.feature(state.worldData, state.worldData.objects.countries);
    const filterSet = CONTINENT_COUNTRIES[state.mapName];
    uiCtx.strokeStyle = 'rgba(80,130,200,0.55)';
    uiCtx.lineWidth   = 0.6;
    for (const feature of countries.features) {
      const id = parseInt(feature.id, 10);
      if (filterSet && !filterSet.has(id)) continue;
      const g = feature.geometry;
      if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const poly of polys) {
        for (const ring of poly) {
          uiCtx.beginPath();
          drawRingNoWrap(uiCtx, ring, project);
          uiCtx.stroke();
        }
      }
    }
  }

  // Show all starting dots on the map before expansion
  function drawStartingDots() {
    uiCtx.clearRect(0, 0, W, H);
    for (const e of state.entities) {
      if (e.startPx < 0) continue;
      const x = e.startPx % W;
      const y = Math.floor(e.startPx / W);
      // Glow ring
      uiCtx.beginPath();
      uiCtx.arc(x, y, 7, 0, Math.PI * 2);
      uiCtx.fillStyle = e.color + '44';
      uiCtx.fill();
      // Core dot
      uiCtx.beginPath();
      uiCtx.arc(x, y, 3.5, 0, Math.PI * 2);
      uiCtx.fillStyle = e.color;
      uiCtx.fill();
      // White center
      uiCtx.beginPath();
      uiCtx.arc(x, y, 1.2, 0, Math.PI * 2);
      uiCtx.fillStyle = '#ffffff';
      uiCtx.fill();
    }
  }

  // 5-4-3-2-1 countdown overlay then fire onDone
  function startCountdown(n, onDone) {
    if (n <= 0) {
      overlay.innerHTML = '';
      overlay.style.pointerEvents = 'none';
      onDone();
      return;
    }
    overlay.style.pointerEvents = 'none';
    overlay.innerHTML = `<div style="font-size:6rem;font-weight:900;color:#fff;
      text-shadow:0 0 40px rgba(100,180,255,0.9),0 0 10px rgba(100,180,255,0.5);
      pointer-events:none;user-select:none">${n}</div>`;
    setTimeout(() => startCountdown(n - 1, onDone), 1000);
  }

  function startNewGame() {
    clearInterval(state.economyInterval);
    state.entities       = [];
    state.territory      = null;
    state.landMask       = null;
    state.frontiers.clear();
    state.combatQueue    = [];
    state.activeCombat   = null;
    state.adjacency.clear();
    state.phase1Done     = false;
    state.winnerAnnounced = false;
    state.selectedEntityId = null;
    state.attackMode     = false;
    state.claimedPixels  = 0;

    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);
    uiCtx.clearRect(0, 0, W, H);

    document.getElementById('hud').style.display           = 'none';
    document.getElementById('leaderboard').style.display   = 'none';
    document.getElementById('expansionBar').style.display  = 'none';
    document.getElementById('buildMenu').style.display     = 'none';
    document.getElementById('troopSlider').style.display   = 'none';
    document.getElementById('betrayalConfirm').style.display = 'none';
    document.getElementById('notification').style.display  = 'none';

    showMapSelectScreen();
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  function buildItem(key) { playerBuild(key); }

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    canvas   = document.getElementById('gameCanvas');
    uiCanvas = document.getElementById('uiCanvas');
    ctx      = canvas.getContext('2d');
    uiCtx    = uiCanvas.getContext('2d');
    overlay  = document.getElementById('overlay');

    canvas.width  = W; canvas.height  = H;
    uiCanvas.width = W; uiCanvas.height = H;

    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);
    overlay.innerHTML = '<div class="loading-spinner">Loading world data…</div>';

    setupInput();

    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(world => {
        state.worldData = world;
        showMapSelectScreen();
      })
      .catch(err => {
        overlay.innerHTML = `<div style="color:#f66;padding:20px">
          ⚠️ Failed to load map data.<br>
          <small>Check your internet connection and refresh.</small><br><br>
          <button onclick="location.reload()" style="padding:8px 20px;background:#1a3a6a;border:none;color:white;border-radius:6px;cursor:pointer">
            Retry
          </button>
        </div>`;
      });
  }

  return {
    init,
    buildItem,
    startNewGame,
    // Expose state for UI module
    getState: () => state,
    playerAttack,
    playerAllianceOffer,
    closeBuildMenu,
    closeTroopSlider,
  };
})();

window.WFGame = WFGame;
