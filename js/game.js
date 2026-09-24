/**
 * Боллбастер: Империя паха — Phase 1 HTML5 prototype
 * Pure canvas + DOM. Russian UI. 21+ characters only.
 */
(() => {
  "use strict";

  // ——— State ———
  const STATE = {
    screen: "menu",
    reputation: 0,
    keys: Object.create(null),
    nearNpc: null,
    combat: null,
    roshambo: null,
    roshamboReturn: null, // 'encounter' | 'combat'
    pendingGuaranteedClean: false,
  };

  const GUY_STATES = ["idle", "flinch", "double_over", "knees", "floor", "tap"];
  const STATE_POINTS = { flinch: 1, double_over: 2, knees: 3, floor: 4, tap: 5 };
  const COMBO_WINDOW = 1.5;
  const SWELL_AFTER = 2;

  const NPCS = [
    {
      id: "dima",
      name: "Дима",
      label: "Дима, 22",
      x: 620,
      y: 280,
      w: 28,
      h: 48,
      color: "#4a6a8a",
      hair: "#2a3040",
      beaten: false,
      lines: {
        approach: "Дима стоит у скамейки, руки в карманах. Смотрит на тебя сверху вниз — зря.",
        win: "Дима на полу, ладони на пахе, голос сорван: «Всё… сдаюсь…»",
      },
    },
    {
      id: "artem",
      name: "Артём",
      label: "Артём, 21",
      x: 280,
      y: 360,
      w: 26,
      h: 46,
      color: "#5a7a5a",
      hair: "#3a2818",
      beaten: false,
      lines: {
        approach: "Артём у стены корпуса. Усмехается: «Чего надо, коротышка?»",
        win: "Артём скрутился на асфальте. Сквозь зубы: «Хватит… tap…»",
      },
    },
  ];

  const player = {
    x: 160,
    y: 300,
    w: 24,
    h: 40,
    speed: 180,
    facing: 1,
    vx: 0,
    vy: 0,
  };

  // ——— DOM ———
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const screens = {
    menu: $("#screen-menu"),
    campus: $("#screen-campus"),
    encounter: $("#screen-encounter"),
    combat: $("#screen-combat"),
    roshambo: $("#screen-roshambo"),
    victory: $("#screen-victory"),
  };

  const campusCanvas = $("#campus-canvas");
  const combatCanvas = $("#combat-canvas");
  const cctx = campusCanvas && campusCanvas.getContext("2d");
  const xctx = combatCanvas && combatCanvas.getContext("2d");
  if (!cctx || !xctx) {
    console.error("[Боллбастер] canvas missing");
  }

  function showScreen(name) {
    STATE.screen = name;
    Object.values(screens).forEach((el) => el && el.classList.remove("active"));
    if (screens[name]) screens[name].classList.add("active");
  }

  function setRep(n) {
    STATE.reputation = n;
    $("#rep-display").textContent = `Репутация: ${n}`;
  }

  // ——— Input ———
  window.addEventListener("keydown", (e) => {
    STATE.keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
    if (STATE.screen === "campus" && (e.code === "KeyE" || e.code === "Enter")) {
      tryInteract();
    }
    if (STATE.screen === "combat" && STATE.combat && !STATE.combat.busy) {
      if (e.code === "Digit1" || e.code === "KeyJ") doMove("kick");
      if (e.code === "Digit2" || e.code === "KeyK") doMove("knee");
      if (e.code === "KeyR") openRoshambo("combat");
    }
  });
  window.addEventListener("keyup", (e) => {
    STATE.keys[e.code] = false;
  });

  // ——— Screens wiring (null-safe) ———
  function goCampus() {
    player.x = 160;
    player.y = 300;
    showScreen("campus");
  }
  window.__bbStart = goCampus;

  function on(id, ev, fn) {
    const el = typeof id === "string" && id.startsWith(".") ? null : $(id);
    if (el) el.addEventListener(ev, fn);
  }
  const startBtn = $("#btn-start");
  if (startBtn) startBtn.addEventListener("click", goCampus);
  on("#btn-to-menu", "click", () => showScreen("menu"));
  on("#btn-fight", "click", () => startCombat(STATE.nearNpc, false));
  on("#btn-roshambo", "click", () => openRoshambo("encounter"));
  on("#btn-leave", "click", () => {
    STATE.nearNpc = null;
    showScreen("campus");
  });
  on("#btn-kick", "click", () => doMove("kick"));
  on("#btn-knee", "click", () => doMove("knee"));
  on("#btn-combat-roshambo", "click", () => openRoshambo("combat"));
  on("#btn-victory-ok", "click", () => showScreen("campus"));

  $$(".btn.rps").forEach((btn) => {
    btn.addEventListener("click", () => playRps(btn.dataset.choice));
  });

  $("#btn-victory-ok").addEventListener("click", () => {
    showScreen("campus");
  });

  // ——— Campus ———
  function tryInteract() {
    const npc = findNearNpc();
    if (!npc) return;
    STATE.nearNpc = npc;
    $("#enc-title").textContent = npc.beaten ? `${npc.name} (сдался)` : `Стычка: ${npc.name}`;
    $("#enc-desc").textContent = npc.beaten
      ? `${npc.name} ещё держится за пах и отмахивается. Можно добить репутацией — или найти другого.`
      : npc.lines.approach;
    $("#btn-fight").disabled = false;
    $("#btn-roshambo").disabled = false;
    showScreen("encounter");
  }

  function findNearNpc() {
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    let best = null;
    let bestD = 56;
    for (const n of NPCS) {
      const nx = n.x + n.w / 2;
      const ny = n.y + n.h / 2;
      const d = Math.hypot(px - nx, py - ny);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  function updateCampus(dt) {
    let dx = 0;
    let dy = 0;
    if (STATE.keys["KeyW"] || STATE.keys["ArrowUp"]) dy -= 1;
    if (STATE.keys["KeyS"] || STATE.keys["ArrowDown"]) dy += 1;
    if (STATE.keys["KeyA"] || STATE.keys["ArrowLeft"]) dx -= 1;
    if (STATE.keys["KeyD"] || STATE.keys["ArrowRight"]) dx += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      player.x += (dx / len) * player.speed * dt;
      player.y += (dy / len) * player.speed * dt;
      player.facing = dx !== 0 ? Math.sign(dx) : player.facing;
    }
    // bounds (campus walkable)
    player.x = Math.max(40, Math.min(campusCanvas.width - player.w - 40, player.x));
    player.y = Math.max(120, Math.min(campusCanvas.height - player.h - 30, player.y));

    const near = findNearNpc();
    $("#hint-display").textContent = near
      ? `E — стычка с ${near.name}`
      : "Подойди к парню и нажми E";
  }

  function drawCampus() {
    const W = campusCanvas.width;
    const H = campusCanvas.height;
    cctx.clearRect(0, 0, W, H);

    // ground
    cctx.fillStyle = "#2a3340";
    cctx.fillRect(0, 0, W, H);
    // path
    cctx.fillStyle = "#3a4455";
    cctx.fillRect(0, 200, W, 180);
    // grass strips
    cctx.fillStyle = "#2a4030";
    cctx.fillRect(0, 0, W, 200);
    cctx.fillRect(0, 380, W, H - 380);

    // buildings silhouettes
    drawBuilding(80, 40, 160, 140, "#3a2a38", "Корпус А");
    drawBuilding(720, 30, 180, 150, "#2a3040", "Библиотека");
    drawBuilding(400, 50, 140, 120, "#403028", "Столовая");

    // bench
    cctx.fillStyle = "#5a4030";
    cctx.fillRect(580, 310, 90, 10);
    cctx.fillRect(590, 320, 8, 18);
    cctx.fillRect(650, 320, 8, 18);

    // NPCs
    for (const n of NPCS) {
      drawGuyCampus(n);
    }

    // Rusana
    drawRusanaCampus(player);

    // label
    cctx.fillStyle = "rgba(0,0,0,0.45)";
    cctx.fillRect(12, H - 28, 220, 18);
    cctx.fillStyle = "#c8b0b8";
    cctx.font = "12px sans-serif";
    cctx.fillText("Кампус · вид сверху · 21+", 18, H - 15);
  }

  function drawBuilding(x, y, w, h, color, label) {
    cctx.fillStyle = color;
    cctx.fillRect(x, y, w, h);
    cctx.fillStyle = "#1a1018";
    cctx.fillRect(x + 10, y + 20, 24, 30);
    cctx.fillRect(x + 50, y + 20, 24, 30);
    cctx.fillRect(x + w - 40, y + h - 50, 28, 50);
    cctx.fillStyle = "#a89098";
    cctx.font = "11px sans-serif";
    cctx.fillText(label, x + 8, y + h - 8);
  }

  function drawRusanaCampus(p) {
    const x = p.x;
    const y = p.y;
    // shadow
    cctx.fillStyle = "rgba(0,0,0,0.35)";
    cctx.beginPath();
    cctx.ellipse(x + p.w / 2, y + p.h - 2, 12, 5, 0, 0, Math.PI * 2);
    cctx.fill();
    // legs / shorts
    cctx.fillStyle = "#1a1a1a";
    cctx.fillRect(x + 4, y + 22, 7, 16);
    cctx.fillRect(x + 13, y + 22, 7, 16);
    // torso crop burgundy
    cctx.fillStyle = "#6b1834";
    cctx.fillRect(x + 3, y + 12, 18, 12);
    // head
    cctx.fillStyle = "#c4a090";
    cctx.fillRect(x + 5, y + 2, 14, 12);
    // ponytail
    cctx.fillStyle = "#1a1018";
    cctx.fillRect(x + 6, y, 12, 5);
    cctx.fillRect(x + (p.facing < 0 ? -2 : 16), y + 4, 6, 10);
    // label
    cctx.fillStyle = "#e85a7a";
    cctx.font = "bold 11px sans-serif";
    cctx.fillText("Русана", x - 4, y - 4);
  }

  function drawGuyCampus(n) {
    const x = n.x;
    const y = n.y;
    cctx.fillStyle = "rgba(0,0,0,0.35)";
    cctx.beginPath();
    cctx.ellipse(x + n.w / 2, y + n.h - 2, 12, 5, 0, 0, Math.PI * 2);
    cctx.fill();
    cctx.fillStyle = "#2a2a32";
    cctx.fillRect(x + 5, y + 26, 8, 18);
    cctx.fillRect(x + 15, y + 26, 8, 18);
    cctx.fillStyle = n.color;
    cctx.fillRect(x + 3, y + 14, 22, 14);
    cctx.fillStyle = "#c4a890";
    cctx.fillRect(x + 6, y + 2, 16, 14);
    cctx.fillStyle = n.hair;
    cctx.fillRect(x + 5, y, 18, 6);
    if (n.beaten) {
      cctx.fillStyle = "#e85a7a";
      cctx.font = "10px sans-serif";
      cctx.fillText("✕ сдался", x - 4, y - 4);
    } else {
      cctx.fillStyle = "#d0c0c8";
      cctx.font = "10px sans-serif";
      cctx.fillText(n.label, x - 8, y - 4);
    }
    // soft-zone hint marker (tiny)
    cctx.fillStyle = "rgba(232, 90, 122, 0.35)";
    cctx.fillRect(x + 8, y + 28, 12, 8);
  }

  // ——— Combat ———
  function startCombat(npc, guaranteedFirst) {
    if (!npc) return;
    STATE.combat = {
      npc,
      guyState: "idle",
      hits: 0,
      cleanHits: 0,
      score: 0,
      comboMult: 1,
      lastCleanAt: 0,
      swell: 0,
      busy: false,
      anim: null, // { name, t, duration, hitAt, hitDone, move }
      time: 0,
      flash: 0,
      log: "Цель: soft-zone. 1/J — ап-кик, 2/K — колено.",
      ended: false,
      rusPose: "idle",
      guyPoseT: 0,
    };
    if (guaranteedFirst) STATE.pendingGuaranteedClean = true;
    $("#combat-guy-name").textContent = npc.name;
    updateCombatHud();
    setCombatLog(STATE.combat.log);
    showScreen("combat");
  }

  function setCombatLog(msg) {
    if (STATE.combat) STATE.combat.log = msg;
    $("#combat-log").textContent = msg;
  }

  function updateCombatHud() {
    const c = STATE.combat;
    if (!c) return;
    $("#combat-state").textContent = `стейт: ${c.guyState}`;
    $("#combat-hits").textContent = `Hits: ${c.hits}`;
    $("#combat-combo").textContent = `Комбо: ×${c.comboMult}`;
    $("#combat-score").textContent = `Очки: ${c.score}`;
  }

  function doMove(move) {
    const c = STATE.combat;
    if (!c || c.busy || c.ended) return;
    const defs = {
      kick: { name: "rus_kick_up", duration: 0.7, hitAt: 0.35, label: "Ап-кик" },
      knee: { name: "rus_knee", duration: 0.55, hitAt: 0.28, label: "Колено" },
    };
    const d = defs[move];
    c.busy = true;
    c.rusPose = move;
    c.anim = {
      name: d.name,
      t: 0,
      duration: d.duration,
      hitAt: d.hitAt,
      hitDone: false,
      move,
      label: d.label,
    };
    setCombatLog(`${d.label} (${d.name})…`);
  }

  function resolveHit(c, forcedClean) {
    // Aim: soft-zone by default with slight miss chance unless forced
    let clean = forcedClean || STATE.pendingGuaranteedClean;
    STATE.pendingGuaranteedClean = false;

    if (!clean) {
      // 75% soft, 25% hard/miss when free aiming (prototype)
      clean = Math.random() < 0.75;
    }

    if (!clean) {
      setCombatLog("Мимо / hard-zone (бедро). +0 Hit.");
      c.flash = 0.2;
      return;
    }

    // clean soft hit
    c.hits += 1;
    c.cleanHits += 1;
    const now = c.time;
    if (c.lastCleanAt > 0 && now - c.lastCleanAt <= COMBO_WINDOW) {
      // counting toward combo; apply ×1.5 after 3 cleans in window chain
    }
    // combo: 3 cleans without >1.5s pause
    if (c.lastCleanAt > 0 && now - c.lastCleanAt > COMBO_WINDOW) {
      c.comboMult = 1;
      c.comboChain = 1;
    } else {
      c.comboChain = (c.comboChain || 0) + 1;
    }
    if (c.comboChain >= 3) c.comboMult = 1.5;
    c.lastCleanAt = now;

    if (c.cleanHits >= SWELL_AFTER) c.swell = Math.min(2, c.cleanHits - 1);

    const painMult = c.swell >= 1 ? 1.25 : 1;
    let gained = 1 * c.comboMult * painMult;

    // state transition
    const idx = GUY_STATES.indexOf(c.guyState);
    if (idx < GUY_STATES.length - 1) {
      const next = GUY_STATES[idx + 1];
      c.guyState = next;
      gained += STATE_POINTS[next] || 0;
      setCombatLog(
        `ЧИСТЫЙ soft-zone! +Hit · ${GUY_STATES[idx]} → ${next}` +
          (c.comboMult > 1 ? ` · комбо ×${c.comboMult}` : "") +
          (painMult > 1 ? ` · отёк ×${painMult}` : "")
      );
    } else {
      setCombatLog("Чистый добивающий. Он уже на сдаче.");
    }

    c.score += Math.round(gained * 10) / 10;
    c.flash = 0.35;
    updateCombatHud();

    if (c.guyState === "tap") {
      endCombatVictory();
    }
  }

  function endCombatVictory() {
    const c = STATE.combat;
    if (!c || c.ended) return;
    c.ended = true;
    c.busy = true;
    c.npc.beaten = true;
    const repGain = 10 + Math.floor(c.score);
    setRep(STATE.reputation + repGain);
    setTimeout(() => {
      $("#victory-text").textContent = c.npc.lines.win;
      $("#victory-stats").textContent =
        `Hits: ${c.hits} · Очки стычки: ${c.score} · Репутация +${repGain} (всего ${STATE.reputation})`;
      showScreen("victory");
    }, 700);
  }

  function updateCombat(dt) {
    const c = STATE.combat;
    if (!c || c.ended) return;
    c.time += dt;
    c.guyPoseT += dt;
    if (c.flash > 0) c.flash -= dt;

    if (c.anim) {
      c.anim.t += dt;
      if (!c.anim.hitDone && c.anim.t >= c.anim.hitAt) {
        c.anim.hitDone = true;
        resolveHit(c, false);
      }
      if (c.anim.t >= c.anim.duration) {
        c.anim = null;
        c.busy = false;
        c.rusPose = "idle";
        if (!c.ended && c.guyState !== "tap") {
          setCombatLog("Жди окно. 1/J ап-кик · 2/K колено · R рошамбо");
        }
      }
    }

    // combo decay display
    if (c.lastCleanAt > 0 && c.time - c.lastCleanAt > COMBO_WINDOW && c.comboMult > 1) {
      c.comboMult = 1;
      c.comboChain = 0;
      updateCombatHud();
    }
  }

  function drawCombat() {
    const c = STATE.combat;
    const W = combatCanvas.width;
    const H = combatCanvas.height;
    xctx.clearRect(0, 0, W, H);

    // arena bg
    xctx.fillStyle = "#1a1520";
    xctx.fillRect(0, 0, W, H);
    xctx.fillStyle = "#2a2430";
    xctx.fillRect(0, H - 120, W, 120);
    // wall
    xctx.fillStyle = "#322838";
    xctx.fillRect(0, 0, W, H - 120);
    xctx.fillStyle = "#3a3040";
    for (let i = 0; i < 8; i++) {
      xctx.fillRect(40 + i * 120, 40, 80, 100);
    }

    if (!c) return;

    // positions (side-view 2.5D-ish)
    const floorY = H - 80;
    const rusX = 280;
    const guyX = 580;

    drawCombatGuy(guyX, floorY, c);
    drawCombatRusana(rusX, floorY, c);

    // soft-zone label when idle-ish
    if (c.guyState === "idle" || c.guyState === "flinch") {
      const soft = softZoneRect(guyX, floorY, c);
      xctx.strokeStyle = "rgba(232, 90, 122, 0.85)";
      xctx.lineWidth = 2;
      xctx.strokeRect(soft.x, soft.y, soft.w, soft.h);
      xctx.fillStyle = "rgba(232, 90, 122, 0.2)";
      xctx.fillRect(soft.x, soft.y, soft.w, soft.h);
      xctx.fillStyle = "#e85a7a";
      xctx.font = "bold 11px sans-serif";
      xctx.fillText("soft-zone", soft.x - 4, soft.y - 6);
    }

    // move name flash
    if (c.anim) {
      xctx.fillStyle = "#e8b84a";
      xctx.font = "bold 18px sans-serif";
      xctx.fillText(c.anim.name, W / 2 - 60, 36);
    }

    // hit flash
    if (c.flash > 0) {
      xctx.fillStyle = `rgba(232, 90, 122, ${c.flash})`;
      xctx.fillRect(0, 0, W, H);
    }

    // state banner
    xctx.fillStyle = "rgba(0,0,0,0.5)";
    xctx.fillRect(W / 2 - 100, H - 36, 200, 24);
    xctx.fillStyle = "#f2e8ec";
    xctx.font = "13px sans-serif";
    xctx.textAlign = "center";
    xctx.fillText(`guy_${c.guyState}`, W / 2, H - 20);
    xctx.textAlign = "left";

    if (c.swell > 0) {
      xctx.fillStyle = "#e85a7a";
      xctx.font = "12px sans-serif";
      xctx.fillText(`отёк ×${c.swell >= 1 ? 1.25 : 1} (swell_${Math.min(c.swell, 2)})`, 20, 28);
    }
  }

  function softZoneRect(guyX, floorY, c) {
    // pelvis-anchored soft zone ~30% torso width
    const scale = c.guyState === "double_over" || c.guyState === "knees" ? 0.9 : 1;
    const torsoW = 40 * scale;
    const softW = torsoW * 0.3;
    let yOff = -52;
    if (c.guyState === "double_over") yOff = -40;
    if (c.guyState === "knees") yOff = -28;
    if (c.guyState === "floor" || c.guyState === "tap") yOff = -18;
    return {
      x: guyX + torsoW / 2 - softW / 2 + 8,
      y: floorY + yOff,
      w: softW + 6,
      h: 16,
    };
  }

  function drawCombatRusana(x, floorY, c) {
    const pose = c.rusPose;
    let kickLeg = 0;
    let kneeUp = 0;
    let lean = 0;
    if (c.anim) {
      const p = Math.min(1, c.anim.t / c.anim.duration);
      if (pose === "kick") {
        // startup → active → recovery
        if (p < 0.35) kickLeg = p / 0.35;
        else if (p < 0.55) kickLeg = 1;
        else kickLeg = 1 - (p - 0.55) / 0.45;
        lean = kickLeg * 0.3;
      }
      if (pose === "knee") {
        if (p < 0.4) kneeUp = p / 0.4;
        else if (p < 0.6) kneeUp = 1;
        else kneeUp = 1 - (p - 0.6) / 0.4;
        lean = kneeUp * 0.2;
      }
    }

    const y = floorY;
    // shadow
    xctx.fillStyle = "rgba(0,0,0,0.4)";
    xctx.beginPath();
    xctx.ellipse(x + 20, y, 22, 8, 0, 0, Math.PI * 2);
    xctx.fill();

    // back leg
    xctx.fillStyle = "#1a1a1a";
    xctx.fillRect(x + 10, y - 36, 10, 36);

    // kicking / knee leg
    xctx.save();
    xctx.translate(x + 28, y - 30);
    if (kickLeg > 0) {
      xctx.rotate(-Math.PI * 0.55 * kickLeg);
      xctx.fillStyle = "#1a1a1a";
      xctx.fillRect(0, -6, 38, 10);
      xctx.fillStyle = "#eee";
      xctx.fillRect(32, -8, 12, 14); // shoe
    } else if (kneeUp > 0) {
      xctx.rotate(-Math.PI * 0.4 * kneeUp);
      xctx.fillStyle = "#1a1a1a";
      xctx.fillRect(0, -8, 14, 28);
      xctx.fillStyle = "#eee";
      xctx.fillRect(2, 18, 12, 8);
    } else {
      xctx.fillStyle = "#1a1a1a";
      xctx.fillRect(-4, 0, 10, 30);
    }
    xctx.restore();

    // shorts
    xctx.fillStyle = "#111";
    xctx.fillRect(x + 8, y - 48, 28, 16);

    // torso crop
    xctx.save();
    xctx.translate(x + 22, y - 48);
    xctx.rotate(lean * 0.4);
    xctx.fillStyle = "#6b1834";
    xctx.fillRect(-14, -28, 28, 30);
    // head
    xctx.fillStyle = "#c4a090";
    xctx.fillRect(-10, -48, 20, 20);
    // hair ponytail
    xctx.fillStyle = "#1a1018";
    xctx.fillRect(-11, -52, 22, 8);
    xctx.fillRect(-18, -48, 8, 16);
    xctx.restore();

    // label
    xctx.fillStyle = "#e85a7a";
    xctx.font = "bold 13px sans-serif";
    xctx.fillText("Русана", x - 4, y - 108);
    if (c.anim) {
      xctx.fillStyle = "#e8b84a";
      xctx.font = "11px sans-serif";
      xctx.fillText(c.anim.label, x, y - 120);
    }
  }

  function drawCombatGuy(x, floorY, c) {
    const st = c.guyState;
    let fold = 0;
    let sink = 0;
    let onFloor = false;
    if (st === "flinch") fold = 0.25;
    if (st === "double_over") fold = 0.55;
    if (st === "knees") {
      fold = 0.7;
      sink = 28;
    }
    if (st === "floor" || st === "tap") {
      onFloor = true;
      sink = 50;
      fold = 1;
    }

    const y = floorY + sink;
    xctx.fillStyle = "rgba(0,0,0,0.4)";
    xctx.beginPath();
    xctx.ellipse(x + 24, floorY, onFloor ? 36 : 20, 8, 0, 0, Math.PI * 2);
    xctx.fill();

    if (onFloor) {
      // lying curled
      xctx.fillStyle = "#c4a890";
      xctx.fillRect(x + 40, y - 28, 18, 16); // head
      xctx.fillStyle = c.npc.hair;
      xctx.fillRect(x + 40, y - 32, 20, 6);
      xctx.fillStyle = c.npc.color;
      xctx.fillRect(x + 8, y - 24, 40, 20); // torso
      xctx.fillStyle = "#2a2a32";
      xctx.fillRect(x - 4, y - 18, 24, 14); // legs curled
      // hands on groin
      xctx.fillStyle = "#c4a090";
      xctx.fillRect(x + 18, y - 14, 12, 10);
      xctx.fillStyle = "#e85a7a";
      xctx.font = "bold 12px sans-serif";
      xctx.fillText(st === "tap" ? "TAP / СДАЧА" : "на полу", x + 8, y - 40);
      // swell
      if (c.swell > 0) {
        xctx.fillStyle = `rgba(232,90,122,${0.3 + c.swell * 0.15})`;
        xctx.beginPath();
        xctx.ellipse(x + 22, y - 8, 10 + c.swell * 3, 8 + c.swell * 2, 0, 0, Math.PI * 2);
        xctx.fill();
      }
      return;
    }

    // standing / folding
    xctx.save();
    xctx.translate(x + 22, y - 40);
    xctx.rotate(fold * 0.9);

    // legs
    xctx.fillStyle = "#2a2a32";
    xctx.fillRect(-14, 20, 12, 40 - sink * 0.3);
    xctx.fillRect(2, 20, 12, 40 - sink * 0.3);

    // torso
    xctx.fillStyle = c.npc.color;
    xctx.fillRect(-16, -20, 32, 44);

    // head
    xctx.fillStyle = "#c4a890";
    xctx.fillRect(-12, -42, 22, 22);
    xctx.fillStyle = c.npc.hair;
    xctx.fillRect(-13, -46, 24, 8);

    // hands protecting if flinch+
    if (fold > 0.2) {
      xctx.fillStyle = "#c4a090";
      xctx.fillRect(-8, 8, 10, 14);
      xctx.fillRect(2, 8, 10, 14);
    }

    xctx.restore();

    // swell visual at pelvis
    if (c.swell > 0) {
      const soft = softZoneRect(x, floorY, c);
      xctx.fillStyle = `rgba(232,90,122,${0.35 + c.swell * 0.15})`;
      xctx.beginPath();
      xctx.ellipse(soft.x + soft.w / 2, soft.y + soft.h / 2, 8 + c.swell * 4, 6 + c.swell * 3, 0, 0, Math.PI * 2);
      xctx.fill();
    }

    xctx.fillStyle = "#d0c0c8";
    xctx.font = "bold 13px sans-serif";
    xctx.fillText(c.npc.label, x - 4, floorY - 100 - sink);
  }

  // ——— Roshambo ———
  function openRoshambo(from) {
    if (STATE.screen === "combat" && STATE.combat && (STATE.combat.busy || STATE.combat.ended)) return;
    STATE.roshamboReturn = from;
    STATE.roshambo = { you: 0, him: 0, round: 1, done: false };
    $("#rps-you").textContent = "0";
    $("#rps-him").textContent = "0";
    $("#rps-round").textContent = "1";
    $("#rps-result").textContent = "Выбери жест";
    $$(".btn.rps").forEach((b) => (b.disabled = false));
    showScreen("roshambo");
  }

  function playRps(choice) {
    const r = STATE.roshambo;
    if (!r || r.done) return;
    const opts = ["rock", "paper", "scissors"];
    const him = opts[Math.floor(Math.random() * 3)];
    const names = { rock: "Камень", paper: "Бумага", scissors: "Ножницы" };
    let outcome = "draw";
    if (choice === him) outcome = "draw";
    else if (
      (choice === "rock" && him === "scissors") ||
      (choice === "paper" && him === "rock") ||
      (choice === "scissors" && him === "paper")
    ) {
      outcome = "win";
      r.you += 1;
    } else {
      outcome = "lose";
      r.him += 1;
    }

    $("#rps-you").textContent = String(r.you);
    $("#rps-him").textContent = String(r.him);

    const line =
      outcome === "draw"
        ? `Ничья: ${names[choice]} vs ${names[him]}`
        : outcome === "win"
          ? `Раунд твой: ${names[choice]} бьёт ${names[him]}`
          : `Раунд его: ${names[him]} бьёт ${names[choice]}`;

    if (r.you >= 2 || r.him >= 2 || r.round >= 3) {
      r.done = true;
      $$(".btn.rps").forEach((b) => (b.disabled = true));
      const youWin = r.you > r.him;
      $("#rps-result").textContent =
        line +
        " · " +
        (youWin
          ? "ПОБЕДА В РОШАМБО — гарантированный чистый!"
          : r.you === r.him
            ? "Ничья серии — без бонуса."
            : "ПРОИГРЫШ — он отпрыгивает (флинч-контра, без урона тебе).");
      setTimeout(() => finishRoshambo(youWin, r.you === r.him), 1100);
    } else {
      r.round += 1;
      $("#rps-round").textContent = String(r.round);
      $("#rps-result").textContent = line;
    }
  }

  function finishRoshambo(youWin, draw) {
    const from = STATE.roshamboReturn;
    const npc = STATE.nearNpc || (STATE.combat && STATE.combat.npc);

    if (from === "encounter") {
      if (youWin) {
        startCombat(npc, true);
        // apply guaranteed on first available hit automatically hint
        STATE.pendingGuaranteedClean = true;
        setCombatLog("Рошамбо выигран: следующий удар = гарантированный чистый soft-zone.");
      } else if (draw) {
        startCombat(npc, false);
        setCombatLog("Ничья рошамбо. Бей сама.");
      } else {
        // lose: flinch-counter — he steps back, no damage; still enter combat but guy briefly flinch
        startCombat(npc, false);
        STATE.combat.guyState = "flinch";
        updateCombatHud();
        setCombatLog("Рошамбо проигран: он отпрыгнул (флинч-контра). Урона тебе нет. Продолжай.");
      }
    } else if (from === "combat" && STATE.combat) {
      showScreen("combat");
      if (youWin) {
        STATE.pendingGuaranteedClean = true;
        setCombatLog("Рошамбо: следующий удар гарантированно чистый!");
      } else if (draw) {
        setCombatLog("Ничья рошамбо.");
      } else {
        // flinch counter — push state visually without damage to Rusana
        if (STATE.combat.guyState === "idle") {
          STATE.combat.guyState = "flinch";
          updateCombatHud();
        }
        setCombatLog("Он отпрыгнул / закрылся. Без урона Русане. Бей снова.");
      }
    }
  }

  // ——— Loop ———
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (STATE.screen === "campus") {
      updateCampus(dt);
      drawCampus();
    } else if (STATE.screen === "combat") {
      updateCombat(dt);
      drawCombat();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // boot
  showScreen("menu");
  setRep(0);
})();
