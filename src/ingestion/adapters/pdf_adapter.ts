import { AdapterResult } from './html_adapter';

export class PdfAdapter {
  name = 'pdf';

  async extract(input: string): Promise<AdapterResult> {
    return {
      content: input,
      contentType: 'application/pdf',
      metadata: { adapter: this.name }
    };
  }
}
