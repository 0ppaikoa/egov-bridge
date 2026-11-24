// コマンドレジストリ。未実装コマンドは throw して reject させる（黙殺はしない）。
// 引数の個数はネイティブ側の読み取り位置から（docs/command-catalog.md 参照）。
import { state } from './state.ts';
import type { CommandEntry } from './dispatch.ts';
import {
  cmdSignAndSend,
  cmdSignAndSave,
  cmdStoreWorkXmlFile,
  cmdDeleteWorkData,
  cmdInitAttachList,
  cmdOpenInBrowser,
} from './commands-core.ts';
import {
  cmdAddAttachedFileDragEnter,
  cmdAddAttachedFileDrop,
  cmdAppendAttachedAttribute,
  cmdSetAttachedFileSize,
} from './commands-attach.ts';
import {
  cmdSetMinistRefInfo,
  cmdSetPresentationOrgInfo,
  cmdRestartLogin,
  cmdSelectCertificateUI,
  cmdSaveAppliDataPlaceholder,
} from './commands-misc.ts';
import { initAppli, initDocumentDetails } from './init-appli.ts';

function notImpl(name: string): CommandEntry['fn'] {
  return () => {
    throw new Error('egov-bridge: 未実装のコマンドです: ' + name);
  };
}

function setEraParallelPeriodFlag(args: string[]): void {
  state.eraParallelPeriodFlag = args[0] === 'true';
}
function cancelDigitalAuth(): void {
  state.digitalAuth.cancelRequested = true;
}
function closeWindow(): void {
  window.close();
}

function cmdInitAppli(args: string[]): Promise<number> {
  return initAppli(args);
}

function cmdInitDocumentDetails(args: string[]): number {
  return initDocumentDetails(args);
}

