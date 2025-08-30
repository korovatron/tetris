// #region set event handlers etc.
"use strict";
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
//window.addEventListener('load', resizeCanvas);
const pressedKeys = new Set();
const isKeyDown = (key) => pressedKeys.has(key);

// #region touch screen event listners
let mute = false;
let lastX = null;
let lastY = null;
let accumulatedX = 0;
let accumulatedY = 0;
let startX = 0;
let startY = 0;
let touchStartTime = 0;

const MOVE_THRESHOLD = 15;
const TAP_THRESHOLD = 20;
const TIME_THRESHOLD = 300;

document.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    touchStartTime = Date.now();
    lastX = startX;
    lastY = startY;
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const currentX = touch.clientX;
    const currentY = touch.clientY;

    accumulatedX += currentX - lastX;
    accumulatedY += currentY - lastY;

    if (accumulatedX > MOVE_THRESHOLD) {
        movePieceRight();
        accumulatedX = 0;
    } else if (accumulatedX < -MOVE_THRESHOLD) {
        movePieceLeft();
        accumulatedX = 0;
    }

    if (accumulatedY > MOVE_THRESHOLD) {
        dropPieceDown();
        accumulatedY = 0;
    }

    lastX = currentX;
    lastY = currentY;
}, { passive: false });

document.addEventListener('touchend', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const touchDuration = Date.now() - touchStartTime;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (touchDuration < TIME_THRESHOLD && distance < TAP_THRESHOLD) {
        performTouchTap(touch.clientX, touch.clientY);
    }

    lastX = null;
    lastY = null;
    accumulatedX = 0;
    accumulatedY = 0;
}, { passive: false });


// #endregion

// #region manifest for progressive web app

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                console.log('Service Worker registered:', reg);
            })
            .catch(err => {
                console.error('Service Worker registration failed:', err);
            });
    });
}

// #endregion


// #region allows audio to resume when reopened, esp in PWA in iOS, with overlay

// iOS detection
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.userAgent.includes('Macintosh') && 'ontouchend' in document);
}

// Overlay creation
let audioOverlay = null;
function showAudioOverlay() {
    if (!audioOverlay) {
        audioOverlay = document.createElement('div');
        audioOverlay.id = 'audio-resume-overlay';
        audioOverlay.style.position = 'fixed';
        audioOverlay.style.top = '0';
        audioOverlay.style.left = '0';
        audioOverlay.style.width = '100vw';
        audioOverlay.style.height = '100vh';
        audioOverlay.style.background = 'rgba(0,0,0,0.85)';
        audioOverlay.style.display = 'flex';
        audioOverlay.style.flexDirection = 'column';
        audioOverlay.style.justifyContent = 'center';
        audioOverlay.style.alignItems = 'center';
        audioOverlay.style.zIndex = '9999';
        audioOverlay.innerHTML = '<div style="color: white; font-size: 2em; text-align: center; margin-bottom: 1em;">Audio paused by iOS.<br>Tap anywhere to resume.</div>';
        document.body.appendChild(audioOverlay);
    } else {
        audioOverlay.style.display = 'flex';
    }
}
function hideAudioOverlay() {
    if (audioOverlay) {
        audioOverlay.style.display = 'none';
    }
}

// Track if mainTheme was playing and not muted before suspend
let wasMainThemePlaying = false;

function recreateHowlerAndResume() {
    // Remove old Howler instance's audio context if possible
    try {
        if (Howler.ctx && Howler.ctx.close) {
            Howler.ctx.close();
        }
    } catch (e) {}
    // Remove Howler global ctx to force new context
    try {
        delete Howler.ctx;
        Howler._setup();
    } catch (e) {}

    // Recreate tetrisSprite and playIfIdle
    window.tetrisSprite = new Howl({
        src: [
            'sounds/tetrisSprite.ogg',
            'sounds/tetrisSprite.m4a',
            'sounds/tetrisSprite.mp3',
            'sounds/tetrisSprite.ac3'
        ],
        sprite: {
            fullLine: [0, 2400],
            gameOver: [3500, 6636.167800453513],
            mainTheme: [11000, 167524.33106575964],
            newLevel: [179500, 904.104308390032],
            rotate: [181000, 57.9365079365175]
        }
    });
    window.playIfIdle = createPerSpriteIdlePlayer(window.tetrisSprite);
    if (mute) window.tetrisSprite.volume(0);

    // Play a short silent sound to unlock audio (iOS hack)
    try {
        var ctx = Howler.ctx;
        var buffer = ctx.createBuffer(1, 1, 22050);
        var source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
    } catch (e) {}

    // Resume mainTheme if it was playing and not muted
    if (wasMainThemePlaying && mute == false) {
        setTimeout(function() {
            window.playIfIdle("mainTheme", { loop: true });
        }, 100); // slight delay to ensure Howler is ready
    }

    hideAudioOverlay();
}

