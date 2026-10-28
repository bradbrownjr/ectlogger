// ========== ADDING A NEW CHECK-IN TO THE LIST ==========
// A new check-in reaches its submitter twice: in the response to its own
// POST, and in the list NetView re-reads when the server's `check_in`
// broadcast arrives (hooks/useNetWebSocket.ts). The server broadcasts before
// it answers, so the re-read often lands first and already holds the row.
// Appending the response then showed the station twice until the next
// re-read (N1KWG, net 142, 2026-10-26: checked in as NCS from the lobby,
// saw two rows, and deleting one removed both, since only one existed).

/** The list with *row* added, or replaced in place if it is already there. */
export const withCheckIn = <T extends { id: number }>(list: T[], row: T): T[] =>
  list.some((ci) => ci.id === row.id)
    ? list.map((ci) => (ci.id === row.id ? row : ci))
    : [...list, row];
