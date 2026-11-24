# e-Gov電子申請クライアント コマンドカタログ（ブリッジ実装用）

対象: `/tmp/aok/egov-recon/decomp/eGovClient.dll.decompiled.cs`（IL逆コンパイル, 全91,831行, 3.79MB）
版: macOS 2.1.0.0 相当（.NET MAUI / Mac Catalyst）。行番号はすべて上記ファイルのもの。
本ドキュメントは静的解析のみに基づく。ネットワークアクセスは行っていない。

---

## 0. 結論（要約）

- JS→ネイティブのコマンドは **DispatchExternal 1箇所**でディスパッチされる（`28351`）。コマンド文字列は **71個**。
  内訳は `WebBrowserCommon.AsyncFunctionList`（65個, `59650`）＋ `WebBrowserCommon.FunctionList`（6個, `59661`）と完全一致する。
- ディスパッチは `switch (text.Length)` → `switch (text[N])` → `if (text == "コマンド名")` という
  コンパイラ生成の文字列スイッチ（難読化ではない）。全71コマンドが `clientApi.<メソッド>()` を1回だけ呼ぶ。
- 応答は4形態（`28269`〜`28339`）: `resolveJson` / `resolve`(文字列) / `resolve`(数値) / `reject`。
  片方向（応答なし）コマンドが6個ある（`openInBrowser`, `openApplicationConfirmInfo`, `openElectronicPayment`,
  `SetEraParallelPeriodFlag`, `F3egcl_CancelDigitalAuth`, `CloseWindow`）。
- **署名＋送信の実体は `SignatureAppli.sendAppliData` → `sendAppliDataFile` → `private SendHttpRequest`**（`78754` / `78843` / `78948`）。
  `POST {codeBase}/recept/application-form-entry/AppDataReceive`、`Content-Type: application/octet-stream`、
  独自ヘッダ `zipFullSize` / `zipPosition` / `preSendFlag` / `signAndSaveFlag` による **zipの分割アップロード**。
  multipart ではない。
- `<署名情報>` への埋め込みは2系統: ①デジタル認証（スマホ署名）は `CompleteAsyncSignature`（`69522`）で
  `<署名情報>` に `<Signature>` を追記して `SaveXml`、②ローカル証明書(JPKI等)は `SignatureAppli.signature`（`82955`）で
  `MySignedXml.GetXml()` を `<署名情報>` に追記。
- 作業フォルダは `AppliCommonUtility.CLIENT_WORK_FOLDER = {APPLY_FOLDER}/work`（`91542`）、
  `CLIENT_MANAGE_SAVED_FOLDER = {APPLY_FOLDER}/manage/saved`（`91540`）。
  `APPLY_FOLDER = <AppData>/<clientId>`（`91532`）。

---

## 1. 受信からディスパッチまで

```
28106|  public void OnJavaScriptMessageReceived(object sender, string json)
28108|      object obj = JsonSerializer.Deserialize<object>(json);
28111|          JsonElement a = (JsonElement)obj;
28112|          Task.Run(() =>
28114|              DispatchExternal(a);
```

```
28351|  private void DispatchExternal(JsonElement a)
28353|      string text = a[0].ToString();
28358|      switch (text.Length)
```

- `a[0]` = コマンド文字列、`a[1]` = uuid、`a[2..]` = 引数。
- 引数は `a[N].ToString()`（文字列）か `a[N].GetInt32()`（数値、`AddAttachedFile_selectFile` / `SetAttachedFileSize` /
  `OfficialDocumentDownload_FileDownload` の一部）。
- 各ハンドラは `try { ... PostResultMessage(uuid, ret) } catch (Exception ex) { PostCancelMessage(uuid, ex.Message) }` の形。
- **未対応コマンドは例外も応答も出さずに抜ける**（JS側はタイムアウトする）。

### 1.0 重要: `FunctionList` 系は uuid を持たない

`GenerateExternalFunction`（`31556`）は `FunctionList` の6関数について

```
31563|  stringBuilder.Append("=function(...args){var s=JSON.stringify(['");
31564|  stringBuilder.Append(value);
31565|  stringBuilder.Append("',...args]);window.webkit.messageHandlers.F3egclPostMessage.postMessage(s);};");
```

を生成する。つまり **`window.external.<cmd>(arg)` の `arg` が `a[1]` に入る**（uuid は付かない）。
該当4コマンド（`openInBrowser` / `openApplicationConfirmInfo` / `openElectronicPayment` /
`SetEraParallelPeriodFlag`）は `a[1]` を引数として読んでおり、下表でもその旨を明記している。
残り2つ（`CloseWindow` / `F3egcl_CancelDigitalAuth`）は引数なし。

### 1.1 応答メッセージ（4形態）

```
28269|  private void PostResultMessageAsJson(string uuid, string json)
28271|      PostWebMessageAsJson("{\"uuid\":\"" + uuid + "\", \"resolveJson\":" + json + "}");

28274|  private void PostResultMessage(string uuid, string retval)
28277|      PostWebMessageAsJson("{\"uuid\":\"" + uuid + "\", \"resolve\":\"" + EscapeJson(retval) + "\"}");

28326|  private void PostResultMessage(string uuid, int retval)
28328|      PostWebMessageAsJson("{\"uuid\":\"" + uuid + "\", \"resolve\":" + retval + "}");

28331|  private void PostCancelMessage(string uuid, string message)
28333|      PostWebMessageAsJson("{\"uuid\":\"" + uuid + "\", \"reject\":\"" + message + "\"}");

28336|  private void PostWebMessageAsJson(string json)
28338|      InvokeScript("F3egclMessageEventListenerMac", new object[1] { json });
```

注意: `reject` は `EscapeJson` を通していない（生の例外メッセージを埋め込む）。ブリッジ側でJSONを組み立てる際は
エスケープを正しく行う必要がある。

（※ 表の中で入れ子 if になっている 3 組
— `setXMLFormInfo`/`getXMLFormInfo`(28660/28662)、`changeProc`/`changeForm`(28737/28739)、
`previewOfficialDoc`/`previewFormConfirm`(28794/28796) — は、
外側の比較行と内側の呼び出し行が 1〜2 行ずれる。上表は呼び出し行を正しく対応付けた値。）

### 1.2 コマンド総数の根拠

```
59650|  public static readonly string[] AsyncFunctionList = new string[65]
59651|  {
59652|      "F3egclInitAppli_initAppli", "F3egclFileManageAppli_initAttachList", ... （65個）
59659|  };

59661|  public static readonly string[] FunctionList = new string[6] { "F3egclFileManageAppli_openApplicationConfirmInfo",
        "F3egclFileManageAppli_openElectronicPayment", "F3egclFileManageAppli_openInBrowser",
        "SetEraParallelPeriodFlag", "CloseWindow", "F3egcl_CancelDigitalAuth" };
```

`AsyncFunctionList` は「非同期（Promiseを返す）関数」、`FunctionList` は「同期・戻り値なし関数」として
ページ側に `window.external.<name>` を生やす対象。合計 65 + 6 = **71** が DispatchExternal の分岐数と一致する。

### 1.3 レート制限（参考）

```
60881|  _jsInteropRestrictChecker.NewRule("F3egclFileManageAppli_AppendAttachedAttribute", allowOnLoading: false, 1000);
        … 全11ルール（60881〜60891）
```
`allowOnLoading: false` = ページ読込中は呼び出し拒否、`1000` ms = 同一メソッドの連続呼び出し間隔制限。
（これは mac の反射経路 `ProcessScriptMessage` に対する制限で、`DispatchExternal` 経路には見当たらない。）

---

## 2. 全コマンド一覧（71件）

列の意味:
- **case行**: DispatchExternal 内で `text == "<コマンド>"` を比較している行
- **clientApi 行**: 呼び出し先メソッドの宣言行（`ClientApi` クラスは `12487` 開始）
- **引数**: `a[2]` 以降の個数
- **応答**: `resolve`(数値/文字列) / `resolveJson` / `none`(応答なし)
- **分類**: CORE_SIGN / FILE / HTTP / XML / UI / MISC

