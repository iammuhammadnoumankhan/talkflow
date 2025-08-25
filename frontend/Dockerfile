# ---- Build Stage ----
FROM node:20-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --frozen-lockfile

# Copy project files and build
COPY . .
RUN npm run build

# ---- Serve Stage ----
FROM nginx:alpine

# Copy built files to nginx html folder
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config (optional)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
