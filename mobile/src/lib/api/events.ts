type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe to forced sign-outs (refresh token rejected). Returns unsubscribe. */
export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitSessionExpired(): void {
  for (const listener of [...listeners]) listener();
}