| # | コマンド | case行 | clientApi メソッド (宣言行) | 引数 | 応答 | 分類 | 内容 |
|---|---------|-------:|---------------------------|------|------|------|------|
| 1 | `AddAttachedFile_DragEnter` | 28364 | `AddAttachedFile_DragEnter` (28370) | a[2..2]（1個） | resolve | UI | 添付欄へのドラッグ進入を通知（dragAndDropAppli.dragEnter）。画面演出のみ |
| 2 | `F3egclInitAppli_initAppli` | 28382 | `F3egclInitAppli_initAppli` (28388) | a[2..14]（13個） | resolve | XML | 申請データ初期化。identifier 配下の作業フォルダ・申請情報(applyInfo)を読み込み、以後のコマンドの前提状態を作る |
| 3 | `AddAttachedFile_selectFile` | 28405 | `AddAttachedFile_selectFile` (28411) | a[2..2]（1個） | resolve | FILE | OSのファイル選択ダイアログ→選択ファイルを添付として作業フォルダへ取り込む |
| 4 | `F3egclInitAppli_tagMapping` | 28423 | `F3egclInitAppli_tagMapping` (28429) | a[2..5]（4個） | resolve | XML | タグマッピング定義(マッピングXML)を読み込み、画面⇔XMLの対応を確立 |
| 5 | `F3egclXMLDataAppli_addForm` | 28441 | `F3egclXMLDataAppli_addForm` (28447) | a[2..4]（3個） | resolve | XML | 申請書の様式(form)を申請データに追加 |
| 6 | `F3egclInitAppli_initDocumentDetails` | 28464 | `F3egclInitAppli_initDocumentDetails` (28470) | a[2..2]（1個） | resolve | XML | 添付書類の明細情報を初期化 |
| 7 | `F3egclXMLDataAppli_storeWorkXMLFile` | 28482 | `F3egclXMLDataAppli_storeWorkXMLFile` (28488) | a[2..5]（4個） | resolveJson | FILE | XML文字列を指定ファイル名で作業フォルダに保存（ReturnValuesをJSONで返す） |
| 8 | `SetPresentationOrgInfoPartSignGroup` | 28500 | `SetPresentationOrgInfoPartSignGroup` (28506) | a[2..8]（7個） | resolve | CORE_SIGN | 提出先情報(提出先識別子/名称)を申請XMLへ書き込み。部分署名グループ版 |
| 9 | `F3egclSignatureAppli_checkInputItem` | 28518 | `F3egclSignatureAppli_checkInputItem` (28524) | a[2..2]（1個） | resolveJson | CORE_SIGN | 署名前の入力チェック。結果をJSON文字列で返す |
| 10 | `F3egclSignatureAppli_UrlExistsCheck` | 28536 | `F3egclSignatureAppli_UrlExistsCheck` (28542) | a[2..2]（1個） | resolve | CORE_SIGN | 添付URL(URL添付)の到達性チェック |
| 11 | `F3egclFileManageAppli_openInBrowser` | 28554 | `F3egclFileManageAppli_openInBrowser` (28556) | a[1]（1個・uuid位置を引数に使用） | none | UI | OSの既定ブラウザでURLを開く。応答を返さない(片方向) |
| 12 | `F3egclInitAppli_initAppliPartSignGroup` | 28565 | `F3egclInitAppli_initAppliPartSignGroup` (28571) | a[2..14]（13個） | resolve | XML | 部分署名グループ用の申請データ初期化 |
| 13 | `F3egclXMLDataAppli_previewAttachedFile` | 28583 | `F3egclXMLDataAppli_previewAttachedFile` (28589) | a[2..2]（1個） | resolve | UI | 添付ファイルをHTML化してブラウザでプレビュー |
| 14 | `F3egclPostProcessAppli_deleteAppliData` | 28601 | `F3egclPostProcessAppli_deleteAppliData` (28607) | a[2..3]（2個） | resolve | FILE | 申請データ(作業フォルダ/manage情報)の削除 |
| 15 | `F3egclXMLDataAppli_SelectCertificateUI` | 28619 | `F3egclXMLDataAppli_SelectCertificateUI` (28625) | なし | resolve | CORE_SIGN | 署名用電子証明書の選択ダイアログを表示 |
| 16 | `F3egclFileManageAppli_SaveAndStop` | 28642 | `F3egclFileManageAppli_SaveAndStop` (28648) | a[2..9]（8個） | resolve | CORE_SIGN | 署名して保存（送信はしない）。signFlag=1 で署名→sendAppliData(saveFlag) |
| 17 | `F3egclXMLDataAppli_setXMLFormInfo` | 28660 | `F3egclXMLDataAppli_setXMLFormInfo` (28682) | a[2..5]（4個） | resolve | XML | 画面入力をXMLへ反映（F3egclSetValueForXml 等をページ側JSで実行） |
| 18 | `F3egclXMLDataAppli_getXMLFormInfo` | 28662 | `F3egclXMLDataAppli_getXMLFormInfo` (28668) | a[2..4]（3個） | resolve | XML | XMLの値を画面用に取り出し（ページ側JSの F3egclGetValue） |
| 19 | `F3egclFileManageAppli_SignAndSave` | 28694 | `F3egclFileManageAppli_SignAndSave` (28701) | a[2..7]（6個）+ a[8]=signInfoJson(任意) | resolve | CORE_SIGN | 署名＋保存。signInfoJson(a[8]) で署名方式(JPKI/デジタル認証)を切替 |
| 20 | `F3egclFileManageAppli_SignAndSend` | 28713 | `F3egclFileManageAppli_SignAndSend` (28720) | a[2..8]（7個）+ a[9]=signInfoJson(任意) | resolve | CORE_SIGN | 署名＋e-Gov送信。signMaxFlag=1 でバックアップ→sendAppliData(POST)まで実行。signInfoJson は a[9] |
| 21 | `F3egclXMLDataAppli_changeProc` | 28737 | `F3egclXMLDataAppli_changeProc` (28759) | a[2..5]（4個） | resolve | XML | 申請手続(proc)の切替 |
| 22 | `F3egclXMLDataAppli_changeForm` | 28739 | `F3egclXMLDataAppli_changeForm` (28745) | a[2..5]（4個） | resolve | XML | 申請書様式(form)の切替 |
| 23 | `F3egclXMLDataAppli_deleteForm` | 28771 | `F3egclXMLDataAppli_deleteForm` (28777) | a[2..7]（6個） | resolve | XML | 申請書様式の削除 |
| 24 | `F3egclXMLDataAppli_previewOfficialDoc` | 28794 | `F3egclXMLDataAppli_previewOfficialDoc` (28816) | なし | resolve | UI | 公文書プレビュー(Koubunsho/kanbunsho.html)を開く |
| 25 | `F3egclXMLDataAppli_previewFormConfirm` | 28796 | `F3egclXMLDataAppli_previewFormConfirm` (28802) | a[2..4]（3個） | resolve | UI | 記入済み申請書の確認プレビューを表示 |
| 26 | `F3egclXMLDataAppli_deleteFormPartSign` | 28828 | `F3egclXMLDataAppli_deleteFormPartSign` (28834) | a[2..5]（4個） | resolve | XML | 部分署名対象様式の削除 |
| 27 | `F3egclFileManageAppli_LoadApplication` | 28846 | `F3egclFileManageAppli_LoadApplication` (28852) | なし | resolve | FILE | 保存済み申請データの読み込み（ファイル選択ダイアログ） |
| 28 | `F3egclFileManageAppli_SaveApplication` | 28864 | `F3egclFileManageAppli_SaveApplication` (28870) | a[2..5]（4個） | resolve | FILE | 申請データをzipとして保存（CLIENT_MANAGE_SAVED_FOLDER） |
| 29 | `OfficialDocumentDownload_FileDownload` | 28882 | `OfficialDocumentDownload_FileDownload` (28888) | a[2..3]（2個） | resolve | HTTP | POST /application-status/getOneDoc で公文書1件をダウンロード→zip展開 |
| 30 | `F3egclFileManageAppli_importAppliData` | 28900 | `F3egclFileManageAppli_importAppliData` (28906) | a[2..6]（5個） | resolve | FILE | 申請データ(zip)の取り込み。パスワード/種別/group/到達番号を引数に取る |
| 31 | `F3egclPostProcessAppli_deleteWorkData` | 28918 | `F3egclPostProcessAppli_deleteWorkData` (28924) | a[2..2]（1個） | resolve | FILE | 作業データ(work配下)の削除 |
| 32 | `F3egclXMLDataAppli_previewForm` | 28941 | `F3egclXMLDataAppli_previewForm` (28947) | a[2..6]（5個） | resolve | UI | 申請書プレビュー(HTML生成→表示) |
| 33 | `F3egclXMLDataAppli_backProcess` | 28959 | `F3egclXMLDataAppli_backProcess` (28965) | a[2..2]（1個） | resolve | XML | 手続を1つ戻す(前処理状態へ) |
| 34 | `F3egclUserVerificationXMLDataAppli_backProcess` | 28982 | `F3egclUserVerificationXMLDataAppli_backProcess` (28988) | なし | resolve | XML | 本人確認(利用者検証)フローの戻し処理 |
| 35 | `F3egclFileManageAppli_SignAndSendPartSignGroup` | 29000 | `F3egclFileManageAppli_SignAndSendPartSignGroup` (29007) | a[2..11]（10個）+ a[12]=signInfoJson(任意) | resolve | CORE_SIGN | 部分署名グループ単位の署名＋送信。signInfoJson は a[12] |
| 36 | `F3egclFileManageAppli_SaveAndStopPartSignGroup` | 29019 | `F3egclFileManageAppli_SaveAndStopPartSignGroup` (29025) | a[2..9]（8個） | resolve | CORE_SIGN | 部分署名グループ単位の署名＋保存 |
| 37 | `F3egclXMLDataAppli_userVerificationSignAndSave` | 29037 | `F3egclXMLDataAppli_userVerificationSignAndSave` (29043) | a[2..8]（7個） | resolve | CORE_SIGN | 本人確認情報(氏名/生年月日/個人認証)を付して署名・保存 |
| 38 | `F3egclFileManageAppli_SignAndSavePartSign` | 29060 | `F3egclFileManageAppli_SignAndSavePartSign` (29067) | a[2..11]（10個）+ a[12]=signInfoJson(任意) | resolve | CORE_SIGN | 部分署名の署名＋保存。signInfoJson は a[12] |
| 39 | `F3egclFileManageAppli_SignAndSendPartSign` | 29079 | `F3egclFileManageAppli_SignAndSendPartSign` (29086) | a[2..11]（10個）+ a[12]=signInfoJson(任意) | resolve | CORE_SIGN | 部分署名の署名＋送信。signInfoJson は a[12] |
| 40 | `F3egclFileManageAppli_SetAttachedFileSize` | 29098 | `F3egclFileManageAppli_SetAttachedFileSize` (29104) | a[2..3]（2個） | resolve | FILE | 添付ファイルのサイズを内部管理表へ記録 |
| 41 | `PostOfficialDocumentDownload_FileDownload` | 29116 | `PostOfficialDocumentDownload_FileDownload` (29122) | a[2..3]（2個） | resolve | HTTP | POST /post-application-notice-contents/getOneDoc で1件取得 |
| 42 | `F3egclFileManageAppli_AppendFeeInfoAttribute` | 29139 | `F3egclFileManageAppli_AppendFeeInfoAttribute` (29145) | a[2..6]（5個） | resolve | XML | 手数料情報属性を申請XMLへ付与 |
| 43 | `PostOfficialDocumentDownload_FileDownloadAll` | 29157 | `PostOfficialDocumentDownload_FileDownloadAll` (29163) | a[2..4]（3個） | resolve | HTTP | POST /post-application-notice-contents/getAllDoc で一括取得 |
| 44 | `F3egclTagConfCheck_tagConfCheckPartSignGroup` | 29175 | `F3egclTagConfCheck_tagConfCheckPartSignGroup` (29181) | a[2..2]（1個） | resolve | XML | 様式定義と入力値のタグ整合性チェック（部分署名グループ） |
| 45 | `F3egclXMLDataAppli_deleteFormPartSignForGroupApply` | 29198 | `F3egclXMLDataAppli_deleteFormPartSignForGroupApply` (29204) | a[2..5]（4個） | resolve | XML | グループ申請用の部分署名様式削除 |
| 46 | `F3egclFileManageAppli_SaveApplicationPartSignGroup` | 29216 | `F3egclFileManageAppli_SaveApplicationPartSignGroup` (29222) | a[2..5]（4個） | resolve | FILE | 部分署名グループ申請データの保存 |
| 47 | `F3egclFileManageAppli_importAppliDataPartSignGroup` | 29234 | `F3egclFileManageAppli_importAppliDataPartSignGroup` (29240) | a[2..6]（5個） | resolve | FILE | 部分署名グループ申請データの取り込み |
| 48 | `F3egclSignatureAppli_checkInputItemPartSignGroup` | 29257 | `F3egclSignatureAppli_checkInputItemPartSignGroup` (29263) | a[2..2]（1個） | resolveJson | CORE_SIGN | 部分署名グループ用の入力チェック（JSON返却） |
| 49 | `F3egclFileManageAppli_openApplicationConfirmInfo` | 29275 | `F3egclFileManageAppli_openApplicationConfirmInfo` (29277) | a[1]（1個・uuid位置を引数に使用） | none | UI | 申請情報詳細HTMLをCLIENT_MANAGE_FOLDERへ書いてブラウザで開く。応答なし |
| 50 | `F3egclTagConfCheck_tagConfCheck` | 29286 | `F3egclTagConfCheck_tagConfCheck` (29292) | a[2..2]（1個） | resolve | XML | 様式定義とXMLのタグ整合性チェック |
| 51 | `F3egclXMLDataAppli_getApplyList` | 29304 | `F3egclXMLDataAppli_getApplyList` (29310) | a[2..3]（2個） | resolve | XML | 申請一覧(applyInfo)を取得して返す |
| 52 | `SetEraParallelPeriodFlag` | 29327 | `SetEraParallelPeriodFlag` (29329) | a[1]（1個・uuid位置を引数に使用） | none | MISC | 元号並行期間フラグをstaticフィールドに設定するだけ |
| 53 | `F3egcl_CancelDigitalAuth` | 29333 | `F3egcl_CancelDigitalAuth` (29335) | なし | none | CORE_SIGN | 進行中のデジタル認証(スマホ署名)ポーリングを中止。応答なし |
| 54 | `AddAttachedFile_Drop` | 29341 | `AddAttachedFile_Drop` (29347) | a[2..2]（1個） | resolve | FILE | ドロップされたファイル(base64)をattachmenttempへ書き出して添付取り込み |
| 55 | `F3egclXMLDataAppli_copyForm` | 29359 | `F3egclXMLDataAppli_copyForm` (29365) | a[2..6]（5個） | resolve | XML | 様式の複製 |
| 56 | `F3egclXMLDataAppli_saveAppliData` | 29377 | `F3egclXMLDataAppli_saveAppliData` (29383) | a[2..5]（4個） | resolve | XML | 編集中の画面値を申請XMLへ保存（スタイルシート付与フラグ付き） |
| 57 | `F3egclFileManageAppli_AppendFeeInfoAttributePartSignGroup` | 29395 | `F3egclFileManageAppli_AppendFeeInfoAttributePartSignGroup` (29401) | a[2..5]（4個） | resolve | XML | 手数料情報属性の付与（部分署名グループ） |
| 58 | `F3egclFileManageAppli_AppendAttachedAttribute` | 29413 | `F3egclFileManageAppli_AppendAttachedAttribute` (29419) | a[2..5]（4個） | resolve | FILE | 添付ファイル属性(添付情報)を申請XML/構成情報へ追加 |
| 59 | `F3egclFileManageAppli_AppendAttachedAttributePartSign` | 29431 | `F3egclFileManageAppli_AppendAttachedAttributePartSign` (29437) | a[2..3]（2個） | resolve | FILE | 添付ファイル属性の追加（部分署名） |
| 60 | `F3egclFileManageAppli_AppendAttachedAttributePartSignGroup` | 29449 | `F3egclFileManageAppli_AppendAttachedAttributePartSignGroup` (29455) | a[2..5]（4個） | resolve | FILE | 添付ファイル属性の追加（部分署名グループ） |
| 61 | `F3egclFileManageAppli_AppendAttachedAttributePartSignForGroupApply` | 29467 | `F3egclFileManageAppli_AppendAttachedAttributePartSignForGroupApply` (29473) | a[2..4]（3個） | resolve | FILE | 添付ファイル属性の追加（グループ申請向け部分署名） |
| 62 | `F3egclPostProcessAppli_restoreAppliData` | 29485 | `F3egclPostProcessAppli_restoreAppliData` (29491) | a[2..2]（1個） | resolve | FILE | バックアップから申請データを復元 |
| 63 | `OfficialDocumentDownload_FileDownloadAll` | 29503 | `OfficialDocumentDownload_FileDownloadAll` (29509) | a[2..2]（1個） | resolve | HTTP | POST /application-status/getAllDoc で公文書を一括ダウンロード |
| 64 | `SetMinistRefInfo` | 29521 | `SetMinistRefInfo` (29527) | a[2..7]（6個） | resolve | MISC | 省庁参照情報(ministRef)を申請データへ設定 |
| 65 | `SetPresentationOrgInfo` | 29539 | `SetPresentationOrgInfo` (29545) | a[2..8]（7個） | resolve | CORE_SIGN | 提出先情報を書き込み→saveAppliData→tagMapping再実行。署名フローの起点 |
| 66 | `F3egclXMLDataAppli_deleteFormPartSignGroup` | 29557 | `F3egclXMLDataAppli_deleteFormPartSignGroup` (29563) | a[2..7]（6個） | resolve | XML | 部分署名グループの様式削除 |
| 67 | `F3egclFileManageAppli_initAttachList` | 29575 | `F3egclFileManageAppli_initAttachList` (29581) | なし | resolve | FILE | 添付ファイル一覧の初期化 |
| 68 | `F3egclReflectSuspendProcInfoClass_reflectSuspendProcInfo` | 29593 | `F3egclReflectSuspendProcInfoClass_reflectSuspendProcInfo` (29599) | a[2..4]（3個） | resolve | MISC | 中断した申請案件情報をmanageファイルへ反映 |
| 69 | `F3egclInitAppli_restartLogin` | 29611 | `F3egclInitAppli_restartLogin` (29617) | a[2..2]（1個） | resolve | MISC | 指定URLでログイン(Keycloak)をやり直す |
| 70 | `F3egclFileManageAppli_openElectronicPayment` | 29629 | `F3egclFileManageAppli_openElectronicPayment` (29631) | a[1]（1個・uuid位置を引数に使用） | none | UI | 電子納付(ペイメント)画面をブラウザで開く。応答なし |
| 71 | `CloseWindow` | 29635 | `CloseWindow` (29637) | なし | none | MISC | アプリ自体を終了(Application.Quit)。応答なし |

