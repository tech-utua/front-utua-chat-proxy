# Utua Chat Proxy

Cloudflare Worker que distribui o tráfego brasileiro entre as versões control e treatment do chat. A variante é persistida em cookie por 30 dias; tráfego fora do Brasil segue sempre para o control.

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

O Wrangler inicia o Worker localmente e informa a URL no terminal.

## Testes

```bash
npm test
```

## Validação

```bash
npm run check
```

## Deploy

```bash
npm run deploy
```