// Resume audio or show overlay on iOS
const resumeAudio = () => {
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
        Howler.ctx.resume().catch(() => {
            if (isIOS()) showAudioOverlay();
        });
    } else if (isIOS() && (!Howler.ctx || Howler.ctx.state !== 'running')) {
        showAudioOverlay();
    }
    window.removeEventListener('touchstart', resumeAudio);
    window.removeEventListener('click', resumeAudio);
};

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Track if mainTheme is playing and not muted before suspend
        try {
            wasMainThemePlaying = false;
            if (typeof tetrisSprite !== 'undefined' && tetrisSprite && tetrisSprite.playing) {
                // Howler's playing() returns true if any sound is playing, but we want to check mainTheme
                var ids = tetrisSprite._sprite && tetrisSprite._sprite.mainTheme ? tetrisSprite._getSoundIds() : [];
                for (var i = 0; i < ids.length; i++) {
                    var id = ids[i];
                    if (tetrisSprite._sounds) {
                        var sound = tetrisSprite._soundById(id);
                        if (sound && sound._sprite === 'mainTheme' && tetrisSprite.playing(id) && mute == false) {
                            wasMainThemePlaying = true;
                            break;
                        }
                    }
                }
            }
        } catch (e) { wasMainThemePlaying = false; }

        if (isIOS()) {
            // Try to resume, but if fails, show overlay
            if (Howler.ctx && Howler.ctx.state === 'suspended') {
                Howler.ctx.resume().catch(() => {
                    showAudioOverlay();
                });
            } else if (!Howler.ctx || Howler.ctx.state !== 'running') {
                showAudioOverlay();
            }
        } else {
            // Non-iOS: try to resume as before
            Howler.ctx && Howler.ctx.resume && Howler.ctx.resume().catch(() => {
                window.addEventListener('touchstart', resumeAudio, { once: true });
                window.addEventListener('click', resumeAudio, { once: true });
            });
        }
    }
});

// Overlay tap handler (iOS only)
document.addEventListener('click', function overlayTapHandler(e) {
    if (audioOverlay && audioOverlay.style.display === 'flex') {
        recreateHowlerAndResume();
    }
}, true);
document.addEventListener('touchstart', function overlayTouchHandler(e) {
    if (audioOverlay && audioOverlay.style.display === 'flex') {
        recreateHowlerAndResume();
    }
}, true);

// #endregion


// #region keyboard and mouse listners
document.addEventListener('keydown', (e) => {
    pressedKeys.add(e.key);
    // disable arrow keys default behaviour i.e. scrolling the browser window up/down
    switch (e.key) {
        case "ArrowLeft":
            e.preventDefault();
        case "ArrowRight":
            e.preventDefault();
        case "ArrowUp":
            e.preventDefault();
        case "ArrowDown":
            e.preventDefault();
    }
}
);

document.addEventListener('keyup', (e) => {
    pressedKeys.delete(e.key);
    keyboardTimer = 0;
}
);
let canvas;
let context;
let secondsPassed = 0;
let oldTimeStamp = 0;
document.addEventListener("mousedown", function (e) {
    getMouseClickPosition(canvas, e);
});
//# endregion

// #endregion
// #endregion

// #region gameLoop
function gameLoop(timeStamp) {
    // Calculate how much time has passed
    secondsPassed = (timeStamp - oldTimeStamp) / 1000;
    oldTimeStamp = timeStamp;
    update(secondsPassed);
    // Move forward in time with a maximum amount
    secondsPassed = Math.min(secondsPassed, 0.1);
    draw();
    // Keep requesting new frames
    window.requestAnimationFrame(gameLoop);
}
// #endregion

