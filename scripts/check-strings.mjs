// Fails on hard-coded user-facing strings in components (plan section 11.2, guard 2).
// Checks JSX text and user-facing JSX attributes in src/**/*.tsx with the TypeScript parser. Text that is not
// language (symbols, numbers, the brand name) is ignored. A line can opt out with an `i18n-ignore` comment.
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ATTRS = new Set([
  'aria-label',
  'title',
  'placeholder',
  'alt',
  'label',
  'aria-description',
  'aria-valuetext',
]);
const ALLOWED_TEXT = new Set(['StudyNight', 'KaTeX', 'Groq', 'Vercel', 'GitHub', 'FSRS', 'PDF', 'XP', 'OK']);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') && !p.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

const isLanguage = (s) => {
  const t = s.trim();
  if (!t || ALLOWED_TEXT.has(t)) return false;
  return /\p{L}{2,}/u.test(t);
};

const problems = [];
for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const report = (node, value) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
    if (/i18n-ignore/.test(lines[line] ?? '') || /i18n-ignore/.test(lines[line - 1] ?? '')) return;
    problems.push(`${file}:${line + 1}: "${value.trim().slice(0, 60)}"`);
  };
  const visit = (node) => {
    if (ts.isJsxText(node) && isLanguage(node.text)) report(node, node.text);
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf);
      if (ATTRS.has(name)) {
        const init = node.initializer;
        let lit = null;
        if (ts.isStringLiteral(init)) lit = init.text;
        else if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression))
          lit = init.expression.text;
        if (lit && isLanguage(lit)) report(node, lit);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (problems.length) {
  console.error('Hard-coded user-facing strings found (use t()):\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('No hard-coded user-facing strings.');
