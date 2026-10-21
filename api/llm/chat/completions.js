// Vercel Node.js Function - POST /api/llm/chat/completions.
// The logic lives in ../_proxy.js; this file only fixes the route. See docs/adr/0001-llm-proxy.md.
import { proxy } from '../_proxy.js';

export default function handler(req, res) {
  return proxy(req, res, ['chat', 'completions']);
}
