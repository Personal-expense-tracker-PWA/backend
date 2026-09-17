FROM node:20-slim

WORKDIR /app

# better-sqlite3 needs build tools to compile its native binding
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=4000
ENV DB_PATH=/app/data/expenses.db
EXPOSE 4000

CMD ["node", "src/server.js"]
