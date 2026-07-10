// src/lib/agent/markdown.ts
//
// Tiny, dependency-free, XSS-safe Markdown to HTML for the assistant chat bubbles.
// The Hermes gateway model replies in Markdown (**bold**, `code`, lists, headings,
// links); rendered as plain text the raw syntax leaked into the UI. We render a
// whitelisted subset instead.
//
// SECURITY: every character of the model output is HTML-escaped BEFORE any
// transform runs, and the ONLY tags this function emits are the fixed set below
// (links restricted to http/https/mailto). So model output can never inject
// markup; it is safe to pass the result to {@html}.

// Placeholders use the NUL char as delimiter: it never appears in real chat text
// and is not markdown-special, so protected spans survive escaping + parsing
// without colliding with real content.
const NUL = '\x00';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Inline transforms on text that is ALREADY html-escaped + code-protected.
function applyInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_]*?)_/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>'
    );
}

// Memo: the chat page reloads the whole message list from Dexie on every send
// (fresh object identities), so each bubble would re-run the full pipeline for
// unchanged content. Rendering is pure (content → html), so a small
// insertion-ordered cache makes repeat renders free.
const MEMO_MAX = 400;
const memo = new Map<string, string>();

// Render a Markdown string to a safe HTML subset.
export function renderMarkdown(src: string): string {
  if (!src) return '';
  const hit = memo.get(src);
  if (hit !== undefined) return hit;
  const html = renderMarkdownUncached(src);
  if (memo.size >= MEMO_MAX) {
    // Drop the oldest entry (Map preserves insertion order).
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(src, html);
  return html;
}

function renderMarkdownUncached(src: string): string {

  // 1) Extract fenced code blocks first so nothing transforms inside them.
  const codeBlocks: string[] = [];
  let text = src.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_m, code: string) => {
    codeBlocks.push('<pre><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>');
    return NUL + 'CB' + (codeBlocks.length - 1) + NUL;
  });

  // 2) Escape everything else (placeholders contain no escapable chars).
  text = escapeHtml(text);

  // 3) Protect inline code spans (content already escaped in step 2).
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_m, c: string) => {
    inlineCodes.push('<code>' + c + '</code>');
    return NUL + 'IC' + (inlineCodes.length - 1) + NUL;
  });

  // 4) Block-level parse, line by line.
  const lines = text.split('\n');
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let paraBuf: string[] = [];

  const closeList = (): void => {
    if (listType) {
      out.push('</' + listType + '>');
      listType = null;
    }
  };
  const flushPara = (): void => {
    if (paraBuf.length) {
      out.push('<p>' + applyInline(paraBuf.join(' ')) + '</p>');
      paraBuf = [];
    }
  };

  const cbLine = new RegExp('^' + NUL + 'CB\\d+' + NUL + '$');

  for (const raw of lines) {
    const line = raw.trim();

    if (cbLine.test(line)) {
      flushPara();
      closeList();
      out.push(line); // fenced-code placeholder, restored at the end
      continue;
    }
    if (!line) {
      flushPara();
      closeList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      closeList();
      const lvl = Math.min(6, h[1].length + 2); // #->h3, keep chat headings small
      out.push('<h' + lvl + '>' + applyInline(h[2]) + '</h' + lvl + '>');
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      flushPara();
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push('<li>' + applyInline(ul[1]) + '</li>');
      continue;
    }
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      flushPara();
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push('<li>' + applyInline(ol[1]) + '</li>');
      continue;
    }
    // NB: by this point the text is already HTML-escaped, so a markdown
    // quote line starts with '&gt;', not a literal '>'.
    const bq = /^&gt;\s?(.*)$/.exec(line);
    if (bq) {
      flushPara();
      closeList();
      out.push('<blockquote>' + applyInline(bq[1]) + '</blockquote>');
      continue;
    }
    closeList();
    paraBuf.push(line);
  }
  flushPara();
  closeList();

  // 5) Restore protected spans/blocks.
  let html = out.join('\n');
  html = html.replace(new RegExp(NUL + 'IC(\\d+)' + NUL, 'g'), (_m, i: string) => inlineCodes[Number(i)] ?? '');
  html = html.replace(new RegExp(NUL + 'CB(\\d+)' + NUL, 'g'), (_m, i: string) => codeBlocks[Number(i)] ?? '');
  return html;
}
