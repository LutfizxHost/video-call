<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>WebRTC Simple Call</title>
  <style>
    body { font-family: system-ui, Arial, sans-serif; margin: 0; padding: 16px; background:#0f172a; color:#e2e8f0;}
    .app { max-width: 960px; margin: 0 auto; }
    .card { background:#111827; border:1px solid #1f2937; border-radius:16px; padding:16px; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
    .row { display:flex; gap:12px; flex-wrap: wrap; align-items: center;}
    input[type=text]{ padding:10px 12px; border-radius:12px; border:1px solid #334155; background:#0b1220; color:#e2e8f0; outline:none;}
    button{ padding:10px 14px; border-radius:12px; border:1px solid #334155; background:#1f2937; color:#e2e8f0; cursor:pointer;}
    button:disabled{ opacity:.6; cursor:not-allowed;}
    video{ width:100%; max-height: 38vh; background:#000; border-radius:16px; }
    .grid{ display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
    @media (max-width: 800px){ .grid{ grid-template-columns: 1fr; } }
    .badge{font-size:12px; padding:4px 8px; border-radius:999px; background:#0b1220; border:1px solid #334155;}
    .spacer{height:8px;}
  </style>
</head>
<body>
<div class="app">
  <h2>💬 Simple Video Call (WebRTC)</h2>
  <div class="card">
    <div class="row">
      <label>Room ID:</label>
      <input id="roomId" type="text" placeholder="mis: ruang-123" />
      <button id="joinBtn">Join</button>
      <span id="status" class="badge">Belum terhubung</span>
    </div>
    <div class="spacer"></div>
    <div class="row">
      <button id="callBtn" disabled>Start Call</button>
      <button id="hangupBtn" disabled>Akhiri</button>
      <button id="muteBtn" disabled>Mute</button>
      <button id="camBtn" disabled>Matikan Kamera</button>
      <span id="peers" class="badge">Peers: 0</span>
    </div>
  </div>

  <div class="spacer"></div>

  <div class="grid">
    <div class="card">
      <h3>🎥 Kamera Saya</h3>
      <video id="localVideo" autoplay playsinline muted></video>
    </div>
    <div class="card">
      <h3>👥 Lawan Bicara</h3>
      <video id="remoteVideo" autoplay playsinline></video>
    </div>
  </div>
</div>

<script>
const roomInput = document.getElementById("roomId");
const joinBtn = document.getElementById("joinBtn");
const callBtn = document.getElementById("callBtn");
const hangupBtn = document.getElementById("hangupBtn");
const muteBtn = document.getElementById("muteBtn");
const camBtn = document.getElementById("camBtn");
const statusEl = document.getElementById("status");
const peersEl = document.getElementById("peers");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let ws, pc, localStream, remoteStream;
let isMuted = false;
let isCamOff = false;
let hasPeer = false;

const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // Untuk produksi, tambahkan TURN Anda sendiri:
    // { urls: "turn:YOUR_TURN_HOST:3478", username: "user", credential: "pass" },
  ],
};

function setStatus(text){ statusEl.textContent = text; }
function setPeers(n){ peersEl.textContent = "Peers: " + n; }

async function initMedia(){
  if (localStream) return;
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
}

function createPeer(){
  pc = new RTCPeerConnection(iceServers);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  // kirim track lokal
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  // terima track remote
  pc.ontrack = (e) => {
    e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
    }
  };

  pc.onconnectionstatechange = () => {
    setStatus("PC: " + pc.connectionState);
  };
}

joinBtn.onclick = async () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return alert("Isi Room ID dulu.");
  await initMedia();

  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "join", roomId }));
    setStatus("Terhubung ke signaling.");
  };
  ws.onmessage = async (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === "room-joined") {
      setPeers(data.peers);
      callBtn.disabled = false;
      hangupBtn.disabled = false;
      muteBtn.disabled = false;
      camBtn.disabled = false;
    }
    if (data.type === "peer-joined") {
      hasPeer = true;
      setPeers(2);
    }
    if (data.type === "peer-left") {
      hasPeer = false;
      setPeers(1);
      if (pc) pc.close();
      pc = null;
      remoteVideo.srcObject = null;
    }
    if (data.type === "offer") {
      await initMedia();
      if (!pc) createPeer();
      await pc.setRemoteDescription(data.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: "answer", answer }));
    }
    if (data.type === "answer") {
      if (!pc) return;
      await pc.setRemoteDescription(data.answer);
    }
    if (data.type === "ice") {
      if (pc && data.candidate) {
        try { await pc.addIceCandidate(data.candidate); } catch(e){ console.error(e); }
      }
    }
  };
  ws.onclose = () => setStatus("Signaling terputus.");
  ws.onerror = () => setStatus("Signaling error.");
};

callBtn.onclick = async () => {
  if (!ws) return;
  if (!pc) createPeer();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "offer", offer }));
};

hangupBtn.onclick = () => {
  if (pc) pc.close();
  pc = null;
  remoteVideo.srcObject = null;
  ws && ws.close();
  setStatus("Diputus.");
};

muteBtn.onclick = () => {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  muteBtn.textContent = isMuted ? "Unmute" : "Mute";
};

camBtn.onclick = () => {
  isCamOff = !isCamOff;
  localStream.getVideoTracks().forEach(t => t.enabled = !isCamOff);
  camBtn.textContent = isCamOff ? "Nyalakan Kamera" : "Matikan Kamera";
};

// Minta izin kamera di awal agar cepat
navigator.mediaDevices.getUserMedia({video:true,audio:true})
  .then(s => { s.getTracks().forEach(t=>t.stop()); })
  .catch(err => alert("Izin kamera/mic ditolak: " + err.message));
</script>
</body>
</html>