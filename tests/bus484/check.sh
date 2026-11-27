#!/bin/bash
# Pre-push / CI guard for bus484/index.html:
#  1. every inline <script> must parse (catches e.g. a // comment that swallowed the rest of a line)
#  2. the jsdom harnesses must run without page errors
# Exit code != 0 blocks the push (git pre-push hook) or fails the CI run.
set -u
cd "$(dirname "$0")"
HTML=../../bus484/index.html
fail=0
TMP=$(mktemp -d)
node -e '
const fs=require("fs"); const html=fs.readFileSync(process.argv[1],"utf8"); let i=0;
for(const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) fs.writeFileSync(process.argv[2]+"/s"+(i++)+".js",m[1]);
console.log(i+" inline scripts");' "$HTML" "$TMP"
for f in "$TMP"/*.js; do node --check "$f" || { echo "SYNTAX ERROR in inline script $(basename "$f")"; fail=1; }; done
rm -rf "$TMP"
[ $fail = 0 ] || exit 1
[ -d node_modules ] || npm ci --silent >/dev/null 2>&1 || npm install --silent >/dev/null 2>&1
out=$(for t in t*.js; do echo "=== $t"; timeout 90 node "$t" 2>&1; done)
bad=$(echo "$out" | grep -v "Not implemented" | grep -E "jsdomError|SyntaxError|ReferenceError|TypeError: |ERRORS: \[[^]]" | head -5)
ok=$(echo "$out" | grep -c "ERRORS: \[\]")
if [ -n "$bad" ]; then echo "PAGE ERRORS:"; echo "$bad"; exit 1; fi
echo "OK: syntax fine, $ok harness checks without page errors"
