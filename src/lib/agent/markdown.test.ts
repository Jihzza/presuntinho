import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders bold, italic and inline code', () => {
    expect(renderMarkdown('a **b** c')).toContain('<strong>b</strong>');
    expect(renderMarkdown('a *b* c')).toContain('<em>b</em>');
    expect(renderMarkdown('use `x = 1` here')).toContain('<code>x = 1</code>');
  });

  it('renders headings, unordered and ordered lists', () => {
    expect(renderMarkdown('## Title')).toContain('<h4>Title</h4>');
    const ul = renderMarkdown('- a\n- b');
    expect(ul).toContain('<ul>');
    expect(ul).toContain('<li>a</li>');
    const ol = renderMarkdown('1. a\n2. b');
    expect(ol).toContain('<ol>');
    expect(ol).toContain('<li>a</li>');
  });

  it('renders a fenced code block verbatim (no inner transforms)', () => {
    const html = renderMarkdown('```\n**not bold**\n```');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('**not bold**'); // stays literal inside code
    expect(html).not.toContain('<strong>');
  });

  it('renders safe links and rejects javascript: URLs', () => {
    expect(renderMarkdown('[go](https://x.com)')).toContain('<a href="https://x.com"');
    // a javascript: URL does not match the http/mailto whitelist, so it is left
    // as escaped text — never an anchor.
    const evil = renderMarkdown('[x](javascript:alert(1))');
    expect(evil).not.toContain('<a ');
    expect(evil).not.toContain('javascript:alert(1)</a>');
  });

  it('escapes all HTML so model output cannot inject markup', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> and <script>bad()</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders blockquotes (post-escape "&gt;" lines)', () => {
    const html = renderMarkdown('> Nota: revê a lição.\n\nTexto normal.');
    expect(html).toContain('<blockquote>Nota: revê a lição.</blockquote>');
    expect(html).toContain('<p>Texto normal.</p>');
    expect(html).not.toContain('&gt; Nota');
  });

  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });
});
