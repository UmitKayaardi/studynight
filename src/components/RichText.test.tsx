import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RichText, splitRich } from './RichText';

describe('splitRich', () => {
  it('splits text, inline maths, display maths and code', () => {
    expect(splitRich('Plain text only')).toEqual([{ kind: 'text', value: 'Plain text only' }]);
    expect(splitRich('Area is $\\pi r^2$ here').map((p) => p.kind)).toEqual(['text', 'math', 'text']);
    expect(splitRich('$$E=mc^2$$')[0]).toEqual({ kind: 'math', value: 'E=mc^2', display: true });
    expect(splitRich('Run:\n```python\nprint(1)\n```')[1]).toEqual({
      kind: 'code',
      value: 'print(1)',
      lang: 'python',
    });
  });
  it('does not treat prices as maths', () => {
    expect(splitRich('It costs $5 and $10 later').every((p) => p.kind === 'text')).toBe(true);
  });
});

describe('RichText', () => {
  it('renders model output as text, never as HTML', () => {
    render(<RichText text={'<img src=x onerror="alert(1)"> hello'} />);
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
