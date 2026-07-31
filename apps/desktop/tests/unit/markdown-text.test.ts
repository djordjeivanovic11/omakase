import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownText } from '../../src/renderer/components/MarkdownText.js';

describe('MarkdownText', () => {
  it('renders fenced math blocks with KaTeX', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownText, {
        markdown: '```math\nx_T \\sim \\mathcal N(0, I)\n```',
      }),
    );

    expect(html).toContain('katex-display');
    expect(html).toContain('∼');
    expect(html).toContain('mathvariant="script"');
  });

  it('renders inline math even when the expression contains parentheses', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownText, {
        markdown: 'The score is \\(\\nabla_x \\log p_t(x)\\).',
      }),
    );

    expect(html).toContain('katex');
    expect(html).toContain('∇');
  });

  it('keeps programming fences as code blocks', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownText, {
        markdown: '```python\ndef step(x):\n    return x\n```',
      }),
    );

    expect(html).toContain('code-block');
    expect(html).toContain('python');
    expect(html).toContain('def step');
    expect(html).not.toContain('katex-display');
  });
});
