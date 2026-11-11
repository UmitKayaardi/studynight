// Fails if any tracked (or staged) file contains a secret or a personal path, or is a local-only file.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const FORBIDDEN_PATHS = [
  /^test-notes\//,
  /^STUDYNIGHT_PLAN\.md$/,
  /^FINAL_REPORT\.md$/,
  /^PROGRESS\.md$/,
  /^\.claude\//,
  /(^|\/)\.env($|\.(?!example$))/,
  /\.(keystore|jks)$/,
];
const SECRET_PATTERNS = [
  { name: 'Groq API key', re: /gsk_[A-Za-z0-9]{20,}/ },
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'personal Windows user path', re: /[A-Za-z]:[\\/]Users[\\/][^\\/\s"'`]+/ },
];

const problems = [];
for (const f of files) {
  if (FORBIDDEN_PATHS.some((re) => re.test(f))) {
    problems.push(`${f}: local-only file must never be committed`);
    continue;
  }
  let size;
  try {
    size = statSync(f).size;
  } catch {
    continue; // deleted in working tree
  }
  if (size > 5 * 1024 * 1024) continue;
  const text = readFileSync(f, 'latin1');
  for (const { name, re } of SECRET_PATTERNS)
    if (re.test(text)) problems.push(`${f}: looks like it contains a ${name}`);
}

if (problems.length) {
  console.error('Secret check failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`Secret check passed (${files.length} files).`);
