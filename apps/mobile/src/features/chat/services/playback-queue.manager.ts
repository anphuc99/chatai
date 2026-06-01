import { Audio } from 'expo-av';
import { VoiceName } from '@chatai/shared-types';
import { ChatMessage } from '../types/message';
import TtsFetchService from './tts-fetch.service';

const NARRATOR_DEFAULT_VOICE: VoiceName = 'Achernar';

const containsChinese = (s: string): boolean => /[\u4E00-\u9FFF]/.test(s);

export interface PlaybackCallbacks {
  onBubbleShow: (msg: ChatMessage) => void;
  onQueueFinished: () => void;
  onError?: (err: unknown) => void;
}

let playbackManagerInstance: PlaybackQueueManager | null = null;

export function getPlaybackManagerSingleton(): PlaybackQueueManager | null {
  return playbackManagerInstance;
}

export function setPlaybackManagerSingleton(mgr: PlaybackQueueManager | null): void {
  playbackManagerInstance = mgr;
}

export class PlaybackQueueManager {
  private queue: ChatMessage[] = [];
  private isPlaying = false;
  private isStopped = false;
  private currentSound: Audio.Sound | null = null;
  private charactersVoice: Map<string, { voiceName: VoiceName; pitch: number }>;
  private queueFinishResolvers: Array<() => void> = [];

  private onBubbleShow: (msg: ChatMessage) => void;
  private onQueueFinished: () => void;
  private onError?: (err: unknown) => void;

  constructor(opts: {
    onBubbleShow: (msg: ChatMessage) => void;
    onQueueFinished: () => void;
    onError?: (err: unknown) => void;
    charactersVoice: Map<string, { voiceName: VoiceName; pitch: number }>;
  }) {
    this.onBubbleShow = opts.onBubbleShow;
    this.onQueueFinished = opts.onQueueFinished;
    this.onError = opts.onError;
    this.charactersVoice = opts.charactersVoice;
  }

  public setCharactersMap(map: Map<string, { voiceName: VoiceName; pitch: number }>): void {
    this.charactersVoice = map;
  }

  public enqueueBatch(msgs: ChatMessage[]): void {
    if (this.isStopped) {
      return;
    }
    this.queue.push(...msgs);
    if (!this.isPlaying) {
      this.isPlaying = true;
      void this.playNext();
    }
  }

  public async stop(): Promise<void> {
    this.isStopped = true;
    this.queue = [];
    if (this.currentSound) {
      try {
        await this.currentSound.stopAsync();
      } catch {
        // ignore
      }
      try {
        await this.currentSound.unloadAsync();
      } catch {
        // ignore
      }
      this.currentSound = null;
    }
    this.isPlaying = false;
    const resolvers = this.queueFinishResolvers.splice(0);
    for (const resolve of resolvers) resolve();
  }

  public waitForQueueFinish(): Promise<void> {
    if (!this.isPlaying && this.queue.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queueFinishResolvers.push(resolve);
    });
  }

  private async playNext(): Promise<void> {
    if (this.isStopped) {
      this.isPlaying = false;
      return;
    }
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.onQueueFinished();
      const resolvers = this.queueFinishResolvers.splice(0);
      for (const resolve of resolvers) resolve();
      return;
    }

    const msg = this.queue.shift()!;
    try {
      await this.playOne(msg);
    } catch (e) {
      this.onError?.(e);
      // continue queue anyway (don't stop on single TTS fail)
    }

    return this.playNext();
  }

  private async playOne(msg: ChatMessage): Promise<void> {
    if (this.isStopped) {
      return;
    }

    // 1. UI render bubble với animation
    this.onBubbleShow(msg);

    // 2. if msg.kind !== 'assistant':
    // user/ooc/system: just bubble show, no audio, no delay
    if (msg.kind !== 'assistant') {
      return;
    }

    // 3. audioUrl = await fetchAudioUrl(msg)
    const audioUrl = await this.fetchAudioUrl(msg);

    // 4. if audioUrl:
    if (audioUrl) {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true }
      );

      if (this.isStopped) {
        try {
          await sound.unloadAsync();
        } catch {
          // ignore
        }
        return;
      }

      this.currentSound = sound;

      await new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((status) => {
          if (this.isStopped) {
            resolve();
            return;
          }
          if (status.isLoaded) {
            if (status.didJustFinish) {
              resolve();
            }
          } else {
            resolve(); // Resolve if sound unloaded or errored
          }
        });
      });

      try {
        await sound.unloadAsync();
      } catch {
        // ignore
      }

      if (this.currentSound === sound) {
        this.currentSound = null;
      }
    } else {
      // No audio (narrator VN) → delay
      const delayMs = this.estimateNarratorDelayMs(msg.text);
      await this.sleepInterruptible(delayMs);
    }
  }

  private async fetchAudioUrl(msg: ChatMessage): Promise<string | null> {
    if (msg.kind !== 'assistant') {
      return null;
    }

    // Narrator detection: characterName === 'Narrator' (hoặc characterId === null)
    const isNarrator = msg.characterName === 'Narrator' || msg.characterId == null;

    if (isNarrator) {
      // detect language: nếu text contains Chinese chars → narrator zh voice (mặc định 'Achernar', pitch 1.0)
      // else if pure VN (heuristic: chỉ ASCII + diacritics) → return null (no audio)
      if (containsChinese(msg.text)) {
        try {
          const r = await TtsFetchService.synthesize({
            text: msg.text,
            voiceName: NARRATOR_DEFAULT_VOICE,
            emotion: 'Neutral',
            intensity: 'medium',
            pitch: 1.0,
          });
          return r.audioUrl;
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }

    // Character message
    const charVoice = this.charactersVoice.get(msg.characterId!);
    if (!charVoice) {
      return null; // unknown char (e.g. temp) → no audio MVP
    }

    try {
      const r = await TtsFetchService.synthesize({
        text: msg.text,
        voiceName: charVoice.voiceName,
        emotion: msg.emotion ?? 'Neutral',
        intensity: msg.intensity ?? 'medium',
        pitch: charVoice.pitch,
      });
      return r.audioUrl;
    } catch (e: unknown) {
      // rate limit check: if error code is RATE_LIMIT, silent skip (return null)
      if (e && typeof e === 'object' && 'code' in e && e.code === 'RATE_LIMIT') {
        return null;
      }
      throw e;
    }
  }

  private estimateNarratorDelayMs(text: string): number {
    return Math.min(Math.max(text.length * 80, 800), 5000);
    // 80ms per char, min 800ms, max 5000ms
  }

  private async sleepInterruptible(ms: number): Promise<void> {
    const checkInterval = 100;
    let elapsed = 0;
    while (elapsed < ms && !this.isStopped) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(checkInterval, ms - elapsed))
      );
      elapsed += checkInterval;
    }
  }
}
