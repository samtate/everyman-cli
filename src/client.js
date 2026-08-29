import {
  API_URL,
  CHECKOUT_ORIGIN,
  LONDON_TIME_ZONE,
  VENUES_PAGE_DATA_URL,
} from "./constants.js";
import { EverymanError } from "./errors.js";

const titleCase = (value) => value
  .split("-")
  .map((word) => word ? word[0].toUpperCase() + word.slice(1) : word)
  .join(" ")
  .replace(/\bSt Johns\b/, "St. John's")
  .replace(/\bKings Cross\b/, "King's Cross")
  .replace(/^At The Whiteley$/, "The Whiteley");

function parseVenuePage(page) {
  const children = page?.result?.data?.page?.childPages;
  if (!Array.isArray(children)) throw new EverymanError("Everyman venue data had an unexpected shape.");

  return children.map(({ slug, relatedEntity }) => {
    const tail = slug.split("/").at(-1);
    const match = tail.match(/^(?:([a-z0-9]{4,5})-)?(?:everyman-)?(.+)$/i);
    const id = relatedEntity?.id || match?.[1]?.toUpperCase();
    if (!id || !match?.[2]) return null;
    return { id, name: titleCase(match[2]), slug };
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

function nextDate(date) {
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.valueOf())) throw new EverymanError(`Invalid date: ${date}`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function ticketUrl(showtime) {
  return showtime?.data?.ticketing
    ?.find((entry) => entry.provider === "default")?.urls?.[0]
    || showtime?.data?.ticketing?.[0]?.urls?.[0]
    || null;
}

export function flattenSchedule(payload, venue, date, movies = []) {
  const movieById = new Map(movies.map((movie) => [String(movie.id), movie]));
  const schedule = payload?.[venue.id]?.schedule || {};
  const rows = [];
  for (const [movieId, dates] of Object.entries(schedule)) {
    for (const showtime of dates?.[date] || []) {
      const movie = movieById.get(String(movieId)) || {};
      rows.push({
        venueId: venue.id,
        venue: venue.name,
        date,
        movieId,
        title: movie.title || movie.locale?.title || `Movie ${movieId}`,
        certificate: movie.certificate || null,
        runtimeMinutes: movie.runtime ? Math.round(movie.runtime / 60) : null,
        startsAt: showtime.startsAt,
        time: showtime.startsAt?.slice(11, 16),
        screen: showtime.screen?.name || null,
        occupancyRate: showtime.occupancy?.rate ?? null,
        expired: Boolean(showtime.isExpired),
        tags: showtime.tags || [],
        bookingUrl: ticketUrl(showtime),
      });
    }
  }
  return rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function parseSeatMap(payload) {
  const layout = payload?.selectSeatsModel?.seatsLayoutModel;
  if (!Array.isArray(layout?.rows)) throw new EverymanError("Everyman checkout returned no seat map.");
  const customStyles = new Map((payload.selectSeatsModel.availableSeatTypes?.customSeatStyles || [])
    .map((style) => [style.id, style.name]));
  const seatFromRaw = (seat) => ({
    name: seat.seatName || `${seat.rowPhysicalName || ""}${seat.text || seat.id || ""}`,
    row: seat.seatRowName || seat.rowPhysicalName || null,
    index: seat.index,
    available: !seat.isUnavailable,
    unavailable: Boolean(seat.isUnavailable),
    selected: Boolean(seat.isSelected),
    type: customStyles.get(seat.customStyleId)
      || (seat.type === 2 ? "Accessible" : seat.type === 5 ? "Companion" : "Standard"),
    soldAsGroup: Boolean(seat.soldAsGroup),
    group: (seat.seatsInGroup || []).map((member) => member.seatName),
  });
  const rows = layout.rows.map((row) => ({
    name: row.physicalName,
    positions: (row.seats || []).map((seat) => seat.isASeat ? seatFromRaw(seat) : null),
  })).filter((row) => row.positions.some(Boolean));
  const seats = layout.rows.flatMap((row) => (row.seats || []))
    .filter((seat) => seat.isASeat)
    .map(seatFromRaw);
  return {
    rows,
    seats,
    availableSeats: seats.filter((seat) => seat.available).map((seat) => seat.name),
    unavailableSeats: seats.filter((seat) => seat.unavailable).map((seat) => seat.name),
    total: seats.length,
    available: seats.filter((seat) => seat.available).length,
    unavailable: seats.filter((seat) => seat.unavailable).length,
  };
}

export function renderSeatMap(map, { color = !process.env.NO_COLOR } = {}) {
  const ansi = {
    reset: color ? "\u001b[0m" : "",
    green: color ? "\u001b[1;32m" : "",
    red: color ? "\u001b[1;31m" : "",
    cyan: color ? "\u001b[1;36m" : "",
    yellow: color ? "\u001b[1;33m" : "",
  };
  const paint = (value, shade) => `${ansi[shade]}${value}${ansi.reset}`;
  const cellWidth = 7;
  const blank = " ".repeat(cellWidth);
  const token = (seat) => {
    const state = seat.available ? "●" : "×";
    const shade = seat.available ? "green" : "red";
    const type = seat.type.toLowerCase();
    let value;
    if (type.includes("sofa left")) value = `⟦${seat.name}${state}`;
    else if (type.includes("sofa right")) value = `${state}${seat.name}⟧`;
    else if (type.includes("arm chair")) value = `[${seat.name}${state}]`;
    else if (type.includes("accessible")) value = `♿${seat.name}${state}`;
    else if (type.includes("companion")) value = `◇${seat.name}${state}`;
    else value = `(${seat.name}${state})`;
    return paint(value.padEnd(cellWidth), shade);
  };
  const lines = ["", paint("                 ┌──────── SCREEN ────────┐", "cyan"), ""];
  for (const row of map.rows) {
    const cells = row.positions.map((seat) => seat ? token(seat) : blank).join("").trimEnd();
    lines.push(`${paint(String(row.name || "").padStart(3), "cyan")}  ${cells}`);
  }
  lines.push(
    "",
    paint("                    BACK OF THEATRE", "cyan"),
    "",
    `${paint("●", "green")} available   ${paint("×", "red")} unavailable/held`,
    "⟦A1● ●A2⟧ paired sofa   [A3●] single armchair",
    `${paint("♿", "yellow")} accessible space   ◇ companion seat`,
    `${map.available}/${map.total} seats currently available`,
  );
  return lines.join("\n");
}

export class EverymanClient {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetch = fetchImpl;
  }

  async getJson(url) {
    const response = await this.fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new EverymanError(`Everyman returned HTTP ${response.status} for ${url}`);
    return response.json();
  }

  async postJson(url, body) {
    const response = await this.fetch(url, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new EverymanError(`Everyman returned HTTP ${response.status} for ${url}`);
    return response.json();
  }

  async venues() {
    return parseVenuePage(await this.getJson(VENUES_PAGE_DATA_URL));
  }

  async resolveVenue(query) {
    const venues = await this.venues();
    const normalized = query.trim().toLowerCase();
    const exact = venues.find((venue) => venue.id.toLowerCase() === normalized || venue.name.toLowerCase() === normalized);
    if (exact) return exact;
    const matches = venues.filter((venue) => venue.name.toLowerCase().includes(normalized));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new EverymanError(`Venue “${query}” is ambiguous: ${matches.map((v) => v.name).join(", ")}`);
    throw new EverymanError(`Unknown Everyman venue: ${query}`);
  }

  async movieDetails(ids) {
    if (!ids.length) return [];
    const params = new URLSearchParams({ basic: "false", castingLimit: "10" });
    ids.forEach((id) => params.append("ids", id));
    return this.getJson(`${API_URL}/movies?${params}`);
  }

  async showtimes(venueQuery, date) {
    const venue = typeof venueQuery === "string" ? await this.resolveVenue(venueQuery) : venueQuery;
    const params = new URLSearchParams({
      from: `${date}T03:00:00`,
      theaters: JSON.stringify({ id: venue.id, timeZone: LONDON_TIME_ZONE }),
      to: `${nextDate(date)}T03:00:00`,
    });
    const payload = await this.getJson(`${API_URL}/schedule?${params}`);
    const ids = Object.keys(payload?.[venue.id]?.schedule || {});
    const movies = await this.movieDetails(ids);
    return flattenSchedule(payload, venue, date, movies);
  }

  async seatMap(showtime) {
    if (!showtime?.bookingUrl) throw new EverymanError("That screening has no booking URL.");
    const booking = new URL(showtime.bookingUrl);
    if (booking.origin !== CHECKOUT_ORIGIN || !booking.pathname.startsWith("/launch/ticketing/")) {
      throw new EverymanError(`Refusing an unexpected checkout URL: ${showtime.bookingUrl}`);
    }
    const token = booking.pathname.split("/").filter(Boolean).at(-1);
    const payload = await this.postJson(`${CHECKOUT_ORIGIN}/api/launch/ticketing/${encodeURIComponent(token)}`, {
      selectedLanguageCulture: null,
    });
    return parseSeatMap(payload);
  }

  async withSeatMaps(showtimes, { concurrency = 4 } = {}) {
    const result = new Array(showtimes.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < showtimes.length) {
        const index = cursor++;
        try {
          result[index] = { ...showtimes[index], seatMap: await this.seatMap(showtimes[index]) };
        } catch (error) {
          result[index] = { ...showtimes[index], seatMap: null, seatMapError: error.message };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, showtimes.length) }, worker));
    return result;
  }
}

export function todayInLondon(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
