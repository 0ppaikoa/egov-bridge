# ブリッジコマンド解説（全71件）

出典: `eGovClient.dll.decompiled.cs` の `DispatchExternal`（28351〜29666行）と各 clientApi メソッド本体。
「状態」は本リポジトリの実装状況。

## 初期化（initAppli 系・5件）

| コマンド                                 | 解説                                                                                                                                                                                                             | 状態                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `F3egclInitAppli_initAppli`              | 申請画面の初期化。`appliListStr`（`;;;`/`:::`/`___` 区切りの申請情報）を解析し、フォーム一式をダウンロード、初回は構成情報を申請データへ転記し、最後に申請データXMLを `F3egclCallSetXMLDoc` で画面へ渡す。13引数 | 実装済み                                    |
| `F3egclInitAppli_tagMapping`             | 指定した申請データとタグマッピング定義で `transcribeAppliData`（申請データ→申請データの転記）を実行する                                                                                                          | 未実装                                      |
| `F3egclInitAppli_initDocumentDetails`    | `strHtml`（公文書HTML）をページから読み、公文書として保存。続けて添付明細の初期化を行う。引数は添付ファイル名のJSON配列                                                                                          | 実装済み（公文書DLはURL未確定で明示エラー） |
| `F3egclInitAppli_initAppliPartSignGroup` | 部分署名グループ版の `initAppli`。処理内容は同等で、グループ用の申請情報を扱う                                                                                                                                   | 未実装                                      |
| `F3egclInitAppli_restartLogin`           | ログアウト後の再開要求。`url` を受けてメイン画面に再開を依頼する（実際は InitialUrl へ遷移）                                                                                                                     | 実装済み                                    |

## XML・フォーム（XMLDataAppli 系・20件）

| コマンド                                             | 解説                                                                                                                                                                       | 状態                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `F3egclXMLDataAppli_addForm`                         | 様式を申請データへ追加し、`Disp2WorkFile`（画面→XML保存）を実行する                                                                                                        | 未実装                       |
| `F3egclXMLDataAppli_storeWorkXMLFile`                | XML文字列を指定ファイル名で作業フォルダへ保存する。戻り値は `ReturnValues` のJSON                                                                                          | 実装済み                     |
| `F3egclXMLDataAppli_previewAttachedFile`             | `Koubunsho/<fileName>.html` を外部ブラウザで開く（HTML化済み公文書のプレビュー）                                                                                           | 未実装                       |
| `F3egclXMLDataAppli_SelectCertificateUI`             | 利用者証明書（マイナンバーカード等）の選択UIを出す。デジタル認証アプリ経路では不要                                                                                         | スタブ                       |
| `F3egclXMLDataAppli_setXMLFormInfo`                  | XML→画面。`F3egclSetValueForXml(name, value)` を項目ごとに呼び、繰り返しは `F3egclGrpLength/AddRow/GetRepeatIdxList/SetValueForXml2`。最後に `F3egclSetDataStructure(hex)` | 実装済み（繰り返しは未対応） |
| `F3egclXMLDataAppli_getXMLFormInfo`                  | 画面→XML。`F3egclGetValue(name)` で各項目を読み、更新後のXML文字列を返す                                                                                                   | 実装済み（繰り返しは未対応） |
| `F3egclXMLDataAppli_changeProc`                      | 手続を切り替え、タグマッピングを再適用して画面へXMLを反映する                                                                                                              | 未実装                       |
| `F3egclXMLDataAppli_changeForm`                      | 様式を切り替え、タグマッピングを再適用して画面へXMLを反映する                                                                                                              | 未実装                       |
| `F3egclXMLDataAppli_deleteForm`                      | 様式を削除する。先に現在の申請データを保存し、指定様式（続紙含む）を削除する                                                                                               | 未実装                       |
| `F3egclXMLDataAppli_previewOfficialDoc`              | 公文書プレビュー。実装は `previewFormConfirm` と同一メソッドに落ちる                                                                                                       | 未実装                       |
| `F3egclXMLDataAppli_previewFormConfirm`              | `sendHtml` から確認画面用HTMLを生成して開く                                                                                                                                | 未実装                       |
| `F3egclXMLDataAppli_deleteFormPartSign`              | 部分署名用に様式を削除する（applyForm の保存は任意引数）                                                                                                                   | 未実装                       |
| `F3egclXMLDataAppli_previewForm`                     | 様式のプレビューHTMLを生成して開く（`addSignFlag` で署名有無を切替）                                                                                                       | 未実装                       |
| `F3egclXMLDataAppli_backProcess`                     | 「戻る」操作。`initWorkData` を呼び直して作業状態を初期化する                                                                                                              | 未実装                       |
| `F3egclXMLDataAppli_userVerificationSignAndSave`     | 本人確認（姓・名・生年月日・年度・uniqueKey・認証フラグ）を行って署名保存する                                                                                              | 未実装                       |
| `F3egclXMLDataAppli_deleteFormPartSignForGroupApply` | グループ申請向けの部分署名様式削除                                                                                                                                         | 未実装                       |
| `F3egclXMLDataAppli_getApplyList`                    | 申請一覧をXMLから取得して返す（identifier, procId）                                                                                                                        | 未実装                       |
| `F3egclXMLDataAppli_copyForm`                        | 様式を複製する（続紙追加）。`nextApplyFormFileName` を新規作成する                                                                                                         | 未実装                       |
| `F3egclXMLDataAppli_saveAppliData`                   | 画面の入力値をXMLへ取り込み、`addStylesheetFlag` なら xml-stylesheet を付けて保存する                                                                                      | スタブ（常に例外）           |
| `F3egclXMLDataAppli_deleteFormPartSignGroup`         | グループ版の部分署名様式削除                                                                                                                                               | 未実装                       |

