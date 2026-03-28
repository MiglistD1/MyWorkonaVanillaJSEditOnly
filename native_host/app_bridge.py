import sys
import os
import json
import struct
import subprocess
import time
import ctypes
try:
    import pygetwindow as gw
except ImportError:
    gw = None

def send_message(message):
    encoded_message = json.dumps(message).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('@I', len(encoded_message)))
    sys.stdout.buffer.write(encoded_message)
    sys.stdout.buffer.flush()

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        sys.exit(0)
    message_length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

def main():
    while True:
        msg = read_message()
        app_path = msg.get("path")       
        app_name = msg.get("name")       
        split_view = msg.get("splitView", False)
        side = msg.get("side", "right")
        
        win = None

        if app_path and app_name:
            try:
                # ปรับแต่ง Path ให้เข้ากับรูปแบบ Windows
                app_path = os.path.normpath(app_path)

                # 1. ค้นหาหน้าต่างที่มีชื่อตรงกับ app_name ที่ตั้งไว้
                if gw:
                    windows = [w for w in gw.getAllWindows() if app_name.lower() in w.title.lower()]
                    if windows:
                        win = windows[0]
                        if win.isMinimized:
                            win.restore()
                        win.activate() 
                
                if not win:
                    # กรณีที่ 2: โปรแกรมยังไม่เปิด -> สั่งเปิดใหม่
                    if os.path.exists(app_path):
                        os.startfile(app_path)
                        time.sleep(3) # เพิ่มเวลารอให้โปรแกรมโหลดหน้าต่าง
                        
                        if gw:
                            windows = [w for w in gw.getAllWindows() if app_name.lower() in w.title.lower()]
                            if windows:
                                win = windows[0]
                    else:
                        raise FileNotFoundError(f"ไม่พบไฟล์ที่ Path นี้: {app_path}")
                
                # 2. จัดการเรื่อง Split View (ถ้าผู้ใช้ตั้งค่าไว้)
                if split_view and win:
                    user32 = ctypes.windll.user32
                    screen_width = user32.GetSystemMetrics(0)
                    screen_height = user32.GetSystemMetrics(1)
                    half_width = screen_width // 2
                    left_pos = half_width if side == "right" else 0
                    
                    if win.isMaximized:
                        win.restore() 
                    win.moveTo(left_pos, 0)
                    win.resizeTo(half_width, screen_height)

                send_message({"status": "success", "message": f"Activated {app_name}"})
                
            except Exception as e:
                send_message({"status": "error", "message": str(e)})

if __name__ == '__main__':
    main()