計 **71** 件。

## 3. バケット別集計

| バケット | 件数 | 意味 |
|---|---:|---|
| CORE_SIGN | 15 | 署名・提出・認証に必須。実装必須 |
| XML | 22 | 申請XML(構成情報/申請書/様式)の操作。ファイルI/OだがXML構造が本質 |
| FILE | 17 | 仮想ファイルシステム（work/manage 配下、添付、zip入出力） |
| HTTP | 4 | e-Govへの直接HTTP（公文書・通知のダウンロード） |
| UI | 8 | ダイアログ/プレビュー。スタブ化可能 |
| MISC | 5 | フラグ設定・終了・ログイン再実行など |
| **合計** | **71** | |

### CORE_SIGN（15件）の内訳

1. `F3egclInitAppli_initAppli` / `F3egclInitAppli_initAppliPartSignGroup` — 前提状態の構築
2. `SetPresentationOrgInfo` / `SetPresentationOrgInfoPartSignGroup` — 提出先情報の書き込み（署名対象の確定）
3. `F3egclSignatureAppli_checkInputItem` / `...PartSignGroup` — 署名前チェック（結果JSON）
4. `F3egclSignatureAppli_UrlExistsCheck` — 添付URLの到達性チェック
5. `F3egclXMLDataAppli_SelectCertificateUI` — 証明書選択ダイアログ
6. `F3egclFileManageAppli_SignAndSave` / `SignAndSend` / `SignAndSavePartSign` / `SignAndSendPartSign` /
   `SignAndSendPartSignGroup` / `SaveAndStop` / `SaveAndStopPartSignGroup`
