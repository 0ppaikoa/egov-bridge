// ページ内で完結させる共有状態。ネイティブ側の静的フィールド相当。
export const state = {
  // SetEraParallelPeriodFlag / SignMaxFlag などフラグ系
  eraParallelPeriodFlag: false,
  signMaxFlag: false,

  // F3egclInitAppli_* で設定される申請コンテキスト
  applyInfo: null,        // ApplyInfoBean 相当の配列 (appliListStr をパースしたもの)
  identifier: null,       // 現在の案件識別子
  exeTagMappingFlag: true,
  singlePartSignFlag: true,
  dicAttachedDocFileNameStatus: new Map(),

  // デジタル認証（スマホ署名）
  digitalAuth: {
    polling: false,
    cancelRequested: false,
    signTransactionId: null,
    timer: null,
  },
};
