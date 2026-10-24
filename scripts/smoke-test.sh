#!/usr/bin/env bash
# Kiểm tra nhanh một bản ĐÃ TRIỂN KHAI (hoặc demo cục bộ): các cửa bảo mật đóng đúng, đăng nhập và đọc dữ liệu chạy được.
#   scripts/smoke-test.sh <URL> [username password]
# Ví dụ: scripts/smoke-test.sh https://704-assets.vercel.app admin 'mat-khau'
set -uo pipefail
URL="${1:?thiếu URL}"; URL="${URL%/}"; U="${2:-}"; P="${3:-}"
PASS=0; FAIL=0; WARN=0
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
check() { # check "mô tả" "mong đợi" "thực tế"
  if [ "$2" = "$3" ]; then echo "  ok    $1"; PASS=$((PASS+1)); else echo "  LỖI   $1 (mong đợi HTTP $2, nhận $3)"; FAIL=$((FAIL+1)); fi
}
echo "Kiểm tra $URL"
check "trang chủ mở được"                              200 "$(code "$URL/")"
check "chưa đăng nhập: /api/auth/me bị chặn"           401 "$(code "$URL/api/auth/me")"
check "chưa đăng nhập: đọc dữ liệu bị chặn"            401 "$(code "$URL/api/db?col=assets&since=0")"
check "chưa đăng nhập: ghi dữ liệu bị chặn"            401 "$(code -X POST -H 'content-type: application/json' -d '{"ops":[]}' "$URL/api/db/sync")"
check "webhook Telegram không có secret bị từ chối"    403 "$(code -X POST -H 'content-type: application/json' -d '{}' "$URL/api/webhook/telegram")"
check "cron không có khoá bị từ chối"                  403 "$(code "$URL/api/cron/remind")"
check "import-backup không có ADMIN_KEY bị từ chối"    403 "$(code -X POST -H 'content-type: application/json' -d '{}' "$URL/api/admin/import-backup")"
check "bootstrap không có ADMIN_KEY bị từ chối"        403 "$(code -X POST -H 'content-type: application/json' -d '{}' "$URL/api/admin/bootstrap")"
check "đăng nhập sai bị từ chối"                       401 "$(code -X POST -H 'content-type: application/json' -d '{"username":"khong.co","password":"sai"}' "$URL/api/auth/login")"
if curl -sI "$URL/" | grep -qi '^x-frame-options'; then echo "  ok    có header chống nhúng khung (X-Frame-Options)"; PASS=$((PASS+1)); else echo "  CHÚ Ý thiếu header X-Frame-Options (bình thường nếu là demo cục bộ)"; WARN=$((WARN+1)); fi
if [ -n "$U" ] && [ -n "$P" ]; then
  JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
  BODY="$(U="$U" P="$P" node -e 'console.log(JSON.stringify({username:process.env.U,password:process.env.P}))')"
  check "đăng nhập bằng tài khoản thật"                200 "$(code -c "$JAR" -X POST -H 'content-type: application/json' --data-binary "$BODY" "$URL/api/auth/login")"
  check "đã đăng nhập: /api/auth/me"                   200 "$(code -b "$JAR" "$URL/api/auth/me")"
  N="$(curl -s -b "$JAR" "$URL/api/db?col=assets&since=0&limit=1500" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).items.length)}catch(e){console.log("?")}})')"
  echo "        số tài sản đọc được: $N"
  [ "$N" = "?" ] && { echo "  LỖI   không đọc được danh sách tài sản"; FAIL=$((FAIL+1)); } || PASS=$((PASS+1))
else
  echo "  (bỏ qua kiểm tra đăng nhập: không truyền username/password)"
fi
echo; echo "Kết quả: $PASS đạt, $FAIL lỗi, $WARN chú ý"
[ "$FAIL" -eq 0 ]
