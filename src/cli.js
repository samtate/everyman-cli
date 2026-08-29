#!/usr/bin/env node
import { EverymanClient, renderSeatMap, todayInLondon } from "./client.js";
import { EverymanError } from "./errors.js";

function argsOf(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) result._.push(token);
    else {
      const key = token.slice(2);
      const value = argv[index + 1]?.startsWith("--") || argv[index + 1] == null ? true : argv[++index];
      if (key === "venue") result.venue = [...(result.venue || []), value];
      else result[key] = value;
    }
  }
  return result;
}

function help() {
  console.log(`everyman-cli

Commands:
  everyman venues
  everyman showtimes --venue NAME [--venue NAME ...] [--date YYYY-MM-DD] [--seats] [--json]
  everyman seats --venue NAME --movie TITLE --time HH:MM [--date YYYY-MM-DD] [--no-color]
  everyman booking-url --venue NAME --movie TITLE --time HH:MM [--date YYYY-MM-DD]`);
}

function printShowtimes(rows) {
  const grouped = Map.groupBy(rows, (row) => row.title);
  for (const [title, screenings] of grouped) {
    const suffix = screenings[0].certificate ? ` (${screenings[0].certificate})` : "";
    console.log(`  ${title}${suffix}`);
    for (const row of screenings) {
      const screen = row.screen ? `screen ${row.screen}` : "screen unknown";
      const seats = row.seatMap
        ? `; unavailable: ${row.seatMap.unavailableSeats.join(", ") || "none"} (${row.seatMap.available}/${row.seatMap.total} available)`
        : row.seatMapError ? `; seats unavailable: ${row.seatMapError}` : "";
      console.log(`    ${row.time} — ${screen}${seats}`);
    }
  }
}

async function main() {
  const args = argsOf(process.argv.slice(2));
  const command = args._[0];
  const client = new EverymanClient();
  if (!command || ["help", "--help", "-h"].includes(command)) return help();

  if (command === "venues") {
    for (const venue of await client.venues()) console.log(`${venue.id}\t${venue.name}`);
    return;
  }

  const date = args.date || todayInLondon();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new EverymanError("--date must be YYYY-MM-DD");

  if (command === "showtimes") {
    const names = args.venue || [];
    if (!names.length) throw new EverymanError("showtimes requires at least one --venue");
    const results = await Promise.all(names.map(async (name) => {
      const venue = await client.resolveVenue(name);
      let rows = await client.showtimes(venue, date);
      if (args.seats) rows = await client.withSeatMaps(rows);
      return { venue, rows };
    }));
    if (args.json) return console.log(JSON.stringify(results, null, 2));
    for (const { venue, rows } of results) {
      console.log(`\n${venue.name} — ${date}`);
      if (rows.length) printShowtimes(rows);
      else console.log("  No showtimes found.");
    }
    return;
  }

  if (command === "seats") {
    const venueName = args.venue?.[0];
    if (!venueName || !args.movie || !args.time) throw new EverymanError("seats requires --venue, --movie, and --time");
    const movie = String(args.movie).toLowerCase();
    const rows = await client.showtimes(venueName, date);
    const matches = rows.filter((row) => row.title.toLowerCase().includes(movie) && row.time === args.time);
    if (matches.length !== 1) throw new EverymanError(`Expected one screening; found ${matches.length}.`);
    const map = await client.seatMap(matches[0]);
    console.log(`\n${matches[0].title} — ${matches[0].venue}, screen ${matches[0].screen}, ${matches[0].time}`);
    console.log(renderSeatMap(map, { color: !args["no-color"] }));
    return;
  }

  if (command === "booking-url") {
    const venueName = args.venue?.[0];
    if (!venueName || !args.movie || !args.time) throw new EverymanError("booking-url requires --venue, --movie, and --time");
    const rows = await client.showtimes(venueName, date);
    const movie = String(args.movie).toLowerCase();
    const matches = rows.filter((row) => row.title.toLowerCase().includes(movie) && row.time === args.time);
    if (matches.length !== 1) {
      const choices = matches.length ? matches : rows.filter((row) => row.title.toLowerCase().includes(movie));
      const detail = choices.map((row) => `${row.title} at ${row.time}`).join(", ") || "none";
      throw new EverymanError(`Expected one screening; found ${matches.length}. Choices: ${detail}`);
    }
    if (!matches[0].bookingUrl) throw new EverymanError("That screening has no booking URL.");
    console.log(matches[0].bookingUrl);
    return;
  }

  throw new EverymanError(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof EverymanError ? error.message : error);
  process.exitCode = 1;
});
