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
            if (response.status === 401) await clearAuthToken(token);
            return null;
        }
        return response.json();
    } catch (err) {
        console.error("Google Calendar Network Error:", err);
        return null;
    }
}

export async function createCalendarEvent(task, token) {
    if (!task.dueDate) return null;
    
    // For all-day events, the end date is exclusive (next day)
    const startStr = task.dueDate; // format 'YYYY-MM-DD'
    const d = new Date(startStr);
    d.setDate(d.getDate() + 1);
    const endStr = d.toISOString().split('T')[0];
    
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
    const d = new Date(startStr);
    d.setDate(d.getDate() + 1);
    const endStr = d.toISOString().split('T')[0];

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
    const response = await fetch(`${CALENDAR_API_BASE}/${eventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.ok;
}
