(function () {
  "use strict";

  let players = [];
  let renderedPlayerId = null;
  let previousPrice = null;
  let previousBidderId = null;
  let countdownInterval = null;
  let autoAssignTimeout = null;
  let scheduledExpiry = null;
  let autoAdvanceInProgress = false;

  const TEAM_LOGOS = Object.freeze({
    Atalanta: "https://content.fantacalcio.it/web/img/team/ico/atalanta2026.png",
    Bologna: "https://content.fantacalcio.it/web/img/team/ico/bolognanew.png",
    Cagliari: "https://content.fantacalcio.it/web/img/team/ico/cagliari.png",
    Como: "https://content.fantacalcio.it/web/img/team/ico/como_2024.png",
    Fiorentina: "https://content.fantacalcio.it/web/img/team/ico/fiorentina2022.png",
    Frosinone: "https://content.fantacalcio.it/web/img/team/ico/frosinone.png",
    Genoa: "https://content.fantacalcio.it/web/img/team/ico/genoa_new.png",
    Inter: "https://content.fantacalcio.it/web/img/team/ico/inter2021.png",
    Juventus: "https://content.fantacalcio.it/web/img/team/ico/juventus_2024.png",
    Lazio: "https://content.fantacalcio.it/web/img/team/ico/lazio.png",
    Lecce: "https://content.fantacalcio.it/web/img/team/ico/lecce.png",
    Milan: "https://content.fantacalcio.it/web/img/team/ico/milan.png",
    Monza: "https://content.fantacalcio.it/web/img/team/ico/monza_2024.png",
    Napoli: "https://content.fantacalcio.it/web/img/team/ico/napoli_2024_new.png",
    Parma: "https://content.fantacalcio.it/web/img/team/ico/parma.png",
    Roma: "https://content.fantacalcio.it/web/img/team/ico/roma.png",
    Sassuolo: "https://content.fantacalcio.it/web/img/team/ico/sassuolooriginal.png",
    Torino: "https://content.fantacalcio.it/web/img/team/ico/torino.png",
    Udinese: "https://content.fantacalcio.it/web/img/team/ico/udinese.png",
    Venezia: "https://content.fantacalcio.it/web/img/team/ico/venezia_2026.png"
  });

  const elements = {
    league: document.getElementById("auction-league"),
    code: document.getElementById("auction-code"),
    credits: document.getElementById("my-credits"),
    stage: document.getElementById("auction-stage"),
    visual: document.getElementById("player-visual"),
    image: document.getElementById("player-image"),
    fallback: document.getElementById("player-fallback"),
    heading: document.getElementById("player-heading"),
    role: document.getElementById("player-role"),
    team: document.getElementById("player-team"),
    teamLogo: document.getElementById("player-team-logo"),
    name: document.getElementById("player-name"),
    quotation: document.getElementById("player-quotation"),
    empty: document.getElementById("empty-auction"),
    emptyMessage: document.getElementById("empty-message"),
    bidArea: document.getElementById("bid-area"),
    price: document.getElementById("current-price"),
    bidder: document.getElementById("highest-bidder"),
    countdown: document.getElementById("auction-countdown"),
    countdownSeconds: document.getElementById("countdown-seconds"),
    bidFeedback: document.getElementById("bid-feedback"),
    hostPanel: document.getElementById("host-panel"),
    draw: document.getElementById("draw-player"),
    cancel: document.getElementById("cancel-auction"),
    next: document.getElementById("next-player"),
    ticker: document.getElementById("auction-ticker"),
    customOpen: document.getElementById("custom-bid-open"),
    customDialog: document.getElementById("custom-bid-dialog"),
    customForm: document.getElementById("custom-bid-form"),
    customAmount: document.getElementById("custom-bid-amount"),
    customError: document.getElementById("custom-bid-error")
  };

  function restartAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  function renderTeamLogo(team) {
    if (!elements.teamLogo) return;
    const teamLogo = TEAM_LOGOS[team];
    elements.teamLogo.hidden = true;
    elements.teamLogo.alt = `Stemma ${team}`;
    elements.teamLogo.onload = function () {
      elements.teamLogo.hidden = false;
    };
    elements.teamLogo.onerror = function () {
      elements.teamLogo.hidden = true;
    };
    if (teamLogo) {
      elements.teamLogo.src = teamLogo;
    } else {
      elements.teamLogo.removeAttribute("src");
    }
  }

  function clearBidTimer() {
    window.clearInterval(countdownInterval);
    window.clearTimeout(autoAssignTimeout);
    countdownInterval = null;
    autoAssignTimeout = null;
    scheduledExpiry = null;
    elements.countdown.hidden = true;
    elements.countdown.classList.remove("is-urgent");
    elements.stage.classList.remove(
      "is-closing",
      "closing-level-1",
      "closing-level-2",
      "closing-level-3",
      "closing-level-4"
    );
    document.body.classList.remove(
      "panic-level-1",
      "panic-level-2",
      "panic-level-3",
      "panic-level-4"
    );
  }

  function paintBidCountdown(expiresAt) {
    const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Fantasta.getServerNow()) / 1000));
    elements.countdownSeconds.textContent = String(remainingSeconds);
    elements.countdown.hidden = false;
    elements.countdown.classList.toggle("is-urgent", remainingSeconds <= 4);
    elements.stage.classList.remove(
      "is-closing",
      "closing-level-1",
      "closing-level-2",
      "closing-level-3",
      "closing-level-4"
    );
    document.body.classList.remove(
      "panic-level-1",
      "panic-level-2",
      "panic-level-3",
      "panic-level-4"
    );
    if (remainingSeconds <= 4) {
      const closingLevel = remainingSeconds <= 1 ? 4 : 5 - remainingSeconds;
      elements.stage.classList.add("is-closing", `closing-level-${closingLevel}`);
      document.body.classList.add(`panic-level-${closingLevel}`);
    }
  }

  async function finalizeExpiredBid(roomCode, playerId, expiresAt) {
    if (autoAdvanceInProgress) return;

    const context = Fantasta.getCurrentContext();
    if (!context || !context.participant.isHost || context.room.code !== roomCode) return;

    const currentBid = context.room.currentBid || {};
    if (
      !context.room.currentPlayer ||
      context.room.currentPlayer.id !== playerId ||
      Number(currentBid.expiresAt) !== expiresAt
    ) {
      syncBidTimer(context);
      return;
    }

    if (Fantasta.getServerNow() < expiresAt) {
      autoAssignTimeout = window.setTimeout(function () {
        finalizeExpiredBid(roomCode, playerId, expiresAt);
      }, expiresAt - Fantasta.getServerNow() + 25);
      return;
    }

    autoAdvanceInProgress = true;
    const playerName = context.room.currentPlayer.nome;
    const winner = context.room.participants.find(function (participant) {
      return participant.id === currentBid.bidderId;
    });

    try {
      await Fantasta.assignPlayer(roomCode, context.participant.id, expiresAt);
      if (!players.length) {
        players = await Fantasta.fetchPlayers();
      }

      const updatedContext = Fantasta.getCurrentContext();
      const nextPlayer = updatedContext
        ? Fantasta.getRandomPlayer(updatedContext.room, players, playerId)
        : null;

      if (updatedContext && nextPlayer) {
        await Fantasta.selectPlayer(roomCode, updatedContext.participant.id, nextPlayer);
      }

      Fantasta.showToast(`${playerName} aggiudicato a ${winner ? winner.name : "chi ha offerto"}`);
    } catch (error) {
      clearBidTimer();
      Fantasta.showToast(error.message);
      window.setTimeout(function () {
        syncBidTimer(Fantasta.getCurrentContext());
      }, 150);
    } finally {
      autoAdvanceInProgress = false;
    }
  }

  function syncBidTimer(context) {
    const room = context && context.room;
    const currentBid = room && room.currentBid;
    const expiresAt = Number(currentBid && currentBid.expiresAt);

    if (!room || !room.currentPlayer || !currentBid.bidderId || !expiresAt) {
      clearBidTimer();
      return;
    }

    paintBidCountdown(expiresAt);
    if (scheduledExpiry === expiresAt) return;

    window.clearInterval(countdownInterval);
    window.clearTimeout(autoAssignTimeout);
    scheduledExpiry = expiresAt;
    countdownInterval = window.setInterval(function () {
      paintBidCountdown(expiresAt);
    }, 200);

    if (context.participant.isHost) {
      autoAssignTimeout = window.setTimeout(function () {
        finalizeExpiredBid(room.code, room.currentPlayer.id, expiresAt);
      }, Math.max(0, expiresAt - Fantasta.getServerNow()) + 25);
    }
  }

  function renderPlayer(player) {
    const isNewPlayer = renderedPlayerId !== player.id;
    elements.empty.hidden = true;
    elements.heading.hidden = false;
    elements.bidArea.hidden = false;
    elements.role.textContent = player.ruolo;
    elements.role.dataset.role = player.ruolo;
    elements.team.textContent = player.squadra;
    elements.name.textContent = player.nome;
    elements.quotation.textContent = `Quotazione ${player.quotazione}`;
    elements.fallback.querySelector("span").textContent = Fantasta.getInitials(player.nome);

    if (isNewPlayer) {
      renderedPlayerId = player.id;
      renderTeamLogo(player.squadra);
      elements.image.hidden = true;
      elements.image.alt = `Ritratto di ${player.nome}`;
      elements.image.onload = function () {
        elements.image.hidden = false;
      };
      elements.image.onerror = function () {
        elements.image.hidden = true;
      };
      elements.image.src = player.foto;
      restartAnimation(elements.heading, "player-heading");
    }
  }

  function renderEmpty(isHost) {
    renderedPlayerId = null;
    previousPrice = null;
    previousBidderId = null;
    elements.image.hidden = true;
    elements.image.removeAttribute("src");
    if (elements.teamLogo) {
      elements.teamLogo.hidden = true;
      elements.teamLogo.removeAttribute("src");
    }
    elements.heading.hidden = true;
    elements.bidArea.hidden = true;
    elements.empty.hidden = false;
    elements.emptyMessage.textContent = isHost
      ? "Usa Estrai giocatore per dare il via alla prossima chiamata."
      : "L'host estrarrà un calciatore tra poco.";
  }

  function renderBid(room, participant) {
    const currentBid = room.currentBid;
    const bidder = room.participants.find(function (item) { return item.id === currentBid.bidderId; });

    if (previousPrice !== null && previousPrice !== currentBid.amount) {
      restartAnimation(elements.price, "bump");
    }
    elements.price.textContent = currentBid.amount;
    previousPrice = currentBid.amount;

    if (bidder) {
      elements.bidder.textContent = bidder.id === participant.id
        ? "La tua squadra sta vincendo"
        : `${bidder.name} sta vincendo`;
    } else {
      elements.bidder.textContent = "Base d'asta 0 · nessuna offerta";
    }

    if (previousBidderId !== null && previousBidderId !== currentBid.bidderId) {
      restartAnimation(elements.bidder, "changed");
    }
    previousBidderId = currentBid.bidderId;

    const isHighestBidder = currentBid.bidderId === participant.id;
    document.querySelectorAll("[data-increment]").forEach(function (button) {
      const nextAmount = currentBid.amount + Number(button.dataset.increment);
      button.disabled = isHighestBidder || nextAmount > participant.credits;
    });
    elements.customOpen.disabled = isHighestBidder || participant.credits <= currentBid.amount;
  }

  function renderTicker(room) {
    const event = room.auctionLog && room.auctionLog[0];
    if (!event) {
      elements.ticker.textContent = "Asta sincronizzata in tempo reale su questo browser.";
      return;
    }

    const messages = {
      start: "L'asta è iniziata. Che vinca il migliore.",
      draw: `${event.playerName} è il nuovo giocatore all'asta.`,
      bid: `${event.participantName} offre ${event.amount} per ${event.playerName}.`,
      assign: `${event.playerName} va a ${event.participantName} per ${event.amount} crediti.`,
      cancel: `La chiamata per ${event.playerName} è stata annullata.`
    };
    elements.ticker.textContent = messages[event.type] || "Asta aggiornata.";
  }

  function render(context) {
    if (!context) {
      window.location.replace("index.html");
      return;
    }
    if (context.room.status === "lobby") {
      window.location.replace("stanza.html");
      return;
    }

    const room = context.room;
    const participant = context.participant;
    document.title = `${room.leagueName} · Asta — FANTASTA`;
    elements.league.textContent = room.leagueName;
    elements.code.textContent = room.code;
    elements.credits.textContent = participant.credits;
    elements.hostPanel.hidden = !participant.isHost;

    if (room.currentPlayer) {
      renderPlayer(room.currentPlayer);
      renderBid(room, participant);
    } else {
      renderEmpty(participant.isHost);
    }

    elements.draw.hidden = Boolean(room.currentPlayer);
    elements.cancel.hidden = !room.currentPlayer;
    elements.next.hidden = !room.currentPlayer;
    syncBidTimer(context);
    renderTicker(room);
  }

  async function drawPlayer(excludedId) {
    const context = Fantasta.getCurrentContext();
    if (!context) return;
    if (!players.length) {
      Fantasta.showToast("Elenco giocatori non ancora disponibile");
      return;
    }

    const player = Fantasta.getRandomPlayer(context.room, players, excludedId);
    if (!player) {
      Fantasta.showToast("Tutti i giocatori disponibili sono stati assegnati");
      return;
    }

    try {
      await Fantasta.selectPlayer(context.room.code, context.participant.id, player);
    } catch (error) {
      Fantasta.showToast(error.message);
    }
  }

  async function placeIncrementBid(increment) {
    const context = Fantasta.getCurrentContext();
    if (!context || !context.room.currentPlayer) return;
    const amount = context.room.currentBid.amount + Number(increment);
    try {
      await Fantasta.placeBid(context.room.code, context.participant.id, amount);
      elements.bidFeedback.textContent = "";
    } catch (error) {
      elements.bidFeedback.textContent = error.message;
    }
  }

  async function cancelCurrentPlayer() {
    const context = Fantasta.getCurrentContext();
    if (!context) return;
    try {
      await Fantasta.cancelCurrentAuction(context.room.code, context.participant.id);
      Fantasta.showToast("Chiamata annullata");
    } catch (error) {
      Fantasta.showToast(error.message);
    }
  }

  async function moveToNextPlayer() {
    const context = Fantasta.getCurrentContext();
    if (!context || !context.room.currentPlayer) return;
    const previousPlayerId = context.room.currentPlayer.id;
    const nextPlayer = Fantasta.getRandomPlayer(context.room, players, previousPlayerId);
    if (!nextPlayer) {
      Fantasta.showToast("Non ci sono altri giocatori disponibili");
      return;
    }

    try {
      await Fantasta.cancelCurrentAuction(context.room.code, context.participant.id);
      await Fantasta.selectPlayer(context.room.code, context.participant.id, nextPlayer);
    } catch (error) {
      Fantasta.showToast(error.message);
    }
  }

  function openCustomBid() {
    const context = Fantasta.getCurrentContext();
    if (!context || !context.room.currentPlayer) return;
    elements.customError.textContent = "";
    elements.customAmount.min = String(context.room.currentBid.amount + 1);
    elements.customAmount.max = String(context.participant.credits);
    elements.customAmount.value = String(context.room.currentBid.amount + 1);
    elements.customDialog.showModal();
    elements.customAmount.select();
  }

  async function submitCustomBid(event) {
    event.preventDefault();
    if (event.submitter && event.submitter.value === "cancel") {
      elements.customDialog.close();
      return;
    }

    const context = Fantasta.getCurrentContext();
    if (!context) return;
    try {
      await Fantasta.placeBid(context.room.code, context.participant.id, Number(elements.customAmount.value));
      elements.customDialog.close();
      elements.customError.textContent = "";
    } catch (error) {
      elements.customError.textContent = error.message;
    }
  }

  window.addEventListener("DOMContentLoaded", async function () {
    await Fantasta.initialize();
    const context = Fantasta.requireCurrentContext();
    if (!context) return;
    render(context);
    Fantasta.listenForRoomChanges(render);

    document.querySelectorAll("[data-increment]").forEach(function (button) {
      button.addEventListener("click", function () { placeIncrementBid(button.dataset.increment); });
    });
    elements.draw.addEventListener("click", function () { drawPlayer(); });
    elements.cancel.addEventListener("click", cancelCurrentPlayer);
    elements.next.addEventListener("click", moveToNextPlayer);
    elements.customOpen.addEventListener("click", openCustomBid);
    elements.customForm.addEventListener("submit", submitCustomBid);

    try {
      players = await Fantasta.fetchPlayers();
      elements.draw.disabled = false;
    } catch (error) {
      elements.draw.disabled = true;
      Fantasta.showToast(error.message);
      elements.ticker.textContent = "Avvia il sito con un server locale per caricare i giocatori.";
    }
  });

  window.addEventListener("pagehide", clearBidTimer);
})();
