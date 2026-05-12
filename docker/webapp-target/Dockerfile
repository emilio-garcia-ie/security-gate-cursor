# Standalone webapp demo for Security Gate: builds the webinar frontend but uses nginx config
# without a live `backend` upstream (the clone's default.conf expects backend:3001 on the same network).
FROM node:22-alpine AS builder
WORKDIR /app
COPY demo/cursor-webinar-sec/frontend/package*.json ./
RUN npm ci
COPY demo/cursor-webinar-sec/frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY docker/webapp-target/nginx-standalone.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
