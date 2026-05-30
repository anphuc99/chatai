import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { referenceIndex } from '@chatai/prompts';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { Emotion, Intensity } from './tts.constants';
import * as path from 'path';
import * as fs from 'fs';

export interface RefPick {
  refAudioPath: string;
  refText: string;
}

@Injectable()
export class ReferenceIndexManager implements OnModuleInit {
  private readonly logger = new Logger(ReferenceIndexManager.name);
  private datasetRoot = '';
  private index: Record<string, Record<string, Record<string, string[]>>> = {};
  private sourceIndex: any[] = [];

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.datasetRoot = this.config.get<string>('ttsDatasetAbsPath') || '';
    
    let loadedIndex: any[] = [];
    if (this.datasetRoot) {
      const indexFilePath = path.join(this.datasetRoot, 'reference_index.json');
      if (fs.existsSync(indexFilePath)) {
        try {
          const content = fs.readFileSync(indexFilePath, 'utf8');
          loadedIndex = JSON.parse(content);
          this.logger.log(`Loaded reference index from file system: ${indexFilePath}`);
        } catch (error) {
          this.logger.error(
            `Failed to parse reference_index.json from dataset directory: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }

    if (loadedIndex.length === 0) {
      loadedIndex = referenceIndex as any[];
      this.logger.log(`Using static fallback reference index from @chatai/prompts`);
    }

    this.buildIndex(loadedIndex);
    this.logger.log(`Loaded voices reference index. Voice count: ${Object.keys(this.index).length}`);
  }

  private buildIndex(sourceIndex: any[]) {
    this.sourceIndex = sourceIndex;
    this.index = {};
    for (const item of sourceIndex) {
      const v = item.voice;
      const e = item.emotion.toLowerCase();
      const i = item.intensity.toLowerCase();
      const file = item.file;

      if (!this.index[v]) this.index[v] = {};
      if (!this.index[v][e]) this.index[v][e] = {};
      if (!this.index[v][e][i]) this.index[v][e][i] = [];

      this.index[v][e][i].push(file);
    }
  }

  pickRandom(voice: string, emotion: Emotion = 'Neutral', intensity: Intensity = 'medium'): RefPick {
    const voiceBlock = this.index[voice];
    if (!voiceBlock) {
      throw new AppException(ERR.REFERENCE_NOT_FOUND, `Không tìm thấy cấu hình giọng nói mẫu cho ${voice}`);
    }

    const emoKey = emotion.toLowerCase();
    const intensityKey = intensity.toLowerCase();

    // 1. Resolve emotion block (fallback to Neutral, then to any available emotion)
    let emoBlock = voiceBlock[emoKey] ?? voiceBlock['neutral'];
    if (!emoBlock) {
      const keys = Object.keys(voiceBlock);
      if (keys.length > 0) {
        const firstKey = keys[0];
        if (firstKey) {
          emoBlock = voiceBlock[firstKey];
        }
      }
    }

    if (!emoBlock) {
      throw new AppException(ERR.REFERENCE_NOT_FOUND, `Không tìm thấy mẫu cảm xúc cho giọng nói ${voice}`);
    }

    // 2. Resolve intensity list (fallback to medium, then to any available intensity)
    const intensityList = emoBlock[intensityKey] ?? emoBlock['medium'] ?? Object.values(emoBlock)[0];
    if (!intensityList || intensityList.length === 0) {
      throw new AppException(ERR.REFERENCE_NOT_FOUND, `Không tìm thấy mẫu cường độ cho giọng nói ${voice}`);
    }

    // 3. Pick random file
    const fileRel = intensityList[Math.floor(Math.random() * intensityList.length)];
    if (!fileRel) {
      throw new AppException(ERR.REFERENCE_NOT_FOUND, `Không tìm thấy file mẫu phù hợp cho ${voice}`);
    }

    const refAudioPath = path.join(this.datasetRoot, voice, fileRel);
    const refText = this.resolveRefText(refAudioPath, voice, fileRel);

    return { refAudioPath, refText };
  }

  resolveRefText(refAudioPath: string, voice?: string, fileRel?: string): string {
    const companion = refAudioPath.replace(/\.wav$/, '.txt');
    if (fs.existsSync(companion)) {
      return fs.readFileSync(companion, 'utf8').trim();
    }

    // Fallback: lookup in loaded sourceIndex metadata
    if (voice && fileRel) {
      const matched = this.sourceIndex.find(item => item.voice === voice && item.file === fileRel);
      if (matched && matched.text) {
        return matched.text.trim();
      }
    }

    // Derive from filename
    const filename = path.basename(refAudioPath, '.wav');
    return filename.replace(/_/g, ' ');
  }
}
