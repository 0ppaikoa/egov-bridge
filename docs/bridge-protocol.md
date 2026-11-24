# e-Gov電子申請 ブリッジ仕様 解析ノート

本書は、e-Gov電子申請アプリケーション（Windows/macOS 版）の静的解析によって判明した、
Webアプリ側 ↔ ネイティブアプリ間の通信仕様をまとめたものです。
事実関係の記録であり、e-Govの仕様は予告なく変更される可能性があります。

解析対象: e-Gov電子申請アプリ 2.1.0.0 (macOS版, .NET MAUI / Mac Catalyst, net10.0)
Windows版 3.1.0.0 は同一コードベースと推定（未確認）。

## 全体像

- 実体は `https://shinsei.e-gov.go.jp/recept/` を表示する WebView (Windows: WebView2 / macOS: WKWebView)
- ページ内JS → ネイティブ: `window.chrome.webview.postMessage(jsonText)`（mac版はポリフィルで `webkit.messageHandlers.F3egclPostMessage` に変換）
- ネイティブ → ページ: ページ側が定義するグローバル `F3egclMessageEventListenerMac` / `F3egclMessageEventListenerWin`（Windows系）を `{"uuid":..., "resolve"/"resolveJson"/"reject": ...}` というJSON文字列で呼び出す
- macOS版はページに対し `window.chrome = { webview: {...} }` ポリフィルを注入しているのが確認済み

## メッセージエンベロープ

JS → ネイティブ（JSON文字列をパースすると配列）:

```
["<コマンド名>", "<uuid>", <引数0>, <引数1>, ...]
```

ネイティブ → JS（JSON文字列）:

```
{"uuid": "<受け取ったuuid>", "resolve": "<文字列結果>"}
{"uuid": "<uuid>", "resolveJson": <JSON値>}   // JSON文字列をパースして返す場合
{"uuid": "<uuid>", "resolve": <数値>}         // 数値結果（例: 0=成功）
{"uuid": "<uuid>", "reject": "<エラーメッセージ>"}
```

ネイティブ側は受信後に `Task.Run` で非同期処理し、上記いずれかの形で返す。
コマンド未対応の場合は応答しない実装になっている（クライアント側はタイムアウト待ちになる）。

## 主要コマンド群（分類）

`F3egcl*` プレフィックスが混在。分類は機能単位:

- `F3egclInitAppli_*` … セッション/申請データ初期化（`initAppli`, `tagMapping`, `initDocumentDetails` 等）
- `F3egclXMLDataAppli_*` … 申請書XMLの読み書き（`storeWorkXMLFile`, `getXMLFormInfo`, `changeProc`, `deleteForm` 等）
- `F3egclFileManageAppli_*` … ファイル操作・送信（`SignAndSend`, `SignAndSendPartSign`, `SaveApplication`, `LoadApplication`, `AppendAttachedAttribute*` 等）
- `F3egclSignatureAppli_*` … 署名前後処理（`UrlExistsCheck`, `checkInputItem`, `SignAndSave` など。実際の署名は別系統）
- `F3egclTagConfCheck_*` … 入力値チェック
- その他汎用: `SetPresentationOrgInfoPartSignGroup`, `AddAttachedFile_*`, `CancelDigitalAuth` 等

相互方向（ネイティブ→JS の呼び出し、アプリがページの関数を呼ぶ）:
`F3egclGetValue`, `F3egclSetValueForXml[2]`, `F3egclGrpLength`, `F3egclGrpAddRow`, `F3egclCallSetXMLDoc`,
`F3egclCallGetXMLDoc`, `F3egclPollAsync`, `F3egclCallAsyncV2` ほか。

## 署名フロー

### A. デジタル認証（スマートフォン署名）— ローカル暗号処理なし

1. アプリは SignedInfo（参照URIは `#` + UrlEncode("構成情報")、digestMethod SHA-256、C14N）を
   使い捨ての RSA-2048 鍵で一旦署名し、その SignedInfo を C14N して Base64 化
2. `POST /digital-auth/start-sign`（`data`, `targetProcId`, `dispProcName`、application/x-www-form-urlencoded）
   - レスポンス: `{ authorization_url, sign_transaction_id, wait_time_ms, max_retries, poll_interval_ms }`
3. `authorization_url` を OS のブラウザで開く（ユーザーはマイナアプリで署名）
4. `GET /digital-auth/poll?signTransactionId=...` をポーリング（`X-CSRF-Token` ヘッダ + セッションCookie + `X-Requested-With: XMLHttpRequest`）
5. `{ signature, certificate }` が返ったら、XML の `<署名情報>` 要素に `<Signature>` 要素を追記して完了
   - この方式では署名値・証明書がサーバ/マイナアプリ側で生成されるため、
     クライアント側に証明書や鍵は一切要らない

### B. ローカル証明書（PFX など）署名

- `System.Security.Cryptography.Xml.SignedXml`（RSA-SHA256, C14N）による XMLDSig
- `application/x-pkcs12` の PFX を読み込み、署名情報を `<署名情報>` に埋め込む
- JPKI（マイナンバーカード直接）経路はネイティブ依存（`JPKIServiceAPI64.dll` / `libJSAMac.dylib`、PC/SC経由）。Linux では再現困難

## 環境

- 本番: `https://shinsei.e-gov.go.jp/recept/`
- 検証環境: `https://shinsei.kn.e-gov.go.jp/`（要 Basic 認証、401 が返る）
- 開発/体験版: `shinsei2.sbx.e-gov.go.jp`（`/Taiken` パス）、`shinsei-min.kn.e-gov.go.jp`（`account-min.kn...`）
- アプリは `/recept/startup/?proc_id=...&group_id=...&fqdn=<host>` で起動し、`fqdn` はホワイトリスト内のみ受け付ける
- アプリは `User-Agent` に ` /clientId=#eG0v@CliEnT!/<バージョン>` を付加する（この拡張の `rules/ua.json` も同様の UA を `declarativeNetRequest` で設定する。値は macOS版バイナリのリソースから抽出）
- セッション識別: Cookie `JSESSIONID`、CSRF: hidden input `_csrf` → ヘッダ `X-CSRF-Token`

## 法的・運用上の注意（要約）

- 本拡張は非公式。e-Govの仕様は予告なく変わり、拡張は動かなくなりうる
- 送信は利用者本人の操作・責任で行うこと。最終的な「申請」操作は拡張では自動化しない方針
- 配布物に e-Gov の著作物たるコードや解析原文を含めない

## 解析環境

- 調査日: 2026-11-24
- 対象: e-Gov電子申請アプリケーション for macOS 2.1.0.0（.pkg, .NET MAUI / Mac Catalyst, net10.0, IL-only）
- Windows版 (3.1.0.0, .msi, .NET 10 + .NET Framework 4.7.2) は未展開（CAB が LZX 圧縮のため）だが、同一コードベースと推定
