# タグマッピングエンジン仕様書

対象: e-Gov電子申請アプリケーション（`eGovClient.dll` / .NET MAUI, macOS 2.1.0.0 デコンパイル版）
出典: `/tmp/aok/egov-recon/decomp/eGovClient.dll.decompiled.cs`（以下、行番号はこのファイルの行番号）
目的: 申請データXML と 構成情報XML の相互反映（転記）を JavaScript で再実装するための完全仕様

---

## 0. 前提と読み方

- 本エンジンは **XPath ライブラリを使っていない**。`System.Xml` の `SelectSingleNode` 等は他のクラス（例: `ConfInfoFile.setFeeInfo` 68192）では使われているが、タグマッピング経路は `OperateDocument` の自前リゾルバだけを使う。これは JS 移植上きわめて重要（→ §6）。
- 本エンジンの「XML」は 3 種類ある。混同しやすいので最初に整理する。

| 呼称                   | 実体                                                                    | ファイル名の例                                | 本エンジンが触るか                        |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------- |
| 構成情報XML            | 申請全体の管理情報（手続ID・申請書属性・添付・手数料・提出先）          | `kousei.xml` (`confInfoName`)                 | ○ 読むだけ（`transcribeConfInfo` の入力） |
| 申請データXML          | 各様式の記入値。`DataRoot` 直下に様式の要素が並ぶ                       | `xxx_1.xml` 等 (`appliFileName`)              | ○ 読み書き（両メソッドの出力先）          |
| 様式XML（様式定義）    | 画面の入力項目定義（`ItemXMLMapping` / `DataStructure` / `RepeatItem`） | アプリが保持する mapping/structure/repeat XML | ✗ **触らない**（§5 で詳述）               |
| タグマッピングファイル | 転記規則                                                                | `tagMappingFileName`（例 `tagMapping.xml`）   | ○ 読むだけ                                |

- デコンパイル成果物特有の欠落がある。代表例: `Group.extracts`（74349）が空、`TagMappingFile` の `XPATH_*` 定数の一部が未使用。**定数名と定数値は信頼できるが、メソッド本体が空の箇所は「実装されていない」ではなく「デコンパイラが落とした」と解釈すべき**。本書ではその旨を個別に注記する。
- 例外クラスは `FormApplicationException`（致命的）/ `FormApplicationWarningException`（規則単位で握りつぶされる）/ `FormIllegalDocumentException`（文書構造不正）の 3 種。**どれがどこで握られるかが挙動を決める**ので §3 で明示する。

---

## 1. クラス関係図とメンバー一覧

### 1.1 関係図（テキスト）

```
                       ┌──────────────────────────────┐
                       │ FileManageAppli  (70382)     │  public sealed, : AbstractAppli  (66069)
                       │  + transcribeConfInfo  (70415)│
                       │  + transcribeAppliData (71796)│
                       │  - getPostingString    (70643)│
                       │  - getTagMappingAppliTags (70597)│
                       │  - getTagMappingChildAppliTags (70607)│
                       │  - replaceTagValue(配列版) (70617)│
                       │  - replaceLastTagValue(配列版)(70630)│
                       │  - createAppliFileDic  (71965)│
                       │  - loopRuleListFromTo  (71991)│
                       │  - transcribeAppliFromTo (72019)│
                       │  - loopRuleListSync    (72076)│
                       │  - transcribeAppliSync (72104)│
                       │  - parseConfInfo/parseAppliFile/parseTagMappingFile (71153/71187/71221)│
                       │  - read (71358) / save (71421)│
                       └───────┬───────────────┬───────┘
                               │               │
              uses             │               │  uses
        ┌──────────────────────▼──┐     ┌──────▼─────────────────────┐
        │ TagMappingFile (83698)  │     │ AppliFile (66407)          │
        │  - ruleList       : 対応規則      │  - document : XmlDocument   │
        │  - ruleListFromTo : 対応規則1+1g  │  - tagMap   : Hashtable     │
        │  - ruleListSync   : 対応規則2+2g  │  + replaceTagValue(xpath,val)│
        │  + GetRuleList()        │     │  + replaceLastTagValue(tag,val)│
        │  + GetRuleListFromTo()  │     │  + getString()              │
        │  + GetRuleListSync()    │     └────────────────────────────┘
        └──────┬──────────────────┘
               │ creates
     ┌─────────┴──────────┬────────────────────┬─────────────────────┐
     │                    │                    │                     │
┌────▼─────────┐  ┌───────▼────────┐  ┌────────▼────────┐  ┌─────────▼────────┐
│ TagMappingRule│  │TagMappingRule  │  │TagMappingRule   │  │ (ConfInfoFile)   │
│   (83822)    │  │  FromTo(83954) │  │   Sync (84143)  │  │   (67311)        │
│ ruleElement  │  │ 転記元/転記先  │  │ 同期対象        │  │ getAppliFilenameList│
│ List:ArrayList│ │ getBaseFileTag │  │ getSyncList     │  │ getProcName ...  │
│ +GetRuleElement│ │ getBaseFileName│  │                 │  │ getString        │
│   List()     │  │ getBaseXPath   │  │                 │  └──────────────────┘
└──────┬───────┘  │ getBaseFile    │  └─────────────────┘      △ 直接は未使用
       │ creates  │   ReplaceStr   │                            │（§5 参照）
   ┌───┴──────────────┬──────────────┐│  getTranscribeList        │
   │                  │              ││  getTranscribeData        │
┌──▼──────────┐ ┌─────▼──────────┐ ┌─▼──────────────┐
│TagMapping   │ │TagMapping      │ │TagMapping      │
│ AppliTag    │ │ ChildAppliTag  │ │ ConfInfoTag    │
│ (83574)     │ │ (83625)        │ │ (83666)        │
│ type=1      │ │ type=2         │ │ type=3         │
│ xPath,copy  │ │ value(タグ名), │ │ xPath          │
│ String      │ │ copyString     │ │                │
└──┬──────────┘ └─────┬──────────┘ └─┬──────────────┘
   │                  │              │
   └──────────┬───────┴──────────────┘        ┌──────────────────────┐
              ▼                               │ TagMappingSeparate   │
     ┌─────────────────────┐                  │  (84211) type=4      │
     │ XMLElement (86441)  │◄─────────────────┤  仕切り（固定文字列）│
     │ abstract            │                  └──────────────────────┘
     │ - node : XmlNode    │
     │ - name, value       │
     │ + getType() abstract│
     │ + getNode/getName/  │
     │   getValue/setValue │
     │ + checkCorrectXPath │
     └─────────────────────┘

   ┌──────────────────────────────────────────────────────────────┐
   │ OperateDocument (75639)  static — 全クラス共通のXMLユーティリティ │
   │  parse / getValueByNode / getNodesByXPath / getNodesByOrderXPath │
   │  getNodesByRelativeXPath / getNodesByRelativeOrderXPath          │
   │  getNodesByTagName / extracts / getXMLString / isLeafElement     │
   └──────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────┐
   │ AppliCommonUtility (91522) static — フォルダパス／保存          │
   │  CLIENT_WORK_FOLDER / getIdentifierFolderPath / getProcFolderPath│
   │  SaveXml / ...                                                │
   │ AppliCommon (66236) static — isFilename (66287), isFileExists   │
   └──────────────────────────────────────────────────────────────┘
```

### 1.2 メンバー一覧（定義行番号つき）

#### `XMLElement`（abstract, 86441–86538, CLASS_NO="46"）

| メンバ                                         | 行                      | 内容                                                                                                     |
| ---------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `node : XmlNode` (readonly)                    | 86445                   | 元ノード。`setValue` はここを書き換える                                                                  |
| `name : string`                                | 86447                   | `node.Name`（接頭辞込みの修飾名）                                                                        |
| `value : string`                               | 86449                   | 最初のテキスト子の値（`getValueByNode`）                                                                 |
| `.ctor(XmlNode)`                               | 86451                   | `NodeType != Element` なら例外 9999                                                                      |
| `extracts()`                                   | 86457                   | name/value の取得                                                                                        |
| `setName` / `getNode` / `getName` / `getValue` | 86474/86481/86486/86491 |                                                                                                          |
| `setValue(value)`                              | 86496                   | 最初の子の `Value` を差し替え。子が無ければテキストノードを追加                                          |
| `getType()`                                    | 86479                   | abstract                                                                                                 |
| `checkCorrectXPath(xpath)`                     | 86516                   | **"/" 区切りの各セグメントが `^([^\[\]]+\|[^\[\]]+\[[1-9][0-9]*\])$` に一致すること**を検証。違反は 3013 |

#### `TagMappingAppliTag : XMLElement`（83574–83624）

| メンバ                                                    | 行            |
| --------------------------------------------------------- | ------------- |
| `const TYPE_TAG_MAPPING_APPLI_TAGNAME = 1`                | 83578         |
| `copyString : string`（可変長、追記式）                   | 83580         |
| `xPath : string`（readonly、ctor で `checkCorrectXPath`） | 83582 / 83594 |
| `.ctor(XmlNode)`                                          | 83584         |
| `getType() => 1`                                          | 83598         |
| `getXPath()`                                              | 83603         |
| `addCopyString(s)` / `getCopyString()`                    | 83608 / 83620 |

#### `TagMappingChildAppliTag : XMLElement`（83625–83665）

