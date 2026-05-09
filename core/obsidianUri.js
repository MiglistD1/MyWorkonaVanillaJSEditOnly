/**
 * obsidian://open — vault name + path สัมพันธ์กับราก vault (เหมือน note-webapp)
 */

export function buildObsidianOpenUri(vaultName, fileRelativeToVaultRoot) {
    const v = String(vaultName || '').trim();
    let f = String(fileRelativeToVaultRoot || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!v || !f) return '';
    const lower = f.toLowerCase();
    if (!lower.endsWith('.md') && !lower.endsWith('.markdown')) {
        f = `${f}.md`;
    }
    return `obsidian://open?vault=${encodeURIComponent(v)}&file=${encodeURIComponent(f)}`;
}

/** เปิด custom protocol ผ่านแท็บใหม่ — OS ส่งต่อไป Obsidian */
export function openObsidianUriInBrowser(uri) {
    const t = String(uri || '').trim();
    if (!t) return;
    const a = document.createElement('a');
    a.href = t;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
}
