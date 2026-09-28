// Qwen chatbot widget — praat met het lokale Qwen model via /api/chat.
(function () {
  const widget = document.getElementById("chat-widget");
  const toggle = document.getElementById("chat-toggle");
  const closeBtn = document.getElementById("chat-close");
  const panel = document.getElementById("chat-panel");
  const messagesEl = document.getElementById("chat-messages");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const statusEl = document.getElementById("chat-status");

  if (!widget || !toggle || !closeBtn || !panel || !messagesEl || !form || !input) return;

  let history = [];
  const MAX_HISTORY = 40;

  const setStatus = (text, ok) => {
    statusEl.textContent = text;
    statusEl.className = ok ? "ok" : "err";
  };

  const scrollDown = () => { messagesEl.scrollTop = messagesEl.scrollHeight; };

  const addMessage = (role, text) => {
    const el = document.createElement("div");
    el.className = "chat-msg " + (role === "user" ? "user" : "assistant");
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollDown();
    return el;
  };

  const addTyping = () => {
    const el = document.createElement("div");
    el.className = "chat-msg assistant typing";
    el.textContent = "…";
    messagesEl.appendChild(el);
    scrollDown();
    return el;
  };

  const trimHistory = () => {
    if (history.length > MAX_HISTORY) history = history.slice(history.length - MAX_HISTORY);
  };

  toggle.addEventListener("click", () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    if (opening) input.focus();
  });

  closeBtn.addEventListener("click", () => { panel.hidden = true; });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";

    addMessage("user", text);
    history.push({ role: "user", content: text });
    trimHistory();

    const typing = addTyping();
    const submitBtn = form.querySelector("button[type=submit]");
    if (submitBtn) submitBtn.disabled = true;

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      let data = null;
      try { data = await r.json(); } catch (e) {}

      typing.remove();

      if (!r.ok) {
        const msg = (data && data.error) || ("Fout " + r.status);
        const errEl = addMessage("assistant", "⚠ " + msg);
        errEl.classList.add("error");
        setStatus("niet beschikbaar", false);
        return;
      }

      const reply = (data && data.reply) || "";
      if (reply) {
        addMessage("assistant", reply);
        history.push({ role: "assistant", content: reply });
        trimHistory();
        setStatus("verbonden", true);
      }
    } catch (err) {
      typing.remove();
      const el = addMessage("assistant", "⚠ Netwerkfout: " + (err && err.message ? err.message : err));
      el.classList.add("error");
      setStatus("niet bereikbaar", false);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      input.focus();
    }
  });

  addMessage("assistant", "Hallo! Ik ben je lokale Qwen assistent. Stel gerust een vraag.");
  fetch("/api/chat/status")
    .then((r) => r.json())
    .then((s) => {
      if (s.keySet) setStatus("gereed · " + s.model, true);
      else setStatus(s.model + " · geen API key", false);
    })
    .catch(() => setStatus("status onbekend", false));
})();
