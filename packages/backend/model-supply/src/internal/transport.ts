export interface ModelProviderTransportRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signal: AbortSignal;
}

export interface ModelProviderTransportResponse {
  readonly status: number;
  readonly body: AsyncIterable<Uint8Array> | null;
}

export interface ModelProviderTransport {
  send(request: ModelProviderTransportRequest): Promise<ModelProviderTransportResponse>;
}

export function createFetchModelProviderTransport(): ModelProviderTransport {
  return {
    async send(request) {
      const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
        signal: request.signal,
      });
      return {
        status: response.status,
        body: response.body,
      };
    },
  };
}
