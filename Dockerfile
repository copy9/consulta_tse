FROM node:18-slim

WORKDIR /app

COPY package.json ./
RUN npm install --unsafe-perm

# Adiciona o repositório da Microsoft e instala o Microsoft Edge
RUN apt-get update && apt-get install -y curl gnupg && \
    curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > /usr/share/keyrings/microsoft-edge.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/microsoft-edge.gpg] https://packages.microsoft.com/repos/edge stable main" > /etc/apt/sources.list.d/microsoft-edge.list && \
    apt-get update && apt-get install -y microsoft-edge-stable --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

COPY . .

CMD ["node", "app.js"]
