import { Test, TestingModule } from '@nestjs/testing';
import { FfmpegService } from './ffmpeg.service';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { AppException } from '../../shared/errors/app-exception';

jest.mock('child_process');

describe('FfmpegService', () => {
  let service: FfmpegService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FfmpegService],
    }).compile();

    service = module.get<FfmpegService>(FfmpegService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('adjustPitch', () => {
    it('should return original buffer if pitch is 1.0', async () => {
      const mockBuffer = Buffer.from('original_audio');
      const result = await service.adjustPitch(mockBuffer, 1.0);
      expect(result).toBe(mockBuffer);
      expect(spawn).not.toHaveBeenCalled();
    });

    it('should successfully run ffmpeg and return adjusted buffer', async () => {
      const mockBuffer = Buffer.from('original_audio');
      const mockOutput = Buffer.from('adjusted_audio');

      const mockStdout = new EventEmitter();
      const mockStderr = new EventEmitter();
      const mockStdin = {
        write: jest.fn(),
        end: jest.fn(),
      };

      const mockChild: any = new EventEmitter();
      mockChild.stdout = mockStdout;
      mockChild.stderr = mockStderr;
      mockChild.stdin = mockStdin;
      mockChild.kill = jest.fn();

      (spawn as jest.Mock).mockReturnValue(mockChild);

      const promise = service.adjustPitch(mockBuffer, 1.2);

      await new Promise((resolve) => setImmediate(resolve));

      mockStdout.emit('data', mockOutput);
      mockChild.emit('exit', 0, null);

      const result = await promise;
      expect(result).toEqual(mockOutput);
      expect(mockStdin.write).toHaveBeenCalledWith(mockBuffer);
      expect(mockStdin.end).toHaveBeenCalled();
    });

    it('should reject if ffmpeg exits with non-zero code', async () => {
      const mockBuffer = Buffer.from('original_audio');

      const mockStdout = new EventEmitter();
      const mockStderr = new EventEmitter();
      const mockStdin = {
        write: jest.fn(),
        end: jest.fn(),
      };

      const mockChild: any = new EventEmitter();
      mockChild.stdout = mockStdout;
      mockChild.stderr = mockStderr;
      mockChild.stdin = mockStdin;
      mockChild.kill = jest.fn();

      (spawn as jest.Mock).mockReturnValue(mockChild);

      const promise = service.adjustPitch(mockBuffer, 1.2);

      await new Promise((resolve) => setImmediate(resolve));

      mockStderr.emit('data', Buffer.from('FFmpeg syntax error'));
      mockChild.emit('exit', 1, null);

      await expect(promise).rejects.toThrow(AppException);
    });

    it('should reject and kill on timeout', async () => {
      const originalSetTimeout = global.setTimeout;
      (global as any).setTimeout = jest.fn().mockImplementation((cb) => {
        // Kích hoạt callback timeout ngay lập tức
        cb();
        return 123 as any;
      });

      const mockBuffer = Buffer.from('original_audio');

      const mockStdout = new EventEmitter();
      const mockStderr = new EventEmitter();
      const mockStdin = {
        write: jest.fn(),
        end: jest.fn(),
      };

      const mockChild: any = new EventEmitter();
      mockChild.stdout = mockStdout;
      mockChild.stderr = mockStderr;
      mockChild.stdin = mockStdin;
      mockChild.kill = jest.fn();

      (spawn as jest.Mock).mockReturnValue(mockChild);

      const promise = service.adjustPitch(mockBuffer, 1.2);

      await expect(promise).rejects.toThrow(AppException);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');

      global.setTimeout = originalSetTimeout;
    });
  });
});
