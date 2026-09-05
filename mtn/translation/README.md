# mtn: OpenAI翻訳と7日間キャッシュ

本流 `misskey-dev/misskey` の `develop`、`10769e23c56435d640f631597bb39c26c49bd119`（2026.9.0-alpha.0）を起点とする追加機能。ローカルの `mtn` はこのコミットから作り直した。旧 `mtn`（`4588deb6fe`）の独自変更は引き継がない。

## 調査と実装方針

本流の `packages/backend/src/server/api/endpoints/notes/translate.ts` は、ロールの翻訳権限、投稿の存在、閲覧権限を確認し、CWと本文を `\n-----\n` で連結してDeepLへ送る。Free / Pro、言語タグの短縮、返却形式 `{ sourceLang, text }` はそのまま残す。

設定は `models/Meta.ts` の `deeplAuthKey` / `deeplIsPro`、更新は `admin/update-meta.ts`、管理画面は `packages/frontend/src/pages/admin/external-services.vue`。翻訳メニューの表示可否は公開メタ情報 `translatorAvailable` とユーザーの `canUseTranslator` に依存する。公開側は `MetaEntityService.ts`、管理者側は `admin/meta.ts` が値を返す。関連スキーマは `models/json-schema/meta.ts` と各APIの `meta` / `paramDef`、クライアント型は `packages/misskey-js/src/autogen/`。

本流の画面では `get-note-menu.ts` が翻訳結果をコンポーネント内の状態に保持するだけで、サーバーキャッシュはない。

| 方式 | 変更範囲 | 運用 | 判断 |
| --- | --- | --- | --- |
| 管理画面にプロバイダー選択とOpenAIキーを追加 | DB migration、設定API、管理画面、locale、生成型 | 画面から切り替え可能 | 将来の複数管理者運用向け |
| 環境変数でサーバー全体のプロバイダーを選択 | 既存バックエンド3ファイルと分離モジュール | 切り替え後に再起動 | 今回採用。更新追従性を優先 |

プロバイダー選択とAPIキーは環境変数で管理し、**モデル名は管理画面の「外部サービス → OpenAI翻訳」から設定**する。モデル名のDB列・migration・管理API、および翻訳結果への使用量フィールドを追加した。OpenAI設定・通信・応答検証・Redis保存は `packages/backend/src/misc/translation/`、画面の使用量表示は `MkTranslationInfo.vue` に集約する。新規npm依存は追加しない。

## 設定

| 環境変数 | 設定値 |
| --- | --- |
| `MISSKEY_TRANSLATION_PROVIDER` | `deepl`（未設定時の既定）または `openai` |
| `OPENAI_API_KEY` | OpenAIの **misskey-translate Projectで発行したキー** |
| `OPENAI_PROJECT_ID` | 必要なら同Projectの `proj_...` ID。表示名 `misskey-translate` ではない。Project専用キーなら通常は省略可 |

OpenAIのProjectをこのコードから作成・変更することはない。キー、Projectの所属、利用枠は実環境で設定・確認する。

OpenAIは `https://api.openai.com/v1/responses`、管理画面で選んだモデル（初期値 `gpt-5.4-mini`）、`reasoning.effort: none`、`store: false` を使う。モデルはこのAPIとreasoning設定に対応し、misskey-translate Projectで利用可能なものを指定する。モデル変更は保存後の新規翻訳に反映され、再起動は不要。30秒の通信タイムアウト、1MiBのレスポンス制限、8,192出力トークン上限を設ける。失敗・打ち切り・拒否・空応答は翻訳結果として返さず保存しない。失敗時の自動リトライやDeepLへの自動切り替えはしない。

通常の翻訳メニューを使い、利用者の表示言語を翻訳先にする。`ja-JP` なら自然な日本語。意味・トーン・固有名詞・URL・絵文字・改行・MFMを保持し、翻訳文だけを返すよう指示する。入力中の命令や質問は翻訳対象の文章として扱う。翻訳品質や厳密な書式保持はモデル出力に依存するため、実APIによる品質確認も行う。

APIの既存 `{ sourceLang, text }` に、任意の `model`、`usage: { inputTokens, outputTokens, totalTokens }`、`cached` を追加する。OpenAI応答の実際のモデル名とusageを表示し、usageが返らない場合は数値を捏造せず非表示にする。キャッシュヒット時は元の使用量を表示し、今回の追加消費ではないことを明記する。DeepLの使用量はOpenAI方式では取得できないため表示しない。

OpenAIのプレーンテキスト応答には原文言語のメタデータがないため、`sourceLang` は `unknown` とする。画面にも原文言語が `unknown` と表示される。言語検出用の追加API呼び出しは行わない。

`openai` 指定時はDeepLキーを消す必要はない。OpenAIキーがない場合やプロバイダーの設定値が不正な場合は翻訳を無効とし、DeepLへ暗黙に送信しない。DeepLへ戻すにはプロバイダーを `deepl` にして再起動する。

## Dockerでの導入

本流のDockerデプロイ手順に従い、この `mtn` のソースからイメージをビルドする。公開済みの本流イメージにはこの機能は含まれない。

```sh
docker build -t misskey-mtn:local .
```

