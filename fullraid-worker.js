// Web Worker for the Full raid solver: plays combinations (one setup per room) on a range of raids (engine/fullraid.js).
import { evalFull, evalRooms, roomReport, fullRaidReports } from './engine/fullraid.js';

self.onmessage = (ev) => {
  const { id, combos, rooms, report, entries, ctx, from, to, seed } = ev.data;
  try {
    self.postMessage({ id, result: report ? roomReport({ ...report, from, to, seed })
      : entries ? fullRaidReports(entries, ctx, from, to, seed).entry
        : rooms ? evalRooms(rooms, ctx.team, from, to, seed) : evalFull(combos, ctx, from, to, seed) });
  }
  catch (e) { self.postMessage({ id, error: e && e.message ? e.message : String(e) }); }
};
