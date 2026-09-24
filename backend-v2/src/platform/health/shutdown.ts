/** Own the deadline outside Nest hooks: hooks at the same level run concurrently. */
export async function closeWithinDeadline(
  close: () => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      close(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Shutdown deadline exceeded')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function installShutdownHandlers(
  application: { close(): Promise<void> },
  timeoutMs: number,
  beginDraining: () => void,
): void {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  const shutdown = () => {
    for (const signal of signals) process.removeListener(signal, shutdown);
    beginDraining();
    void closeWithinDeadline(() => application.close(), timeoutMs).catch(() => {
      process.stderr.write('IQX could not close all resources within the shutdown deadline.\n');
      process.exit(1);
    });
  };
  for (const signal of signals) process.once(signal, shutdown);
}