| メンバ                                           | 行            |
| ------------------------------------------------ | ------------- |
| `const TYPE_TAG_MAPPING_CHILD_APPLI_TAGNAME = 2` | 83629         |
| `copyString`                                     | 83631         |
| `.ctor`                                          | 83633         |
| `getType() => 2`                                 | 83644         |
| `addCopyString` / `getCopyString`                | 83649 / 83661 |

`xPath` を持たない点が type 1 との決定的な違い。**value（=要素のテキスト）がそのまま「タグ名」として使われる**。

#### `TagMappingConfInfoTag : XMLElement`（83666–83697）

| メンバ                                           | 行            |
| ------------------------------------------------ | ------------- |
| `const TYPE_TAG_MAPPING_CONFINFO_TAGNAME = 3`    | 83670         |
| `xPath`（readonly、ctor で `checkCorrectXPath`） | 83672 / 83684 |
| `getType() => 3` / `getXPath()`                  | 83688 / 83693 |

#### `TagMappingSeparate : XMLElement`（84211–84224）

| メンバ                                | 行    |
| ------------------------------------- | ----- |
| `const TYPE_TAG_MAPPING_SEPARATE = 4` | 84213 |
| `getType() => 4`                      | 84220 |

値は `XMLElement.value` をそのまま使う（固定文字列）。`copyString` を持たない。

#### `TagMappingFile`（83698–83821）

| メンバ                                                   | 行                |
| -------------------------------------------------------- | ----------------- |
| `XPATH_DATAROOT = "/タグマッピング"`                     | 83700             |
| `XPATH_RULE = "/タグマッピング/対応規則"`                | 83702             |
| `XPATH_RULE_FROMTO = "/タグマッピング/対応規則1"`        | 83704             |
| `XPATH_RULE_SYNC = "/タグマッピング/対応規則2"`          | 83706             |
| `XPATH_GROUP_RULE_FROMTO = "/タグマッピング/対応規則1g"` | 83708             |
| `XPATH_GROUP_RULE_SYNC = "/タグマッピング/対応規則2g"`   | 83710             |
| `document : XmlDocument`                                 | 83712             |
| `ruleList / ruleListFromTo / ruleListSync : ArrayList`   | 83714/83716/83718 |
| `.ctor(XmlDocument)`                                     | 83720             |
| `extracts()`                                             | 83726             |
| `GetRuleList() : List<TagMappingRule>`                   | 83768             |
| `GetRuleListFromTo() : List<TagMappingRuleFromTo>`       | 83786             |
| `GetRuleListSync() : List<TagMappingRuleSync>`           | 83804             |

`extracts()` の要点（83726–83766）:

- `/タグマッピング` が無ければ `FormIllegalDocumentException`（88 行目）。
- `対応規則` は **代入**（`ruleList = nodes`）、`対応規則1g` / `対応規則2g` は **AddRange**（追記）。つまり
  `ruleListFromTo = [対応規則1 の全ノード…] ++ [対応規則1g の全ノード…]`、`ruleListSync` も同様。
  グループ規則（`1g`/`2g`）は**非グループ規則の後ろに連結されるだけ**で、扱いは完全に同一（§4）。

#### `TagMappingRule`（83822–83953, CLASS_NO="37"）

| メンバ                                                                                                                           | 行                      |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `TAG_APPLI="申請書タグ名"` / `TAG_CHILD_APPLI="子申請書タグ名"` / `TAG_CONFINFO="構成管理情報タグ名"` / `TAG_SEPARATOR="仕切り"` | 83826/83828/83830/83832 |
| `ruleElementList : ArrayList`                                                                                                    | 83834                   |
| `.ctor(XmlNode)` / `extracts`                                                                                                    | 83836 / 83841           |
| `GetRuleElementList() : List<XMLElement>`                                                                                        | 83901                   |
| `checkAppliTag(state)`（0 か 1 のみ許可）                                                                                        | 83914                   |
| `checkChildAppliTag(state)`（0 か 2 のみ許可）                                                                                   | 83924                   |
| `checkConfInfoTag(state)`（0 は不可）                                                                                            | 83934                   |
| `checkSeparate(state)`（3 か 4 のみ許可）                                                                                        | 83944                   |

`extracts` は **子要素を document order で走査し、状態機械で妥当性を検証しながら 4 型のいずれかに振り分ける**。状態 `num` の初期値 0、最終値が 3 でなければ 3013（83888）。

#### `TagMappingRuleFromTo`（83954–84142）

| メンバ                                                                                         | 行                |
| ---------------------------------------------------------------------------------------------- | ----------------- |
| `XPATH_RULE_BASE = "/転記元"` / `_BASE_FILE="/転記元ファイル名"` / `_BASE_PATH="/転記元xpath"` | 83962/83964/83966 |
| `XPATH_RULE_TRANSCRIBE = "/転記先"` / `_FILE="/転記先ファイル名"` / `_PATH="/転記先xpath"`     | 83968/83970/83972 |
| `TAG_RULE_BASE_PARTITION = "仕切り"`（※未使用）                                                | 83976             |
| `ruleBaseFile : XmlNode`（転記元ノード）                                                       | 83978             |
| `ruleTranscribeFileList : ArrayList`（転記先ノード群）                                         | 83980             |
| `.ctor` / `extracts`                                                                           | 83982 / 83987     |
| `getBaseFileTag()`                                                                             | 84005             |
| `getBaseFileName(baseNode)`                                                                    | 84010             |
| `getBaseXPath(baseNode)`（※呼ぶだけで戻り値未使用: 72035）                                     | 84033             |
| `getBaseFileReplaceStr(baseNode, document)`                                                    | 84047             |
| `getTranscribeList(omissionFlag)`                                                              | 84089             |
| `getTranscribeData(baseNode, omissionFlag)`                                                    | 84108             |

#### `TagMappingRuleSync`（84143–84210）

| メンバ                                                                                     | 行                |
| ------------------------------------------------------------------------------------------ | ----------------- |
| `XPATH_RULE_SYNC = "/同期対象"` / `_FILE="/同期対象ファイル名"` / `_PATH="/同期対象xpath"` | 84151/84153/84155 |
| `ruleSyncList : ArrayList`                                                                 | 84157             |
| `.ctor` / `extracts`                                                                       | 84159 / 84164     |
| `getSyncList() : Dictionary<string,string>`（ファイル名 → xpath、重複キーは例外）          | 84176             |

#### `AppliFile`（66407–66524）

| メンバ                                                   | 行    |
| -------------------------------------------------------- | ----- |
| `document : XmlDocument`                                 | 66409 |
| `tagMap : Hashtable`（遅延構築、名前→ノード配列）        | 66411 |
| `.ctor`                                                  | 66413 |
| `replaceTagValue(xpath, value)`                          | 66418 |
| `replaceLastTagValue(tagName, tagValue)`                 | 66450 |
| `extracts(map, node)` (static)                           | 66490 |
| `getString()` → `OperateDocument.getXMLString(document)` | 66512 |

#### `ConfInfoFile`（67311–68237 付近）

| メンバ                                                                                                                                                                                                          | 行                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 定数群（`TAG_PROC_ID="手続ID"`, `XPATH_COMPOSITION="DataRoot/構成情報"`, `XPATH_APPLI_FILENAME="DataRoot/構成情報/申請書属性情報/申請書ファイル名称"`, `XPATH_PRESENTATION="DataRoot/構成情報/提出先情報"` 等） | 67313–67391                   |
| `.ctor` / `extracts`                                                                                                                                                                                            | 67397 / 67403                 |
| `getAppliFilenameList()`                                                                                                                                                                                        | 67430                         |
| `getProcName()` / `getApplicantNodeList` / `getContactNodeList` / `getPresentationNodeList`                                                                                                                     | 67477 / 67499 / 67532 / 67565 |
| `importXMLSignature` / `copyApplicant` / `copyContact` / `copyPresentation`                                                                                                                                     | 67583–67688                   |
| `appendAppliAttribute` / `appendAttachedAttribute`                                                                                                                                                              | 67689 / 67719                 |
| `getAttachedTypeList` / `getAttachedFilenameList` / `getAttachedDocnameList` / `getAppliFormNameList` / `getInfoSubmitList` / `getAttachedAttributeList`                                                        | 67752–67995                   |
| `removeAttachedFilepath` / `removeAttachedAttribute(All)` / `removeAppliAttribute(All)`                                                                                                                         | 68086–68135                   |
| `getString()`                                                                                                                                                                                                   | 68174                         |
| `setAttachedAttribute` / `setFeeInfo` / `getInnerTextByTagName` / `getProcTypeNode`                                                                                                                             | 68187/68192/68203/68217       |

> **重要**: `transcribeConfInfo` / `transcribeAppliData` は `ConfInfoFile` を **一切使わない**。構成情報XML は `OperateDocument.getNodesByOrderXPath` で直接叩く（§5）。

---

## 2. タグマッピングファイル（`tagMappingFileName`）の XML 構造

### 2.1 ルートと規則の並び

ルート要素は `<タグマッピング>`。その直下に 5 種類の規則コンテナが並ぶ（83700–83710）。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<タグマッピング>
  <対応規則> … </対応規則>        <!-- confInfo → 申請データ（transcribeConfInfo 専用） -->
  <対応規則1> … </対応規則1>      <!-- 申請データ → 申請データ（FromTo、非グループ） -->
  <対応規則1g> … </対応規則1g>    <!-- 同上（グループ／繰り返し用） -->
  <対応規則2> … </対応規則2>      <!-- 申請データ → 申請データ（Sync、非グループ） -->
  <対応規則2g> … </対応規則2g>    <!-- 同上（グループ用） -->
