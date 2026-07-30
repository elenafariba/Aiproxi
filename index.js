const http = require('http');
const WebSocket = require('ws');
const net = require('net');

// UUID خود را اینجا قرار دهید (مشابه کدی که ارائه کردید)
const USER_ID = '050517fe-65f6-41da-ab85-ff80bde0c8c9'; 

// Railway به طور خودکار پورت را در متغیر محیطی PORT قرار می‌دهد
const PORT = process.env.PORT || 3000;

// ایجاد سرور HTTP
const server = http.createServer((req, res) => {
    // اگر درخواست وب‌سوکت نبود، لینک کانفیگ را نمایش بده
    if (!req.headers.upgrade || req.headers.upgrade.toLowerCase() !== 'websocket') {
        const host = req.headers.host;
        const link = `vless://${USER_ID}@${host}:443?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=%2F&alpn=http%2F1.1#Railway-VLESS`;
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(link);
    }
});

// راه‌اندازی سرور وب‌سوکت روی همان سرور HTTP
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    let remote = null;
    let isFirst = true;

    ws.on('message', (message) => {
        // اتصال اولیه و اعتبارسنجی
        if (isFirst) {
            isFirst = false;
            const info = parseHeader(message);
            
            if (!info) {
                ws.close(1011, 'Invalid request');
                return;
            }

            // اتصال به سرور مقصد استخراج شده از هدر VLESS
            remote = net.createConnection({ host: info.addr, port: info.port }, () => {
                // ارسال پاسخ تایید اولیه VLESS به کلاینت (دو بایت شامل ورژن و صفر)
                ws.send(Buffer.from([info.version, 0]));
                
                // ارسال داده‌های اولیه کلاینت به سرور مقصد
                const initialData = message.subarray(info.dataStart);
                if (initialData.length > 0) {
                    remote.write(initialData);
                }
            });

            // هدایت داده‌های دریافتی از سرور مقصد به کلاینت
            remote.on('data', (data) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(data);
                }
            });

            remote.on('error', () => { ws.close(); });
            remote.on('close', () => { ws.close(); });
            
        } else {
            // ارسال داده‌های بعدی کلاینت به سرور مقصد
            if (remote && !remote.destroyed) {
                remote.write(message);
            }
        }
    });

    ws.on('close', () => { if (remote) remote.destroy(); });
    ws.on('error', () => { if (remote) remote.destroy(); });
});

// تابع پارس هدر و استخراج آدرس (برگرفته از منطق کد شما)
function parseHeader(buffer) {
    if (buffer.length < 24) return null;

    const version = buffer[0];
    const uuidBytes = buffer.subarray(1, 17);
    if (toUUID(uuidBytes) !== USER_ID) return null;

    const optLen = buffer[17];
    const cmd = buffer[18 + optLen];
    
    // فقط پروتکل TCP پشتیبانی می‌شود
    if (cmd !== 1) return null; 

    let p = 18 + optLen + 1;
    const port = buffer.readUInt16BE(p);
    p += 2;

    const addrType = buffer[p]; p += 1;
    let addr = '';

    if (addrType === 1) {
        // IPv4
        addr = buffer.subarray(p, p + 4).join('.');
        p += 4;
    } else if (addrType === 2) {
        // Domain
        const len = buffer[p]; p += 1;
        addr = buffer.subarray(p, p + len).toString('utf8');
        p += len;
    } else if (addrType === 3) {
        // IPv6
        const parts = [];
        for (let i = 0; i < 8; i++) {
            parts.push(buffer.readUInt16BE(p + i * 2).toString(16));
        }
        addr = parts.join(':');
        p += 16;
    } else {
        return null;
    }

    return { version, addr, port, dataStart: p };
}

// تابع تبدیل آرایه بایت به فرمت استاندارد UUID
function toUUID(bytes) {
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

server.listen(PORT, () => {
    console.log(`VLESS Server is running on port ${PORT}`);
});
