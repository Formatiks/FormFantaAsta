(function () {
  "use strict";

  const leagueNameElement = document.getElementById("league-name");
  const roomCodeElement = document.getElementById("room-code");
  const participantListElement = document.getElementById("participant-list");
  const participantCounterElement = document.getElementById("participants-counter");
  const hostControlsElement = document.getElementById("host-controls");
  const guestWaitingElement = document.getElementById("guest-waiting");
  const roomRulesElement = document.getElementById("room-rules");

  function renderParticipants(room) {
    participantListElement.replaceChildren();

    room.participants.forEach(function (participant, index) {
      const item = document.createElement("li");
      item.className = "participant-item";
      item.style.animationDelay = `${index * 45}ms`;

      const avatar = document.createElement("span");
      avatar.className = "participant-avatar";
      avatar.textContent = Fantasta.getInitials(participant.name);

      const info = document.createElement("span");
      info.className = "participant-info";
      const name = document.createElement("strong");
      name.textContent = participant.name;
      const status = document.createElement("span");
      status.textContent = "Connesso · " + participant.credits + " crediti";
      info.append(name, status);
      item.append(avatar, info);

      if (participant.isHost) {
        const hostBadge = document.createElement("span");
        hostBadge.className = "host-badge";
        hostBadge.textContent = "Host";
        item.append(hostBadge);
      }

      participantListElement.append(item);
    });

    const freeSlots = Math.max(0, room.settings.participantsCount - room.participants.length);
    const displayedFreeSlots = Math.min(freeSlots, 3);
    for (let index = 0; index < displayedFreeSlots; index += 1) {
      const slot = document.createElement("li");
      slot.className = "participant-slot";
      const avatar = document.createElement("span");
      avatar.className = "slot-avatar";
      const text = document.createElement("span");
      text.textContent = "Posto disponibile";
      slot.append(avatar, text);
      participantListElement.append(slot);
    }

    if (freeSlots > displayedFreeSlots) {
      const remaining = document.createElement("li");
      remaining.className = "participant-slot";
      remaining.textContent = `Altri ${freeSlots - displayedFreeSlots} posti disponibili`;
      participantListElement.append(remaining);
    }
  }

  function renderRules(room) {
    const rules = [
      `${room.settings.initialCredits} crediti`,
      `${room.settings.goalkeepers} portieri`,
      `${room.settings.defenders} difensori`,
      `${room.settings.midfielders} centrocampisti`,
      `${room.settings.forwards} attaccanti`
    ];
    roomRulesElement.replaceChildren();
    rules.forEach(function (rule) {
      const chip = document.createElement("span");
      chip.className = "rule-chip";
      chip.textContent = rule;
      roomRulesElement.append(chip);
    });
  }

  function render(context) {
    if (!context) {
      window.location.replace("index.html");
      return;
    }

    const room = context.room;
    if (room.status === "auction") {
      window.location.replace("asta.html");
      return;
    }

    document.title = `${room.leagueName} — FANTASTA`;
    leagueNameElement.textContent = room.leagueName;
    roomCodeElement.textContent = room.code;
    participantCounterElement.textContent = `${room.participants.length} / ${room.settings.participantsCount}`;
    hostControlsElement.hidden = !context.participant.isHost;
    guestWaitingElement.hidden = context.participant.isHost;
    renderParticipants(room);
    renderRules(room);
  }

  function copyRoomCode() {
    const context = Fantasta.getCurrentContext();
    if (!context) return;
    navigator.clipboard.writeText(context.room.code)
      .then(function () { Fantasta.showToast("Codice copiato"); })
      .catch(function () { Fantasta.showToast(`Codice: ${context.room.code}`); });
  }

  async function shareRoom() {
    const context = Fantasta.getCurrentContext();
    if (!context) return;
    const shareData = {
      title: `Asta ${context.room.leagueName}`,
      text: `Entra nella mia asta FANTASTA con il codice ${context.room.code}`
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if (error.name !== "AbortError") copyRoomCode();
      }
    } else {
      copyRoomCode();
    }
  }

  function beginAuction() {
    const context = Fantasta.getCurrentContext();
    if (!context) return;
    try {
      Fantasta.startAuction(context.room.code, context.participant.id);
      window.location.href = "asta.html";
    } catch (error) {
      Fantasta.showToast(error.message);
    }
  }

  window.addEventListener("DOMContentLoaded", function () {
    const context = Fantasta.requireCurrentContext();
    if (!context) return;
    render(context);
    document.getElementById("copy-code").addEventListener("click", copyRoomCode);
    document.getElementById("copy-code-button").addEventListener("click", copyRoomCode);
    document.getElementById("share-room").addEventListener("click", shareRoom);
    document.getElementById("start-auction").addEventListener("click", beginAuction);
    Fantasta.listenForRoomChanges(render);
  });
})();
