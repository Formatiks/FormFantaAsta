import { writeFile } from "node:fs/promises";

const SOURCE_URL = "https://www.fantacalcio.it/quotazioni-fantacalcio/2026-27";
const OUTPUT_PATH = new URL("../data/giocatori.json", import.meta.url);
const TEAM_NAMES = {
  ATA: "Atalanta",
  BOL: "Bologna",
  CAG: "Cagliari",
  COM: "Como",
  FIO: "Fiorentina",
  FRO: "Frosinone",
  GEN: "Genoa",
  INT: "Inter",
  JUV: "Juventus",
  LAZ: "Lazio",
  LEC: "Lecce",
  MIL: "Milan",
  MON: "Monza",
  NAP: "Napoli",
  PAR: "Parma",
  ROM: "Roma",
  SAS: "Sassuolo",
  TOR: "Torino",
  UDI: "Udinese",
  VEN: "Venezia"
};

function decodeHtml(value) {
  return value
    .replace(/&#(\d+);/g, function (_, code) { return String.fromCodePoint(Number(code)); })
    .replace(/&#x([\da-f]+);/gi, function (_, code) { return String.fromCodePoint(parseInt(code, 16)); })
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .trim();
}

function extract(row, pattern, fieldName) {
  const match = row.match(pattern);
  if (!match) {
    throw new Error(`Campo ${fieldName} non trovato in una riga del listone.`);
  }
  return decodeHtml(match[1]);
}

function parsePlayer(row) {
  const profileUrl = extract(row, /<a class="player-name player-link"[\s\S]*?href="([^"]+)"/, "profilo");
  const playerIdMatch = profileUrl.match(/\/(\d+)$/);
  if (!playerIdMatch) {
    throw new Error(`ID giocatore non trovato nel profilo ${profileUrl}.`);
  }

  const playerId = Number(playerIdMatch[1]);
  const teamCode = extract(row, /<td class="player-team"[^>]*>\s*([^<]+)\s*<\/td>/, "squadra");
  const teamName = TEAM_NAMES[teamCode];
  if (!teamName) {
    throw new Error(`Codice squadra non riconosciuto: ${teamCode}.`);
  }

  return {
    id: playerId,
    nome: extract(row, /data-filter-keywords="([^"]+)"/, "nome"),
    squadra: teamName,
    ruolo: extract(row, /data-filter-role-classic="([^"]+)"/, "ruolo").toUpperCase(),
    quotazione: Number(extract(row, /<td class="player-classic-current-price"[^>]*>\s*([^<]+)\s*<\/td>/, "quotazione")),
    foto: `https://content.fantacalcio.it/web/campioncini/21/card/${playerId}.png`,
    fonteFoto: profileUrl
  };
}

const response = await fetch(SOURCE_URL, {
  headers: { "User-Agent": "Mozilla/5.0 FANTASTA data updater" }
});
if (!response.ok) {
  throw new Error(`Download listone fallito: HTTP ${response.status}.`);
}

const sourceHtml = await response.text();
const rows = Array.from(sourceHtml.matchAll(/<tr class="player-row"[\s\S]*?<\/tr>/g), function (match) {
  return match[0];
});
if (rows.length < 500) {
  throw new Error(`Listone incompleto: trovate solo ${rows.length} righe.`);
}

const players = rows.map(parsePlayer);
if (new Set(players.map(function (player) { return player.id; })).size !== players.length) {
  throw new Error("Il listone contiene ID duplicati.");
}

await writeFile(OUTPUT_PATH, JSON.stringify(players, null, 2) + "\n", "utf8");
console.log(`Salvati ${players.length} giocatori in data/giocatori.json.`);
