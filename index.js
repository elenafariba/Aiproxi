const net = require('net');
const http = require('http');
const WebSocket = require('ws');

// UUID خود را اینجا قرار دهید (برگرفته از کد اصلی شما)
const USER_ID = '050517fe-65f6-41da-ab85-ff80bde0c8c9'; 

// Railway به صورت خودکار متغیر PORT را تنظیم می‌کند
const PORT = process.env.PORT || 8080;

// ساخت سرور HTTP
const server = http.createServer((req, res) => {
    const host = req.headers.host;
    
    // اگر درخواست معمولی (HTTP) بود، لینک کانفیگ را نمایش بده
    const link = `vless://${USER_ID}@${host}:443?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=%2F&alpn=http%2F1.1#Railway-VLESS-Node`;
    
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(link);
});

// راه‌اندازی سرور وب‌سوکت روی سرور HTTP
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    let remote = null;

    ws.once('message', (msg) => {
        // پارس کردن هدر اولیه (برگرفته از منطق کد امن شما)
        const info = parseHeader(msg);
        
        if (!info) {
            ws.close(1011, 'Invalid request');
            return;
        }

        // برقراری ارتباط TCP با سرور مقصد
        remote = net.connect({ host: info.addr, port: info.port }, () => {
            // ارسال پاسخ تایید اولیه VLESS به کلاینت (دو بایت)
            ws.send(new Uint8Array([info.version, 0]));
            
            // ارسال داده‌های اولیه کلاینت به سرور مقصد
            remote.write(msg.slice(info.dataStart));
        });

        // پمپاژ داده‌ها از سرور مقصد به کلاینت (وب‌سوکت)
        remote.on('data', (data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        // ارسال داده‌های بعدی کلاینت به سرور مقصد
        ws.on('message', (data) => {
            if (remote && !remote.destroyed) {
                remote.write(data);
            }
        });

        // مدیریت خطاها و بستن ارتباطات
        remote.on('error', () => { ws.close(); });
        remote.on('close', () => { ws.close(); });
        ws.on('close', () => { if (remote) remote.destroy(); });
        ws.on('error', () => { if (remote) remote.destroy(); });
    });
});

// تابع پارس هدر و استخراج آدرس (دقیقاً بر اساس ساختار تابع کد اصلی شما)
function parseHeader(buffer) {
    const buf = new Uint8Array(buffer);
    if (buf.length < 24) return null;
  
    const version = buf[0];
    const uuidBytes = buf.slice(1, 17);
    if (toUUID(uuidBytes) !== USER_ID) return null;
  
    const optLen = buf[17];
    const cmd = buf[18 + optLen];
    if (cmd !== 1) return null; // فقط پروتکل TCP پشتیبانی می‌شود
  
    let p = 18 + optLen + 1;
    const port = (buf[p] << 8) | buf[p + 1];
    p += 2;
  
    const addrType = buf[p]; p += 1;
    let addr = '';
    
    if (addrType === 1) {
      addr = buf.slice(p, p + 4).join('.');
      p += 4;
    } else if (addrType === 2) {
      const len = buf[p]; p += 1;
      addr = new TextDecoder().decode(buf.slice(p, p + len));
      p += len;
    } else if (addrType === 3) {
      const parts = [];
      for (let i = 0; i < 8; i++) {
        parts.push(((buf[p + i * 2] << 8) | buf[p + i * 2 + 1]).toString(16));
      }
      addr = parts.join(':');
      p += 16;
    } else {
      return null;
    }
  
    return { version, addr, port, dataStart: p };
  }
  
// تابع تبدیل آرایه بایت به فرمت استاندارد UUID (برگرفته از کد اصلی شما)
function toUUID(bytes) {
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// اجرای سرور
server.listen(PORT, () => {
    console.log(`VLESS Node.js server is listening on port ${PORT}`);
});
