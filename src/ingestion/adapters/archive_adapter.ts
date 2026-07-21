import { AdapterResult } from './html_adapter';

export class ArchiveAdapter {
  name = 'archive';

  async extract(input: string): Promise<AdapterResult> {
    return {
      content: input,
      contentType: 'application/archive',
      metadata: { adapter: this.name }
    };
  }
}
