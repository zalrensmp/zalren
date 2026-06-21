/* admin.js — Zalren admin panel logic.
 *
 * Sections:
 *   1. State + helpers (auth token, api(), toast, modal, escape)
 *   2. Access gate on load
 *   3. Tab navigation
 *   4. Dashboard
 *   5. Staff (CRUD + reorder)
 *   6. Forum (CRUD + pin)
 *   7. Leaderboard (CRUD + reorder)
 *   8. Users (search + role/verify/delete)
 */

/* ============ 1. STATE + HELPERS ============ */

// Read the session token + user object stored by login.html / app.js.
function getToken() {
    try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        return u.token || localStorage.getItem('token') || '';
    } catch { return ''; }
}
function getStoredUser() {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); }
    catch { return {}; }
}

// Centralised fetch wrapper — always sends the Bearer token and parses JSON.
async function api(path, { method = 'GET', body } = {}) {
    const opts = { method, headers: {} };
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body !== undefined) {
        if (body instanceof FormData) {
            opts.body = body;
        } else {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
    }
    const res = await fetch(path, opts);
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
}

// HTML-escape user-controlled strings before injecting into the DOM.
function esc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Minecraft head avatar URL (crafatar — reliable + no key needed).
function mcHead(username, size = 32) {
    const s = size || 32;
    return `https://crafatar.com/avatars/${encodeURIComponent(username)}?size=64&overlay`;
}

// Format an ISO date into a short readable form.
function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Relative "time ago" string.
function timeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    return fmtDate(iso);
}

// ----- Toast -----
let toastTimer;
function toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    const msgEl = document.getElementById('toast-msg');
    const icon = el.querySelector('i');
    el.classList.remove('success', 'error');
    el.classList.add(type);
    msgEl.textContent = msg;
    icon.className = type === 'error'
        ? 'fa-solid fa-circle-exclamation'
        : 'fa-solid fa-circle-check';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ----- Modal -----
function openModal(title, bodyHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal').classList.add('show');
}
function closeModal() {
    document.getElementById('modal').classList.remove('show');
    document.getElementById('modal-body').innerHTML = '';
}
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('mousedown', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

// A reusable confirmation modal. Resolves true/false.
function confirmModal({ title, message, confirmText = 'Confirm', danger = true }) {
    return new Promise((resolve) => {
        openModal(title, `
            <p style="color:var(--text-muted); line-height:1.6; margin-bottom:8px;">${esc(message)}</p>
            <div class="admin-modal-actions">
                <button class="btn-secondary-admin" id="cf-cancel">Cancel</button>
                <button class="${danger ? 'btn-danger-admin' : 'btn-add'}" id="cf-ok">${esc(confirmText)}</button>
            </div>
        `);
        document.getElementById('cf-cancel').onclick = () => { closeModal(); resolve(false); };
        document.getElementById('cf-ok').onclick = () => { closeModal(); resolve(true); };
    });
}

/* ============ 2. ACCESS GATE ============ */

async function boot() {
    const gate = document.getElementById('gate');
    const panel = document.getElementById('panel');
    const titleEl = document.getElementById('gate-title');
    const msgEl = document.getElementById('gate-msg');

    const token = getToken();
    const stored = getStoredUser();

    if (!token) {
        titleEl.textContent = 'Sign in required';
        msgEl.textContent = 'You need to be signed in as an admin to view this panel.';
        document.getElementById('gate-login-btn').style.display = 'inline-flex';
        document.getElementById('gate-home-btn').style.display = 'inline-flex';
        gate.style.display = 'flex';
        return;
    }

    // Validate the token + role against the server.
    try {
        const me = await api('/api/me');
        if (me.role !== 'admin' && me.role !== 'owner' && me.role !== 'webdev') {
            titleEl.textContent = 'Access denied';
            msgEl.textContent = `Your account (${esc(me.username)}) does not have admin privileges.`;
            document.getElementById('gate-home-btn').style.display = 'inline-flex';
            gate.style.display = 'flex';
            return;
        }
        // Approved — show the panel.
        document.getElementById('admin-who').innerHTML =
            `Signed in as <strong style="color:var(--p-color);">${esc(me.username)}</strong> <span class="pill pill-${esc(me.role)}">${esc(me.role)}</span>`;
        gate.style.display = 'none';
        panel.style.display = 'grid';
        loadDashboard();
    } catch (err) {
        // Token invalid/expired → clear it and ask to sign in again.
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        titleEl.textContent = 'Session expired';
        msgEl.textContent = 'Please sign in again to access the admin panel.';
        document.getElementById('gate-login-btn').style.display = 'inline-flex';
        document.getElementById('gate-home-btn').style.display = 'inline-flex';
        gate.style.display = 'flex';
    }
}

// Logout button
document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = 'login.html';
});

/* ============ 3. TAB NAVIGATION ============ */

const TABS = ['dashboard', 'staff', 'forum', 'leaderboard', 'rules', 'votes', 'homeposts', 'slides', 'users'];
document.querySelectorAll('.admin-nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
    document.querySelectorAll('.admin-nav-item').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === tab));
    TABS.forEach(t => {
        const pane = document.getElementById('tab-' + t);
        if (pane) pane.style.display = (t === tab) ? 'block' : 'none';
    });
    // Lazy-load data for the tab.
    if (tab === 'dashboard') loadDashboard();
    else if (tab === 'staff') loadStaff();
    else if (tab === 'forum') loadForum();
    else if (tab === 'leaderboard') loadLeaderboard();
    else if (tab === 'rules') loadRules();
    else if (tab === 'votes') loadVotes();
    else if (tab === 'homeposts') loadHomePosts();
    else if (tab === 'slides') loadSlides();
    else if (tab === 'users') loadUsers();
}