7. `F3egclXMLDataAppli_userVerificationSignAndSave` — 本人確認付き署名保存
8. `F3egcl_CancelDigitalAuth` — デジタル認証の中止

> 署名方式の分岐は `signInfoJson`（`SignCertificateInfoBean`）で行う。`SignatureIF == "1"` なら
> デジタル認証（スマホ署名）、それ以外はローカル証明書（PFX/JPKI）。§5.4 参照。

---

## 4. 署名→送信パスの実装詳細

### 4.1 `F3egclFileManageAppli_SignAndSend`（`14606`）

```
14606|  public int F3egclFileManageAppli_SignAndSend(string identifier, string procIdListStr, string fabFormFileName,
          string signFlag, string signMaxFlag, string addSignFlag, string signatureId, string signInfoJson = null)
14636|      string[] separator = new string[1] { ":::" };
14637|      string[] collection = procIdListStr.Split(separator, StringSplitOptions.None);
14639|      bool flag = Convert.ToBoolean(signMaxFlag);
14646|      signInfo = JsonUtil.Deserialize<SignCertificateInfoBean>(signInfoJson);
14655|      methodName = "saveXmlAndSign";
14656|      returnValues = saveXmlAndSign(identifier, procIdList, fabFormFileName, signFlag, out methodName, saveFlag: false, addSignFlag2, signatureId, signInfo);
14674|      returnValues = signatureAppli.sendAppliData(identifier, procIdList, fabFormFileName, DIV_SIZE, preSendFlag: false, saveFlag: false);
```

- `procIdListStr` は `":::"` 区切り。
- `signMaxFlag`（真偽値文字列）が true のときだけ「バックアップ→送信」経路。false なら保存のみ。
- `signInfoJson`（= `a[9]`）は `SignCertificateInfoBean` にデシリアライズされるだけ。解釈は下流。

### 4.2 `saveXmlAndSign`（`15434`）— 署名フローの本体

```
15474|  result = signatureAppli.setApplicationInfo(identifier, formInfo.formId, formInfo.formVersion, formInfo.formName, formInfo.formFileName, item.procId, fabFormFileName);
15480|  result = addStyleSheet(identifier, item.procId, formInfo.formFileName, out methodName);
15488|  result = signatureAppli.replaceJoinName(identifier, procIdList, fabFormFileName);
15494|  methodName = "sendAppliData 1";
15495|  result = signatureAppli.sendAppliData(identifier, procIdList, fabFormFileName, DIV_SIZE, "1".Equals(signFlag), saveFlag);
15502|  if ("1".Equals(signFlag))
15505|      list2 = ((!saveFlag) ? (from x in applyInfoBeanList
15506|          where !x.signType.Equals("0") && x.gbizIdSignOmitApplyFlag.Equals("0")
15507|          select x.procId).ToList() : procIdList);
15510|      if (signInfo != null && signInfo.SignatureIF == "1")
15520|          digitalSignatureAuthAppli.Init(webBrowser);
15531|          digitalSignatureAuthAppli.PostSignCompleteAction = () =>
15535|                  ReturnValues returnValues = startNextDigitalSign();      // → SignWithDigitalAuthentication
15547|                  if (signatureAppli2.sendAppliData(capturedIdentifier, capturedProcIdList, capturedFabFormFileName, DIV_SIZE, preSendFlag: false, capturedSaveFlag).procStatus != 0)
15549|                      throw new Exception("署名後の申請データ送信に失敗しました。");
```

