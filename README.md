# egov-bridge

**e-Gov電子申請をブラウザ（Chrome/Edge系）から直接操作するための実験的ブリッジ。
デジタル庁とは一切関係のない、非公式・無保証のツールです。**

## これは何か

e-Gov電子申請の公式アプリ（"e-Gov電子申請アプリケーション"）は WebView の薄い殻で、
申請フォーム本体は `https://shinsei.e-gov.go.jp/recept/` 上の Web アプリです。
この拡張は、ページがネイティブアプリに対して行っている `window.chrome.webview.postMessage`
呼び出しを横取りし、必要な応答をブラウザ側で実装することで、
**公式アプリ相当の振る舞いをブラウザ上で再現**しようとするものです。

現状: **スケルトン段階**。メッセージの観測（ログ）のみ実装済み。実際の送信操作は未実装です。

## できること（現時点）

- ツールバーのアイコンをクリックするとポップアップが開き、以下のリンクを新しいタブで開けます
  - **申請画面を開く** → `https://shinsei.e-gov.go.jp/recept/startup/`（未ログインならログイン画面を経由）
  - **手続を検索する** → `https://shinsei.e-gov.go.jp/recept/procedure-search/`
  - **電子申請トップ** → `https://shinsei.e-gov.go.jp/recept/`
- e-Gov 系ドメインへのリクエストの User-Agent を公式アプリ相当
  （`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ... /clientId=#eG0v@CliEnT!/3.1.0.0`）
  に差し替えます（`declarativeNetRequest`）。アプリが毎リクエストに付与している clientId を合わせるためのものです。
- ページの通信を `service worker` のログに記録（DevTools で `chrome.storage.session.get('bridgeLog')`）

## 注意

- 非公式ツールです。e-Govの利用規約・仕様変更により予告なく動作しなくなります
- User-Agent の偽装は公式アプリに似せた動作をさせるためであり、デジタル庁へのなりすましを意図するものではありません。申請内容の正確性は利用者の責任です
- 申請データの送信は法的効果を持ちます。内容の最終確認は必ずご自身で行ってください
- 本拡張は認証情報を保存しません。e-Govへのログインは通常の e-Gov アカウント / GビズID で行います
- 解析メモは [docs/bridge-protocol.md](docs/bridge-protocol.md) を参照

## インストール（開発版）

1. このリポジトリを clone
2. Chrome で `chrome://extensions` を開き、右上の「デベロッパーモード」をON
3. 「パッケージ化されていない拡張機能を読み込む」でこのリポジトリのルートを選択
4. ツールバーの e-Gov アイコンをクリック → ポップアップから各画面へ

## ビルド / CI

- `scripts/check.mjs` … manifest と各ファイルの静的チェック（CIとローカル共用）
- `scripts/build.sh` … `dist/egov-bridge-<version>.zip` を生成（zip は Python の zipfile を使用）
- GitHub Actions（`.github/workflows/ci.yml`）: push/PR で check → build → zip 検証 → artifact 保存。`v*` タグ push で GitHub Release に zip を添付

## 構成

- `manifest.json` — MV3 マニフェスト
- `src/shim.js` — MAIN world で `window.chrome.webview` を差し替えるスタブ
- `src/bridge.js` — isolated world の中継役（ページ ⇔ service worker）
- `src/background.js` — service worker。現状はログ収集のみ（ハンドラ未実装）
- `src/popup.html` — ツールバーのポップアップ（申請画面へのリンク）
- `rules/ua.json` — User-Agent 上書き用の declarativeNetRequest ルール
- `docs/bridge-protocol.md` — ブリッジプロトコル解析ノート

## ライセンス

MIT License. 著作権表示は LICENSE を参照してください。
e-Govおよび e-Gov電子申請はデジタル庁の商標または名称であり、本プロジェクトは同庁の承認・後援を受けていません。