/* ============ 4. DASHBOARD ============ */

async function loadDashboard() {
    const grid = document.getElementById('stat-grid');
    const recent = document.getElementById('recent-users');
    grid.innerHTML = '<div class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    try {
        const s = await api('/api/admin/stats');
        
        // Also fetch settings
        try {
            const settings = await api('/api/settings');
            document.getElementById('setting-ip').value = settings.server_ip || 'play.zalrensmp.fun';
            document.getElementById('setting-version').value = settings.server_version || '';
        } catch(e) { console.warn('Could not load settings', e); }

        const cards = [
            { icon: 'fa-users',            num: s.total_users,        label: 'Total Users' },
            { icon: 'fa-circle-check',     num: s.verified_users,     label: 'Verified' },
            { icon: 'fa-shield-halved',    num: s.admins,             label: 'Admins / Owners' },
            { icon: 'fa-id-badge',         num: s.staff_count,        label: 'Staff Members' },
            { icon: 'fa-comments',         num: s.forum_count,        label: 'Forum Posts' },
            { icon: 'fa-trophy',           num: s.leaderboard_count,  label: 'Leaderboard Entries' }
        ];
        grid.innerHTML = cards.map(c => `
            <div class="stat-card">
                <div class="stat-icon"><i class="fa-solid ${c.icon}"></i></div>
                <div class="stat-num">${c.num}</div>
                <div class="stat-label">${esc(c.label)}</div>
            </div>`).join('');

        if (!s.recent_users || s.recent_users.length === 0) {
            recent.innerHTML = '<div class="admin-empty"><i class="fa-solid fa-user-slash"></i><p>No users yet.</p></div>';
        } else {
            recent.innerHTML = s.recent_users.map(u => `
                <div class="recent-user">
                    <div class="ru-info">
                        <span class="ru-name">${esc(u.username)} <span class="pill pill-${esc(u.role)}">${esc(u.role)}</span></span>
                        <span class="ru-email">${esc(u.email)}</span>
                    </div>
                    <span style="color:var(--text-muted); font-size:0.85rem;">${timeAgo(u.created_at)}</span>
                </div>`).join('');
        }
    } catch (err) {
        grid.innerHTML = '';
        recent.innerHTML = `<div class="admin-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>${esc(err.message)}</p></div>`;
    }
}

// Settings form save
document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;
    
    const fd = new FormData();
    fd.append('server_ip', document.getElementById('setting-ip').value);
    fd.append('server_version', document.getElementById('setting-version').value);
    const bannerFile = document.getElementById('setting-banner').files[0];
    if (bannerFile) fd.append('banner', bannerFile);

    try {
        await api('/api/admin/settings', {
            method: 'PUT',
            body: fd
        });
        toast('Server configuration saved!');
    } catch(err) {
        toast(err.message, 'error');
    }
    btn.innerHTML = '<i class="fa-solid fa-save"></i> Save Settings';
    btn.disabled = false;
});

/* ============ 5. STAFF ============ */

let staffCache = [];

async function loadStaff() {
    const tbody = document.getElementById('staff-tbody');
    tbody.innerHTML = '<tr><td colspan="6"><div class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i></div></td></tr>';
    try {
        staffCache = await api('/api/staff');
        renderStaff();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="admin-empty"><p>${esc(err.message)}</p></div></td></tr>`;
    }
}

function renderStaff() {
    try {
        const tbody = document.getElementById('staff-tbody');
        if (staffCache.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6"><div class="admin-empty">
                <i class="fa-solid fa-users-slash"></i><p>No staff members yet. Click "Add Staff".</p>
            </div></td></tr>`;
            return;
        }
        tbody.innerHTML = staffCache.map((s, i) => `
        <tr>
            <td><span class="rank-badge">${i + 1}</span></td>
            <td>
                <div class="user-cell">
                    <img class="row-avatar" src="${mcHead(s.minecraft_username)}" alt="" onerror="this.style.visibility='hidden'">
                    <div>
                        <div class="u-name">${esc(s.name)}</div>
                        <div class="u-sub">${esc(s.description || '').substring(0, 60)}${(s.description||'').length>60?'…':''}</div>
                    </div>
                </div>
            </td>
            <td><span class="pill pill-admin">${esc(s.role_title)}</span></td>
            <td>${esc(s.minecraft_username)}</td>
            <td>
                <div class="action-group">
                    <button class="icon-btn" data-staff-up="${s.id}" ${i === 0 ? 'disabled' : ''} title="Move up"><i class="fa-solid fa-arrow-up"></i></button>
                    <button class="icon-btn" data-staff-down="${s.id}" ${i === staffCache.length - 1 ? 'disabled' : ''} title="Move down"><i class="fa-solid fa-arrow-down"></i></button>
                </div>
            </td>
            <td>
                <div class="action-group">
                    <button class="icon-btn" data-staff-edit="${s.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="icon-btn danger" data-staff-del="${s.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`).join('');
    } catch (e) {
        console.error(e);
        document.getElementById('staff-tbody').innerHTML = `<tr><td colspan="6"><div class="admin-empty"><p>Error rendering staff: ${esc(e.message)}</p></div></td></tr>`;
    }
}

