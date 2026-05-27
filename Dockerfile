FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV MCP_TRANSPORT=http
ENV MCP_PORT=3000
EXPOSE 3000

ENTRYPOINT ["node", "src/index.js"]