export const COMMANDS: Record<string, CommandEntry> = {
  AddAttachedFile_DragEnter: { oneWay: false, fn: cmdAddAttachedFileDragEnter },
  F3egclInitAppli_initAppli: { oneWay: false, fn: cmdInitAppli },
  AddAttachedFile_selectFile: { oneWay: false, fn: notImpl('AddAttachedFile_selectFile') },
  F3egclInitAppli_tagMapping: { oneWay: false, fn: notImpl('F3egclInitAppli_tagMapping') },
  F3egclXMLDataAppli_addForm: { oneWay: false, fn: notImpl('F3egclXMLDataAppli_addForm') },
  F3egclInitAppli_initDocumentDetails: {
    oneWay: false,
    fn: cmdInitDocumentDetails,
  },
  F3egclXMLDataAppli_storeWorkXMLFile: {
    oneWay: false,
    fn: cmdStoreWorkXmlFile,
  },
  SetPresentationOrgInfoPartSignGroup: {
    oneWay: false,
    fn: notImpl('SetPresentationOrgInfoPartSignGroup'),
  },
  F3egclSignatureAppli_checkInputItem: {
    oneWay: false,
    fn: notImpl('F3egclSignatureAppli_checkInputItem'),
  },
  F3egclSignatureAppli_UrlExistsCheck: {
    oneWay: false,
    fn: notImpl('F3egclSignatureAppli_UrlExistsCheck'),
  },
  F3egclFileManageAppli_openInBrowser: {
    oneWay: true,
    fn: cmdOpenInBrowser,
  },
  F3egclInitAppli_initAppliPartSignGroup: {
    oneWay: false,
    fn: notImpl('F3egclInitAppli_initAppliPartSignGroup'),
  },
  F3egclXMLDataAppli_previewAttachedFile: {
    oneWay: false,
    fn: notImpl('F3egclXMLDataAppli_previewAttachedFile'),
  },
  F3egclPostProcessAppli_deleteAppliData: {
    oneWay: false,
    fn: notImpl('F3egclPostProcessAppli_deleteAppliData'),
  },
  F3egclXMLDataAppli_SelectCertificateUI: {
    oneWay: false,
    fn: cmdSelectCertificateUI,
  },
  F3egclFileManageAppli_SaveAndStop: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_SaveAndStop'),
  },
  F3egclXMLDataAppli_setXMLFormInfo: {
    oneWay: false,
    fn: notImpl('F3egclXMLDataAppli_setXMLFormInfo'),
  },
  F3egclXMLDataAppli_getXMLFormInfo: {
    oneWay: false,
    fn: notImpl('F3egclXMLDataAppli_getXMLFormInfo'),
  },
  F3egclFileManageAppli_SignAndSave: {
    oneWay: false,
    fn: cmdSignAndSave,
  },
  F3egclFileManageAppli_SignAndSend: {
    oneWay: false,
    fn: cmdSignAndSend,
  },
  F3egclXMLDataAppli_changeProc: { oneWay: false, fn: notImpl('F3egclXMLDataAppli_changeProc') },
  F3egclXMLDataAppli_changeForm: { oneWay: false, fn: notImpl('F3egclXMLDataAppli_changeForm') },
  F3egclXMLDataAppli_deleteForm: { oneWay: false, fn: notImpl('F3egclXMLDataAppli_deleteForm') },
  F3egclXMLDataAppli_previewOfficialDoc: {
    oneWay: false,
    fn: notImpl('F3egclXMLDataAppli_previewOfficialDoc'),
  },
  F3egclXMLDataAppli_previewFormConfirm: {
    oneWay: false,
    fn: notImpl('F3egclXMLDataAppli_previewFormConfirm'),
  },
  F3egclXMLDataAppli_deleteFormPartSign: {
    oneWay: false,
    fn: notImpl('F3egclXMLDataAppli_deleteFormPartSign'),
  },
  F3egclFileManageAppli_LoadApplication: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_LoadApplication'),
  },
  F3egclFileManageAppli_SaveApplication: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_SaveApplication'),
  },
  OfficialDocumentDownload_FileDownload: {
    oneWay: false,
    fn: notImpl('OfficialDocumentDownload_FileDownload'),
  },
  F3egclFileManageAppli_importAppliData: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_importAppliData'),
  },
  F3egclPostProcessAppli_deleteWorkData: {
    oneWay: false,
    fn: cmdDeleteWorkData,
  },
  F3egclXMLDataAppli_previewForm: { oneWay: false, fn: notImpl('F3egclXMLDataAppli_previewForm') },
  F3egclXMLDataAppli_backProcess: { oneWay: false, fn: notImpl('F3egclXMLDataAppli_backProcess') },
  F3egclUserVerificationXMLDataAppli_backProcess: {
    oneWay: false,
    fn: notImpl('F3egclUserVerificationXMLDataAppli_backProcess'),
  },
  F3egclFileManageAppli_SignAndSendPartSignGroup: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_SignAndSendPartSignGroup'),
  },
  F3egclFileManageAppli_SaveAndStopPartSignGroup: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_SaveAndStopPartSignGroup'),
  },
  F3egclXMLDataAppli_userVerificationSignAndSave: {
    oneWay: false,
    fn: notImpl('F3egclXMLDataAppli_userVerificationSignAndSave'),
  },
  F3egclFileManageAppli_SignAndSavePartSign: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_SignAndSavePartSign'),
  },
  F3egclFileManageAppli_SignAndSendPartSign: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_SignAndSendPartSign'),
  },
  F3egclFileManageAppli_SetAttachedFileSize: {
    oneWay: false,
    fn: cmdSetAttachedFileSize,
  },
  PostOfficialDocumentDownload_FileDownload: {
    oneWay: false,
    fn: notImpl('PostOfficialDocumentDownload_FileDownload'),
  },
  F3egclFileManageAppli_AppendFeeInfoAttribute: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_AppendFeeInfoAttribute'),
  },
  PostOfficialDocumentDownload_FileDownloadAll: {
    oneWay: false,
    fn: notImpl('PostOfficialDocumentDownload_FileDownloadAll'),
  },
  F3egclTagConfCheck_tagConfCheckPartSignGroup: {
    oneWay: false,
    fn: notImpl('F3egclTagConfCheck_tagConfCheckPartSignGroup'),
  },
  F3egclXMLDataAppli_deleteFormPartSignForGroupApply: {
    oneWay: false,
    fn: notImpl('F3egclXMLDataAppli_deleteFormPartSignForGroupApply'),
  },
  F3egclFileManageAppli_SaveApplicationPartSignGroup: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_SaveApplicationPartSignGroup'),
  },
  F3egclFileManageAppli_importAppliDataPartSignGroup: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_importAppliDataPartSignGroup'),
  },
  F3egclSignatureAppli_checkInputItemPartSignGroup: {
    oneWay: false,
    fn: notImpl('F3egclSignatureAppli_checkInputItemPartSignGroup'),
  },
  F3egclFileManageAppli_openApplicationConfirmInfo: {
    oneWay: true,
    fn: notImpl('F3egclFileManageAppli_openApplicationConfirmInfo'),
  },
  F3egclTagConfCheck_tagConfCheck: {
    oneWay: false,
    fn: notImpl('F3egclTagConfCheck_tagConfCheck'),
  },
  F3egclXMLDataAppli_getApplyList: {
    oneWay: false,
    fn: notImpl('F3egclXMLDataAppli_getApplyList'),
  },
  SetEraParallelPeriodFlag: { oneWay: true, fn: setEraParallelPeriodFlag },
  F3egcl_CancelDigitalAuth: { oneWay: true, fn: cancelDigitalAuth },
  AddAttachedFile_Drop: { oneWay: false, fn: cmdAddAttachedFileDrop },
  F3egclXMLDataAppli_copyForm: { oneWay: false, fn: notImpl('F3egclXMLDataAppli_copyForm') },
  F3egclXMLDataAppli_saveAppliData: {
    oneWay: false,
    fn: cmdSaveAppliDataPlaceholder,
  },
  F3egclFileManageAppli_AppendFeeInfoAttributePartSignGroup: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_AppendFeeInfoAttributePartSignGroup'),
  },
  F3egclFileManageAppli_AppendAttachedAttribute: {
    oneWay: false,
    fn: cmdAppendAttachedAttribute,
  },
  F3egclFileManageAppli_AppendAttachedAttributePartSign: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_AppendAttachedAttributePartSign'),
  },
  F3egclFileManageAppli_AppendAttachedAttributePartSignGroup: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_AppendAttachedAttributePartSignGroup'),
  },
  F3egclFileManageAppli_AppendAttachedAttributePartSignForGroupApply: {
    oneWay: false,
    fn: notImpl('F3egclFileManageAppli_AppendAttachedAttributePartSignForGroupApply'),
  },
  F3egclPostProcessAppli_restoreAppliData: {
    oneWay: false,
    fn: notImpl('F3egclPostProcessAppli_restoreAppliData'),
  },
  OfficialDocumentDownload_FileDownloadAll: {
    oneWay: false,
    fn: notImpl('OfficialDocumentDownload_FileDownloadAll'),
  },
  SetMinistRefInfo: { oneWay: false, fn: cmdSetMinistRefInfo },
  SetPresentationOrgInfo: { oneWay: false, fn: cmdSetPresentationOrgInfo },
  F3egclXMLDataAppli_deleteFormPartSignGroup: {
    oneWay: false,
    fn: notImpl('F3egclXMLDataAppli_deleteFormPartSignGroup'),
  },
  F3egclFileManageAppli_initAttachList: {
    oneWay: false,
    fn: cmdInitAttachList,
  },
  F3egclReflectSuspendProcInfoClass_reflectSuspendProcInfo: {
    oneWay: false,
    fn: notImpl('F3egclReflectSuspendProcInfoClass_reflectSuspendProcInfo'),
  },
  F3egclInitAppli_restartLogin: { oneWay: false, fn: cmdRestartLogin },
  F3egclFileManageAppli_openElectronicPayment: {
    oneWay: true,
    fn: notImpl('F3egclFileManageAppli_openElectronicPayment'),
  },
  CloseWindow: { oneWay: true, fn: closeWindow },
};
