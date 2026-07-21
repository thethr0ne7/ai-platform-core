import { AdapterResult } from './html_adapter.js';

export class ApiAdapter {
  name = 'api';

  async extract(input: string): Promise<AdapterResult> {
    return {
      content: input,
      contentType: 'application/json',
      metadata: { adapter: this.name }
    };
  }
}
