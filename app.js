document.addEventListener('DOMContentLoaded', () => {
    // 0. Login-aware navbar: if a user is signed in, swap Login/Register
    //    for a greeting + Logout, and add an Admin link for staff accounts.
    (function applyAuthNav() {
        let user = null;
        try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch { user = null; }

        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        if (!user || !loginBtn || !registerBtn) return; // not logged in, or not a full-site page

        const firstName = user.fname || user.username || 'Account';
        const isAdmin = user.role === 'admin' || user.role === 'owner' || user.role === 'webdev';

        // Replace the Register link with an Admin link for staff
        if (isAdmin) {
            registerBtn.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i> Admin';
            registerBtn.setAttribute('href', 'admin.html');
            registerBtn.id = 'admin-btn';
        } else {
            registerBtn.style.display = 'none';
        }

        // Replace the Login link with a greeting linking to profile
        loginBtn.innerHTML = '<i class="fa-solid fa-user"></i> Profile';
        loginBtn.setAttribute('href', 'profile.html');
    })();

    // 1. Carousel & Home Posts Dynamic Loading
    async function loadDynamicHomeContent() {
        const carousel = document.querySelector('.carousel');
        if (!carousel) return; // not home page

        try {
            // Load slides
            const slidesRes = await fetch('/api/slides');
            const dbSlides = await slidesRes.json();
            if (Array.isArray(dbSlides) && dbSlides.length > 0) {
                let slidesHtml = '';
                let indicatorsHtml = '';
                dbSlides.forEach((s, idx) => {
                    slidesHtml += `
                        <div class="carousel-slide ${idx === 0 ? 'active' : ''}" style="background-image: url('${s.image_url}');">
                            <div class="carousel-caption">
                                <h2 class="carousel-title">${escApp(s.title)}</h2>
                                <p class="carousel-desc">${escApp(s.description || '')}</p>
                            </div>
                        </div>`;
                    indicatorsHtml += `<div class="indicator ${idx === 0 ? 'active' : ''}" data-idx="${idx}"></div>`;
                });
                
                carousel.innerHTML = slidesHtml + `<div class="carousel-indicators">${indicatorsHtml}</div>`;
                setupCarouselActions();
            } else {
                setupCarouselActions(); // Fallback to static slides if empty
            }
        } catch (e) {
            console.error('Failed to load slides', e);
            setupCarouselActions(); // Fallback to static slides
        }

        // Load Home Posts
        const postsContainer = document.getElementById('home-posts-container');
        if (postsContainer) {
            try {
                const postsRes = await fetch('/api/homeposts');
                const posts = await postsRes.json();
                if (Array.isArray(posts) && posts.length > 0) {
                    postsContainer.innerHTML = posts.map(p => `
                        <article class="card" style="margin-bottom: 20px;">
                            <div style="padding: 20px;">
                                <h3 style="margin-top:0; color:#fff; font-size:1.3rem;">${escApp(p.title)}</h3>
                                <div style="color:var(--text-muted); font-size:0.8rem; margin-bottom:12px;">
                                    ${p.author_avatar ? `<img src="${p.author_avatar}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;">` : `<img src="https://minotar.net/avatar/${encodeURIComponent(p.author)}/20.png" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;">`}<span style="vertical-align:middle;margin-right:12px;font-weight:bold;color:var(--text-main);">${escApp(p.author)}</span> <i class="fa-solid fa-clock"></i> ${new Date(p.created_at).toLocaleDateString()}
                                </div>
                                <p style="color:#cbd5e1; line-height:1.6; white-space:pre-wrap;">${escApp(p.body)}</p>
                                ${p.image_url ? `<img src="${p.image_url}" alt="News image" style="max-width:100%; border-radius:6px; margin-top:15px; max-height:350px; object-fit:cover; display:block;">` : ''}
                            </div>
                        </article>`).join('');
                } else {
                    postsContainer.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);"><p>No news updates yet.</p></div>`;
                }
            } catch (err) {
                console.error(err);
                postsContainer.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);"><p>Failed to load server news.</p></div>`;
            }
        }
    }

    function escApp(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function setupCarouselActions() {
        const slides = document.querySelectorAll('.carousel-slide');
        const indicators = document.querySelectorAll('.indicator');
        if (!slides.length) return;
        let currentSlide = 0;
        const slideInterval = 5000;

        function showSlide(index) {
            slides.forEach(slide => slide.classList.remove('active'));
            indicators.forEach(ind => ind.classList.remove('active'));

            slides[index].classList.add('active');
            indicators[index].classList.add('active');
            currentSlide = index;
        }

        function nextSlide() {
            let next = (currentSlide + 1) % slides.length;
            showSlide(next);
        }

        let intervalId = setInterval(nextSlide, slideInterval);

        indicators.forEach((indicator, idx) => {
            indicator.addEventListener('click', () => {
                clearInterval(intervalId);
                showSlide(idx);
                intervalId = setInterval(nextSlide, slideInterval);
            });
        });
    }

    loadDynamicHomeContent();

    // 2. Clipboard Copy with Custom Toast
    const ipCard = document.getElementById('ip-card');
    const playIpBtn = document.getElementById('play-ip-btn');
    const toast = document.getElementById('toast');
    let currentServerIp = "play.zalrensmp.fun"; // fallback
    let currentServerVersion = "1.20.4"; // fallback

    function copyIP() {
        navigator.clipboard.writeText(currentServerIp).then(() => {
            showToast("Server IP Copied!");
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }

    if (ipCard) ipCard.addEventListener('click', copyIP);
    if (playIpBtn) playIpBtn.addEventListener('click', copyIP);

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }

    // 4. Connect to actual Minecraft Server Status API
    function fetchServerStats() {
        const playersOnlineVal = document.getElementById('players-online-val');
        const widgetPlayersVal = document.getElementById('widget-players-val');
        const serverBadge = document.getElementById('server-badge');
        const widgetVersionVal = document.getElementById('widget-version-val');
        
        fetch(`https://api.mcsrvstat.us/3/${currentServerIp}`)
            .then(response => response.json())
            .then(data => {
                if (data.online) {
                    const count = data.players ? data.players.online : 0;
                    const max   = data.players ? data.players.max   : 0;
                    const version = data.version || currentServerVersion;
                    
                    if (playersOnlineVal) playersOnlineVal.textContent = `${count} Online`;
                    if (widgetPlayersVal) widgetPlayersVal.textContent = `${count} / ${max}`;
                    if (serverBadge) {
                        serverBadge.textContent = 'Online';
                        serverBadge.style.background = '#00e5ff';
                        serverBadge.style.color = '#0a0e14';
                    }
                    if (widgetVersionVal) widgetVersionVal.textContent = version;
                } else {
                    if (playersOnlineVal) playersOnlineVal.textContent = 'Offline';
                    if (widgetPlayersVal) widgetPlayersVal.textContent = '0 / 0';
                    if (serverBadge) {
                        serverBadge.textContent = 'Offline';
                        serverBadge.style.background = '#ff1744';
                        serverBadge.style.color = '#fff';
                    }
                }
            })
            .catch(err => {
                console.warn('Could not query Minecraft server status API:', err);
                if (playersOnlineVal) playersOnlineVal.textContent = 'Offline';
                if (serverBadge) {
                    serverBadge.textContent = 'Offline';
                    serverBadge.style.background = '#ff1744';
                    serverBadge.style.color = '#fff';
                }
            });
    }

    // Load settings from API to get the dynamic IP, version, and hero banner
    fetch('/api/settings')
        .then(res => res.json())
        .then(settings => {
            if (settings) {
                if (settings.server_ip) {
                    currentServerIp = settings.server_ip;
                    document.querySelectorAll('.server-ip-display').forEach(el => {
                        el.textContent = currentServerIp;
                    });
                }
                if (settings.server_version) {
                    currentServerVersion = settings.server_version;
                    document.querySelectorAll('.server-version-display').forEach(el => {
                        el.textContent = currentServerVersion;
                    });
                }
                if (settings.hero_banner_url) {
                    const hero = document.querySelector('.hero-wrapper');
                    if (hero) {
                        hero.style.backgroundImage = `linear-gradient(to bottom, rgba(15, 17, 21, 0.4), var(--bg-color)), url('${settings.hero_banner_url}')`;
                    }
                }
            }
            fetchServerStats();
        })
        .catch(err => {
            console.error('Failed to load settings', err);
            fetchServerStats();
        });
    
    // Refresh Minecraft server status every 30s
    setInterval(fetchServerStats, 30000);
});
