# ブリッジコマンド一覧（C# デコンパイル直読み）

出典: `eGovClient.dll.decompiled.cs` の `DispatchExternal`（28351〜29666行）。
分類はコマンド名の接頭辞による機械的分類（推測のグルーピングはしない）。

- コマンド総数: **71**
- 簡易実装: **2**
- 実装済み: **17**
- 未実装: **49**
- スタブ: **2**
- 一部実装: **1**

## 初期化（initAppli 系）（5件）

| コマンド                                 | clientApi                              | 引数                                                                                                                                                                                                                       |  C#行 | 状態     |
| ---------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | -------- |
| `F3egclInitAppli_initAppli`              | F3egclInitAppli_initAppli              | controlType, procType, identifier, procId, procFabFormFileName, applyFormProcId, applyFormFileName, applyFormFileNameListStr, tagMappingFileName, appliListStr, addSignFlag, addFormProcIdListStr, deleteFormProcIdListStr | 28382 | 実装済み |
| `F3egclInitAppli_tagMapping`             | F3egclInitAppli_tagMapping             | identifier, procId, applyFormFileName, tagMappingFileName                                                                                                                                                                  | 28423 | 未実装   |
| `F3egclInitAppli_initDocumentDetails`    | F3egclInitAppli_initDocumentDetails    | strAttachedFileNames                                                                                                                                                                                                       | 28464 | 実装済み |
| `F3egclInitAppli_initAppliPartSignGroup` | F3egclInitAppli_initAppliPartSignGroup | controlType, procType, identifier, procId, procFabFormFileName, applyFormProcId, applyFormFileName, applyFormFileNameListStr, tagMappingFileName, appliListStr, addSignFlag, addFormProcIdListStr, deleteFormProcIdListStr | 28565 | 未実装   |
| `F3egclInitAppli_restartLogin`           | F3egclInitAppli_restartLogin           | url                                                                                                                                                                                                                        | 29611 | 実装済み |

## XML・フォーム（XMLDataAppli 系）（20件）

| コマンド                                             | clientApi                                          | 引数                                                                                                    |  C#行 | 状態     |
| ---------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----: | -------- |
| `F3egclXMLDataAppli_addForm`                         | F3egclXMLDataAppli_addForm                         | identifier, applyFormProcId, applyFormFileName                                                          | 28441 | 未実装   |
| `F3egclXMLDataAppli_storeWorkXMLFile`                | F3egclXMLDataAppli_storeWorkXMLFile                | identifier, procName, workXmlFile, xmlDoc                                                               | 28482 | 実装済み |
| `F3egclXMLDataAppli_previewAttachedFile`             | F3egclXMLDataAppli_previewAttachedFile             | fileName                                                                                                | 28583 | 未実装   |
| `F3egclXMLDataAppli_SelectCertificateUI`             | F3egclXMLDataAppli_SelectCertificateUI             | 0個                                                                                                     | 28619 | スタブ   |
| `F3egclXMLDataAppli_setXMLFormInfo`                  | F3egclXMLDataAppli_setXMLFormInfo                  | xmlDoc, mappingXMLDoc, structureXMLDoc, repeatXMLDoc                                                    | 28660 | 実装済み |
| `F3egclXMLDataAppli_getXMLFormInfo`                  | F3egclXMLDataAppli_getXMLFormInfo                  | structureXMLDoc, mappingXMLDoc, repeatXMLDoc                                                            | 28662 | 実装済み |
| `F3egclXMLDataAppli_changeProc`                      | F3egclXMLDataAppli_changeProc                      | identifier, applyFormProcId, applyFormFileName, tagMappingFileName                                      | 28737 | 未実装   |
| `F3egclXMLDataAppli_changeForm`                      | F3egclXMLDataAppli_changeForm                      | identifier, formProcId, formFileName, tagMappingFileName                                                | 28739 | 未実装   |
| `F3egclXMLDataAppli_deleteForm`                      | F3egclXMLDataAppli_deleteForm                      | identifier, applyFormProcId, applyFormFileName, deleteFormProcId, deleteFormFileName, addCopiedFormFlag | 28771 | 未実装   |
| `F3egclXMLDataAppli_previewOfficialDoc`              | F3egclXMLDataAppli_previewOfficialDoc              | 0個                                                                                                     | 28794 | 未実装   |
| `F3egclXMLDataAppli_previewFormConfirm`              | F3egclXMLDataAppli_previewFormConfirm              | identifier, procName, sendHtml                                                                          | 28796 | 未実装   |
| `F3egclXMLDataAppli_deleteFormPartSign`              | F3egclXMLDataAppli_deleteFormPartSign              | identifier, deleteFormProcId, applyFormProcId, applyFormFileName                                        | 28828 | 未実装   |
| `F3egclXMLDataAppli_previewForm`                     | F3egclXMLDataAppli_previewForm                     | identifier, applyFormProcId, applyFormFileName, previewFormFileName, addSignFlag                        | 28941 | 未実装   |
| `F3egclXMLDataAppli_backProcess`                     | F3egclXMLDataAppli_backProcess                     | identifier                                                                                              | 28959 | 未実装   |
| `F3egclXMLDataAppli_userVerificationSignAndSave`     | F3egclXMLDataAppli_userVerificationSignAndSave     | lastName, firstName, birthdate, yearNo, uniqueKey, individualAuthenticatedFlag, keycloakId              | 29037 | 未実装   |
| `F3egclXMLDataAppli_deleteFormPartSignForGroupApply` | F3egclXMLDataAppli_deleteFormPartSignForGroupApply | identifier, deleteFormProcId, applyFormProcId, applyFormFileName                                        | 29198 | 未実装   |
| `F3egclXMLDataAppli_getApplyList`                    | F3egclXMLDataAppli_getApplyList                    | identifier, procId                                                                                      | 29304 | 未実装   |
| `F3egclXMLDataAppli_copyForm`                        | F3egclXMLDataAppli_copyForm                        | identifier, applyFormProcId, applyFormFileName, nextApplyFormFileName, tagMappingFileName               | 29359 | 未実装   |
| `F3egclXMLDataAppli_saveAppliData`                   | F3egclXMLDataAppli_saveAppliData                   | identifier, applyFormProcId, applyFormFileName, addStylesheetFlag                                       | 29377 | スタブ   |
| `F3egclXMLDataAppli_deleteFormPartSignGroup`         | F3egclXMLDataAppli_deleteFormPartSignGroup         | identifier, applyFormProcId, applyFormFileName, deleteFormProcId, deleteFormFileName, addCopiedFormFlag | 29557 | 未実装   |

