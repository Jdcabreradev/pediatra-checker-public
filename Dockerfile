FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app

# Install dependencies needed for LanceDB (if any, usually none for linux-x64-gnu)
# Create data directory
RUN mkdir -p /app/data

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json .

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

# The app will auto-initialize the JSON and DB in /app/data on first run
CMD ["node", "./dist/server/entry.mjs"]
