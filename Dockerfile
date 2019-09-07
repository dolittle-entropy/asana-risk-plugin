FROM node:12.10.0-alpine

WORKDIR /app

COPY package.json .
COPY yarn.lock .

RUN yarn install

COPY . .

EXPOSE 3000
ENTRYPOINT [ "node", "main.js" ]