import {
  actionPower,
  createInitialState,
  isActionApproved,
  proposeAction,
  purchaseTokens,
  runHappyPathScenario,
  signAction,
  submitClaim,
  TOKEN_PAYMENT_INFO,
} from "./core.mjs";

const STORAGE_KEY = "bounty-desk-groups-demo:v1";

let state = loadState();

const els = {
  tokenStats: document.querySelector("#token-stats"),
  groupMembers: document.querySelector("#group-members"),
  claims: document.querySelector("#claims"),
  actions: document.querySelector("#actions"),
  events: document.querySelector("#events"),
  sdkTrace: document.querySelector("#sdk-trace"),
  purchaseForm: document.querySelector("#purchase-form"),
  claimForm: document.querySelector("#claim-form"),
  replaceForm: document.querySelector("#replace-form"),
  replaceProposer: document.querySelector("#replace-proposer"),
  resetButton: document.querySelector("#reset-demo"),
  scenarioButton: document.querySelector("#run-scenario"),
};

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return createInitialState();
  try {
    return JSON.parse(stored);
  } catch {
    return createInitialState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function update(mutator) {
  try {
    state = mutator(state);
    saveState();
    render();
  } catch (error) {
    showToast(error.message);
  }
}

function render() {
  renderTokenStats();
  renderMembers();
  renderClaims();
  renderActions();
  renderEvents();
  renderSdkTrace();
}

function renderTokenStats() {
  const { token } = state;
  els.tokenStats.innerHTML = `
    ${stat("Liquid", token.reporterLiquid, "Reporter can submit with these")}
    ${stat("Claim stake", token.staked, "Locked by open documents")}
    ${stat("Frozen", token.frozen, "Group has frozen this stake")}
    ${stat("Destroyed", token.destroyed, "Slop stake removed")}
    ${stat("Returned", token.returned, "Approved claim stake returned")}
  `;
}

function renderMembers() {
  els.groupMembers.innerHTML = state.group.members.map((member) => `
    <li>
      <span>
        <strong>${escapeHtml(member.name)}</strong>
        <small>${escapeHtml(member.id)}</small>
      </span>
      <b>${member.weight}</b>
    </li>
  `).join("");
  const currentValue = els.replaceProposer.value;
  els.replaceProposer.innerHTML = state.group.members.map((member) => (
    `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}</option>`
  )).join("");
  if (state.group.members.some((member) => member.id === currentValue)) {
    els.replaceProposer.value = currentValue;
  }
}

function renderClaims() {
  if (state.claims.length === 0) {
    els.claims.innerHTML = empty("No bounty claims yet. Buy a token and submit one.");
    return;
  }
  els.claims.innerHTML = state.claims.map((claim) => `
    <article class="claim ${claim.status}">
      <div>
        <span class="eyebrow">${escapeHtml(claim.id)} · ${escapeHtml(claim.severity)}</span>
        <h3>${escapeHtml(claim.title)}</h3>
        <p>${escapeHtml(claim.summary)}</p>
      </div>
      <div class="claim-meta">
        ${pill(claim.status)}
        ${pill(`${claim.stake} BNTY ${claim.stakeState}`)}
      </div>
      <div class="button-row">
        ${claimButton("approve-claim", claim.id, "Approve")}
        ${claimButton("freeze-claim", claim.id, "Freeze")}
        ${claimButton("destroy-slop-stake", claim.id, "Destroy slop")}
      </div>
    </article>
  `).join("");
}

function renderActions() {
  if (state.actions.length === 0) {
    els.actions.innerHTML = empty("No open group actions.");
    return;
  }
  els.actions.innerHTML = state.actions.map((action) => {
    const power = actionPower(state, action);
    const approved = isActionApproved(state, action);
    const signerButtons = state.group.members.map((member) => {
      const signed = action.signers.includes(member.id);
      const disabled = signed || action.status !== "collecting-signatures";
      return `<button class="small" data-sign="${action.id}" data-member="${member.id}" ${disabled ? "disabled" : ""}>${signed ? "Signed" : `Sign as ${escapeHtml(member.name)}`}</button>`;
    }).join("");
    return `
      <article class="action ${action.status}">
        <div>
          <span class="eyebrow">${escapeHtml(action.id)} · ${escapeHtml(action.type)}</span>
          <h3>${escapeHtml(actionLabel(action))}</h3>
          <p>${power}/${state.group.threshold} voting power${approved ? " · threshold met" : ""}</p>
        </div>
        <div class="progress" aria-label="${power} of ${state.group.threshold} voting power">
          <span style="width:${Math.min(100, (power / state.group.threshold) * 100)}%"></span>
        </div>
        <div class="button-row">${signerButtons}</div>
      </article>
    `;
  }).join("");
}

function renderEvents() {
  els.events.innerHTML = state.events.slice(0, 12).map((event) => `
    <li>
      <span class="dot ${escapeHtml(event.type)}"></span>
      <span>${escapeHtml(event.message)}</span>
    </li>
  `).join("");
}

function renderSdkTrace() {
  els.sdkTrace.innerHTML = state.sdkTrace.slice(0, 8).map((entry) => `
    <details>
      <summary>${escapeHtml(entry.method)}</summary>
      <pre>${escapeHtml(JSON.stringify(entry.payload, null, 2))}</pre>
    </details>
  `).join("") || empty("SDK-shaped calls appear here as you use the app.");
}

function claimButton(type, targetId, label) {
  return `<button class="small" data-propose="${type}" data-target="${targetId}">${label}</button>`;
}

function stat(label, value, hint) {
  return `
    <div class="stat">
      <strong>${value}</strong>
      <span>${label}</span>
      <small>${hint}</small>
    </div>
  `;
}

function pill(text) {
  return `<span class="pill">${escapeHtml(text)}</span>`;
}

function empty(text) {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

function actionLabel(action) {
  if (action.type === "replace-member") {
    return `Replace ${action.replacement.oldMemberId} with ${action.replacement.newMember.name}`;
  }
  return `${action.type} · ${action.targetId}`;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

els.purchaseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = new FormData(event.currentTarget).get("amount");
  update((current) => purchaseTokens(current, amount));
  event.currentTarget.reset();
});

els.claimForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  update((current) => submitClaim(current, data));
  event.currentTarget.reset();
});

els.replaceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  update((current) => proposeAction(current, {
    type: "replace-member",
    proposerId: form.proposerId,
    replacement: {
      oldMemberId: form.oldMemberId,
      newMember: { id: form.newMemberId, name: form.newMemberName, weight: 1 },
    },
  }));
});

document.addEventListener("click", (event) => {
  const propose = event.target.closest("[data-propose]");
  if (propose) {
    update((current) => proposeAction(current, {
      type: propose.dataset.propose,
      targetId: propose.dataset.target,
      proposerId: state.group.members[0].id,
    }));
    return;
  }
  const sign = event.target.closest("[data-sign]");
  if (sign) {
    update((current) => signAction(current, sign.dataset.sign, sign.dataset.member));
  }
});

els.resetButton.addEventListener("click", () => {
  state = createInitialState();
  saveState();
  render();
});

els.scenarioButton.addEventListener("click", () => update(runHappyPathScenario));

document.querySelector("#token-payment-info").textContent = JSON.stringify(TOKEN_PAYMENT_INFO, null, 2);

render();
