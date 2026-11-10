import { useSyncExternalStore } from 'react';

const EMPTY = { subscribe: () => () => {}, getSnapshot: () => null };

/** Subscribes a component to a Room's state (null-safe: returns null without a room). */
export function useRoomSnapshot(room) {
  const store = room || EMPTY;
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
