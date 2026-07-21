export interface AdapterResult {
  content: string;
  contentType: string;
  metadata: Record<string, unknown>;
}

export class HtmlAdapter {
  name = 'html';

  async extract(input: string): Promise<AdapterResult> {
    return {
      content: input,
      contentType: 'text/html',
      metadata: { adapter: this.name }
    };
  }
}
