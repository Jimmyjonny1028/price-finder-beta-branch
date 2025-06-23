# Dockerfile

# 1. Start with a Node.js 20 base image.
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

# 2. Set the working directory inside the container.
WORKDIR /app

# 3. Copy your package files first (this is a caching optimization).
COPY package*.json ./

# 4. Install your npm dependencies.
RUN npm install

# 5. Copy the rest of your application code into the container.
COPY . .

# 6. Set the command that will run when the container starts.
CMD ["node", "server.js"]