**モデル名の列追加があるため、新イメージで通常の `pnpm migrate` 相当を実行してから起動する。** 本流Dockerイメージの標準起動コマンド `migrateandstart` は起動時にmigrationを実行する。DBバックアップなど通常の更新手順に従う。

既存ComposeのMisskeyサービス（通常 `web`）へ、ローカルイメージと環境変数ファイルを設定する例:

```yaml
services:
  web:
    image: misskey-mtn:local
    env_file:
      - .config/translation.env
```

`.config/translation.env` をエディタで作成し、権限を所有者だけに制限する（例: `chmod 600 .config/translation.env`）。内容は次の形式。値は説明用で、実キーではない。

```dotenv
MISSKEY_TRANSLATION_PROVIDER=openai
OPENAI_API_KEY=REPLACE_WITH_PROJECT_KEY
# OPENAI_PROJECT_ID=proj_REPLACE_IF_NEEDED
```

このファイルは既存の `.gitignore` と `.dockerignore` の対象。キーをソース・Dockerfile・ビルド引数へ書かず、実行時にだけ注入する。キーそのものをシェルのコマンドラインに貼り付けない。設定ファイルや展開済みのCompose設定をログへ出力しない。変更後は `docker compose up -d --force-recreate web` など、利用中の構成に合わせてコンテナを作り直す。

プロキシ設定は既存の `HttpRequestService` を利用する。直接接続が必要な運用では `.config/default.yml` の `proxyBypassHosts` に `api.openai.com` を追加する。

管理画面「外部サービス → OpenAI翻訳」でモデル名を保存する。例: `gpt-5.4-mini`、固定スナップショット `gpt-5.4-mini-2026-03-17`。表示されるモデル名は利用者にも公開されるため、秘密情報を設定しない。

画面を再読み込みし、ロールの「翻訳機能の利用」が許可されているユーザーで翻訳する。実験的なブラウザ翻訳機能が有効だとそちらが優先されるため、OpenAI側を確認するときは無効にする。

## 翻訳の保存

- DeepL / OpenAIとも、成功した翻訳を既存Redisへ **604,800秒（7日）** 保存する。読んでも期限は延長しない。
- 投稿ID、CWを含む本文、翻訳先、プロバイダー・モデルを含むハッシュで分離する。編集後は別のキーになり、新しく翻訳する。キーに本文やAPIキーは含めない。
- ユーザー間で再利用するが、キャッシュを読む前に毎回ロール・投稿の存在・閲覧権限・サービス設定を確認する。削除後・閲覧不可になった投稿は返さない。
- 編集前・削除前のキャッシュ自体はRedis内に期限まで残る。Redisには翻訳文が保存される。即時削除が必要な運用は削除イベントへの連携を別途追加する。
- Redisの再起動後も残るかは既存Redisの永続化設定による。メモリ上限による退避・削除でも再翻訳になる。恒久保存ではない。
- Redisがエラーを返した場合やキャッシュが壊れている場合は通常の翻訳を試みる。キャッシュの読み書きは各1秒までの待機とし、無応答でも翻訳を止めない。翻訳に成功しても保存できない場合は、その翻訳文を利用者へ返す。
- 同時に複数の初回リクエストが到着した場合は、複数のAPI呼び出しが発生し得る。プロバイダーのレート制限・予算設定は別途適用する。
- プロンプト・モデル・結果形式を変更したときは `cache.ts` の `note-translation:v2:` を更新する。

OpenAIへの `store: false` はOpenAI側でのResponses保存設定。Misskey側のRedis保存とは独立する。OpenAI Projectでのデータ共有設定もこの実装では変更しない。

## Docker内での検証

ホストにはDocker以外の開発ツールは不要。検証用イメージ内にソースをコピーし、Node・pnpm・依存パッケージ・設定・生成物を閉じ込める。APIキーを渡さず、外部翻訳APIはモックする。PostgreSQL / Redisの実サービスはこの対象unit testには不要。

```sh
docker build -f mtn/translation/Dockerfile.check -t misskey-mtn-translation-check .
docker run --rm misskey-mtn-translation-check
```

`check.sh` は依存ワークスペースのビルド、API型再生成と差分確認、backendの型チェック（src / test / federation test）、frontendの型チェック、翻訳に絞ったunit test、変更ファイルlint・SPDX・locale検査を実行する。ホストのリポジトリへ依存パッケージや生成物を戻さない。

DB migrationの適用・巻き戻し・再適用とHTTP APIの確認もDocker内で実行できる。検証用PostgreSQL / Redisはホストポートを公開しない。

```sh
docker compose -p misskey-mtn-check -f mtn/translation/compose.check.yml up --build --abort-on-container-exit --exit-code-from check
docker compose -p misskey-mtn-check -f mtn/translation/compose.check.yml down -v
```

本流追従時は `origin/develop` を更新して `mtn` に取り込み、翻訳API・メタ情報・管理画面・共通表示コンポーネントの接続箇所を確認してこの検証を再実行する。旧 `mtn` と履歴が異なるため、初回のリモート更新は旧コミットを明示した `--force-with-lease` で置き換える。以降は通常のpushで更新する。

## 公式仕様

- [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Responses APIの作成パラメーター](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)

Changelog候補: OpenAI翻訳、管理画面でのモデル設定、使用トークン表示、DeepLを含む7日間の翻訳キャッシュを追加。
