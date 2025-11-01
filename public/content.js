console.log("✅ Content script loaded");

document.addEventListener("focusin", async (event) => {
  if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") {
    console.log("🟢 Input field focused:", event.target);

    try {
      // Fetch the stored verification code
      const result = await chrome.storage.local.get("verificationCodes");
      const latestCode = result.verificationCodes || "N/A";

      console.log("📦 Retrieved code:", latestCode);

      if (latestCode && latestCode !== "N/A") {
        showOverlay(latestCode.code, event.target);
      }
    } catch (err) {
      console.error("❌ Error reading verification code:", err);
    }
  }
});

function showOverlay(code, inputElement) {
  // Avoid duplicate overlays
  if (document.getElementById("gmail-helper-overlay")) return;

  // Create overlay
  const overlay = document.createElement("div");
  overlay.id = "gmail-helper-overlay";
  overlay.textContent = `🔑 ${code}`;
  overlay.style.position = "absolute";
  overlay.style.background = "#111";
  overlay.style.color = "#fff";
  overlay.style.padding = "6px 10px";
  overlay.style.borderRadius = "6px";
  overlay.style.fontSize = "13px";
  overlay.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
  overlay.style.cursor = "pointer";
  overlay.style.zIndex = "999999";

  // Copy code on click
  overlay.onclick = () => {
    navigator.clipboard.writeText(code);
    overlay.textContent = "✅ Copied!";
    setTimeout(() => overlay.remove(), 1000);
  };

  // Get input's position
  const rect = inputElement.getBoundingClientRect();
  overlay.style.top = `${window.scrollY + rect.bottom + 6}px`; // below input
  overlay.style.left = `${window.scrollX + rect.left}px`;

  document.body.appendChild(overlay);

  // Auto-remove after a few seconds
  setTimeout(() => overlay.remove(), 5000);
}
