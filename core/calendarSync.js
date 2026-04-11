// core/calendarSync.js

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
import { getAuth, signInWithPopup, GoogleAuthProvider } from "./lib/firebase-auth.js";
import { app } from "./firebaseSync.js";

/** 🔑 Hybrid token provider for Extension (Identity API) and Web (Firebase Auth) */
export async function getAuthToken(interactive = true) {
    // 1. Chrome Extension Environment (Manifest V3)
    if (typeof chrome !== 'undefined' && chrome.identity) {
        return new Promise((resolve) => {
            chrome.identity.getAuthToken({ interactive }, (token) => {
                if (chrome.runtime.lastError) {
                    console.warn("Identity API Error:", chrome.runtime.lastError.message);
                    return resolve(null);
                }
                resolve(token);
            });
        });
    }

    // 2. Web App Environment (Firebase Auth)
    try {
        // Dynamic import to avoid loading Firebase Auth in the extension environment
        const auth = getAuth(app); // 🟢 ระบุ app instance เพื่อความแม่นยำ
        
        // 🟢 สำหรับ Web App: ตรวจสอบ Token ใน Session ก่อน (Firebase ไม่เก็บ Google Token ให้)
        if (!interactive) {
            const cachedToken = sessionStorage.getItem('google_calendar_token');
            if (cachedToken) return cachedToken;
            if (!auth.currentUser) return null;
        }

        const provider = new GoogleAuthProvider();
        // Essential scope for Calendar access
        provider.addScope('https://www.googleapis.com/auth/calendar.events');

        // 🟢 บังคับให้แสดงหน้าต่างเลือก Account และขอสิทธิ์ใหม่ทุกครั้งที่กด "Connect"
        // ป้องกันปัญหา Firebase คืนค่า User เดิมที่ไม่มีสิทธิ์ Calendar ติดมาด้วย
        if (interactive) {
            provider.setCustomParameters({ prompt: 'consent' });
        }

        // Note: For web apps, we trigger popup if a fresh access token is needed
        if (interactive || !auth.currentUser) {
            const result = await signInWithPopup(auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                // 🟢 เก็บ Token ไว้ใช้ในเซสชันปัจจุบัน
                sessionStorage.setItem('google_calendar_token', credential.accessToken);
                return credential.accessToken;
            }
        }
    } catch (error) {
        console.error("Firebase Auth Error:", error);
    }
    return null;
}

/** 🗑️ ล้าง Token ออกจากระบบ (ย้ายมาจาก driveSync เดิมเพื่อใช้กับ Calendar) */
export async function clearAuthToken(tokenToClear) {
    if (typeof chrome !== 'undefined' && chrome.identity && tokenToClear) {
        return new Promise(resolve => chrome.identity.removeCachedAuthToken({ token: tokenToClear }, resolve));
    } else {
        try {
            sessionStorage.removeItem('google_calendar_token'); // 🟢 ล้าง Cache เมื่อออกจากระบบ
            const { signOut } = await import('./lib/firebase-auth.js');
            await signOut(getAuth(app));
        } catch (e) { console.error("SignOut Error:", e); }
    }
}

async function calendarFetch(url, token, options = {}) {
    if (!token) return null;
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`❌ Google Calendar API Error (${response.status}):`, errorData);

            // 403 Forbidden มักหมายถึง API ยังไม่ถูกเปิดใช้งาน หรือขาด Scope
            if (response.status === 401 || response.status === 403) {
                let reason = "Access Denied (403)";
                if (errorData.error && errorData.error.message) {
                    reason = errorData.error.message;
                    console.log("🔍 Error Detail:", reason);
                }

                const isApiDisabled = reason.toLowerCase().includes("not enabled") || reason.toLowerCase().includes("access not configured");
                
                if (isApiDisabled) {
                    alert(`❌ Google Calendar Sync ล้มเหลว (403 Forbidden)\n\nสาเหตุ: คุณยังไม่ได้เปิดใช้งาน 'Google Calendar API' ใน Google Cloud Console\n\nวิธีแก้: เข้าไปที่ Cloud Console > APIs & Services > Library > ค้นหา 'Google Calendar API' แล้วกดปุ่ม 'Enable' ครับ`);
                } else {
                    alert(`⚠️ Google Calendar API Error (${response.status}):\n${reason}\n\nระบบจะทำการ Reset การล็อกอินและบังคับให้เลือกสิทธิ์ใหม่อีกครั้ง โปรดตรวจสอบว่าคุณได้ 'ติ๊กถูก' ในทุกช่องสิทธิ์ที่ Google ขอมานะครับ`);
                }

                // ล้าง Token ทั้งหมด และส่ง flag 'forceConsent' เพื่อให้รอบหน้าเด้งหน้าต่างเลือกสิทธิ์ใหม่
                await clearAuthToken(token);
            }
            return null;
        }
        // จัดการกรณีลบ (204 No Content) ซึ่งไม่มี JSON ให้ Parse
        return response.status === 204 ? true : response.json();
    } catch (err) {
        console.error("Google Calendar Network Error:", err);
        return null;
    }
}

export async function createCalendarEvent(task, token) {
    if (!task.dueDate) return null;
    
    // 📅 การจัดการวันที่แบบ ISO 8601 สำหรับ All-day events
    // กำหนดวันที่เริ่มต้น (Start Date) และวันสิ้นสุด (End Date - ต้องเป็นวันถัดไป)
    const startStr = task.dueDate; // รูปแบบ 'YYYY-MM-DD'
    const startDate = new Date(startStr + 'T00:00:00Z'); // ใช้ UTC เพื่อป้องกันวันเคลื่อน
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    const endStr = endDate.toISOString().split('T')[0];
    
    const body = {
        summary: task.completed ? `[Done] ${task.text}` : task.text,
        description: 'Synced from My Workspace 2.0',
        start: { date: startStr },
        end: { date: endStr }
    };
    const result = await calendarFetch(CALENDAR_API_BASE, token, {
        method: 'POST',
        body: JSON.stringify(body)
    });
    return result;
}

export async function updateCalendarEvent(eventId, task, token) {
    if (!eventId || !task.dueDate) return null;
    
    const startStr = task.dueDate; 
    const startDate = new Date(startStr + 'T00:00:00Z');
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    const endStr = endDate.toISOString().split('T')[0];

    const body = {
        summary: task.completed ? `[Done] ${task.text}` : task.text,
        start: { date: startStr },
        end: { date: endStr }
    };
    return await calendarFetch(`${CALENDAR_API_BASE}/${eventId}`, token, {
        method: 'PATCH',
        body: JSON.stringify(body)
    });
}

export async function deleteCalendarEvent(eventId, token) {
    if (!eventId) return null;
    return await calendarFetch(`${CALENDAR_API_BASE}/${eventId}`, token, {
        method: 'DELETE'
    });
}
