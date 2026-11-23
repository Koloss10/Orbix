// PreToolUse: забороняє ручне редагування згенерованих файлів (див. CLAUDE.md).
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const GENERATED = [
  'orbix.html',
  'supabase/functions/runner/engine.js',
  'supabase/functions/exchange/exchanges.ts',
  'supabase/functions/exchange/sign.js',
  'supabase/functions/runner/exchanges.ts',
  'supabase/functions/runner/sign.js',
];

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const file = input.tool_input?.file_path || input.tool_input?.notebook_path;
if (!file) process.exit(0);
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const rel = relative(root, resolve(root, file)).split('\\').join('/');
if (GENERATED.includes(rel)) {
  process.stderr.write(
    `${rel} — згенерований файл, вручну не редагується. ` +
    'Зміни джерело (src/orbix.template.html, src/orbix.css, src/js/*, supabase/functions/_shared/*) і запусти `npm run build`.\n'
  );
  process.exit(2);
}