順序（再実装用）:

1. `setApplicationInfo`（様式メタ情報を構成情報へ）
2. `addStyleSheet`（XSLTスタイルシート参照の付与）
3. `replaceJoinName`（共同申請者の名称置換）
4. `sendAppliData(..., preSendFlag=true)` ← **署名前の事前送信**
5. signFlag=1 なら署名対象 proc を `signType != "0" && gbizIdSignOmitApplyFlag == "0"` で選別
6. 対象ごとに `SignWithDigitalAuthentication`（完了コールバックで次の proc へ連鎖）
7. 全件完了後 `sendAppliData(..., preSendFlag=false)` で本送信

### 4.3 `SignatureAppli.sendAppliData`（`78754`）

```
78754|  public ReturnValues sendAppliData(string identifier, List<string> sendProcIdList, string confInfoName, int divSize, bool preSendFlag, bool saveFlag)
78769|      string duplications = AppliCommon.getDuplications(sendProcIdList);
78783|      if (!AppliCommon.isFilename(confInfoName))
78798|      initialize(identifier, array);
78799|      sendAppliDataFile(identifier, array, confInfoName, divSize, preSendFlag, saveFlag);
```

戻り値 `ReturnValues.procStatus` がそのまま JS の `resolve`（数値）になる。例外コード対応:

| 例外コード | procStatus | 意味 |
|---|---:|---|
| 4101 | 2 | 様式エラー（`F3EGFORMNG`） |
| 5018 | 1 | WAFブロック（`F3EWAFNG:<support id>`） |
| 5019 | 1 | その他応答不正（`F3EGOTHERRESPONSE`） |
| 6000 | 1 | プロキシ認証キャンセル（`F3EGAUTHCN`） |
| その他 | -1 | FATAL |

### 4.4 `sendAppliDataFile`（`78843`）— 送信本体

```
78849|  sendMap = createSendfile(identifier, procIds, confInfoName);
78850|  string text = "/application-form-entry/AppDataReceive";
78851|  uri = new Uri(getCodeBase(), AbstractAppli.getVirtualPath() + text);
78854|  string text2 = SendHttpRequest(identifier, uri, divSize, preSendFlag, saveFlag);
78855|  if ("\0\tF3EHTTPNG".Equals(text2))            → 5004
78865|  if (text2.StartsWith("\0\tF3EWAFNG"))          → 5018（WAF。本文から support ID 抽出）
78873|  if ("\0\tF3EGFORMNG".Equals(text2))           → 4101
78881|  if ("\0\tF3EGEXCEPTIONNG".Equals(text2))      → 4102
78889|  if ("\0\tF3EGAUTHCN".Equals(text2))           → 6000
78897|  if ("\0\tF3EGOTHERRESPONSE".Equals(text2))    → 5019
78838|  // finally: {work}/{identifier}/tmp.zip を削除
```

`getVirtualPath()` は `"/recept"`（`66218`）、体験版は `"/Taiken"`（`66221`）。`getCodeBase()` は `codeBase`（`66226`）。

### 4.5 `private SendHttpRequest(identifier, Uri, divSize, preSendFlag, saveFlag)`（`78948`）★重要

```
78950|  using FileStream fileStream = new FileStream(compressTransmittingData(identifier, sendMap), FileMode.Open);
78956|  if (divSize == 0) { divSize = num3; }                     // divSize = 分割サイズ（DIV_SIZE）
78963|      string method = "POST";
78964|      string contentType = "application/octet-stream";
78965|      HttpWebRequest httpWebRequest = proxyUtil.getHttpWebRequest(Url, method, contentType);
78970|      httpWebRequest.Headers.Add("zipFullSize", num3.ToString());
78971|      httpWebRequest.Headers.Add("zipPosition", num4.ToString());
78972|      httpWebRequest.Headers.Add("preSendFlag", preSendFlag ? "1" : "0");
78973|      httpWebRequest.Headers.Add("signAndSaveFlag", saveFlag ? "1" : "0");
78974|      httpWebRequest.Timeout = 111111111;
78975|      num = fileStream.Read(buffer, num4, Math.Min(divSize, num2));
78976|      httpWebRequest.ContentLength = num;
78981|          stream.Write(buffer, num4, num);
78983|          num2 -= num;  num4 += num;
78985|          HttpWebResponse httpWebResponse = (HttpWebResponse)AppliCommonUtility.GetResponseWithLog(httpWebRequest, "SendHttpRequest", ...);
78986|          if (httpWebResponse.StatusCode != HttpStatusCode.OK) return "\0\tF3EHTTPNG";
78990|          string text = httpWebResponse.Headers.Get("ErrorInfo");
78993|              if (text.Equals("Unknown error.(server error)")) return "\0\tF3EGEXCEPTIONNG";
78997|              return "\0\tF3EGFORMNG";
78999|          string text2 = new StreamReader(httpWebResponse.GetResponseStream()).ReadToEnd();
79000|          if (text2.Contains("The requested URL was rejected. Please consult with your administrator."))
79002|              return "\0\tF3EWAFNG:" + Regex.Replace(text2, ".*Your support ID is: ([^<]+).*", "$1");
79004|          if (string.IsNullOrEmpty(httpWebResponse.GetResponseHeader("AppDataReceiveFlag")))
79006|              return "\0\tF3EGOTHERRESPONSE";
79014|  return "\0\tF3EGFORMOK";
```

- **1リクエスト＝zipの1断片**。`zipPosition` を進めながらループし、全断片 OK で `F3EGFORMOK`。
- 成功判定は「HTTP 200」＋「レスポンスヘッダ `AppDataReceiveFlag` が存在すること」。
- `ErrorInfo` ヘッダがあれば業務エラー（`F3EGFORMNG` / `F3EGEXCEPTIONNG`）。
- WAFブロックは本文の "Your support ID is: ..." を正規表現で抽出。

### 4.6 zipの組み立て `compressTransmittingData`（`79154`）/ `createSendfile`（`79017`）

```
79158|  text = {workFolderPath}/{identifier}/tmp.zip
79164|  using (ZipArchive zipArchive = new ZipArchive(fileStream, ZipArchiveMode.Update))
79170|          zipArchive.CreateEntry(text2 + "/");            // procId のディレクトリエントリ
79172|          pressFile(zipArchive, text2, files);            // procId/ 配下にファイル追加
```

```
79029|  string text2 = getWorkFolderPath(identifier, procIds, i);
79030|  text = Path.Combine(text2, confInfoName);
79035|  setSendAppliFile(arrayList, text2, text);
79036|  setAttachedFile(arrayList, text2, text);
79042|  hashtable[procIds[i]] = array;
```

→ **zip内は `<procId>/<構成情報XML>` と `<procId>/<添付ファイル…>`**。ディレクトリ名が procId。

### 4.7 HTTPエンドポイント一覧（すべて `ProxyUtil.getHttpWebRequest` 経由）

