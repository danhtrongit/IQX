import 'reflect-metadata';

import { Global, Inject, Injectable, Module, Optional } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { LessonRewardService } from '../../src/modules/shop/lesson-reward.service.js';
import { ShopController } from '../../src/modules/shop/shop.controller.js';
import { ShopModule } from '../../src/modules/shop/shop.module.js';
import { ShopService } from '../../src/modules/shop/shop.service.js';
import { WorkspaceController } from '../../src/modules/workspace/workspace.controller.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';
import {
  LESSON_REWARD_PORT,
  type LessonRewardPort,
} from '../../src/platform/ports/lesson-reward.port.js';

@Global()
@Module({
  providers: [{ provide: DatabaseService, useValue: {} }],
  exports: [DatabaseService],
})
class FakeDatabaseModule {}

/** Stands in for the Academy: it never imports ShopModule, it only asks for the port. */
@Injectable()
class AcademyLikeConsumer {
  constructor(@Optional() @Inject(LESSON_REWARD_PORT) readonly rewards?: LessonRewardPort) {}
}
@Module({ providers: [AcademyLikeConsumer], exports: [AcademyLikeConsumer] })
class AcademyLikeModule {}

@Injectable()
class ConsumerWithoutShop {
  constructor(@Optional() @Inject(LESSON_REWARD_PORT) readonly rewards?: LessonRewardPort) {}
}
@Module({ providers: [ConsumerWithoutShop], exports: [ConsumerWithoutShop] })
class NoShopModule {}

describe('ShopModule is global and exposes LESSON_REWARD_PORT', () => {
  it('lets a module that does not import ShopModule resolve the reward port', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeDatabaseModule, ShopModule, AcademyLikeModule],
    }).compile();
    const consumer = moduleRef.get(AcademyLikeConsumer);
    expect(consumer.rewards).toBeInstanceOf(LessonRewardService);
    expect(typeof consumer.rewards?.creditFirstCompletion).toBe('function');
    expect(moduleRef.get(ShopService)).toBeInstanceOf(ShopService);
    expect(moduleRef.get(ShopController)).toBeInstanceOf(ShopController);
  });

  it('leaves the port undefined (the Academy still works) when the Shop is not installed', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [NoShopModule] }).compile();
    expect(moduleRef.get(ConsumerWithoutShop).rewards).toBeUndefined();
  });

  it('declares the documented HTTP routes', () => {
    const routes = (controller: object) =>
      Object.getOwnPropertyNames(controller.constructor.prototype);
    expect(Reflect.getMetadata('path', ShopController)).toBe('api/v2/shop');
    expect(Reflect.getMetadata('path', WorkspaceController)).toBe('api/v2/workspace');
    expect(routes(ShopController.prototype)).toEqual(
      expect.arrayContaining([
        'getShop',
        'coinLedger',
        'purchase',
        'purchaseStatus',
        'setActiveMascot',
      ]),
    );
    expect(routes(WorkspaceController.prototype)).toEqual(
      expect.arrayContaining(['ensure', 'state']),
    );
  });
});
