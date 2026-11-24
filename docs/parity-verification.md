# C# ⇄ TypeScript パリティ検証

本リポジトリの JS/TS 実装が、**e-Gov電子申請アプリ（C#/.NET）と同じ値を出すか**を機械的に検証するための手順。

対象: 署名（XML-DSig）、C14N、URLエンコード、SHA-256。

## なぜ必要か

e-Gov へ提出する ZIP の中身は、サーバ側で XML 署名が検証される。
1 バイトでも差があれば「署名不正」で拒否されるため、
「それっぽく動く」では不十分で、**ネイティブと同じバイト列**を作れることが要件になる。

## 何を比較しているか

`scripts/parity-sign.mjs` と `scripts/parity-csharp.mjs` が、
.NET 10 の実装（`System.Security.Cryptography.Xml.SignedXml` / `XmlDsigC14NTransform` /
`System.Net.WebUtility.UrlEncode` / `SHA256`）を**オラクル**として直接叩き、出力を比較する。

| 検証項目                                                                    | 比較相手                                  |
| --------------------------------------------------------------------------- | ----------------------------------------- |
| Inclusive C14N（文書全体・部分木・名前空間・属性順・CDATA・PI・改行コード） | `XmlDsigC14NTransform`                    |
| `WebUtility.UrlEncode`（`~` が `%7E` になる等の .NET 固有挙動を含む）       | `System.Net.WebUtility`                   |
| SHA-256 → Base64                                                            | `SHA256.Create()`                         |
| SignedInfo の C14N（署名対象そのもの）                                      | `SignedXml.SignedInfo.GetXml()` + C14N    |
| 構成情報/申請書/添付のダイジェストと参照 URI                                | `Reference.DigestValue` / `Reference.Uri` |
| 署名値（RSA PKCS#1 v1.5 / SHA-256）                                         | `SignedXml.ComputeSignature()`            |
| 相互運用（.NET が JS の署名を検証できるか）                                 | `RSA.VerifyData()`                        |

## 前提: C# ハーネス

`/tmp/aok/egov-recon/harness` に .NET 10 のコンソールアプリを置く（リポジトリには含めない）。
`Program.cs` の要点:

```csharp
// ネイティブアプリ（eGovClient.dll 69043 / 82827）と同一のサブクラス。
// 既定の SignedXml.GetIdElement は Id/id しか見ないため、ID 属性を解決できない。
class MySignedXml : SignedXml {
    public MySignedXml(XmlDocument doc) : base(doc) { }
    public override XmlElement GetIdElement(XmlDocument document, string idValue) {
        return (XmlElement)document.SelectSingleNode(
            "//*[@ID='" + System.Net.WebUtility.UrlDecode(idValue) + "']");
    }
}
```

これが無いと `ComputeSignature()` が `CryptographicException: Malformed reference element.` で落ちる。
**この事実自体が重要な仕様**で、参照 URI `#構成情報` は
`ID="構成情報"` 属性（`Id` ではない）に対して解決される。

## 実行

```bash
# C# ハーネスのビルド（初回のみ）
export DOTNET_ROOT=/tmp/aok/egov-recon/dotnet
export PATH=$DOTNET_ROOT:$PATH
cd /tmp/aok/egov-recon/harness && dotnet build

# 比較
cd /tmp/aok/egov-bridge
node scripts/parity-csharp.mjs   # C14N / UrlEncode / SHA-256
node scripts/parity-sign.mjs     # SignedInfo / ダイジェスト / 署名値 / 相互運用
```

ハーネスが無い場合、スクリプトは **exit 2 で失敗**する（黙って通さない）。

## 実測結果（2026-11-24）

```
parity-csharp.mjs : すべて一致 (15 checks)
parity-sign.mjs   : すべて一致 (12 checks)
  構成情報のみ: SignedInfo C14N / 構成情報ダイジェスト / 署名値 / .NET が JS 署名を検証
  申請書+添付: SignedInfo C14N / 構成情報ダイジェスト / 参照1 URI / 参照1 ダイジェスト /
               参照2 URI / 参照2 ダイジェスト / 署名値 / .NET が JS 署名を検証
```

## この検証で見つかった実装バグ

1. `webUtilityUrlEncode` が `~` を素通ししていた（.NET は `%7E`）。修正済み。
2. テスト用 kousei.xml の属性を `Id=` にしていたが、ネイティブの参照解決は `ID=`。
   パリティ検証をしていなければ、実機で「署名不正」になるまで気付けなかった。

## ブラウザ互換性の検証（重要）

`npm run build` の警告 `Module "util"/"crypto" has been externalized for browser compatibility`
は**実害がある**。Vite は Node 組み込みを空オブジェクトに差し替えるため、
モジュール初期化時に `util.deprecate(...)` を呼ぶコードは**読み込んだ瞬間に TypeError** になる。
Node 上のテストでは実物の `util` があるので検出できない。

これに該当したのが `xml-crypto`（`lib/utils.js` のモジュールスコープで `util.deprecate`）で、
導入したらブラウザで content script が起動しなくなるところだった。対策:

- C14N は依存ゼロの自前実装（`src/c14n.ts`）に戻し、.NET をオラクルに正しさを担保
- 署名検証は `node-forge`（約 1MB、`crypto`/`stream`/`util` を optional 参照）を廃止し、
  `src/bridge/der.ts`（X.509 から SPKI を抜く最小 DER 走査）+ WebCrypto に置換

結果、バンドルは **1,200KB → 307KB**、`require___vite_browser_external` / `forge` の参照は 0。

## 未カバー（正直な限界）

- **実サーバが返す kousei.xml の実物**では未検証。属性名（`ID` / `Id`）や要素順はサーバ生成物に依存する。
  検証環境で実際にダウンロードした kousei.xml で再実行する必要がある。
- 証明書チェーン・失効確認（CRL/OCSP）は検証していない。e-Gov 側の判定に委ねる。
- `XmlDsigC14NTransform` は .NET 10 のもの。ネイティブは .NET 10 (macOS 2.1.0.0) なので一致する想定だが、
  Windows 版 3.1.0.0 との差は未確認。
- **実ブラウザでの起動確認は未実施**（このホストに Chrome が無い）。バンドルに Node 組み込み参照が
  残っていないことは機械的に確認したが、実際に e-Gov のページで content script が動くかは未検証。