// Staff interactions (delegated)
document.addEventListener('click', async (e) => {
    const up = e.target.closest('[data-staff-up]');
    const down = e.target.closest('[data-staff-down]');
    const edit = e.target.closest('[data-staff-edit]');
    const del = e.target.closest('[data-staff-del]');
    if (up)   { await moveStaff(up.getAttribute('data-staff-up'), 'up'); }
    if (down) { await moveStaff(down.getAttribute('data-staff-down'), 'down'); }
    if (edit) { openStaffForm(staffCache.find(s => s.id == edit.getAttribute('data-staff-edit'))); }
    if (del)  { await deleteStaff(del.getAttribute('data-staff-del')); }
});

async function moveStaff(id, direction) {
    try {
        await api(`/api/admin/staff/${id}/move`, { method: 'POST', body: { direction } });
        await loadStaff();
    } catch (err) { toast(err.message, 'error'); }
}

async function deleteStaff(id) {
    const ok = await confirmModal({
        title: 'Delete staff member',
        message: 'Remove this staff member from the public Staff page? This cannot be undone.',
        confirmText: 'Delete'
    });
    if (!ok) return;
    try {
        await api(`/api/admin/staff/${id}`, { method: 'DELETE' });
        toast('Staff member removed');
        await loadStaff();
    } catch (err) { toast(err.message, 'error'); }
}

// "Add Staff" button
document.querySelector('[data-action="add-staff"]').addEventListener('click', () => openStaffForm(null));

function openStaffForm(existing) {
    const isEdit = !!existing;
    openModal(isEdit ? 'Edit Staff Member' : 'Add Staff Member', `
        <form id="staff-form">
            <div class="admin-field">
                <label>Display Name *</label>
                <input class="admin-input" name="name" required value="${esc(existing?.name || '')}">
            </div>
            <div class="admin-field">
                <label>Role Title *</label>
                <input class="admin-input" name="role_title" required placeholder="e.g. Owner, Admin, Moderator" value="${esc(existing?.role_title || '')}">
            </div>
            <div class="admin-field">
                <label>Minecraft Username (for avatar)</label>
                <input class="admin-input" name="minecraft_username" placeholder="IGN" value="${esc(existing?.minecraft_username || '')}">
            </div>
            <div class="admin-field">
                <label>Description</label>
                <textarea class="admin-textarea" name="description" placeholder="Short bio shown on the staff page">${esc(existing?.description || '')}</textarea>
            </div>
            <div class="admin-field">
                <label>Skin Image (Optional)</label>
                <input type="file" class="admin-input" name="skin" accept="image/*">
            </div>
            <div class="admin-modal-actions">
                <button type="button" class="btn-secondary-admin" id="sf-cancel">Cancel</button>
                <button type="submit" class="btn-add">${isEdit ? 'Save Changes' : 'Add Staff'}</button>
            </div>
        </form>
    `);
    document.getElementById('sf-cancel').onclick = closeModal;
    document.getElementById('staff-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        try {
            if (isEdit) {
                await api(`/api/admin/staff/${existing.id}`, { method: 'PUT', body: fd });
                toast('Staff member updated');
            } else {
                await api('/api/admin/staff', { method: 'POST', body: fd });
                toast('Staff member added');
            }
            closeModal();
            await loadStaff();
        } catch (err) { toast(err.message, 'error'); }
    });
}

/* ============ 6. FORUM ============ */

async function loadForum() {
    const list = document.getElementById('forum-list');
    list.innerHTML = '<div class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    try {
        const posts = await api('/api/forum');
        if (posts.length === 0) {
            list.innerHTML = `<div class="admin-empty"><i class="fa-solid fa-comment-slash"></i><p>No posts yet. Click "New Post".</p></div>`;
            return;
        }
        list.innerHTML = posts.map(p => `
            <div class="panel-card" style="position:relative;">
                <div style="display:flex; justify-content:space-between; gap:15px; align-items:flex-start; flex-wrap:wrap;">
                    <div style="flex:1; min-width:240px;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                            ${p.pinned ? '<span class="pill pill-pinned"><i class="fa-solid fa-thumbtack"></i> Pinned</span>' : ''}
                            <span class="pill pill-category">${esc(p.category)}</span>
                        </div>
                        <h3 style="margin-bottom:6px; color:var(--text-main); font-size:1.15rem;">${esc(p.title)}</h3>
                        <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:10px;">
                            <i class="fa-solid fa-user"></i> ${esc(p.author)} &nbsp;•&nbsp; <i class="fa-solid fa-clock"></i> ${fmtDate(p.created_at)}
                        </div>
                        <p style="color:var(--text-muted); white-space:pre-wrap; line-height:1.6;">${esc(p.body).substring(0, 300)}${p.body.length > 300 ? '…' : ''}</p>
                    </div>
                    <div class="action-group" style="flex-shrink:0;">
                        <button class="icon-btn" data-forum-pin="${p.id}" title="${p.pinned ? 'Unpin' : 'Pin'}"><i class="fa-solid fa-thumbtack"></i></button>
                        <button class="icon-btn" data-forum-edit="${p.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                        <button class="icon-btn danger" data-forum-del="${p.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>`).join('');
    } catch (err) {
        list.innerHTML = `<div class="admin-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>${esc(err.message)}</p></div>`;
    }
}

let forumCache = [];
document.addEventListener('click', async (e) => {
    const pin = e.target.closest('[data-forum-pin]');
    const edit = e.target.closest('[data-forum-edit]');
    const del = e.target.closest('[data-forum-del]');
    if (pin) {
        try {
            const r = await api(`/api/admin/forum/${pin.getAttribute('data-forum-pin')}/pin`, { method: 'POST' });
            toast(r.pinned ? 'Post pinned' : 'Post unpinned');
            await loadForum();
        } catch (err) { toast(err.message, 'error'); }
    }
    if (edit) {
        try {
            forumCache = await api('/api/forum');
            const post = forumCache.find(p => p.id == edit.getAttribute('data-forum-edit'));
            openForumForm(post);
        } catch (err) { toast(err.message, 'error'); }
    }
    if (del) { await deleteForum(del.getAttribute('data-forum-del')); }
});