## 本人確認XML（UserVerification 系）（1件）

| コマンド                                         | clientApi                                      | 引数 |  C#行 | 状態   |
| ------------------------------------------------ | ---------------------------------------------- | ---- | ----: | ------ |
| `F3egclUserVerificationXMLDataAppli_backProcess` | F3egclUserVerificationXMLDataAppli_backProcess | 0個  | 28982 | 未実装 |

## ファイル管理・署名送信（FileManageAppli 系）（23件）

| コマンド                                                             | clientApi                                                          | 引数                                                                                                                                                                                                            |  C#行 | 状態     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | -------- |
| `F3egclFileManageAppli_openInBrowser`                                | F3egclFileManageAppli_openInBrowser                                | url                                                                                                                                                                                                             | 28554 | 実装済み |
| `F3egclFileManageAppli_SaveAndStop`                                  | F3egclFileManageAppli_SaveAndStop                                  | identifier, groupId, groupProcName, applyFormProcId, applyFormFileName, suspendInfo, appDataName, keycloakId                                                                                                    | 28642 | 未実装   |
| `F3egclFileManageAppli_SignAndSave`                                  | F3egclFileManageAppli_SignAndSave                                  | identifier, procIdListStr, fabFormFileName, signFlag, addSignFlag, signatureId, signInfoJson                                                                                                                    | 28694 | 実装済み |
| `F3egclFileManageAppli_SignAndSend`                                  | F3egclFileManageAppli_SignAndSend                                  | identifier, procIdListStr, fabFormFileName, signFlag, signMaxFlag, addSignFlag, signatureId, signInfoJson                                                                                                       | 28713 | 実装済み |
| `F3egclFileManageAppli_LoadApplication`                              | F3egclFileManageAppli_LoadApplication                              | 0個                                                                                                                                                                                                             | 28846 | 未実装   |
| `F3egclFileManageAppli_SaveApplication`                              | F3egclFileManageAppli_SaveApplication                              | identifier, procId, procIdListStr, signFlag                                                                                                                                                                     | 28864 | 未実装   |
| `F3egclFileManageAppli_importAppliData`                              | F3egclFileManageAppli_importAppliData                              | fileName, procType, groupId, noticeSubId, keycloakId                                                                                                                                                            | 28900 | 未実装   |
| `F3egclFileManageAppli_SignAndSendPartSignGroup`                     | F3egclFileManageAppli_SignAndSendPartSignGroup                     | identifier, procIdListStr, signProcIdListStr, signFlag, copySrcProcIdListStr, signAttachedFileListStr, kouseiAttachedFileNameListStr, addSignFlag, signedAttachedFileFabFileNameList, signatureId, signInfoJson | 29000 | 未実装   |
| `F3egclFileManageAppli_SaveAndStopPartSignGroup`                     | F3egclFileManageAppli_SaveAndStopPartSignGroup                     | identifier, groupId, groupProcName, applyFormProcId, applyFormFileName, suspendInfo, appDataName, keycloakId                                                                                                    | 29019 | 未実装   |
| `F3egclFileManageAppli_SignAndSavePartSign`                          | F3egclFileManageAppli_SignAndSavePartSign                          | identifier, procIdListStr, signProcIdListStr, signFlag, copySrcProcId, signAttachedFileListStr, kouseiAttachedFileNameListStr, addSignFlag, signedAttachedFileFabFileNameList, signatureId, signInfoJson        | 29060 | 未実装   |
| `F3egclFileManageAppli_SignAndSendPartSign`                          | F3egclFileManageAppli_SignAndSendPartSign                          | identifier, procIdListStr, signProcIdListStr, signFlag, copySrcProcId, signAttachedFileListStr, kouseiAttachedFileNameListStr, addSignFlag, signedAttachedFileFabFileNameList, signatureId, signInfoJson        | 29079 | 未実装   |
| `F3egclFileManageAppli_SetAttachedFileSize`                          | F3egclFileManageAppli_SetAttachedFileSize                          | index, filePath                                                                                                                                                                                                 | 29098 | 一部実装 |
| `F3egclFileManageAppli_AppendFeeInfoAttribute`                       | F3egclFileManageAppli_AppendFeeInfoAttribute                       | identifier, procId, inputFeeListStr, applyFormProcId, applyFormFileName                                                                                                                                         | 29139 | 未実装   |
| `F3egclFileManageAppli_SaveApplicationPartSignGroup`                 | F3egclFileManageAppli_SaveApplicationPartSignGroup                 | identifier, procId, procIdListStr, signFlag                                                                                                                                                                     | 29216 | 未実装   |
| `F3egclFileManageAppli_importAppliDataPartSignGroup`                 | F3egclFileManageAppli_importAppliDataPartSignGroup                 | fileName, procType, groupId, noticeSubId, keycloakId                                                                                                                                                            | 29234 | 未実装   |
| `F3egclFileManageAppli_openApplicationConfirmInfo`                   | F3egclFileManageAppli_openApplicationConfirmInfo                   | data                                                                                                                                                                                                            | 29275 | 未実装   |
| `F3egclFileManageAppli_AppendFeeInfoAttributePartSignGroup`          | F3egclFileManageAppli_AppendFeeInfoAttributePartSignGroup          | identifier, procId, inputFeeListStr, applyFormFileName                                                                                                                                                          | 29395 | 未実装   |
| `F3egclFileManageAppli_AppendAttachedAttribute`                      | F3egclFileManageAppli_AppendAttachedAttribute                      | identifier, fabFormProcId, fabFormFileName, attachedLastIndex                                                                                                                                                   | 29413 | 実装済み |
| `F3egclFileManageAppli_AppendAttachedAttributePartSign`              | F3egclFileManageAppli_AppendAttachedAttributePartSign              | identifier, attachedLastIndex                                                                                                                                                                                   | 29431 | 未実装   |
| `F3egclFileManageAppli_AppendAttachedAttributePartSignGroup`         | F3egclFileManageAppli_AppendAttachedAttributePartSignGroup         | identifier, fabFormProcId, fabFormFileName, attachedLastIndex                                                                                                                                                   | 29449 | 未実装   |
| `F3egclFileManageAppli_AppendAttachedAttributePartSignForGroupApply` | F3egclFileManageAppli_AppendAttachedAttributePartSignForGroupApply | identifier, procId, attachedLastIndex                                                                                                                                                                           | 29467 | 未実装   |
| `F3egclFileManageAppli_initAttachList`                               | F3egclFileManageAppli_initAttachList                               | 0個                                                                                                                                                                                                             | 29575 | 簡易実装 |
| `F3egclFileManageAppli_openElectronicPayment`                        | F3egclFileManageAppli_openElectronicPayment                        | url                                                                                                                                                                                                             | 29629 | 未実装   |

