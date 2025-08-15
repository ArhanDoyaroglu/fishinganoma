// Simple fishing game - MVP
// Mechanics: drop & reel, fish catching, automatic selling, upgrades

/**
 * Game constants
 */
let CANVAS_WIDTH = window.innerWidth;
let CANVAS_HEIGHT = window.innerHeight;
const WATER_TOP_Y = 80; // water surface in world coordinates (0 down +)
const BOAT_Y = WATER_TOP_Y - 12; // world coordinate
let LINE_X = CANVAS_WIDTH / 2;
const HOOK_RADIUS = 8;
const HORIZONTAL_SMOOTHING = 0.18; // hook horizontal smoothness coefficient
let cameraY = 0; // world->screen scrolling
let boatScreenY = 0; // boat height on screen (slightly above center)
let lineAnchorX = null; // fishing line start point (fisherman rod tip)
let lineAnchorY = null;
// Top background image (forest/coast)
const fishingBgImg = new Image();
fishingBgImg.src = "fishingbg.png";
// Fisherman sprite (on boat)
const fishermanImg = new Image();
fishermanImg.src = "fisherman.png";

// Starting settings
const START_DEPTH = 2000; // fixed depth

// No upgrade system (fixed depth, score)

// Fish types (4 types) — speeds: White 1x, Blue 1.5x, Red 2x, Golden 3x
const FISH_SPEED_UNIT = 0.50; // 1x base speed (px/frame approx)
const FISH_TYPES = [
	{ key: "white", name: "White", color: "#ffffff", value: 5, speedMultiplier: 1.0, rarityDepth: 0.00 },
	{ key: "blue",  name: "Blue",  color: "#4dabf7", value: 15, speedMultiplier: 1.5, rarityDepth: 0.40 },
	{ key: "red",   name: "Red", color: "#ff6b6b", value: 25, speedMultiplier: 2.0, rarityDepth: 0.65 },
	{ key: "golden",name: "Golden",  color: "#ffd43b", value: 50, speedMultiplier: 3.0, rarityDepth: 0.85 }
];

/**
 * Helper functions
 */
function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
	return a + (b - a) * t;
}

function randRange(min, max) {
	return Math.random() * (max - min) + min;
}

/**
 * Leaderboard system
 */
let leaderboard = [];

async function loadLeaderboard() {
	try {
		const response = await fetch('/api/leaderboard');
		if (response.ok) {
			leaderboard = await response.json();
		} else {
			leaderboard = [];
		}
	} catch (error) {
		console.error('Error loading leaderboard:', error);
		leaderboard = [];
	}
}

async function addToLeaderboard(playerName, score) {
	try {
		const response = await fetch('/api/leaderboard', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ name: playerName, score: score })
		});
		
		if (response.ok) {
			// Reload leaderboard to get updated data
			await loadLeaderboard();
		}
	} catch (error) {
		console.error('Error adding to leaderboard:', error);
	}
}

function updateLeaderboardDisplay() {
	const leaderboardList = document.getElementById('leaderboardList');
	leaderboardList.innerHTML = '';
	
	if (leaderboard.length === 0) {
		// Show empty leaderboard message
		const emptyDiv = document.createElement('div');
		emptyDiv.className = 'empty-leaderboard';
		emptyDiv.innerHTML = `
			<div class="empty-message">
				<p>🏆 No scores yet!</p>
				<p>Be the first to set a record!</p>
			</div>
		`;
		leaderboardList.appendChild(emptyDiv);
		return;
	}
	
	leaderboard.forEach((entry, index) => {
		const entryDiv = document.createElement('div');
		entryDiv.className = 'leaderboard-entry';
		entryDiv.innerHTML = `
			<div class="rank">${index + 1}</div>
			<div class="player-name">${entry.name}</div>
			<div class="score">${entry.score} pts</div>
		`;
		leaderboardList.appendChild(entryDiv);
	});
}

/**
 * Game state
 */
const state = {
	coins: 0,
	topScore: 0,
	playerName: "",
	get maxDepth() {
		return START_DEPTH;
	},
	// round state
	phase: "idle", // idle | dropping | rising
	lineY: WATER_TOP_Y,
	hookY: WATER_TOP_Y,
	hookX: LINE_X,
	hookTargetX: LINE_X,
	hookCollected: [],
	minYReached: WATER_TOP_Y,
	// fish list
	fish: [],
	fallSpeed: 3.5,
	riseSpeed: 1.75
};

/**
 * UI elements
 */
