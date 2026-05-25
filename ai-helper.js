/**
 * AI Helper Widget — frontend-only chat assistant for the linktree.
 *
 * Mocks an agent that "scans" linked docs (Resume.pdf, portfolio.html) and answers
 * questions about the person on the page. All intelligence is local pattern-matching
 * + templated responses pulled from window.PROFILE.
 *
 * Loads only on index.html. Reads PROFILE from profile-data.js (must load first).
 */
(function () {
  "use strict";

  if (typeof window.PROFILE !== "object" || !window.PROFILE) {
    console.error("[ai-helper] PROFILE not found. Did profile-data.js load before ai-helper.js?");
    return;
  }

  const P = window.PROFILE;

  /* ---------------------------------------------------------------- *
   * Utilities                                                        *
   * ---------------------------------------------------------------- */

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === "class") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k]; // ONLY for code-controlled HTML
        else if (k === "text") node.textContent = attrs[k];
        else if (k.startsWith("data-")) node.setAttribute(k, attrs[k]);
        else if (k.startsWith("aria-")) node.setAttribute(k, attrs[k]);
        else node[k] = attrs[k];
      }
    }
    if (children) {
      const arr = Array.isArray(children) ? children : [children];
      for (const c of arr) if (c != null) node.appendChild(c);
    }
    return node;
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, prefersReducedMotion ? 0 : ms));
  }

  function allSkillTokens() {
    const skills = P.skills || {};
    const buckets = ["languages", "apis", "tools", "engines", "concepts", "soft"];
    const out = [];
    for (const b of buckets) {
      const v = skills[b] && skills[b].values;
      if (Array.isArray(v)) out.push(...v);
    }
    for (const proj of P.projects || []) {
      if (Array.isArray(proj.stack)) out.push(...proj.stack);
      if (Array.isArray(proj.tags))  out.push(...proj.tags);
    }
    return out;
  }

  /* ---------------------------------------------------------------- *
   * Intent detection (word-boundary regex, priority order)           *
   * ---------------------------------------------------------------- */

  // Higher in the list = checked first.
  const INTENTS = [
    { name: "role-fit",   patterns: [/\b(?:good\s+(?:fit|for)|fit\s+for|role\s+(?:of|as)|suited\s+(?:for|to)|looking\s+for|hiring|hire|as\s+an?\s+\w+|would\s+(?:they|he|she)\s+be\s+good)/i] },
    { name: "experience", patterns: [/\b(?:experience|work\s*history|employer|intern(?:ed)?\s+(?:at|with)|did\s+at|company|lab|llnl|livermore|architecture|le\s+architecture)\b/i] },
    { name: "projects",   patterns: [/\b(?:project|projects|portfolio|ecosystem|ecobuilder|simulation|capstone|build(?:s|ing|t)?|made|showcase)\b/i] },
    { name: "skills",     patterns: [/\b(?:skill|skills|stack|tech(?:nology)?|technologies|language|languages|tooling|tools|framework|frameworks|know|expertise)\b/i] },
    { name: "education",  patterns: [/\b(?:school|study|studied|university|college|major|merced|degree|education|course(?:work)?|graduat\w*)\b/i] },
    { name: "resume",     patterns: [/\b(?:resume|résumé|cv|pdf|download)\b/i] },
    { name: "contact",    patterns: [/\b(?:contact|email|reach|talk|message|get\s+in\s+touch|how\s+to\s+(?:reach|contact))\b/i] },
    { name: "summarize",  patterns: [/\b(?:summary|summarize|summarise|who\s+is|who's|tell\s+me\s+about|describe|introduce|intro|bio|about)\b/i] }
  ];

  function detectIntent(text) {
    const t = String(text || "").toLowerCase();
    for (const intent of INTENTS) {
      if (intent.patterns.some(rx => rx.test(t))) return intent.name;
    }
    return "fallback";
  }

  /* ---------------------------------------------------------------- *
   * Mock-RAG scan sequences per intent                               *
   * ---------------------------------------------------------------- */

  const SCAN_SCRIPTS = {
    "summarize":  [{ icon: "🔍", text: "Reading portfolio bio…", delay: 700 }],
    "skills":     [
      { icon: "📂", text: "Scanning portfolio.html#about…", delay: 700 },
      { icon: "📄", text: "Cross-checking Resume.pdf…",     delay: 600 }
    ],
    "experience": [
      { icon: "📄", text: "Opening Resume.pdf…",             delay: 800 },
      { icon: "🔍", text: "Scanning Experience section…",    delay: 600 }
    ],
    "projects":   [
      { icon: "📂", text: "Loading portfolio.html#work…",    delay: 700 },
      { icon: "📄", text: "Pulling project details from Resume.pdf…", delay: 600 }
    ],
    "role-fit":   [
      { icon: "📄", text: "Reading Resume.pdf…",             delay: 700 },
      { icon: "🧠", text: "Matching to role keywords…",      delay: 600 },
      { icon: "⚖️", text: "Scoring fit…",                     delay: 500 }
    ],
    "contact":    [{ icon: "🔍", text: "Looking up contact info…", delay: 600 }],
    "resume":     [{ icon: "📄", text: "Locating Resume.pdf…",      delay: 600 }],
    "education":  [{ icon: "🎓", text: "Reading education section…", delay: 600 }],
    "fallback":   [{ icon: "🤔", text: "Thinking…",                  delay: 500 }]
  };

  /* ---------------------------------------------------------------- *
   * Response generators                                              *
   * Each returns { paragraphs: [string], sources: [string], actions: [{label, action}] }
   * `paragraphs` may contain code-controlled HTML (links, bullet lists).
   * User-supplied input is always escaped via escapeHtml() before being woven in.
   * ---------------------------------------------------------------- */

  function srcLink(src) {
    // Render a source as a clickable link if it looks like a URL/anchor.
    if (/^(https?:|mailto:|[\w-]+\.(?:html|pdf)(?:#[\w-]+)?$)/.test(src) || src.startsWith("#")) {
      return `<a href="${escapeHtml(src)}" target="_blank" rel="noopener">${escapeHtml(src)}</a>`;
    }
    return escapeHtml(src);
  }

  function bulletList(items) {
    const lis = items.map(i => `<li>${i}</li>`).join("");
    return `<ul>${lis}</ul>`;
  }

  function genSummarize() {
    return {
      paragraphs: [
        `<strong>${escapeHtml(P.name)}</strong> — ${escapeHtml(P.title)}.`,
        escapeHtml(P.blurb.text)
      ],
      sources: [P.blurb.source, P.education.source],
      actions: [
        { label: "What are their skills?",  action: "ask:skills" },
        { label: "Show me their work",       action: "ask:projects" },
        { label: "Good fit for a role?",     action: "ask:role-fit:swe intern" }
      ]
    };
  }

  function genSkills() {
    const s = P.skills;
    const paragraphs = [
      `<strong>Tai's technical stack at a glance:</strong>`,
      bulletList([
        `<strong>Languages:</strong> ${escapeHtml(s.languages.values.join(", "))}`,
        `<strong>AI &amp; data APIs:</strong> ${escapeHtml(s.apis.values.join(", "))}`,
        `<strong>Tools:</strong> ${escapeHtml(s.tools.values.join(", "))}`,
        `<strong>Engines:</strong> ${escapeHtml(s.engines.values.join(", "))}`,
        `<strong>Concepts:</strong> ${escapeHtml(s.concepts.values.join(", "))}`
      ])
    ];
    return {
      paragraphs,
      sources: [s.languages.source, P.blurb.source],
      actions: [
        { label: "See their work", action: "ask:projects" },
        { label: "Good fit for an AI role?", action: "ask:role-fit:ai engineer" }
      ]
    };
  }

  function genExperience(rawInput) {
    // If the question mentions LLNL / Lawrence Livermore / specific employer, focus on that.
    const t = String(rawInput || "").toLowerCase();
    let entries = P.experience.slice();
    let projectFocus = null;
    if (/\bllnl|livermore|capstone|ecobuilder\b/.test(t)) {
      projectFocus = P.projects.find(p => /llnl|capstone/i.test(p.name))
                  || P.projects.find(p => /ecobuilder/i.test(p.name));
    }

    const paragraphs = [];
    const sources = new Set();

    if (projectFocus) {
      paragraphs.push(`<strong>${escapeHtml(projectFocus.name)}</strong> (${escapeHtml(String(projectFocus.year))}).`);
      paragraphs.push(escapeHtml(projectFocus.summary));
      sources.add(projectFocus.source);
    }

    if (entries.length) {
      paragraphs.push(`<strong>Other experience:</strong>`);
      paragraphs.push(bulletList(entries.map(e =>
        `<strong>${escapeHtml(e.role)}</strong> — ${escapeHtml(e.employer)}<br><span style="color:var(--ink-soft)">${escapeHtml(e.summary)}</span>`
      )));
      entries.forEach(e => sources.add(e.source));
    }

    if (!projectFocus && !entries.length) {
      paragraphs.push(`Tai's main hands-on work is on the LLNL capstone and the EcoBuilder simulation — ask me about either.`);
    }

    return {
      paragraphs,
      sources: Array.from(sources),
      actions: [
        { label: "Tell me about EcoBuilder", action: "ask:projects:ecobuilder" },
        { label: "Download the résumé",       action: "download-resume" }
      ]
    };
  }

  function genProjects(rawInput) {
    const t = String(rawInput || "").toLowerCase();
    const focus = /ecobuilder|ecosystem|simulation/.test(t)
      ? P.projects.find(p => /ecobuilder/i.test(p.name))
      : /llnl|capstone|livermore/.test(t)
      ? P.projects.find(p => /llnl|capstone/i.test(p.name))
      : null;

    if (focus) {
      return {
        paragraphs: [
          `<strong>${escapeHtml(focus.name)}</strong> · ${escapeHtml(String(focus.year))} · ${escapeHtml(focus.stack.join(", "))}`,
          escapeHtml(focus.summary)
        ],
        sources: [focus.source, "portfolio.html#work"],
        actions: [
          { label: "Open the portfolio",  action: "open-project" },
          { label: "What tech does Tai use?", action: "ask:skills" }
        ]
      };
    }

    // List all projects
    const items = P.projects.map(p =>
      `<strong>${escapeHtml(p.name)}</strong> <em>(${escapeHtml(String(p.year))})</em><br><span style="color:var(--ink-soft)">${escapeHtml(p.summary)}</span>`
    );
    return {
      paragraphs: [
        `<strong>Tai's recent work:</strong>`,
        bulletList(items)
      ],
      sources: ["portfolio.html#work", "Resume.pdf"],
      actions: [
        { label: "Open the portfolio",    action: "open-project" },
        { label: "Tell me about EcoBuilder", action: "ask:projects:ecobuilder" },
        { label: "Tell me about the LLNL capstone", action: "ask:projects:llnl" }
      ]
    };
  }

  function genEducation() {
    const e = P.education;
    return {
      paragraphs: [
        `<strong>${escapeHtml(e.school)}</strong>`,
        `${escapeHtml(e.degree)} · ${escapeHtml(e.dates)}.`,
        `<em>Relevant coursework:</em> ${escapeHtml(e.coursework.join(", "))}.`
      ],
      sources: [e.source],
      actions: [
        { label: "What's on their résumé?", action: "ask:experience" },
        { label: "Download the résumé",      action: "download-resume" }
      ]
    };
  }

  function genContact() {
    return {
      paragraphs: [
        `Best way to reach Tai is by email:`,
        `<strong>${escapeHtml(P.email)}</strong>`,
        `They're also on <a href="${escapeHtml(P.links.github)}" target="_blank" rel="noopener">GitHub</a> and <a href="${escapeHtml(P.links.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>.`
      ],
      sources: ["index.html"],
      actions: [
        { label: "📧 Email Tai",     action: "email-tai" },
        { label: "Open GitHub",      action: "open-link:github" },
        { label: "Open LinkedIn",    action: "open-link:linkedin" }
      ]
    };
  }

  function genResume() {
    return {
      paragraphs: [
        `Tai's full résumé is available as a PDF — click below to download it, or open the in-page viewer.`
      ],
      sources: ["Resume.pdf"],
      actions: [
        { label: "⬇ Download PDF",     action: "download-resume" },
        { label: "Open résumé viewer", action: "view-resume-page" }
      ]
    };
  }

  /* ---------- Role-fit ---------- */

  function extractRolePhrase(text) {
    const rx = /\b(?:good\s+(?:fit\s+(?:for|as)|for(?:\s+an?)?)|fit\s+(?:for|as)|role\s+(?:of|as)|looking\s+for(?:\s+an?)?|hiring(?:\s+an?)?|as\s+an?|suited\s+(?:for|to))\s+([\w\s/+&-]{2,40})/i;
    const m = String(text || "").match(rx);
    return m ? m[1].trim().replace(/[?.!]+$/, "").trim() : null;
  }

  function scoreRole(phraseOrInput) {
    // Two-tier matching:
    //   1. Find roles whose NAME appears in the phrase. If any match, score among those only.
    //   2. If no name matches, return a low-confidence stretch result — don't fake confidence
    //      from incidental skill overlap (Tai's stack is broad enough that every role would
    //      otherwise score ~1.0).
    const skillTokens = allSkillTokens().map(s => s.toLowerCase());
    const phrase = String(phraseOrInput || "").toLowerCase();

    // Stop-words to ignore when checking role-name tokens against the phrase
    const STOP = new Set(["a", "an", "the", "for", "as", "of", "role", "intern", "dev", "developer", "engineer", "position"]);

    const candidates = [];
    for (const [roleKey, keywords] of Object.entries(P.roleKeywords || {})) {
      const roleNameTokens = roleKey.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const significantTokens = roleNameTokens.filter(t => !STOP.has(t));
      // A candidate must share at least one significant name-token with the phrase.
      // Fall back to all role-name tokens if all are stop-words (shouldn't happen, but safe).
      const pool = significantTokens.length ? significantTokens : roleNameTokens;
      const phraseHit = pool.some(t => new RegExp("\\b" + t.replace(/[+]/g, "\\+") + "\\b").test(phrase));
      if (phraseHit) candidates.push([roleKey, keywords]);
    }

    if (!candidates.length) {
      // No role name was mentioned. Return a stretch verdict with no specific role match.
      return { roleKey: null, score: 0.15, matched: [], noMatch: true };
    }

    let best = { roleKey: null, score: 0, matched: [] };
    for (const [roleKey, keywords] of candidates) {
      const matched = keywords.filter(k => skillTokens.includes(k.toLowerCase()));
      const score = matched.length / Math.max(1, keywords.length);
      if (score > best.score) {
        best = { roleKey, score, matched };
      }
    }
    return best;
  }

  function verdictBand(score) {
    if (score >= 0.6) return "Strong fit";
    if (score >= 0.3) return "Reasonable fit";
    return "Stretch — but worth a conversation";
  }

  function pickProjectFor(roleKey) {
    if (!roleKey) return null;
    const kws = (P.roleKeywords[roleKey] || []).map(k => k.toLowerCase());
    let best = null, bestScore = 0;
    for (const proj of P.projects || []) {
      const haystack = [...(proj.stack || []), ...(proj.tags || [])].map(s => s.toLowerCase());
      const overlap = haystack.filter(h => kws.some(k => h.includes(k) || k.includes(h))).length;
      if (overlap > bestScore) { bestScore = overlap; best = proj; }
    }
    return bestScore > 0 ? best : null;
  }

  function genRoleFit(rawInput) {
    const phrase = extractRolePhrase(rawInput) || rawInput;
    const result = scoreRole(phrase);

    // Render role phrase safely — it came from user input
    const safePhrase = escapeHtml(phrase || "that role");
    const safeRoleKey = result.roleKey ? escapeHtml(result.roleKey) : null;
    const verdict = verdictBand(result.score);
    const pct = Math.round(result.score * 100);
    const matchedSkills = result.matched.slice(0, 3);

    const paragraphs = [];
    if (result.noMatch) {
      paragraphs.push(
        `<strong>${escapeHtml(verdict)}</strong> for <em>${safePhrase}</em> — that role isn't in Tai's usual lane.`
      );
      paragraphs.push(
        `Their core stack leans toward full-stack web, simulations, and AI-augmented apps, so transfer is possible but not a direct fit.`
      );
    } else {
      paragraphs.push(
        `<strong>${escapeHtml(verdict)}</strong> for <em>${safePhrase}</em>` +
        (safeRoleKey && safeRoleKey.toLowerCase() !== safePhrase.toLowerCase()
          ? ` (closest match: <em>${safeRoleKey}</em>)`
          : ``) +
        ` — ${pct}% keyword overlap.`
      );
      if (matchedSkills.length) {
        paragraphs.push(
          `<strong>Skills that line up:</strong> ${matchedSkills.map(escapeHtml).join(", ")}.`
        );
      } else {
        paragraphs.push(
          `No direct keyword hits on Tai's listed stack, but adjacent experience may transfer.`
        );
      }
    }

    // Relevant project — with graceful fallback to general portfolio link
    const proj = pickProjectFor(result.roleKey);
    if (proj) {
      paragraphs.push(
        `<strong>Relevant work:</strong> ${escapeHtml(proj.name)} — ${escapeHtml(proj.summary)}`
      );
    } else {
      paragraphs.push(
        `<strong>Relevant work:</strong> <a href="${escapeHtml(P.links.portfolio)}#work" target="_blank" rel="noopener">See all work →</a>`
      );
    }

    return {
      paragraphs,
      sources: [P.blurb.source, "Resume.pdf"],
      actions: [
        { label: "Open the portfolio", action: "open-portfolio" },
        { label: "📧 Email Tai",        action: "email-tai" },
        { label: "Download résumé",    action: "download-resume" }
      ]
    };
  }

  function genFallback() {
    return {
      paragraphs: [
        `I'm not sure I caught that — try one of the suggestions below, or ask about Tai's skills, projects, experience, or role fit.`
      ],
      sources: [],
      actions: [
        { label: "Summarise Tai",                 action: "ask:summarize" },
        { label: "What's on Tai's résumé?",       action: "ask:experience" },
        { label: "Good fit for a frontend role?", action: "ask:role-fit:frontend" }
      ]
    };
  }

  function generate(intent, rawInput) {
    switch (intent) {
      case "summarize":  return genSummarize();
      case "skills":     return genSkills();
      case "experience": return genExperience(rawInput);
      case "projects":   return genProjects(rawInput);
      case "education":  return genEducation();
      case "contact":    return genContact();
      case "resume":     return genResume();
      case "role-fit":   return genRoleFit(rawInput);
      default:           return genFallback();
    }
  }

  /* ---------------------------------------------------------------- *
   * DOM construction                                                 *
   * ---------------------------------------------------------------- */

  function buildWidget() {
    const fab = el("button", {
      class: "ai-fab",
      type: "button",
      "aria-label": "Open AI helper",
      "aria-expanded": "false",
      "aria-controls": "ai-panel",
      html: `<span class="ai-fab__dot" aria-hidden="true"></span><span>Ask about Tai</span>`
    });

    const panel = el("aside", {
      id: "ai-panel",
      class: "ai-panel",
      role: "dialog",
      "aria-modal": "false",
      "aria-labelledby": "ai-panel-title",
      hidden: true
    });

    const head = el("header", { class: "ai-panel__head" });
    head.appendChild(el("h2", { id: "ai-panel-title", text: "Ask about Tai" }));
    head.appendChild(el("p", { class: "ai-panel__sub", text: "Mock responses — demo of the feature." }));
    const closeBtn = el("button", { class: "ai-panel__close", type: "button", "aria-label": "Close", text: "×" });
    head.appendChild(closeBtn);

    const log = el("div", { class: "ai-panel__log", role: "log", "aria-live": "polite" });

    const chips = el("div", { class: "ai-panel__chips", role: "group", "aria-label": "Quick questions" });

    const form = el("form", { class: "ai-panel__form" });
    const label = el("label", { class: "visually-hidden", htmlFor: "ai-input", text: "Message" });
    const textarea = el("textarea", {
      id: "ai-input",
      rows: 1,
      placeholder: "Ask anything…",
      autocomplete: "off"
    });
    textarea.setAttribute("enterkeyhint", "send");
    const sendBtn = el("button", { type: "submit", class: "btn--primary", text: "Send" });
    form.appendChild(label);
    form.appendChild(textarea);
    form.appendChild(sendBtn);

    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(chips);
    panel.appendChild(form);

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    return { fab, panel, head, log, chips, form, textarea, sendBtn, closeBtn };
  }

  /* ---------------------------------------------------------------- *
   * Rendering helpers                                                *
   * ---------------------------------------------------------------- */

  function renderUserMessage(log, text) {
    const node = el("div", { class: "ai-msg ai-msg--user" });
    node.appendChild(el("p", { text })); // textContent — XSS-safe
    log.appendChild(node);
    scrollLogToEnd(log);
  }

  function renderStatusBubble(log) {
    const bubble = el("div", { class: "ai-msg ai-msg--status" });
    const iconNode = el("span", { class: "ai-status__icon", text: "" });
    const textNode = el("span", { class: "ai-status__text", text: "" });
    bubble.appendChild(iconNode);
    bubble.appendChild(textNode);
    log.appendChild(bubble);
    scrollLogToEnd(log);

    return {
      node: bubble,
      async setStep({ icon, text }) {
        // Cross-fade text
        textNode.classList && bubble.classList.add("is-fading");
        await sleep(120);
        iconNode.textContent = icon || "";
        textNode.textContent = text || "";
        bubble.classList.remove("is-fading");
      },
      async showTyping() {
        bubble.classList.add("is-fading");
        await sleep(120);
        iconNode.textContent = "";
        textNode.textContent = "";
        // Append typing dots
        const typing = el("span", {
          class: "ai-typing",
          html: `<span></span><span></span><span></span>`
        });
        textNode.appendChild(typing);
        bubble.classList.remove("is-fading");
      },
      remove() {
        bubble.remove();
      }
    };
  }

  function renderBotMessage(log, response) {
    const bubble = el("div", { class: "ai-msg ai-msg--bot" });

    for (const para of response.paragraphs || []) {
      // Paragraphs are code-controlled HTML; user input embedded inside has already
      // been passed through escapeHtml() by the generator functions.
      const p = el("p", { html: para });
      bubble.appendChild(p);
    }

    if (Array.isArray(response.actions) && response.actions.length) {
      const actions = el("div", { class: "ai-actions" });
      for (const a of response.actions) {
        const btn = el("button", {
          class: "ai-action",
          type: "button",
          "data-action": a.action,
          text: a.label // textContent
        });
        actions.appendChild(btn);
      }
      bubble.appendChild(actions);
    }

    if (Array.isArray(response.sources) && response.sources.length) {
      // De-duplicate sources
      const seen = new Set();
      const unique = response.sources.filter(s => {
        if (!s) return false;
        if (seen.has(s)) return false;
        seen.add(s); return true;
      });
      const cite = el("div", { class: "ai-cite" });
      const label = unique.length === 1 ? "Source" : "Sources";
      cite.innerHTML = `<span class="ai-cite__arrow">↳</span><span>${escapeHtml(label)}: ${unique.map(srcLink).join(", ")}</span>`;
      bubble.appendChild(cite);
    }

    log.appendChild(bubble);
    scrollLogToEnd(log);
  }

  function scrollLogToEnd(log) {
    // requestAnimationFrame so the new node has size before we scroll
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  }

  function renderSeedChips(chipsContainer, items) {
    chipsContainer.innerHTML = "";
    for (const item of items) {
      const btn = el("button", {
        class: "ai-chip",
        type: "button",
        "data-action": item.action,
        text: item.label
      });
      chipsContainer.appendChild(btn);
    }
  }

  /* ---------------------------------------------------------------- *
   * Conversation flow                                                *
   * ---------------------------------------------------------------- */

  async function runTurn(state, userText) {
    if (!userText || !userText.trim()) return;
    if (state.busy) return;
    state.busy = true;
    state.sendBtn.disabled = true;

    renderUserMessage(state.log, userText.trim());

    const intent = detectIntent(userText);
    const script = SCAN_SCRIPTS[intent] || SCAN_SCRIPTS.fallback;

    const status = renderStatusBubble(state.log);

    // Play scan steps
    for (const step of script) {
      await status.setStep({ icon: step.icon, text: step.text });
      await sleep(step.delay);
    }
    // Final typing dots
    await status.showTyping();
    await sleep(prefersReducedMotion ? 0 : 500);
    status.remove();

    const response = generate(intent, userText);
    renderBotMessage(state.log, response);

    state.busy = false;
    state.sendBtn.disabled = false;
  }

  function handleActionClick(state, actionStr) {
    if (!actionStr) return;
    // Action format: "verb" or "verb:arg" or "ask:intent:extra"
    const parts = actionStr.split(":");
    const verb = parts[0];

    switch (verb) {
      case "ask": {
        // ask:intent[:extra] — synthesize a user message that triggers that intent
        const intent = parts[1];
        const extra = parts.slice(2).join(":");
        const msg = synthesizeQuery(intent, extra);
        runTurn(state, msg);
        break;
      }
      case "open-portfolio":
        window.open(P.links.portfolio, "_blank", "noopener");
        break;
      case "open-project":
        window.open(P.links.portfolio + "#work", "_blank", "noopener");
        break;
      case "view-resume-page":
        window.open(P.links.resume, "_blank", "noopener");
        break;
      case "download-resume": {
        const a = document.createElement("a");
        a.href = P.links.pdf;
        a.download = "Tai-Le-Resume.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        break;
      }
      case "email-tai":
        window.location.href = P.links.mailto;
        break;
      case "open-link": {
        const key = parts[1];
        const url = P.links[key];
        if (url) window.open(url, "_blank", "noopener");
        break;
      }
      default:
        console.warn("[ai-helper] Unknown action:", actionStr);
    }
  }

  function synthesizeQuery(intent, extra) {
    switch (intent) {
      case "summarize":   return "Summarise Tai";
      case "skills":      return "What are Tai's skills?";
      case "projects":    return extra ? `Tell me about ${extra}` : "Show me their work";
      case "experience":  return extra ? `What did Tai do at ${extra}?` : "What's on Tai's resume?";
      case "education":   return "Where did Tai study?";
      case "contact":     return "How can I reach Tai?";
      case "resume":      return "Download the résumé";
      case "role-fit":    return `Good fit for a ${extra || "SWE"} role?`;
      default:            return "Help";
    }
  }

  /* ---------------------------------------------------------------- *
   * Init                                                             *
   * ---------------------------------------------------------------- */

  function init() {
    const { fab, panel, log, chips, form, textarea, sendBtn, closeBtn } = buildWidget();

    const state = { log, chips, sendBtn, busy: false };

    // Seed chips
    const SEED_CHIPS = [
      { label: "Summarise Tai",                   action: "ask:summarize" },
      { label: "Good fit for a frontend role?",   action: "ask:role-fit:frontend" },
      { label: "What's on Tai's résumé?",         action: "ask:experience" },
      { label: "Show me their work",              action: "ask:projects" },
      { label: "📧 Email Tai",                     action: "email-tai" }
    ];
    renderSeedChips(chips, SEED_CHIPS);

    // Greeting (rendered the first time the panel is opened)
    let greeted = false;
    function greetOnce() {
      if (greeted) return;
      greeted = true;
      renderBotMessage(log, {
        paragraphs: [
          `Hi — I can summarise Tai, dig into specific work, or check role fit. I'll scan the linked résumé and portfolio when I answer.`
        ],
        sources: [],
        actions: []
      });
    }

    // Open / close
    function openPanel() {
      panel.hidden = false;
      fab.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => {
        textarea.focus();
        greetOnce();
      });
    }
    function closePanel() {
      panel.hidden = true;
      fab.setAttribute("aria-expanded", "false");
      fab.focus();
    }
    function togglePanel() {
      if (panel.hidden) openPanel(); else closePanel();
    }

    fab.addEventListener("click", togglePanel);
    closeBtn.addEventListener("click", closePanel);

    // Escape key closes
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) {
        e.stopPropagation();
        closePanel();
      }
    });

    // Delegated click handler for action chips inside messages + seed chips
    panel.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target) return;
      const action = target.getAttribute("data-action");
      handleActionClick(state, action);
    });

    // Form submit
    form.addEventListener("submit", (e) => {
      e.preventDefault(); // CRITICAL: prevent page reload
      const text = textarea.value.trim();
      if (!text) return;
      textarea.value = "";
      textarea.style.height = "auto";
      runTurn(state, text);
    });

    // Enter to send (Shift+Enter for newline)
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    // Auto-grow textarea on input
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    });
  }

  // DOM is parsed by the time defer scripts execute, but guard anyway.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
