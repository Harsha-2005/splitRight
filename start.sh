#!/bin/bash
set -e
cd backend
npm install
npx prisma db push --accept-data-loss
node src/index.js
