<%@ WebHandler Language="C#" Class="Sso704" %>
// Cách A (dùng khi Portal đăng nhập kiểu form/LDAP, KHÔNG dùng Windows Authentication):
// đặt file này trong Portal (ASP.NET, .NET Framework 4.x). Người dùng đã đăng nhập Portal bấm liên kết /sso.ashx
// -> tạo JWT HS256 ngắn hạn -> chuyển hướng tới 704. SỬA 3 chỗ: Secret, Target, và hàm LayNguoiDung().
using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Web;
using System.Web.Script.Serialization;

public class Sso704 : IHttpHandler
{
    const string Secret = "DAN_SSO_SECRET_TU_.env_CUA_704";          // = SSO_SECRET trong C:\704-assets\.env
    const string Issuer = "icbv-portal";                              // = SSO_ISSUER (nếu có đặt)
    const string Target = "https://assets.icbv.com/api/auth/sso";

    // SỬA: lấy người dùng đang đăng nhập Portal + nhóm AD của họ theo cách Portal đang lưu
    static void LayNguoiDung(HttpContext c, out string user, out string name, out string mail, out string dept, out string[] groups)
    {
        user = c.User != null && c.User.Identity.IsAuthenticated ? c.User.Identity.Name : null; // "ICBV\an" hoặc "an"
        name = user; mail = ""; dept = "";
        groups = new string[0]; // để trống = 704 tự tra nhóm trong AD nếu đã cấu hình LDAP_BIND_DN; hoặc truyền danh sách nhóm 704-*
    }

    static string B64(byte[] b) { return Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_'); }

    public void ProcessRequest(HttpContext ctx)
    {
        string user, name, mail, dept; string[] groups;
        LayNguoiDung(ctx, out user, out name, out mail, out dept, out groups);
        if (string.IsNullOrEmpty(user)) { ctx.Response.StatusCode = 401; ctx.Response.Write("Chưa đăng nhập Portal."); return; }
        long now = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;
        var ser = new JavaScriptSerializer();
        var payload = new Dictionary<string, object> {
            { "sub", user }, { "name", name }, { "email", mail }, { "department", dept }, { "groups", groups },
            { "iss", Issuer }, { "iat", now }, { "exp", now + 60 }, { "jti", Guid.NewGuid().ToString("N") }
        };
        string h = B64(Encoding.UTF8.GetBytes("{\"alg\":\"HS256\",\"typ\":\"JWT\"}"));
        string p = B64(Encoding.UTF8.GetBytes(ser.Serialize(payload)));
        string sig;
        using (var hm = new HMACSHA256(Encoding.UTF8.GetBytes(Secret))) sig = B64(hm.ComputeHash(Encoding.ASCII.GetBytes(h + "." + p)));
        ctx.Response.Redirect(Target + "?token=" + h + "." + p + "." + sig + "&next=/", false);
    }
    public bool IsReusable { get { return false; } }
}