| 用途 | 実装 | 行 | HTTP | パス（`/recept` 配下） | Content-Type | ボディ |
|---|---|---:|---|---|---|---|
| 申請データ分割送信 | `SignatureAppli.SendHttpRequest` | 78948 | POST | `/application-form-entry/AppDataReceive` | `application/octet-stream` | zip断片（生バイト） |
| 申請データ取込(通常) | `FileManageAppli.SendHttpRequest` | 72597 | POST | `/application-form-import/load` | `application/x-www-form-urlencoded` | `procType, procIdConfListStr, confFileVerListStr, formFileVerListStr, readModeFlag, arriveId, noticeSubId, groupId, ministRefTypeExeFlagStr, attachedProcListStr` |
| 申請データ取込(部分署名G) | `SendHttpRequestPartSignGroup` | 72751 | POST | `/application-form-import/load-partsign-group` | 同上 | 上記＋`groupProcIdListStr` |
| 公文書1件 | `ClientApi.SendHttpRequest` | 16545 | POST | `/application-status/getOneDoc` | 同上 | `arriveId=..&noticeSubId=..` |
| 公文書一括 | `ClientApi.SendHttpRequestAll` | 16499 | POST | `/application-status/getAllDoc` | 同上 | `arriveId=..` |
| 通知1件 | `ClientApi.SendHttpRequest` | 16545 | POST | `/post-application-notice-contents/getOneDoc` | 同上 | `ministryMessageId=..&postId=..` |
| 通知一括 | `PostSendHttpRequestAll` | 16453 | POST | `/post-application-notice-contents/getAllDoc` | 同上 | `ministryMessageId=..&postGroupId=..&ministryId=..` |
| デジタル認証 開始 | `StartDigitalAuth` | 69343 | POST | `/digital-auth/start-sign` | `application/x-www-form-urlencoded` | `data=<Base64(C14N(SignedInfo))>&targetProcId=..&dispProcName=..` |
| デジタル認証 ポーリング | `CreatePollRequest` | 69640 | GET | `/digital-auth/poll?signTransactionId=..` | — | — |

ダウンロード系レスポンスは zip。`unzip()`（`16565`）が `tmp.zip` に落として展開し、
保存名は `{arriveId|ministryMessageId}_yyyyMMddHHmmss.zip`。

---

## 5. 署名情報（`<署名情報>`）の組み立て

### 5.1 共通の骨格（2系統でほぼ同一）

`SignWithDigitalAuthentication`（`69138`）と `signature`（`82955`）は同じ前処理を持つ:

```
69162|  string[] files = Directory.GetFiles(confFolderPath, confFileName);
69167|  AppliCommonUtility.SaveXml(xmlDocument, files[0]);         // addSignFlag=false のとき正規化保存
69170|  xmlDocument.PreserveWhitespace = true;
69173|  XmlNodeList elementsByTagName = documentElement.GetElementsByTagName("申請書ファイル名称");
69182|  XmlNodeList elementsByTagName2 = documentElement.GetElementsByTagName("添付書類ファイル名称");
69186|      XmlNodeList elementsByTagName3 = documentElement.GetElementsByTagName("添付種別");
69187|      XmlNodeList elementsByTagName4 = documentElement.GetElementsByTagName("提出情報");
69192|          if (innerText2 == "1" && innerText == "添付")   → 実体ファイル必須（list2 に追加）
69201|          else if (innerText2 == "1" && innerText != "URL" && innerText != "ＵＲＬ" && innerText != "別送") → エラー
```

`<署名情報>` 要素の生成（**`<構成情報>` の直後に挿入**）:

```
69211|  if (xmlDocument.GetElementsByTagName("署名情報").Count == 0)
69213|      XmlElement newChild = xmlDocument.CreateElement("署名情報");
69215|      documentElement.InsertAfter(newChild, documentElement.GetElementsByTagName("構成情報")[0]);
69216|      documentElement.InsertAfter(newChild2, documentElement.GetElementsByTagName("構成情報")[0]);   // 改行テキスト
```

`Signature/@Id` は **`yyyyMMddHHmmss`**（`69233`）:

```
69220|  DateTime now = DateTime.Now;
69228|  string text  = ((month < 10) ? ("0" + month) : (string.Empty + month));
69233|  string id = year + text + text2 + text3 + text4 + text5;
```

XMLDSig パラメータ（両系統で同一）:

```
69238|  Reference reference = new Reference
69240|      Uri = "#" + WebUtility.UrlEncode("構成情報"),
69241|      DigestMethod = "http://www.w3.org/2001/04/xmlenc#sha256"
69243|  reference.AddTransform(new XmlDsigC14NTransform());
69245|  mySignedXml.SignedInfo.SignatureMethod = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
69246|  mySignedXml.SignedInfo.CanonicalizationMethod = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
```

Reference 一覧:

| 対象 | URI | DigestMethod |
|---|---|---|
| 構成情報 | `"#" + UrlEncode("構成情報")` | SHA-256 + C14N transform |
| 申請書ファイル（`申請書ファイル名称` の各値） | ファイル名そのまま（`69256`） | SHA-256 |
| 添付書類（`添付種別=添付` かつ `提出情報=1`） | `UrlEncode(ファイル名)`（`69284`） | SHA-256 |

添付ファイル名の禁止文字（`69269`）: `\ % < > { } [ ] 半角空白 全角空白 # ^ ?`

### 5.2 デジタル認証（スマホ署名）の場合

```
69234|  RSA signingKey = new RSACryptoServiceProvider(2048);      // 使い捨て鍵
69236|  mySignedXml.SigningKey = signingKey;
69300|  mySignedXml.ComputeSignature();
69302|  XmlElement xml = mySignedXml.SignedInfo.GetXml();
69307|  XmlDsigC14NTransform xmlDsigC14NTransform = new XmlDsigC14NTransform();
69308|  xmlDsigC14NTransform.LoadInput(xmlDocument2);
69316|  string base64CanonicalData = Convert.ToBase64String(inArray);
69317|  AuthorizationResponse authorizationResponse = StartDigitalAuth(base64CanonicalData, targetProcId, dispProcName);
69322|  string text6 = "/digital-auth/poll?signTransactionId=" + Uri.EscapeDataString(authorizationResponse.sign_transaction_id);
69324|  StartAsyncPoll(servletUrl, xmlDocument, mySignedXml, files[0], list);
69326|  return new ReturnValues(3, 0, "DIGITAL_AUTH_POLLING", string.Empty, null, null);
```

→ **`procStatus == 3` が「ポーリング中」**。同期呼び出しの戻りとしてはここで一旦返る。

署名の確定（`CompleteAsyncSignature` `69522`）:

```
69527|  _asyncSignedXml.Signature.SignatureValue = Convert.FromBase64String(result.Signature);
69528|  X509Certificate2 cert = new X509Certificate2(Convert.FromBase64String(result.Certificate));
69529|  KeyInfo keyInfo = new KeyInfo();
69530|  keyInfo.AddClause(new KeyInfoX509Data(cert));
69531|  _asyncSignedXml.KeyInfo = keyInfo;
69532|  XmlElement xml = _asyncSignedXml.GetXml();
69535|  XmlNode? xmlNode = _asyncDocument.DocumentElement.GetElementsByTagName("署名情報")[0];
69536|  xmlNode.AppendChild(newChild);        // "  "
69537|  xmlNode.AppendChild(xml);             // <Signature>
69538|  xmlNode.AppendChild(newChild2);       // "\n  "
69539|  AppliCommonUtility.SaveXml(_asyncDocument, _asyncXmlPath);
69542|  if (PostSignCompleteAction != null) { flag = PostSignCompleteAction(); }   // 次の proc の署名へ
69550|  SafeInvokeDigitalAuthCallback("0", "");
```

JS 側コールバックは `onDigitalAuthComplete(status, errorMessage)`（`69565`）。
status: `"0"`=成功 / `"-1"`=失敗・タイムアウト・キャンセル / `"-2"`=マイナアプリ署名失敗。

ポーリング仕様（`69444`〜`69669`）: `_digitalAuthWaitTimeMs = 60000`（初回待ち）、
`_digitalAuthPollIntervalMs = 3000`、`_digitalAuthMaxRetries = 80`。
`CreatePollRequest`（`69640`）は `GET` / `Timeout=15000` / `X-CSRF-Token` / `X-Requested-With: XMLHttpRequest` /
`UserAgent` / セッションCookie / Basic認証を設定。`Tls12` 固定（`69644`）。

