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

    // --- Matrix Rain Easter Egg ---
    var matrixTimerId = null;
    var matrixResizeHandler = null;

    function handleMatrixRain(active) {
        var canvas = document.getElementById('matrix-rain');
        if (!canvas) return;

        if (!active) {
            if (matrixTimerId) {
                clearInterval(matrixTimerId);
                matrixTimerId = null;
            }
            if (matrixResizeHandler) {
                window.removeEventListener('resize', matrixResizeHandler);
                matrixResizeHandler = null;
            }
            var clearCtx = canvas.getContext('2d');
            clearCtx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        var ctx = canvas.getContext('2d');
        var fontSize = 18;
        var colWidth = fontSize;

        // Half-width Katakana + digits + some Latin (classic Matrix look)
        var katakana = '\uff66\uff67\uff68\uff69\uff6a\uff6b\uff6c\uff6d\uff6e\uff6f\uff70\uff71\uff72\uff73\uff74\uff75\uff76\uff77\uff78\uff79\uff7a\uff7b\uff7c\uff7d\uff7e\uff7f\uff80\uff81\uff82\uff83\uff84\uff85\uff86\uff87\uff88\uff89\uff8a\uff8b\uff8c\uff8d\uff8e\uff8f\uff90\uff91\uff92\uff93\uff94\uff95\uff96';
        var digits = '0123456789';
        var latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        var chars = katakana + digits + latin;

        function initCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        initCanvas();
        var numCols = Math.floor(canvas.width / colWidth);

        // Each column tracks its drop position and speed
        var columns = [];
        for (var i = 0; i < numCols; i++) {
            columns.push({
                y: Math.random() * -50,               // stagger start positions
                speed: 0.3 + Math.random() * 0.7,     // varying fall speed
                trailLen: 8 + Math.floor(Math.random() * 20),
            });
        }

        function draw() {
            // Semi-transparent black overlay creates the fade trail
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = fontSize + 'px monospace';

            for (var i = 0; i < columns.length; i++) {
                var col = columns[i];
                var x = i * colWidth;
                var yPos = Math.floor(col.y) * fontSize;
                var ch = chars[Math.floor(Math.random() * chars.length)];

                // Bright white-green head character
                ctx.fillStyle = '#ceffce';
                ctx.fillText(ch, x, yPos);

                // Slightly dimmer character just behind the head
                if (col.y > 1) {
                    var trailChar = chars[Math.floor(Math.random() * chars.length)];
                    ctx.fillStyle = '#00ff41';
                    ctx.fillText(trailChar, x, yPos - fontSize);
                }

                // Advance the drop
                col.y += col.speed;

                // Reset when the column falls off screen (with random delay)
                if (yPos > canvas.height + col.trailLen * fontSize) {
                    col.y = Math.random() * -20;
                    col.speed = 0.3 + Math.random() * 0.7;
                    col.trailLen = 8 + Math.floor(Math.random() * 20);
                }
            }
        }

        // Run at ~20fps for the classic slow cascade feel
        matrixTimerId = setInterval(draw, 50);

        // Handle resize
        matrixResizeHandler = function() {
            if (matrixTimerId) {
                initCanvas();
            }
        };
        window.addEventListener('resize', matrixResizeHandler);
    }

    // --- Bee Easter Egg (the full experience) ---
    var beeTimers = [];

    function handleBeeAnimation(active) {
        var container = document.getElementById('bee-container');
        if (!container) return;

        if (!active) {
            beeTimers.forEach(function(id) { clearInterval(id); clearTimeout(id); });
            beeTimers = [];
            container.innerHTML = '';
            return;
        }

        var W = window.innerWidth;
        var H = window.innerHeight;
        window.addEventListener('resize', function() { W = window.innerWidth; H = window.innerHeight; });

        // ========================
        //  UTILITY
        // ========================
        function rand(min, max) { return min + Math.random() * (max - min); }
        function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
        function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
        function smoothstep(t) { return t * t * (3 - 2 * t); }
        function clampY(y) { return Math.max(10, Math.min(H - 30, y)); }

        // ========================
        //  POLLEN PARTICLES
        // ========================
        function spawnPollen(x, y) {
            var dot = document.createElement('div');
            dot.className = 'bee-pollen';
            dot.style.left = x + 'px';
            dot.style.top = y + 'px';
            container.appendChild(dot);
            // CSS animation handles fade + drift, remove after animation
            setTimeout(function() { dot.remove(); }, 1200);
        }

        // ========================
        //  FLOATING FLOWERS & HONEYCOMBS
        // ========================
        var flowerEmojis = ['\uD83C\uDF3B', '\uD83C\uDF3A', '\uD83C\uDF38', '\uD83C\uDF3C', '\uD83C\uDF37'];
        // 🌻 🌺 🌸 🌼 🌷
        var honeycombEmojis = ['\uD83C\uDF6F']; // 🍯
        var activeFlowers = [];

        function createFlower() {
            if (activeFlowers.length >= 5) return; // Max on screen

            var isHoneycomb = Math.random() < 0.35;
            var flower = document.createElement('div');
            flower.className = isHoneycomb ? 'bee-flower bee-flower--honeycomb' : 'bee-flower';
            flower.textContent = isHoneycomb ? pick(honeycombEmojis) : pick(flowerEmojis);
            var fx = rand(150, W - 100);
            var fy = rand(100, H - 100);
            flower.style.left = fx + 'px';
            flower.style.top = fy + 'px';
            flower.style.fontSize = rand(24, 40) + 'px';
            container.appendChild(flower);

            var flowerObj = { el: flower, x: fx, y: fy };
            activeFlowers.push(flowerObj);

            // Flowers live for 12-20 seconds then fade away
            var lifespan = rand(12000, 20000);
            setTimeout(function() {
                flower.classList.add('bee-flower--fading');
                setTimeout(function() {
                    flower.remove();
                    var idx = activeFlowers.indexOf(flowerObj);
                    if (idx > -1) activeFlowers.splice(idx, 1);
                }, 1000);
            }, lifespan);
        }

        // ========================
        //  FLIGHT PATTERNS
        // ========================
        var patterns = {
            // Gentle sine wave
            wave: function(p, cfg) {
                var x = cfg.startX + (cfg.endX - cfg.startX) * p;
                var y = cfg.startY + Math.sin(p * Math.PI * cfg.waves) * cfg.amplitude;
                var angle = Math.sin(p * Math.PI * cfg.waves * 2) * 12;
                return { x: x, y: y, angle: angle };
            },
            // Loop-de-loops
            loopy: function(p, cfg) {
                var baseX = cfg.startX + (cfg.endX - cfg.startX) * p;
                var baseY = cfg.startY + Math.sin(p * Math.PI * 2) * cfg.amplitude * 0.3;
                var loopPhase = p * Math.PI * 2 * cfg.loops;
                var r = cfg.loopRadius;
                return {
                    x: baseX + Math.sin(loopPhase) * r,
                    y: baseY - Math.cos(loopPhase) * r + r,
                    angle: Math.cos(loopPhase) * 35
                };
            },
            // Zigzag
            zigzag: function(p, cfg) {
                var x = cfg.startX + (cfg.endX - cfg.startX) * p;
                var segLen = 1 / cfg.zigs;
                var seg = Math.floor(p / segLen);
                var segP = (p % segLen) / segLen;
                var yTarget = (seg % 2 === 0) ? cfg.startY - cfg.amplitude : cfg.startY + cfg.amplitude;
                var yFrom = (seg % 2 === 0) ? cfg.startY + cfg.amplitude : cfg.startY - cfg.amplitude;
                return { x: x, y: yFrom + (yTarget - yFrom) * segP, angle: (seg % 2 === 0) ? -25 : 25 };
            },
            // Hover then dart
            hover: function(p, cfg) {
                var phase = (p * cfg.darts) % 1;
                var dartIdx = Math.floor(p * cfg.darts);
                var spot = cfg.spots[Math.min(dartIdx, cfg.spots.length - 1)];
                var nextSpot = cfg.spots[Math.min(dartIdx + 1, cfg.spots.length - 1)];
                if (phase < 0.7) {
                    var h = phase / 0.7;
                    return {
                        x: spot.x + Math.sin(h * Math.PI * 6) * 6,
                        y: spot.y + Math.cos(h * Math.PI * 8) * 5,
                        angle: Math.sin(h * Math.PI * 6) * 12
                    };
                } else {
                    var d = smoothstep((phase - 0.7) / 0.3);
                    return {
                        x: spot.x + (nextSpot.x - spot.x) * d,
                        y: spot.y + (nextSpot.y - spot.y) * d,
                        angle: (nextSpot.x > spot.x) ? -18 : 18
                    };
                }
            },
            // Lazy spiral
            spiral: function(p, cfg) {
                var baseX = cfg.startX + (cfg.endX - cfg.startX) * p;
                var phase = p * Math.PI * 2 * cfg.spirals;
                var r = cfg.spiralRadius * (0.5 + Math.sin(p * Math.PI) * 0.5);
                return {
                    x: baseX + Math.cos(phase) * r,
                    y: cfg.startY + Math.sin(phase) * r,
                    angle: Math.cos(phase) * 25
                };
            },
            // Waggle dance (figure-8) — bee communication!
            waggle: function(p, cfg) {
                var centerX = cfg.startX + (cfg.endX - cfg.startX) * p;
                var t = p * Math.PI * 2 * cfg.waggleCount;
                // Lemniscate of Bernoulli (figure-8)
                var scale = cfg.waggleSize;
                var denom = 1 + Math.sin(t) * Math.sin(t);
                var lx = scale * Math.cos(t) / denom;
                var ly = scale * Math.sin(t) * Math.cos(t) / denom;
                return {
                    x: centerX + lx,
                    y: cfg.startY + ly,
                    angle: Math.cos(t) * 30
                };
            },
            // Drunken bumble — erratic, jerky movement
            drunken: function(p, cfg) {
                var x = cfg.startX + (cfg.endX - cfg.startX) * p;
                var y = cfg.startY;
                // Layer multiple sine waves at odd frequencies for chaos
                for (var i = 0; i < cfg.freqs.length; i++) {
                    y += Math.sin(p * Math.PI * cfg.freqs[i] + cfg.phases[i]) * cfg.amps[i];
                }
                var angle = Math.sin(p * Math.PI * 13) * 25 + Math.cos(p * Math.PI * 7) * 15;
                return { x: x, y: y, angle: angle };
            },
            // Dive bomb — swoop down then back up
            divebomb: function(p, cfg) {
                var x = cfg.startX + (cfg.endX - cfg.startX) * p;
                var y = cfg.startY;
                // Dive at the dive point, recover after
                var diveCenter = cfg.diveAt;
                var diveWidth = 0.15;
                var dist = Math.abs(p - diveCenter);
                if (dist < diveWidth) {
                    var diveP = 1 - dist / diveWidth;
                    y += diveP * diveP * cfg.diveDepth;
                }
                // Gentle wave otherwise
                y += Math.sin(p * Math.PI * 3) * 20;
                var angle = (p > diveCenter - diveWidth && p < diveCenter) ? 35 :
                            (p > diveCenter && p < diveCenter + diveWidth) ? -35 : Math.sin(p * 10) * 8;
                return { x: x, y: y, angle: angle };
            },
            // Visit flowers — bee flies to each active flower then exits
            pollinate: function(p, cfg) {
                var numStops = cfg.flowerStops.length;
                var segLen = 1 / (numStops + 1); // +1 for exit
                var seg = Math.min(Math.floor(p / segLen), numStops);
                var segP = (p - seg * segLen) / segLen;

                var from, to;
                if (seg === 0) {
                    from = { x: cfg.startX, y: cfg.startY };
                    to = cfg.flowerStops[0] || { x: cfg.endX, y: cfg.startY };
                } else if (seg < numStops) {
                    from = cfg.flowerStops[seg - 1];
                    to = cfg.flowerStops[seg];
                } else {
                    from = cfg.flowerStops[numStops - 1] || { x: cfg.startX, y: cfg.startY };
                    to = { x: cfg.endX, y: cfg.startY };
                }

                // Hover briefly at each stop (ease in/out)
                var ease = smoothstep(segP);
                var x = from.x + (to.x - from.x) * ease;
                var y = from.y + (to.y - from.y) * ease;
                // Arc upward between stops
                var arc = Math.sin(segP * Math.PI) * -60;
                y += arc;
                var angle = Math.sin(segP * Math.PI * 4) * 10;
                return { x: x, y: y, angle: angle };
            }
        };

        var patternNames = ['wave', 'wave', 'loopy', 'zigzag', 'hover', 'spiral',
                            'waggle', 'drunken', 'divebomb', 'pollinate'];

        // ========================
        //  BEE FACTORY
        // ========================
        function createBee(opts) {
            opts = opts || {};
            var bee = document.createElement('div');
            bee.className = 'bee bee--buzzing';
            bee.textContent = '\uD83D\uDC1D';
            bee.style.position = 'absolute';
            bee.style.zIndex = '10000';

            // Size variety: tiny worker, normal, or chonky queen
            var sizeRoll = Math.random();
            var size;
            if (sizeRoll < 0.15) {
                size = rand(14, 18);  // tiny baby bee
                bee.classList.add('bee--tiny');
            } else if (sizeRoll > 0.92) {
                size = rand(36, 48);  // QUEEN
                bee.classList.add('bee--queen');
            } else {
                size = rand(20, 32);  // normal worker
            }
            bee.style.fontSize = size + 'px';
            container.appendChild(bee);

            // Direction
            var goingRight = opts.goingRight !== undefined ? opts.goingRight : (Math.random() > 0.4);
            var margin = 60;
            var startX = goingRight ? -margin : W + margin;
            var endX = goingRight ? W + margin : -margin;
            var startY = rand(50, H - 80);

            // Pattern
            var patName = opts.pattern || pick(patternNames);
            var cfg = { startX: startX, endX: endX, startY: startY };

            // Pattern-specific config
            if (patName === 'wave') {
                cfg.amplitude = rand(30, 100);
                cfg.waves = rand(2, 6);
            } else if (patName === 'loopy') {
                cfg.amplitude = rand(40, 70);
                cfg.loops = randInt(2, 4);
                cfg.loopRadius = rand(25, 50);
            } else if (patName === 'zigzag') {
                cfg.amplitude = rand(40, 100);
                cfg.zigs = randInt(4, 9);
            } else if (patName === 'hover') {
                cfg.darts = randInt(3, 6);
                cfg.spots = [];
                for (var s = 0; s <= cfg.darts; s++) {
                    cfg.spots.push({ x: rand(margin, W - margin), y: rand(60, H - 80) });
                }
            } else if (patName === 'spiral') {
                cfg.spirals = rand(2, 4);
                cfg.spiralRadius = rand(30, 60);
            } else if (patName === 'waggle') {
                cfg.waggleCount = randInt(3, 6);
                cfg.waggleSize = rand(50, 100);
            } else if (patName === 'drunken') {
                cfg.freqs = [rand(5, 9), rand(11, 17), rand(19, 27)];
                cfg.phases = [rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)];
                cfg.amps = [rand(20, 50), rand(15, 35), rand(10, 20)];
            } else if (patName === 'divebomb') {
                cfg.diveAt = rand(0.3, 0.7);
                cfg.diveDepth = rand(120, 250);
            } else if (patName === 'pollinate') {
                cfg.flowerStops = [];
                // Visit up to 3 active flowers
                var shuffled = activeFlowers.slice().sort(function() { return Math.random() - 0.5; });
                for (var f = 0; f < Math.min(shuffled.length, 3); f++) {
                    cfg.flowerStops.push({ x: shuffled[f].x, y: shuffled[f].y });
                }
                if (cfg.flowerStops.length === 0) {
                    // No flowers? Just wave instead
                    patName = 'wave';
                    cfg.amplitude = rand(30, 80);
                    cfg.waves = rand(2, 5);
                }
            }

            var duration = rand(7000, 16000);
            if (patName === 'hover') duration = rand(10000, 18000);
            if (patName === 'pollinate') duration = rand(8000, 14000);
            var startTime = Date.now();
            var flipBase = goingRight ? 'scaleX(-1)' : 'scaleX(1)';
            var pollenCounter = 0;
            var lastPollenX = 0;
            var lastPollenY = 0;

            // Patterns that stay mid-screen need a longer fade-out
            var staysOnScreen = (patName === 'hover' || patName === 'waggle' || patName === 'pollinate');
            var fadeOutStart = staysOnScreen ? 0.78 : 0.88;
            var fadeOutLen = 1 - fadeOutStart;
            var pollenCutoff = fadeOutStart - 0.05;

            function animateBee() {
                var elapsed = Date.now() - startTime;
                var p = Math.min(elapsed / duration, 1);

                if (p >= 1) {
                    bee.remove();
                    return;
                }

                var pos = patterns[patName](p, cfg);
                var y = clampY(pos.y);
                var x = pos.x;

                // Also remove if the bee has flown off-screen (for cross-screen patterns)
                if (!staysOnScreen && p > 0.3) {
                    if (x < -80 || x > W + 80) {
                        bee.remove();
                        return;
                    }
                }

                bee.style.left = x + 'px';
                bee.style.top = y + 'px';

                // For hover pattern, flip based on movement direction
                var flip = flipBase;
                if (patName === 'hover' || patName === 'pollinate' || patName === 'waggle') {
                    var dx = x - lastPollenX;
                    if (Math.abs(dx) > 2) {
                        flip = dx > 0 ? 'scaleX(-1)' : 'scaleX(1)';
                    }
                }

                bee.style.transform = flip + ' rotate(' + (pos.angle || 0) + 'deg)';

                // Fade in/out — fully transparent at both ends
                var fade = 1;
                if (p < 0.06) fade = p / 0.06;
                else if (p > fadeOutStart) fade = (1 - p) / fadeOutLen;
                bee.style.opacity = String(fade * 0.9);

                // Drop pollen particles (stop before fade-out to avoid ghost trails)
                if (p < pollenCutoff) {
                    pollenCounter++;
                    if (pollenCounter % 6 === 0) {
                        var dist = Math.sqrt(Math.pow(x - lastPollenX, 2) + Math.pow(y - lastPollenY, 2));
                        if (dist > 40) {
                            spawnPollen(x + rand(-5, 5), y + rand(5, 15));
                            lastPollenX = x;
                            lastPollenY = y;
                        }
                    }
                }

                requestAnimationFrame(animateBee);
            }

            lastPollenX = startX;
            lastPollenY = startY;
            requestAnimationFrame(animateBee);
        }

        // ========================
        //  SWARM BURST
        // ========================
        function triggerSwarm() {
            var count = randInt(5, 10);
            var goingRight = Math.random() > 0.5;
            for (var i = 0; i < count; i++) {
                (function(delay) {
                    var t = setTimeout(function() {
                        createBee({ goingRight: goingRight, pattern: pick(['wave', 'drunken', 'zigzag']) });
                    }, delay);
                    beeTimers.push(t);
                })(i * rand(80, 250));
            }
        }

        // ========================
        //  SCHEDULING
        // ========================

        // Regular bee spawning
        var beeSpawnId = setInterval(function() {
            createBee();
        }, rand(1800, 3200));
        beeTimers.push(beeSpawnId);

        // Flower spawning
        var flowerSpawnId = setInterval(function() {
            createFlower();
        }, rand(6000, 10000));
        beeTimers.push(flowerSpawnId);

        // Occasional swarm burst
        var swarmId = setInterval(function() {
            if (Math.random() < 0.3) triggerSwarm();
        }, 15000);
        beeTimers.push(swarmId);

        // Initial population
        createBee();
        setTimeout(function() { createBee(); }, 300);
        setTimeout(function() { createBee(); }, 900);
        setTimeout(function() { createFlower(); }, 1500);
    }

    // --- Dark/Light Toggle ---
    var themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            var current = document.documentElement.getAttribute('data-theme') || 'light';
            var next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem(STORAGE_KEYS.theme, next);
        });
    }

    // --- Color Theme Picker ---
    var picker = document.getElementById('color-theme-picker');
    if (picker) {
        var swatches = picker.querySelectorAll('.theme-swatch');
        var currentColor = localStorage.getItem(STORAGE_KEYS.colorTheme) || '';

        // Mark current swatch as active
        swatches.forEach(function(s) {
            if (s.dataset.color === currentColor) {
                s.classList.add('active');
            }
        });

        picker.addEventListener('click', function(e) {
            var swatch = e.target.closest('.theme-swatch');
            if (!swatch) return;

            var color = swatch.dataset.color;

            // Update active state
            swatches.forEach(function(s) { s.classList.remove('active'); });
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
    var sidebarToggle = document.getElementById('sidebar-toggle');
    var layoutEl = document.querySelector('.hivematrix-layout');

    if (sidebarToggle && layoutEl) {
        requestAnimationFrame(function() {
            document.documentElement.classList.remove('sidebar-collapsed');
            if (localStorage.getItem(STORAGE_KEYS.sidebarCollapsed) === 'true') {
                layoutEl.classList.add('sidebar-collapsed');
            }
        });

        sidebarToggle.addEventListener('click', function() {
            var isCollapsed = layoutEl.classList.toggle('sidebar-collapsed');
            localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, isCollapsed);
        });
    }
})();