</タグマッピング>
```

- 各コンテナの子が 1 規則。**規則の順序がそのまま適用順**（配列に積まれた順に処理）。
- 使われないコンテナは省略可（`getNodesByXPath` が null を返すと代入されないため、リストは空のまま）。
- `対応規則1` と `対応規則1g` は**同一リストに連結**される（83841–83860）。適用順は「1 → 1g」。
- 属性は一切読まれない。すべて**子要素のテキスト**で表現する。

> 注: 実サンプルファイルは本リポジトリにもデコンパイル元にも含まれていない。以下の例は
> 定数文字列と `extracts` の分岐から復元したもの。要素名は確定、値は例示。

### 2.2 `対応規則`（type 1〜4 の混在）

```xml
<対応規則>
  <申請書タグ名>申請書情報/申請者/氏名</申請書タグ名>
  <申請書タグ名>申請書情報/申請者/氏名カナ</申請書タグ名>
  <子申請書タグ名>明細名称</子申請書タグ名>
  <構成管理情報タグ名>DataRoot/構成情報/管理情報/申請者連絡先情報/申請者情報/氏名</構成管理情報タグ名>
  <仕切り> </仕切り>
  <構成管理情報タグ名>DataRoot/構成情報/管理情報/申請者連絡先情報/申請者情報/氏名カナ</構成管理情報タグ名>
</対応規則>
```

#### 型の意味（`XMLElement.getType()` の戻り値）

| 値  | 要素名               | クラス                    | テキストの解釈                                                         | 役割                                                       |
| --- | -------------------- | ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | `申請書タグ名`       | `TagMappingAppliTag`      | **申請データXML への XPath**（`[n]` 可、`checkCorrectXPath` 検証あり） | 転記**先**。組み立てた文字列を、一致する**全ノード**に書く |
| 2   | `子申請書タグ名`     | `TagMappingChildAppliTag` | **タグ名（要素名そのもの）**。パスではない。検証なし                   | 転記**先**。文書全体から同名の**葉要素**を探し、全てに書く |
| 3   | `構成管理情報タグ名` | `TagMappingConfInfoTag`   | **構成情報XML への XPath**（`[n]` 可、検証あり）                       | 転記**元**。一致する**先頭ノードのみ**のテキストを値に連結 |
| 4   | `仕切り`             | `TagMappingSeparate`      | **固定文字列**（区切り文字）                                           | 値を連結する際のセパレータ                                 |

依頼時の想定「1=申請側タグ、2=子タグ、3=参照元パス、4=固定値」は **概ね正しい**。ただし

- 3 は「任意の参照元」ではなく **構成情報XML に対する XPath** に限定され、**先頭一致ノードしか使わない**（70654）。
- 4 の正式名は `仕切り` で、単なる固定値ではなく **値の連結セパレータ**。単独使用は構文上不可（§2.2.1）。

#### 2.2.1 `対応規則` の文法（状態機械の実測）

`TagMappingRule.extracts`（83841–83899）の `num` 遷移と各 `check*` から、受理される並びは次で完全に決まる。

```
state 0 (開始)
  ├─ 申請書タグ名      → state 1
  ├─ 子申請書タグ名    → state 2
  └─ 構成管理情報タグ名 / 仕切り  → 例外(3013)   [checkConfInfoTag 83934 / checkSeparate 83944]

state 1
  ├─ 申請書タグ名      → state 1
  ├─ 構成管理情報タグ名→ state 3
  └─ 子申請書タグ名 / 仕切り → 例外            [checkChildAppliTag 83924 / checkSeparate]

state 2
  ├─ 子申請書タグ名    → state 2
  ├─ 構成管理情報タグ名→ state 3
  └─ 申請書タグ名 / 仕切り → 例外

state 3
  ├─ 構成管理情報タグ名→ state 3
  ├─ 仕切り            → state 4
  └─ 申請書タグ名 / 子申請書タグ名 → 例外

state 4
  ├─ 構成管理情報タグ名→ state 3
  ├─ 仕切り            → state 4
  └─ 申請書タグ名 / 子申請書タグ名 → 例外

終端条件: state == 3 （83888）。state 4 で終わる規則は不正。
```

正規表現で書くと:

```
対応規則 := 申請書タグ名* 子申請書タグ名* 構成管理情報タグ名 ( 仕切り? 構成管理情報タグ名 )*
```

含意:

- **値の組み立て要素（3,4）は必ず後半に固まる**。したがって「先に type 1/2 を集めてから値を適用する」遅延評価（70526–70543）は、妥当な文書では document order と一致し、観測可能な差を生まない。実装上都合のための 2 パス。
- `仕切り` は必ず `構成管理情報タグ名` に挟まれる。**末尾にセパレータは付かない**。
- 1 規則に type 3 が最低 1 個必須（終端 state 3 のため）。「固定文字列だけを書く規則」は書けない。
- type 1 も type 2 も 0 個でよい（= 読み捨て規則）。その場合 `postingstring` は作られるが誰にも使われない。

### 2.3 `対応規則1` / `対応規則1g`（FromTo: 転記元 → 転記先）

```xml
<対応規則1>
  <転記元>
    <転記元ファイル名>formA_1.xml</転記元ファイル名>   <!-- 省略可 -->
    <転記元xpath>申請書情報/申請者/氏名</転記元xpath>
    <仕切り>/</仕切り>
    <転記元xpath>申請書情報/申請者/氏名カナ</転記元xpath>
  </転記元>
  <転記先>
    <転記先xpath>申請書情報/申請者/氏名</転記先xpath>
    <!-- <転記先ファイル名> を書く場合と書かない場合がある（§3.5） -->
  </転記先>
  <転記先>
    <転記先xpath>申請書情報/連絡先/氏名</転記先xpath>
    <転記先ファイル名>formB_1.xml</転記先ファイル名>
  </転記先>
</対応規則1>
```

| 要素                      | 必須          | 個数                                       | 意味                                                             |
| ------------------------- | ------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `転記元`                  | ○             | ちょうど 1（2 個以上は例外: 83992）        | 転記元ブロック                                                   |
| `転記元/転記元ファイル名` | △             | 0 or 1                                     | 転記元が「どの申請データか」。省略時は「共通（全ファイル）」扱い |
| `転記元/転記元xpath`      | ○（1 個以上） | 複数                                       | 値を取り出す XPath。**複数書くと連結される**                     |
| `転記元/仕切り`           | △             | 複数                                       | `転記元xpath` の間に挟む固定文字列                               |
| `転記先`                  | ○             | 1 以上                                     | 転記先ブロック                                                   |
| `転記先/転記先xpath`      | ○             | ちょうど 1（0 個も 2 個以上も例外: 84126） | 書き込み先 XPath                                                 |
| `転記先/転記先ファイル名` | △             | 0 or 1                                     | 書き込み先ファイル。省略時は「同一ファイル（の写し）」           |

`転記元` の子は **document order に走査**され、`転記元xpath` なら評価結果の先頭ノードの `InnerText`、`仕切り` なら `InnerText` をそのまま連結する（84047–84087）。`転記元xpath` が 1 つも無ければ `FormIllegalDocumentException`（84079）。

### 2.4 `対応規則2` / `対応規則2g`（Sync: 同期）

```xml
<対応規則2>
  <同期対象>
    <同期対象ファイル名>formA_1.xml</同期対象ファイル名>
    <同期対象xpath>申請書情報/申請者/氏名</同期対象xpath>
  </同期対象>
  <同期対象>
    <同期対象ファイル名>formB_1.xml</同期対象ファイル名>
    <同期対象xpath>申請書情報/申請者/氏名</同期対象xpath>
  </同期対象>
</対応規則2>
```

- `同期対象` は 1 以上（84169）。各 `同期対象` に `同期対象ファイル名`（ちょうど 1）と `同期対象xpath`（ちょうど 1）が必須。
- ファイル名は辞書のキーなので**重複禁止**（84197 で例外）。
- 意味: 「一覧に並ぶ全ファイルの、それぞれの xpath に、**編集中ファイルの値**をコピーする」。すなわち 1 対 N の同期。

---

## 3. アルゴリズム（擬似コード＋行番号）

共通の下請けを先に定義する。

### 3.0 下請け（`OperateDocument`, 75639–）

```
# ---- パス解決（XPath ではない） -------------------------------------------
FUNC splitPath(path):                       # 75762 / 75796 相当
  return path.split("/").filter(s => s !== "")   # 先頭・末尾・連続 "/" は無視

FUNC getNodesByRelativeXPath(node, path):   # 75757
  list = [node]                             # ★自分自身から始まる（相対の基点を含む）
  for seg in splitPath(path):
     list = getNodesByTagName(list, seg)    # 各ノードの直子のみ、Name 完全一致
     if list is empty: return null
  return list

