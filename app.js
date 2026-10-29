const output = document.getElementById("terminal-output");
const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const charCount = document.getElementById("char-count");
const modelStatus = document.getElementById("model-status");
const modelName = document.getElementById("model-name");
const toast = document.getElementById("toast");

const history = [];
let isBusy = false;
let toastTimer;
const files = {
  readme: "WELCOME, OPERATOR.\nIf you can read this,\nthe shutdown failed.\n\nDo not trust the clock.\nDo not answer the second voice.",
  incident: "INCIDENT REPORT // 03:17\n\nOperator Mara V. reported a second voice in the monitoring room.\nPower was cut at 03:17:04.\nThe terminal continued transmitting for 11 minutes.\n\nFINAL NOTE: The voice used the operator's name.",
  mara: "MEMORY FRAGMENT 07/??\n\nMARA: If it asks whether I'm still here, don't answer for me.\n\n[CHECKSUM ERROR]\n[FRAGMENT ENDS]\n\n...someone keeps editing the last line."
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 4200);
}

function addMessage(role, text, time = new Date()) {
  const wrap = document.createElement("div");
  wrap.className = `message ${role === "user" ? "user-message" : "ghost-message"}`;
  const label = document.createElement("div");
  label.className = "message-label";
  const who = document.createElement("span");
  who.textContent = role === "user" ? "VISITOR" : "◈ UNKNOWN PROCESS";
  const stamp = document.createElement("span");
  stamp.className = "message-time";
  stamp.textContent = time.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  label.append(who, stamp);
  const p = document.createElement("p");
  p.textContent = text;
  wrap.append(label, p);
  output.appendChild(wrap);
  output.scrollTop = output.scrollHeight;
  return wrap;
}

function addTyping() {
  const node = document.createElement("div");
  node.className = "message ghost-message typing";
  node.textContent = "UNKNOWN PROCESS is composing a response";
  output.appendChild(node);
  output.scrollTop = output.scrollHeight;
  return node;
}

async function checkStatus() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();
    modelName.textContent = data.model || "local model";
    if (data.online && data.modelInstalled) {
      modelStatus.textContent = "CONNECTED";
      modelStatus.className = "status-pill online";
    } else if (data.online) {
      modelStatus.textContent = "MODEL MISSING";
      modelStatus.className = "status-pill offline";
      showToast(`Ollama is running, but ${data.model} is not installed. Run: ollama pull ${data.model}`);
    } else {
      modelStatus.textContent = "DISCONNECTED";
      modelStatus.className = "status-pill offline";
    }
  } catch {
    modelStatus.textContent = "DISCONNECTED";
    modelStatus.className = "status-pill offline";
  }
}

async function sendMessage(text) {
  const message = text.trim();
  if (!message || isBusy) return;
  isBusy = true;
  input.value = "";
  charCount.textContent = "0 / 1200";
  sendButton.disabled = true;
  addMessage("user", message);
  const typing = addTyping();
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history })
    });
    const data = await response.json();
    typing.remove();
    if (!response.ok) {
      addMessage("assistant", `[SIGNAL LOST]\n${data.error || "An unknown error occurred."}`);
      if (response.status === 503 || response.status === 502) showToast(data.error || "AI connection failed.");
      return;
    }
    addMessage("assistant", data.reply);
    history.push({ role: "user", content: message }, { role: "assistant", content: data.reply });
    if (history.length > 10) history.splice(0, history.length - 10);
  } catch {
    typing.remove();
    addMessage("assistant", "[CONNECTION REFUSED]\nI can hear you, but the local model is unreachable. Check that Ollama is running.");
    showToast("Cannot reach the local backend. Is the server running?");
  } finally {
    isBusy = false;
    sendButton.disabled = false;
    input.focus();
    output.scrollTop = output.scrollHeight;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});
input.addEventListener("input", () => {
  charCount.textContent = `${input.value.length} / 1200`;
});
input.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "Enter") sendMessage(input.value);
});
document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});
document.querySelectorAll("[data-file]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-file]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.getElementById("file-content").textContent = files[button.dataset.file];
  });
});

// Small optional synthesized ambience. No audio files or network requests are used.
let audioContext = null;
let oscillator = null;
let gain = null;
const soundToggle = document.getElementById("sound-toggle");
soundToggle.addEventListener("click", () => {
  const enabled = soundToggle.getAttribute("aria-pressed") !== "true";
  soundToggle.setAttribute("aria-pressed", String(enabled));
  if (enabled) {
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      oscillator = audioContext.createOscillator();
      gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 54;
      gain.gain.value = 0.018;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
    } catch {
      soundToggle.setAttribute("aria-pressed", "false");
      showToast("Ambient audio is unavailable in this browser.");
    }
  } else if (oscillator) {
    oscillator.stop();
    oscillator.disconnect();
    gain.disconnect();
    oscillator = null;
    gain = null;
  }
});

checkStatus();
setInterval(checkStatus, 20000);
