/**
 * TheBeacon Theme System
 * Handles dark/light toggle, color theme picker, sidebar collapse,
 * and Easter egg animations (matrix rain, flying bees).
 */
(function() {
    'use strict';

    const STORAGE_KEYS = {
        theme: 'thebeacon-theme',
        colorTheme: 'thebeacon-color-theme',
        sidebarCollapsed: 'thebeacon-sidebar-collapsed',
    };

    // --- Dark/Light Toggle ---
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem(STORAGE_KEYS.theme, next);
        });
    }

    // --- Color Theme Picker ---
    const picker = document.getElementById('color-theme-picker');
    if (picker) {
        const swatches = picker.querySelectorAll('.theme-swatch');
        const currentColor = localStorage.getItem(STORAGE_KEYS.colorTheme) || '';

        // Mark current swatch as active
        swatches.forEach(s => {
            if (s.dataset.color === currentColor) {
                s.classList.add('active');
            }
        });

        picker.addEventListener('click', (e) => {
            const swatch = e.target.closest('.theme-swatch');
            if (!swatch) return;

            const color = swatch.dataset.color;

            // Update active state
            swatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');

            // Apply color theme
            if (color) {
                document.documentElement.setAttribute('data-color-theme', color);
            } else {
                document.documentElement.removeAttribute('data-color-theme');
            }
            localStorage.setItem(STORAGE_KEYS.colorTheme, color);

            // Toggle Easter eggs
            handleMatrixRain(color === 'matrix');
            handleBeeAnimation(color === 'bee');
        });

        // Initialize Easter eggs on page load
        handleMatrixRain(currentColor === 'matrix');
        handleBeeAnimation(currentColor === 'bee');
    }

    // --- Sidebar Collapse Toggle ---
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidePanel = document.getElementById('side-panel');

    if (sidebarToggle && sidePanel) {
        // Remove the no-transition class after initial load
        requestAnimationFrame(() => {
            document.documentElement.classList.remove('sidebar-collapsed');
            if (localStorage.getItem(STORAGE_KEYS.sidebarCollapsed) === 'true') {
                sidePanel.classList.add('collapsed');
            }
        });

        sidebarToggle.addEventListener('click', () => {
            const isCollapsed = sidePanel.classList.toggle('collapsed');
            localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, isCollapsed);
        });
    }

    // --- Matrix Rain Easter Egg ---
    let matrixAnimationId = null;

    function handleMatrixRain(active) {
        const canvas = document.getElementById('matrix-rain');
        if (!canvas) return;

        if (!active) {
            if (matrixAnimationId) {
                cancelAnimationFrame(matrixAnimationId);
                matrixAnimationId = null;
            }
            return;
        }

        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const columns = Math.floor(canvas.width / 20);
        const drops = new Array(columns).fill(1);
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()';

        function draw() {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#00ff41';
            ctx.font = '15px monospace';

            for (let i = 0; i < drops.length; i++) {
                const text = chars[Math.floor(Math.random() * chars.length)];
                ctx.fillText(text, i * 20, drops[i] * 20);

                if (drops[i] * 20 > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }

            matrixAnimationId = requestAnimationFrame(draw);
        }

        draw();

        // Handle resize
        window.addEventListener('resize', () => {
            if (matrixAnimationId) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
        });
    }

    // --- Bee Easter Egg ---
    let beeIntervalId = null;

    function handleBeeAnimation(active) {
        const container = document.getElementById('bee-container');
        if (!container) return;

        if (!active) {
            if (beeIntervalId) {
                clearInterval(beeIntervalId);
                beeIntervalId = null;
            }
            container.innerHTML = '';
            return;
        }

        function createBee() {
            const bee = document.createElement('div');
            bee.className = 'bee';
            bee.textContent = '\uD83D\uDC1D';  // Bee emoji
            bee.style.left = '-30px';
            bee.style.top = Math.random() * (window.innerHeight - 50) + 'px';
            bee.style.fontSize = (18 + Math.random() * 16) + 'px';
            bee.style.opacity = '0.7';
            container.appendChild(bee);

            const duration = 8000 + Math.random() * 6000;
            const amplitude = 30 + Math.random() * 50;
            const startY = parseFloat(bee.style.top);
            const startTime = Date.now();

            function animateBee() {
                const elapsed = Date.now() - startTime;
                const progress = elapsed / duration;

                if (progress >= 1) {
                    bee.remove();
                    return;
                }

                const x = progress * (window.innerWidth + 60) - 30;
                const y = startY + Math.sin(progress * Math.PI * 4) * amplitude;

                bee.style.left = x + 'px';
                bee.style.top = y + 'px';
                bee.style.opacity = String(0.3 + Math.sin(progress * Math.PI) * 0.5);

                requestAnimationFrame(animateBee);
            }

            requestAnimationFrame(animateBee);
        }

        // Create a bee every few seconds
        createBee();
        beeIntervalId = setInterval(createBee, 3000 + Math.random() * 2000);
    }
})();