// #region pre-load images etc and start the gameLoop... (doesn't seem to work with audio so do that in game variables section)
window.onload = init;
function init() {
    // #region Load Images
    let imagesLoaded = 0;
    const numberImages = 6; // Set number of images to load
    tetrisLogo.src = "images/tetrisLogo.png";
    tetrisLogo.onload = function () {
        imagesLoaded++;
        if (imagesLoaded == numberImages) {
            createCanvas();
        }
    }
    gameOver.src = "images/gameOver.png";
    gameOver.onload = function () {
        imagesLoaded++;
        if (imagesLoaded == numberImages) {
            createCanvas();
        }
    }
    controls.src = "images/controls.png";
    controls.onload = function () {
        imagesLoaded++;
        if (imagesLoaded == numberImages) {
            createCanvas();
        }
    }
    soundOn.src = "images/soundOn.png";
    soundOn.onload = function () {
        imagesLoaded++;
        if (imagesLoaded == numberImages) {
            createCanvas();
        }
    }
    soundOff.src = "images/soundOff.png";
    soundOff.onload = function () {
        imagesLoaded++;
        if (imagesLoaded == numberImages) {
            createCanvas();
        }
    }
    church.src = "images/church.png";
    church.onload = function () {
        imagesLoaded++;
        if (imagesLoaded == numberImages) {
            createCanvas();
        }
    }

    // #endregion
}
function createCanvas() {
    canvas = document.getElementById('canvas');
    context = canvas.getContext('2d');
    canvas.height = baseHeight;
    canvas.width = baseWidth;
    resizeCanvas();

    // Start the first frame request
    window.requestAnimationFrame(gameLoop);
    gameLoad();
}
//   #endregion

// #region classes (cannot reference before declared, hence at the top)

// #endregion

// #region game Variables
// Images must pre-loaded in the initialise section above
// #region images & sprite sheets
const tetrisLogo = new Image(1024, 377);
const gameOver = new Image(1024, 274);
const controls = new Image(785, 363);
const soundOff = new Image(78, 64);
const soundOn = new Image(78, 64);
const church = new Image(577, 333);

// #endregion
// Native canvas size (will scale with window size changes, but coordinate system remains at this)
const baseWidth = 370;
const baseHeight = 803;
const keyboardDelay = 0.3; // seconds before a pressed key will repeat

window.tetrisSprite = new Howl({
    src: [
        'sounds/tetrisSprite.ogg',
        'sounds/tetrisSprite.m4a',
        'sounds/tetrisSprite.mp3',
        'sounds/tetrisSprite.ac3'
    ],
    sprite: {
        fullLine: [0, 2400],
        gameOver: [3500, 6636.167800453513],
        mainTheme: [11000, 167524.33106575964],
        newLevel: [179500, 904.104308390032],
        rotate: [181000, 57.9365079365175]
    }
});
window.playIfIdle = createPerSpriteIdlePlayer(window.tetrisSprite);
if (mute) window.tetrisSprite.volume(0);

let keyboardTimer;
let canvasColour = "black"
let scale = 1; // scale that the canvas is drawn. Will change afcter resize
let xOffset = 10;
let yOffset = 93;
let mouseX = 0;
let mouseY = 0;
let brickSize = 35; // pixel width and height of each cell
let nextBrickSize = 20;
// #region gameBoard
const gameBoard = [];
for (let row = 0; row < 20; row++) {
    let line = [];
    for (let column = 0; column < 10; column++) {
        line.push(".");
    }
    gameBoard.push(line);
}
// #endregion
// #region Tetris Pieces
const TetrisPieceType = {
    O: "O",
    I: "I",
    T: "T",
    L: "L",
    J: "J",
    S: "S",
    Z: "Z"
};

