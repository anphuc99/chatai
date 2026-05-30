import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { AppException, ERR } from '../../shared/errors/app-exception';

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);

  async adjustPitch(buffer: Buffer, pitch: number): Promise<Buffer> {
    if (pitch === 1.0) {
      return buffer;
    }

    return new Promise<Buffer>((resolve, reject) => {
      const sampleRate = 44100;
      const targetRate = Math.round(sampleRate * pitch);
      
      const args = [
        '-i', 'pipe:0',
        '-af', `asetrate=${targetRate},aresample=${sampleRate}`,
        '-f', 'wav',
        'pipe:1',
      ];

      const child = spawn('ffmpeg', args);
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new AppException(ERR.TTS_ENGINE_DOWN, 'Xử lý FFmpeg bị quá giờ (timeout 10s)'));
      }, 10000);

      child.stdout.on('data', (chunk) => {
        stdoutChunks.push(chunk);
      });

      child.stderr.on('data', (chunk) => {
        stderrChunks.push(chunk);
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        this.logger.error(`Failed to start FFmpeg: ${err.message}`);
        reject(new AppException(ERR.TTS_ENGINE_DOWN, `Không thể khởi động FFmpeg: ${err.message}`));
      });

      child.on('exit', (code, signal) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve(Buffer.concat(stdoutChunks));
        } else {
          const stderrStr = Buffer.concat(stderrChunks).toString('utf8');
          this.logger.error(`FFmpeg exited with code ${code}, signal ${signal}. Stderr: ${stderrStr}`);
          reject(
            new AppException(
              ERR.TTS_ENGINE_DOWN,
              `FFmpeg thất bại (code: ${code}, signal: ${signal}). Chi tiết: ${stderrStr || 'unknown'}`
            )
          );
        }
      });

      try {
        child.stdin.write(buffer);
        child.stdin.end();
      } catch (err) {
        clearTimeout(timeout);
        child.kill('SIGKILL');
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to write to FFmpeg stdin: ${errMsg}`);
        reject(new AppException(ERR.TTS_ENGINE_DOWN, `Lỗi khi ghi dữ liệu vào FFmpeg: ${errMsg}`));
      }
    });
  }
}
