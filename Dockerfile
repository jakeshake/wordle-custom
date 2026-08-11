FROM node:20-alpine

WORKDIR /app
COPY server.js ./
COPY public ./public

ENV PORT=80
ENV DATA_DIR=/data
EXPOSE 80
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost/api/health || exit 1

CMD ["node", "server.js"]
