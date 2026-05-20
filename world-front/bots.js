// bots.js - World Front bot AI logic

'use strict';

const WFBots = (function() {

  // How often bots act (relative to economy ticks)
  const AI_PERIOD = { easy: 6, medium: 3, hard: 1 };

  // Base income/troop defaults
  const BASE_INCOME = 80;
  const BASE_TROOPS_PER_TICK = 3;

  function init(entity) {
    entity.aiTick    = 0;
    entity.aiTarget  = null;    // entity id currently attacking
    entity.aiState   = 'build'; // 'build' | 'expand' | 'attack' | 'nuke'
    entity.betrayedBy = new Set();
    entity.refusedAlliance = new Set();
  }

  // Called every economy tick for each bot entity
  function tick(botEntity, game) {
    if (botEntity.isDefeated) return;
    botEntity.aiTick++;

    const period = AI_PERIOD[botEntity.difficulty] || 3;
    if (botEntity.aiTick % period !== 0) return;

    const difficulty = botEntity.difficulty;

    // ======== ECONOMY ========
    // Passive income
    botEntity.money  += botEntity.income;
    botEntity.troops += botEntity.troopIncome;

    // ======== DECISIONS ========
    const territoryPct = getTerritoryPct(botEntity, game);
    const biggestEnemy = getMostDangerousEnemy(botEntity, game);

    // Hard bots build strategically, others build loosely
    if (difficulty === 'hard') {
      thinkHard(botEntity, game, territoryPct, biggestEnemy);
    } else if (difficulty === 'medium') {
      thinkMedium(botEntity, game, territoryPct, biggestEnemy);
    } else {
      thinkEasy(botEntity, game);
    }
  }

  function thinkEasy(bot, game) {
    // Easy: slow builder, rarely attacks, no nukes
    if (Math.random() < 0.3 && bot.money >= BUILDINGS.city.cost) {
      buildSomething(bot, ['city', 'barracks'], game);
    }
    // Rarely attacks
    if (Math.random() < 0.05) {
      tryAttackWeak(bot, game, 0.3);
    }
  }

  function thinkMedium(bot, game, territoryPct, biggestEnemy) {
    // Medium: builds decently, attacks sometimes
    if (bot.money >= BUILDINGS.factory.cost && Math.random() < 0.2) {
      buildSomething(bot, ['factory','barracks','city'], game);
    } else if (bot.money >= BUILDINGS.city.cost && Math.random() < 0.4) {
      buildSomething(bot, ['city','barracks'], game);
    }

    // Attack if strong enough
    if (Math.random() < 0.25 && bot.troops > 150) {
      tryAttackWeak(bot, game, 0.5);
    }

    // Seek alliances with larger entities
    if (Math.random() < 0.1) {
      seekAlliance(bot, game);
    }
  }

  function thinkHard(bot, game, territoryPct, biggestEnemy) {
    // Hard: builds aggressively, uses nukes, attacks player specifically
    // Build priority: factories, silos, then nukes
    if (bot.money >= BUILDINGS.mirv.cost && hasSilo(bot)) {
      buildSomething(bot, ['mirv'], game);
    } else if (bot.money >= BUILDINGS.hydrogen.cost && hasSilo(bot)) {
      buildSomething(bot, ['hydrogen'], game);
    } else if (bot.money >= BUILDINGS.atomic.cost && hasSilo(bot)) {
      buildSomething(bot, ['atomic'], game);
    } else if (bot.money >= BUILDINGS.silo.cost && Math.random() < 0.15) {
      buildSomething(bot, ['silo'], game);
    } else if (bot.money >= BUILDINGS.factory.cost && Math.random() < 0.4) {
      buildSomething(bot, ['factory'], game);
    } else if (bot.money >= BUILDINGS.barracks.cost && Math.random() < 0.5) {
      buildSomething(bot, ['barracks'], game);
    }

    // Aggressive attack - prefer player
    if (bot.troops > 200) {
      const player = game.entities.find(e => e.isPlayer && !e.isDefeated);
      if (player && Math.random() < 0.45 && areAdjacent(bot, player, game)) {
        launchAttack(bot, player, game, 0.7);
      } else if (Math.random() < 0.5) {
        tryAttackWeak(bot, game, 0.65);
      }
    }

    // Hard bots may betray allies if it's beneficial
    if (Math.random() < 0.03 && bot.alliances.size > 0) {
      const allyId = [...bot.alliances][0];
      const ally = game.entities.find(e => e.id === allyId);
      if (ally && ally.troops < bot.troops * 0.6) {
        // Betray the ally
        breakAlliance(bot, ally, game);
        game.notify(`${bot.name} betrayed their alliance with ${ally.name}!`, '#f66');
      }
    }

    // Use nukes if enemy is dominant
    if (hasSilo(bot) && hasNuke(bot) && biggestEnemy) {
      if (biggestEnemy.territoryCount > bot.territoryCount * 1.5 && Math.random() < 0.2) {
        nukeTarget(bot, biggestEnemy, game);
      }
    }
  }

  // ======== HELPERS ========

  function getTerritoryPct(entity, game) {
    return game.totalLandPixels > 0
      ? entity.territoryCount / game.totalLandPixels
      : 0;
  }

  function getMostDangerousEnemy(bot, game) {
    let biggest = null, maxTerritory = 0;
    for (const e of game.entities) {
      if (e.id === bot.id || e.isDefeated || bot.alliances.has(e.id)) continue;
      if (e.territoryCount > maxTerritory) {
        maxTerritory = e.territoryCount;
        biggest = e;
      }
    }
    return biggest;
  }

  function buildSomething(bot, options, game) {
    for (const key of options) {
      const b = BUILDINGS[key];
      if (!b) continue;
      if (bot.money >= b.cost) {
        bot.money -= b.cost;
        bot.buildings[key] = (bot.buildings[key] || 0) + 1;
        // Recalculate income/troops
        recalcStats(bot);
        return true;
      }
    }
    return false;
  }

  function hasSilo(bot) {
    return (bot.buildings.silo || 0) > 0;
  }

  function hasNuke(bot) {
    return (bot.buildings.atomic || 0) + (bot.buildings.hydrogen || 0) + (bot.buildings.mirv || 0) > 0;
  }

  function recalcStats(entity) {
    let income      = BASE_INCOME;
    let troopIncome = BASE_TROOPS_PER_TICK;
    const b = entity.buildings;
    income      += (b.city     || 0) * 50;
    income      += (b.factory  || 0) * 100;
    income      += (b.port     || 0) * 25;
    troopIncome += (b.barracks || 0) * 5;
    if (b.battleship) troopIncome += (b.battleship) * 3;
    entity.income      = income;
    entity.troopIncome = troopIncome;
  }

  function tryAttackWeak(bot, game, troopFraction) {
    // Find weakest adjacent enemy
    let weakest = null, minTroops = Infinity;
    for (const e of game.entities) {
      if (e.id === bot.id || e.isDefeated) continue;
      if (bot.alliances.has(e.id)) continue;
      if (!areAdjacent(bot, e, game)) continue;
      if (e.troops < minTroops) {
        minTroops = e.troops;
        weakest = e;
      }
    }
    if (weakest && bot.troops > weakest.troops * 0.8) {
      launchAttack(bot, weakest, game, troopFraction);
    }
  }

  function areAdjacent(a, b, game) {
    // Quick check: scan borders array if available
    if (!game.adjacency) return true; // fallback: assume adjacent
    const adj = game.adjacency.get(a.id);
    return adj ? adj.has(b.id) : false;
  }

  function launchAttack(attacker, defender, game, fraction) {
    if (game.combatQueue) {
      game.combatQueue.push({
        attackerId: attacker.id,
        defenderId: defender.id,
        sent: Math.floor(attacker.troops * fraction),
        isBotAttack: true,
      });
      attacker.troops -= Math.floor(attacker.troops * fraction);
    }
  }

  function seekAlliance(bot, game) {
    for (const e of game.entities) {
      if (e.id === bot.id || e.isDefeated || e.isPlayer) continue;
      if (bot.alliances.has(e.id)) continue;
      if (bot.betrayedBy.has(e.id)) continue;
      if (e.betrayedBy && e.betrayedBy.has(bot.id)) continue;
      if (Math.random() < 0.4) {
        formAlliance(bot, e, game);
        return;
      }
    }
  }

  function formAlliance(a, b, game) {
    a.alliances.add(b.id);
    b.alliances.add(a.id);
    game.notify(`Alliance formed: ${a.name} ↔ ${b.name}`, '#4af');
  }

  function breakAlliance(a, b, game) {
    a.alliances.delete(b.id);
    b.alliances.delete(a.id);
    a.betrayedBy.add(b.id);
    b.betrayedBy.add(a.id);
    b.refusedAlliance = b.refusedAlliance || new Set();
    b.refusedAlliance.add(a.id);
  }

  function nukeTarget(bot, target, game) {
    // Determine nuke type - use best available
    let nukeType = 'atomic';
    if ((bot.buildings.mirv || 0) > 0)     nukeType = 'mirv';
    else if ((bot.buildings.hydrogen || 0) > 0) nukeType = 'hydrogen';

    const damage = { atomic:0.15, hydrogen:0.25, mirv:0.4 }[nukeType];
    const nukeCount = Math.ceil(target.territoryCount * damage);
    game.nukeEffect(bot, target, nukeType, nukeCount);

    // Consume nuke
    bot.buildings[nukeType]--;
    game.notify(`☢️ ${bot.name} launched a ${BUILDINGS[nukeType].name} at ${target.name}!`, '#f84');
  }

  // Create a new bot entity from placement data
  function createBotEntity(placement, difficulty) {
    return {
      id:           placement.id,
      name:         placement.name,
      color:        placement.color,
      countryId:    placement.countryId,
      lat:          placement.lat,
      lon:          placement.lon,
      isPlayer:     false,
      difficulty:   difficulty,
      money:        500,
      troops:       50,
      income:       BASE_INCOME,
      troopIncome:  BASE_TROOPS_PER_TICK,
      territoryCount: 0,
      buildings:    { city:0, barracks:0, factory:0, port:0, battleship:0, silo:0, atomic:0, hydrogen:0, mirv:0 },
      alliances:    new Set(),
      betrayedBy:   new Set(),
      refusedAlliance: new Set(),
      aiTick:       Math.floor(Math.random() * 10),
      aiState:      'build',
      isDefeated:   false,
      startPx:      -1,  // set during init
    };
  }

  // Create player entity
  function createPlayerEntity(name, color, lat, lon) {
    return {
      id:           0,
      name:         name,
      color:        color,
      lat:          lat,
      lon:          lon,
      isPlayer:     true,
      difficulty:   null,
      money:        500,
      troops:       50,
      income:       BASE_INCOME,
      troopIncome:  BASE_TROOPS_PER_TICK,
      territoryCount: 0,
      buildings:    { city:0, barracks:0, factory:0, port:0, battleship:0, silo:0, atomic:0, hydrogen:0, mirv:0 },
      alliances:    new Set(),
      betrayedBy:   new Set(),
      refusedAlliance: new Set(),
      isDefeated:   false,
      startPx:      -1,
    };
  }

  return { tick, init, createBotEntity, createPlayerEntity, recalcStats, breakAlliance, formAlliance };
})();