## 署名前チェック（SignatureAppli 系）（3件）

| コマンド                                           | clientApi                                        | 引数       |  C#行 | 状態   |
| -------------------------------------------------- | ------------------------------------------------ | ---------- | ----: | ------ |
| `F3egclSignatureAppli_checkInputItem`              | F3egclSignatureAppli_checkInputItem              | identifier | 28518 | 未実装 |
| `F3egclSignatureAppli_UrlExistsCheck`              | F3egclSignatureAppli_UrlExistsCheck              | Url        | 28536 | 未実装 |
| `F3egclSignatureAppli_checkInputItemPartSignGroup` | F3egclSignatureAppli_checkInputItemPartSignGroup | identifier | 29257 | 未実装 |

## タグ整合チェック（TagConfCheck 系）（2件）

| コマンド                                       | clientApi                                    | 引数       |  C#行 | 状態   |
| ---------------------------------------------- | -------------------------------------------- | ---------- | ----: | ------ |
| `F3egclTagConfCheck_tagConfCheckPartSignGroup` | F3egclTagConfCheck_tagConfCheckPartSignGroup | identifier | 29175 | 未実装 |
| `F3egclTagConfCheck_tagConfCheck`              | F3egclTagConfCheck_tagConfCheck              | identifier | 29286 | 未実装 |

