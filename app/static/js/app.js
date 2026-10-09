// OmniVision Astra — Frontend Application Controller

let videoElement, arCanvas, hudEngine;
let isScanning = false;
let isContinuous = false;
let continuousInterval = null;
let currentMode = "general";
let speechRecognition = null;
let isListening = false;
let audioCtx = null;
let lastSpokenText = "";

document.addEventListener("DOMContentLoaded", async () => {
  videoElement = document.getElementById("webcamVideo");
  arCanvas = document.getElementById("arCanvas");
  hudEngine = new ARHUDCanvas(arCanvas);

  initCamera();
  initClock();
  initSpeechRecognition();
  setupUIListeners();
  checkEngineStatus();
});

// 1. Initialize Real-Time Digital Clock
function initClock() {
  const clockEl = document.getElementById("liveClock");
  const update = () => {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString();
    }
  };
  update();
  setInterval(update, 1000);
}

// 2. Initialize Camera Feed
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user"
      },
      audio: false
    });
    videoElement.srcObject = stream;
    const statusEl = document.getElementById("cameraStatus");
    if (statusEl) {
      statusEl.textContent = "ACTIVE (720P)";
      statusEl.parentElement.className = "flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/50 text-emerald-400 text-[11px]";
    }
  } catch (err) {
    console.error("Camera access failed:", err);
    const statusEl = document.getElementById("cameraStatus");
    if (statusEl) {
      statusEl.textContent = "OFFLINE";
      statusEl.parentElement.className = "flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-red-950/70 border border-red-500/50 text-red-400 text-[11px]";
    }
  }
}

// 3. Futuristic Web Audio Sound Chimes
function playChime(type = "scan") {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === "scan") {
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } else if (type === "target") {
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === "click") {
      osc.frequency.setValueAtTime(987.77, audioCtx.currentTime); // B5
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    }
  } catch (e) {
    // AudioContext may require user gesture on first interaction
  }
}

// 4. Quick Prompt Trigger Helper
window.setQuickPrompt = function(promptText) {
  const input = document.getElementById("promptInput");
  if (input) input.value = promptText;
  triggerAnalysis(promptText);
};

// 5. Capture Camera Frame and Analyze via Gemini
async function triggerAnalysis(customPrompt = null) {
  if (isScanning) return;
  isScanning = true;
  playChime("scan");

  const viewport = document.querySelector(".viewport-wrapper");
  if (viewport) viewport.classList.add("scanning");
  
  const statusTag = document.getElementById("scanStatusText");
  if (statusTag) statusTag.textContent = "ANALYZING SCENE...";

  // Capture video frame to offscreen canvas
  const offscreen = document.createElement("canvas");
  offscreen.width = videoElement.videoWidth || 640;
  offscreen.height = videoElement.videoHeight || 480;
  const offCtx = offscreen.getContext("2d");
  offCtx.drawImage(videoElement, 0, 0, offscreen.width, offscreen.height);
  const base64Image = offscreen.toDataURL("image/jpeg", 0.85);

  const promptInput = document.getElementById("promptInput");
  const prompt = customPrompt || (promptInput ? promptInput.value : "") || "Identify this object, break down its components, and explain its purpose.";

  try {
    const res = await fetch("/api/analyze-frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: base64Image,
        prompt: prompt,
        mode: currentMode
      })
    });

    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();

    handleVisionResponse(data);
  } catch (err) {
    console.error("Analysis failed:", err);
    const spokenBox = document.getElementById("spokenAnswer");
    if (spokenBox) spokenBox.textContent = "Inspection error: Unable to complete visual telemetry.";
  } finally {
    isScanning = false;
    if (viewport) viewport.classList.remove("scanning");
    if (statusTag) statusTag.textContent = "SYSTEM READY";
  }
}

// 6. Handle Vision Response & Update UI
function handleVisionResponse(data) {
  playChime("target");

  // Render AR Bounding Boxes on Canvas
  hudEngine.setAnnotations(data.annotations || []);

  // Update Spoken Text
  lastSpokenText = data.spoken_text;
  const spokenBox = document.getElementById("spokenAnswer");
  if (spokenBox) spokenBox.textContent = `"${data.spoken_text}"`;

  // Update Latency and Model Tags
  const latencyTag = document.getElementById("latencyTag");
  if (latencyTag) latencyTag.textContent = `${Math.round(data.latency_ms)}ms`;

  const modelTag = document.getElementById("modelTag");
  if (modelTag) modelTag.textContent = data.model_used;

  // Render Detected Entity Chips in Section B
  renderEntityChips(data.annotations || []);

  // Render Structured Markdown Breakdown in Section C
  const markdownBox = document.getElementById("markdownOutput");
  if (markdownBox) {
    markdownBox.innerHTML = formatMarkdown(data.detailed_markdown);
  }

  // Speak Aloud
  speakResponse(data.spoken_text);
}