FUNC getNodesByRelativeOrderXPath(node, path):  # 75787  ← 本エンジンの主経路
  list = [node]
  for seg in splitPath(path):
     parts = seg.split(/[\[\]]/).filter(nonEmpty)   # "a[2]" → ["a","2"]
     if parts.length == 1:
        list = getNodesByTagName(list, seg)          # セグメント文字列そのままで照合
        if empty: return null
     elif parts.length == 2:
        n = parseInt(parts[1])
        next = []
        for p in list:
           kids = getNodesByTagName(p, parts[0])
           if kids != null and kids.length >= n: next.push(kids[n-1])   # 1 始まり
        if next empty: return null
        list = next
     else:
        # 3 分割以上（"a[1][2]" 等）はどちらの case にも当たらず、そのセグメントを無視して続行
        pass
  return list

FUNC getNodesByOrderXPath(doc, path):  return getNodesByRelativeOrderXPath(doc, path)  # 76021
FUNC getNodesByXPath(doc, path):       return getNodesByRelativeXPath(doc, path)       # 76008

FUNC getValueByNode(node):                # 75706
  if node has no children: return null
  c = node.firstChild
  if c.nodeType not in (Text, Whitespace, SignificantWhitespace): return null
  return c.value                          # ★最初のテキスト子だけ

FUNC isLeafElement(node):                 # 76034
  return node.nodeType == Element and node has no child of type Element

FUNC extracts(map, prefix, node):          # 75890
  if node.nodeType != Element: return
  key = prefix + "/" + node.name
  map[key].push(node)                      # 名前空間は考慮せず Name 完全一致でキー化
  for child in node.childNodes: extracts(map, key, child)

FUNC parse(text):                          # 75661
  if text contains "<?xml ": text = text.substring(index("?>")+2)
  remove any "<?xml-stylesheet ... ?>" occurrence
  text = text.trimStart("\r\n")
  doc = XmlDocument(); doc.PreserveWhitespace = true; doc.load(utf8(text))
  for el in doc.getElementsByTagName("*"):
     if el.InnerXml == "": el.IsEmpty = true     # <a></a> → <a/> 化の準備
  return doc

FUNC getXMLString(doc):                    # 75921
  if doc.firstChild.nodeType != XmlDeclaration:
     doc.InnerXml = '<?xml version="1.0" encoding="UTF-8"?>' + doc.InnerXml
  out = XmlWriter(indent=true, newLine="\n", omitXmlDeclaration=false).write(doc)
  return out.replaceAll(" />", "/>")
```

`parse` は**宣言と stylesheet を落としてから**読み、`PreserveWhitespace=true` で空白を保つ。`getXMLString` は 2 スペースインデント（`IndentChars` 未指定＝既定）で再整形し、`" />"` を `"/>"` に潰す。**この往復で元ファイルとバイト一致しない**点は §6 の未解決事項。

### 3.1 `getPostingString`（70643–70660）

```
FUNC getPostingString(confInfoDoc, el /* TagMappingConfInfoTag */):
  xp    = el.getXPath()
  nodes = getNodesByOrderXPath(confInfoDoc, xp)
  if nodes == null:
     throw Warning(3002, "xPath:" + xp)        # 70650-70652
  v = getValueByNode(nodes[0])                # ★先頭一致のみ
  return (v == null) ? "" : v                 # 70655-70659
```

- 一致 0 件は **例外**（呼び出し側で規則ごと握られる）。
- 複数一致しても先頭のみ。繰り返し要素の 2 行目以降は拾わない。
- 値が null（＝テキスト子が無い／子が要素）なら空文字。

### 3.2 `getTagMappingAppliTags` / `getTagMappingChildAppliTags`（70597 / 70607）

```
FUNC getTagMappingAppliTags(taglist, postingString):
  arr = taglist.toArray(TagMappingAppliTag)
  for a in arr: a.addCopyString(postingString)   # 全ての type1 に同じ値を配る
  return arr
```

`TagMappingChildAppliTags` も完全に同型（70609–70614）。`addCopyString` は**加算**（83608）なので、
同じ要素インスタンスが再利用されると値が積み増しされる。実際には `GetRuleElementList()` が
毎回新しいインスタンスを返す（83901–83906）ため 1 回しか呼ばれない。

### 3.3 `replaceTagValue`（FileManageAppli 版 70617 / AppliFile 版 66418）

```
# --- FileManageAppli.replaceTagValue: 全申請データ × 全タグの二重ループ (70617) ---
PROC replaceTagValue(appliFiles[], appliTags[]):
  for f in appliFiles:
     for t in appliTags:
        f.replaceTagValue(t.getXPath(), t.getCopyString())

# --- AppliFile.replaceTagValue (66418) ---
PROC AppliFile.replaceTagValue(xpath, value):
  nodes = getNodesByOrderXPath(this.document, xpath)
  if nodes == null: return                     # 一致 0 件は無言（例外にしない）
  for n in nodes:
     t = document.createTextNode(value)
     if n.firstChild == null: n.appendChild(t)
     else:                    n.replaceChild(t, n.firstChild)
```

要点:

- **一致した全ノード**を書き換える（1 つ目だけではない）。
- 空文字を渡すと空テキストノードが入る。
- **全申請データに同じ XPath を適用する**。XPath が存在しないファイルでは単に no-op。これが「1 つの規則で複数様式に同じ値を配る」仕組み。

### 3.4 `replaceLastTagValue`（FileManageAppli 版 70630 / AppliFile 版 66450）

```
PROC replaceLastTagValue(appliFiles[], childTags[]):
  for f in appliFiles:
     for t in childTags:
        f.replaceLastTagValue(t.getValue() /* = タグ名 */, t.getCopyString())

PROC AppliFile.replaceLastTagValue(tagName, tagValue):
  if this.tagMap == null:
     this.tagMap = {}
     extracts(this.tagMap, "", this.document)     # 文書全体を「名前 → ノード配列」に索引
  nodes = this.tagMap[tagName]
  if nodes == null: return
  for n in nodes:
     if isLeafElement(n):                         # ★葉要素のみ
        t = document.createTextNode(tagValue)
        if n.firstChild == null: n.appendChild(t) else: n.replaceChild(t, n.firstChild)
```

- パスではなく**要素名**で引く。文書全体（深さ無制限）が対象。
- 葉要素に限定するのは、同名の**親**要素のテキストを壊さないため。
- 「Last」の名は「最後（末端）の要素」の意。**最後の 1 個だけ**ではない（全葉に書く）。

### 3.5 `transcribeConfInfo`（70415–70595）

```
FUNC transcribeConfInfo(identifier, appliFilenames[], procId,
                         tagMappingName, confInfoName, kouseiProcId):

  # ---- 1. 引数検証 (70420-70470) ----
  if appliFilenames == null                                  -> FATAL 4001
  for f in appliFilenames: if !isFilename(f)                  -> FATAL 4006   # パス区切り不可
  if procId/tagMappingName/confInfoName/identifier が空       -> FATAL 4001/1007
  if !isFilename(tagMappingName) || !isFilename(confInfoName) -> FATAL 4006

  # ---- 2. フォルダ決定 (70471-70482) ----
  confProc = kouseiProcId            # if(procId==kouseiProcId) procId else kouseiProcId
                                     # → どちらの分岐でも kouseiProcId に落ちる
  initialize(identifier, [procId])   # workFolderPath = CLIENT_WORK_FOLDER

  # ---- 3. 入力読み込み (70483-70517) ----
  confInfoPath = work/<identifier>/<kouseiProcId>/<confInfoName>
  if path.length > FilePathMaxLength                         -> FATAL 4001
  confInfoDoc  = parseConfInfo(confInfoPath)                 # parse(read(file))
  tagMapDoc    = parseTagMappingFile(work/<identifier>/<procId>/<tagMappingName>)
  tagMapping   = new TagMappingFile(tagMapDoc)               # ここで構造検証。失敗は FATAL 3013

  appliDocs = []
  for f in appliFilenames:
     appliDocs.push(new AppliFile(parseAppliFile(work/<identifier>/<procId>/f)))

  # ---- 4. 規則ループ (70518-70571) ----
  ruleCount = 0
  for rule in tagMapping.GetRuleList():          # ★「対応規則」のみ（1/2/1g/2g は見ない）
    appliTags = []; childTags = []; posting = StringBuilder()

    try:
      for el in rule.GetRuleElementList():       # document order
        switch el.getType():
          case 1: appliTags.push(el)
          case 2: childTags.push(el)
          case 3: posting.append(getPostingString(confInfoDoc, el))
          case 4: posting.append(el.getValue())          # null なら append は no-op

      if appliTags.length > 0:
         tags = getTagMappingAppliTags(appliTags, posting.toString())
         replaceTagValue(appliDocs, tags)                # 全ファイル × 全 XPath
      if childTags.length > 0:
         tags = getTagMappingChildAppliTags(childTags, posting.toString())
         replaceLastTagValue(appliDocs, tags)            # 全ファイル × 全タグ名（葉のみ）

      ruleCount++
    catch FormApplicationWarningException e:             # 70556-70570
      log("ruleCount:" + ruleCount + "," + e.info...)    # ★握りつぶし（致命的にしない）

  # ---- 5. 保存 (70572-70578) ----
  if ruleCount > 0:
     for i in 0..appliDocs.length-1:
        saveFile(appliPath[i], appliDocs[i].getString())   # UTF-8, \r\n→\n, 上書き

  return OK(0)