async function deleteForum(id) {
    const ok = await confirmModal({
        title: 'Delete forum post',
        message: 'Permanently remove this post from the public forums?',
        confirmText: 'Delete'
    });
    if (!ok) return;
    try {
        await api(`/api/admin/forum/${id}`, { method: 'DELETE' });
        toast('Post deleted');
        await loadForum();
    } catch (err) { toast(err.message, 'error'); }
}

document.querySelector('[data-action="add-forum"]').addEventListener('click', () => openForumForm(null));

function openForumForm(existing) {
    const isEdit = !!existing;
    openModal(isEdit ? 'Edit Post' : 'New Forum Post', `
        <form id="forum-form">
            <div class="admin-field">
                <label>Title *</label>
                <input class="admin-input" name="title" required value="${esc(existing?.title || '')}">
            </div>
            <div class="admin-field">
                <label>Category</label>
                <select class="admin-select" name="category">
                    ${['Announcement','Event','Update','Discussion','Guide'].map(c =>
                        `<option value="${c}" ${existing?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </div>
            <div class="admin-field">
                <label>Body *</label>
                <textarea class="admin-textarea" name="body" required placeholder="Write your post...">${esc(existing?.body || '')}</textarea>
            </div>
            <div class="admin-field">
                <label>Post Image (Optional)</label>
                <input type="file" class="admin-input" name="image" accept="image/*">
            </div>
            <div class="admin-modal-actions">
                <button type="button" class="btn-secondary-admin" id="ff-cancel">Cancel</button>
                <button type="submit" class="btn-add">${isEdit ? 'Save Changes' : 'Publish'}</button>
            </div>
        </form>
    `);
    document.getElementById('ff-cancel').onclick = closeModal;
    document.getElementById('forum-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        try {
            if (isEdit) {
                await api(`/api/admin/forum/${existing.id}`, { method: 'PUT', body: fd });
                toast('Post updated');
            } else {
                await api('/api/admin/forum', { method: 'POST', body: fd });
                toast('Post published');
            }
            closeModal();
            await loadForum();
        } catch (err) { toast(err.message, 'error'); }
    });
}

/* ============ 7. LEADERBOARD ============ */

let leaderboardCache = [];

async function loadLeaderboard() {
    const tbody = document.getElementById('leaderboard-tbody');
    tbody.innerHTML = '<tr><td colspan="5"><div class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i></div></td></tr>';
    try {
        leaderboardCache = await api('/api/leaderboard');
        renderLeaderboard();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty"><p>${esc(err.message)}</p></div></td></tr>`;
    }
}

function renderLeaderboard() {
    const tbody = document.getElementById('leaderboard-tbody');
    if (leaderboardCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty">
            <i class="fa-solid fa-medal"></i><p>No entries yet. Click "Add Entry".</p></div></td></tr>`;
        return;
    }
    tbody.innerHTML = leaderboardCache.map((e, i) => {
        const rankCls = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
        return `
        <tr>
            <td><span class="rank-badge ${rankCls}">${i + 1}</span></td>
            <td>
                <div class="user-cell">
                    <img class="row-avatar" src="${mcHead(e.player)}" alt="" onerror="this.style.visibility='hidden'">
                    <span class="u-name">${esc(e.player)}</span>
                </div>
            </td>
            <td><span class="pill pill-category">${esc(e.category)}</span></td>
            <td style="font-weight:700; color:var(--p-color);">${esc(e.score.toLocaleString())}</td>
            <td>
                <div class="action-group">
                    <button class="icon-btn" data-lb-up="${e.id}" ${i === 0 ? 'disabled' : ''} title="Move up"><i class="fa-solid fa-arrow-up"></i></button>
                    <button class="icon-btn" data-lb-down="${e.id}" ${i === leaderboardCache.length - 1 ? 'disabled' : ''} title="Move down"><i class="fa-solid fa-arrow-down"></i></button>
                    <button class="icon-btn" data-lb-edit="${e.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="icon-btn danger" data-lb-del="${e.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

document.addEventListener('click', async (e) => {
    const up = e.target.closest('[data-lb-up]');
    const down = e.target.closest('[data-lb-down]');
    const edit = e.target.closest('[data-lb-edit]');
    const del = e.target.closest('[data-lb-del]');
    if (up)   { await moveLeaderboard(up.getAttribute('data-lb-up'), 'up'); }
    if (down) { await moveLeaderboard(down.getAttribute('data-lb-down'), 'down'); }
    if (edit) { openLeaderboardForm(leaderboardCache.find(x => x.id == edit.getAttribute('data-lb-edit'))); }
    if (del)  { await deleteLeaderboard(del.getAttribute('data-lb-del')); }
});

async function moveLeaderboard(id, direction) {
    try {
        await api(`/api/admin/leaderboard/${id}/move`, { method: 'POST', body: { direction } });
        await loadLeaderboard();
    } catch (err) { toast(err.message, 'error'); }
}

async function deleteLeaderboard(id) {
    const ok = await confirmModal({
        title: 'Delete leaderboard entry',
        message: 'Remove this entry from the public leaderboard?',
        confirmText: 'Delete'
    });
    if (!ok) return;
    try {
        await api(`/api/admin/leaderboard/${id}`, { method: 'DELETE' });
        toast('Entry removed');
        await loadLeaderboard();
    } catch (err) { toast(err.message, 'error'); }
}

document.querySelector('[data-action="add-leaderboard"]').addEventListener('click', () => openLeaderboardForm(null));

function openLeaderboardForm(existing) {
    const isEdit = !!existing;
    openModal(isEdit ? 'Edit Entry' : 'Add Leaderboard Entry', `
        <form id="lb-form">
            <div class="admin-field">
                <label>Player IGN *</label>
                <input class="admin-input" name="player" required value="${esc(existing?.player || '')}">
            </div>
            <div class="admin-field">
                <label>Score *</label>
                <input class="admin-input" type="number" name="score" required value="${esc(existing?.score ?? '')}">
            </div>
            <div class="admin-field">
                <label>Category</label>
                <select class="admin-select" name="category">
                    ${['Kills','Playtime','Blocks Mined','Bosses','Balance','Other'].map(c =>
                        `<option value="${c}" ${existing?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </div>
            <div class="admin-modal-actions">
                <button type="button" class="btn-secondary-admin" id="lf-cancel">Cancel</button>
                <button type="submit" class="btn-add">${isEdit ? 'Save Changes' : 'Add Entry'}</button>
            </div>
        </form>
    `);
    document.getElementById('lf-cancel').onclick = closeModal;
    document.getElementById('lb-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const payload = Object.fromEntries(fd.entries());
        payload.score = Number(payload.score);
        try {
            if (isEdit) {
                await api(`/api/admin/leaderboard/${existing.id}`, { method: 'PUT', body: payload });
                toast('Entry updated');
            } else {
                await api('/api/admin/leaderboard', { method: 'POST', body: payload });
                toast('Entry added');
            }
            closeModal();
            await loadLeaderboard();
        } catch (err) { toast(err.message, 'error'); }
    });
}

/* ============ 7a. RULES ============ */
let rulesCache = [];
async function loadRules() {
    const tbody = document.getElementById('rules-tbody');
    tbody.innerHTML = '<tr><td colspan="6"><div class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i></div></td></tr>';
    try {
        rulesCache = await api('/api/rules');
        renderRules();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="admin-empty"><p>${esc(err.message)}</p></div></td></tr>`;
    }
}
function renderRules() {
    const tbody = document.getElementById('rules-tbody');
    if (rulesCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="admin-empty"><i class="fa-solid fa-scale-balanced"></i><p>No rules yet. Click "Add Rule".</p></div></td></tr>`;
        return;
    }
    tbody.innerHTML = rulesCache.map((r, i) => `
        <tr>
            <td><span class="rank-badge">${i + 1}</span></td>
            <td><i class="${esc(r.icon)}"></i></td>
            <td><span class="pill pill-category">${esc(r.category)}</span></td>
            <td>${esc(r.rule_text)}</td>
            <td>
                <div class="action-group">
                    <button class="icon-btn" data-rule-up="${r.id}" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
                    <button class="icon-btn" data-rule-down="${r.id}" ${i === rulesCache.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
                </div>
            </td>
            <td>
                <div class="action-group">
                    <button class="icon-btn" data-rule-edit="${r.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="icon-btn danger" data-rule-del="${r.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`).join('');
}
document.addEventListener('click', async (e) => {
    const up = e.target.closest('[data-rule-up]');
    const down = e.target.closest('[data-rule-down]');
    const edit = e.target.closest('[data-rule-edit]');
    const del = e.target.closest('[data-rule-del]');
    if (up)   { await moveRule(up.getAttribute('data-rule-up'), 'up'); }
    if (down) { await moveRule(down.getAttribute('data-rule-down'), 'down'); }
    if (edit) { openRuleForm(rulesCache.find(x => x.id == edit.getAttribute('data-rule-edit'))); }
    if (del)  { await deleteRule(del.getAttribute('data-rule-del')); }
});
async function moveRule(id, direction) {
    try {
        await api(`/api/admin/rules/${id}/move`, { method: 'POST', body: { direction } });
        await loadRules();
    } catch (err) { toast(err.message, 'error'); }
}
async function deleteRule(id) {
    const ok = await confirmModal({ title: 'Delete rule', message: 'Remove this rule?', confirmText: 'Delete' });
    if (!ok) return;
    try {
        await api(`/api/admin/rules/${id}`, { method: 'DELETE' });
        toast('Rule removed');
        await loadRules();
    } catch (err) { toast(err.message, 'error'); }
}
document.querySelector('[data-action="add-rule"]').addEventListener('click', () => openRuleForm(null));
function openRuleForm(existing) {
    const isEdit = !!existing;
    openModal(isEdit ? 'Edit Rule' : 'Add Rule', `
        <form id="rule-form">
            <div class="admin-field">
                <label>Rule Text *</label>
                <input class="admin-input" name="rule_text" required value="${esc(existing?.rule_text || '')}">
            </div>
            <div class="admin-field">
                <label>Category</label>
                <select class="admin-select" name="category">
                    <option value="In-Game Rules" ${existing?.category === 'In-Game Rules' ? 'selected' : ''}>In-Game Rules</option>
                    <option value="Community/Discord Rules" ${existing?.category === 'Community/Discord Rules' ? 'selected' : ''}>Community/Discord Rules</option>
                    <option value="Modifications/Cheating" ${existing?.category === 'Modifications/Cheating' ? 'selected' : ''}>Modifications/Cheating</option>
                </select>
            </div>
            <div class="admin-field">
                <label>Icon (FontAwesome Class)</label>
                <input class="admin-input" name="icon" placeholder="fa-solid fa-gavel" value="${esc(existing?.icon || 'fa-solid fa-gavel')}">
            </div>
            <div class="admin-modal-actions">
                <button type="button" class="btn-secondary-admin" id="rf-cancel">Cancel</button>
                <button type="submit" class="btn-add">${isEdit ? 'Save Changes' : 'Add Rule'}</button>
            </div>
        </form>
    `);
    document.getElementById('rf-cancel').onclick = closeModal;
    document.getElementById('rule-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const payload = Object.fromEntries(fd.entries());
        try {
            if (isEdit) await api(`/api/admin/rules/${existing.id}`, { method: 'PUT', body: payload });
            else await api('/api/admin/rules', { method: 'POST', body: payload });
            closeModal();
            toast('Rule saved');
            await loadRules();
        } catch (err) { toast(err.message, 'error'); }
    });
}

/* ============ 7b. VOTES ============ */
let votesCache = [];
async function loadVotes() {
    const tbody = document.getElementById('votes-tbody');
    tbody.innerHTML = '<tr><td colspan="5"><div class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i></div></td></tr>';
    try {
        votesCache = await api('/api/votes');
        renderVotes();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty"><p>${esc(err.message)}</p></div></td></tr>`;
    }
}
function renderVotes() {
    const tbody = document.getElementById('votes-tbody');
    if (votesCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty"><i class="fa-solid fa-check-to-slot"></i><p>No votes yet. Click "Add Vote Link".</p></div></td></tr>`;
        return;
    }
    tbody.innerHTML = votesCache.map((v, i) => `
        <tr>
            <td><span class="rank-badge">${i + 1}</span></td>
            <td>${esc(v.site_name)}</td>
            <td><a href="${esc(v.url)}" target="_blank" style="color:var(--p-color);">${esc(v.url)}</a></td>
            <td>
                <div class="action-group">
                    <button class="icon-btn" data-vote-up="${v.id}" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
                    <button class="icon-btn" data-vote-down="${v.id}" ${i === votesCache.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
                </div>
            </td>
            <td>
                <div class="action-group">
                    <button class="icon-btn" data-vote-edit="${v.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="icon-btn danger" data-vote-del="${v.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`).join('');
}
document.addEventListener('click', async (e) => {
    const up = e.target.closest('[data-vote-up]');
    const down = e.target.closest('[data-vote-down]');
    const edit = e.target.closest('[data-vote-edit]');
    const del = e.target.closest('[data-vote-del]');
    if (up)   { await moveVote(up.getAttribute('data-vote-up'), 'up'); }
    if (down) { await moveVote(down.getAttribute('data-vote-down'), 'down'); }
    if (edit) { openVoteForm(votesCache.find(x => x.id == edit.getAttribute('data-vote-edit'))); }
    if (del)  { await deleteVote(del.getAttribute('data-vote-del')); }
});
async function moveVote(id, direction) {
    try {
        await api(`/api/admin/votes/${id}/move`, { method: 'POST', body: { direction } });
        await loadVotes();
    } catch (err) { toast(err.message, 'error'); }
}
async function deleteVote(id) {
    const ok = await confirmModal({ title: 'Delete vote link', message: 'Remove this link?', confirmText: 'Delete' });
    if (!ok) return;
    try {
        await api(`/api/admin/votes/${id}`, { method: 'DELETE' });
        toast('Vote link removed');
        await loadVotes();
    } catch (err) { toast(err.message, 'error'); }
}
document.querySelector('[data-action="add-vote"]').addEventListener('click', () => openVoteForm(null));
function openVoteForm(existing) {
    const isEdit = !!existing;
    openModal(isEdit ? 'Edit Vote Link' : 'Add Vote Link', `
        <form id="vote-form">
            <div class="admin-field">
                <label>Site Name *</label>
                <input class="admin-input" name="site_name" required value="${esc(existing?.site_name || '')}">
            </div>
            <div class="admin-field">
                <label>URL *</label>
                <input class="admin-input" name="url" required value="${esc(existing?.url || '')}">
            </div>
            <div class="admin-modal-actions">
                <button type="button" class="btn-secondary-admin" id="vf-cancel">Cancel</button>
                <button type="submit" class="btn-add">${isEdit ? 'Save Changes' : 'Add Link'}</button>
            </div>
        </form>
    `);
    document.getElementById('vf-cancel').onclick = closeModal;
    document.getElementById('vote-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const payload = Object.fromEntries(fd.entries());
        try {
            if (isEdit) await api(`/api/admin/votes/${existing.id}`, { method: 'PUT', body: payload });
            else await api('/api/admin/votes', { method: 'POST', body: payload });
            closeModal();
            toast('Vote link saved');
            await loadVotes();
        } catch (err) { toast(err.message, 'error'); }
    });
}

/* ============ 8. USERS ============ */

let userSearchTimer;
document.getElementById('user-search').addEventListener('input', () => {
    clearTimeout(userSearchTimer);
    userSearchTimer = setTimeout(loadUsers, 300);
});

async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    const q = document.getElementById('user-search').value.trim();
    tbody.innerHTML = '<tr><td colspan="6"><div class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i></div></td></tr>';
    try {
        const users = await api('/api/admin/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6"><div class="admin-empty">
                <i class="fa-solid fa-user-slash"></i><p>${q ? 'No users match your search.' : 'No users yet.'}</p>
            </div></td></tr>`;
            return;
        }
        const me = getStoredUser();
        tbody.innerHTML = users.map(u => {
            const isSelf = String(u._id) === String(me._id || me.id);
            const isOwner = u.role === 'owner';
            const isWebDev = u.role === 'webdev';
            return `
            <tr>
                <td style="color:var(--text-muted);">${u._id}</td>
                <td>
                    <div class="user-cell">
                        <img class="row-avatar" src="${mcHead(u.username)}" alt="" onerror="this.style.visibility='hidden'">
                        <div>
                            <div class="u-name">${esc(u.username)}${isSelf ? ' <span style="color:var(--text-muted); font-size:0.75rem;">(you)</span>' : ''}${isWebDev ? ' <span style="color:#a78bfa; font-size:0.75rem;"><i class="fa-solid fa-code"></i> Web Dev</span>' : ''}</div>
                            <div class="u-sub">${esc(u.email)}</div>
                        </div>
                    </div>
                </td>
                <td><span class="pill pill-${esc(u.role)}">${esc(u.role)}</span></td>
                <td>${u.is_verified ? '<span class="pill pill-verified"><i class="fa-solid fa-check"></i> Verified</span>' : '<span class="pill pill-unverified">Unverified</span>'}</td>
                <td style="color:var(--text-muted);">${fmtDate(u.created_at)}</td>
                <td>
                    <div class="action-group">
                        ${!u.is_verified && !isWebDev ? `<button class="icon-btn" data-user-verify="${u._id}" title="Manually verify"><i class="fa-solid fa-check"></i></button>` : ''}
                        <button class="icon-btn" data-user-role="${u._id}" title="Change role"${(isOwner || isWebDev) ? ' disabled' : ''}><i class="fa-solid fa-shield"></i></button>
                        <button class="icon-btn danger" data-user-del="${u._id}" title="Delete user"${(isSelf || isOwner || isWebDev) ? ' disabled' : ''}><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="admin-empty"><p>${esc(err.message)}</p></div></td></tr>`;
    }
}

document.addEventListener('click', async (e) => {
    const verify = e.target.closest('[data-user-verify]');
    const role = e.target.closest('[data-user-role]');
    const del = e.target.closest('[data-user-del]');
    if (verify) { await verifyUser(verify.getAttribute('data-user-verify')); }
    if (role)   { await changeUserRole(role.getAttribute('data-user-role')); }
    if (del)    { await deleteUser(del.getAttribute('data-user-del')); }
});

async function verifyUser(id) {
    try {
        await api(`/api/admin/users/${id}/verify`, { method: 'PUT' });
        toast('User verified');
        await loadUsers();
        loadDashboard(); // refresh counts in background
    } catch (err) { toast(err.message, 'error'); }
}

function changeUserRole(id) {
    openModal('Change Role', `
        <div class="admin-field">
            <label>Select new role</label>
            <select class="admin-select" id="role-select">
                <option value="user">User (regular member)</option>
                <option value="admin">Admin (panel access)</option>
                <option value="owner">Owner (full control)</option>
            </select>
        </div>
        <div class="admin-modal-actions">
            <button type="button" class="btn-secondary-admin" id="rf-cancel">Cancel</button>
            <button type="button" class="btn-add" id="rf-ok">Apply</button>
        </div>
    `);
    document.getElementById('rf-cancel').onclick = closeModal;
    document.getElementById('rf-ok').onclick = async () => {
        const newRole = document.getElementById('role-select').value;
        try {
            await api(`/api/admin/users/${id}/role`, { method: 'PUT', body: { role: newRole } });
            toast('Role updated');
            closeModal();
            await loadUsers();
        } catch (err) { toast(err.message, 'error'); }
    };
}

async function deleteUser(id) {
    const ok = await confirmModal({
        title: 'Delete user account',
        message: 'This permanently deletes the account and its login. This cannot be undone.',
        confirmText: 'Delete'
    });
    if (!ok) return;
    try {
        await api(`/api/admin/users/${id}`, { method: 'DELETE' });
        toast('User deleted');
        await loadUsers();
        loadDashboard();
    } catch (err) { toast(err.message, 'error'); }
}

/* ============ 8a. HOME POSTS ============ */
let homePostsCache = [];
async function loadHomePosts() {
    const list = document.getElementById('homeposts-list');
    list.innerHTML = '<div class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    try {
        homePostsCache = await api('/api/homeposts');
        if (homePostsCache.length === 0) {
            list.innerHTML = `<div class="admin-empty"><i class="fa-solid fa-newspaper"></i><p>No home posts yet. Click "Add Post".</p></div>`;
            return;
        }
        list.innerHTML = homePostsCache.map(p => `
            <div class="panel-card">
                <div style="display:flex; justify-content:space-between; gap:15px; align-items:flex-start; flex-wrap:wrap;">
                    <div style="flex:1; min-width:240px;">
                        <h3 style="margin-bottom:6px; color:var(--text-main); font-size:1.15rem;">${esc(p.title)}</h3>
                        <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:10px;">
                            <i class="fa-solid fa-clock"></i> ${fmtDate(p.created_at)}
                        </div>
                        <p style="color:var(--text-muted); white-space:pre-wrap; line-height:1.6;">${esc(p.body)}</p>
                        ${p.image_url ? `<img src="${p.image_url}" alt="Post image" style="max-height:150px; display:block; margin-top:10px; border-radius:6px; border:1px solid #333;">` : ''}
                    </div>
                    <div class="action-group" style="flex-shrink:0;">
                        <button class="icon-btn" data-homepost-edit="${p.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                        <button class="icon-btn danger" data-homepost-del="${p.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>`).join('');
    } catch (err) {
        list.innerHTML = `<div class="admin-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>${esc(err.message)}</p></div>`;
    }
}

document.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-homepost-edit]');
    const del = e.target.closest('[data-homepost-del]');
    if (edit) { openHomePostForm(homePostsCache.find(p => p.id == edit.getAttribute('data-homepost-edit'))); }
    if (del) { await deleteHomePost(del.getAttribute('data-homepost-del')); }
});

async function deleteHomePost(id) {
    const ok = await confirmModal({ title: 'Delete home post', message: 'Permanently remove this post from the home screen?', confirmText: 'Delete' });
    if (!ok) return;
    try {
        await api(`/api/admin/homeposts/${id}`, { method: 'DELETE' });
        toast('Post deleted');
        await loadHomePosts();
    } catch (err) { toast(err.message, 'error'); }
}

document.querySelector('[data-action="add-homepost"]').addEventListener('click', () => openHomePostForm(null));

function openHomePostForm(existing) {
    const isEdit = !!existing;
    openModal(isEdit ? 'Edit Home Post' : 'Add Home Post', `
        <form id="homepost-form">
            <div class="admin-field">
                <label>Title *</label>
                <input class="admin-input" name="title" required value="${esc(existing?.title || '')}">
            </div>
            <div class="admin-field">
                <label>Body *</label>
                <textarea class="admin-textarea" name="body" required placeholder="Write news body...">${esc(existing?.body || '')}</textarea>
            </div>
            <div class="admin-field">
                <label>Post Image (Optional)</label>
                <input type="file" class="admin-input" name="image" accept="image/*">
            </div>
            <div class="admin-modal-actions">
                <button type="button" class="btn-secondary-admin" id="hpf-cancel">Cancel</button>
                <button type="submit" class="btn-add">${isEdit ? 'Save Changes' : 'Publish'}</button>
            </div>
        </form>
    `);
    document.getElementById('hpf-cancel').onclick = closeModal;
    document.getElementById('homepost-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        try {
            if (isEdit) {
                await api(`/api/admin/homeposts/${existing.id}`, { method: 'PUT', body: fd });
                toast('Post updated');
            } else {
                await api('/api/admin/homeposts', { method: 'POST', body: fd });
                toast('Post published');
            }
            closeModal();
            await loadHomePosts();
        } catch (err) { toast(err.message, 'error'); }
    });
}

/* ============ 8b. SLIDES ============ */
let slidesCache = [];
async function loadSlides() {
    const tbody = document.getElementById('slides-tbody');
    tbody.innerHTML = '<tr><td colspan="5"><div class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i></div></td></tr>';
    try {
        slidesCache = await api('/api/slides');
        renderSlides();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty"><p>${esc(err.message)}</p></div></td></tr>`;
    }
}

function renderSlides() {
    const tbody = document.getElementById('slides-tbody');
    if (slidesCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty"><i class="fa-solid fa-images"></i><p>No slides yet. Click "Add Slide".</p></div></td></tr>`;
        return;
    }
    tbody.innerHTML = slidesCache.map((s, i) => `
        <tr>
            <td><span class="rank-badge">${i + 1}</span></td>
            <td>
                <div class="user-cell">
                    ${s.image_url ? `<img class="row-avatar" src="${s.image_url}" alt="" style="border-radius:4px; object-fit:cover;">` : ''}
                    <span class="u-name">${esc(s.title)}</span>
                </div>
            </td>
            <td>${esc(s.description || '')}</td>
            <td>${s.order}</td>
            <td>
                <div class="action-group">
                    <button class="icon-btn" data-slide-edit="${s.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="icon-btn danger" data-slide-del="${s.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`).join('');
}

document.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-slide-edit]');
    const del = e.target.closest('[data-slide-del]');
    if (edit) { openSlideForm(slidesCache.find(x => x.id == edit.getAttribute('data-slide-edit'))); }
    if (del)  { await deleteSlide(del.getAttribute('data-slide-del')); }
});