// 7. Render Detected Entity Badges
function renderEntityChips(annotations) {
  const radarGraphic = document.getElementById("idleRadarGraphic");
  const chipsRow = document.getElementById("entityChipsRow");
  const countTag = document.getElementById("targetCountTag");

  if (!chipsRow) return;

  if (annotations.length === 0) {
    if (radarGraphic) radarGraphic.classList.remove("hidden");
    chipsRow.classList.add("hidden");
    if (countTag) countTag.textContent = "0 TARGETS";
    return;
  }

  if (radarGraphic) radarGraphic.classList.add("hidden");
  chipsRow.classList.remove("hidden");
  chipsRow.innerHTML = "";
  if (countTag) countTag.textContent = `${annotations.length} TARGETS`;

  annotations.forEach((item, idx) => {
    const box = item.box || {};
    const color = box.color || "#00f0ff";
    const label = box.label || `Target ${idx + 1}`;

    const chip = document.createElement("button");
    chip.className = "entity-chip";
    chip.style.borderColor = color;
    chip.innerHTML = `
      <span class="entity-dot" style="background-color: ${color}; color: ${color};"></span>
      <span class="font-bold">${label}</span>
    `;
    chip.title = item.description || label;

    chip.addEventListener("click", () => {
      playChime("click");
      // Highlight in speech box or focus
      const spokenBox = document.getElementById("spokenAnswer");
      if (spokenBox && item.description) {
        spokenBox.textContent = `[${label}]: ${item.description}`;
        speakResponse(`${label}. ${item.description}`);
      }
    });

    chipsRow.appendChild(chip);
  });
}

// 8. Text-to-Speech (TTS)
function speakResponse(text) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const naturalVoice = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Female") || v.name.includes("Siri")));
  if (naturalVoice) utterance.voice = naturalVoice;

  const wave = document.getElementById("audioWaveform");
  utterance.onstart = () => { if (wave) wave.classList.remove("hidden"); };
  utterance.onend = () => { if (wave) wave.classList.add("hidden"); };
  utterance.onerror = () => { if (wave) wave.classList.add("hidden"); };

  window.speechSynthesis.speak(utterance);
}

window.replaySpeech = function() {
  if (lastSpokenText) {
    playChime("click");
    speakResponse(lastSpokenText);
  }
};

// 9. Speech Recognition (Speech-to-Text)
function initSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    const mic = document.getElementById("micBtn");
    if (mic) mic.style.display = "none";
    return;
  }

  speechRecognition = new SpeechRec();
  speechRecognition.continuous = false;
  speechRecognition.interimResults = false;
  speechRecognition.lang = "en-US";

  speechRecognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const promptInput = document.getElementById("promptInput");
    if (promptInput) promptInput.value = transcript;
    triggerAnalysis(transcript);
  };

  speechRecognition.onend = () => {
    isListening = false;
    const mic = document.getElementById("micBtn");
    if (mic) mic.classList.remove("active");
  };
}

function toggleVoiceInput() {
  if (!speechRecognition) return;
  playChime("click");
  if (!isListening) {
    speechRecognition.start();
    isListening = true;
    const mic = document.getElementById("micBtn");
    if (mic) mic.classList.add("active");
  } else {
    speechRecognition.stop();
    isListening = false;
    const mic = document.getElementById("micBtn");
    if (mic) mic.classList.remove("active");
  }
}

// 10. UI Listeners & Keyboard Shortcuts
function setupUIListeners() {
  // Mode selection buttons
  document.querySelectorAll(".mode-capsule").forEach(btn => {
    btn.addEventListener("click", () => {
      playChime("click");
      document.querySelectorAll(".mode-capsule").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentMode = btn.dataset.mode;
      hudEngine.clear();
      triggerAnalysis();
    });
  });

  // Enter key on prompt input
  const promptInput = document.getElementById("promptInput");
  if (promptInput) {
    promptInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") triggerAnalysis();
    });
  }

  // Spacebar shortcut to scan (when not focused on text input)
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && document.activeElement !== document.getElementById("promptInput")) {
      e.preventDefault();
      triggerAnalysis();
    }
  });
}

function toggleContinuous() {
  const btn = document.getElementById("continuousBtn");
  isContinuous = !isContinuous;
  playChime("click");
  if (isContinuous) {
    if (btn) {
      btn.classList.add("active");
      btn.innerHTML = `<span>⏹ STOP</span>`;
    }
    triggerAnalysis();
    continuousInterval = setInterval(() => triggerAnalysis(), 4000);
  } else {
    if (btn) {
      btn.classList.remove("active");
      btn.innerHTML = `🔄 <span class="hidden sm:inline">AUTO</span>`;
    }
    clearInterval(continuousInterval);
  }
}

async function checkEngineStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    const tag = document.getElementById("engineModeTag");
    if (tag) tag.textContent = data.model;
  } catch (e) {
    console.error("Could not fetch engine status", e);
  }
}

// 11. High-Tech Markdown Formatter
function formatMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/^### (.*$)/gim, '<h2>$1</h2>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^\- (.*$)/gim, '<li>$1</li>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<div class="h-2"></div>')
    .replace(/\n/g, '<br>');
}
