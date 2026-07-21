import { AdapterResult } from './html_adapter';

export class SitemapAdapter {
  name = 'sitemap';

  async extract(input: string): Promise<AdapterResult> {
    return {
      content: input,
      contentType: 'application/xml',
      metadata: { adapter: this.name }
    };
  }
}
