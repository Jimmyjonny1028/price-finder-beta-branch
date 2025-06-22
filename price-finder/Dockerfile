# Dockerfile (FIXED - Using the correct, updated version)

# Use the exact version required by the Playwright npm package.
FROM mcr.microsoft.com/playwright:v1.53.1-jammy

# The rest of the file is correct and remains the same.
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "server.js"]