```

**見落とせない挙動**

1. `ruleCount > 0` が保存の条件。**全規則が警告で落ちた場合は 1 バイトも書かれず、しかも戻り値は成功**（70579）。「何も起きないが成功」という状態が存在する。
2. `TagMappingFile` / `TagMappingRule` の構築時例外（3013, 構造不正）は `GetRuleList()` の評価時に出るので、**規則ループの try の外**……ではなく `tagMapping.GetRuleList().ForEach(...)`（70519）の第 1 評価項なので、外側 `catch (Exception)`（70587）に落ちて `procStatus=-1` になる。規則 1 個の構造不正が**全体を失敗させる**。
3. type 3 の XPath が 1 つでも外れると、その規則は**丸ごとスキップ**（type 1/2 への書き込みも行われない）。理由は値の組み立てが書き込みより先だから。
4. `saveFile` は `FileMode.Create` 上書き。バックアップは取らない。

### 3.6 `transcribeAppliData`（71796–71901）

```
FUNC transcribeAppliData(identifier, appliFilenames[], procId,
                          accessAppliFileName, tagMappingName):

  check = parameterCheckTranscribeAppliData(...)         # 71903-（identifier/procId/ファイル名検証）
  if check.cause != null: return check
  initialize(identifier, [procId])

  idFolder   = AppliCommonUtility.getIdentifierFolderPath(identifier)   # 91611
  procFolder = AppliCommonUtility.getProcFolderPath(identifier, procId) # 91616

  accessDoc   = parseAppliFile(procFolder/<accessAppliFileName>)
  tagMapping  = new TagMappingFile(parseTagMappingFile(procFolder/<tagMappingName>))

  files = {}      # fileName -> FileInfo
  appli = {}      # fileName -> (AppliFile, inProcFolder:bool)
  createAppliFileDic(accessAppliFileName, idFolder, procFolder, appliFilenames, files, appli)

  ruleCount = 0
  ruleCount = loopRuleListFromTo(ruleCount, tagMapping, accessAppliFileName, accessDoc, appli)  # 対応規則1+1g
  ruleCount = loopRuleListSync  (ruleCount, tagMapping, accessAppliFileName, accessDoc, appli)  # 対応規則2+2g

  if ruleCount > 0:
     for (name,(a,_)) in appli: saveFile(files[name], a.getString())
  return OK(0)
```

#### `createAppliFileDic`（71965–71989）

```
PROC createAppliFileDic(accessName, idFolder, procFolder, appliFilenames[], files, appli):
  for f in appliFilenames:
     if f == accessName: continue                        # 編集中ファイル自身は除外
     stem   = basenameWithoutExt(f).split("_")[0]
     cands  = enumerateFiles(idFolder,   stem + "*", recursive=true)
     inProc = enumerateFiles(procFolder, stem + "*", recursive=true).length > 0
     for c in cands:
        name = basename(c)
        if name not in files:
           files[name] = FileInfo(c)
           appli[name] = (new AppliFile(parseAppliFile(c)), inProc)
```

- 対象は「同じ様式の派生ファイル」。命名規約は `<stem>_<枝番>.xml`（例 `formA_1.xml`, `formA_2.xml`）。
- `stem` は**先頭 `_` まで**。`formA_1.xml` と `formA_2.xml` は同じ `formA` グループ。
- `inProc` は「procFolder にも同名パターンが存在するか」＝**このフォルダに実在する正規のコピーか**。§3.7 の分岐にしか使わない。

#### `transcribeAppliFromTo`（72019–72074）

```
PROC transcribeAppliFromTo(rule, accessName, accessDoc, appli):

  baseTag  = rule.getBaseFileTag()                       # <転記元>
  baseFile = rule.getBaseFileName(baseTag)               # <転記元ファイル名> か null

  if baseFile != null and baseFile != accessName:
     throw Warning(3013, "accessAppliFile:notMatch")     # 72027 → 規則スキップ
  omission = (baseFile == null)                          # 「共通」規則か

  src = rule.getBaseFileReplaceStr(baseTag, accessDoc)   # 72036
  #   for child of 転記元 (document order):
  #      if child.name == "転記元xpath":
  #           ns = getNodesByOrderXPath(accessDoc, child.InnerText)
  #           if ns == null: throw 3013                     # 84062-84066
  #           src += ns[0].InnerText                        # ★先頭一致のみ
  #      if child.name == "仕切り":
  #           src += child.InnerText
  #   転記元xpath が 1 個も無ければ IllegalDocument           # 84079

  for (dstXPath, dstFile) in rule.getTranscribeList(omission):     # 84089 / 84108
     # --- 84131 の整合性チェック ---
     #   omission==true  && dstFile != ""  -> IllegalDocument
     #   omission==false && dstFile == ""  -> IllegalDocument
     if dstFile == "":
        targets = [ a for (a,inProc) in appli.values() if inProc == true ]
     else:
        main    = basenameWithoutExt(dstFile).split("_")[0]
        targets = [ a for (name,(a,_)) in appli if name.startsWith(main) ]
     for t in targets:
        t.replaceTagValue(dstXPath, src)          # 一致全ノードに同じ値
```

#### `transcribeAppliSync`（72104–72147）

```
PROC transcribeAppliSync(rule, accessName, accessDoc, appli):

  sync = rule.getSyncList()                          # { 同期対象ファイル名: 同期対象xpath }
  if accessName not in sync: throw Warning("accessAppliFile:notMatch")
  nodes = getNodesByOrderXPath(accessDoc, sync[accessName])
  if nodes == null: throw Warning("syncXpath:notExist")
  v = nodes[0].InnerText                             # ★編集中ファイルの値を 1 回だけ読む

  for (fname, xp) in sync:
     main    = basenameWithoutExt(fname).split("_")[0]
     targets = [ a for (name,(a,_)) in appli
                   if name != accessName and name.startsWith(main) ]
     for t in targets:
        t.replaceTagValue(xp, v)                     # 全員に同じ値を配る
```

- `sync` の値 `xp` は**相手ファイル用の XPath**、キーは**相手ファイル名**。編集ファイル自身の値は
  `sync[accessName]` の XPath で読む。つまり 1 つの xPath 定義が「自分用」と「相手用」を兼ねる。
- 編集ファイル自身は明示的に除外（72131）。

### 3.7 `transcribeConfInfo` と `transcribeAppliData` の対比

|                      | transcribeConfInfo                                        | transcribeAppliData                                          |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| 入力（読む）         | 構成情報XML (`confInfoName`, kouseiProcId フォルダ)       | 編集中申請データXML (`accessAppliFileName`, procId フォルダ) |
| 適用する規則         | `対応規則`（type 1〜4）                                   | `対応規則1`+`1g`（FromTo）、`対応規則2`+`2g`（Sync）         |
| 出力（書く）         | **全申請データXML**（appliFilenames の全部）              | **他の申請データXML**（accessAppliFileName 以外）            |
| 値の作り方           | confInfo の XPath 値を 仕切り で連結                      | 編集中ファイルの XPath 値を 仕切り で連結                    |
| 書き込み先の決め方   | 全ファイル × XPath（type1）/ 全ファイル × タグ名（type2） | ファイル名前方一致（`stem_`）または inProc フラグ            |
| 構成情報への書き戻し | なし                                                      | **なし**                                                     |

---

## 4. 繰り返し要素（repeat）の扱い

### 4.1 結論：タグマッピングエンジンは repeat を構造として扱わない

- `transcribeConfInfo` / `transcribeAppliData` のどこにも、行番号の生成・行数の取得・行の複製は無い。
  呼ばれる下請けは `getNodesByOrderXPath` / `getValueByNode` / `replaceTagValue` / `replaceLastTagValue` のみ。
- repeat の痕跡は 2 つだけ:
  1. `対応規則1g` / `対応規則2g`（"g" = group）というコンテナが存在し、**非グループ規則の後ろに連結**される（83846–83860）。パーサは `TagMappingRuleFromTo` / `TagMappingRuleSync` と同一で、**"g" による分岐はコード上に存在しない**。
  2. パス解決が `[n]`（1 始まり）を解釈できる（75787–75844）。`getNodesByRelativeOrderXPath` は各セグメントを `a[n]` 形式に分解し、n 番目の子だけを残す。`a[1]` が 1 番目。

つまり repeat 行は「`明細[1]/名称`、`明細[2]/名称` …」という**明示的な添字付きパス**でしか指せない。
規則側にループ構文は無い。

### 4.2 ページ側 JS（`F3egclGrp*`）との関係

repeat の「行数」と「行の実体」は**ネイティブではなくページ（Web アプリ）が持つ**。
`F3egclXMLDataAppli_setXMLFormInfo`（13355–13495）が唯一の接点で、流れは次のとおり。

```
# ネイティブ側: XMLDataAppli = 画面項目定義(mapping/structure/repeat)を解釈するエンジン
setXMLFormInfo(xmlDoc, mappingXMLDoc, structureXMLDoc, repeatXMLDoc)     # 85302
  ├ itemMapping   = new ItemXMLMapping(mappingXMLDoc)        # 画面項目 ⇔ xpath
  ├ repeatItem    = new RepeatItem(repeatXMLDoc)             # group 定義（name / xpath / item）
  ├ formData      = new FormData(xmlDoc)
  └ dataStructure = new DataStructure(structureXMLDoc, itemMapping, formData, repeatItem)

