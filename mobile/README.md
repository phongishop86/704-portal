# Đóng gói APK (Android) cho 704 ASSETS

Ứng dụng là PWA: **không cần APK** nếu chỉ muốn cài ra màn hình chính
(Android Chrome: menu ⋮ → "Cài đặt ứng dụng"; iPhone Safari: Chia sẻ → "Thêm vào MH chính").

Nếu cần file APK (phát hành nội bộ), vỏ Capacitor này mở thẳng `https://704-assets.vercel.app/app.html`
nên mọi cập nhật web có hiệu lực ngay, không phải build lại APK.

Yêu cầu: Node 18+, JDK 17, Android Studio (Android SDK). Chưa được kiểm thử trong môi trường dựng — hãy thử trên máy có Android Studio.

```
cd mobile
npm install
npx cap add android
# Đặt icon: thay mipmap trong android/app/src/main/res bằng public/img/icon-512.png (Android Studio → Image Asset)
npx cap sync android
npx cap open android      # Build > Build APK(s)
```
Sau khi ký (Build > Generate Signed Bundle/APK) có thể phát file `.apk` nội bộ.
