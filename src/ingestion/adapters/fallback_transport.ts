import { AdapterResult } from './html_adapter';

export class FallbackTransport {
  name = 'fallback';

  async extract(input: string): Promise<AdapterResult> {
    return {
      content: input,
      contentType: 'application/octet-stream',
      metadata: { adapter: this.name }
    };
  }
}
