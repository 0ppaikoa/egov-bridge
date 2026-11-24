// Vite + CRXJS 設定。manifest はここで明示的に定義する（監査しやすさ優先）。
import { defineConfig } from 'vite';
import { crx, defineManifest } from '@crxjs/vite-plugin';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const manifest = defineManifest({
  manifest_version: 3,
  name: 'e-Gov 電子申請ブリッジ（非公式）',
  short_name: 'e-Gov bridge',
  version: pkg.version,
  description:
    'e-Gov電子申請をブラウザから直接操作するための実験的ブリッジ。デジタル庁とは無関係の非公式ツール。',
  minimum_chrome_version: '111',
  permissions: ['declarativeNetRequestWithHostAccess', 'scripting'],
  host_permissions: [
    'https://shinsei.e-gov.go.jp/*',
    'https://shinsei.kn.e-gov.go.jp/*',
    'https://shinsei2.sbx.e-gov.go.jp/*',
    'https://shinsei-min.kn.e-gov.go.jp/*',
    'https://account.e-gov.go.jp/*',
    'https://account-min.kn.e-gov.go.jp/*',
  ],
  declarative_net_request: {
    rule_resources: [{ id: 'ua', enabled: true, path: 'rules/ua.json' }],
  },
  action: {
    default_title: 'e-Gov 電子申請ブリッジ（非公式）',
    default_popup: 'popup.html',
  },
  content_scripts: [
    {
      matches: [
        'https://shinsei.e-gov.go.jp/*',
        'https://shinsei.kn.e-gov.go.jp/*',
        'https://shinsei2.sbx.e-gov.go.jp/*',
        'https://shinsei-min.kn.e-gov.go.jp/*',
      ],
      js: ['src/content/bridge.iife.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
  ],
});

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'chrome111',
    minify: false,
    sourcemap: false,
  },
});