const TetrisPieces = {
    [TetrisPieceType.O]: [
        [
            [false, false, false, false],
            [false, true, true, false],
            [false, true, true, false],
            [false, false, false, false]
        ],
        [
            [false, false, false, false],
            [false, true, true, false],
            [false, true, true, false],
            [false, false, false, false]
        ],
        [
            [false, false, false, false],
            [false, true, true, false],
            [false, true, true, false],
            [false, false, false, false]
        ],
        [
            [false, false, false, false],
            [false, true, true, false],
            [false, true, true, false],
            [false, false, false, false]
        ]
    ],
    [TetrisPieceType.I]: [
        [
            [false, false, false, false],
            [true, true, true, true],
            [false, false, false, false],
            [false, false, false, false]
        ],
        [
            [false, true, false, false],
            [false, true, false, false],
            [false, true, false, false],
            [false, true, false, false]
        ],
        [
            [false, false, false, false],
            [true, true, true, true],
            [false, false, false, false],
            [false, false, false, false]
        ],
        [
            [false, true, false, false],
            [false, true, false, false],
            [false, true, false, false],
            [false, true, false, false]
        ]
    ],
    [TetrisPieceType.T]: [
        [
            [false, false, false, false],
            [true, true, true, false],
            [false, true, false, false],
            [false, false, false, false]
        ],
        [
            [false, true, false, false],
            [true, true, false, false],
            [false, true, false, false],
            [false, false, false, false]
        ],
        [
            [false, false, false, false],
            [false, true, false, false],
            [true, true, true, false],
            [false, false, false, false]
        ],
        [
            [false, true, false, false],
            [false, true, true, false],
            [false, true, false, false],
            [false, false, false, false]
        ]
    ],
    [TetrisPieceType.L]: [
        [
            [false, false, false, false],
            [true, true, true, false],
            [true, false, false, false],
            [false, false, false, false]
        ],
        [
            [true, true, false, false],
            [false, true, false, false],
            [false, true, false, false],
            [false, false, false, false]
        ],
        [
            [false, false, false, false],
            [false, false, true, false],
            [true, true, true, false],
            [false, false, false, false]
        ],
        [
            [false, true, false, false],
            [false, true, false, false],
            [false, true, true, false],
            [false, false, false, false]
        ]
    ],
    [TetrisPieceType.J]: [
        [
            [false, false, false, false],
            [true, true, true, false],
            [false, false, true, false],
            [false, false, false, false]
        ],
        [
            [false, true, false, false],
            [false, true, false, false],
            [true, true, false, false],
            [false, false, false, false]
        ],
        [
            [false, false, false, false],
            [true, false, false, false],
            [true, true, true, false],
            [false, false, false, false]
        ],
        [
            [true, true, false, false],
            [true, false, false, false],
            [true, false, false, false],
            [false, false, false, false]
        ]
    ],
    [TetrisPieceType.S]: [
        [
            [false, false, false, false],
            [false, true, true, false],
            [true, true, false, false],
            [false, false, false, false]
        ],
        [
            [true, false, false, false],
            [true, true, false, false],
            [false, true, false, false],
            [false, false, false, false]
        ],
        [
            [false, false, false, false],
            [false, true, true, false],
            [true, true, false, false],
            [false, false, false, false]
        ],
        [
            [true, false, false, false],
            [true, true, false, false],
            [false, true, false, false],
            [false, false, false, false]
        ]
    ],
    [TetrisPieceType.Z]: [
        [
            [false, false, false, false],
            [true, true, false, false],
            [false, true, true, false],
            [false, false, false, false]
        ],
        [
            [false, true, false, false],
            [true, true, false, false],
            [true, false, false, false],
            [false, false, false, false]
        ],
        [
            [false, false, false, false],
            [true, true, false, false],
            [false, true, true, false],
            [false, false, false, false]
        ],
        [
            [false, true, false, false],
            [true, true, false, false],
            [true, false, false, false],
            [false, false, false, false]
        ]
    ]
};
// #endregion
let t = new tetromino(getRandomTetrisPieceType());
let n = new tetromino(getRandomTetrisPieceType());
let gameState; // 0 = title screen, 1 = playing, 2 = game over
let dropDelay = 1 // time between auto drop
let dropTimer;
let gameOverTimer = 0;
let level;
let score;
let lines;
let gameOverDisplay = false;

// #endregion

// #region gameLoad
function gameLoad() {
    newGame();
    gameState = 0;
}
// #endregion