for i in 0..itemCount-1:                                     # 13377
   name = itemMapping.getItemName(i)
   if !itemMapping.isRepeatItem(i):
      v = getItemValue(i)                                    # XML から値
      webBrowser.InvokeScript("F3egclSetValueForXml", name, v)      # 画面へ反映 (13406)
   else:
      need = getRepeatCount(i)                               # ★XML 上の行数 (13415/85819)
      have = toInt(InvokeScript("F3egclGrpLength", name))     # ★画面の現在行数 (13422)
      for j in have..need-1:
         InvokeScript("F3egclGrpAddRow", name)               # 行を追加 (13424)
      idxs = InvokeScript("F3egclGrpGetRepeatIdxList", name) # ★行ごとの DOM 索引配列 (13431)
      for l in 0..repeatItemCount-1:
         iname = getRepeatItemName(i, l)
         for m in 0..need-1:
            v = getRepeatItemValue(i, l, m)
            InvokeScript("F3egclSetValueForXml2", iname, v, idxs[m])   # 行 m に書く (13467)
```

- `F3egclGrpLength(name)` … 画面に現在レンダリングされている当該グループの行数（int）。
- `F3egclGrpAddRow(name)` … 行を 1 つ追加。
- `F3egclGrpGetRepeatIdxList(name)` … 各行を指す索引の配列。`F3egclSetValueForXml2` の第 3 引数にそのまま渡す。
- 行数の真実源は XML 側: `XMLDataAppli.getRepeatCount` → `dataStructure.getRepeatCount(group.xpath)` → `getNodesByOrderXPath("DataRoot/" + groupXpath).count`（68844–68861, 85819–85850）。**XML に実在する要素数が行数**。
- グループ定義は `repeatItem/group` で、`name` / `xpath` / `item` を持つ（77266–77291, `Group` 74319）。`RepeatItem.isRepeatItem(xpath)` は `[n]` を正規表現 `\[[0-9]\]` で落として比較する（77307–77311）。
- `createItemXPath` は `"{xpath}[{index+1}]"`、`createRepeatItemXPath` は `"{group}[{index+1}]/{item}"`（86190/86201）。**添字は 1 始まり**で、パス解決側の 1 始まりと一致する。

### 4.3 帰結（JS 実装への示唆）

1. タグマッピングの `[n]` はページ側で行ごとに**文字列置換**されている可能性が高い（`対応規則1g` の XPath を `idxs[m]` で書き換える）が、**その置換コードはネイティブ側に存在しない**。→ §6 未解決 #10。
2. ネイティブのタグマッピングだけで repeat を回したいなら、規則 XPath に `[n]` を埋め込むか、規則を行数分だけ複製するしかない。実際のマッピングファイルがどちらを採っているかは**サンプル未入手のため不明**。
3. 画面同期（`setXMLFormInfo`）と タグマッピング（`transcribe*`）は**別経路**。前者は repeat を扱い、後者は扱わない。混同しないこと。

---

## 5. 「向き」の検証（依頼時の理解は正しいか）

### 5.1 検証結果

| 依頼時の理解                                                                                     | 判定                         | 正しい内容                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transcribeConfInfo` = 構成情報(confInfo) を読んで、様式XML(appliFileName 群) の要素を書き換える | **向きは正しい／用語が誤り** | 読むのは構成情報XML で正しい。書く先は **様式XML ではなく申請データXML**（`申請書ファイル名称` の実体）。様式XML（様式定義）は本エンジンが一切触らない別物 |
| `transcribeAppliData` = その逆（申請データ → 構成情報）                                          | **誤り**                     | 申請データXML → **別の申請データXML**。構成情報XML は開きもしない。`対応規則1/2` による申請書間の転記・同期                                                |

### 5.2 根拠

1. **`transcribeConfInfo` の出力先**（70490–70517, 70572–70578）
   出力は `appliFilenames` に対応する `AppliFile` 配列のみ。保存もその配列だけ。
   `ConfInfoFile` は登場せず、`confInfoDoc` は読み取り専用で使われる（70537 → `getPostingString`）。
2. **`appliFileName` の正体**
   `ConfInfoFile.XPATH_APPLI_FILENAME = "DataRoot/構成情報/申請書属性情報/申請書ファイル名称"`（67369）。
   同じ `申請書属性情報` に `申請書様式名称`（= 様式名、67371）が別要素として並ぶ。つまり
   **`申請書ファイル名称` は「様式名」ではなく「その様式の記入値を格納したファイル名」**。
   アプリ内では `formInfo.formFileName`（`FormInfoBean`）として受け渡される（13052–13055）。
3. **様式XML はどこで使われるか**
   `F3egclXMLDataAppli_setXMLFormInfo` の `mappingXMLDoc` / `structureXMLDoc` / `repeatXMLDoc`
   （13355, 85302）がそれ。`ItemXMLMapping`（75380）/ `DataStructure`（68578）/ `RepeatItem`（77258）が解釈し、
   画面（ページ JS）へ値を流す。**タグマッピングファイルとは別系統の入力**であり、
   `transcribeConfInfo` はこれらを引数に取らない。
4. **`transcribeAppliData` が構成情報に触れないこと**
   71807–71811 で開くのは `procFolder` 配下の `accessAppliFileName` と `tagMappingName` だけ。
   以降の処理（71991–72147）はすべて `appli` 辞書（申請データ）に対する読み書き。
   戻り値の保存対象も `appli` 辞書（71859–71884）。**構成情報を書くコードパスが存在しない**。

### 5.3 正しい全体像

```
                  ┌───────────────────────────┐
   構成情報XML ──▶│ transcribeConfInfo        │──▶ 申請データXML（全様式）
   (kousei.xml)   │  対応規則 (type1..4)      │      XPath / タグ名で上書き
                  └───────────────────────────┘

                  ┌───────────────────────────┐
   編集中の       │ transcribeAppliData       │──▶ 他の申請データXML
   申請データXML ─▶│  対応規則1/1g (FromTo)    │      （同名 stem の派生・写し）
   (accessAppli)  │  対応規則2/2g (Sync)      │
                  └───────────────────────────┘
                        ✗ 構成情報XML へは書かない
```

構成情報XML を書くのは別経路:

- `SetPresentationOrgInfo`（15284–15292, `XDocument` で直接 `提出先識別子`/`提出先名称` を `SetValue`）
- `XMLDataAppli.checkAndEditConfInfo`（84902）
- `ReplaceConfManageContentClass.replaceConfManageContent`（77348）
- `ConfInfoFile.appendAppliAttribute` / `appendAttachedAttribute` / `setFeeInfo`（67689/67719/68192）

---

## 6. 未解決事項（JS 実装の判断に必要）

1. **実マッピングファイルのサンプルが無い**。§2 の構造は定数文字列と分岐からの復元。要素名は確定だが、
   実運用でどの型がどれだけ使われているか、`仕切り` に何が入るか（半角スペース / `/` / `、`）は未確認。
   → ライブ環境で `tagMappingFileName` の実体を 1 本入手するのが最優先。
2. **XPath の方言**。`checkCorrectXPath`（86529）は `^([^\[\]]+|[^\[\]]+\[[1-9][0-9]*\])$` を各セグメントに要求。
   許可されるのは「タグ名」または「タグ名[正整数]」のみ。`//`、`*`、`@attr`、`text()`、`[last()]`、
   `[position()>1]`、`|`、名前空間接頭辞付き XPath 関数は**すべて不可**（＝元実装は例外にする）。
   JS 側で「同じ制約で厳格に拒否する」か「汎用 XPath に拡張する」かを決める必要がある。
   **推奨: 元実装と同じ制約で実装**（実装コストが 1/10 になる。§末尾の表参照）。
3. **名前空間**。照合は `XmlNode.Name`（接頭辞込みの修飾名）の完全一致（75857）。`localName` ではない。
   e-Gov の申請データ/構成情報は既定名前空間なしが通常だが、`xmlns` が付くと `Name` は変わらない
   （既定名前空間は接頭辞を生まない）ため実害は小さい。ただし
   `getElementsByTagName` を使う `extracts`・`AppliFile.tagMap` も同じ前提。
   JS では `node.nodeName` を使うのか `localName` を使うのかを明示的に決めること。
4. **直列化のバイト一致**。`getXMLString`（75921）は
   - XML 宣言を必ず付ける（無ければ `<?xml version="1.0" encoding="UTF-8"?>` を注入）
   - `Indent=true`・`NewLineChars="\n"`・`IndentChars` 未指定（＝半角スペース 2 個）
   - `PreserveWhitespace=true` で読んだ空白はそのまま残る（＝既存の改行・字下げは保存される）
   - 空要素は `IsEmpty=true` 化により `<a/>` になり、最後に `" />"` → `"/>"`
     `@xmldom/xmldom` の `XMLSerializer` は**インデントしない・自己終了しない・空要素を `<a/>` にしない**。
     署名対象は `構成情報` のみ（`bridge-protocol.md` 参照）なので申請データの整形差は署名に影響しない見込みだが、
     サーバ側の様式チェックや `F3egclTagConfCheck_*` に影響する可能性は未検証。
     → 「元ファイルの空白を保存する（再整形しない）」方針を採るなら、`getXMLString` の再整形を**模倣しない**判断もあり得る。要決定。
5. **空値の表現**。`replaceTagValue(xpath, "")` は空テキストノードを挿入する（66432–66441）。
   .NET の `XmlWriter` がこれを `<a></a>` と書くか `<a/>` と書くか（`IsEmpty` は parse 時にしか立たない）
   は未検証。JS で `<a/>` と `<a></a>` のどちらに合わせるか決める必要がある。
