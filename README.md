# everyman-cli

An unofficial, dependency-free command-line client for Everyman Cinema's public website data.

It can list venues, retrieve live showtimes and screen numbers, inspect current seat availability, render colour ASCII seat maps, and print official booking URLs. It does not log in, select seats, reserve tickets, or complete purchases.

> [!IMPORTANT]
> This project is not affiliated with or endorsed by Everyman Cinema. It uses undocumented public website endpoints that may change without notice. Please use it responsibly and avoid excessive requests.

## Requirements

- Node.js 20 or newer

## Install

```bash
git clone https://github.com/samtate/everyman-cli.git
cd everyman-cli
npm install
npm link
```

You can then run `everyman` globally. Alternatively, replace `everyman` in the examples below with `node src/cli.js`.

## Usage

Discover venue names and IDs:

```bash
everyman venues
```

List showtimes and screen numbers:

```bash
everyman showtimes --venue York
everyman showtimes --venue York --date 2026-09-01
everyman showtimes --venue York --venue Leeds
```

Include live seat-availability summaries:

```bash
everyman showtimes --venue York --seats
```

Render an auditorium as a colour ASCII seat map:

```bash
everyman seats --venue York --movie "Example Film" --time 19:30
everyman seats --venue York --movie "Example Film" --time 19:30 --no-color
```

Print the official checkout URL for one screening:

```bash
everyman booking-url --venue York --movie "Example Film" --time 19:30
```

Add `--json` to `showtimes` for machine-readable output.

## Seat-map legend

```text
● available   × unavailable or held
⟦A1● ●A2⟧ paired sofa
[A3●] single armchair
♿ accessible space   ◇ companion seat
```

Everyman's public checkout describes seats as available or unavailable. It does not distinguish purchased seats from temporary holds or operational blocks.

## How it works

- Venue discovery uses Everyman's public Gatsby page data.
- Schedules and movie details use the public endpoints that power the Everyman listings page.
- Seat maps use the pre-selection layout returned by the official checkout.
- Booking URLs come directly from each screening's schedule data.

The CLI validates response shapes and surfaces failures instead of treating unexpected or empty responses as valid schedules.

## Development

```bash
npm test
```

The test suite uses Node's built-in test runner and does not require network access.

## Privacy

The CLI has no configuration file, analytics, account integration, or credential storage. Venue, film, date, and time are supplied explicitly on each invocation.