// #region update game state
function update(secondsPassed) {
    keyboardTimer -= secondsPassed;
    dropTimer += secondsPassed;
    gameOverTimer += secondsPassed;

    switch (gameState) {
        case 0: // title screen
            checkMouseClickButtons();
            if (isKeyDown(' ') && dropTimer > 0.5) {
                window.playIfIdle("mainTheme", { loop: true });
                newGame();
            }
            break;

        case 1: // playing
            if (keyboardTimer < 0) {
                if (isKeyDown('ArrowLeft')) {
                    movePieceLeft();
                }
                if (isKeyDown('ArrowRight')) {
                    movePieceRight();
                }
                if (isKeyDown('ArrowUp')) {
                    rotatePiece();
                }
                if (isKeyDown('ArrowDown')) {
                    dropPieceDown();
                }
            }

            if (dropTimer > dropDelay) {

                if (mutate(t.getCol(), t.getRow() + 1, t.getOrientation()) == true) {
                    dropTimer = 0;
                } else {
                    pieceLanded();
                    checkCompleteRows();
                    copyNtoT();
                    n = new tetromino(getRandomTetrisPieceType());
                    if (mutate(t.getCol(), t.getRow(), t.getOrientation()) == false) {
                        gameState = 2;
                        dropTimer = 0;
                        gameOverTimer = 0
                        window.tetrisSprite.stop();
                        window.playIfIdle("gameOver");

                    }
                    dropTimer = dropDelay;
                }
            }
            checkMouseClickButtons();
            break;

        case 2: // game over
            if (gameOverTimer > 0.5) {
                toggleGameOverDisplay();
                gameOverTimer = 0;
            }
            if (isKeyDown(' ')) {
                clearBoard();
                dropTimer = 0;
                gameState = 0;
            }
            checkMouseClickButtons();
            break;

        default:
            break;
    }
}
// #endregion

// #region draw Each Frame to Canvas
function draw() {
    context.clearRect(0, 0, baseWidth, baseHeight);
    context.fillStyle = canvasColour;
    context.fillRect(0, 0, baseWidth, baseHeight);

    switch (gameState) {
        case 0:
            drawBackground();
            drawGameBoard();
            // drawScore();

            context.drawImage(controls, 0, 0, 785, 363, 35, 470, 300, 139);

            context.drawImage(church, 0, 0, 577, 333, 41, 120, 289, 167);

            context.fillStyle = "white";
            context.font = "bold 16px Courier New";
            context.fillText("if (completedLines % 10) == 0 {", 30, 320);
            context.fillText("    level += 1 ;", 30, 340);
            context.fillText("    if (dropDelay > 0.2s) {", 30, 360);
            context.fillText("        dropDelay -= 0.1s;", 30, 380);
            context.fillText("   }", 30, 400);
            context.fillText("}", 30, 420);

            context.fillStyle = "white";
            context.font = "bold 20px Courier New";
            drawCentredText(context, "swipe or arrow keys to move", 630);
            drawCentredText(context, "tap or arrow-up to rotate", 650);

            context.fillStyle = "yellow";
            context.font = "bold 20px Courier New";
            drawCentredText(context, "a javaScript game", 750);
            drawCentredText(context, "by Neil Kendall 2025", 780);

            if (mute == false) {
                context.drawImage(soundOn, 0, 0, 78, 64, 235, 60, 32, 32);
            } else {
                context.drawImage(soundOff, 0, 0, 78, 64, 235, 60, 32, 32);
            }

            break;
        case 1:
            context.fillStyle = "#ADADAD";
            drawBackground();
            drawGameBoard();
            drawTetromino();
            drawNextTetromino();
            drawScore();
            if (mute == false) {
                context.drawImage(soundOn, 0, 0, 78, 64, 235, 60, 32, 32);
            } else {
                context.drawImage(soundOff, 0, 0, 78, 64, 235, 60, 32, 32);
            }
            break;
        case 2:
            drawBackground();
            drawGameBoard();
            drawScore();
            if (gameOverDisplay == true) {
                context.drawImage(gameOver, 0, 0, 1024, 274, 10, 300, 350, 94);
            }
            if (mute == false) {
                context.drawImage(soundOn, 0, 0, 78, 64, 235, 60, 32, 32);
            } else {
                context.drawImage(soundOff, 0, 0, 78, 64, 235, 60, 32, 32);
            }
            break;
        default:
            break;
    }
}
// #endregionred

// #region other methods

