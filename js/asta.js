(function () {
  "use strict";

  let players = [];
  let renderedPlayerId = null;
  let previousPrice = null;
  let previousBidderId = null;

  const elements = {
    league: document.getElementById("auction-league"),
    code: document.getElementById("auction-code"),
    credits: document.getElementById("my-credits"),
    visual: document.getElementById("player-visual"),
    image: document.getElementById("player-image"),
    fallback: document.getElementById("player-fallback"),
    club: document.getElementById("player-club"),
    heading: document.getElementById("player-heading"),
    role: document.getElementById("player-role"),
    team: document.getElementById("player-team"),
    name: document.getElementById("player-name"),
    quotation: document.getElementById("player-quotation"),
    empty: document.getElementById("empty-auction"),
    emptyMessage: document.getElementById("empty-message"),
    bidArea: document.getElementById("bid-area"),
    price: document.getElementById("current-price"),
    bidder: document.getElementById("highest-bidder"),
    bidFeedback: document.getElementById("bid-feedback"),
    hostPanel: document.getElementById("host-panel"),
    draw: document.getElementById("draw-player"),
    assign: document.getElementById("assign-player"),
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

  function renderPlayer(player) {
    const isNewPlayer = renderedPlayerId !== player.id;
    elements.empty.hidden = true;
    elements.heading.hidden = false;
    elements.bidArea.hidden = false;
    elements.club.textContent = player.squadra;
    elements.role.textContent = player.ruolo;
    elements.role.dataset.role = player.ruolo;
    elements.team.textContent = player.squadra;
    elements.name.textContent = player.nome;
    elements.quotation.textContent = `Quotazione ${player.quotazione}`;
    elements.fallback.querySelector("span").textContent = Fantasta.getInitials(player.nome);

    if (isNewPlayer) {
      renderedPlayerId = player.id;
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
    elements.club.textContent = "Serie A";
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
      elements.bidder.textContent = "Base d'asta · nessuna offerta";
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
    elements.assign.hidden = !room.currentPlayer;
    elements.cancel.hidden = !room.currentPlayer;
    elements.next.hidden = !room.currentPlayer;
    elements.assign.disabled = !room.currentBid.bidderId;
    renderTicker(room);
  }

  function drawPlayer(excludedId) {
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
      Fantasta.selectPlayer(context.room.code, context.participant.id, player);
    } catch (error) {
      Fantasta.showToast(error.message);
    }
  }

  function placeIncrementBid(increment) {
    const context = Fantasta.getCurrentContext();
    if (!context || !context.room.currentPlayer) return;
    const amount = context.room.currentBid.amount + Number(increment);
    try {
      Fantasta.placeBid(context.room.code, context.participant.id, amount);
      elements.bidFeedback.textContent = "";
    } catch (error) {
      elements.bidFeedback.textContent = error.message;
    }
  }

  function assignCurrentPlayer() {
    const context = Fantasta.getCurrentContext();
    if (!context) return;
    try {
      Fantasta.assignPlayer(context.room.code, context.participant.id);
      Fantasta.showToast("Giocatore aggiudicato");
    } catch (error) {
      Fantasta.showToast(error.message);
    }
  }

  function cancelCurrentPlayer() {
    const context = Fantasta.getCurrentContext();
    if (!context) return;
    try {
      Fantasta.cancelCurrentAuction(context.room.code, context.participant.id);
      Fantasta.showToast("Chiamata annullata");
    } catch (error) {
      Fantasta.showToast(error.message);
    }
  }

  function moveToNextPlayer() {
    const context = Fantasta.getCurrentContext();
    if (!context || !context.room.currentPlayer) return;
    const previousPlayerId = context.room.currentPlayer.id;
    const nextPlayer = Fantasta.getRandomPlayer(context.room, players, previousPlayerId);
    if (!nextPlayer) {
      Fantasta.showToast("Non ci sono altri giocatori disponibili");
      return;
    }

    try {
      Fantasta.cancelCurrentAuction(context.room.code, context.participant.id);
      Fantasta.selectPlayer(context.room.code, context.participant.id, nextPlayer);
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

  function submitCustomBid(event) {
    event.preventDefault();
    if (event.submitter && event.submitter.value === "cancel") {
      elements.customDialog.close();
      return;
    }

    const context = Fantasta.getCurrentContext();
    if (!context) return;
    try {
      Fantasta.placeBid(context.room.code, context.participant.id, Number(elements.customAmount.value));
      elements.customDialog.close();
      elements.customError.textContent = "";
    } catch (error) {
      elements.customError.textContent = error.message;
    }
  }

  window.addEventListener("DOMContentLoaded", async function () {
    const context = Fantasta.requireCurrentContext();
    if (!context) return;
    render(context);
    Fantasta.listenForRoomChanges(render);

    document.querySelectorAll("[data-increment]").forEach(function (button) {
      button.addEventListener("click", function () { placeIncrementBid(button.dataset.increment); });
    });
    elements.draw.addEventListener("click", function () { drawPlayer(); });
    elements.assign.addEventListener("click", assignCurrentPlayer);
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
})();
