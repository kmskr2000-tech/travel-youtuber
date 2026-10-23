#!/usr/bin/env bash
# GitHub Pages(legacy, gh-pages 브랜치) 배포. 테스트 통과 후 캐시 무효화 주입본을 gh-pages에 올린다.
# 사용: tools/deploy.sh   (main 소스는 변경하지 않음)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
node --test test/*.test.mjs >/dev/null
REMOTE="$(git remote get-url origin)"
V="$(date +%s)"
D="$(mktemp -d)"
cp -r index.html css src data "$D"/
cd "$D" || exit 1
echo "{\"v\":$V}" > version.json
touch .nojekyll
sed -i "s#</head>#<script>window.__V=$V;</script>\n</head>#" index.html
sed -i -E "s#(href=\"css/[a-z0-9]+\.css)\"#\1?v=$V\"#; s#src=\"src/main\.js\"#src=\"src/main.js?v=$V\"#" index.html
find src -name '*.js' -exec sed -i -E "s#(from '\.[^']*\.js)'#\1?v=$V'#" {} +
git init -q -b gh-pages
git add -A
git -c user.name="deploy" -c user.email="deploy@users.noreply.github.com" commit -q -m "deploy $V"
git push -q -f "$REMOTE" gh-pages
echo "deployed v=$V"
rm -rf "$D"
