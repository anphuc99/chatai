import { Injectable, OnModuleInit } from '@nestjs/common';
import { TemplateLoader } from '@chatai/prompts';
import { PromptContext } from '../types/prompt-context';
import { LlmMessage } from '../types/llm-message';
import { HistoryEntry } from '../types/history-entry';

const EMOTIONS = [
  'Angry',
  'Shouting',
  'Disgusted',
  'Sad',
  'Scared',
  'Surprised',
  'Shy',
  'Affectionate',
  'Happy',
  'Excited',
  'Serious',
  'Neutral',
];

const INTENSITIES = ['low', 'medium', 'high'];

const STATIC_JSON_EXAMPLE = `{
  "content": [
    {
      "characterName": "Narrator",
      "text": "Mimi bước vào phòng, tay cầm ly trà sữa.",
      "Emotion": "Neutral",
      "Intensity": "low",
      "translation": null,
      "words": null,
      "shopEvent": null
    },
    {
      "characterName": "Mimi",
      "text": "哥哥，你要喝奶茶吗？",
      "Emotion": "Happy",
      "Intensity": "medium",
      "translation": "Anh ơi, anh muốn uống trà sữa không?",
      "words": [
        {"hz": "哥哥", "py": "gēge", "vn": "anh trai"},
        {"hz": "你", "py": "nǐ", "vn": "anh"},
        {"hz": "要", "py": "yào", "vn": "muốn"},
        {"hz": "喝", "py": "hē", "vn": "uống"},
        {"hz": "奶茶", "py": "nǎichá", "vn": "trà sữa"},
        {"hz": "吗", "py": "ma", "vn": "(trợ từ hỏi)"}
      ],
      "shopEvent": null
    }
  ],
  "triggerMemory": false
}`;

@Injectable()
export class PromptBuilderService implements OnModuleInit {
  private systemTemplate: string = '';

  onModuleInit() {
    this.systemTemplate = TemplateLoader.loadTemplate('system_chat');
  }

  buildSystemPrompt(ctx: PromptContext): string {
    const activeNames = ctx.activeCharacters.map(c => c.name).join(', ') || 'Narrator';
    const vars = {
      STORY_TITLE: ctx.story.title,
      STORY_INITIAL_SETTING: ctx.story.initialSetting,
      STORY_CURRENT_PROGRESS: ctx.story.currentProgress || '(Chưa có)',
      CHARACTERS_BLOCK: this.renderCharactersBlock(ctx.activeCharacters),
      TEMP_CHARACTERS_BLOCK: this.renderTempCharactersBlock(ctx.temporaryCharacters),
      HSK_LEVEL: ctx.hskLevel,
      NARRATOR_LANGUAGE: ctx.narratorLanguage,
      ACTIVE_CHARACTERS: activeNames,
      EMOTIONS_LIST: EMOTIONS.join(', '),
      INTENSITIES_LIST: INTENSITIES.join(', '),
      JSON_SCHEMA_EXAMPLE: STATIC_JSON_EXAMPLE,
    };
    return this.applyPlaceholders(this.systemTemplate, vars);
  }

  buildLlmMessages(
    systemPrompt: string,
    history: HistoryEntry[],
    userMessage: string,
    persistentOOC: string | null,
    ephemeralOOCs: string[],
    memoryContext?: string | null
  ): LlmMessage[] {
    const messages: LlmMessage[] = [];

    // 1. System block
    let fullSystem = systemPrompt;
    if (persistentOOC) {
      fullSystem += `\n\n## BỐI CẢNH CỐ ĐỊNH\n${persistentOOC}`;
    }
    if (memoryContext) {
      fullSystem += `\n\n## KÝ ỨC LIÊN QUAN\n${memoryContext}`;
    }
    messages.push({ role: 'system', content: fullSystem });

    // 2. Extract checkpoint nếu có ở đầu lịch sử
    const workingHistory = [...history];
    const firstEntry = workingHistory[0];
    if (firstEntry && firstEntry.type === 'checkpoint') {
      const summary = firstEntry.data.summary;
      messages.push({
        role: 'system',
        content: `## TÓM TẮT CÁC SỰ KIỆN TRƯỚC ĐÓ\n${summary}`,
      });
      workingHistory.shift();
    }

    // 3. Process history
    for (const entry of workingHistory) {
      switch (entry.type) {
        case 'user': {
          let txt = entry.data.text;
          if (entry.data.ephemeralOOC) {
            txt = `[OOC: ${entry.data.ephemeralOOC}]\n${txt}`;
          }
          messages.push({ role: 'user', content: txt });
          break;
        }
        case 'assistant_batch': {
          messages.push({
            role: 'assistant',
            content: JSON.stringify({
              content: entry.data.messages,
              triggerMemory: entry.data.triggerMemory ?? false,
            }),
          });
          break;
        }
        case 'checkpoint': {
          messages.push({
            role: 'system',
            content: `## TÓM TẮT TRƯỚC ĐÓ (PHỤ)\n${entry.data.summary}`,
          });
          break;
        }
        case 'character_toggle': {
          const action = (entry.data as any).on ? 'vừa xuất hiện' : 'vừa rời khỏi cảnh';
          messages.push({
            role: 'system',
            content: `[Thông báo: ${(entry.data as any).name} ${action}]`,
          });
          break;
        }
        case 'persistent_ooc':
        case 'ephemeral_ooc':
        case 'system':
        default:
          // skip
          break;
      }
    }

    // 4. Append current user turn
    let curr = userMessage;
    const allEphemeral = [...ephemeralOOCs];
    if (allEphemeral.length > 0) {
      curr = `[OOC: ${allEphemeral.join('; ')}]\n${curr}`;
    }
    messages.push({ role: 'user', content: curr });

    return messages;
  }

  private renderCharactersBlock(characters: PromptContext['activeCharacters']): string {
    if (!characters || characters.length === 0) {
      return 'Chưa có nhân vật active. Chỉ Narrator nói chuyện.';
    }
    return characters
      .map(
        c =>
          `- Tên: ${c.name}, Tuổi: ${c.age ?? 'không rõ'}\n  Tính cách: ${c.personality}`
      )
      .join('\n');
  }

  private renderTempCharactersBlock(temps: PromptContext['temporaryCharacters']): string {
    if (!temps || temps.length === 0) {
      return '';
    }
    const rendered = temps
      .map(t => `- Tạm thời: ${t.name} — ${t.description}`)
      .join('\n');
    return `## NHÂN VẬT TẠM THỜI\n${rendered}`;
  }

  private applyPlaceholders(template: string, vars: Record<string, string>): string {
    return Object.entries(vars).reduce(
      (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)),
      template
    );
  }
}
