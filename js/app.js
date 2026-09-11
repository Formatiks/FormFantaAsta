(function () {
  "use strict";

  const ROOMS_KEY = "fantasta.rooms.v1";
  const SESSION_KEY = "fantasta.session.v1";
  const ROOM_EVENT = "fantasta:room-change";
  const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const ROLE_NAMES = {
    P: "Portieri",
    D: "Difensori",
    C: "Centrocampisti",
    A: "Attaccanti"
  };
  const ROLE_LIMIT_KEYS = {
    P: "goalkeepers",
    D: "defenders",
    C: "midfielders",
    A: "forwards"
  };

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeCode(code) {
    return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  }

  function readRooms() {
    try {
      const rooms = JSON.parse(localStorage.getItem(ROOMS_KEY) || "{}");
      return rooms && typeof rooms === "object" ? rooms : {};
    } catch (error) {
      console.error("Impossibile leggere le stanze salvate", error);
      return {};
    }
  }

  function writeRooms(rooms, changedCode) {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
    window.dispatchEvent(new CustomEvent(ROOM_EVENT, { detail: { code: changedCode } }));
  }

  function generateRoomCode() {
    const rooms = readRooms();
    let code = "";

    do {
      code = Array.from({ length: 5 }, function () {
        return ROOM_CODE_CHARACTERS[Math.floor(Math.random() * ROOM_CODE_CHARACTERS.length)];
      }).join("");
    } while (rooms[code]);

    return code;
  }

  function getRoom(code) {
    const room = readRooms()[normalizeCode(code)];
    return room ? clone(room) : null;
  }

  function saveRoom(room) {
    if (!room || !room.code) {
      throw new Error("Stanza non valida.");
    }

    const rooms = readRooms();
    room.updatedAt = new Date().toISOString();
    rooms[room.code] = clone(room);
    writeRooms(rooms, room.code);
    return clone(room);
  }

  function updateRoom(code, updater) {
    const rooms = readRooms();
    const normalizedCode = normalizeCode(code);
    const room = rooms[normalizedCode];

    if (!room) {
      throw new Error("La stanza non esiste più.");
    }

    const updatedRoom = updater(clone(room)) || room;
    updatedRoom.revision = (room.revision || 0) + 1;
    updatedRoom.updatedAt = new Date().toISOString();
    rooms[normalizedCode] = clone(updatedRoom);
    writeRooms(rooms, normalizedCode);
    return clone(updatedRoom);
  }

  function setSession(code, participantId) {
    const session = { code: normalizeCode(code), participantId: participantId };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      return session && session.code && session.participantId ? session : null;
    } catch (error) {
      return null;
    }
  }

  function getCurrentContext() {
    const session = getSession();
    if (!session) {
      return null;
    }

    const room = getRoom(session.code);
    if (!room) {
      return null;
    }

    const participant = room.participants.find(function (item) {
      return item.id === session.participantId;
    });

    if (!participant) {
      return null;
    }

    return { session: session, room: room, participant: participant };
  }

  function requireCurrentContext() {
    const context = getCurrentContext();
    if (!context) {
      window.location.replace("index.html");
      return null;
    }
    return context;
  }

  function cleanName(name, label) {
    const cleaned = String(name || "").trim().replace(/\s+/g, " ");
    if (cleaned.length < 2) {
      throw new Error(`${label} deve contenere almeno 2 caratteri.`);
    }
    return cleaned;
  }

  function createParticipant(name, credits, isHost) {
    return {
      id: createId(),
      name: name,
      credits: credits,
      isHost: Boolean(isHost),
      joinedAt: new Date().toISOString(),
      roster: { P: [], D: [], C: [], A: [] }
    };
  }

  function createRoom(configuration) {
    const leagueName = cleanName(configuration.leagueName, "Il nome della lega");
    const hostTeamName = cleanName(configuration.hostTeamName, "Il nome della squadra");
    const participantsCount = Number(configuration.participantsCount);
    const initialCredits = Number(configuration.initialCredits);

    if (!Number.isInteger(participantsCount) || participantsCount < 2 || participantsCount > 20) {
      throw new Error("Il numero di partecipanti non è valido.");
    }
    if (!Number.isFinite(initialCredits) || initialCredits < 100 || initialCredits > 2000) {
      throw new Error("I crediti iniziali devono essere tra 100 e 2000.");
    }

    const rosterLimits = {
      goalkeepers: Number(configuration.goalkeepers),
      defenders: Number(configuration.defenders),
      midfielders: Number(configuration.midfielders),
      forwards: Number(configuration.forwards)
    };

    if (Object.values(rosterLimits).some(function (value) { return !Number.isInteger(value) || value < 1; })) {
      throw new Error("La composizione della rosa non è valida.");
    }

    const host = createParticipant(hostTeamName, initialCredits, true);
    const now = new Date().toISOString();
    const room = {
      code: generateRoomCode(),
      leagueName: leagueName,
      status: "lobby",
      createdAt: now,
      updatedAt: now,
      revision: 1,
      hostId: host.id,
      settings: Object.assign({
        participantsCount: participantsCount,
        initialCredits: initialCredits
      }, rosterLimits),
      participants: [host],
      currentPlayer: null,
      currentBid: { amount: 0, bidderId: null },
      assignedPlayerIds: [],
      auctionLog: []
    };

    saveRoom(room);
    setSession(room.code, host.id);
    return clone(room);
  }

  function joinRoom(code, teamName) {
    const normalizedCode = normalizeCode(code);
    const cleanedTeamName = cleanName(teamName, "Il nome della squadra");
    const existingRoom = getRoom(normalizedCode);

    if (!existingRoom) {
      throw new Error("Codice stanza non trovato.");
    }
    if (existingRoom.status !== "lobby") {
      throw new Error("Questa asta è già iniziata.");
    }
    if (existingRoom.participants.length >= existingRoom.settings.participantsCount) {
      throw new Error("La stanza è al completo.");
    }
    if (existingRoom.participants.some(function (participant) {
      return participant.name.toLowerCase() === cleanedTeamName.toLowerCase();
    })) {
      throw new Error("Questo nome squadra è già in uso.");
    }

    const participant = createParticipant(cleanedTeamName, existingRoom.settings.initialCredits, false);
    const room = updateRoom(normalizedCode, function (draft) {
      draft.participants.push(participant);
      return draft;
    });

    setSession(normalizedCode, participant.id);
    return { room: room, participant: clone(participant) };
  }

  function assertHost(room, participantId) {
    if (room.hostId !== participantId) {
      throw new Error("Solo l'host può usare questo controllo.");
    }
  }

  function startAuction(code, participantId) {
    return updateRoom(code, function (room) {
      assertHost(room, participantId);
      if (room.status !== "lobby") {
        throw new Error("L'asta è già iniziata.");
      }
      room.status = "auction";
      room.auctionLog.unshift({ type: "start", at: new Date().toISOString() });
      return room;
    });
  }

  async function fetchPlayers() {
    const response = await fetch("data/giocatori.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Impossibile caricare l'elenco dei giocatori.");
    }
    const players = await response.json();
    if (!Array.isArray(players)) {
      throw new Error("Il file giocatori non è nel formato corretto.");
    }
    return players;
  }

  function getRandomPlayer(room, players, excludedId) {
    const assignedIds = new Set(room.assignedPlayerIds || []);
    const availablePlayers = players.filter(function (player) {
      return !assignedIds.has(player.id) && player.id !== excludedId;
    });

    if (!availablePlayers.length) {
      return null;
    }
    return clone(availablePlayers[Math.floor(Math.random() * availablePlayers.length)]);
  }

  function selectPlayer(code, participantId, player) {
    return updateRoom(code, function (room) {
      assertHost(room, participantId);
      if (room.status !== "auction") {
        throw new Error("L'asta non è attiva.");
      }
      if (room.currentPlayer) {
        throw new Error("C'è già un giocatore all'asta.");
      }
      if ((room.assignedPlayerIds || []).includes(player.id)) {
        throw new Error("Questo giocatore è già stato assegnato.");
      }
      room.currentPlayer = clone(player);
      room.currentBid = { amount: Math.max(1, Number(player.quotazione) || 1), bidderId: null };
      room.auctionLog.unshift({ type: "draw", playerName: player.nome, at: new Date().toISOString() });
      room.auctionLog = room.auctionLog.slice(0, 30);
      return room;
    });
  }

  function placeBid(code, participantId, amount) {
    return updateRoom(code, function (room) {
      if (room.status !== "auction" || !room.currentPlayer) {
        throw new Error("Non c'è un giocatore all'asta.");
      }

      const participant = room.participants.find(function (item) { return item.id === participantId; });
      if (!participant) {
        throw new Error("Partecipante non trovato.");
      }
      if (room.currentBid.bidderId === participantId) {
        throw new Error("La tua offerta è già la più alta.");
      }

      const bidAmount = Number(amount);
      if (!Number.isInteger(bidAmount) || bidAmount <= room.currentBid.amount) {
        throw new Error(`L'offerta minima è ${room.currentBid.amount + 1}.`);
      }
      if (bidAmount > participant.credits) {
        throw new Error("Non hai abbastanza crediti.");
      }

      room.currentBid = { amount: bidAmount, bidderId: participantId };
      room.auctionLog.unshift({
        type: "bid",
        participantName: participant.name,
        amount: bidAmount,
        playerName: room.currentPlayer.nome,
        at: new Date().toISOString()
      });
      room.auctionLog = room.auctionLog.slice(0, 30);
      return room;
    });
  }

  function assignPlayer(code, participantId) {
    return updateRoom(code, function (room) {
      assertHost(room, participantId);
      if (!room.currentPlayer || !room.currentBid.bidderId) {
        throw new Error("Serve almeno un'offerta prima dell'aggiudicazione.");
      }

      const winner = room.participants.find(function (item) { return item.id === room.currentBid.bidderId; });
      if (!winner) {
        throw new Error("La squadra vincente non è più nella stanza.");
      }
      if (winner.credits < room.currentBid.amount) {
        throw new Error("La squadra vincente non ha crediti sufficienti.");
      }

      const role = room.currentPlayer.ruolo;
      const limitKey = ROLE_LIMIT_KEYS[role];
      const roleLimit = room.settings[limitKey];
      if (!winner.roster[role] || winner.roster[role].length >= roleLimit) {
        throw new Error(`${winner.name} ha già completato il reparto ${ROLE_NAMES[role].toLowerCase()}.`);
      }

      const purchasedPlayer = Object.assign({}, room.currentPlayer, { purchasePrice: room.currentBid.amount });
      winner.credits -= room.currentBid.amount;
      winner.roster[role].push(purchasedPlayer);
      room.assignedPlayerIds.push(room.currentPlayer.id);
      room.auctionLog.unshift({
        type: "assign",
        participantName: winner.name,
        playerName: room.currentPlayer.nome,
        amount: room.currentBid.amount,
        at: new Date().toISOString()
      });
      room.auctionLog = room.auctionLog.slice(0, 30);
      room.currentPlayer = null;
      room.currentBid = { amount: 0, bidderId: null };
      return room;
    });
  }

  function cancelCurrentAuction(code, participantId) {
    return updateRoom(code, function (room) {
      assertHost(room, participantId);
      if (room.currentPlayer) {
        room.auctionLog.unshift({
          type: "cancel",
          playerName: room.currentPlayer.nome,
          at: new Date().toISOString()
        });
      }
      room.currentPlayer = null;
      room.currentBid = { amount: 0, bidderId: null };
      room.auctionLog = room.auctionLog.slice(0, 30);
      return room;
    });
  }

  function getInitials(name) {
    return String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) { return part.charAt(0).toUpperCase(); })
      .join("");
  }

  let toastTimeout;
  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    window.clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimeout = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 2400);
  }

  function listenForRoomChanges(callback) {
    function handleChange(event) {
      const session = getSession();
      if (!session) return;
      if (!event.detail || !event.detail.code || event.detail.code === session.code) {
        callback(getCurrentContext());
      }
    }

    window.addEventListener(ROOM_EVENT, handleChange);
    window.addEventListener("storage", function (event) {
      if (event.key === ROOMS_KEY) {
        callback(getCurrentContext());
      }
    });
  }

  function initHome() {
    const form = document.getElementById("join-room-form");
    if (!form) return;
    const codeInput = document.getElementById("room-code");
    const errorElement = document.getElementById("join-error");

    codeInput.addEventListener("input", function () {
      codeInput.value = normalizeCode(codeInput.value);
      errorElement.textContent = "";
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      errorElement.textContent = "";
      try {
        joinRoom(codeInput.value, document.getElementById("team-name").value);
        window.location.href = "stanza.html";
      } catch (error) {
        errorElement.textContent = error.message;
      }
    });
  }

  function initCreate() {
    const form = document.getElementById("create-room-form");
    if (!form) return;
    const errorElement = document.getElementById("create-error");

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      errorElement.textContent = "";
      const formData = new FormData(form);
      try {
        createRoom(Object.fromEntries(formData.entries()));
        window.location.href = "stanza.html";
      } catch (error) {
        errorElement.textContent = error.message;
      }
    });
  }

  window.addEventListener("DOMContentLoaded", function () {
    initHome();
    initCreate();
  });

  window.Fantasta = {
    ROOM_EVENT: ROOM_EVENT,
    ROLE_NAMES: ROLE_NAMES,
    ROLE_LIMIT_KEYS: ROLE_LIMIT_KEYS,
    normalizeCode: normalizeCode,
    createRoom: createRoom,
    joinRoom: joinRoom,
    getRoom: getRoom,
    saveRoom: saveRoom,
    updateRoom: updateRoom,
    getSession: getSession,
    getCurrentContext: getCurrentContext,
    requireCurrentContext: requireCurrentContext,
    startAuction: startAuction,
    fetchPlayers: fetchPlayers,
    getRandomPlayer: getRandomPlayer,
    selectPlayer: selectPlayer,
    placeBid: placeBid,
    assignPlayer: assignPlayer,
    cancelCurrentAuction: cancelCurrentAuction,
    getInitials: getInitials,
    showToast: showToast,
    listenForRoomChanges: listenForRoomChanges
  };
})();
