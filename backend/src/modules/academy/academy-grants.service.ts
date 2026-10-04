import { Inject, Injectable } from '@nestjs/common';

import type { AcademyGrantsPort } from './academy.ports.js';
import {
  AcademyRepository,
  type AcademyStoreProvider,
  type GrantRow,
} from './academy.repository.js';

/** Sorted union of capability ids over a user's grant rows. */
export function capabilityUnion(grants: readonly Pick<GrantRow, 'capability_ids'>[]): string[] {
  return [...new Set(grants.flatMap((grant) => grant.capability_ids))].sort();
}

@Injectable()
export class AcademyGrantsService implements AcademyGrantsPort {
  constructor(@Inject(AcademyRepository) private readonly repository: AcademyStoreProvider) {}

  async grantedCapabilities(userId: string): Promise<ReadonlySet<string>> {
    return new Set(capabilityUnion(await this.repository.store().grants(userId)));
  }
}
