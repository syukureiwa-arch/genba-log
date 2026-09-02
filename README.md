# 現場記録

建設現場で働く職人が、その日の作業をスマホで記録するためのアプリ。

- 依存ライブラリなし・ビルド不要
- 記録は端末内（IndexedDB）だけに保存し、外へは一切送らない
- ホーム画面に追加すると、電波がなくても起動できる

## 使う

配信先のURLをスマホで開き、ブラウザのメニューから「ホーム画面に追加」。

## 手元で動かす

```
node dev-server.js
```

`http://localhost:8777/` を開く。Node以外に必要なものはない。
`file://` で直接開くと IndexedDB や Service Worker の挙動が本番と変わるので、
確認は必ず `http://` 経由で行うこと。

Service Worker のロジックだけはブラウザなしで確かめられる。

```
node sw.test.js
```

## 中身

| ファイル | 役割 |
|---|---|
| `index.html` | アプリ本体。これ1枚で完結している |
| `sw.js` | Service Worker。オフライン起動 |
| `manifest.json` | ホーム画面追加の設定 |
| `icon.svg` | アイコンの元データ。png はこれを書き出したもの |
| `dev-server.js` | 開発用の静的サーバ |
| `sw.test.js` | `sw.js` の動作確認 |

**アプリを更新したら `sw.js` の `VERSION` を上げること。**
上げないと古いキャッシュが残り続ける。

詳しい設計と経緯は [CLAUDE.md](CLAUDE.md) に書いてある。
