FROM node:20-alpine

COPY dist /var/www

WORKDIR /var/www

COPY package.json .
COPY yarn.lock .

EXPOSE 3000

ENV NODE_ENV=$NODE_ENV

RUN yarn install --production && yarn cache clean

CMD ./node_modules/pm2/bin/pm2-runtime main.js --name msSimulado