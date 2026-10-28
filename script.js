const BROKER = "wss://broker.emqx.io:8084/mqtt";
const PREFIX = "hoosha-patoogh-v1/";
let client = null, myId = null, myName = "", myRoom = "";
let users = new Map(), lastTyping = 0, typingTimers = {};
const $ = (id) => document.getElementById(id);
function makeCode() {
  const c = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
function getRoomFromUrl() {
  const u = new URLSearchParams(location.search);
  return (u.get("room") || "").toUpperCase().trim();
}
window.addEventListener("DOMContentLoaded", () => {
  const r = getRoomFromUrl();
  if (r) $("roomInput").value = r;
  const saved = localStorage.getItem("patoogh-name");
  if (saved) $("nameInput").value = saved;
});
$("randomBtn").onclick = () => { $("roomInput").value = makeCode(); };
$("joinBtn").onclick = () => {
  myName = $("nameInput").value.trim().slice(0, 20) || "مهمان";
  myRoom = $("roomInput").value.trim().toUpperCase() || makeCode();
  localStorage.setItem("patoogh-name", myName);
  myId = "u-" + Math.random().toString(36).slice(2, 9);
  $("joinScreen").classList.add("hidden");
  $("chatScreen").classList.remove("hidden");
  $("roomCode").textContent = myRoom;
  connect();
};
function topics() {
  const b = PREFIX + myRoom;
  return { msg: b + "/msg", presence: b + "/presence", typing: b + "/typing" };
}
function setStatus(on, t) {
  $("statusDot").className = "dot " + (on ? "on" : "off");
  $("statusText").textContent = t;
}
function connect() {
  setStatus(false, "در حال وصل‌شدن...");
  client = mqtt.connect(BROKER, { clientId: myId + "-" + Date.now(), clean: true, reconnectPeriod: 3000, connectTimeout: 10000 });
  const T = topics();
  client.on("connect", () => {
    setStatus(true, "وصل شدی");
    client.subscribe([T.msg, T.presence, T.typing]);
    sendPresence("join");
    setInterval(() => sendPresence("heartbeat"), 10000);
    setInterval(cleanup, 5000);
    addSys(myName + " وارد پاتوق شد");
  });
  client.on("message", (topic, buf) => {
    try {
      const d = JSON.parse(buf.toString());
      if (topic.endsWith("/msg")) showMsg(d);
      else if (topic.endsWith("/presence")) onPresence(d);
      else if (topic.endsWith("/typing")) onTyping(d);
    } catch (e) {}
  });
  client.on("reconnect", () => setStatus(false, "قطع شد، تلاش دوباره..."));
  client.on("error", () => setStatus(false, "خطا در اتصال"));
}
function sendPresence(type) {
  if (!client || !client.connected) return;
  client.publish(topics().presence, JSON.stringify({ type, id: myId, name: myName, time: Date.now() }), { qos: 0 });
}
function cleanup() {
  const now = Date.now();
  let changed = false;
  for (let [id, u] of users) {
    if (now - u.last > 25000) { users.delete(id); changed = true; }
  }
  if (changed) renderUsers();
}
function onPresence(d) {
  if (!d.id) return;
  if (d.type === "leave") { users.delete(d.id); renderUsers(); if (d.id !== myId) addSys(d.name + " رفت"); return; }
  const isNew = !users.has(d.id);
  users.set(d.id, { name: d.name, last: Date.now() });
  renderUsers();
  if (isNew && d.id !== myId && d.type === "join") { addSys(d.name + " وارد شد"); sendPresence("heartbeat"); }
}
function renderUsers() {
  const ul = $("usersList");
  ul.innerHTML = "";
  const arr = [...users.values()];
  if (arr.length === 0) users.set(myId, { name: myName, last: Date.now() });
  for (let u of users.values()) {
    const li = document.createElement("li");
    li.textContent = u.name;
    ul.appendChild(li);
  }
  $("onlineCount").textContent = users.size;
}
function showMsg(d) {
  const box = $("messages");
  const div = document.createElement("div");
  if (d.id === "sys") { div.className = "msg sys"; div.textContent = d.text; }
  else {
    div.className = "msg " + (d.id === myId ? "me" : "other");
    const t = new Date(d.time).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
    const s = document.createElement("small");
    s.textContent = d.name + " • " + t;
    const p = document.createElement("div");
    p.textContent = d.text;
    div.appendChild(s); div.appendChild(p);
  }
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
function addSys(t) { showMsg({ id: "sys", text: t }); }
$("msgForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("msgInput").value.trim();
  if (!v || !client || !client.connected) return;
  const data = { id: myId, name: myName, text: v.slice(0, 500), time: Date.now() };
  client.publish(topics().msg, JSON.stringify(data));
  $("msgInput").value = "";
});
$("msgInput").addEventListener("input", () => {
  const now = Date.now();
  if (now - lastTyping < 2500 || !client || !client.connected) return;
  lastTyping = now;
  client.publish(topics().typing, JSON.stringify({ id: myId, name: myName }));
});
function onTyping(d) {
  if (!d || d.id === myId) return;
  $("typing").textContent = d.name + " در حال نوشتن است...";
  clearTimeout(typingTimers[d.id]);
  typingTimers[d.id] = setTimeout(() => { $("typing").textContent = ""; }, 3000);
}
$("copyLinkBtn").onclick = async () => {
  const link = location.origin + location.pathname + "?room=" + myRoom;
  try { await navigator.clipboard.writeText(link); $("copyLinkBtn").textContent = "کپی شد!"; }
  catch (e) { prompt("این لینک را کپی کن و بده به دوستات:", link); return; }
  setTimeout(() => $("copyLinkBtn").textContent = "کپی لینک دعوت", 2000);
};
$("leaveBtn").onclick = () => { try { sendPresence("leave"); client.end(); } catch (e) {} location.reload(); };
window.addEventListener("beforeunload", () => { try { sendPresence("leave"); } catch (e) {} });