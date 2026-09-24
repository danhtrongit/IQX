import {
  Global,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type Provider,
} from '@nestjs/common';

import { QueueModule } from '../../platform/queue/queue.module.js';
import { JobsService } from './jobs.service.js';
import { defaultRuntimeSchedules, WeekdayCalendar } from './runtime.schedules.js';
import { RuntimeStatusStore } from './runtime.status-store.js';
import { RuntimeWorker } from './runtime.worker.js';
import {
  IQX_JOBS_SERVICE,
  RUNTIME_JOB_NAMES,
  RUNTIME_OPTIONS,
  type RuntimeOptions,
} from './runtime.types.js';

export type RuntimeModuleAsyncOptions = Pick<ModuleMetadata, 'imports'> & {
  inject?: Provider[];
  useFactory: (
    ...dependencies: never[]
  ) => Promise<Partial<RuntimeOptions>> | Partial<RuntimeOptions>;
};

@Global()
@Module({})
export class RuntimeModule {
  static register(options: Partial<RuntimeOptions>): DynamicModule {
    return this.build({ provide: RUNTIME_OPTIONS, useValue: this.defaults(options) });
  }

  static registerAsync(options: RuntimeModuleAsyncOptions): DynamicModule {
    return this.build(
      {
        provide: RUNTIME_OPTIONS,
        inject: (options.inject ?? []) as never[],
        useFactory: async (...dependencies: never[]) =>
          this.defaults(await options.useFactory(...dependencies)),
      },
      options.imports,
    );
  }

  private static defaults(options: Partial<RuntimeOptions>): RuntimeOptions {
    return {
      enabled: options.enabled ?? false,
      consumeJobs: options.consumeJobs ?? false,
      handlers: options.handlers ?? {},
      calendar: options.calendar ?? new WeekdayCalendar(),
      schedules: options.schedules ?? defaultRuntimeSchedules(),
      registeredJobNames: options.registeredJobNames ?? (options.enabled ? RUNTIME_JOB_NAMES : []),
      concurrency: options.concurrency ?? 4,
    };
  }

  private static build(
    optionsProvider: Provider,
    imports: ModuleMetadata['imports'] = [],
  ): DynamicModule {
    return {
      module: RuntimeModule,
      imports: [QueueModule, ...(imports ?? [])],
      providers: [
        optionsProvider,
        RuntimeStatusStore,
        JobsService,
        RuntimeWorker,
        { provide: IQX_JOBS_SERVICE, useExisting: JobsService },
      ],
      exports: [JobsService, IQX_JOBS_SERVICE],
    };
  }
}
