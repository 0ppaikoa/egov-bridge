# egov-bridge

**e-Gov電子申請をブラウザ（Chrome/Edge系）から直接操作するための実験的ブリッジ。
デジタル庁とは一切関係のない、非公式・無保証のツールです。**

## これは何か

e-Gov電子申請の公式アプリ（"e-Gov電子申請アプリケーション"）は WebView の薄い殻で、
申請フォーム本体は `https://shinsei.e-gov.go.jp/recept/` 上の Web アプリです。
この拡張は、ページがネイティブアプリに対して行っている `window.chrome.webview.postMessage`
呼び出しを横取りし、必要な応答をページ内の JavaScript で実装することで、
**公式アプリ相当の振る舞いをブラウザ上で再現**しようとするものです。

## できること（現時点）

- ツールバーのアイコンをクリックするとポップアップが開き、以下のリンクを新しいタブで開けます
  - **申請画面を開く** → `https://shinsei.e-gov.go.jp/recept/startup/`（未ログインならログイン画面を経由）
  - **手続を検索する** → `https://shinsei.e-gov.go.jp/recept/procedure-search/`
  - **電子申請トップ** → `https://shinsei.e-gov.go.jp/recept/`
- e-Gov 系ドメインへのリクエストの User-Agent を公式アプリ相当
  （`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ... /clientId=#eG0v@CliEnT!/3.1.0.0`）
  に差し替えます（`declarativeNetRequest`）。アプリが毎リクエストに付与している clientId を合わせるためのものです。
- `window.chrome.webview` ブリッジの骨組みを実装済み（MAIN world で `postMessage` を解釈し、
  `F3egclMessageEventListenerMac` へ応答を返す）。各コマンドハンドラは順次実装中。

## 注意

- 非公式ツールです。e-Govの利用規約・仕様変更により予告なく動作しなくなります
- User-Agent の偽装は公式アプリに似せた動作をさせるためであり、デジタル庁へのなりすましを意図するものではありません。申請内容の正確性は利用者の責任です
- 申請データの送信は法的効果を持ちます。内容の最終確認は必ずご自身で行ってください
- 本拡張は認証情報を保存しません。e-Govへのログインは通常の e-Gov アカウント / GビズID で行います
- 解析メモは [docs/bridge-protocol.md](docs/bridge-protocol.md) と [docs/command-catalog.md](docs/command-catalog.md) を参照

## インストール（開発版）

1. このリポジトリを clone
2. `npm ci`
3. `npm run build`
4. Chrome で `chrome://extensions` を開き、右上の「デベロッパーモード」をON
5. 「パッケージ化されていない拡張機能を読み込む」でリポジトリのルートを選択
   （`vite.config.mjs` が manifest を生成するので、必ず `npm run build` してから読み込んでください）

## ビルド / CI

- `npm run build` … Vite (+@crxjs/vite-plugin) で `dist/` にビルド
- `npm run pack` … `dist/egov-bridge-<version>.zip` を生成（ストア提出用）
- `npm run check` … `dist/` の検証（manifest の必須項目・MAIN world 宣言・DNR ルール等）
- GitHub Actions（`.github/workflows/ci.yml`）: push/PR で npm ci → build → check → zip 検証 → artifact 保存。`v*` タグ push で GitHub Release に zip を添付

## 構成

- `vite.config.mjs` — Vite + CRXJS。manifest はここで `defineManifest`
- `src/content/bridge.iife.js` — MAIN world エントリ。IIFE として document_start で実行
- `src/bridge/*.js` — ブリッジ本体（ディスパッチャ・応答・コマンド実装）
- `popup.html` — ツールバーのポップアップ（申請画面へのリンク）
- `public/rules/ua.json` — User-Agent 上書き用の declarativeNetRequest ルール
- `docs/bridge-protocol.md` — ブリッジプロトコル解析ノート
- `docs/command-catalog.md` — ネイティブ側71コマンドの全カタログ

## ライセンス

MIT License. 著作権表示は LICENSE を参照してください。
e-Govおよび e-Gov電子申請はデジタル庁の商標または名称であり、本プロジェクトは同庁の承認・後援を受けていません。