## 本人確認XML（UserVerification 系・1件）

| コマンド                                         | 解説                                       | 状態   |
| ------------------------------------------------ | ------------------------------------------ | ------ |
| `F3egclUserVerificationXMLDataAppli_backProcess` | 本人確認画面から戻る。作業状態を初期化する | 未実装 |

## ファイル管理・署名送信（FileManageAppli 系・23件）

| コマンド                                                             | 解説                                                                                | 状態     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| `F3egclFileManageAppli_openInBrowser`                                | 指定URLを外部ブラウザで開く（応答なし）                                             | 実装済み |
| `F3egclFileManageAppli_SaveAndStop`                                  | 一時保存（中断）。作業データを退避し、中断情報を保存して画面を閉じる                | 未実装   |
| `F3egclFileManageAppli_SignAndSave`                                  | 署名して保存（送信しない）。pre-send→署名→`saveFlag` 付き送信                       | 実装済み |
| `F3egclFileManageAppli_SignAndSend`                                  | 署名して送信。pre-send→署名→本送信。`signMaxFlag=true` はバックアップ後に無署名送信 | 実装済み |
| `F3egclFileManageAppli_LoadApplication`                              | 保存済み申請を読み込むダイアログを開く                                              | 未実装   |
| `F3egclFileManageAppli_SaveApplication`                              | 申請データをファイルとして保存する（バックアップ／失敗時リストア付き）              | 未実装   |
| `F3egclFileManageAppli_importAppliData`                              | 申請データ（zip）を取り込む。procType/groupId などで種別を判定                      | 未実装   |
| `F3egclFileManageAppli_SignAndSendPartSignGroup`                     | 部分署名グループの署名送信                                                          | 未実装   |
| `F3egclFileManageAppli_SaveAndStopPartSignGroup`                     | 部分署名グループの一時保存                                                          | 未実装   |
| `F3egclFileManageAppli_SignAndSavePartSign`                          | 部分署名の署名保存（署名対象・添付のコピー指定あり）                                | 未実装   |
| `F3egclFileManageAppli_SignAndSendPartSign`                          | 部分署名の署名送信                                                                  | 未実装   |
| `F3egclFileManageAppli_SetAttachedFileSize`                          | 添付ファイルのサイズ等を画面へ反映する（`setAttachedFile2UI`）                      | 一部実装 |
| `F3egclFileManageAppli_AppendFeeInfoAttribute`                       | 手数料情報を構成情報へ追加し、画面へXMLを反映する                                   | 未実装   |
| `F3egclFileManageAppli_SaveApplicationPartSignGroup`                 | グループ版の申請保存                                                                | 未実装   |
| `F3egclFileManageAppli_importAppliDataPartSignGroup`                 | グループ版の申請データ取り込み                                                      | 未実装   |
| `F3egclFileManageAppli_openApplicationConfirmInfo`                   | 申請確認情報を開く（引数 `data`、応答なし）                                         | 未実装   |
| `F3egclFileManageAppli_AppendFeeInfoAttributePartSignGroup`          | グループ版の手数料情報追加                                                          | 未実装   |
| `F3egclFileManageAppli_AppendAttachedAttribute`                      | 添付書類属性情報を構成情報へ追加する（バックアップ／リストア付き）                  | 実装済み |
| `F3egclFileManageAppli_AppendAttachedAttributePartSign`              | 部分署名版の添付属性追加                                                            | 未実装   |
| `F3egclFileManageAppli_AppendAttachedAttributePartSignGroup`         | グループ版の添付属性追加                                                            | 未実装   |
| `F3egclFileManageAppli_AppendAttachedAttributePartSignForGroupApply` | グループ申請向けの添付属性追加                                                      | 未実装   |
| `F3egclFileManageAppli_initAttachList`                               | 添付済みファイル名リストを初期化する。戻り値は 1                                    | 簡易実装 |
| `F3egclFileManageAppli_openElectronicPayment`                        | 電子納付ページを外部ブラウザで開く（応答なし）                                      | 未実装   |

