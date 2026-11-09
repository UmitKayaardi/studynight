/**
 * Renders question/answer text. Model output is always treated as text; the only HTML we inject is
 * KaTeX output (generated from the formula string with trust disabled; MathML for screen readers) and
 * highlight.js output (which escapes the code). Both libraries load lazily, only when needed.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type katexModule from 'katex';
import type { HLJSApi } from 'highlight.js';

type Part = { kind: 'text'; value: string } | { kind: 'math'; value: string; display: boolean } | { kind: 'code'; value: string; lang: string };

export function splitRich(text: string): Part[] {
  const parts: Part[] = [];
  const re = /```(\w+)?\n?([\s\S]*?)```|\$\$([\s\S]+?)\$\$|(?<![\\\w$])\$(?!\s)([^$\n]{1,300}?)(?<!\s)\$(?![\w$])/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push({ kind: 'text', value: text.slice(last, m.index) });
    if (m[2] !== undefined) parts.push({ kind: 'code', value: m[2].replace(/\n$/, ''), lang: m[1] ?? '' });
    else if (m[3] !== undefined) parts.push({ kind: 'math', value: m[3], display: true });
    else parts.push({ kind: 'math', value: m[4]!, display: false });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return parts;
}

type Katex = typeof katexModule;
type Hljs = HLJSApi;
let katexP: Promise<Katex> | null = null;
let hljsP: Promise<Hljs> | null = null;
const loadKatex = () =>
  (katexP ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([k]) => (k.default ?? k) as Katex));
const loadHljs = () => (hljsP ??= import('highlight.js/lib/common').then((m) => m.default as unknown as Hljs));

function Math({ value, display }: { value: string; display: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadKatex()
      .then((k) => {
        if (live) setHtml(k.renderToString(value, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore', output: 'htmlAndMathml' }));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [value, display]);
  if (html === null) return <code className="sn-ltr">{value}</code>;
  return <span className={display ? 'my-2 block overflow-x-auto' : ''} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Code({ value, lang }: { value: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadHljs()
      .then((h) => {
        const res = lang && h.getLanguage(lang) ? h.highlight(value, { language: lang }) : h.highlightAuto(value);
        if (live) setHtml(res.value);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [value, lang]);
  return (
    <pre className="sn-code my-2 overflow-x-auto rounded-xl bg-surface-2 p-3 text-sm leading-relaxed">
      {html === null ? (
        <code>{value}</code>
      ) : (
        <code dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </pre>
  );
}

export function RichText({ text, className = '', as: Tag = 'div' }: { text: string; className?: string; as?: 'div' | 'span' | 'p' }): ReactNode {
  const parts = splitRich(text);
  if (parts.length === 1 && parts[0]!.kind === 'text') return <Tag className={`whitespace-pre-line ${className}`}>{text}</Tag>;
  return (
    <Tag className={`whitespace-pre-line ${className}`}>
      {parts.map((p, i) =>
        p.kind === 'text' ? <span key={i}>{p.value}</span> : p.kind === 'math' ? <Math key={i} value={p.value} display={p.display} /> : <Code key={i} value={p.value} lang={p.lang} />,
      )}
    </Tag>
  );
}
