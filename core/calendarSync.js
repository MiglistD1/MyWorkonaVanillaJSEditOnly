const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

async function calendarFetch(url, token, options = {}) {
    if (!token) return null;
    const response = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) return null;
    return response.json();
}

export async function createCalendarEvent(task, token) {
    if (!task.dueDate) return null;
    const startDate = new Date(task.dueDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
    
    const body = {
        summary: task.completed ? `[Done] ${task.text}` : task.text,
        description: 'Synced from My Workspace 2.0',
        start: { date: startDate.toISOString().split('T')[0] },
        end: { date: endDate.toISOString().split('T')[0] }
    };
    return await calendarFetch(CALENDAR_API_BASE, token, {
        method: 'POST',
        body: JSON.stringify(body)
    });
}

export async function updateCalendarEvent(eventId, task, token) {
    if (!eventId || !task.dueDate) return null;
    const startDate = new Date(task.dueDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);

    const body = {
        summary: task.completed ? `[Done] ${task.text}` : task.text,
        start: { date: startDate.toISOString().split('T')[0] },
        end: { date: endDate.toISOString().split('T')[0] }
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
