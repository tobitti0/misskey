# 検証結果

2026-09-06、`mtn`、本流起点 `10769e23c56435d640f631597bb39c26c49bd119`。

最終検証はすべてDocker内（Linux arm64、Node 26.4.0、pnpm 11.22.0）で実施。新しい依存パッケージの追加やlockfile変更はない。

| 結果 | 項目 | 内容 |
| --- | --- | --- |
| PASS | backendビルド・API型再生成 | `pnpm build-misskey-js-with-types`。モデル設定と任意のmodel/usage/cachedフィールドを生成型へ反映。再生成による追加差分なし |
| PASS | backend型チェック | src / unit・e2e test / federation test の3設定 |
| PASS | frontend型チェック | `vue-tsc --noEmit`。管理画面、共通表示、通常／詳細ノートを含む |
| PASS | 単体テスト43件 | DeepL Free/Pro回帰、OpenAI設定・応答・拒否・異常・usage、7日TTL、投稿／翻訳先／モデルの分離、権限確認、Redis障害・無応答 |
| PASS | HTTP APIテスト10件 | 既存notes/translate 5件＋モデル保存／取得／一般ユーザー拒否／入力検証5件。対象外139件はフィルターで除外 |
| PASS | DB migration | 隔離PostgreSQL 18で全migration適用後、追加migrationのdown→up。`check-migrations` のpending DDLは0件 |
| PASS | frontend本番ビルド | `NODE_ENV=production pnpm --filter frontend build`。全locale生成完了 |
| PASS | 変更ファイルlint・SPDX・locale | `node scripts/check-shipping.mjs --base origin/develop` |
| PASS | API／Vueレビュー | リポジトリ指定レビュアーのチェックリストで確認。Redisの無応答による停止を修正済み |
| SKIPPED | 実OpenAI／DeepL API | 実キーは設定せず、テストの外部通信はモック。実Projectの権限・課金・翻訳品質は未確認 |
| SKIPPED | ブラウザでの画面操作／視覚確認 | 型チェックと本番ビルド、Storybook用4ケースの追加まで。実ブラウザ操作は未実施 |
| SKIPPED | 本番用Dockerイメージ全体のビルド／デプロイ | 検証用コンテナ内でbackend／frontendをビルド。本番コンテナの起動・公開は行っていない |

途中のビルド失敗は、クローン直後のワークスペース依存の未ビルドと `NODE_ENV=test` での本番localeビルドが原因。依存のビルド順を整え、本番ビルドを `NODE_ENV=production` で実行して解消した。DB差分検査も、migrationを持たないテスト専用chart entityを除く本番モードで実行した。無関係な本流ソースの修正は行っていない。

運用上の留意点: プロバイダーは環境変数、モデル名は管理画面で選択する。モデルはResponses APIとreasoning effort noneへの対応が必要。OpenAIの原文言語は `unknown` と表示する。キャッシュはRedisの永続化／退避設定に依存し、削除前の訳自体は期限まで残る。詳細はREADMEを参照。

この検証はコミット・push前の作業ツリーに対して実行した。ホストのリポジトリに今回展開したnode_modulesとビルド生成物はゴミ箱へ移動し、追跡対象の生成API型だけを残した。
