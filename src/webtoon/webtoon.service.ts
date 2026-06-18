import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  GenerateScriptInput,
  Panel,
  WebtoonScript,
} from './webtoon.types';

// PanelForge's brain: turn a story idea into a panel-by-panel webtoon script.
// Mirrors the clarity-backend pattern — graceful degradation when no API key:
// the whole pipeline still runs in "mock mode" so you can build for free.
@Injectable()
export class WebtoonService {
  private readonly logger = new Logger(WebtoonService.name);
  private readonly anthropic: Anthropic | null;
  // Simple in-memory image cache (cache-aside). Key = full request signature.
  // First request fetches + stores; repeats are instant. Unbounded for now —
  // in prod you'd cap size / TTL or push to S3 + CDN.
  private readonly imgCache = new Map<string, Buffer>();

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.anthropic = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.anthropic) {
      this.logger.warn(
        'ANTHROPIC_API_KEY missing — running in MOCK mode (free, no API calls).',
      );
    }
  }

  async generateScript(input: GenerateScriptInput): Promise<WebtoonScript> {
    const panelCount = Math.min(Math.max(input.panelCount ?? 8, 3), 12);
    const genre = input.genre ?? 'slice-of-life';

    // No key → deterministic mock so the reader still has something to show.
    if (!this.anthropic) {
      return this.mockScript(input.prompt, genre, panelCount);
    }

    const system = `You are PanelForge, a webtoon scriptwriter. You break a story idea
into a vertical-scroll webtoon episode. Return ONLY valid JSON, no markdown fences,
matching exactly this shape:
{"title": string, "logline": string, "genre": string,
 "panels": [{"order": number, "scene": string, "dialogue": string, "caption": string}]}
Rules: exactly ${panelCount} panels; "scene" is a vivid visual description for an
image model (no text/speech in the image); "dialogue" is spoken lines (may be empty);
"caption" is a narration box (may be empty). Keep a consistent protagonist and tone.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6', // fast + cheap; swap to claude-opus-4-8 for richer output
        max_tokens: 4000,
        system,
        messages: [
          {
            role: 'user',
            content: `Genre: ${genre}. Story idea: ${input.prompt}. Generate the ${panelCount}-panel webtoon script as JSON.`,
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === 'text') as
        | { type: 'text'; text: string }
        | undefined;
      if (!textBlock?.text) {
        throw new Error(`No text block. stop_reason=${response.stop_reason}`);
      }

      // Strip accidental ```json fences, then parse.
      const cleaned = textBlock.text
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '')
        .trim();
      return JSON.parse(cleaned) as WebtoonScript;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Generation failed, falling back to mock: ${message}`);
      return this.mockScript(input.prompt, genre, panelCount);
    }
  }

  // Deterministic placeholder script — proves the pipeline with zero API cost.
  private mockScript(
    prompt: string,
    genre: string,
    panelCount: number,
  ): WebtoonScript {
    // A coherent narrative arc: each beat carries a SCENE (for the image),
    // a CAPTION (narration — the story voice), and DIALOGUE (spoken line).
    // Generic but readable, so the free/mock mode still tells a real story.
    const beats = [
      { scene: 'a wide establishing shot of the world where it all begins, calm and still', cap: 'Every story starts somewhere.', dlg: '' },
      { scene: 'the protagonist alone, lost in thought, longing for something more', cap: 'And ours begins with a single, quiet longing.', dlg: 'There has to be more than this.' },
      { scene: 'a sudden disruption shattering the calm, dramatic lighting', cap: 'But fate rarely knocks gently.', dlg: '...what was that?' },
      { scene: 'a fateful first meeting between two figures, eyes locking', cap: 'Some meetings change everything.', dlg: "You. I know you, don't I?" },
      { scene: 'a tense, charged moment of decision, hesitation on their face', cap: 'A choice appeared, and with it, a risk.', dlg: "If I do this, there's no going back." },
      { scene: 'a sudden setback striking hard, the stakes rising', cap: 'Of course, it was never going to be easy.', dlg: 'No, not like this!' },
      { scene: 'a quiet, tender moment of connection in the dark', cap: 'Yet even in the dark, there was warmth.', dlg: "You're not alone. Not anymore." },
      { scene: 'the turning point, the protagonist filled with resolve', cap: 'And that was when everything turned.', dlg: 'I finally understand what I have to do.' },
      { scene: 'rising tension building toward the climax, storm gathering', cap: 'The moment they had feared was here.', dlg: 'This ends tonight.' },
      { scene: 'the dramatic peak of the confrontation, full of emotion', cap: 'Everything they were led to this.', dlg: "I won't run anymore." },
      { scene: 'the aftermath, calm settling over a changed world', cap: 'When the dust settled, nothing was the same.', dlg: 'So... what happens now?' },
      { scene: 'a final lingering shot hinting at more to come', cap: 'But this was only the beginning.', dlg: 'Wait, did you hear that?' },
    ];
    const panels: Panel[] = Array.from({ length: panelCount }, (_, i) => {
      const b = beats[i % beats.length];
      return {
        order: i + 1,
        scene: `${b.scene}, ${genre} setting, themed around: ${prompt}`,
        dialogue: b.dlg,
        caption: b.cap,
      };
    });
    return {
      title: this.titleFrom(prompt),
      logline: `A ${genre} tale: ${prompt}`,
      genre,
      panels,
    };
  }

  // Cache-aside image fetch: check cache -> miss -> fetch upstream (with retries)
  // -> store -> return. The server, not the browser, talks to the image provider.
  async getImage(
    prompt: string,
    w: number,
    h: number,
    seed: number,
  ): Promise<Buffer> {
    const key = `${w}x${h}:${seed}:${prompt}`;
    const cached = this.imgCache.get(key);
    if (cached) return cached;

    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`;

    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`upstream ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        this.imgCache.set(key, buf);
        return buf;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('image fetch failed');
  }

  private titleFrom(prompt: string): string {
    const words = prompt.split(/\s+/).slice(0, 4).join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
}
