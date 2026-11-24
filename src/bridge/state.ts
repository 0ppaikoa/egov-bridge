// ページ内で完結させる共有状態。ネイティブ側の静的フィールド相当。

export interface DigitalAuthState {
  polling: boolean;
  cancelRequested: boolean;
  signTransactionId: string | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export type ApplyInfo = Record<string, unknown>;

export interface BridgeState {
  eraParallelPeriodFlag: boolean;
  signMaxFlag: boolean;
  applyInfo: ApplyInfo[] | null;
  identifier: string | null;
  exeTagMappingFlag: boolean;
  singlePartSignFlag: boolean;
  dicAttachedDocFileNameStatus: Map<string, Map<string, boolean>>;
  digitalAuth: DigitalAuthState;
}

export const state: BridgeState = {
  eraParallelPeriodFlag: false,
  signMaxFlag: false,
  applyInfo: null,
  identifier: null,
  exeTagMappingFlag: true,
  singlePartSignFlag: true,
  dicAttachedDocFileNameStatus: new Map(),
  digitalAuth: {
    polling: false,
    cancelRequested: false,
    signTransactionId: null,
    timer: null,
  },
};
