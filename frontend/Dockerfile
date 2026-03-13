FROM node:20-alpine

WORKDIR /app

# Build arguments (para variáveis React)
ARG REACT_APP_BACKEND_URL=http://localhost:8000

# Definir como variável de ambiente para o build e runtime
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Copiar package.json
COPY package.json ./

# Tentar copiar yarn.lock se existir, senão continuar
COPY yarn.loc[k] ./

# Instalar dependências
RUN yarn install

# Copiar o resto do código
COPY . .

EXPOSE 3000

CMD ["yarn", "start"]