## 後処理（PostProcessAppli 系）（3件）

| コマンド                                  | clientApi                               | 引数                         |  C#行 | 状態     |
| ----------------------------------------- | --------------------------------------- | ---------------------------- | ----: | -------- |
| `F3egclPostProcessAppli_deleteAppliData`  | F3egclPostProcessAppli_deleteAppliData  | identifierId, workDeleteFlag | 28601 | 未実装   |
| `F3egclPostProcessAppli_deleteWorkData`   | F3egclPostProcessAppli_deleteWorkData   | identifier                   | 28918 | 実装済み |
| `F3egclPostProcessAppli_restoreAppliData` | F3egclPostProcessAppli_restoreAppliData | identifier                   | 29485 | 未実装   |

## 中断情報反映（ReflectSuspendProcInfo 系）（1件）

| コマンド                                                   | clientApi                                                | 引数                                     |  C#行 | 状態   |
| ---------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------- | ----: | ------ |
| `F3egclReflectSuspendProcInfoClass_reflectSuspendProcInfo` | F3egclReflectSuspendProcInfoClass_reflectSuspendProcInfo | pageNumber, displayedResults, keycloakId | 29593 | 未実装 |

## 公文書ダウンロード（2件）

| コマンド                                   | clientApi                                | 引数                  |  C#行 | 状態   |
| ------------------------------------------ | ---------------------------------------- | --------------------- | ----: | ------ |
| `OfficialDocumentDownload_FileDownload`    | OfficialDocumentDownload_FileDownload    | arriveId, noticeSubId | 28882 | 未実装 |
| `OfficialDocumentDownload_FileDownloadAll` | OfficialDocumentDownload_FileDownloadAll | arriveId              | 29503 | 未実装 |

## 公文書ダウンロード（POST）（2件）

| コマンド                                       | clientApi                                    | 引数                                       |  C#行 | 状態   |
| ---------------------------------------------- | -------------------------------------------- | ------------------------------------------ | ----: | ------ |
| `PostOfficialDocumentDownload_FileDownload`    | PostOfficialDocumentDownload_FileDownload    | ministryMessageId, postId                  | 29116 | 未実装 |
| `PostOfficialDocumentDownload_FileDownloadAll` | PostOfficialDocumentDownload_FileDownloadAll | ministryMessageId, postGroupId, ministryId | 29157 | 未実装 |

## 単発コマンド（添付・設定・画面）（9件）

| コマンド                              | clientApi                           | 引数                                                                                                                   |  C#行 | 状態     |
| ------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----: | -------- |
| `AddAttachedFile_DragEnter`           | AddAttachedFile_DragEnter           | index                                                                                                                  | 28364 | 簡易実装 |
| `AddAttachedFile_selectFile`          | AddAttachedFile_selectFile          | index                                                                                                                  | 28405 | 未実装   |
| `SetPresentationOrgInfoPartSignGroup` | SetPresentationOrgInfoPartSignGroup | identifier, fabFormProcId, fabFormFileName, applyFormProcId, applyFormFileName, presentationOrgId, presentationOrgName | 28500 | 未実装   |
| `SetEraParallelPeriodFlag`            | SetEraParallelPeriodFlag            | eraParallelPeriodFlag                                                                                                  | 29327 | 実装済み |
| `F3egcl_CancelDigitalAuth`            | F3egcl_CancelDigitalAuth            | 0個                                                                                                                    | 29333 | 実装済み |
| `AddAttachedFile_Drop`                | AddAttachedFile_Drop                | index                                                                                                                  | 29341 | 実装済み |
| `SetMinistRefInfo`                    | SetMinistRefInfo                    | identifier, fabFormProcId, fabFormFileName, ministRefInfoListStr, applyFormFileName, applyFormFileData                 | 29521 | 実装済み |
| `SetPresentationOrgInfo`              | SetPresentationOrgInfo              | identifier, fabFormProcId, fabFormFileName, applyFormProcId, applyFormFileName, presentationOrgId, presentationOrgName | 29539 | 実装済み |
| `CloseWindow`                         | CloseWindow                         | 0個                                                                                                                    | 29635 | 実装済み |
