# TypeSafe YOLO for Pi

[English](README.md) | 日本語

[Pi Coding Agent](https://pi.dev/) の自動承認ルールを、自然言語で書ける拡張です。
[TypeSafe AI](https://typesafe.ai/) が実行予定の操作を分類し、許可・確認・拒否を振り分けます。

## インストール

Piからインストールできます。

```sh
pi install npm:pi-typesafe-yolo
```

TypeSafe AIのAPIキーを `~/.pi/agent/typesafe-yolo.key` に保存して、Piを起動してください。

```sh
(umask 077; pbpaste > ~/.pi/agent/typesafe-yolo.key)
```

エージェントが実行するコマンドに引き継がれないよう、キーは環境変数ではなくファイルから読みます。
キーがない場合は、すべての操作で確認します。
インストール時にPiを開いていた場合は `/reload` で拡張を読み込みます。

## Filter

初期状態では、通常の開発作業を許可し、公開・デプロイなどを確認します。
自分のルールを使うには `~/.pi/agent/typesafe-yolo.md` を作成してください。
このファイルで標準のFilterを置き換えます。

```text
通常の開発作業と依存関係のインストールは自動で許可する。
作業ディレクトリ外の変更、Git push、デプロイは確認する。
認証情報の外部送信は拒否する。
判断できない操作は確認する。
```

確認が必要な操作では、次のいずれかを選びます。

- **Accept**：今回の操作を一度だけ許可します。
- **Deny**：今回の操作を拒否し、エージェントに伝えます。
- **User feedback**：今回の操作を拒否し、入力した修正指示をエージェントに伝えます。出し直された操作は再判定します。

選択のキャンセル、修正指示の空欄・キャンセルでは、操作を許可しません。
分類に失敗した場合も確認し、確認できない非対話モードでは実行を止めます。
Filterやキーの変更は `/reload` で反映できます。
`PI_CODING_AGENT_DIR` を設定している場合は、そのディレクトリに `typesafe-yolo.md` と `typesafe-yolo.key` を置いてください。

Filter、ツール引数、作業ディレクトリ、OSはTypeSafe AIへ送信されます。引数内のコードや秘密情報も含まれます。
AIによる分類のため、誤判定することがあります。
