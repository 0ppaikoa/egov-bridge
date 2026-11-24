// 申請フォーム一式のダウンロード（ネイティブ DownloadAppliFormClass.downloadAppliForm 相当）。
//
// ネイティブの流れ（eGovClient.dll.decompiled.cs ~69671 / unzip ~69747 / checkContentType ~69837）:
//   1) {CLIENT_WORK_FOLDER}/{identifier} を作成
//   2) POST {codeBase}/recept/application-form-entry/AppFormDocDist（ボディ長 0、
//      リクエスト Content-Type は application/x-www-form-urlencoded）
//   3) レスポンス Content-Type が "application/octet-stream" で始まることを検査
//   4) レスポンスを ZIP として展開し、各エントリを {identifier} フォルダ配下へ書き出す
//      - overwrite=false かつ copyOnly=false で既存フォルダ → 例外（ネイティブ errorNo 004）
//      - copyOnly=true は既存ファイルを上書きしない
//   5) 失敗時は自分が作ったフォルダを削除
//
// ネイティブは一度 tmp.zip に落としてから ZipArchive で開くが、ここではレスポンスの
// バイト列をそのままメモリ上で展開する（ディスクには一切書かない）。
// ページ遷移（RestTemplate 的挙動）や署名・署名検証は本モジュールの責務外。
import { postForm } from './http.ts';
import { vfs } from './vfs.ts';
import { unzipToMap } from './zip.ts';
import { log } from './log.ts';

/** 申請フォーム配布API（AbstractAppli.getVirtualPath() + このパスで POST する） */
export const APP_FORM_DOC_DIST_PATH = '/recept/application-form-entry/AppFormDocDist';

/** 期待するレスポンス Content-Type（ネイティブは前方一致で判定する） */
export const APP_FORM_CONTENT_TYPE = 'application/octet-stream';

export interface DownloadAppliFormOptions {
  /** 既存フォルダ・既存ファイルを上書きする。既定 false（ネイティブ既定） */
  overwrite?: boolean;
  /** 既存ファイルを残す（上書きしない）。既存フォルダでの例外を抑止する。既定 false */
  copyOnly?: boolean;
  /** POST 先（テスト・将来のバージョン差分用）。既定 APP_FORM_DOC_DIST_PATH */
  path?: string;
}

export interface DownloadAppliFormResult {
  /** 展開先フォルダ（VFS 絶対パス）。ネイティブ ReturnValues.others[0] に相当 */
  folder: string;
  /** ZIP に含まれていた全エントリ（相対パス、ディレクトリエントリは含まない） */
  entries: string[];
  /** 実際に VFS へ書き込んだパス */
  written: string[];
  /** copyOnly 等の理由で書き込みをスキップしたパス */
  skipped: string[];
}

function isOctetStream(headers: Headers): boolean {
  const contentType = headers.get('content-type') ?? '';
  log('Content-type:', contentType);
  return contentType.toLowerCase().startsWith(APP_FORM_CONTENT_TYPE);
}

/**
 * 申請フォーム一式（kousei.xml・申請書XML・tagMapping 定義など）を取得して VFS に展開する。
 * 展開先は /work/{identifier}/<ZIP 内の相対パス>。
 *
 * 失敗（identifier 不正 / 非 200 / Content-Type 不一致 / ZIP 破損 / 既存フォルダ保護）は
 * すべて Error を投げる。自分が作成したフォルダは失敗時に巻き戻す。
 */
