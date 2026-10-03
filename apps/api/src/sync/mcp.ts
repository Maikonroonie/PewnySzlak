/** Minimalny klient MCP (Streamable HTTP, bez sesji) – JSON-RPC tools/list i tools/call. */
export type McpToolResult<T = unknown> = { structured: T | null; text: string; isError: boolean };

export class McpClient {
  private nextId = 1;
  constructor(private readonly url: string, private readonly timeoutMs = 30_000, private readonly fetchImpl: typeof fetch = fetch) {}

  private async rpc(method: string, params?: unknown): Promise<unknown> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`MCP ${this.url} → HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') ?? '';
    let payload: unknown;
    if (contentType.includes('text/event-stream')) {
      const text = await res.text();
      const dataLines = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
      payload = JSON.parse(dataLines[dataLines.length - 1] ?? '{}');
    } else {
      payload = await res.json();
    }
    const body = payload as { result?: unknown; error?: { code: number; message: string } };
    if (body.error) throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
    return body.result;
  }

  async listTools(): Promise<{ name: string; description?: string }[]> {
    const r = (await this.rpc('tools/list')) as { tools: { name: string; description?: string }[] };
    return r.tools;
  }

  async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<McpToolResult<T>> {
    const r = (await this.rpc('tools/call', { name, arguments: args })) as { content?: { type: string; text?: string }[]; structuredContent?: T; isError?: boolean };
    const text = (r.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
    let structured: T | null = r.structuredContent ?? null;
    if (structured === null && text) {
      // Niektóre serwery zwracają JSON tylko jako tekst (drugi blok).
      for (const c of r.content ?? []) {
        if (c.type === 'text' && c.text && c.text.trim().startsWith('{')) {
          try { structured = JSON.parse(c.text) as T; break; } catch { /* ignore */ }
        }
      }
    }
    return { structured, text, isError: Boolean(r.isError) };
  }
}
