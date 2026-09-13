(function () {
  "use strict";

  const roleOrder = ["P", "D", "C", "A"];
  const elements = {
    league: document.getElementById("roster-league"),
    code: document.getElementById("roster-code"),
    teams: document.getElementById("summary-teams"),
    players: document.getElementById("summary-players"),
    spent: document.getElementById("summary-spent"),
    grid: document.getElementById("rosters-grid")
  };

  function createPlayerRow(player) {
    const item = document.createElement("li");
    item.className = "roster-player";
    const name = document.createElement("strong");
    name.textContent = player.nome;
    const price = document.createElement("span");
    price.textContent = `${player.purchasePrice} cr`;
    item.append(name, price);
    return item;
  }

  function createRoleSection(role, players, limit) {
    const section = document.createElement("section");
    section.className = "roster-role";
    const heading = document.createElement("div");
    heading.className = "roster-role-heading";
    const title = document.createElement("span");
    title.textContent = Fantasta.ROLE_NAMES[role];
    const count = document.createElement("span");
    count.textContent = `${players.length} / ${limit}`;
    heading.append(title, count);
    section.append(heading);

    if (!players.length) {
      const empty = document.createElement("div");
      empty.className = "roster-empty";
      empty.textContent = "Nessun giocatore acquistato";
      section.append(empty);
      return section;
    }

    const list = document.createElement("ul");
    list.className = "roster-player-list";
    players.forEach(function (player) { list.append(createPlayerRow(player)); });
    section.append(list);
    return section;
  }

  function createRosterCard(participant, room, currentParticipantId, index) {
    const card = document.createElement("article");
    card.className = "glass-card roster-card" + (participant.id === currentParticipantId ? " is-me" : "");
    card.style.animationDelay = `${index * 55}ms`;

    const header = document.createElement("header");
    header.className = "roster-header";
    const teamInfo = document.createElement("div");
    const teamName = document.createElement("h2");
    teamName.textContent = participant.name;
    const teamMeta = document.createElement("p");
    const playerCount = roleOrder.reduce(function (total, role) {
      return total + participant.roster[role].length;
    }, 0);
    teamMeta.textContent = `${playerCount} giocatori${participant.id === currentParticipantId ? " · La tua squadra" : ""}`;
    teamInfo.append(teamName, teamMeta);

    const credit = document.createElement("div");
    credit.className = "roster-credit";
    const creditValue = document.createElement("strong");
    creditValue.textContent = participant.credits;
    const creditLabel = document.createElement("span");
    creditLabel.textContent = "crediti";
    credit.append(creditValue, creditLabel);
    header.append(teamInfo, credit);

    const roles = document.createElement("div");
    roles.className = "roster-roles";
    roleOrder.forEach(function (role) {
      const limitKey = Fantasta.ROLE_LIMIT_KEYS[role];
      roles.append(createRoleSection(role, participant.roster[role], room.settings[limitKey]));
    });
    card.append(header, roles);
    return card;
  }

  function render(context) {
    if (!context) {
      window.location.replace("index.html");
      return;
    }

    const room = context.room;
    document.title = `${room.leagueName} · Rose — FANTASTA`;
    elements.league.textContent = room.leagueName;
    elements.code.textContent = room.code;
    elements.teams.textContent = room.participants.length;
    elements.players.textContent = room.assignedPlayerIds.length;
    elements.spent.textContent = room.participants.reduce(function (total, participant) {
      return total + room.settings.initialCredits - participant.credits;
    }, 0);

    elements.grid.replaceChildren();
    room.participants.forEach(function (participant, index) {
      elements.grid.append(createRosterCard(participant, room, context.participant.id, index));
    });
  }

  window.addEventListener("DOMContentLoaded", async function () {
    await Fantasta.initialize();
    const context = Fantasta.requireCurrentContext();
    if (!context) return;
    render(context);
    Fantasta.listenForRoomChanges(render);
  });
})();
