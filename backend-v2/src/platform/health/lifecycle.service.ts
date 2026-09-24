import { Injectable } from '@nestjs/common';
import type { BeforeApplicationShutdown } from '@nestjs/common';

@Injectable()
export class LifecycleService implements BeforeApplicationShutdown {
  private draining = false;

  isDraining(): boolean {
    return this.draining;
  }

  beginDraining(): void {
    this.draining = true;
  }
  beforeApplicationShutdown(): void {
    this.beginDraining();
  }
}
