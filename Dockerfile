FROM node:18-slim

WORKDIR /app

# Copia package.json e package-lock.json (se tiver)
COPY package.json ./
RUN npm install --unsafe-perm

# Instala Microsoft Edge
RUN apt-get update && apt-get install -y microsoft-edge-stable \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Copia o resto do projeto
COPY . .

# Define o comando pra rodar o app
CMD ["node", "app.js"]
