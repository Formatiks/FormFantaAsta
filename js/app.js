(function () {
  "use strict";

  const ROOMS_KEY = "fantasta.rooms.v1";
  const SESSION_KEY = "fantasta.session.v1";
  const ROOM_EVENT = "fantasta:room-change";
  const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const BID_DURATION_MS = 7000;
  let firebaseBackend = null;
  let firebaseInitializationError = null;
  let initializationPromise = null;
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

  function normalizeList(value) {
    if (Array.isArray(value)) {
      return value.filter(function (item) { return item !== null && item !== undefined; });
    }
    if (value && typeof value === "object") {
      return Object.keys(value).sort(function (left, right) {
        return Number(left) - Number(right);
      }).map(function (key) {
        return value[key];
      }).filter(function (item) {
        return item !== null && item !== undefined;
      });
    }
    return [];
  }

  function normalizeRoom(room) {
    if (!room || typeof room !== "object") return null;
    const normalizedRoom = clone(room);
    normalizedRoom.participants = normalizeList(normalizedRoom.participants);
    normalizedRoom.participants.forEach(function (participant) {
      participant.roster = participant.roster && typeof participant.roster === "object"
        ? participant.roster
        : {};
      Object.keys(ROLE_NAMES).forEach(function (role) {
        participant.roster[role] = normalizeList(participant.roster[role]);
      });
    });
    normalizedRoom.members = normalizedRoom.members && typeof normalizedRoom.members === "object"
      ? normalizedRoom.members
      : {};
    normalizedRoom.assignedPlayerIds = normalizeList(normalizedRoom.assignedPlayerIds);
    normalizedRoom.auctionLog = normalizeList(normalizedRoom.auctionLog);
    normalizedRoom.currentBid = Object.assign(
      { amount: 0, bidderId: null, expiresAt: null },
      normalizedRoom.currentBid || {}
    );
    return normalizedRoom;
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

  function writeRooms(rooms, changedCode, notify) {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
    if (notify !== false) {
      window.dispatchEvent(new CustomEvent(ROOM_EVENT, { detail: { code: changedCode } }));
    }
  }

  function cacheRoom(room, notify) {
    if (!room || !room.code) return null;
    const normalizedRoom = normalizeRoom(room);
    const rooms = readRooms();
    rooms[normalizedRoom.code] = normalizedRoom;
    writeRooms(rooms, normalizedRoom.code, notify);
    return clone(normalizedRoom);
  }

  function removeCachedRoom(code, notify) {
    const normalizedCode = normalizeCode(code);
    const rooms = readRooms();
    delete rooms[normalizedCode];
    writeRooms(rooms, normalizedCode, notify);
  }

  function initialize() {
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async function () {
      if (!window.FantastaFirebaseReady) return null;
      const result = await window.FantastaFirebaseReady;
      if (!result || !result.enabled) {
        firebaseInitializationError = result && result.error
          ? result.error
          : new Error("Firebase non disponibile.");
        return null;
      }

      firebaseBackend = result;
      const session = getSession();
      if (session) {
        try {
          const remoteRoom = await firebaseBackend.getRoom(session.code);
          if (remoteRoom) {
            cacheRoom(remoteRoom, false);
          } else {
            removeCachedRoom(session.code, false);
          }
        } catch (error) {
          firebaseInitializationError = error;
        }
      }

      return firebaseBackend;
    })();

    return initializationPromise;
  }

  async function requireFirebase() {
    await initialize();
    if (!firebaseBackend) {
      throw firebaseInitializationError || new Error("Firebase non disponibile.");
    }
    return firebaseBackend;
  }

  function getServerNow() {
    return firebaseBackend ? firebaseBackend.now() : Date.now();
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
    return room ? normalizeRoom(room) : null;
  }

  async function saveRoom(room) {
    if (!room || !room.code) {
      throw new Error("Stanza non valida.");
    }

    const backend = await requireFirebase();
    const normalizedRoom = normalizeRoom(room);
    normalizedRoom.updatedAt = new Date(getServerNow()).toISOString();
    const savedRoom = await backend.createRoom(normalizedRoom);
    if (!savedRoom) return null;
    return cacheRoom(savedRoom);
  }

  async function updateRoom(code, updater) {
    const normalizedCode = normalizeCode(code);
    const backend = await requireFirebase();
    const updatedRoom = await backend.updateRoom(normalizedCode, function (room) {
      const currentRoom = normalizeRoom(room);
      const nextRoom = normalizeRoom(updater(clone(currentRoom)) || currentRoom);
      nextRoom.revision = (currentRoom.revision || 0) + 1;
      nextRoom.updatedAt = new Date(getServerNow()).toISOString();
      return nextRoom;
    });
    return cacheRoom(updatedRoom);
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

  function createParticipant(name, credits, isHost, ownerUid) {
    return {
      id: createId(),
      ownerUid: ownerUid,
      name: name,
      credits: credits,
      isHost: Boolean(isHost),
      joinedAt: new Date(getServerNow()).toISOString(),
      roster: { P: [], D: [], C: [], A: [] }
    };
  }

  async function createRoom(configuration) {
    const backend = await requireFirebase();
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

    const host = createParticipant(hostTeamName, initialCredits, true, backend.uid);
    let savedRoom = null;

    for (let attempt = 0; attempt < 12 && !savedRoom; attempt += 1) {
      const now = new Date(getServerNow()).toISOString();
      const room = {
        code: generateRoomCode(),
        leagueName: leagueName,
        status: "lobby",
        createdAt: now,
        updatedAt: now,
        revision: 1,
        hostId: host.id,
        hostUid: backend.uid,
        members: { [backend.uid]: true },
        settings: Object.assign({
          participantsCount: participantsCount,
          initialCredits: initialCredits
        }, rosterLimits),
        participants: [host],
        currentPlayer: null,
        currentBid: { amount: 0, bidderId: null, expiresAt: null },
        assignedPlayerIds: [],
        auctionLog: []
      };
      savedRoom = await saveRoom(room);
    }

    if (!savedRoom) {
      throw new Error("Non è stato possibile generare un codice stanza. Riprova.");
    }

    setSession(savedRoom.code, host.id);
    return clone(savedRoom);
  }

  async function joinRoom(code, teamName) {
    const backend = await requireFirebase();
    const normalizedCode = normalizeCode(code);
    const cleanedTeamName = cleanName(teamName, "Il nome della squadra");
    const existingRoom = await backend.getRoom(normalizedCode);

    if (!existingRoom) {
      throw new Error("Codice stanza non trovato.");
    }
    cacheRoom(existingRoom, false);

    const participant = createParticipant(
      cleanedTeamName,
      existingRoom.settings.initialCredits,
      false,
      backend.uid
    );
    const room = await updateRoom(normalizedCode, function (draft) {
      if (draft.status !== "lobby") {
        throw new Error("Questa asta è già iniziata.");
      }
      if (draft.participants.length >= draft.settings.participantsCount) {
        throw new Error("La stanza è al completo.");
      }
      if (draft.participants.some(function (item) {
        return item.name.toLowerCase() === cleanedTeamName.toLowerCase();
      })) {
        throw new Error("Questo nome squadra è già in uso.");
      }

      draft.participants.push(participant);
      draft.members = draft.members || {};
      draft.members[backend.uid] = true;
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
      room.auctionLog.unshift({ type: "start", at: new Date(getServerNow()).toISOString() });
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
      room.currentBid = { amount: 0, bidderId: null, expiresAt: null };
      room.auctionLog.unshift({ type: "draw", playerName: player.nome, at: new Date(getServerNow()).toISOString() });
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

      const role = room.currentPlayer.ruolo;
      const limitKey = ROLE_LIMIT_KEYS[role];
      const roleLimit = room.settings[limitKey];
      if (!participant.roster[role] || participant.roster[role].length >= roleLimit) {
        throw new Error(`Hai già completato il reparto ${ROLE_NAMES[role].toLowerCase()}.`);
      }

      room.currentBid = {
        amount: bidAmount,
        bidderId: participantId,
        expiresAt: getServerNow() + BID_DURATION_MS
      };
      room.auctionLog.unshift({
        type: "bid",
        participantName: participant.name,
        amount: bidAmount,
        playerName: room.currentPlayer.nome,
        at: new Date(getServerNow()).toISOString()
      });
      room.auctionLog = room.auctionLog.slice(0, 30);
      return room;
    });
  }

  function assignPlayer(code, participantId, expectedExpiresAt) {
    return updateRoom(code, function (room) {
      assertHost(room, participantId);
      if (!room.currentPlayer || !room.currentBid.bidderId) {
        throw new Error("Serve almeno un'offerta prima dell'aggiudicazione.");
      }
      if (
        Number(expectedExpiresAt) !== Number(room.currentBid.expiresAt) ||
        getServerNow() < Number(room.currentBid.expiresAt)
      ) {
        throw new Error("L'offerta è cambiata: il conto alla rovescia riparte.");
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
        at: new Date(getServerNow()).toISOString()
      });
      room.auctionLog = room.auctionLog.slice(0, 30);
      room.currentPlayer = null;
      room.currentBid = { amount: 0, bidderId: null, expiresAt: null };
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
          at: new Date(getServerNow()).toISOString()
        });
      }
      room.currentPlayer = null;
      room.currentBid = { amount: 0, bidderId: null, expiresAt: null };
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
    const session = getSession();
    if (firebaseBackend && session) {
      return firebaseBackend.listenRoom(
        session.code,
        function (room) {
          if (room) {
            cacheRoom(room, false);
          } else {
            removeCachedRoom(session.code, false);
          }
          callback(getCurrentContext());
        },
        function (error) {
          showToast(error.message);
        }
      );
    }

    function handleChange(event) {
      const currentSession = getSession();
      if (!currentSession) return;
      if (!event.detail || !event.detail.code || event.detail.code === currentSession.code) {
        callback(getCurrentContext());
      }
    }

    window.addEventListener(ROOM_EVENT, handleChange);
    window.addEventListener("storage", function (event) {
      if (event.key === ROOMS_KEY) {
        callback(getCurrentContext());
      }
    });

    return function () {
      window.removeEventListener(ROOM_EVENT, handleChange);
    };
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

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      errorElement.textContent = "";
      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      try {
        await joinRoom(codeInput.value, document.getElementById("team-name").value);
        window.location.href = "stanza.html";
      } catch (error) {
        errorElement.textContent = error.message;
        submitButton.disabled = false;
      }
    });
  }

  function initCreate() {
    const form = document.getElementById("create-room-form");
    if (!form) return;
    const errorElement = document.getElementById("create-error");

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      errorElement.textContent = "";
      const formData = new FormData(form);
      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      try {
        await createRoom(Object.fromEntries(formData.entries()));
        window.location.href = "stanza.html";
      } catch (error) {
        errorElement.textContent = error.message;
        submitButton.disabled = false;
      }
    });
  }

  window.addEventListener("DOMContentLoaded", function () {
    initialize();
    initHome();
    initCreate();
  });

  window.Fantasta = {
    ROOM_EVENT: ROOM_EVENT,
    BID_DURATION_MS: BID_DURATION_MS,
    ROLE_NAMES: ROLE_NAMES,
    ROLE_LIMIT_KEYS: ROLE_LIMIT_KEYS,
    initialize: initialize,
    isRealtimeEnabled: function () { return Boolean(firebaseBackend); },
    getServerNow: getServerNow,
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
