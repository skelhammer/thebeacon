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
        easterEggsUnlocked: 'thebeacon-easter-eggs-unlocked',
    };

    function playBeeSwarmBuzz() {
        var audio = new Audio('/static/audio/bee-swarm.mp3');
        var playCount = 0;
        audio.addEventListener('ended', function() {
            playCount++;
            if (playCount < 3) {
                audio.currentTime = 0;
                audio.play().catch(function() {});
            }
        });
        audio.play().catch(function() {});
    }

    // --- Easter Egg Unlock (tap title 69 times) ---
    (function() {
        var picker = document.getElementById('color-theme-picker');
        if (!picker) return;

        // If already unlocked, reveal immediately
        if (localStorage.getItem(STORAGE_KEYS.easterEggsUnlocked) === 'true') {
            picker.classList.add('theme-picker--unlocked');
            return;
        }

        // Also auto-unlock if an easter egg theme is already active
        var currentColor = localStorage.getItem(STORAGE_KEYS.colorTheme) || '';
        if (currentColor === 'matrix' || currentColor === 'bee') {
            picker.classList.add('theme-picker--unlocked');
            localStorage.setItem(STORAGE_KEYS.easterEggsUnlocked, 'true');
            return;
        }

        var tapCount = 0;
        var tapTimer = null;
        var targets = document.querySelectorAll('.page-header__title, .side-panel__title');

        var hints = [
            { at: 5,  text: 'Hmm, that tickles...' },
            { at: 15, text: 'Ok, you\'re onto something. Keep going.' },
            { at: 30, text: 'Halfway there... don\'t stop now.' },
            { at: 50, text: 'Almost... just a bit more.' },
            { at: 60, text: 'So close! Keep clicking!' },
        ];

        function showHintToast(text) {
            // Remove any existing hint toast
            var old = document.querySelector('.easter-egg-toast');
            if (old) old.remove();
            var toast = document.createElement('div');
            toast.className = 'easter-egg-toast';
            toast.textContent = text;
            document.body.appendChild(toast);
            setTimeout(function() { toast.remove(); }, 2500);
        }

        targets.forEach(function(el) {
            el.style.cursor = 'default';
            el.addEventListener('click', function() {
                tapCount++;
                if (tapTimer) clearTimeout(tapTimer);
                tapTimer = setTimeout(function() { tapCount = 0; }, 30000);

                // Check for hint milestones
                for (var i = 0; i < hints.length; i++) {
                    if (tapCount === hints[i].at) {
                        showHintToast(hints[i].text);
                        break;
                    }
                }

                if (tapCount >= 69) {
                    tapCount = 0;

                    // Play Meridia's Beacon audio
                    var beaconAudio = new Audio('/static/audio/meridias-beacon.mp3');
                    beaconAudio.play().catch(function() {});

                    picker.classList.add('theme-picker--unlocked');
                    localStorage.setItem(STORAGE_KEYS.easterEggsUnlocked, 'true');

                    // Show toast
                    showHintToast('A NEW HAND TOUCHES THE BEACON');
                }
            });
        });
    })();

    // --- Konami Code Listener ---
    var konamiCallback = null;
    (function() {
        var konamiSeq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
        var konamiPos = 0;
        document.addEventListener('keydown', function(e) {
            if (e.key === konamiSeq[konamiPos]) {
                konamiPos++;
                if (konamiPos === konamiSeq.length) {
                    konamiPos = 0;
                    if (konamiCallback) {
                        konamiCallback();
                    } else {
                        // Default theme: disco mode
                        triggerDisco();
                    }
                }
            } else {
                konamiPos = 0;
            }
        });
    })();

    // --- Disco Mode (default Konami easter egg) ---
    function triggerDisco() {
        var colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#8800ff', '#ff00ff'];

        // Full-screen overlay for color flash (CSS variables block inline bg)
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99998;pointer-events:none;opacity:0.4;transition:background-color 0.12s;';
        document.body.appendChild(overlay);

        var cards = document.querySelectorAll('.card');
        cards.forEach(function(c) { c.style.transition = 'transform 0.15s'; });

        var count = 0;
        var discoTimer = setInterval(function() {
            overlay.style.backgroundColor = colors[count % colors.length];
            cards.forEach(function(c, i) {
                var angle = ((count + i) % 2 === 0) ? '2deg' : '-2deg';
                var scale = ((count + i) % 3 === 0) ? '1.02' : '0.98';
                c.style.transform = 'rotate(' + angle + ') scale(' + scale + ')';
            });
            count++;
            if (count > 30) {
                clearInterval(discoTimer);
                overlay.remove();
                cards.forEach(function(c) {
                    c.style.transform = '';
                    c.style.transition = '';
                });
            }
        }, 150);
    }

    // --- Ticket Count Spin (click 10 times) ---
    (function() {
        var countEl = document.getElementById('total-active-items-count');
        if (!countEl) return;
        var clickCount = 0;
        var clickTimer = null;
        countEl.style.cursor = 'default';
        countEl.addEventListener('click', function() {
            clickCount++;
            if (clickTimer) clearTimeout(clickTimer);
            clickTimer = setTimeout(function() { clickCount = 0; }, 4000);
            if (clickCount >= 10) {
                clickCount = 0;
                var rows = document.querySelectorAll('.card, .ticket-row, tr');
                rows.forEach(function(row, i) {
                    row.style.transition = 'transform 0.5s ease';
                    row.style.transform = 'rotate(360deg)';
                    setTimeout(function() {
                        row.style.transform = '';
                        setTimeout(function() { row.style.transition = ''; }, 500);
                    }, 1500 + i * 50);
                });
            }
        });
    })();

    // --- Matrix Rain Easter Egg ---
    var matrixTimerId = null;
    var matrixResizeHandler = null;
    var matrixEasterEggTimers = [];
    var matrixClickHandler = null;
    var matrixMoveHandler = null;
    var matrixSpoonHandler = null;

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
            // Clean up easter egg timers
            matrixEasterEggTimers.forEach(function(id) { clearInterval(id); clearTimeout(id); });
            matrixEasterEggTimers = [];
            // Clean up event listeners
            if (matrixClickHandler) {
                document.removeEventListener('click', matrixClickHandler);
                matrixClickHandler = null;
            }
            if (matrixMoveHandler) {
                document.removeEventListener('mousemove', matrixMoveHandler);
                matrixMoveHandler = null;
            }
            if (matrixSpoonHandler) {
                document.removeEventListener('keypress', matrixSpoonHandler);
                matrixSpoonHandler = null;
            }
            konamiCallback = null;
            // Remove leftover easter egg elements
            document.querySelectorAll('.matrix-quote, .matrix-click-char, .matrix-trail-char, .matrix-click-overlay, .matrix-rabbit').forEach(function(el) { el.remove(); });
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

        // Each column tracks its drop position, speed, and last drawn cell
        var columns = [];

        function buildColumns(count) {
            var cols = [];
            for (var i = 0; i < count; i++) {
                var startY = Math.random() * -50;
                cols.push({
                    y: startY,
                    speed: 0.4 + Math.random() * 0.6,
                    trailLen: 8 + Math.floor(Math.random() * 20),
                    lastCell: Math.floor(startY),
                });
            }
            return cols;
        }
        columns = buildColumns(numCols);

        function draw() {
            // Semi-transparent black overlay creates the fade trail
            ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = fontSize + 'px monospace';

            for (var i = 0; i < columns.length; i++) {
                var col = columns[i];
                var cell = Math.floor(col.y);

                // Only draw when the drop has moved to a new cell
                if (cell !== col.lastCell) {
                    col.lastCell = cell;
                    var x = i * colWidth;
                    var yPos = cell * fontSize;
                    var ch = chars[Math.floor(Math.random() * chars.length)];

                    // Single bright head character — the trail comes from
                    // previous heads fading via the black overlay, not from
                    // drawing extra characters behind
                    ctx.fillStyle = '#aaffaa';
                    ctx.fillText(ch, x, yPos);
                }

                // Advance the drop
                col.y += col.speed;

                // Reset when the column falls off screen (bottom or top)
                var maxY = canvas.height / fontSize + col.trailLen;
                if (col.speed > 0 && col.y > maxY) {
                    col.y = Math.random() * -20;
                    col.speed = 0.4 + Math.random() * 0.6;
                    col.trailLen = 8 + Math.floor(Math.random() * 20);
                    col.lastCell = Math.floor(col.y);
                } else if (col.speed < 0 && col.y < -col.trailLen) {
                    col.y = canvas.height / fontSize + Math.random() * 20;
                    col.speed = -(0.4 + Math.random() * 0.6);
                    col.trailLen = 8 + Math.floor(Math.random() * 20);
                    col.lastCell = Math.floor(col.y);
                }
            }
        }

        // Run at ~20fps for the classic slow cascade feel
        matrixTimerId = setInterval(draw, 50);

        // Handle resize — rebuild columns for new width
        matrixResizeHandler = function() {
            if (matrixTimerId) {
                initCanvas();
                var newNumCols = Math.floor(canvas.width / colWidth);
                if (newNumCols > numCols) {
                    // Add new columns for the extra width
                    var extra = buildColumns(newNumCols - numCols);
                    columns = columns.concat(extra);
                } else if (newNumCols < numCols) {
                    columns.length = newNumCols;
                }
                numCols = newNumCols;
            }
        };
        window.addEventListener('resize', matrixResizeHandler);

        // ========================
        //  MATRIX EASTER EGGS
        // ========================

        // --- 1. "Wake up, Neo..." Typewriter Quotes ---
        var matrixQuotes = [
            'Wake up, Neo...',
            'Follow the white rabbit',
            'There is no spoon',
            'The Matrix has you...',
            'Knock, knock, Neo.'
        ];

        function showMatrixQuote() {
            var quote = matrixQuotes[Math.floor(Math.random() * matrixQuotes.length)];
            var el = document.createElement('div');
            el.className = 'matrix-quote';
            el.textContent = '';
            document.body.appendChild(el);

            var charIdx = 0;
            var typeTimer = setInterval(function() {
                if (charIdx < quote.length) {
                    el.textContent += quote[charIdx];
                    charIdx++;
                } else {
                    clearInterval(typeTimer);
                    // Hold for 2s then fade out
                    setTimeout(function() {
                        el.classList.add('matrix-quote--fade');
                        setTimeout(function() { el.remove(); }, 1000);
                    }, 2000);
                }
            }, 80);
            matrixEasterEggTimers.push(typeTimer);
        }

        // Trigger every 90-180s
        function scheduleNextQuote() {
            var delay = 90000 + Math.random() * 90000;
            var t = setTimeout(function() {
                showMatrixQuote();
                scheduleNextQuote();
            }, delay);
            matrixEasterEggTimers.push(t);
        }
        scheduleNextQuote();

        // --- 2. Glitch Effect on UI Cards ---
        function glitchRandomCard() {
            var cards = document.querySelectorAll('.card');
            if (cards.length === 0) return;
            var card = cards[Math.floor(Math.random() * cards.length)];
            card.classList.add('matrix-glitch');
            setTimeout(function() { card.classList.remove('matrix-glitch'); }, 300);
        }

        // Trigger every 15-25s
        function scheduleNextGlitch() {
            var delay = 15000 + Math.random() * 10000;
            var t = setTimeout(function() {
                glitchRandomCard();
                scheduleNextGlitch();
            }, delay);
            matrixEasterEggTimers.push(t);
        }
        scheduleNextGlitch();

        // --- 3. Click Cascade ---
        var matrixCharsPool = '\uff66\uff71\uff72\uff73\uff74\uff75\uff76\uff77\uff78\uff79\uff7a0123456789ABCDEF';
        var clickOverlay = document.createElement('div');
        clickOverlay.className = 'matrix-click-overlay';
        clickOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:6;overflow:hidden;';
        document.body.appendChild(clickOverlay);

        matrixClickHandler = function(e) {
            var count = 8 + Math.floor(Math.random() * 5); // 8-12
            for (var i = 0; i < count; i++) {
                var span = document.createElement('span');
                span.className = 'matrix-click-char';
                span.textContent = matrixCharsPool[Math.floor(Math.random() * matrixCharsPool.length)];
                span.style.left = (e.clientX + (Math.random() - 0.5) * 60) + 'px';
                span.style.top = (e.clientY + (Math.random() - 0.5) * 20) + 'px';
                span.style.fontSize = (12 + Math.random() * 10) + 'px';
                span.style.animationDuration = (0.7 + Math.random() * 0.5) + 's';
                clickOverlay.appendChild(span);
                (function(s) {
                    setTimeout(function() { s.remove(); }, 1200);
                })(span);
            }
        };
        document.addEventListener('click', matrixClickHandler);

        // --- 4. Cursor Trail ---
        var trailElements = [];
        var lastTrailTime = 0;

        matrixMoveHandler = function(e) {
            var now = Date.now();
            if (now - lastTrailTime < 60) return; // throttle ~60ms
            if (trailElements.length >= 15) return; // max 15 trail elements
            lastTrailTime = now;

            var span = document.createElement('span');
            span.className = 'matrix-trail-char';
            span.textContent = matrixCharsPool[Math.floor(Math.random() * matrixCharsPool.length)];
            span.style.left = e.clientX + 'px';
            span.style.top = e.clientY + 'px';
            document.body.appendChild(span);
            trailElements.push(span);

            setTimeout(function() {
                span.remove();
                var idx = trailElements.indexOf(span);
                if (idx > -1) trailElements.splice(idx, 1);
            }, 800);
        };
        document.addEventListener('mousemove', matrixMoveHandler);

        // --- Konami: Invert Gravity ---
        konamiCallback = function() {
            // Flip all column speeds negative (rain goes up)
            for (var i = 0; i < columns.length; i++) {
                columns[i].speed = -(0.4 + Math.random() * 0.6);
            }
            // After 30 seconds, flip back to normal from current positions
            var revertTimer = setTimeout(function() {
                for (var i = 0; i < columns.length; i++) {
                    columns[i].speed = 0.4 + Math.random() * 0.6;
                }
            }, 30000);
            matrixEasterEggTimers.push(revertTimer);
        };

        // --- Type "spoon": There Is No Spoon ---
        var spoonBuffer = '';
        matrixSpoonHandler = function(e) {
            spoonBuffer += e.key.toLowerCase();
            if (spoonBuffer.length > 10) spoonBuffer = spoonBuffer.slice(-10);
            if (spoonBuffer.indexOf('spoon') !== -1) {
                spoonBuffer = '';
                // Full-screen overlay with the quote (no DOM mutation)
                var overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;pointer-events:none;opacity:0;transition:opacity 0.3s;';
                overlay.innerHTML = '<div style="font-family:Courier New,monospace;font-size:3rem;color:#00ff41;text-shadow:0 0 20px #00ff41,0 0 40px rgba(0,255,65,0.3);text-align:center;line-height:1.6;">There is no spoon</div>';
                document.body.appendChild(overlay);
                var spoonAudio = new Audio('/static/audio/there-is-no-spoon.mp3');
                spoonAudio.play().catch(function() {});
                // Fade in
                requestAnimationFrame(function() { overlay.style.opacity = '1'; });
                // Fade out after 3s
                var revertTimer = setTimeout(function() {
                    overlay.style.opacity = '0';
                    setTimeout(function() { overlay.remove(); }, 300);
                }, 3000);
                matrixEasterEggTimers.push(revertTimer);
            }
        };
        document.addEventListener('keypress', matrixSpoonHandler);

        // --- White Rabbit ---
        function doWhiteRabbit() {
            var rabbit = document.createElement('div');
            rabbit.className = 'matrix-rabbit';
            rabbit.textContent = '\uD83D\uDC07'; // 🐇

            var goingRight = Math.random() > 0.5;
            var startX = goingRight ? -60 : window.innerWidth + 60;
            var endX = goingRight ? window.innerWidth + 60 : -60;
            var rabbitY = 100 + Math.random() * (window.innerHeight - 200);
            var crossDuration = 1800 + Math.random() * 1200; // 1.8-3s

            rabbit.style.left = startX + 'px';
            rabbit.style.top = rabbitY + 'px';
            rabbit.style.transform = goingRight ? 'scaleX(-1)' : 'scaleX(1)';
            document.body.appendChild(rabbit);

            var startTime = Date.now();

            function animateRabbit() {
                var elapsed = Date.now() - startTime;
                var p = Math.min(elapsed / crossDuration, 1);
                var x = startX + (endX - startX) * p;
                rabbit.style.left = x + 'px';

                if (p < 1) {
                    requestAnimationFrame(animateRabbit);
                } else {
                    rabbit.remove();
                }
            }
            requestAnimationFrame(animateRabbit);
        }

        function maybeWhiteRabbit() {
            if (Math.random() > 0.005) return;
            doWhiteRabbit();
        }

        // Expose for debug menu
        window._debugEasterEggs = window._debugEasterEggs || {};
        window._debugEasterEggs.whiteRabbit = doWhiteRabbit;
        window._debugEasterEggs.matrixQuote = showMatrixQuote;
        window._debugEasterEggs.matrixGlitch = glitchRandomCard;

        // Check every 45-120s
        function scheduleWhiteRabbit() {
            var delay = 45000 + Math.random() * 75000;
            var t = setTimeout(function() {
                maybeWhiteRabbit();
                scheduleWhiteRabbit();
            }, delay);
            matrixEasterEggTimers.push(t);
        }
        scheduleWhiteRabbit();
    }

    // --- Bee-con Name Swap ---
    var defaultAppName = '';

    function handleBeeconName(active) {
        var sidebarTitle = document.querySelector('.side-panel__title');
        var pageTitle = document.querySelector('.page-header__title');
        if (!sidebarTitle && !pageTitle) return;

        // Capture the original name on first call
        if (!defaultAppName) {
            defaultAppName = (sidebarTitle && sidebarTitle.textContent) || (pageTitle && pageTitle.textContent) || '';
        }

        var beeconName = defaultAppName.replace(/Beacon/i, 'Beecon');
        var fromName = active ? defaultAppName : beeconName;
        var toName = active ? beeconName : defaultAppName;

        if (sidebarTitle) sidebarTitle.textContent = toName;
        document.title = document.title.replace(fromName, toName);
        if (pageTitle) {
            pageTitle.textContent = pageTitle.textContent.replace(fromName, toName);
        }
    }

    // --- Bee Easter Egg (the full experience) ---
    var beeTimers = [];
    var beeMoveHandler = null;
    var beeResizeHandler = null;

    function handleBeeAnimation(active) {
        var container = document.getElementById('bee-container');
        if (!container) return;

        if (!active) {
            beeTimers.forEach(function(id) { clearInterval(id); clearTimeout(id); });
            beeTimers = [];
            if (beeMoveHandler) {
                document.removeEventListener('mousemove', beeMoveHandler);
                beeMoveHandler = null;
            }
            if (beeResizeHandler) {
                window.removeEventListener('resize', beeResizeHandler);
                beeResizeHandler = null;
            }
            // Remove leftover easter egg elements
            document.querySelectorAll('.bee-bear, .bee-landing, .honey-drip, .bee-procession, .bee-row-highlight').forEach(function(el) {
                if (el.classList.contains('bee-row-highlight')) {
                    el.classList.remove('bee-row-highlight');
                } else {
                    el.remove();
                }
            });
            container.innerHTML = '';
            return;
        }

        var W = window.innerWidth;
        var H = window.innerHeight;
        beeResizeHandler = function() { W = window.innerWidth; H = window.innerHeight; };
        window.addEventListener('resize', beeResizeHandler);

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
        function spawnPollen(x, y, rainbow) {
            var dot = document.createElement('div');
            dot.className = 'bee-pollen';
            if (rainbow) dot.classList.add('bee-pollen--rainbow');
            dot.style.left = x + 'px';
            dot.style.top = y + 'px';
            container.appendChild(dot);
            // CSS animation handles fade + drift, remove after animation
            setTimeout(function() { dot.remove(); }, 1200);
        }

        // ========================
        //  FLOATING FLOWERS & HONEYCOMBS
        // ========================
        var flowerEmojis = ['\uD83C\uDF3B', '\uD83C\uDF3A', '\uD83C\uDF38', '\uD83C\uDF3C', '\uD83C\uDF37', '\uD83C\uDF39', '\uD83D\uDC90', '\uD83E\uDEBB', '\uD83E\uDEB7', '\uD83C\uDFF5\uFE0F', '\uD83D\uDCAE'];
        // 🌻 🌺 🌸 🌼 🌷
        var honeycombEmojis = ['\uD83C\uDF6F']; // 🍯
        var activeFlowers = [];

        function createFlower() {
            if (activeFlowers.length >= 4) return; // Max on screen

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

            var flowerObj = { el: flower, x: fx, y: fy, fading: false };
            activeFlowers.push(flowerObj);

            // Flowers live for 60-120 seconds then fade away
            var lifespan = rand(30000, 60000);
            setTimeout(function() {
                flowerObj.fading = true;
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
        //  CURSOR TRACKING (for flee behavior)
        // ========================
        var _beeCursorX = null;
        var _beeCursorY = null;
        var _beeFleeRadius = 120;
        var _beeFleeForce = 8;

        var lastPollenTrailTime = 0;

        beeMoveHandler = function(e) {
            _beeCursorX = e.clientX;
            _beeCursorY = e.clientY;
            // Pollen cursor trail
            var now = Date.now();
            if (now - lastPollenTrailTime > 100) {
                lastPollenTrailTime = now;
                spawnPollen(e.clientX + rand(-8, 8), e.clientY + rand(-5, 10));
            }
        };
        document.addEventListener('mousemove', beeMoveHandler);

        // ========================
        //  BEE FACTORY
        // ========================
        // Rare visitor insects
        var rareVisitors = [
            { emoji: '\uD83E\uDD8B', cls: 'bee--butterfly' },  // 🦋
            { emoji: '\uD83D\uDC1E', cls: 'bee--ladybug' },    // 🐞
        ];

        function createBee(opts) {
            opts = opts || {};
            var bee = document.createElement('div');
            bee.className = 'bee bee--buzzing';
            bee.textContent = '\uD83D\uDC1D';
            bee.style.position = 'absolute';
            bee.style.zIndex = '10000';

            // 0.02% chance of rainbow bee (~2-3 per day)
            var isRainbow = Math.random() < 0.0002;
            // 0.04% chance of a rare visitor (butterfly or ladybug, ~5 per day)
            var isVisitor = !isRainbow && Math.random() < 0.0004;

            // Size variety: tiny worker, normal, or chonky queen
            var sizeRoll = Math.random();
            var size;
            if (isVisitor) {
                var visitor = pick(rareVisitors);
                bee.textContent = visitor.emoji;
                bee.classList.remove('bee--buzzing');
                bee.classList.add(visitor.cls);
                size = rand(22, 34);
            } else if (isRainbow) {
                size = rand(30, 38);  // slightly larger
                bee.classList.remove('bee--buzzing');
                bee.classList.add('bee--rainbow');
            } else if (sizeRoll < 0.15) {
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
                // Visit up to 3 active flowers (skip fading ones)
                var shuffled = activeFlowers.filter(function(f) { return !f.fading; }).sort(function() { return Math.random() - 0.5; });
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
            var lastPollenX = startX;
            var lastPollenY = startY;

            var staysOnScreen = (patName === 'hover' || patName === 'waggle' || patName === 'pollinate');

            // For mid-screen patterns: when the pattern ends, fly off-screen
            var exiting = false;
            var exitStartTime = 0;
            var exitStartX = 0;
            var exitStartY = 0;
            var exitGoingRight = Math.random() > 0.5;
            var exitDuration = rand(2000, 3500);

            function animateBee() {
                var elapsed = Date.now() - startTime;
                var p = Math.min(elapsed / duration, 1);
                var x, y, angle, flip;

                if (exiting) {
                    // Exit phase: fly off the nearest edge in a gentle arc
                    var exitElapsed = Date.now() - exitStartTime;
                    var ep = Math.min(exitElapsed / exitDuration, 1);
                    var ease = ep * ep; // accelerate out
                    var exitTargetX = exitGoingRight ? W + 100 : -100;
                    x = exitStartX + (exitTargetX - exitStartX) * ease;
                    y = exitStartY + Math.sin(ep * Math.PI) * -40; // slight upward arc
                    angle = (exitGoingRight ? -10 : 10) * ep;
                    flip = exitGoingRight ? 'scaleX(-1)' : 'scaleX(1)';

                    if (x < -100 || x > W + 100) {
                        bee.remove();
                        return;
                    }
                } else if (p >= 1 && staysOnScreen) {
                    // Pattern finished — start exit phase
                    exiting = true;
                    exitStartTime = Date.now();
                    exitStartX = parseFloat(bee.style.left) || W / 2;
                    exitStartY = parseFloat(bee.style.top) || H / 2;
                    // Fly toward whichever edge is closer
                    exitGoingRight = exitStartX < W / 2 ? false : true;
                    requestAnimationFrame(animateBee);
                    return;
                } else if (p >= 1) {
                    // Cross-screen pattern done (safety fallback)
                    bee.remove();
                    return;
                } else {
                    // Normal pattern flight
                    var pos = patterns[patName](p, cfg);
                    y = clampY(pos.y);
                    x = pos.x;
                    angle = pos.angle || 0;

                    // Cross-screen bees: remove when off-screen
                    if (!staysOnScreen && p > 0.15 && (x < -80 || x > W + 80)) {
                        bee.remove();
                        return;
                    }

                    // Flip based on movement for mid-screen patterns
                    flip = flipBase;
                    if (staysOnScreen) {
                        var dx = x - lastPollenX;
                        if (Math.abs(dx) > 2) {
                            flip = dx > 0 ? 'scaleX(-1)' : 'scaleX(1)';
                        }
                    }
                }

                // Cursor flee — repulsion within radius
                if (_beeCursorX !== null && _beeCursorY !== null) {
                    var cdx = x - _beeCursorX;
                    var cdy = y - _beeCursorY;
                    var cdist = Math.sqrt(cdx * cdx + cdy * cdy);
                    if (cdist < _beeFleeRadius && cdist > 0) {
                        var push = (_beeFleeRadius - cdist) / _beeFleeRadius * _beeFleeForce;
                        x += (cdx / cdist) * push;
                        y += (cdy / cdist) * push;
                    }
                }

                bee.style.left = x + 'px';
                bee.style.top = clampY(y) + 'px';
                bee.style.transform = flip + ' rotate(' + (angle || 0) + 'deg)';

                // Quick fade-in only (no fade-out — bees exit by leaving the screen)
                var p2 = elapsed / duration;
                if (p2 < 0.06) {
                    bee.style.opacity = String((p2 / 0.06) * 0.9);
                } else {
                    bee.style.opacity = '0.9';
                }

                // Pollen trail — keep going until the bee is actually removed
                pollenCounter++;
                if (pollenCounter % 6 === 0) {
                    var dist = Math.sqrt(Math.pow(x - lastPollenX, 2) + Math.pow(y - lastPollenY, 2));
                    if (dist > 40 && x > -60 && x < W + 60) {
                        spawnPollen(x + rand(-5, 5), y + rand(5, 15), isRainbow);
                        lastPollenX = x;
                        lastPollenY = y;
                    }
                }

                requestAnimationFrame(animateBee);
            }

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
        }, rand(3000, 5000));
        beeTimers.push(beeSpawnId);

        // Flower spawning
        var flowerSpawnId = setInterval(function() {
            createFlower();
        }, rand(10000, 18000));
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

        // ========================
        //  BEE EASTER EGGS
        // ========================

        // --- 5. Bear Peek ---
        function maybeBearPeek() {
            if (Math.random() > 0.005) return; // 0.5% chance each check (~2-3 per day)

            var bear = document.createElement('div');
            bear.className = 'bee-bear';
            bear.textContent = '\uD83D\uDC3B'; // 🐻

            var edges = ['left', 'right', 'bottom'];
            var edge = edges[Math.floor(Math.random() * edges.length)];
            bear.classList.add('bee-bear--' + edge);

            // Random position along the chosen edge
            if (edge === 'left' || edge === 'right') {
                bear.style.top = (10 + Math.random() * 80) + '%';
            } else {
                bear.style.left = (10 + Math.random() * 80) + '%';
            }

            document.body.appendChild(bear);

            // Slide in by shifting the position property (not transform, so sniff wobble works)
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    if (edge === 'left') {
                        bear.style.left = '-12px';
                    } else if (edge === 'right') {
                        bear.style.right = '-12px';
                    } else {
                        bear.style.bottom = '-12px';
                    }
                    bear.classList.add('bee-bear--sniff');
                });
            });

            // Pause 2s then slide back out
            var hideTimer = setTimeout(function() {
                bear.classList.remove('bee-bear--sniff');
                if (edge === 'left') {
                    bear.style.left = '-60px';
                } else if (edge === 'right') {
                    bear.style.right = '-60px';
                } else {
                    bear.style.bottom = '-60px';
                }
                // Remove after transition
                setTimeout(function() { bear.remove(); }, 1000);
            }, 2800);
            beeTimers.push(hideTimer);
        }

        // Check every 15-25s
        function scheduleBearPeek() {
            var delay = 15000 + Math.random() * 10000;
            var t = setTimeout(function() {
                maybeBearPeek();
                scheduleBearPeek();
            }, delay);
            beeTimers.push(t);
        }
        scheduleBearPeek();

        // --- 6. Bee Landing on Ticket Row ---
        function doBeeLanding() {
            var rows = document.querySelectorAll('tr');
            if (rows.length === 0) return;

            var row = rows[Math.floor(Math.random() * rows.length)];
            var rect = row.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            var bee = document.createElement('div');
            bee.className = 'bee-landing';
            bee.textContent = '\uD83D\uDC1D'; // 🐝

            // Use absolute positioning so the bee scrolls with the page
            var scrollX = window.scrollX || window.pageXOffset;
            var scrollY = window.scrollY || window.pageYOffset;

            // Start from random edge (document coords)
            var startX = Math.random() > 0.5 ? -40 : W + 40;
            var startY = scrollY + rand(50, H - 50);
            bee.style.left = startX + 'px';
            bee.style.top = startY + 'px';
            document.body.appendChild(bee);

            // Fly to the row (convert viewport rect to document coords)
            var targetX = scrollX + rect.left + rand(20, rect.width - 20);
            var targetY = scrollY + rect.top + rect.height / 2;

            requestAnimationFrame(function() {
                bee.classList.add('bee-landing--flying');
                bee.style.left = targetX + 'px';
                bee.style.top = targetY + 'px';
            });

            // Land after flight
            var landTimer = setTimeout(function() {
                bee.classList.remove('bee-landing--flying');
                bee.classList.add('bee-landing--landed');
                row.classList.add('bee-row-highlight');

                // Sit for 3-5s then fly off
                var restTime = 3000 + Math.random() * 2000;
                var flyOffTimer = setTimeout(function() {
                    bee.classList.remove('bee-landing--landed');
                    row.classList.remove('bee-row-highlight');
                    bee.classList.add('bee-landing--flying');
                    var curScrollY = window.scrollY || window.pageYOffset;
                    var exitX = Math.random() > 0.5 ? W + 60 : -60;
                    var exitY = curScrollY + rand(50, H - 50);
                    bee.style.left = exitX + 'px';
                    bee.style.top = exitY + 'px';
                    bee.style.transform = '';

                    var removeTimer = setTimeout(function() { bee.remove(); }, 1600);
                    beeTimers.push(removeTimer);
                }, restTime);
                beeTimers.push(flyOffTimer);
            }, 1600);
            beeTimers.push(landTimer);
        }

        function maybeBeeLanding() {
            if (Math.random() > 0.008) return;
            doBeeLanding();
        }

        // Check every 20-45s
        function scheduleBeeLanding() {
            var delay = 20000 + Math.random() * 25000;
            var t = setTimeout(function() {
                maybeBeeLanding();
                scheduleBeeLanding();
            }, delay);
            beeTimers.push(t);
        }
        scheduleBeeLanding();

        // --- 7. Honey Drip ---
        function doHoneyDrip() {
            var cards = document.querySelectorAll('.card');
            if (cards.length === 0) return;

            var card = cards[Math.floor(Math.random() * cards.length)];
            // Card needs relative positioning for the drips
            var origPosition = card.style.position;
            if (getComputedStyle(card).position === 'static') {
                card.style.position = 'relative';
            }

            var count = 3 + Math.floor(Math.random() * 4); // 3-6 drips
            var drips = [];
            for (var i = 0; i < count; i++) {
                (function(idx) {
                    var delay = idx * (150 + Math.random() * 300);
                    var t = setTimeout(function() {
                        var drip = document.createElement('div');
                        drip.className = 'honey-drip';
                        drip.style.left = (15 + Math.random() * (card.offsetWidth - 30)) + 'px';
                        card.appendChild(drip);
                        drips.push(drip);
                    }, delay);
                    beeTimers.push(t);
                })(i);
            }

            // Clean up all drips after animation
            var cleanupTimer = setTimeout(function() {
                drips.forEach(function(d) { d.remove(); });
                if (origPosition !== undefined) card.style.position = origPosition;
            }, 4500);
            beeTimers.push(cleanupTimer);
        }

        function maybeHoneyDrip() {
            if (Math.random() > 0.003) return;
            doHoneyDrip();
        }

        // Check every 30-60s
        function scheduleHoneyDrip() {
            var delay = 30000 + Math.random() * 30000;
            var t = setTimeout(function() {
                maybeHoneyDrip();
                scheduleHoneyDrip();
            }, delay);
            beeTimers.push(t);
        }
        scheduleHoneyDrip();

        // --- 8. Queen Bee Procession ---
        function doQueenProcession() {
            var procession = document.createElement('div');
            procession.className = 'bee-procession';
            document.body.appendChild(procession);

            var goingRight = Math.random() > 0.5;
            var startX = goingRight ? -80 : W + 80;
            var endX = goingRight ? W + 80 : -80;
            var baseY = rand(100, H - 150);
            var duration = 6000 + Math.random() * 3000;
            var startTime = Date.now();

            // Queen element
            var queen = document.createElement('div');
            queen.className = 'bee-procession-queen';
            queen.innerHTML = '\uD83D\uDC1D'; // 🐝
            var crown = document.createElement('span');
            crown.className = 'bee-crown';
            crown.textContent = '\uD83D\uDC51'; // 👑
            queen.appendChild(crown);
            procession.appendChild(queen);

            // Worker bees in V-formation (5-8)
            var workerCount = 5 + Math.floor(Math.random() * 4);
            var workers = [];
            for (var i = 0; i < workerCount; i++) {
                var w = document.createElement('div');
                w.className = 'bee-procession-worker';
                w.textContent = '\uD83D\uDC1D'; // 🐝
                procession.appendChild(w);
                // V-formation offsets: alternating sides, increasing distance
                var row = Math.floor(i / 2) + 1;
                var side = (i % 2 === 0) ? 1 : -1;
                workers.push({
                    el: w,
                    offsetX: -row * 35 * (goingRight ? 1 : -1), // behind queen
                    offsetY: side * row * 25,
                    jitterPhase: Math.random() * Math.PI * 2,
                    delay: row * 0.03 // slight lag behind queen
                });
            }

            function animateProcession() {
                var elapsed = Date.now() - startTime;
                var p = Math.min(elapsed / duration, 1);

                // Queen position with gentle wave
                var qx = startX + (endX - startX) * p;
                var qy = baseY + Math.sin(p * Math.PI * 4) * 20;
                queen.style.left = qx + 'px';
                queen.style.top = qy + 'px';
                queen.style.transform = goingRight ? 'scaleX(-1)' : 'scaleX(1)';

                // Workers follow
                for (var i = 0; i < workers.length; i++) {
                    var wk = workers[i];
                    var wp = Math.max(0, Math.min(p - wk.delay, 1));
                    var wx = startX + (endX - startX) * wp + wk.offsetX;
                    var wy = baseY + Math.sin(wp * Math.PI * 4) * 20 + wk.offsetY;
                    // Individual jitter
                    wx += Math.sin(elapsed * 0.005 + wk.jitterPhase) * 4;
                    wy += Math.cos(elapsed * 0.007 + wk.jitterPhase) * 3;
                    wk.el.style.left = wx + 'px';
                    wk.el.style.top = wy + 'px';
                    wk.el.style.transform = goingRight ? 'scaleX(-1)' : 'scaleX(1)';
                }

                if (p < 1) {
                    requestAnimationFrame(animateProcession);
                } else {
                    procession.remove();
                }
            }
            requestAnimationFrame(animateProcession);
        }

        function maybeQueenProcession() {
            if (Math.random() > 0.004) return;
            doQueenProcession();
        }

        // Check every 40-80s
        function scheduleQueenProcession() {
            var delay = 40000 + Math.random() * 40000;
            var t = setTimeout(function() {
                maybeQueenProcession();
                scheduleQueenProcession();
            }, delay);
            beeTimers.push(t);
        }
        scheduleQueenProcession();

        // Expose forced triggers for debug menu
        window._debugEasterEggs = window._debugEasterEggs || {};
        window._debugEasterEggs.beeLanding = doBeeLanding;
        window._debugEasterEggs.honeyDrip = doHoneyDrip;
        window._debugEasterEggs.queenProcession = doQueenProcession;
        window._debugEasterEggs.bearPeek = function() {
            // Force bear peek (bypassing probability)
            var bear = document.createElement('div');
            bear.className = 'bee-bear';
            bear.textContent = '\uD83D\uDC3B';
            var edges = ['left', 'right', 'bottom'];
            var edge = edges[Math.floor(Math.random() * edges.length)];
            bear.classList.add('bee-bear--' + edge);
            if (edge === 'left' || edge === 'right') {
                bear.style.top = (10 + Math.random() * 80) + '%';
            } else {
                bear.style.left = (10 + Math.random() * 80) + '%';
            }
            document.body.appendChild(bear);
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    if (edge === 'left') bear.style.left = '-12px';
                    else if (edge === 'right') bear.style.right = '-12px';
                    else bear.style.bottom = '-12px';
                    bear.classList.add('bee-bear--sniff');
                });
            });
            var hideTimer = setTimeout(function() {
                bear.classList.remove('bee-bear--sniff');
                if (edge === 'left') bear.style.left = '-60px';
                else if (edge === 'right') bear.style.right = '-60px';
                else bear.style.bottom = '-60px';
                setTimeout(function() { bear.remove(); }, 1000);
            }, 2800);
            beeTimers.push(hideTimer);
        };
        window._debugEasterEggs.beeSwarm = triggerSwarm;
        window._debugEasterEggs.rainbowBee = function() {
            // Spawn a single rainbow bee
            var bee = document.createElement('div');
            bee.className = 'bee bee--rainbow';
            bee.textContent = '\uD83D\uDC1D';
            bee.style.position = 'absolute';
            bee.style.zIndex = '10000';
            bee.style.fontSize = rand(30, 38) + 'px';
            container.appendChild(bee);
            var goRight = Math.random() > 0.5;
            var sx = goRight ? -60 : W + 60;
            var ex = goRight ? W + 60 : -60;
            var sy = rand(50, H - 80);
            var dur = rand(7000, 12000);
            var st = Date.now();
            var flip = goRight ? 'scaleX(-1)' : 'scaleX(1)';
            (function anim() {
                var p = Math.min((Date.now() - st) / dur, 1);
                var x = sx + (ex - sx) * p;
                var y = sy + Math.sin(p * Math.PI * 4) * 60;
                bee.style.left = x + 'px';
                bee.style.top = y + 'px';
                bee.style.transform = flip + ' rotate(' + (Math.sin(p * 20) * 12) + 'deg)';
                bee.style.opacity = p < 0.05 ? String(p / 0.05) : '0.9';
                if (p < 1) requestAnimationFrame(anim);
                else bee.remove();
            })();
        };

        // --- Konami: Unleash the Swarm ---
        konamiCallback = function() {
            var swarmCount = 100 + Math.floor(Math.random() * 51);
            playBeeSwarmBuzz();
            for (var i = 0; i < swarmCount; i++) {
                (function(delay) {
                    var t = setTimeout(function() {
                        createBee({
                            goingRight: Math.random() > 0.5,
                            pattern: pick(['wave', 'drunken', 'zigzag', 'divebomb', 'loopy'])
                        });
                    }, delay);
                    beeTimers.push(t);
                })(i * rand(30, 120));
            }
        };

    }

    // --- MSP Gold Konami: BSOD ---
    function handleGoldKonami(active) {
        if (!active) {
            if (konamiCallback === triggerBSOD) konamiCallback = null;
            return;
        }
        konamiCallback = triggerBSOD;
    }

    function triggerBSOD() {
        var bsodAudio = new Audio('/static/audio/windows-bsod.mp3');
        bsodAudio.play().catch(function() {});
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#0078D7;z-index:999999;display:flex;flex-direction:column;justify-content:center;padding-left:10%;font-family:Segoe UI,sans-serif;color:white;cursor:default;';
        overlay.innerHTML =
            '<div style="font-size:7rem;margin-bottom:2rem;">:(</div>' +
            '<div style="font-size:1.5rem;max-width:700px;line-height:1.8;margin-bottom:2rem;">' +
            'Your device ran into a problem and needs to restart. We\'re just collecting some error info, and then we\'ll restart for you.</div>' +
            '<div style="font-size:1.1rem;max-width:700px;margin-bottom:2.5rem;"><span id="bsod-pct">0</span>% complete</div>' +
            '<div style="display:flex;align-items:flex-start;gap:1.2rem;max-width:700px;">' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" width="80" height="80" style="flex-shrink:0;"><rect width="29" height="29" fill="white"/><path d="M0,0h1v1h-1zM1,0h1v1h-1zM2,0h1v1h-1zM3,0h1v1h-1zM4,0h1v1h-1zM5,0h1v1h-1zM6,0h1v1h-1zM10,0h1v1h-1zM15,0h1v1h-1zM17,0h1v1h-1zM18,0h1v1h-1zM19,0h1v1h-1zM22,0h1v1h-1zM23,0h1v1h-1zM24,0h1v1h-1zM25,0h1v1h-1zM26,0h1v1h-1zM27,0h1v1h-1zM28,0h1v1h-1zM0,1h1v1h-1zM6,1h1v1h-1zM8,1h1v1h-1zM9,1h1v1h-1zM10,1h1v1h-1zM13,1h1v1h-1zM14,1h1v1h-1zM15,1h1v1h-1zM16,1h1v1h-1zM17,1h1v1h-1zM18,1h1v1h-1zM20,1h1v1h-1zM22,1h1v1h-1zM28,1h1v1h-1zM0,2h1v1h-1zM2,2h1v1h-1zM3,2h1v1h-1zM4,2h1v1h-1zM6,2h1v1h-1zM8,2h1v1h-1zM14,2h1v1h-1zM17,2h1v1h-1zM19,2h1v1h-1zM20,2h1v1h-1zM22,2h1v1h-1zM24,2h1v1h-1zM25,2h1v1h-1zM26,2h1v1h-1zM28,2h1v1h-1zM0,3h1v1h-1zM2,3h1v1h-1zM3,3h1v1h-1zM4,3h1v1h-1zM6,3h1v1h-1zM9,3h1v1h-1zM12,3h1v1h-1zM15,3h1v1h-1zM16,3h1v1h-1zM22,3h1v1h-1zM24,3h1v1h-1zM25,3h1v1h-1zM26,3h1v1h-1zM28,3h1v1h-1zM0,4h1v1h-1zM2,4h1v1h-1zM3,4h1v1h-1zM4,4h1v1h-1zM6,4h1v1h-1zM8,4h1v1h-1zM9,4h1v1h-1zM10,4h1v1h-1zM12,4h1v1h-1zM15,4h1v1h-1zM17,4h1v1h-1zM18,4h1v1h-1zM22,4h1v1h-1zM24,4h1v1h-1zM25,4h1v1h-1zM26,4h1v1h-1zM28,4h1v1h-1zM0,5h1v1h-1zM6,5h1v1h-1zM8,5h1v1h-1zM10,5h1v1h-1zM12,5h1v1h-1zM13,5h1v1h-1zM14,5h1v1h-1zM15,5h1v1h-1zM16,5h1v1h-1zM17,5h1v1h-1zM18,5h1v1h-1zM19,5h1v1h-1zM22,5h1v1h-1zM28,5h1v1h-1zM0,6h1v1h-1zM1,6h1v1h-1zM2,6h1v1h-1zM3,6h1v1h-1zM4,6h1v1h-1zM5,6h1v1h-1zM6,6h1v1h-1zM8,6h1v1h-1zM10,6h1v1h-1zM12,6h1v1h-1zM14,6h1v1h-1zM16,6h1v1h-1zM18,6h1v1h-1zM20,6h1v1h-1zM22,6h1v1h-1zM23,6h1v1h-1zM24,6h1v1h-1zM25,6h1v1h-1zM26,6h1v1h-1zM27,6h1v1h-1zM28,6h1v1h-1zM8,7h1v1h-1zM10,7h1v1h-1zM11,7h1v1h-1zM14,7h1v1h-1zM17,7h1v1h-1zM18,7h1v1h-1zM19,7h1v1h-1zM0,8h1v1h-1zM1,8h1v1h-1zM3,8h1v1h-1zM6,8h1v1h-1zM7,8h1v1h-1zM11,8h1v1h-1zM12,8h1v1h-1zM14,8h1v1h-1zM22,8h1v1h-1zM23,8h1v1h-1zM24,8h1v1h-1zM26,8h1v1h-1zM27,8h1v1h-1zM0,9h1v1h-1zM1,9h1v1h-1zM2,9h1v1h-1zM4,9h1v1h-1zM9,9h1v1h-1zM11,9h1v1h-1zM12,9h1v1h-1zM13,9h1v1h-1zM14,9h1v1h-1zM16,9h1v1h-1zM17,9h1v1h-1zM18,9h1v1h-1zM20,9h1v1h-1zM22,9h1v1h-1zM25,9h1v1h-1zM28,9h1v1h-1zM2,10h1v1h-1zM3,10h1v1h-1zM4,10h1v1h-1zM5,10h1v1h-1zM6,10h1v1h-1zM7,10h1v1h-1zM8,10h1v1h-1zM11,10h1v1h-1zM12,10h1v1h-1zM16,10h1v1h-1zM17,10h1v1h-1zM19,10h1v1h-1zM20,10h1v1h-1zM22,10h1v1h-1zM25,10h1v1h-1zM26,10h1v1h-1zM27,10h1v1h-1zM1,11h1v1h-1zM2,11h1v1h-1zM7,11h1v1h-1zM8,11h1v1h-1zM9,11h1v1h-1zM10,11h1v1h-1zM11,11h1v1h-1zM12,11h1v1h-1zM13,11h1v1h-1zM15,11h1v1h-1zM18,11h1v1h-1zM23,11h1v1h-1zM24,11h1v1h-1zM26,11h1v1h-1zM27,11h1v1h-1zM1,12h1v1h-1zM4,12h1v1h-1zM5,12h1v1h-1zM6,12h1v1h-1zM8,12h1v1h-1zM10,12h1v1h-1zM11,12h1v1h-1zM13,12h1v1h-1zM17,12h1v1h-1zM19,12h1v1h-1zM20,12h1v1h-1zM21,12h1v1h-1zM22,12h1v1h-1zM25,12h1v1h-1zM27,12h1v1h-1zM28,12h1v1h-1zM0,13h1v1h-1zM1,13h1v1h-1zM2,13h1v1h-1zM5,13h1v1h-1zM9,13h1v1h-1zM11,13h1v1h-1zM15,13h1v1h-1zM17,13h1v1h-1zM19,13h1v1h-1zM21,13h1v1h-1zM23,13h1v1h-1zM1,14h1v1h-1zM2,14h1v1h-1zM4,14h1v1h-1zM6,14h1v1h-1zM7,14h1v1h-1zM9,14h1v1h-1zM10,14h1v1h-1zM11,14h1v1h-1zM13,14h1v1h-1zM14,14h1v1h-1zM16,14h1v1h-1zM17,14h1v1h-1zM18,14h1v1h-1zM20,14h1v1h-1zM21,14h1v1h-1zM25,14h1v1h-1zM26,14h1v1h-1zM27,14h1v1h-1zM28,14h1v1h-1zM3,15h1v1h-1zM4,15h1v1h-1zM5,15h1v1h-1zM7,15h1v1h-1zM8,15h1v1h-1zM11,15h1v1h-1zM13,15h1v1h-1zM14,15h1v1h-1zM15,15h1v1h-1zM16,15h1v1h-1zM17,15h1v1h-1zM18,15h1v1h-1zM19,15h1v1h-1zM20,15h1v1h-1zM22,15h1v1h-1zM25,15h1v1h-1zM27,15h1v1h-1zM1,16h1v1h-1zM2,16h1v1h-1zM3,16h1v1h-1zM4,16h1v1h-1zM5,16h1v1h-1zM6,16h1v1h-1zM7,16h1v1h-1zM10,16h1v1h-1zM12,16h1v1h-1zM13,16h1v1h-1zM17,16h1v1h-1zM19,16h1v1h-1zM20,16h1v1h-1zM21,16h1v1h-1zM23,16h1v1h-1zM27,16h1v1h-1zM1,17h1v1h-1zM3,17h1v1h-1zM7,17h1v1h-1zM10,17h1v1h-1zM12,17h1v1h-1zM16,17h1v1h-1zM18,17h1v1h-1zM22,17h1v1h-1zM23,17h1v1h-1zM25,17h1v1h-1zM28,17h1v1h-1zM0,18h1v1h-1zM2,18h1v1h-1zM4,18h1v1h-1zM6,18h1v1h-1zM11,18h1v1h-1zM12,18h1v1h-1zM14,18h1v1h-1zM20,18h1v1h-1zM21,18h1v1h-1zM22,18h1v1h-1zM23,18h1v1h-1zM27,18h1v1h-1zM28,18h1v1h-1zM5,19h1v1h-1zM8,19h1v1h-1zM9,19h1v1h-1zM10,19h1v1h-1zM12,19h1v1h-1zM15,19h1v1h-1zM17,19h1v1h-1zM19,19h1v1h-1zM22,19h1v1h-1zM27,19h1v1h-1zM28,19h1v1h-1zM0,20h1v1h-1zM3,20h1v1h-1zM5,20h1v1h-1zM6,20h1v1h-1zM8,20h1v1h-1zM9,20h1v1h-1zM10,20h1v1h-1zM13,20h1v1h-1zM14,20h1v1h-1zM15,20h1v1h-1zM20,20h1v1h-1zM21,20h1v1h-1zM22,20h1v1h-1zM23,20h1v1h-1zM24,20h1v1h-1zM26,20h1v1h-1zM8,21h1v1h-1zM9,21h1v1h-1zM10,21h1v1h-1zM11,21h1v1h-1zM13,21h1v1h-1zM17,21h1v1h-1zM19,21h1v1h-1zM20,21h1v1h-1zM24,21h1v1h-1zM26,21h1v1h-1zM27,21h1v1h-1zM28,21h1v1h-1zM0,22h1v1h-1zM1,22h1v1h-1zM2,22h1v1h-1zM3,22h1v1h-1zM4,22h1v1h-1zM5,22h1v1h-1zM6,22h1v1h-1zM8,22h1v1h-1zM9,22h1v1h-1zM10,22h1v1h-1zM14,22h1v1h-1zM17,22h1v1h-1zM18,22h1v1h-1zM20,22h1v1h-1zM22,22h1v1h-1zM24,22h1v1h-1zM27,22h1v1h-1zM0,23h1v1h-1zM6,23h1v1h-1zM10,23h1v1h-1zM13,23h1v1h-1zM16,23h1v1h-1zM18,23h1v1h-1zM20,23h1v1h-1zM24,23h1v1h-1zM25,23h1v1h-1zM26,23h1v1h-1zM28,23h1v1h-1zM0,24h1v1h-1zM2,24h1v1h-1zM3,24h1v1h-1zM4,24h1v1h-1zM6,24h1v1h-1zM9,24h1v1h-1zM12,24h1v1h-1zM17,24h1v1h-1zM20,24h1v1h-1zM21,24h1v1h-1zM22,24h1v1h-1zM23,24h1v1h-1zM24,24h1v1h-1zM0,25h1v1h-1zM2,25h1v1h-1zM3,25h1v1h-1zM4,25h1v1h-1zM6,25h1v1h-1zM8,25h1v1h-1zM9,25h1v1h-1zM10,25h1v1h-1zM11,25h1v1h-1zM12,25h1v1h-1zM14,25h1v1h-1zM19,25h1v1h-1zM22,25h1v1h-1zM24,25h1v1h-1zM25,25h1v1h-1zM26,25h1v1h-1zM27,25h1v1h-1zM0,26h1v1h-1zM2,26h1v1h-1zM3,26h1v1h-1zM4,26h1v1h-1zM6,26h1v1h-1zM10,26h1v1h-1zM12,26h1v1h-1zM17,26h1v1h-1zM18,26h1v1h-1zM19,26h1v1h-1zM21,26h1v1h-1zM24,26h1v1h-1zM25,26h1v1h-1zM26,26h1v1h-1zM28,26h1v1h-1zM0,27h1v1h-1zM6,27h1v1h-1zM8,27h1v1h-1zM12,27h1v1h-1zM13,27h1v1h-1zM14,27h1v1h-1zM16,27h1v1h-1zM17,27h1v1h-1zM20,27h1v1h-1zM24,27h1v1h-1zM27,27h1v1h-1zM0,28h1v1h-1zM1,28h1v1h-1zM2,28h1v1h-1zM3,28h1v1h-1zM4,28h1v1h-1zM5,28h1v1h-1zM6,28h1v1h-1zM8,28h1v1h-1zM11,28h1v1h-1zM12,28h1v1h-1zM13,28h1v1h-1zM14,28h1v1h-1zM15,28h1v1h-1zM16,28h1v1h-1zM17,28h1v1h-1zM18,28h1v1h-1zM20,28h1v1h-1zM23,28h1v1h-1zM24,28h1v1h-1zM27,28h1v1h-1z" fill="black"/></svg>' +
            '<div style="font-size:0.85rem;line-height:1.6;opacity:0.9;">' +
            'For more information about this issue and possible fixes, visit<br>https://www.windows.com/stopcode<br><br>' +
            'If you call a support person, give them this info:<br>Stop code: HAVE_YOU_TRIED_TURNING_IT_OFF_AND_ON_AGAIN</div></div>';
        document.body.appendChild(overlay);

        var pct = 0;
        var pctEl = overlay.querySelector('#bsod-pct');
        var bsodTimer = setInterval(function() {
            pct += Math.floor(Math.random() * 12) + 3;
            if (pct > 100) pct = 100;
            pctEl.textContent = pct;
            if (pct >= 100) {
                clearInterval(bsodTimer);
                setTimeout(function() { overlay.remove(); }, 1500);
            }
        }, 500);
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
            handleBeeconName(color === 'bee');
            handleGoldKonami(color === 'gold');
        });

        // Initialize Easter eggs on page load
        handleMatrixRain(currentColor === 'matrix');
        handleBeeAnimation(currentColor === 'bee');
        handleBeeconName(currentColor === 'bee');
        handleGoldKonami(currentColor === 'gold');
    }

    // Expose IIFE-level easter eggs for debug menu
    window._debugEasterEggs = window._debugEasterEggs || {};
    window._debugEasterEggs.disco = triggerDisco;
    window._debugEasterEggs.bsod = triggerBSOD;

    // --- Sidebar Collapse Toggle ---
    var sidebarToggle = document.getElementById('sidebar-toggle');
    var layoutEl = document.querySelector('.thebeacon-layout');

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