export async function downloadAppliForm(
  identifier: string,
  options: DownloadAppliFormOptions = {},
): Promise<DownloadAppliFormResult> {
  const overwrite = options.overwrite ?? false;
  const copyOnly = options.copyOnly ?? false;
  const path = options.path ?? APP_FORM_DOC_DIST_PATH;

  if (!identifier) throw new Error('identifierName:null');

  const folder = vfs.normalize(`/work/${identifier}`);
  const prefix = folder + '/';

  // ネイティブは Directory.CreateDirectory の後に Directory.Exists を確認する。
  // VFS はディレクトリを暗黙に持つため、フォルダの存在は「配下に何かあるか」で判定する。
  const existed = vfs.exists(folder);

  if (existed && !overwrite && !copyOnly) {
    // ネイティブ errorNo 004（unzip のディレクトリエントリ検査）
    throw new Error(`folderPath:${folder} は既に存在します（overwrite=false, copyOnly=false）`);
  }

  const res = await postForm(path, {});
  if (res.status !== 200) {
    throw new Error(`AppFormDocDist が失敗しました: HTTP ${res.status}`);
  }
  if (!isOctetStream(res.headers)) {
    const contentType = res.headers.get('content-type') ?? '';
    // ネイティブ errorNo 028
    throw new Error(`Content-type:${contentType} （${APP_FORM_CONTENT_TYPE} を期待）`);
  }

  let entries: Map<string, Uint8Array>;
  try {
    entries = unzipToMap(res.bytes);
  } catch (err) {
    throw new Error(`申請フォームの ZIP を展開できません: ${(err as Error).message}`, {
      cause: err,
    });
  }

  // 展開前にパスを検証しておく（ZIP 由来の .. などでフォルダ外に出さない）
  const targets: { entry: string; path: string; data: Uint8Array }[] = [];
  for (const [entry, data] of entries) {
    if (!entry) continue;
    if (entry.endsWith('/')) continue; // ディレクトリエントリは VFS では不要
    const target = vfs.normalize(`${prefix}${entry}`);
    if (target === folder || !target.startsWith(prefix)) {
      throw new Error(`ZIP エントリが展開先の外を指しています: ${entry}`);
    }
    targets.push({ entry, path: target, data });
  }

  const written: string[] = [];
  const skipped: string[] = [];
  try {
    for (const t of targets) {
      // copyOnly は「既にあるものは触らない」。ネイティブの
      // if (!copyOnly || !fileInfo.Exists) entry.ExtractToFile(..., overwrite) と同じ判断。
      if (copyOnly && vfs.isFile(t.path)) {
        skipped.push(t.path);
        continue;
      }
      if (!overwrite && vfs.isFile(t.path)) {
        // overwrite=false は ExtractToFile(overwrite:false) 相当で IOException になる
        throw new Error(`filePath:${t.path} は既に存在します（overwrite=false）`);
      }
      vfs.writeFile(t.path, t.data);
      written.push(t.path);
    }
  } catch (err) {
    // ネイティブ finally: 失敗時は作成したフォルダを削除する。
    // 元からあったフォルダは壊さない（書き込み途中の内容だけ戻せないため、そのまま残す）。
    if (!existed) {
      try {
        vfs.remove(folder);
      } catch {
        // 何も書いていなければ remove は ENOENT になる。握りつぶす。
      }
    }
    throw err;
  }

  log(
    'downloadAppliForm:',
    folder,
    `${written.length} 件展開`,
    copyOnly ? `(skip ${skipped.length})` : '',
  );
  return { folder, entries: targets.map((t) => t.entry), written, skipped };
}

/**
 * kousei_riyousha.xml 等のコピー用の薄いヘルパ。
 * ネイティブは BASIC_INFO_SET で
 *   replaceConfManageContent(kousei_riyousha.xml, procFabFormFileName)
 * を行った後、配下の kousei_riyousha.xml を削除する。
 * 何をどこへコピーするかは呼び出し側が決める（ここでは規則を持たない）。
 *
 * @returns コピーしたら true、コピー元が無い／overwrite=false でコピー先が既存なら false
 */
export function copyFileIfExists(from: string, to: string, overwrite = true): boolean {
  const src = vfs.normalize(from);
  const dest = vfs.normalize(to);
  if (!vfs.isFile(src)) return false;
  if (src === dest) return false;
  if (!overwrite && vfs.isFile(dest)) return false;
  vfs.writeFile(dest, vfs.readFile(src));
  return true;
}
