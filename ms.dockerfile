# Node >= 20.19 e obrigatorio: a stack do remark e ESM-only e o projeto e
# CommonJS, entao depende do require(esm) que so existe a partir dessa versao.
# Nao pinar uma 20.x anterior sem antes trocar a stack.
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --production --frozen-lockfile && yarn cache clean

# Este e o estagio de runtime: e aqui que a versao do Node importa de fato
# (require(esm) da stack do remark). Nao pinar abaixo de 20.19 -- ver
# comentario no topo do arquivo.
FROM node:20-alpine

WORKDIR /var/www

COPY --from=deps /app/node_modules ./node_modules
COPY dist ./
COPY package.json .

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

EXPOSE 3000

CMD ["./node_modules/pm2/bin/pm2-runtime", "main.js", "--name", "msSimulado"]