// === DEBUG EASTER EGG PANEL (Ctrl+Shift+E) ===
// To remove: delete everything from this line to "END DEBUG EASTER EGG PANEL" below.
(function() {
    'use strict';
    var panel = null;

    var SECTIONS = [
        {
            label: '\uD83D\uDC1D Bee Theme',
            note: 'Requires bee theme active',
            color: '#FFB300',
            buttons: [
                { text: 'Bee Landing', key: 'beeLanding', icon: '\uD83D\uDC1D\u2B07' },
                { text: 'Honey Drip', key: 'honeyDrip', icon: '\uD83C\uDF6F' },
                { text: 'Queen Procession', key: 'queenProcession', icon: '\uD83D\uDC51' },
                { text: 'Bear Peek', key: 'bearPeek', icon: '\uD83D\uDC3B' },
                { text: 'Rainbow Bee', key: 'rainbowBee', icon: '\uD83C\uDF08' },
                { text: 'Bee Swarm', key: 'beeSwarm', icon: '\uD83D\uDC1D\uD83D\uDC1D' },
            ]
        },
        {
            label: '\uD83D\uDFE2 Matrix Theme',
            note: 'Requires matrix theme active',
            color: '#00ff41',
            buttons: [
                { text: 'White Rabbit', key: 'whiteRabbit', icon: '\uD83D\uDC07' },
                { text: 'Matrix Quote', key: 'matrixQuote', icon: '\uD83D\uDCAC' },
                { text: 'Card Glitch', key: 'matrixGlitch', icon: '\u26A1' },
            ]
        },
        {
            label: '\uD83C\uDF1F Cross-Theme',
            note: 'Works on any theme',
            color: '#818cf8',
            buttons: [
                { text: '"This is fine" Dog', key: 'thisIsFine', icon: '\uD83D\uDC36' },
                { text: 'Good Celebration', key: 'goodCelebration', icon: '\uD83C\uDF89' },
                { text: 'Calm Celebration', key: 'calmCelebration', icon: '\uD83C\uDFC6' },
                { text: '4:04 Overlay', key: 'event404', icon: '\u2753' },
                { text: '4:20 Leaf Rain', key: 'event420', icon: '\uD83C\uDF3F' },
                { text: '5:00 Beer', key: 'eventBeer', icon: '\uD83C\uDF7A' },
            ]
        },
        {
            label: '\uD83D\uDEA6 Threshold States',
            note: 'Preview count styles',
            color: '#6ee7b7',
            buttons: [
                { text: 'Calm', key: 'stateCalm', icon: '\uD83D\uDFE2' },
                { text: 'Good', key: 'stateGood', icon: '\u2705' },
                { text: 'Normal', key: 'stateNormal', icon: '\u26AA' },
                { text: 'Warning', key: 'stateWarning', icon: '\uD83D\uDFE1' },
                { text: 'Danger', key: 'stateDanger', icon: '\uD83D\uDD34' },
                { text: 'Emergency', key: 'stateEmergency', icon: '\uD83D\uDEA8' },
            ]
        },
        {
            label: '\uD83C\uDFB2 Other',
            note: 'Always available',
            color: '#f472b6',
            buttons: [
                { text: 'Disco Mode', key: 'disco', icon: '\uD83D\uDD7A' },
                { text: 'BSOD', key: 'bsod', icon: '\uD83D\uDCBB' },
            ]
        }
    ];

    function buildPanel() {
        var el = document.createElement('div');
        el.id = 'easter-egg-debug';

        var s = el.style;
        s.position = 'fixed'; s.bottom = '20px'; s.right = '20px'; s.zIndex = '999999';
        s.background = '#1a1a2e'; s.color = '#e0e0e0';
        s.border = '1px solid #333'; s.borderRadius = '10px';
        s.padding = '14px 16px'; s.fontFamily = 'monospace'; s.fontSize = '12px';
        s.boxShadow = '0 8px 32px rgba(0,0,0,0.5)'; s.maxWidth = '310px';
        s.display = 'none'; s.userSelect = 'none'; s.maxHeight = '85vh'; s.overflowY = 'auto';

        // Title bar
        var title = document.createElement('div');
        title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #333;';
        var titleText = document.createElement('span');
        titleText.style.cssText = 'font-weight:bold;font-size:13px;color:#FFD54F;';
        titleText.textContent = 'Easter Egg Debug';
        title.appendChild(titleText);

        var hint = document.createElement('span');
        hint.style.cssText = 'font-size:10px;color:#666;margin-left:6px;';
        hint.textContent = 'Ctrl+Shift+E';
        title.appendChild(hint);

        var closeBtn = document.createElement('button');
        closeBtn.textContent = '\u2715';
        closeBtn.title = 'Close';
        closeBtn.style.cssText = 'background:none;border:none;color:#888;font-size:16px;cursor:pointer;padding:0 4px;margin-left:auto;';
        closeBtn.addEventListener('click', function() { togglePanel(); });
        title.appendChild(closeBtn);
        el.appendChild(title);

        // Sections
        SECTIONS.forEach(function(section) {
            var heading = document.createElement('div');
            heading.style.cssText = 'font-size:11px;font-weight:bold;color:' + section.color + ';margin:10px 0 2px;';
            heading.textContent = section.label;
            el.appendChild(heading);

            if (section.note) {
                var note = document.createElement('div');
                note.style.cssText = 'font-size:9px;color:#666;margin-bottom:4px;';
                note.textContent = section.note;
                el.appendChild(note);
            }

            var grid = document.createElement('div');
            grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';

            section.buttons.forEach(function(btn) {
                var b = document.createElement('button');
                b.innerHTML = btn.icon + ' ' + btn.text;
                b.style.cssText = 'background:#2a2a3e;color:#e0e0e0;border:1px solid #444;border-radius:5px;' +
                    'padding:4px 8px;font-size:11px;font-family:monospace;cursor:pointer;transition:all 0.15s;white-space:nowrap;';
                b.addEventListener('mouseenter', function() { b.style.background = '#3a3a5e'; b.style.borderColor = section.color; });
                b.addEventListener('mouseleave', function() { b.style.background = '#2a2a3e'; b.style.borderColor = '#444'; });
                b.addEventListener('click', function() {
                    var debug = window._debugEasterEggs || {};
                    if (debug[btn.key]) {
                        debug[btn.key]();
                        b.style.background = '#1a3a1a'; b.style.borderColor = '#4CAF50';
                        setTimeout(function() { b.style.background = '#2a2a3e'; b.style.borderColor = '#444'; }, 400);
                    } else {
                        b.style.background = '#3a1a1a'; b.style.borderColor = '#f44';
                        setTimeout(function() { b.style.background = '#2a2a3e'; b.style.borderColor = '#444'; }, 600);
                    }
                });
                grid.appendChild(b);
            });
            el.appendChild(grid);
        });

        document.body.appendChild(el);
        return el;
    }

    function togglePanel() {
        if (!panel) panel = buildPanel();
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            togglePanel();
        }
    });
})();
// === END DEBUG EASTER EGG PANEL ===
