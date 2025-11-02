console.log("✅ Content script loaded");

service_icons = {
  "gmail": `<svg
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Gmail"
    role="img"
    viewBox="0 0 512 512"
    width="12" height="12"
  >
    <rect width="512" height="512" rx="15%" fill="transparent" />
    <path d="M158 391v-142l-82-63V361q0 30 30 30" fill="#4285f4" />
    <path d="M 154 248l102 77l102-77v-98l-102 77l-102-77" fill="#ea4335" />
    <path d="M354 391v-142l82-63V361q0 30-30 30" fill="#34a853" />
    <path d="M76 188l82 63v-98l-30-23c-27-21-52 0-52 26" fill="#c5221f" />
    <path d="M436 188l-82 63v-98l30-23c27-21 52 0 52 26" fill="#fbbc04" />
  </svg>`
}

document.addEventListener("focusin", async (event) => {
  if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") {
    const inputElement = event.target;

    // 🟢 Load latest code
    try {
      const result = await chrome.storage.local.get("verificationCodes");
      const latestCode = result.verificationCodes;
      console.log("📦 Retrieved code:", latestCode);

      if (latestCode) {
        console.log("About to display overlay", latestCode);
        // Listen for mouse click to show overlay under cursor
        inputElement.addEventListener("mousedown", (mouseEvent) => {
          const mouseX = mouseEvent.pageX;
          const mouseY = mouseEvent.pageY;
          showOverlay(latestCode, inputElement, { x: mouseX, y: mouseY });
        }, { once: true }); // remove automatically after one click

        // Also show overlay immediately on focus (optional)
        showOverlay(latestCode, inputElement);
      }
    } catch (err) {
      console.error("❌ Error reading verification code:", err);
    }
  }
});

function closeOverlay() {
  const overlay = document.getElementById("gmail-helper-overlay");
  if (overlay) overlay.remove();

  // Mark the code as shown in storage
  chrome.storage.local.get("verificationCodes", (data) => {
    if (data.verificationCodes) {
      const updated = { ...data.verificationCodes, isShown: true };
      chrome.storage.local.set({ verificationCodes: updated });
    }
  });
}

function showOverlay(codeData, inputElement, mousePos = null) {
  if (codeData.isShown || !codeData) return;

  closeOverlay();

  // Remove old overlay if present
  const existing = document.getElementById("gmail-helper-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("button");
  overlay.id = "gmail-helper-overlay";
  overlay.innerHTML = `
  <div style="
    display: flex;
    align-items: center;
    gap: 8px;
  ">
    ${service_icons[codeData.service]}
    <span class="gmail-helper-code" style="font-weight: bold;">${codeData.code}</span>
    <button
      id="gmail-helper-close"
      style="
        background: transparent;
        border: none;
        color: white;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        opacity: 0.8;
        transition: opacity 0.2s ease;
      "
      title="Close"
    >×</button>
  </div>
`;

// Add listener for the close (X) button
overlay.querySelector("#gmail-helper-close").addEventListener("click", (e) => {
  e.stopPropagation(); // prevent triggering copy
  overlay.remove();
});
  overlay.className = "gmail-helper-floating";

  const rect = inputElement.getBoundingClientRect();

  // Default position: under the input
  let top = window.scrollY + rect.bottom + 8;
  let left = window.scrollX + rect.left;

  // If mouse position exists, position near cursor
  if (mousePos && mousePos.x && mousePos.y) {
    top = mousePos.y + 12;  // just below the cursor
    left = mousePos.x - 40; // center horizontally
  }

  overlay.style.top = `${top}px`;
  overlay.style.left = `${left}px`;

  // Paste directly into input when clicked
  overlay.onclick = () => {
    closeOverlay();
    inputElement.value = codeData.code;
    inputElement.dispatchEvent(new Event("input", { bubbles: true }));
    inputElement.dispatchEvent(new Event("change", { bubbles: true }));

    overlay.innerHTML = `<span class="gmail-helper-code">${service_icons[codeData.service]} Pasted!</span>`;
    // setTimeout(() => overlay.remove(), 1200);
  };

  // Inject styles once
  if (!document.getElementById("gmail-helper-style")) {
    const style = document.createElement("style");
    style.id = "gmail-helper-style";
    style.textContent = `
      .gmail-helper-floating {
        position: absolute;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        font-size: 12px;
        font-family: monospace;
        font-weight: bold;
        color: white;
        background-color: #21201E;
        border: none;
        border-radius: 9999px;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        z-index: 999999;
        transition: all 0.25s ease;
        opacity: 0;
        transform: translateY(5px);
        animation: gmailHelperFadeIn 0.25s forwards;
        outline: none;
      }

      .gmail-helper-floating:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
      }

      @keyframes gmailHelperFadeIn {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 4000);
}

