FROM node:latest

WORKDIR /app

COPY . .

RUN npm install && npm run build

ENV PORT=3000
ENV DATABASE_PATH=/app/tallybook.db

EXPOSE 3000

CMD npm start
