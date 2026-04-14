FROM node:20-alpine AS build

WORKDIR /app
COPY package.json .
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Detecta o resolver DNS do container no startup (gateway Podman/Docker varia por subnet)
RUN printf '#!/bin/sh\nNS=$(grep -m1 nameserver /etc/resolv.conf | awk "{print \\$2}")\nsed -i "s|resolver [^;]*;|resolver $NS valid=10s ipv6=off;|" /etc/nginx/conf.d/default.conf\n' \
    > /docker-entrypoint.d/20-resolver.sh && chmod +x /docker-entrypoint.d/20-resolver.sh

EXPOSE 80
