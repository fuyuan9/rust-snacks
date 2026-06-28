import type { LlmConfig } from "./types";

export class LlmClient {
  private config: LlmConfig;

  constructor(config: LlmConfig) {
    this.config = config;
  }

  async generateJson<T>(
    prompt: string,
    retries = 3,
    timeoutMs = 30000,
  ): Promise<T> {
    const provider = this.config.provider || "gemini";

    if (provider === "gemini") {
      return this.callGemini<T>(prompt, retries, timeoutMs);
    }

    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  private async callGemini<T>(
    prompt: string,
    retries: number,
    timeoutMs: number,
  ): Promise<T> {
    const apiKey = this.config.apiKey;
    if (!apiKey) {
      throw new Error("Gemini API key is required but not provided.");
    }

    const model = this.config.model || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    let attempt = 0;

    while (attempt < retries) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(id);

        if (!response.ok) {
          throw new Error(
            `Gemini API returned status ${response.status}: ${await response.text()}`,
          );
        }

        const data = (await response.json()) as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error("Empty response from Gemini API");
        }

        const cleanedText = this.cleanJsonText(text);
        try {
          return JSON.parse(cleanedText) as T;
        } catch (parseError: any) {
          console.error(
            "Failed to parse JSON response from LLM. Raw text:",
            text,
          );
          throw new Error(
            `JSON parse error: ${parseError.message}. Raw text length: ${text.length}`,
          );
        }
      } catch (error: any) {
        clearTimeout(id);
        attempt++;
        if (attempt >= retries) {
          throw new Error(
            `LLM generation failed after ${retries} attempts. Last error: ${error.message}`,
          );
        }
        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 2 ** attempt * 1000),
        );
      }
    }

    throw new Error("LLM generation failed (unknown state)");
  }

  private cleanJsonText(text: string): string {
    let clean = text.trim();
    // Remove markdown code blocks like ```json ... ``` or ``` ... ```
    if (clean.startsWith("```")) {
      const match = clean.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
      if (match) {
        clean = match[1].trim();
      }
    }
    return clean;
  }
}
