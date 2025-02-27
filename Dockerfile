FROM node:18-slim

WORKDIR /app

# Copia package.json e package-lock.json (se tiver)
COPY package.json ./
RUN npm install --unsafe-perm

# Instala Chromium e dependências
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst \
    libxss1 libxtst6 libx11-xcb1 libxcb-dri3-0 libxshmfence1 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Copia o resto do projeto
COPY . .

# Define o comando pra rodar o app
CMD ["node", "app.js"]
