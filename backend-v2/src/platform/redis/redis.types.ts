export type InfrastructureStatus = 'up' | 'down' | 'disabled';

export interface InfrastructureHealth {
  status: InfrastructureStatus;
}
