#!/usr/bin/env bash
set -euo pipefail

mode=${1:-dev}

serviceName=gnoman-backend.service
serviceWasRunning=0

isServiceActive() {
  systemctl is-active --quiet $serviceName
}

stopServiceIfRunning() {
  if isServiceActive; then
    serviceWasRunning=1
    sudo systemctl stop $serviceName
  fi
}

startServiceIfNeeded() {
  sudo systemctl enable --now $serviceName >/dev/null 2>&1 || true
  sudo systemctl start $serviceName >/dev/null 2>&1 || true
}

restartServiceIfItWasRunning() {
  if [ $serviceWasRunning -eq 1 ]; then
    sudo systemctl start $serviceName >/dev/null 2>&1 || true
  fi
}

case $mode in
  dev)
    echo launcher mode dev
    echo ensuring port 4399 is free for ts-node-dev

    stopServiceIfRunning

    trap restartServiceIfItWasRunning EXIT INT TERM

    npm run dev --host
    ;;

  prod)
    echo launcher mode prod
    echo ensuring systemd backend is running

    startServiceIfNeeded

    npm run build
    node scripts/launchElectron.js
    ;;

  *)
    echo usage: ./launcher.sh dev or ./launcher.sh prod
    exit 2
    ;;
esac