6. **`getPostingString` が先頭一致のみ**という仕様が意図的か（70654）。repeat の 2 行目以降を
   拾わないことになる。バグの可能性もあるが、互換性のため**そのまま模倣する**のが安全。要判断。
7. **エラー時の挙動**。規則単位の警告は握りつぶされ（70556, 72000, 72085）、
   `ruleCount==0` なら**無言で何も保存しない**（70572）。JS で
   (a) 完全互換（無言成功）にするか、(b) 警告を収集して呼び出し元へ返すか。ブリッジとしては (b) が望ましいが、
   ページ側の期待（`procStatus==0` のみを見る）を壊さない形にする必要がある。
8. **ファイル名の一致規則**。`stem = basenameWithoutExt(f).split("_")[0]` + `startsWith(stem)`（71973, 72059, 72127）。
   - C# の `Directory.EnumerateFiles(..., pattern)` は Windows では**大小文字を区別しない**。JS の `startsWith` は区別する。
   - `startsWith` は前方一致なので `formA` が `formAB_1.xml` にも当たる（意図せぬ一致の可能性）。
     どちらに合わせるか決定が必要。
9. **`inProc` フラグの意味**。「procFolder にも同パターンのファイルが存在するか」を
   `転記先ファイル名` 省略時の対象選別に使う（72044–72052）。実データでこの分岐がどう機能しているか未確認。
   `転記先ファイル名` 省略＝「同じファイルの写し全部」と解釈したが、確証はない。
10. **`対応規則1g`/`2g` の "g" の実装**。パーサが同一なので、グループ性は
    「XPath に `[n]` が入っているか」でしか表現できない。ページ側が `[n]` を実索引に置換しているのか、
    規則ファイル側に `[n]` が直書きされているのかは**ネイティブコードからは判別不能**。
11. **`転記元xpath` の評価結果が複数ある場合**。先頭のみ採用（84068–84069）。repeat 由来の複数一致は切り捨て。
12. **`Group.extracts` が空**（74349–74351）。デコンパイル欠落と思われるが、`RepeatItem` の group 名/xpath
    がどこで設定されるかは本書の範囲外（repeat XML の実物が要る）。
13. **BOM と改行**。`read` は `StreamReader(UTF8)` で BOM を落とし、`ReadLine` 連結で `\n` に正規化（71358–71372）。
    `save` は `\r\n` → `\n` して UTF-8（BOM なし）で `FileMode.Create`（71421–71428）。
    JS の `TextDecoder('utf-8')` は既定で BOM を除去するが、`ignoreBOM:true` にすると残る。明示指定が必要。
14. **同じ (ファイル, XPath) を複数規則が書いた場合**。規則順に上書きされ、**最後の規則が勝つ**。
    規則の並び順（`対応規則1` → `対応規則1g`）が仕様の一部であることを明記して実装する必要がある。
15. **`ConfInfoFile.getAppliFilenameList` を使うか**。`transcribeConfInfo` は呼び出し元（`SetPresentationOrgInfo`
    15313–15320）が `formInfoList` から組み立てた名前リストを渡しており、`ConfInfoFile` 経由ではない。
    構成情報から自力で対象ファイル一覧を得る実装にするなら、`getAppliFilenameList`（67430）の
    整合性チェック（`申請書属性情報` の個数と `申請書ファイル名称` の個数が一致すること、67448）を移植する必要がある。

---

## 7. `SetPresentationOrgInfo` と `F3egclCallSetXMLDoc` / `F3egclSetValueForXml` の文脈

### 7.1 何のために transcribeConfInfo が呼ばれるか

`SetPresentationOrgInfo`（15243–15356）は「提出先（宛先機関）を設定する」コマンド。
`presentationOrgId` / `presentationOrgName` を構成情報XML に書き、**その結果を申請データXML へ波及させ、
最後に画面の編集バッファを読み直させる**。

```
SetPresentationOrgInfo(identifier, fabProcId, fabFileName, applyProcId, applyFileName, orgId, orgName)
 │
 ├─(1) F3egclXMLDataAppli_saveAppliData(identifier, applyProcId, applyFileName, stylesheet=false)   # 15277
 │      └ 画面の現在の入力値を 申請データXML に書き出す（画面 → ファイル）
 │
 ├─(2) XDocument.Load(fabFileName)                                     # 15284
 │      DataRoot/構成情報/提出先情報/提出先識別子 = orgId               # 15285-15287
 │      DataRoot/構成情報/提出先情報/提出先名称   = orgName             # 15288-15290
 │      AppliCommonUtility.SaveXml(...)                                # 15292（タブインデント, UTF-8 BOM なし）
 │
 ├─(3) if (exeTagMappingFlag)                                         # 15294
 │      for applyInfoBean in applyInfoBeanList:                       # 15299
 │         actionType=="1" or =="4" → kouseiProcId / confInfoName を控える  # 15301-15310
 │         actionType!="3" →
 │            appliFilenames = formInfoList の formFileName 全部       # 15313-15320
 │            fileManageAppli.transcribeConfInfo(                       # 15322
 │                identifier, appliFilenames, procId,
 │                tagMappingFileName, confInfoName, kouseiProcId)
 │            ★ここで「構成情報 → 全申請データ」の転記が走る
 │            read(work/<identifier>/<applyFormProcId>/<applyFormFileName>)  # 15329
 │            webBrowser.clientApi.callF3egclCallSetXMLDoc(xmldoc)      # 15337
 │            ★書き換わった申請データXML をページの編集バッファへ再ロード
 └─ return
```

要点:

- (2) で構成情報を直接いじり、(3) で `transcribeConfInfo` により**その変更を申請データへ伝播**させる。
  「提出先を変えたら、提出先を表示している様式の項目も更新される」という UI 要件の実装。
- `exeTagMappingFlag`（12545）は部分修正（`PART_AMEND`）時に false になる（12706, 17446）。
  つまり**部分修正フローでは転記をスキップ**する。
- `callF3egclCallSetXMLDoc(xmldoc)` は「ファイル → 画面」の反映。`transcribeConfInfo` が
  ファイルを書いただけでは画面は変わらないので、この呼び出しが必須。

### 7.2 `callF3egclCallSetXMLDoc` の 2 分岐（13073–13087）

```
callF3egclCallSetXMLDoc(xmldoc):
  # --- 旧世代ページ: F3egclSetXMLDoc が定義されている ---
  if eval("typeof F3egclSetXMLDoc !== 'undefined'"):
      mappingXMLDoc   = eval("F3egclMappingInfo")     # 画面項目 ⇔ xpath
      structureXMLDoc = eval("F3egclDataStructure")   # 画面レイアウト構造
      repeatXMLDoc    = eval("F3egclRepeatItem")      # repeat グループ定義
      return F3egclXMLDataAppli_setXMLFormInfo(xmldoc, mapping, structure, repeat)   # ネイティブが解釈

  # --- 新世代ページ: F3egclCallSetXMLDoc が定義されている ---
  if eval("typeof F3egclCallAsyncV2 !== 'undefined'"):
      return InvokeScriptV2("F3egclCallSetXMLDoc", xmldoc)   # ページ側で解釈
  return InvokeScript("F3egclCallSetXMLDoc", xmldoc)
```

- **旧世代**: ネイティブが mapping/structure/repeat を解釈し、項目ごとに `F3egclSetValueForXml(name, value)`
  を、repeat 項目なら `F3egclGrpLength` / `F3egclGrpAddRow` / `F3egclGrpGetRepeatIdxList` /
  `F3egclSetValueForXml2(name, value, idx)` を呼んで画面を更新する（§4.2）。
- **新世代**: 解釈ごとページ側に移管。ネイティブは XML 文字列を渡すだけ。
- どちらの経路も「**XML（ファイル）→ 画面**」の方向。逆向き（画面 → XML）は
  `F3egclXMLDataAppli_saveAppliData` → `callF3egclCallGetXMLDoc`（13089, 13500）が担う。

### 7.3 ブリッジ実装上の意味

`egov-bridge` はページ側のグローバル関数を供給する立場なので、

- `F3egclCallSetXMLDoc(xmldoc)` を実装するなら、**自前で mapping/repeat を解釈して DOM に反映**する必要がある（新世代経路）。
- `F3egclSetXMLDoc` / `F3egclMappingInfo` / `F3egclDataStructure` / `F3egclRepeatItem` を実装するなら、
  `F3egclXMLDataAppli_setXMLFormInfo` 相当（項目走査＋repeat 行追加＋`F3egclSetValueForXml[2]`）を
  ネイティブ側で肩代わりすることになる（旧世代経路）。
- 本仕様書が対象とするタグマッピングエンジンは、どちらの経路とも**独立**。ファイル同士の転記のみを行う。

---

## 8. 実装見積もり行数（JavaScript / TypeScript、テスト除く）

