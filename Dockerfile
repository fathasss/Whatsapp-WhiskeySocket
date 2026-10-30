FROM node:22-alpine

RUN apk add --no-cache git

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p /usr/src/app/auth_info /usr/src/app/downloads

EXPOSE 3002

CMD ["node", "app.js"]

