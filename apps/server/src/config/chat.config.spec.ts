import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChatConfig } from './chat.config';

describe('ChatConfig', () => {
  let config: ChatConfig;
  let configService: jest.Mocked<ConfigService>;

  const createModule = async (mockValues: Record<string, any>) => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        return mockValues[key] !== undefined ? mockValues[key] : defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatConfig,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    config = module.get<ChatConfig>(ChatConfig);
    configService = module.get(ConfigService) as any;
  };

  it('should resolve default values when config is missing', async () => {
    await createModule({});
    expect(config.MAX_HISTORY_TOKENS).toBe(6000);
    expect(config.CHECKPOINT_TRIGGER_RATIO).toBe(0.8);
    expect(config.triggerThreshold()).toBe(4800);
  });

  it('should use values from ConfigService when provided', async () => {
    await createModule({
      maxHistoryTokens: 10000,
      checkpointTriggerRatio: 0.5,
    });
    expect(config.MAX_HISTORY_TOKENS).toBe(10000);
    expect(config.CHECKPOINT_TRIGGER_RATIO).toBe(0.5);
    expect(config.triggerThreshold()).toBe(5000);
  });

  it('should parse values to numbers correctly', async () => {
    await createModule({
      maxHistoryTokens: '8000',
      checkpointTriggerRatio: '0.7',
    });
    expect(config.MAX_HISTORY_TOKENS).toBe(8000);
    expect(config.CHECKPOINT_TRIGGER_RATIO).toBe(0.7);
    expect(config.triggerThreshold()).toBe(5600);
  });
});
