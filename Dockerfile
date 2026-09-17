FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=4000
EXPOSE 4000

USER node
CMD ["node", "src/server.js"]
