import * as fs from 'fs';
import * as path from 'path';

const cache = new Map<string, string>();

export class TemplateLoader {
  /**
   * Load template từ packages/prompts/v1
   */
  static loadTemplate(
    name: 'system_chat' | 'summary_plot' | 'summary_session' | 'summary_character' | 'multi_query' | 'auto_turn_ooc'
  ): string {
    if (cache.has(name)) {
      return cache.get(name)!;
    }

    // Ở môi trường dev/runtime, __dirname có thể là packages/prompts/src hoặc packages/prompts/dist
    // __dirname/../v1 trỏ chính xác về thư mục packages/prompts/v1
    const filePath = path.join(__dirname, '..', 'v1', `${name}.md`);
    const content = fs.readFileSync(filePath, 'utf8');
    cache.set(name, content);
    return content;
  }

  loadTemplate(
    name: 'system_chat' | 'summary_plot' | 'summary_session' | 'summary_character' | 'multi_query' | 'auto_turn_ooc'
  ): string {
    return TemplateLoader.loadTemplate(name);
  }
}
