import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnvironment } from './environment.js';

@Global()
@Module({})
export class ConfigurationModule {
  static forEnvironment(environment: Record<string, unknown>): DynamicModule {
    const values = parseEnvironment(environment);
    return {
      module: ConfigurationModule,
      global: true,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validatePredefined: false,
          skipProcessEnv: true,
          load: [() => values],
        }),
      ],
      exports: [ConfigModule],
    };
  }
}