### 5.3 ローカル証明書の場合（`SignatureAppli.signature` `82955`）

```
83058|  RSA rSA = RSA.Create();
83066|  if (IsNichizeirenRemoteSignatureCertificate(certData)) rSA = GetRemoteSignatureRsaProvider("Default", "Nichizeiren Remote Signature Key Storage Provider");
83074|      rSA = certData.GetRSAPrivateKey();          // 失敗時 GetRSABridge（32bit COM ブリッジ）
83090|      x509Certificate = pkcs11.GetCert("CACERT"); // JPKI (PKCS#11)
83095|  KeyInfoX509Data keyInfoX509Data = new KeyInfoX509Data(certData);
83167|  mySignedXml.ComputeSignature(pkcs11, certData);
83171|  mySignedXml.ComputeSignature();
83173|  XmlElement xml = mySignedXml.GetXml();
83176|  XmlNode? xmlNode = xmlDocument.DocumentElement.GetElementsByTagName("署名情報")[0];
83178|  xmlNode.AppendChild(xml);
83180|  AppliCommonUtility.SaveXml(xmlDocument, files[0]);
```

外部署名ノードの取り込み汎用版 `importXMLSignature`（`67583`）:

```
67588|  ArrayList nodesByXPath = OperateDocument.getNodesByXPath(document, "DataRoot/署名情報");
67592|      xmlNode = document.CreateElement("署名情報");  document.DocumentElement.AppendChild(xmlNode);
67599|  XmlNode newChild = document.ImportNode(node, deep: true);
67600|  xmlNode.AppendChild(newChild);
```

なお `TAG_SIGNATURE = "署名情報"` / `XPATH_SIGNATURE = "DataRoot/署名情報"` は `67327` / `67349`、
`SIGNATURE_INFO = "署名情報"` は `69076` / `82941`、`getPreDigestValue`（`81613`）は
`confdom.GetElementsByTagName("署名情報")` を見て事前ダイジェストを扱う（`81621`〜`81633`）。

### 5.4 署名方式の判定（`SignCertificateInfoBean`）

- `signInfoJson` のデシリアライズ箇所: `14109`, `14244`, `14646`, `14759`, `18464`。
- `SignatureIF == "1"` → デジタル認証（`saveXmlAndSign` `15510`）、それ以外 → ローカル証明書 `signature(...)`。
- したがってブリッジが `signInfoJson` を組み立てる場合は、この Bean のフィールド
  （`SignatureIF`, `SignatureId`, 証明書系）に従う必要がある。

---

## 6. 定数・パス・ユーティリティ

### 6.1 `AppliCommonUtility`（`91522`〜）

```
91530|  private const string EGOVFORM_WORKFOLDER = ".egovForm";
91532|  private static readonly string APPLY_FOLDER = Path.Combine(ShimMethods.GetAppDataFolderPath(), eGovClientCommonResources.clientId);
91534|  public static readonly string CLIENT_MANAGE_FOLDER = Path.Combine(APPLY_FOLDER, "manage");
91536|  public static readonly string CLIENT_MANAGE_FILE_PATH = Path.Combine(CLIENT_MANAGE_FOLDER, eGovClientCommonResources.clientManagementFile);
91538|  public static readonly string CLIENT_MANAGE_ENC_FILE_PATH = CLIENT_MANAGE_FILE_PATH + ".enc";
91540|  public static readonly string CLIENT_MANAGE_SAVED_FOLDER = Path.Combine(CLIENT_MANAGE_FOLDER, "saved");
91542|  public static readonly string CLIENT_WORK_FOLDER = Path.Combine(APPLY_FOLDER, "work");
91544|  public static readonly string CLIENT_LOG_FOLDER = Path.Combine(APPLY_FOLDER, "logs");
91546|  public static readonly string CLIENT_WORK_TEMP_FOLDER = Path.Combine(CLIENT_WORK_FOLDER, "attachmenttemp");
91548|  private static readonly string CLIENT_WORK_IDENTIFIER_FOLDER = Path.Combine(CLIENT_WORK_FOLDER, "{0}");
91550|  private static readonly string CLIENT_WORK_PROC_FOLDER = Path.Combine(CLIENT_WORK_FOLDER, "{0}", "{1}");
91552|  private static readonly string CLIENT_WORK_BACKUP_FOLDER = Path.Combine(CLIENT_WORK_FOLDER, "{0}");
91554|  private static readonly string CLIENT_WORK_BACKUP_FOLDERSUFFIX = "_backup";
91556|  public static readonly string INDIVIDUAL_AUTHORIZATION_FOLDER = Path.Combine(APPLY_FOLDER, "identification_work");
```

派生メソッド:

```
91560|  public static string getSystemWorkFolderPath()
91562|      return addWritablePath(addFileSeparator(Environment.GetFolderPath(SpecialFolder.UserProfile))) + addFileSeparator(".egovForm");

91611|  public static string getIdentifierFolderPath(string identifier)
91613|      return string.Format(CLIENT_WORK_IDENTIFIER_FOLDER, identifier);      // {work}/{identifier}

91616|  public static string getProcFolderPath(string identifier, string proc)
91618|      return string.Format(CLIENT_WORK_PROC_FOLDER, identifier, proc);      // {work}/{identifier}/{proc}

91621|  public static string getBackupFolderPath(string identifier)
91623|      return string.Format(CLIENT_WORK_BACKUP_FOLDER, identifier + "_backup");   // {work}/{identifier}_backup
```

`SaveXml`（`91626` XDocument版 / `91639` XmlDocument版）: **UTF-8(BOMなし) / 改行 `\n` / インデントはタブ**。

```
91628|  XmlWriterSettings settings = new XmlWriterSettings {
91630|      Encoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false),
91631|      NewLineChars = "\n",  Indent = true,  IndentChars = "\t" };
```

→ **ダイジェスト一致のため、この保存形式を厳密に踏襲する必要がある。**

### 6.2 ファイル配置（解析から読み取れる構造）

```
{APPLY_FOLDER}                        = <AppData>/<clientId>            (clientId は eGovClientCommonResources.clientId)
├─ manage/                            CLIENT_MANAGE_FOLDER
│   ├─ <clientManagementFile>         CLIENT_MANAGE_FILE_PATH（申請案件台帳）
│   ├─ <clientManagementFile>.enc     （暗号化版。DataEncryptoClass で復号）
│   ├─ ApplyInfoDetails.html          （openApplicationConfirmInfo が生成, 19668）
│   └─ saved/                         CLIENT_MANAGE_SAVED_FOLDER（保存申請データ zip）
├─ work/                              CLIENT_WORK_FOLDER
│   ├─ {identifier}/
│   │   ├─ {procId}/                  getProcFolderPath()
│   │   │   ├─ kousei.xml             構成情報
│   │   │   ├─ kousei{17桁}.xml       部分署名・世代違い
│   │   │   ├─ <様式XML>
│   │   │   └─ <添付ファイル>
│   │   ├─ tmp.zip                    送信用zip（送信後削除, 78938）
│   │   └─ {identifier}_backup/       バックアップ
│   ├─ attachmenttemp/                CLIENT_WORK_TEMP_FOLDER（D&D の一時展開先, 16190）
│   ├─ Koubunsho/kanbunsho.html       公文書プレビュー（13762）
│   └─ tmp/
├─ logs/                              CLIENT_LOG_FOLDER
└─ identification_work/               INDIVIDUAL_AUTHORIZATION_FOLDER
```

### 6.3 CSRF / セッション / User-Agent

CSRF は **ページの hidden input `_csrf`** から取得（`28119`）:

```
28119|  public string getCsrfToken()
28122|      string text = "document.getElementsByName('_csrf').item(0).value";
28123|      NSObject val = WebViewHelper.WaitForAsyncResult(((WKWebView)...).EvaluateJavaScriptAsync(text).GetAwaiter());
28124|      return NSString.op_Implicit(...);
```

