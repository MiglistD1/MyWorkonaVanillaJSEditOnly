// core/calendarSync.js
import { clearAuthToken } from './driveSync.js';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

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
            console.error(`Google Calendar API Error (${response.status}):`, errorData);
            
            // 403 Forbidden มักหมายถึงสิทธิ์ไม่พอ (ขาด Scope) การล้าง Token จะช่วยให้เราขอสิทธิ์ใหม่ได้ถูกต้องในครั้งถัดไป
            if (response.status === 401 || response.status === 403) {
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
    return await calendarFetch(CALENDAR_API_BASE, token, {
        method: 'POST',
        body: JSON.stringify(body)
    });
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
