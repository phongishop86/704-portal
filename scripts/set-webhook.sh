#!/usr/bin/env bash
# Đăng ký webhook Telegram. Dùng: scripts/set-webhook.sh <TELEGRAM_BOT_TOKEN> <URL_VERCEL> <TG_SECRET>
# Ví dụ: scripts/set-webhook.sh 123:ABC https://704-assets.vercel.app chuoi-bi-mat
set -euo pipefail
TOKEN="${1:?thiếu TELEGRAM_BOT_TOKEN}"; BASE="${2:?thiếu URL Vercel}"; SECRET="${3:?thiếu TG_SECRET}"
curl -sS "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  --data-urlencode "url=${BASE%/}/api/webhook/telegram" \
  --data-urlencode "secret_token=${SECRET}" \
  --data-urlencode 'allowed_updates=["message","callback_query"]'
echo
curl -sS "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
echo
