# QR Fácil — imagem pronta a publicar (Railway, Render, Fly.io, VPS, etc.)
FROM node:22-bookworm-slim

# libqrencode4 e libzbar0 dao-nos a codificacao/leitura de QR sem precisar
# de nenhum pacote npm/pip; python3-pil desenha o PNG final com o estilo escolhido.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pil libqrencode4 libzbar0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

ENV PORT=3000
# IMPORTANTE: define BASE_URL para o teu dominio publico antes de criares
# QR codes em producao (fica gravado dentro da imagem do QR).
ENV BASE_URL=http://localhost:3000

VOLUME ["/app/data", "/app/uploads"]
EXPOSE 3000
CMD ["node", "server.js"]
