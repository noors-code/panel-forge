// The shape PanelForge produces. One Script = one episode of a webtoon.
export interface Panel {
  order: number; // 1-based position in the vertical scroll
  scene: string; // visual description — later fed to an image model
  dialogue: string; // spoken lines (may be empty for silent panels)
  caption: string; // narration/caption box (may be empty)
}

export interface WebtoonScript {
  title: string;
  logline: string; // one-sentence hook
  genre: string;
  panels: Panel[];
}

// What the client sends to generate a script.
export interface GenerateScriptInput {
  prompt: string; // the story idea
  genre?: string; // e.g. "fantasy", "romance", "thriller"
  panelCount?: number; // how many panels (default 8)
}
