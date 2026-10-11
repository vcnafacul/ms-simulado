FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --production --frozen-lockfile && yarn cache clean

FROM node:20-alpine

WORKDIR /var/www

COPY --from=deps /app/node_modules ./node_modules
COPY dist ./
COPY package.json .

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

EXPOSE 3000

# Antes do app, as migrações que faltam neste ambiente e os seeds (src/migracoes). Se uma
# migração falhar, o app NÃO sobe — melhor o deploy falhar à vista do que o ms rodar contra um
# banco pela metade. O que já rodou fica na coleção `_migracoes` do próprio banco.
CMD ["sh", "-c", "node migracoes/rodar.js && exec ./node_modules/pm2/bin/pm2-runtime main.js --name msSimulado"]