## 署名前チェック（SignatureAppli 系・3件）

| コマンド                                           | 解説                                                                                              | 状態   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| `F3egclSignatureAppli_checkInputItem`              | 署名前の入力チェック。actionType 1/2 の各様式を `checkInputItem` で検証し、結果をJSON文字列で返す | 未実装 |
| `F3egclSignatureAppli_UrlExistsCheck`              | 添付URLの到達性を確認する                                                                         | 未実装 |
| `F3egclSignatureAppli_checkInputItemPartSignGroup` | 部分署名グループ版の入力チェック                                                                  | 未実装 |

## タグ整合チェック（TagConfCheck 系・2件）

| コマンド                                       | 解説                                                     | 状態   |
| ---------------------------------------------- | -------------------------------------------------------- | ------ |
| `F3egclTagConfCheck_tagConfCheckPartSignGroup` | 部分署名グループ版のタグ整合チェック                     | 未実装 |
| `F3egclTagConfCheck_tagConfCheck`              | 申請データと構成情報のタグ整合を検証し、結果をJSONで返す | 未実装 |

## 後処理（PostProcessAppli 系・3件）

| コマンド                                  | 解説                                                                                                  | 状態     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| `F3egclPostProcessAppli_deleteAppliData`  | 申請データを削除する。`workDeleteFlag` が真なら作業フォルダも削除。識別子の `.zip.enc` は除去して扱う | 未実装   |
| `F3egclPostProcessAppli_deleteWorkData`   | 作業フォルダを削除する（`deleteWorkData(identifier, "0")`）                                           | 実装済み |
| `F3egclPostProcessAppli_restoreAppliData` | バックアップから申請データを復元する                                                                  | 未実装   |

## 中断情報反映（1件）

| コマンド                                                   | 解説                                                                                    | 状態   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| `F3egclReflectSuspendProcInfoClass_reflectSuspendProcInfo` | 中断（一時保存）した申請情報を画面へ反映する。ページJS評価・XML読取・ファイル削除を伴う | 未実装 |

## 公文書ダウンロード（4件）

| コマンド                                       | 解説                                                                       | 状態   |
| ---------------------------------------------- | -------------------------------------------------------------------------- | ------ |
| `OfficialDocumentDownload_FileDownload`        | 公文書を1件ダウンロードする（arriveId, noticeSubId）。保存先フォルダを選択 | 未実装 |
| `OfficialDocumentDownload_FileDownloadAll`     | 公文書を一括ダウンロードする（arriveId）                                   | 未実装 |
| `PostOfficialDocumentDownload_FileDownload`    | 事後公文書を1件ダウンロード（ministryMessageId, postId）                   | 未実装 |
| `PostOfficialDocumentDownload_FileDownloadAll` | 事後公文書を一括ダウンロード（ministryMessageId, postGroupId, ministryId） | 未実装 |

## 単発コマンド（添付・設定・画面・9件）

| コマンド                              | 解説                                                                                    | 状態                       |
| ------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------- |
| `AddAttachedFile_DragEnter`           | 添付欄へのドラッグ進入を通知する（画面演出のみ）                                        | 簡易実装                   |
| `AddAttachedFile_selectFile`          | ファイル選択ダイアログを開き、選ばれたファイルを添付として取り込む                      | 未実装                     |
| `SetPresentationOrgInfoPartSignGroup` | 提出先情報（識別子・名称）を申請XMLへ書き込む。部分署名グループ版                       | 未実装                     |
| `SetEraParallelPeriodFlag`            | 元号並列期間フラグを設定する（画面表示用）                                              | 実装済み                   |
| `F3egcl_CancelDigitalAuth`            | 進行中のデジタル認証署名をキャンセルする（応答なし）                                    | 実装済み                   |
| `AddAttachedFile_Drop`                | ドロップされたファイル（base64）を一時フォルダへ書き出し、添付として取り込む            | 実装済み                   |
| `SetMinistRefInfo`                    | 府省照会情報を構成情報へ反映する（`府省照会N/府省照会情報` をCSV順に上書き）            | 実装済み                   |
| `SetPresentationOrgInfo`              | 提出先情報（識別子・名称）を申請XMLへ書き込み、タグマッピングを再適用して画面へ反映する | 実装済み（再適用は未接続） |
| `CloseWindow`                         | アプリケーションを終了する（`Application.Current.Quit()`、応答なし）                    | 実装済み                   |
