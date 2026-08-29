import assert from "node:assert/strict";
import test from "node:test";
import { flattenSchedule, parseSeatMap, renderSeatMap, todayInLondon } from "../src/client.js";

test("flattens and enriches a schedule", () => {
  const venue = { id: "X0001", name: "Example Cinema" };
  const payload = { X0001: { schedule: { "42": { "2026-08-29": [{
    startsAt: "2026-08-29T19:30:00",
    isExpired: false,
    occupancy: { rate: 62 },
    screen: { name: "2" },
    tags: ["ReservedSeating"],
    data: { ticketing: [{ provider: "default", urls: ["https://purchase.everymancinema.com/example"] }] },
  }] } } } };
  const rows = flattenSchedule(payload, venue, "2026-08-29", [{ id: "42", title: "Example", runtime: 7200, certificate: "12A" }]);
  assert.deepEqual(rows[0], {
    venueId: "X0001", venue: "Example Cinema", date: "2026-08-29", movieId: "42",
    title: "Example", certificate: "12A", runtimeMinutes: 120,
    startsAt: "2026-08-29T19:30:00", time: "19:30", screen: "2",
    occupancyRate: 62, expired: false, tags: ["ReservedSeating"],
    bookingUrl: "https://purchase.everymancinema.com/example",
  });
});

test("formats the current date in London", () => {
  assert.equal(todayInLondon(new Date("2026-08-29T23:30:00Z")), "2026-08-30");
});

test("extracts available and unavailable seats", () => {
  const payload = { selectSeatsModel: {
    availableSeatTypes: { customSeatStyles: [{ id: 19, name: "Sofa Left" }] },
    seatsLayoutModel: { rows: [{ seats: [
      { isASeat: false },
      { isASeat: true, seatName: "A1", seatRowName: "A", isUnavailable: true, customStyleId: 19, soldAsGroup: true, seatsInGroup: [{ seatName: "A1" }, { seatName: "A2" }] },
      { isASeat: true, seatName: "A2", seatRowName: "A", isUnavailable: false, type: 0, seatsInGroup: [] },
    ] }] },
  } };
  const map = parseSeatMap(payload);
  assert.deepEqual(map.unavailableSeats, ["A1"]);
  assert.deepEqual(map.availableSeats, ["A2"]);
  assert.equal(map.seats[0].type, "Sofa Left");
  assert.match(renderSeatMap(map, { color: false }), /⟦A1×.*\(A2●\)/);
  assert.match(renderSeatMap(map, { color: false }), /1\/2 seats currently available/);
});
