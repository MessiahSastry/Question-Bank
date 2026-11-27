'use strict';

// Pure event reconciliation. Only signed server events are passed to this module.
function reconcileEvents(events) {
  const seen = new Set();
  const timeline = events.filter(event => {
    if (!['join', 'leave'].includes(event.kind) ||
        !Number.isFinite(event.atMs) || !event.instanceKey) return false;
    const key = [event.kind, event.instanceKey, event.atMs].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.atMs - b.atMs ||
    (a.kind === 'join' ? -1 : 1) - (b.kind === 'join' ? -1 : 1));
  const active = new Map(), intervals = [];
  let unmatchedExits = 0;
  for (const event of timeline) {
    const entered = active.get(event.instanceKey);
    if (event.kind === 'join') {
      if (!entered) active.set(event.instanceKey, event);
    } else if (!entered) {
      unmatchedExits++;
    } else {
      intervals.push({joinedAt: new Date(entered.atMs).toISOString(),
        leftAt: new Date(event.atMs).toISOString(),
        meetingUuid: String(entered.meetingUuid || ''),
        reason: String(event.reason || '').slice(0, 140)});
      active.delete(event.instanceKey);
    }
  }
  for (const event of active.values()) {
    intervals.push({joinedAt: new Date(event.atMs).toISOString(), leftAt: null,
      meetingUuid: String(event.meetingUuid || ''), reason: 'Awaiting verified exit'});
  }
  intervals.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  return {zoomIntervals: intervals.slice(0, 200),
    zoomIntervalsTruncated: intervals.length > 200,
    zoomUnmatchedExits: unmatchedExits};
}

module.exports = {reconcileEvents};
