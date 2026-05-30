import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { AppException, ERR } from '../../shared/errors/app-exception';

@Injectable()
export class GptSovitsClient {
  private readonly logger = new Logger(GptSovitsClient.name);
  private readonly httpClient: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>('ttsEngineUrl') || 'http://localhost:5000';
    this.httpClient = axios.create({
      baseURL,
      timeout: 30000,
      responseType: 'arraybuffer',
    });
  }

  async infer(text: string, refAudioPath: string, refText: string, language = 'zh'): Promise<Buffer> {
    const payload = {
      text,
      text_lang: language,
      ref_audio_path: refAudioPath,
      prompt_text: refText,
      prompt_lang: language,
    };

    const makeRequest = async () => {
      return this.httpClient.post('/tts', payload);
    };

    try {
      try {
        const response = await makeRequest();
        return Buffer.from(response.data);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const isNetworkError = !error.response;
          const isTimeout = error.code === 'ECONNABORTED';
          const isServerError = error.response && error.response.status >= 500;
          
          if (isNetworkError || isTimeout || isServerError) {
            this.logger.warn(`TTS inference failed. Retrying in 1s... Error: ${error.message}`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const response = await makeRequest();
            return Buffer.from(response.data);
          }
        }
        throw error;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`GPT-SoVITS inference failed: ${errMsg}`, errStack);
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED') {
          throw new AppException(ERR.TTS_ENGINE_DOWN, 'Không thể kết nối đến TTS engine');
        }
        if (error.response) {
          if (error.response.status === 404) {
            throw new AppException(ERR.REFERENCE_NOT_FOUND, 'Không tìm thấy file âm thanh mồi cảm xúc');
          }
          const errorMsg = error.response.data 
            ? Buffer.from(error.response.data as ArrayBuffer).toString('utf8')
            : error.message;
          throw new AppException(ERR.TTS_ENGINE_DOWN, `TTS engine báo lỗi: ${errorMsg}`);
        }
      }
      throw new AppException(ERR.TTS_ENGINE_DOWN, errMsg || 'Lỗi không xác định khi gọi TTS engine');
    }
  }

  async health(): Promise<boolean> {
    try {
      await this.httpClient.get('/tts', { responseType: 'text' });
      return true;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response && error.response.status === 400) {
        return true;
      }
      return false;
    }
  }
}
