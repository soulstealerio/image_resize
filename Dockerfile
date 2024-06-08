# Dockerfile for Next.js 13
 
# Set the base image
FROM node:18-alpine
 
# Set the working directory
WORKDIR /app
 
# Install yarn
# RUN apk add yarn
RUN apk add npm
 
# Copy the package.json and yarn.lock files
COPY package.json package-lock.json ./
 
# Install dependencies
RUN npm install
 
# Copy the application code
COPY . .
 
# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
 
# Build the application
RUN npm run build
 
# Expose the port
EXPOSE 3000
 
# Start the application
CMD ["npm", "run", "start"]
 
# Add labels
# LABEL maintainer="Your Name"
# LABEL version="1.0"