function resizeCanvas() {
    const gameWidth = canvas.width;
    const gameHeight = canvas.height;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const scaleX = windowWidth / gameWidth;
    const scaleY = windowHeight / gameHeight;
    scale = Math.min(scaleX, scaleY);
    canvas.style.transform = `scale(${scale})`;
    canvas.style.position = 'absolute';
    canvas.style.left = `${(windowWidth - gameWidth * scale) / 2}px`;
    canvas.style.top = `${(windowHeight - gameHeight * scale) / 2}px`;
}

function getMouseClickPosition(canvas, event) {
    let rect = canvas.getBoundingClientRect();
    let x = event.clientX - rect.left;
    let y = event.clientY - rect.top;
    mouseX = Math.round(x / scale);
    mouseY = Math.round(y / scale);
}

function drawGameBoard() {
    context.fillStyle = "black";
    context.strokeStyle = "black";

    for (let row = 0; row < 20; row++) {
        for (let column = 0; column < 10; column++) {
            if (gameBoard[row][column] != ".") {
                context.fillStyle = gameBoard[row][column];
                context.fillRect(xOffset + column * brickSize, yOffset + row * brickSize, brickSize, brickSize);
                context.strokeRect(xOffset + column * brickSize, yOffset + row * brickSize, brickSize, brickSize);
            }
        }
    }
}

function mutate(newX, newY, newO) {
    for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
            if (TetrisPieces[t.getType()][newO][dy][dx] == true) {
                if ((newX + dx) > -1 && (newX + dx) < 10 && (newY + dy) > -1 && (newY + dy) < 20) {
                    if (gameBoard[newY + dy][newX + dx] != ".") {
                        return (false);
                    }
                } else {
                    return (false);
                }
            }
        }
    }
    t.setCol(newX);
    t.setRow(newY);
    t.setOrientation(newO);
    return (true);
}

function drawTetromino() {
    context.fillStyle = t.getColor();
    context.lineWidth = 2;
    context.strokeStyle = "black";
    for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
            if (t.getCell(row, column) == true) {
                context.fillRect(xOffset + (t.getCol() + column) * brickSize, yOffset + (t.getRow() + row) * brickSize, brickSize, brickSize);
                context.strokeRect(xOffset + (t.getCol() + column) * brickSize, yOffset + (t.getRow() + row) * brickSize, brickSize, brickSize);
            }
        }
    }
}

function drawNextTetromino() {
    context.fillStyle = n.getColor();
    context.lineWidth = 2;
    context.strokeStyle = "white";
    for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
            if (n.getCell(row, column) == true) {
                context.fillRect(280 + column * nextBrickSize, 7 + row * nextBrickSize, nextBrickSize, nextBrickSize);
                context.strokeRect(280 + + column * nextBrickSize, 7 + row * nextBrickSize, nextBrickSize, nextBrickSize);
            }
        }
    }
}

function getRandomTetrisPieceType() {
    const types = Object.keys(TetrisPieceType);
    const randomIndex = Math.floor(Math.random() * types.length);
    return TetrisPieceType[types[randomIndex]];
}

function pieceLanded() {
    for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
            if (t.getCell(row, column) == true) {
                gameBoard[t.getRow() + row][t.getCol() + column] = t.getColor();
            }
        }
    }
}
function checkCompleteRows() {
    let rowFull;
    for (let row = 0; row < 20; row++) {
        rowFull = true;
        for (let column = 0; column < 10; column++) {
            if (gameBoard[row][column] == ".") {
                rowFull = false;
            }
        }
        if (rowFull == true) {
            lines += 1;
            window.playIfIdle("fullLine");
            if (lines % 10 == 0) {
                level += 1;
                window.playIfIdle("newLevel");
                if (dropDelay > 0.2) {
                    dropDelay -= 0.1;
                }
            }
            compressBoard(row);
        }
    }
}

function compressBoard(r) {
    for (let y = r - 1; y > 0; y--) {
        for (let x = 0; x < 10; x++) {
            gameBoard[y + 1][x] = gameBoard[y][x];
        }
    }
}

function newGame() {
    score = 0;
    level = 1;
    lines = 0;
    dropDelay = 0.6;
    gameState = 1;
    dropTimer = 0;
}

function drawBackground() {
    context.fillStyle = "#1A2F42 ";
    context.drawImage(tetrisLogo, 0, 0, 1024, 377, 0, 0, 250, 92);
    context.fillRect(xOffset, yOffset, 10 * brickSize, 20 * brickSize);
}

