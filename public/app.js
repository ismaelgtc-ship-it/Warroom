const statusEl = document.getElementById("status");
const detailsEl = document.getElementById("details");
const refreshBtn = document.getElementById("refresh");

async function checkStatus() {
  const base = window.WARROOM_CONFIG?.OVERSEER_PUBLIC_URL;
  if (!base) {
    statusEl.textContent = "Config error";
    return;
  }

  try {
    const res = await fetch(`${base}/healthz`);
    const data = await res.json();

    if (res.ok) {
      statusEl.textContent = "UP";
      statusEl.style.color = "limegreen";
      detailsEl.textContent = JSON.stringify(data, null, 2);
    } else {
      throw new Error("Bad response");
    }
  } catch (err) {
    statusEl.textContent = "DOWN";
    statusEl.style.color = "red";
    detailsEl.textContent = err.message;
  }
}

refreshBtn.addEventListener("click", checkStatus);
checkStatus();