const elScore = document.getElementById("score");
const elTopScore = document.getElementById("topScore");
const resultsModal = document.getElementById("resultsModal");
const modalScore = document.getElementById("modalScore");
const fishCounts = document.getElementById("fishCounts");
const tryAgainBtn = document.getElementById("tryAgainBtn");
const nameModal = document.getElementById("nameModal");
const playerNameInput = document.getElementById("playerName");
const startGameBtn = document.getElementById("startGameBtn");
const showLeaderboardBtn = document.getElementById("showLeaderboardBtn");
const leaderboardModal = document.getElementById("leaderboardModal");
const closeLeaderboardBtn = document.getElementById("closeLeaderboardBtn");
const playerNameDisplay = document.getElementById("playerNameDisplay");

/**
 * Initialize game
 */
async function initGame() {
	await loadLeaderboard();
	
	// Check if player name is already saved
	const savedPlayerName = localStorage.getItem('fishingAnomaPlayerName');
	const savedTopScore = localStorage.getItem('fishingAnomaTopScore');
	
	if (savedPlayerName) {
		// Player has played before, restore their data
		state.playerName = savedPlayerName;
		state.topScore = savedTopScore ? parseInt(savedTopScore) : 0;
		playerNameDisplay.textContent = savedPlayerName;
		updateUI();
		resetRun(); // Start game directly
	} else {
		// First time player, show name input
		showNameModal();
	}
}

function showNameModal() {
	nameModal.style.display = 'block';
	playerNameInput.focus();
}

function hideNameModal() {
	nameModal.style.display = 'none';
}

function startGame() {
	const name = playerNameInput.value.trim();
	if (name.length < 2) {
		alert("Please enter a name (at least 2 characters)");
		return;
	}
	
	state.playerName = name;
	playerNameDisplay.textContent = name;
	
	// Save player name to localStorage
	localStorage.setItem('fishingAnomaPlayerName', name);
	
	hideNameModal();
	resetRun();
}

/**
 * Canvas
 */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