function drawScore() {
    context.font = "bold 32px Arial";
    context.fillStyle = "yellow";
    context.strokeStyle = "black";
    context.fillText("Lines  " + lines, xOffset + 10, yOffset + 35);

    context.fillText("Level  " + level, xOffset + 220, yOffset + 35);

}

function clearBoard() {
    for (let row = 0; row < 20; row++) {
        for (let column = 0; column < 10; column++) {
            gameBoard[row][column] = ".";
        }
    }
}

function copyNtoT() {
    t.setType(n.getType());
    t.setCol(n.getCol());
    t.setRow(n.getRow());
    t.setOrientation(n.getOrientation());
    t.setColor(n.getColor());
}

function movePieceLeft() {
    if (mutate(t.getCol() - 1, t.getRow(), t.getOrientation()) == true) {
        keyboardTimer = keyboardDelay;
    }
}

function movePieceRight() {
    if (mutate(t.getCol() + 1, t.getRow(), t.getOrientation()) == true) {
        keyboardTimer = keyboardDelay;
    }
}

function dropPieceDown() {
    if (mutate(t.getCol(), t.getRow() + 1, t.getOrientation()) == true) {
        keyboardTimer = 0;
    }
}

function rotatePiece() {
    if (mutate(t.getCol(), t.getRow(), (t.getOrientation() + 1) % 4) == true) {
    window.playIfIdle("rotate");
        keyboardTimer = keyboardDelay;
    }
}

function performTouchTap(x, y) {
    let rect = canvas.getBoundingClientRect();
    let mouseX = (x - rect.left) / scale;
    let mouseY = (y - rect.top) / scale;
    switch (gameState) {
        case 0:
            if (mouseX > 235 && mouseX < 267 && mouseY > 60 && mouseY < 92) {
                toggleMute();
            } else {
                newGame();
                window.playIfIdle("mainTheme", { loop: true });
            }
            break;
        case 1:

            if (mouseX > 235 && mouseX < 267 && mouseY > 60 && mouseY < 92) {
                toggleMute();
            } else {
                rotatePiece();
                window.playIfIdle("rotate");
            }
            break;
        case 2:
            if (mouseX > 235 && mouseX < 267 && mouseY > 60 && mouseY < 92) {
                toggleMute();
            } else {
                if (dropTimer > 3) {
                    clearBoard();
                    dropTimer = 0;
                    gameState = 0;
                }
            }
            break;
        default:
            break;
    }
}

function toggleGameOverDisplay() {
    if (gameOverDisplay == false) {
        gameOverDisplay = true;
    } else {
        gameOverDisplay = false;
    }
}

function createPerSpriteIdlePlayer(howlInstance) {
    const activeIds = {};

    return function playIfIdle(spriteName, options = {}) {
        const currentId = activeIds[spriteName];

        if (!currentId || !howlInstance.playing(currentId)) {
            const newId = howlInstance.play(spriteName);
            activeIds[spriteName] = newId;

            // Set loop if specified
            if (options.loop !== undefined) {
                howlInstance.loop(options.loop, newId);
            }

            // Set volume if specified
            if (options.volume !== undefined) {
                howlInstance.volume(options.volume, newId);
            }

            // Set rate if specified
            if (options.rate !== undefined) {
                howlInstance.rate(options.rate, newId);
            }

            // Clear tracking when sound ends (if not looping)
            if (!options.loop) {
                howlInstance.once('end', (id) => {
                    if (activeIds[spriteName] === id) {
                        delete activeIds[spriteName];
                    }
                });
            }

            return newId;
        }

        return null;
    };
}

function toggleMute() {
    if (mute == true) {
        mute = false;
        window.tetrisSprite.volume(1);
    } else {
        mute = true;
        window.tetrisSprite.volume(0);
    }
    mouseX = 0;
    mouseY = 0;
}

function checkMouseClickButtons() {
    if (mouseX > 235 && mouseX < 267 && mouseY > 60 && mouseY < 92) {
        toggleMute();
    }
}

function drawCentredText(ctx, textString, y) {
    let textWidth = ctx.measureText(textString).width;
    ctx.fillText(textString, (baseWidth / 2) - (textWidth / 2), y);
}

// #endregion
