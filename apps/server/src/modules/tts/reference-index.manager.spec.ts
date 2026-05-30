import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReferenceIndexManager } from './reference-index.manager';
import { AppException } from '../../shared/errors/app-exception';
import * as fs from 'fs';

jest.mock('fs');
jest.mock('@chatai/prompts', () => ({
  referenceIndex: [
    {
      voice: 'TestVoice',
      emotion: 'happy',
      intensity: 'high',
      file: 'happy_high_file.wav',
      text: 'Vui vẻ cường độ cao',
    },
    {
      voice: 'TestVoice',
      emotion: 'neutral',
      intensity: 'medium',
      file: 'neutral_med_file.wav',
      text: 'Bình thường',
    },
  ],
}));

describe('ReferenceIndexManager', () => {
  let manager: ReferenceIndexManager;
  let configService: ConfigService;

  beforeEach(async () => {
    // Mock mặc định cho fs.existsSync trả về false để tránh ảnh hưởng đến onModuleInit load index
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferenceIndexManager,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock/dataset/root'),
          },
        },
      ],
    }).compile();

    manager = module.get<ReferenceIndexManager>(ReferenceIndexManager);
    configService = module.get<ConfigService>(ConfigService);
    await manager.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(manager).toBeDefined();
  });

  describe('pickRandom', () => {
    it('should pick matched reference and resolve text', () => {
      const pick = manager.pickRandom('TestVoice', 'Happy', 'high');
      expect(pick.refAudioPath).toContain('happy_high_file.wav');
      expect(pick.refText).toBe('Vui vẻ cường độ cao');
    });

    it('should fallback to neutral emotion when requested emotion is missing', () => {
      const pick = manager.pickRandom('TestVoice', 'Sad', 'medium');
      expect(pick.refAudioPath).toContain('neutral_med_file.wav');
      expect(pick.refText).toBe('Bình thường');
    });

    it('should fallback to default intensity when requested intensity is missing', () => {
      const pick = manager.pickRandom('TestVoice', 'Happy', 'low');
      expect(pick.refAudioPath).toContain('happy_high_file.wav');
    });

    it('should throw REFERENCE_NOT_FOUND when voice does not exist', () => {
      expect(() => {
        manager.pickRandom('UnknownVoice');
      }).toThrow(AppException);
    });
  });

  describe('resolveRefText', () => {
    it('should read from companion .txt file if exists', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => p.endsWith('.txt'));
      jest.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
        if (p.endsWith('.txt')) {
          return 'Nội dung từ file text';
        }
        return '';
      });

      const result = manager.resolveRefText('path/to/audio.wav');
      expect(result).toBe('Nội dung từ file text');
    });

    it('should derive text from filename if txt does not exist and no JSON metadata', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = manager.resolveRefText('path/to/some_audio_file.wav');
      expect(result).toBe('some audio file');
    });
  });
});