function resizeCanvas() {
	CANVAS_WIDTH = window.innerWidth;
	CANVAS_HEIGHT = window.innerHeight;
	canvas.width = CANVAS_WIDTH;
	canvas.height = CANVAS_HEIGHT;
	LINE_X = CANVAS_WIDTH / 2;
	boatScreenY = Math.round(CANVAS_HEIGHT * 0.4);
	// when window changes, fix the water line to the center slightly above
	cameraY = state.hookY - Math.round(CANVAS_HEIGHT * 0.48);
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// Horizontal control (during rising)
let isPointerDown = false;

/**
 * Fish model
 */
function createFishField() {
	state.fish = [];
	const targetCount = 36; // increased depth, increased count by 1.5x
	for (let i = 0; i < targetCount; i++) {
		const depth = randRange(WATER_TOP_Y + 40, WATER_TOP_Y + state.maxDepth);
		const t = (depth - WATER_TOP_Y) / state.maxDepth; // 0..1 depth ratio
		// Select fish based on depth
		const candidates = FISH_TYPES.filter(ft => t >= ft.rarityDepth - 0.1);
		const fishType = candidates[Math.floor(Math.random() * candidates.length)] || FISH_TYPES[0];
		// Use type speed multiplier: White 1x, Blue 1.5x, Red 2x, Golden 3x
		const valueScaledSpeed = FISH_SPEED_UNIT * fishType.speedMultiplier;
		state.fish.push({
			x: randRange(40, CANVAS_WIDTH - 40),
			y: depth,
			vx: (Math.random() < 0.5 ? -1 : 1) * valueScaledSpeed,
			type: fishType,
			caught: false
		});
	}
}

function resetRun() {
	state.phase = "idle";
	state.lineY = WATER_TOP_Y;
	state.hookY = WATER_TOP_Y;
	state.hookX = LINE_X;
	state.hookTargetX = LINE_X;
	state.hookCollected = [];
	state.minYReached = WATER_TOP_Y;
	// Reset score for new round
	state.coins = 0;
	createFishField();
	// first frame water line should be in correct position
	cameraY = state.hookY - Math.round(CANVAS_HEIGHT * 0.48);
	updateUI();
}

// upgrade system removed

/**
 * UI
 */
function updateUI() {
	elScore.textContent = state.coins.toString();
	elTopScore.textContent = state.topScore.toString();
	
	// Save top score to localStorage
	localStorage.setItem('fishingAnomaTopScore', state.topScore.toString());
}

/**
 * Show fishing results modal
 */
function showResultsModal() {
	// Calculate fish counts
	const fishCount = {};
	for (const fish of state.hookCollected) {
		const type = fish.type.key;
		fishCount[type] = (fishCount[type] || 0) + 1;
	}
	
	// Update modal content
	modalScore.textContent = state.coins.toString();
	playerNameDisplay.textContent = state.playerName;
	
	// Clear previous fish counts
	fishCounts.innerHTML = '';
	
	// Add fish count rows
	for (const type of FISH_TYPES) {
		const count = fishCount[type.key] || 0;
		if (count > 0) {
			const fishCountDiv = document.createElement('div');
			fishCountDiv.className = `fish-count ${type.key}`;
			fishCountDiv.innerHTML = `
				<div class="fish-name">
					<img src="shrimps/${type.key}shrimp.png" class="fish-icon" alt="${type.name} Shrimp">
					<span>${type.name} Shrimp</span>
				</div>
				<span>${count} × ${type.value} pts = ${count * type.value} pts</span>
			`;
			fishCounts.appendChild(fishCountDiv);
		}
	}
	
	// Show modal
	resultsModal.style.display = 'block';
}

/**
 * Hide results modal
 */
function hideResultsModal() {
	resultsModal.style.display = 'none';
}

/**
 * Show leaderboard modal
 */
function showLeaderboardModal() {
	updateLeaderboardDisplay();
	leaderboardModal.style.display = 'block';
}

/**
 * Hide leaderboard modal
 */
function hideLeaderboardModal() {
	leaderboardModal.style.display = 'none';
}

/**
 * Try again button event
 */
tryAgainBtn.addEventListener('click', () => {
	hideResultsModal();
	resetRun();
});

/**
 * Interaction: click -> drop/reel
 */
canvas.addEventListener("click", () => {
	if (state.phase === "idle") {
		state.phase = "dropping";
	}
});

canvas.addEventListener("pointerdown", (e) => {
	if (state.phase !== "rising" && state.phase !== "dropping") return;
	isPointerDown = true;
	state.hookTargetX = clamp(e.offsetX, 20, CANVAS_WIDTH - 20);
	try { canvas.setPointerCapture(e.pointerId); } catch {}
});

canvas.addEventListener("pointermove", (e) => {
	if (state.phase !== "rising" && state.phase !== "dropping") return;
	if (!isPointerDown) return;
	state.hookTargetX = clamp(e.offsetX, 20, CANVAS_WIDTH - 20);
});

canvas.addEventListener("pointerup", (e) => {
	isPointerDown = false;
	try { canvas.releasePointerCapture(e.pointerId); } catch {}
});

canvas.addEventListener("pointercancel", () => { isPointerDown = false; });

/**
 * Interaction: click -> drop/reel
 */
canvas.addEventListener("click", () => {
	if (state.phase === "idle") {
		state.phase = "dropping";
	}
});


canvas.addEventListener("pointerdown", (e) => {
	if (state.phase !== "rising" && state.phase !== "dropping") return;
	isPointerDown = true;
	state.hookTargetX = clamp(e.offsetX, 20, CANVAS_WIDTH - 20);
	try { canvas.setPointerCapture(e.pointerId); } catch {}
});

canvas.addEventListener("pointermove", (e) => {
	if (state.phase !== "rising" && state.phase !== "dropping") return;
	if (!isPointerDown) return;
	state.hookTargetX = clamp(e.offsetX, 20, CANVAS_WIDTH - 20);
});

canvas.addEventListener("pointerup", (e) => {
	isPointerDown = false;
	try { canvas.releasePointerCapture(e.pointerId); } catch {}
});

canvas.addEventListener("pointercancel", () => { isPointerDown = false; });

/**
 * Physics and drawing
 */
function update(dt) {
	// fish oscillate horizontally
	for (const fish of state.fish) {
		if (fish.caught) continue;
		fish.x += fish.vx;
		if (fish.x < 30) {
			fish.x = 30;
			fish.vx *= -1;
		} else if (fish.x > CANVAS_WIDTH - 30) {
			fish.x = CANVAS_WIDTH - 30;
			fish.vx *= -1;
		}
	}

	if (state.phase === "dropping") {
		state.hookY += state.fallSpeed;
		state.minYReached = Math.max(state.minYReached, state.hookY);
		state.hookX = lerp(state.hookX, state.hookTargetX, HORIZONTAL_SMOOTHING);
		// camera: keep water line slightly above center (~%48)
		cameraY = state.hookY - Math.round(CANVAS_HEIGHT * 0.48);
		if (state.hookY >= WATER_TOP_Y + state.maxDepth) {
			state.hookY = WATER_TOP_Y + state.maxDepth;
			state.phase = "rising"; // reached bottom, now automatically reels up; player will steer left/right
		}
	}

	if (state.phase === "rising") {
		state.hookY -= state.riseSpeed; // slow upward movement
		// horizontal smoothing: linear interpolation towards target X
		state.hookX = lerp(state.hookX, state.hookTargetX, HORIZONTAL_SMOOTHING);
		cameraY = state.hookY - Math.round(CANVAS_HEIGHT * 0.48);
		// collision: collect fish near the hook and add instant score
		for (const fish of state.fish) {
			if (fish.caught) continue;
			const dx = Math.abs(fish.x - state.hookX);
			const dy = Math.abs(fish.y - state.hookY);
			if (dx < 22 && dy < 14) {
				fish.caught = true;
				state.hookCollected.push(fish);
				state.coins += fish.type.value;
			}
		}
		if (state.hookY <= WATER_TOP_Y) {
			// Check for new top score before resetting
			if (state.coins > state.topScore) {
				state.topScore = state.coins;
			}
			
			// Add to leaderboard
			addToLeaderboard(state.playerName, state.coins);
			
			// Show results modal
			showResultsModal();
			
			// Don't reset immediately - wait for user to click Try Again
			// resetRun() will be called when Try Again is clicked
		}
	}
}



function draw() {
	ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	const waterScreenY = WATER_TOP_Y - cameraY;
	const boatYScreen = waterScreenY - 12; // boat body top, slightly above water line

	// Top background: fill the area above the water line with a fixed image
	// Fixed to the top of the screen; clipped only up to the water line
	if (fishingBgImg.complete && fishingBgImg.naturalWidth) {
		const sW = fishingBgImg.naturalWidth;
		const sH = fishingBgImg.naturalHeight;
		// Image's bottom edge should align with water line; scale to ensure enough height
		const scale = Math.max(CANVAS_WIDTH / sW, Math.max(1, waterScreenY) / sH);
		const drawW = sW * scale;
		const drawH = sH * scale;
		const dx = (CANVAS_WIDTH - drawW) / 2;
		const dy = Math.floor(waterScreenY - drawH); // align bottom edge to water line
		if (waterScreenY > 0) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, CANVAS_WIDTH, Math.floor(waterScreenY));
			ctx.clip();
			ctx.drawImage(fishingBgImg, dx, dy, drawW, drawH);
			ctx.restore();
		}
	}

	// Water surface line
	ctx.fillStyle = "#0b2a46";
	ctx.fillRect(0, waterScreenY, CANVAS_WIDTH, 2);
	// Old sandals image removed

	// Place fisherman sprite on the water line immediately above
	if (fishermanImg.complete && fishermanImg.naturalWidth) {
		const baseW = Math.min(64, CANVAS_WIDTH * 0.08);
		const maxW = baseW * 2; // 2x enlarge
		const ratio = fishermanImg.naturalHeight / fishermanImg.naturalWidth;
		const w = maxW;
		const h = Math.max(32, w * ratio);
		const fx = LINE_X + Math.max(10, CANVAS_WIDTH * 0.02) - w / 2; // slightly right
		const fy = Math.floor(waterScreenY - h); // adjacent to water line
		ctx.drawImage(fishermanImg, fx, fy, w, h);
		// Approximate anchor for the rod tip: top/front of the image
		lineAnchorX = fx + w * 0.18;
		lineAnchorY = fy + h * 0.16;
	}

	// Depth markers
	ctx.strokeStyle = "rgba(255,255,255,0.15)";
	ctx.lineWidth = 1;
	for (let y = WATER_TOP_Y + 40; y <= WATER_TOP_Y + state.maxDepth; y += 40) {
		ctx.beginPath();
		ctx.moveTo(20, y - cameraY);
		ctx.lineTo(CANVAS_WIDTH - 20, y - cameraY);
		ctx.stroke();
	}

	// Fishing line: start point of the fisherman's rod tip; black
	ctx.strokeStyle = "#111";
	ctx.lineWidth = 2;
	ctx.beginPath();
	const lineStartX = lineAnchorX ?? LINE_X + Math.max(10, CANVAS_WIDTH * 0.02);
	const lineStartY = lineAnchorY ?? boatYScreen - 12;
	ctx.moveTo(lineStartX, lineStartY);
	ctx.lineTo(state.hookX, state.hookY - cameraY);
	ctx.stroke();

	// Hook (vector)
	drawHook(state.hookX, state.hookY - cameraY);

	// Fish
	for (const fish of state.fish) {
		if (fish.caught) continue;
		drawFish(fish.x, fish.y - cameraY, fish.type.color);
	}

	// Caught fish appear above the hook
	let stackOffset = 0;
	for (const f of state.hookCollected) {
		drawFish(state.hookX, (state.hookY - cameraY) - 18 - stackOffset, f.type.color, true);
		stackOffset += 14;
	}

	// UI bottom metrics
	ctx.fillStyle = "rgba(0,0,0,0.25)";
	ctx.fillRect(0, CANVAS_HEIGHT - 32, CANVAS_WIDTH, 32);
	ctx.fillStyle = "#e6f4ff";
	ctx.font = "14px Segoe UI, Arial";
	ctx.fillText(`Depth: ${Math.floor(state.hookY - WATER_TOP_Y)} / ${state.maxDepth}`, 14, CANVAS_HEIGHT - 12);
}

