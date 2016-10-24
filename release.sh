#!/bin/sh
npm run release
./node_modules/.bin/pm2 save
./node_modules/.bin/pm2 startup centos