#!/bin/sh
npm run release
pm2 save
pm2 startup centos