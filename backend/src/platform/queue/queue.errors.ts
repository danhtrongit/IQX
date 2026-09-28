export class QueueDisabledError extends Error {
  constructor() {
    super('Queue infrastructure is disabled');
    this.name = 'QueueDisabledError';
  }
}

export class QueueUnavailableError extends Error {
  constructor() {
    super('Queue infrastructure is unavailable');
    this.name = 'QueueUnavailableError';
  }
}
