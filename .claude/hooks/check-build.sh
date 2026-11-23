#!/usr/bin/env bash
# Stop: нагадує зібрати проєкт, якщо згенеровані файли застаріли.
# Не зациклюватися: якщо вже раз нагадали — відпускаємо.
grep -q '"stop_hook_active": *true' <(cat) && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
out=$(npm run --silent check 2>&1) && exit 0
echo "npm run check не пройшов — згенеровані файли застаріли. Запусти \`npm run build\` (і \`npm test\`) перед комітом." >&2
echo "$out" | tail -5 >&2
exit 2
