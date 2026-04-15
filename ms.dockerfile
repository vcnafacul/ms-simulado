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

CMD ["./node_modules/pm2/bin/pm2-runtime", "main.js", "--name", "msSimulado"]
