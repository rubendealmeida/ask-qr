# QR Fácil

Uma versão simplificada do género do [qrcode-ai.com](https://app.qrcode-ai.com/):
QR codes dinâmicos (link curto editável) para **links** ou **PDFs**, com **logótipo no centro** e **4 estilos** de forma (Clássico, Arredondado, Pontos, Elegante), painel com todos os QR codes criados, contagem de leituras e edição do destino sem precisar de reimprimir o código.

## O que tens aqui

- `server.js` — servidor web (Node.js puro, sem frameworks)
- `db.js` — base de dados SQLite (usa o `node:sqlite` nativo do Node 22+)
- `qr/generate_qr.py` — motor de geração do QR code (Python + Pillow, usa a `libqrencode` do sistema)
- `qr/decode_check.py` — utilitário para confirmar que um PNG gerado é mesmo legível (usa `libzbar`)
- `views.js`, `public/` — páginas HTML/CSS/JS do painel e do formulário de criação
- `uploads/` — PDFs enviados pelos utilizadores
- `data/` — base de dados + imagens PNG dos QR codes gerados

**Zero dependências para instalar via `npm install` ou `pip install`** — tudo assenta em módulos nativos do Node e bibliotecas do sistema operativo (`libqrencode4`, `libzbar0`, Pillow). Foi construído assim de propósito, para correr em qualquer máquina Linux sem complicações.

## Como funciona (por dentro)

1. Escolhes "Link" ou "PDF", o estilo, cores e (opcional) um logótipo.
2. O servidor gera um **código curto único** (ex: `agUM7BS`) e grava o destino real na base de dados.
3. O QR code impresso/descarregado codifica sempre `SEU-DOMINIO/r/agUM7BS` — nunca o destino diretamente.
4. Quando alguém lê o QR code, `/r/agUM7BS` regista a leitura e redireciona para o destino atual.
5. Podes **editar o destino** (para links) a qualquer momento sem gerar um novo QR code, e ver quantas leituras teve.

Isto é o que separa um "QR estático" (aponta sempre para o mesmo sítio, sem estatísticas) de um "QR dinâmico" como o do qrcode-ai.com.

## Como correr localmente

Pré-requisitos (normalmente já vêm num Linux/Debian/Ubuntu recente; no macOS ver nota abaixo):

```bash
# Debian/Ubuntu
sudo apt-get install -y python3 python3-pil libqrencode4 libzbar0
```

Precisas de **Node.js 22.5 ou mais recente** (por causa do `node:sqlite` nativo).

```bash
cd qr-platform
BASE_URL=http://localhost:3000 PORT=3000 node server.js
```

Abre `http://localhost:3000`.

> No macOS: `brew install qrencode zbar` e `pip3 install pillow`, e ajusta os caminhos das bibliotecas no topo de `qr/generate_qr.py` e `qr/decode_check.py` (`.dylib` em vez de `.so`).

## Como pôr "sempre online"

Este ambiente onde o código foi construído é um sandbox temporário — não é um servidor permanente, por isso o próximo passo és tu a escolher onde isto vai ficar a correr 24/7. Não crio contas nem insiro credenciais em teu nome, mas aqui ficam os caminhos mais simples:

### Opção A — Um VPS barato (mais controlo, ~5€/mês)

1. Cria uma VM em qualquer fornecedor (Hetzner, DigitalOcean, etc.) — Ubuntu recente.
2. Copia esta pasta para lá (`scp` ou `git clone` se puseres num repositório).
3. Com Docker instalado no servidor:
   ```bash
   docker build -t qr-facil .
   docker run -d --restart unless-stopped \
     -p 80:3000 \
     -e BASE_URL=https://o-teu-dominio.com \
     -v $(pwd)/data:/app/data -v $(pwd)/uploads:/app/uploads \
     qr-facil
   ```
4. Aponta o DNS do teu domínio para o IP do servidor.

### Opção B — Railway / Render (mais simples, tens de criar conta tu mesmo)

Ambos correm o `Dockerfile` incluído sem configuração extra: liga o repositório Git, define a variável de ambiente `BASE_URL` com o domínio que te derem, e o deploy fica online sozinho, incluindo reinícios automáticos.

### ⚠️ Importante: `BASE_URL`

O `BASE_URL` fica **codificado dentro da imagem de cada QR code** assim que o crias (é o link curto `dominio.com/r/codigo`). Define a variável de ambiente para o domínio final **antes** de começares a criar QR codes a sério — se mudares de domínio depois, os QR codes já impressos deixam de funcionar.

## Limites atuais (por ser uma versão "leve")

- PDFs até 15 MB.
- Base de dados SQLite num único ficheiro — perfeita até algumas dezenas de milhares de QR codes; se um dia precisares de multiutilizador com logins separados, dá para trocar por Postgres sem grande esforço (a camada de acesso está toda isolada em `db.js`).
- Sem contas de utilizador/login — tal como pediste, é uma versão só com o essencial (link, PDF, estilos, logótipo, leituras).
