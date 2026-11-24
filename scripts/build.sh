#!/usr/bin/env bash
# 拡張機能パッケージ（Chrome Web Store へアップロード可能なzip）を作る。
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./manifest.json').version")"
export VERSION
rm -rf dist
python3 - <<'PY'
import os, zipfile

version = os.environ['VERSION']
files = ['manifest.json', 'README.md', 'LICENSE']
for base in ('src', 'rules'):
    for dirpath, _dirnames, filenames in os.walk(base):
        for name in sorted(filenames):
            files.append(os.path.join(dirpath, name))

os.makedirs('dist', exist_ok=True)
out = f'dist/egov-bridge-{version}.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, f)
print(f'built {out} ({len(files)} files)')
PY
