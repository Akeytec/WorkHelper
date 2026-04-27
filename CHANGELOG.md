# Changelog

このファイルはリリース単位で更新します。利用者向けの大きな変更・バックアップ推奨の有無を記載してください。

## [2.0.0] - 2026-04-27

### Added

- **Windows 用 Electron デスクトップアプリ**：インストーラー（NSIS）を [`electron-builder`](../package.json) で生成。`npm start` で開発、`npm run dist` で `dist/WorkHelper Setup x.x.x.exe` を出力。  
- **GitHub Actions** [`.github/workflows/release.yml`](../.github/workflows/release.yml)：タグ `v*` プッシュで Windows 向けにビルドし、Releases へ `electron-updater` 用の成果物を公開。  
- **自動更新**（`electron-updater`）：パッケージ化されたビルドで起動時に更新確認。メニュー「ヘルプ」→「更新を確認」から手動も可能。  
- **永続化の一本化**（メインプロセス）：`userData` 内 `app-state.v1.json` と、任意の**連携フォルダ**上の `workhelper-storage.json`（形式は 1.4 系の JSON と互換のキー集合）。

### データ互換（2.0 のスタート地点）

- **1.4 系（ブラウザ・ZIP 版）** から引き継ぐ場合は、**バックアップの JSON エクスポート**を新アプリの「インポート」で取り込む想定。  
- **2.0.0 以降**、永続形式の変更はマイグレーションと CHANGELOG 記述を原則とする（[`.cursor/rules/data-backward-compatibility.mdc`](.cursor/rules/data-backward-compatibility.mdc)）。

### Changed

- 正規の利用経路を **アプリのインストール**に変更。旧ポータブル用の **`起動.bat` / `起動-server.bat` / `serve-app.cjs` / `tools/workhelper-serve`（Go）** はリポジトリから削除済み。1.x からの移行は **JSON エクスポート→インポート**を利用。  
- 利用者向け **README**・**`更新のしかた.txt`**・アプリ内フッターをデスクトップ版に合わせて更新。  

## [1.4.0] - 2026-04-16

### Added

- **`WorkHelper-serve.exe`（同梱想定）**：Go 製の静的サーバ（`tools/workhelper-serve`）。`127.0.0.1:8765` で隣接の `app\` を配信し、Node なしで `http://` の Secure Context（フォルダに保存等）に必要な**ローカルオリジン**を満たせます。未同梱時は従来どおり `serve-app.cjs`（Node）→ `app\index.html` 直接起動へフォールバックします。

### Changed

- **`起動.bat` / `起動-server.bat`**：同一の優先順（**exe → Node → 直接**）に統一。`node tools\gen-launchers.cjs` で再生成可能。

### 利用者向け

- 初回実行で **Windows SmartScreen** 等に止められる可能性があるのは、未署名の exe では**よくある**挙動です。配布者が署名していない限り、利用者自身が**詳細**から解除する必要が出る場合があります（署名は別の運用課題）。

## [1.3.1] - 2026-04-16

### Changed

- **`起動.bat`**：Node 不要のため、常に `app/index.html` を既定ブラウザで開くだけに変更。
- **`起動-server.bat`（新規）**：従来の localhost（8765）起動。Node なしのときは `起動.bat` と同様に `index.html` を直接開く。

## [1.3.0] - 2026-04-16

### Fixed

- **`起動.bat`**：改行を **CRLF** にし、`chcp 65001` と日本語ウィンドウタイトルをやめて **ASCII のみ**に変更。LF のみ・UTF-8 由来の解釈ずれで `cmd` が行頭を誤読みする不具合を避けます。

### Changed

- 月次履歴からの**年間（12ヶ月）合計**の既定を **1月〜12月（暦年）** に変更。「開始月から12ヶ月」に切り替え可能（例: 4月始まりで翌年3月まで）。**一覧の編集モード**をオンにしたときだけ、年間の形・西暦年・開始月を変更できます。
- 以前の保存データ（年度の西暦のみ保存されていたもの）は、**4月始まりの12ヶ月**として引き続き解釈されます。

## [1.2.0] - 2026-04-16

### Added

- **フォルダへの自動保存**（File System Access API）。バックアップ画面で初回のみフォルダを選ぶと `workhelper-storage.json` にタスク・メモ・社員リスト・時間外関連のデータを書き込みます。
- **起動.bat** が Node 利用可能なときは **localhost（127.0.0.1:8765）** でアプリを開くように変更（フォルダ保存に必要な Secure Context 用）。`serve-app.cjs` を同梱。

### 利用者への注意

- フォルダ保存は **Chrome / Edge** 等の対応ブラウザで、**http(s) または localhost** から開いたときに利用できます。`file://` のみでは選べないことがあります。

## [1.1.0] - 2026-04-16

### Added

- 時間外・36協定一覧の **Excel（.xlsx）エクスポート**（表示列・判定色・メタ情報シート）。同梱ライブラリは ExcelJS（MIT）。

### 利用者への注意

- 配布 ZIP には `app/vendor/exceljs.min.js` を含めてください（ファイルが無いとエクスポートできません）。

## [1.0.0] - 2026-04-16

### Added

- 初版としての配布用 CHANGELOG 開始。
- 利用者向けドキュメント（`README.md` / `更新のしかた.txt`）。
- アプリバージョン表示およびバックアップ JSON への `appVersion` フィールド。

### 利用者への注意

- 初めて本バージョン以降を使う場合も、定期的な「バックアップ」画面からのエクスポートを推奨します。