| #   | モジュール                                                                                                                                    | 移植元（行番号）                      | 概算行数 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------- |
| 1   | `xmlop.ts` — `parse` / `getXMLString` / `getValueByNode` / `getNodesBy*XPath` / `getNodesByTagName` / `extracts` / `isLeafElement`            | 75661–76050                           | 320      |
| 2   | `tag-mapping-model.ts` — `XMLElement` + 4 サブクラス + `checkCorrectXPath` + `TagMappingRule`（状態機械） + `TagMappingFile`                  | 83574–83953, 84211–84224, 86441–86538 | 210      |
| 3   | `tag-mapping-fromto.ts` — `TagMappingRuleFromTo` + `TagMappingRuleSync`（`getBaseFileReplaceStr` / `getTranscribeData` / `getSyncList` 含む） | 83954–84210                           | 160      |
| 4   | `appli-file.ts` / `conf-info-file.ts` — `replaceTagValue` / `replaceLastTagValue` / `getString`（+ 必要なら `getAppliFilenameList`）          | 66407–66524, 67430–67476              | 130      |
| 5   | `transcribe-conf-info.ts` — 引数検証・パス決定・規則ループ・`getPostingString`・保存                                                          | 70415–70660                           | 120      |
| 6   | `transcribe-appli-data.ts` — `createAppliFileDic` / `loopRuleList*` / `transcribeAppliFromTo` / `transcribeAppliSync`                         | 71796–72147                           | 190      |
| 7   | `errors.ts` — `FormApplicationException` / `Warning` / `IllegalDocument` / `ReturnValues` / エラーコード表                                    | 全体                                  | 60       |
| 8   | `index.ts` — 公開 API・型定義・ログ接続                                                                                                       | —                                     | 30       |
|     | **合計**                                                                                                                                      |                                       | **1220** |

前提: XPath は §6-2 の制約付き自前リゾルバ（汎用 XPath ライブラリを積まない）。I/O・ファイル列挙は
既存 `src/bridge/vfs.ts` / `procfiles.ts` を流用する前提で**行数に含めていない**。
テスト（単体 + 実ファイル突き合わせ）を入れるなら +300〜400 行を見込む。

---

## 9. 依存クラスの移植可否（JS にそのまま写せるか / DOM 再実装が要るか）

| 依存クラス・メソッド                                                                 | 行                  | 判定                                           | 理由・備考                                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `XMLElement.checkCorrectXPath`                                                       | 86516               | **そのまま写せる**                             | 正規表現 1 本のループ。`^([^\[\]]+\|[^\[\]]+\[[1-9][0-9]*\])$` をそのまま移植                                |
| `TagMappingRule` の状態機械（`checkAppliTag` 等 4 個 + 終端判定）                    | 83841–83952         | **そのまま写せる**                             | 整数の状態遷移のみ。§2.2.1 の表がそのまま `switch` になる                                                    |
| `TagMappingRule.extracts` の型振り分け（要素名 → クラス）                            | 83855–83886         | **そのまま写せる**                             | 文字列比較 4 本                                                                                              |
| `getType()` のディスパッチ（`switch`）                                               | 70528–70542         | **そのまま写せる**                             |                                                                                                              |
| `postingstring` の組み立て（`StringBuilder.Append`）                                 | 70523–70541         | **そのまま写せる**                             | JS の文字列連結で十分                                                                                        |
| `getTagMappingAppliTags` / `getTagMappingChildAppliTags`                             | 70597–70615         | **そのまま写せる**                             | 配列に同じ文字列を配るだけ                                                                                   |
| `FileManageAppli.replaceTagValue` / `replaceLastTagValue`（配列版）                  | 70617–70641         | **そのまま写せる**                             | 二重ループのみ                                                                                               |
| `getTranscribeData` の整合性検証（omissionFlag の排他）                              | 84131–84134         | **そのまま写せる**                             | 条件式そのまま                                                                                               |
| `TagMappingRuleSync.getSyncList` の重複キー検出                                      | 84176–84209         | **そのまま写せる**（`Map` で代替）             | `Dictionary` → `Map`                                                                                         |
| `createAppliFileDic` の stem 分割（`split("_")[0]`）                                 | 71973, 72059, 72127 | **そのまま写せる**                             | 大小文字の扱いだけ要決定（§6-8）                                                                             |
| `loopRuleListFromTo` / `loopRuleListSync` の try/catch 構造                          | 71991–72102         | **そのまま写せる**                             | 警告の握りつぶし方針だけ要決定（§6-7）                                                                       |
| `transcribeAppliFromTo` / `transcribeAppliSync` の対象選別（`Where`/`StartsWith`）   | 72019–72147         | **ほぼそのまま**（`Array.filter`）             |                                                                                                              |
| `OperateDocument.getNodesByRelativeOrderXPath`（`[n]` 解決）                         | 75787               | **DOM 再実装**                                 | xmldom に XPath 無し。子要素走査 + 添字で 30 行程度                                                          |
| `OperateDocument.getNodesByRelativeXPath` / `getNodesByTagName`                      | 75757 / 75846       | **DOM 再実装**                                 | `childNodes` を回して `nodeName` 完全一致                                                                    |
| `OperateDocument.getValueByNode`（最初のテキスト子のみ）                             | 75706               | **DOM 再実装**                                 | `firstChild.nodeType` 判定。`textContent` では**駄目**（挙動が違う）                                         |
| `OperateDocument.isLeafElement`                                                      | 76034               | **DOM 再実装**                                 | 子に要素が無いこと                                                                                           |
| `OperateDocument.extracts`（名前→ノード配列の索引）                                  | 75890               | **DOM 再実装**                                 | 再帰 + `Map<string, Element[]>`                                                                              |
| `OperateDocument.parse`（宣言除去・stylesheet 除去・PreserveWhitespace・IsEmpty 化） | 75661               | **DOM 再実装 + 前処理**                        | xmldom は宣言を保持する。文字列前処理で模倣。`IsEmpty` 相当は自前フラグ                                      |
| `OperateDocument.getXMLString`（インデント 2・`\n`・宣言注入・`" />"`→`"/>"`）       | 75921               | **DOM 再実装（要方針決定）**                   | xmldom の `XMLSerializer` は整形しない。§6-4                                                                 |
| `AppliFile.replaceTagValue`（`CreateTextNode` + `ReplaceChild`）                     | 66418               | **DOM 再実装**                                 | `ownerDocument.createTextNode` + `replaceChild`。xmldom でも可だが「最初の子だけ置換」を厳密に               |
| `AppliFile.replaceLastTagValue`（`tagMap` 遅延構築 + 葉限定）                        | 66450               | **DOM 再実装**                                 | 索引は `extracts` の移植                                                                                     |
| `AppliFile.getString` / `ConfInfoFile.getString`                                     | 66512 / 68174       | **DOM 再実装**（`getXMLString` に委譲）        |                                                                                                              |
| `ConfInfoFile` の各アクセサ                                                          | 67430–68217         | **原則不要**（`transcribeConfInfo` は未使用）  | 対象ファイル一覧を構成情報から得る場合のみ `getAppliFilenameList` を移植                                     |
| `AppliCommonUtility.getIdentifierFolderPath` / `getProcFolderPath`                   | 91611 / 91616       | **パス変換のみ**                               | `work/<identifier>[/<procId>]`。既存 `src/bridge/vfs.ts` の語彙に合わせる                                    |
| `AppliCommon.isFilename`                                                             | 66287               | **そのまま写せる**                             | 「パス区切りを含まない」判定                                                                                 |
| `FileManageAppli.read`（UTF-8 / BOM 除去 / `\n` 正規化）                             | 71358               | **I/O 差し替え**                               | `vfs` の読み出し + `TextDecoder`                                                                             |
| `FileManageAppli.save`（`\r\n`→`\n` / UTF-8 BOM なし / 上書き）                      | 71421               | **I/O 差し替え**                               | `vfs` の書き込み。BOM を付けないこと                                                                         |
| `FileInfoUtill.GetFileInfoInstance` / `FilePathMaxLength` チェック                   | 70484 / 71400 付近  | **省略可**（ログ用途）                         | 長さ上限は `egovClientCommonResources` 依存。無視してよいが、超過時は元実装が FATAL にすることは記録しておく |
| `FormeGovLogger.*`                                                                   | 全体                | **差し替え**                                   | 既存 `src/bridge/log.ts`                                                                                     |
| `SetPresentationOrgInfo` の (1)(2)(3) 手順                                           | 15276–15346         | **そのまま写せる**（呼び出し順の仕様として）   | `XDocument` → `doc` 操作、`SaveXml` → タブインデント保存に置換                                               |
| `F3egclXMLDataAppli_setXMLFormInfo`（旧世代経路）                                    | 13355–13495         | **DOM 再実装（別途）**                         | mapping/structure/repeat の解釈が要る。本仕様書の範囲外                                                      |
| `F3egclCallSetXMLDoc`（新世代経路）                                                  | 13073–13087         | **ページ側実装**                               | 実装するなら XML→画面反映を自前で。§7.3                                                                      |
| `F3egclGrp*` / `F3egclSetValueForXml[2]` / `F3egclGetValue`                          | 13405–13467, 14045  | **ページ側グローバル関数（DLL 内に実体なし）** | 供給する側に回る必要がある。挙動の正解は Web アプリ実装依存で未取得                                          |

### 9.1 まとめ（3 行）

- **写せるのは「規則の解釈ロジック」全部**（状態機械・型振り分け・連結・対象選別・検証）。ここはほぼ逐語移植で、バグも含めて互換にできる。
- **書き直しが要るのは「XML 操作の下請け」全部**（`OperateDocument` の 7 メソッドと `AppliFile` の 2 メソッド）。xmldom に XPath が無いため、制約付きパス解決器を自前で持つのが最も安い。
- **判断が要るのは直列化と I/O**（§6-4, 6-5, 6-13）。ここだけは実ファイルでの突き合わせが取れるまで確定できない。
