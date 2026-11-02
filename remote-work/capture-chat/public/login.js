const form = document.getElementById("login-form");
const err = document.getElementById("login-error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.hidden = true;
  const email = document.getElementById("email").value.trim();
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    window.location.href = "/";
  } catch (ex) {
    err.textContent = ex.message || "Connexion refusée";
    err.hidden = false;
  }
});