function drawFish(x, y, color, vertical = false) {
	// Placeholder for vector drawing, but we'll use sprites if available
	const sprite = getFishSpriteForColor(color);
	if (sprite && sprite.img && sprite.img.complete) {
		const w = sprite.w * SPRITE_SCALE, h = sprite.h * SPRITE_SCALE;
		ctx.save();
		ctx.translate(x, y);
		if (vertical) ctx.rotate(-Math.PI / 2);
		ctx.drawImage(sprite.img, -w / 2, -h / 2, w, h);
		ctx.restore();
		return;
	}
	ctx.save();
	ctx.translate(x, y);
	if (vertical) ctx.rotate(-Math.PI / 2);
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.ellipse(0, 0, 16, 8, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "#1d1d1d";
	ctx.beginPath();
	ctx.arc(6, -2, 1.6, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

// Sprite loading: whiteshrimp, blueshrimp, redshrimp, goldenshrimp
const fishSprites = {
	white: { path: "shrimps/whiteshrimp.png", img: null, w: 28, h: 18 },
	blue: { path: "shrimps/blueshrimp.png", img: null, w: 28, h: 18 },
	red: { path: "shrimps/redshrimp.png", img: null, w: 28, h: 18 },
	golden: { path: "shrimps/goldenshrimp.png", img: null, w: 28, h: 18 }
};

// Sprite size scale
const SPRITE_SCALE = 1.5;

function loadFishSprites() {
	for (const key in fishSprites) {
		const rec = fishSprites[key];
		const img = new Image();
		img.src = rec.path;
		rec.img = img;
	}
}

function getFishSpriteForColor(color) {
	// Instead of matching color to type key, we could move the `type.key` in the `drawFish` function.
	// For now, a simple approach: guess by color.
	if (color === "#ffffff") return fishSprites.white;
	if (color === "#4dabf7") return fishSprites.blue;
	if (color === "#ff6b6b") return fishSprites.red;
	if (color === "#ffd43b") return fishSprites.golden;
	return null;
}

// Simple vector hook drawing
function drawHook(x, y) {
	const r = 9;
	ctx.save();
	ctx.translate(x, y);
	// Metalic body - main stroke
	ctx.strokeStyle = "#cfd8e3"; // light metal
	ctx.lineWidth = 3;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(0, -16);
	ctx.lineTo(0, -2);
	ctx.stroke();
	// Hook hook
	ctx.beginPath();
	ctx.arc(4, 5, r, Math.PI * 0.35, Math.PI * 1.25);
	ctx.stroke();
	// Brightness highlight
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 1.4;
	ctx.beginPath();
	ctx.arc(6, 3, r - 2.5, Math.PI * 0.35, Math.PI * 0.8);
	ctx.stroke();
	// Shadow highlight
	ctx.strokeStyle = "#8a98a8";
	ctx.lineWidth = 1.6;
	ctx.beginPath();
	ctx.arc(3, 7, r - 1.2, Math.PI * 0.9, Math.PI * 1.2);
	ctx.stroke();
	ctx.restore();
}

/**
 * Game loop
 */
let last = 0;
function loop(ts) {
	const dt = Math.min(33, ts - last);
	last = ts;
	update(dt / 16.67);
	draw();
	updateUI();
	requestAnimationFrame(loop);
}

// Event listeners
startGameBtn.addEventListener('click', startGame);
showLeaderboardBtn.addEventListener('click', showLeaderboardModal);
closeLeaderboardBtn.addEventListener('click', hideLeaderboardModal);

// Enter key support for name input
playerNameInput.addEventListener('keypress', (e) => {
	if (e.key === 'Enter') {
		startGame();
	}
});

// Initialize game instead of starting immediately
initGame();
requestAnimationFrame(loop);

// Load sprites
loadFishSprites();