async function deleteSlide(id) {
    const ok = await confirmModal({ title: 'Delete slide', message: 'Permanently remove this slide?', confirmText: 'Delete' });
    if (!ok) return;
    try {
        await api(`/api/admin/slides/${id}`, { method: 'DELETE' });
        toast('Slide removed');
        await loadSlides();
    } catch (err) { toast(err.message, 'error'); }
}

document.querySelector('[data-action="add-slide"]').addEventListener('click', () => openSlideForm(null));

function openSlideForm(existing) {
    const isEdit = !!existing;
    openModal(isEdit ? 'Edit Slide' : 'Add Slide', `
        <form id="slide-form">
            <div class="admin-field">
                <label>Title *</label>
                <input class="admin-input" name="title" required value="${esc(existing?.title || '')}">
            </div>
            <div class="admin-field">
                <label>Description</label>
                <textarea class="admin-textarea" name="description" placeholder="Description text">${esc(existing?.description || '')}</textarea>
            </div>
            <div class="admin-field">
                <label>Order (Numerical)</label>
                <input class="admin-input" type="number" name="order" value="${existing?.order ?? 0}">
            </div>
            <div class="admin-field">
                <label>Slide Background Image *</label>
                <input type="file" class="admin-input" name="image" accept="image/*" ${isEdit ? '' : 'required'}>
            </div>
            <div class="admin-modal-actions">
                <button type="button" class="btn-secondary-admin" id="slf-cancel">Cancel</button>
                <button type="submit" class="btn-add">${isEdit ? 'Save Changes' : 'Add Slide'}</button>
            </div>
        </form>
    `);
    document.getElementById('slf-cancel').onclick = closeModal;
    document.getElementById('slide-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        try {
            if (isEdit) await api(`/api/admin/slides/${existing.id}`, { method: 'PUT', body: fd });
            else await api('/api/admin/slides', { method: 'POST', body: fd });
            closeModal();
            toast('Slide saved');
            await loadSlides();
        } catch (err) { toast(err.message, 'error'); }
    });
}

/* ============ START ============ */
boot();
