import { Module } from '@nestjs/common';
import { createModelSupplyComposition } from '@modern-agent/backend-model-supply';

import { HealthController } from './health.controller.js';
import { TalkController } from './talk.controller.js';
import { createTalkComposition, TALK_COMPOSITION_TOKEN } from './talk.composition.js';

@Module({
  controllers: [HealthController, TalkController],
  providers: [
    {
      provide: TALK_COMPOSITION_TOKEN,
      useFactory: () => createTalkComposition(createModelSupplyComposition()),
    },
    {
      provide: TalkController,
      useFactory: (composition: ReturnType<typeof createTalkComposition>) =>
        new TalkController(composition),
      inject: [TALK_COMPOSITION_TOKEN],
    },
  ],
})
export class AppModule {}