セッションは **Cookie `JSESSIONID`**。WKWebView の Cookie ストアから取得して保持（`60947`）:

```
60949|  CookieCollection cookieCollection = WebViewHelper.WaitForAsyncResult(WebViewHelper.GetCookies(_webView, _webView.Url).GetAwaiter());
60957|      if (item.Name == "JSESSIONID") { text = item.Value; break; }
60966|      if (string.IsNullOrEmpty(_sessionId)) { _sessionId = text; }
60970|      else if (text != _sessionId) { force = true; _sessionId = text; }
60975|      _webBrowser?.ExternalSetCookieCollection(cookieCollection, force);
```

起動時（`/startup/`）のログイン判定（`28020`〜`28042`）: `KEYCLOAK_ADAPTER_STATE` または
（`OAuth_Token_Request_State` かつ `JSESSIONID`）が揃っていればログイン済み。

HTTP 共通ヘッダ（`77143` `getHttpWebRequest` / `77161` `makeHttpWebRequest`）:

```
77145|  string csrfToken = webBrowser.csrfToken;
77147|  cookieContainer.Add(webBrowser.sessionCookie);
77164|  httpWebRequest.Headers.Add("X-CSRF-Token", csrfToken);
77165|  httpWebRequest.Headers.Add("X-Requested-With", "XMLHttpRequest");
77166|  httpWebRequest.Method = method;
77167|  httpWebRequest.PreAuthenticate = true;
77168|  httpWebRequest.ContentType = contentType;
77169|  httpWebRequest.UserAgent = webBrowser.GetCurrentUserAgent();
77170|  httpWebRequest.CookieContainer = cookieContainer;
77171|  httpWebRequest.Proxy.Credentials = proxyCredentials ?? CredentialCache.DefaultCredentials;
77172|  httpWebRequest.Credentials = basicCredentials;      // Basic認証（検証環境）
77173|  httpWebRequest.AllowAutoRedirect = true;
```

User-Agent の組み立て（`27895`）:

```
27895|  string userAgent = GetUserAgent() + " /clientId=" + eGovClientCommonResources.clientId + "/" + Assembly.GetExecutingAssembly().GetName().Version.ToString();
27896|  ((WebView)this).UserAgent = userAgent;
```

`GetUserAgent()`（`27143`）→ `WebViewHelper.GetUserAgentGlobal()`（`31262`）→ `GetUserAgent(WKWebView)`（`31278`）。
**WebView の UA に ` /clientId=<clientId>/<version>` を追記**したものが、そのまま HTTP の `User-Agent` になる
（`GetCurrentUserAgent()` `28346` = `webView.UserAgent`）。同種の付加は `24116`（起動URL生成側）にもある。

---

## 7. 第2のJS呼び出し経路（mac の反射ディスパッチ）

`DispatchExternal` とは別に、mac では **clientApi の公開メソッド名をそのまま WKWebView の
messageHandler 名として登録**しており、JS から `window.webkit.messageHandlers.<メソッド名>.postMessage(args)` で
直接呼べる（`31511`）。

```
31518|  MethodInfo[] methods = o.GetType().GetMethods();
31521|  if (JSCallHelper.CheckMethodProperties(o, methodInfo.Name) && userContentController != null)
31524|      userContentController.AddScriptMessageHandler(dispatcher, methodInfo.Name);
31538|  public static WebViewScriptMessageDispatcher CreateScriptMessageDispatcherAndSetObject(WKWebView webView, object o)

61141|  if (_jsWebAPI?.GetType().GetMethod(e.Message.Name) != null) JSCallHelper.CallObjectMethod(_jsWebAPI, e.Message.Name, e.Message.Body);
61147|  ProcessScriptMessage(e, _webBrowser?.clientApi);

61102|      if (o?.GetType().GetMethod(name) == null) { DbgLog.Log(true, "存在してないメソッドが呼び出される：{0}", name); return; }
61108|      if (!_jsInteropRestrictChecker.Check(name, _webView.IsLoading, calleeDiffMs)) { ...拒否... }
61114|      if (!CallObjectMethod(o, name, e, out object result, out int invokeId)) return;
61128|      WebViewHelper.InvokeScript(_webView, _jsReturnErrorCallback, invokeId.ToString(), text)
61133|      WebViewHelper.InvokeScriptWrapper(_webView, _jsReturnValueCallback, invokeId.ToString(), name, result.ToString())
```

- 引数配列の `[0]` は invokeId（`61045`〜`61050`）、`[1]` が実引数（`61068`）。
  戻りは `_jsReturnValueCallback(invokeId, name, result)` / `_jsReturnErrorCallback(invokeId, errorCode)`。
- `JSWebAPI`（`61664`）で公開されているのは `OpenSafariUseHtml(string data)`（`61679`）のみ。

mac 用シムの注入内容（`31570`〜`31588`）:

```
31573|  window.external = {}; window.chrome = {}; window.chrome.webview = {};
31576|  window.chrome.webview.addEventListener = function(n, callback){};
31577|  window.chrome.webview.postMessage = function(s) {window.webkit.messageHandlers.F3egclPostMessage.postMessage(s)};
31578|  F3egclMessageEventListenerMac = function(s){var event = {data: s}; F3egclMessageEventListener(event);};
31583|  window.external.<cmd> = async function(...args){return await F3egclCallClientV2('<cmd>',...args);};
```

→ `window.external.<cmd>(...)` はページ側 JS の `F3egclCallClientV2` を経由し、そこで uuid を付けて
`window.chrome.webview.postMessage` に渡す。**uuid 生成と Promise 管理はページ側JSの責務**。
Windows 版は `F3egclPostMessage` を外部スクリプトとして登録するだけ（`60898`）で、エンベロープは同じ。

---

## 8. ブリッジ実装への含意（優先順位）

1. **CORE_SIGN 15件**を実装すれば「署名して提出」まで到達できる。ただし `SignAndSend` 系は
   内部で `saveXmlAndSign` → `sendAppliData` の長い連鎖を呼ぶため、§4.2 の 1〜7 を再現する必要がある。
2. **XML のバイト一致性が最重要**。`SaveXml` の書式（BOMなしUTF-8 / `\n` / タブ）と、
   `<署名情報>` を `<構成情報>` の直後に挿入する順序、`Signature/@Id = yyyyMMddHHmmss` を守らないと
   ダイジェストが変わりサーバ側で拒否される。
3. **送信は分割アップロード**。`zipFullSize` / `zipPosition` / `preSendFlag` / `signAndSaveFlag` の4ヘッダと
   `application/octet-stream`、成功判定 `AppDataReceiveFlag` ヘッダ。multipart ではない。
   `preSendFlag=1`（事前送信）→ 署名 → `preSendFlag=0`（本送信）の2段階。
4. **UI 8件はスタブ化可能**（`preview*`, `open*`）。ただし `openApplicationConfirmInfo` は
   `manage/ApplyInfoDetails.html` を書き出す副作用がある（`19668`）。
5. **HTTP 4件は独立**（公文書/通知のダウンロード）。zip 展開して所定フォルダへ置くだけなので後回し可。

## 9. 未確認・注意

- `DIV_SIZE`（分割サイズ）の実値は本ファイル内で定数宣言を特定できていない（`SignatureAppli` のフィールド）。
  実装時は 1リクエストが許容サイズに収まる値を選び、`zipPosition` で連続性を保てばよい。
- `eGovClientCommonResources.clientId` / `clientManagementFile` / `FilePathMaxLength` の実値は
  リソースに埋め込まれており、本ファイルには展開されていない。
- `JSCallHelper.CheckMethodProperties` / `CallObjectMethod` の詳細（型変換規則）は未読。
- 本カタログは macOS 版 2.1.0.0 の逆コンパイル結果に基づく。Windows 版 (3.1.0.0) は未確認。
