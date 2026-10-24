#!/usr/bin/env bash
# Tạo .env.local từ .env.example và tự điền 4 chuỗi bí mật ngẫu nhiên (không ghi đè giá trị đã có).
#   scripts/gen-secrets.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || cp .env.example .env.local
rand() { if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32; else head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; fi; }
for K in SESSION_SECRET TG_SECRET ADMIN_KEY CRON_SECRET; do
  if grep -Eq "^${K}=.+" .env.local; then
    echo "  giữ nguyên ${K} (đã có)"
  else
    V="$(rand)"
    awk -v k="$K" -v v="$V" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; next} {print}' .env.local > .env.local.tmp && mv .env.local.tmp .env.local
    echo "  đã tạo ${K}"
  fi
done
echo
echo "Xong. Mở .env.local, điền tiếp: TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, FIREBASE_*."
echo "Khi triển khai Vercel: dán TOÀN BỘ các biến trong .env.local vào Settings → Environment Variables."
echo "TUYỆT ĐỐI không commit .env.local (đã nằm trong .gitignore)."
