#!/usr/bin/env bash
# Tạo (hoặc đặt lại mật khẩu) tài khoản admin trên máy chủ. Dùng khi Firestore còn trống hoặc quên mật khẩu admin.
#   scripts/bootstrap-admin.sh <URL> <ADMIN_KEY> <username> <password-it-nhat-8-ky-tu> ["Họ tên"]
set -euo pipefail
URL="${1:?thiếu URL}"; KEY="${2:?thiếu ADMIN_KEY}"; U="${3:?thiếu username}"; P="${4:?thiếu password}"; N="${5:-$U}"
BODY="$(U="$U" P="$P" N="$N" node -e 'console.log(JSON.stringify({username:process.env.U,password:process.env.P,full_name:process.env.N}))')"
curl -sS -w "\nHTTP %{http_code}\n" -X POST "${URL%/}/api/admin/bootstrap" \
  -H "x-admin-key: ${KEY}" -H "Content-Type: application/json" --data-binary "$BODY"
