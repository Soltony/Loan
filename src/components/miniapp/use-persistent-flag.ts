'use client';

/**
 * An on/off preference remembered on this phone (localStorage), e.g. "hide amounts".
 * Reads false during server rendering and hydration, then the stored value, so the
 * server and first client render agree. Falls back to memory when storage is blocked.
 */
import { useCallback, useSyncExternalStore } from 'react';

const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();

function read(key: string): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) return stored === '1';
  } catch {
    // storage blocked (private mode, disabled site data): use memory
  }
  return memory.get(key) ?? false;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function usePersistentFlag(key: string): [boolean, () => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );
  const toggle = useCallback(() => {
    const next = !read(key);
    memory.set(key, next);
    try {
      window.localStorage.setItem(key, next ? '1' : '0');
    } catch {
      // kept in memory for this visit
    }
    listeners.forEach((notify) => notify());
  }, [key]);
  return [value, toggle];
}
