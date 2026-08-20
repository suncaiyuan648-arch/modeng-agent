export const TALK_MODEL_SLOT = 'talk.default' as const;

export const DEFAULT_TALK_RELEASE_ID = 'mdlrel_01jv5q2x7e8m9n4k6p3r1t0s' as const;
export const ALTERNATE_TALK_RELEASE_ID = 'mdlrel_01jv5q2x7e8m9n4k6p3r1t0t' as const;

type ModelReleaseLifecycle = 'AVAILABLE' | 'DEPRECATED' | 'RETIRED';

export interface ModelRelease {
  readonly releaseId: string;
  readonly capability: 'talk';
  readonly lifecycle: ModelReleaseLifecycle;
  readonly assignmentEligible: boolean;
  readonly offer: {
    readonly offerId: string;
    readonly providerModelAlias: string;
    readonly observedUpstreamVersion: string;
    readonly bindingVersion: string;
    readonly maxOutputTokens: 4096;
  };
}

export interface ProviderChannel {
  readonly providerChannelId: string;
  readonly baseUrl: 'https://api.deepseek.com';
  readonly protocol: 'openai-chat-completions';
  readonly transportSpecVersion: 'deepseek.openai.chat.v1';
  readonly credentialRef: 'secret://provider/deepseek/modeng-talk-v1';
}

export const DEEPSEEK_OFFICIAL_CHANNEL: ProviderChannel = Object.freeze({
  providerChannelId: 'channel_deepseek_official_openai_global_v1',
  baseUrl: 'https://api.deepseek.com',
  protocol: 'openai-chat-completions',
  transportSpecVersion: 'deepseek.openai.chat.v1',
  credentialRef: 'secret://provider/deepseek/modeng-talk-v1',
});

const releases = new Map<string, ModelRelease>([
  [
    DEFAULT_TALK_RELEASE_ID,
    Object.freeze({
      releaseId: DEFAULT_TALK_RELEASE_ID,
      capability: 'talk',
      lifecycle: 'AVAILABLE',
      assignmentEligible: true,
      offer: Object.freeze({
        offerId: 'offer_deepseek_v4_flash_official_v1',
        providerModelAlias: 'deepseek-v4-flash',
        observedUpstreamVersion: 'DeepSeek-V4-Flash',
        bindingVersion: 'modeng.deepseek.talk.flash.v1',
        maxOutputTokens: 4096,
      }),
    }),
  ],
  [
    ALTERNATE_TALK_RELEASE_ID,
    Object.freeze({
      releaseId: ALTERNATE_TALK_RELEASE_ID,
      capability: 'talk',
      lifecycle: 'AVAILABLE',
      assignmentEligible: true,
      offer: Object.freeze({
        offerId: 'offer_deepseek_v4_pro_official_v1',
        providerModelAlias: 'deepseek-v4-pro',
        observedUpstreamVersion: 'DeepSeek-V4-Pro',
        bindingVersion: 'modeng.deepseek.talk.pro.v1',
        maxOutputTokens: 4096,
      }),
    }),
  ],
]);

export function findModelRelease(releaseId: string): ModelRelease | undefined {
  return releases.get(releaseId);
}
