# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build
# Uses the official Node LTS image to install dependencies and compile Angular.
# docker build -t schach .
# docker run -p 8080:80 schach
# App available at http://localhost:8080
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

# Sets working directory inside the container
WORKDIR /app

# Copies package manifests first so Docker can cache the npm install layer.
# Re-running npm install is only triggered when package*.json changes.
COPY package.json package-lock.json ./

# Installs all dependencies (including devDependencies needed for the Angular CLI build)
RUN npm ci --prefer-offline

# Copies the rest of the source code
COPY . .

# Compiles the Angular application in production mode.
# --output-hashing=all ensures filenames are cache-busted on every deploy.
# Run this manually if build fails due to /app/dist/Schach/browser not available
RUN npx ng build --configuration=production --output-hashing=all

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Serve
# Copies only the compiled static files into a minimal Nginx image.
# The final image contains no Node, no source code, and no dev dependencies.
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS serve

# Remove the default Nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copies compiled Angular output from the build stage.
# Angular CLI v17+ writes to dist/Schach/browser by default.
# Adjust the source path if your angular.json specifies a different outputPath.
COPY --from=build /app/dist/Schach/browser /usr/share/nginx/html

# Copies a custom Nginx config that handles Angular's client-side routing:
# Any path that doesn't match a real file falls back to index.html.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Nginx listens on port 80 by default
EXPOSE 80

# Runs Nginx in the foreground so Docker can manage the process
CMD ["nginx", "-g", "daemon off;"]