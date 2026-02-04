# KingofKingsLike

ブラウザで動くターン制ストラテジーゲーム（キングオブキングス風）の雛形です。HTML Canvas 2Dで描画し、入力は「押した瞬間」を検出する設計にしています。

## 公開URL

https://<user>.github.io/KingofKingsLike/

## デプロイの仕組み

- main への push をトリガーに GitHub Actions が走ります
- `npm ci` → `npm run build` を実行
- 生成された dist を GitHub Pages にデプロイ

ワークフローは [.github/workflows/deploy.yml](.github/workflows/deploy.yml) にあります。

## 初回だけ必要な GitHub 設定

1. GitHub の Settings → Pages → Source を「GitHub Actions」に設定
2. main ブランチへ push すると自動で公開されます

## 開発

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
npm run preview
```

## 操作

- 矢印キー: カーソル移動
- Enter / Space: 決定
- Escape / Backspace: キャンセル
- E: ターン終了（後工程用のフック）

## プロジェクト構成

```
src/
	main.ts
	style.css
	game/
		Game.ts
		Input.ts
		constants.ts
		render.ts
		state.ts
```