document.addEventListener("DOMContentLoaded", () => {
  console.log("%c[HYPERIONS] RECRUITMENT CONSOLE INITIALIZED", "color: #8b5cf6; font-weight: bold;");

  const SCREENSHOT_PROMPT = "Please send an screenshot of your team below";
  const GAME_QUESTIONS = {
    ALS: ["What is your Roblox username?", "How active can you be to help people out in game?", "Do you own an 3x speed game pass in anime last stand?", "Do you have more than 5 meta glitched units?", "Please send an screenshot of your team below"],
    AG: ["What is your Roblox Username?", "How active can you be to help people out in game?", "Are you able to solo 3 god mode on max difficulty?", "Are you able to solo all of the world lines?", "Can you solo the world boss on max difficulty?", "Please send an screenshot of your team below"],
    AC: ["What is your Roblox Username?", "How active can you be to help people out in game?", "Are you able to solo the New Years Event?", "Are you able to solo tier 11 Winter Portals?", "Are you able to solo Stark Raid On Hard Mode?", "Are you able to solo Bleach Boss Rush?", "Please send an screenshot of your team below"],
    UTD: ["What is your Roblox Username?", "How active can you be to help people out in game?", "What is your current level in UTD?", "Do you have the latest Meta towers for raids?", "Please send an screenshot of your team below"],
    AV: ["What is your Roblox Username?", "How active can you be to help people out in game?", "How many Paragon units do you currently own?", "Can you solo the latest Infinite Mode stages?", "Please send an screenshot of your team below"],
    BL: ["What is your Roblox Username?", "How active can you be to help people out in game?", "What is your current Race and Mastery level?", "Do you have experience with high-tier PvP carries?", "Please send an screenshot of your character/build below"],
    SP: ["What is your Roblox Username?", "How active can you be to help people out in game?", "What is your current Fruit and Bounty?", "Are you capable of soloing high-difficulty dungeons?", "Please send an screenshot of your stats/inventory below"],
    ARX: ["What is your Roblox Username?", "How active can you be to help people out in game?", "What is your current team composition in ARX?", "Are you able to solo the latest Raid difficulty?", "Please send an screenshot of your team below"],
    APX: ["What is your Roblox Username?", "How active can you be to help people out in game?", "Are you able to solo Difficulty 10 Extreme?", "Are you able to solo Endless Mode wave 100+?", "Please send an screenshot of your team below"]
  };
  const GAME_LABELS = {
    ALS: "Anime Last Stand (ALS)", AG: "Anime Guardians (AG)", AC: "Anime Crusaders (AC)", UTD: "Universal Tower Defense (UTD)",
    AV: "Anime Vanguards (AV)", BL: "Bizarre Lineage (BL)", SP: "Sailor Piece (SP)", ARX: "Anime Rangers X (ARX)", APX: "Anime Paradox (APX)"
  };

  const loader = document.getElementById('loadingScreen');
  const loaderBar = document.getElementById('loaderBar');
  let loadProgress = 0;
  const loadInterval = setInterval(() => {
    loadProgress += Math.random() * 15;
    if (loadProgress >= 100) {
      loadProgress = 100;
      clearInterval(loadInterval);
      const loaderText = loader.querySelector('.loader-text');
      if (loaderText) loaderText.textContent = "Systems Ready";
      setTimeout(() => loader && loader.classList.add('hidden'), 500);
    }
    if (loaderBar) loaderBar.style.width = `${loadProgress}%`;
  }, 100);

  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  };

  const discordUserStr = getCookie('discord_user');
  const loginSection = document.getElementById("loginSection");
  const formSection = document.getElementById("formSection");

  if (discordUserStr) {
    try {
      const user = JSON.parse(decodeURIComponent(discordUserStr));
      if (loginSection) loginSection.style.display = "none";
      if (formSection) formSection.style.display = "block";

      const tagInput = document.getElementById("discordTag");
      const idInput = document.getElementById("discordUserId");
      if (tagInput) {
        tagInput.value = user.discriminator === "0" ? user.username : `${user.username}#${user.discriminator}`;
        tagInput.readOnly = true;
      }
      if (idInput) {
        idInput.value = user.id;
        idInput.readOnly = true;
      }
    } catch (e) {
      console.warn("Auth error:", e);
    }
  }

  const follower = document.getElementById('cursorFollower');
  const dot = document.getElementById('dotCursor');
  const outer = document.getElementById('dotCursorOuter');

  document.addEventListener("mousemove", (e) => {
    const { clientX: x, clientY: y } = e;
    if (dot) dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (outer) outer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (follower) follower.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  });

  const setupCursorHovers = () => {
    document.querySelectorAll(".hover-target, a, button, input, textarea, label, .game-item").forEach((el) => {
      el.addEventListener("mouseenter", () => outer && outer.classList.add("hovering"));
      el.addEventListener("mouseleave", () => outer && outer.classList.remove("hovering"));
    });
  };
  setupCursorHovers();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

  const form = document.getElementById("helperApplicationForm");
  const catQuestions = document.getElementById("categoryQuestions");
  const catList = document.getElementById("categoryQuestionsList");
  const progressPercent = document.getElementById("progressPercent");
  const progressBar = document.getElementById("progressBar");
  let selectedFiles = [];

  function isScreenshotQuestion(q) {
    return String(q).trim().toLowerCase() === SCREENSHOT_PROMPT.toLowerCase();
  }

  function renderCategoryQuestions() {
    const selected = Array.from(form.querySelectorAll('input[name="strongestGames"]:checked')).map(i => i.value);
    catList.innerHTML = "";
    const withQuestions = selected.filter(g => GAME_QUESTIONS[g]);

    if (withQuestions.length === 0) {
      catQuestions.style.display = "none";
      return;
    }
    catQuestions.style.display = "block";
    withQuestions.forEach(code => {
      const panel = document.createElement("div");
      panel.className = "question-item reveal active";
      panel.innerHTML = `<span class="question-text">${GAME_LABELS[code] || code} Intelligence Report</span>`;

      GAME_QUESTIONS[code].forEach((q, idx) => {
        if (isScreenshotQuestion(q)) {
            const p = document.createElement('p');
            p.style.fontSize = '0.8rem';
            p.style.color = 'var(--secondary)';
            p.style.marginBottom = '1rem';
            p.textContent = `• Transmission of build captures required in Telemetry sector.`;
            panel.appendChild(p);
        } else {
            const wrap = document.createElement("div");
            wrap.className = "input-wrapper form-group";
            wrap.innerHTML = `
                <input type="text" name="question_${code}_${idx}" required placeholder=" ">
                <label>${q}</label>
            `;
            panel.appendChild(wrap);
        }
      });
      catList.appendChild(panel);
    });
    setupCursorHovers();
  }

  function updateProgress() {
    const data = new FormData(form);
    let filled = 0;
    const coreFields = ["discordTag", "discordUserId", "age", "timezone", "availability", "experience", "motivation", "termsAccepted"];
    coreFields.forEach(f => {
        const val = data.get(f);
        if (val && val.toString().trim().length > (f === "age" ? 0 : 3)) filled++;
    });

    const selectedGames = data.getAll("strongestGames");
    if (selectedGames.length > 0) filled++;

    const requiredQs = selectedGames.reduce((s, g) => s + (GAME_QUESTIONS[g]?.filter(q => !isScreenshotQuestion(q)).length || 0), 0);
    const answeredQs = selectedGames.reduce((s, g) => {
      const qs = GAME_QUESTIONS[g] || [];
      return s + qs.filter((q, i) => !isScreenshotQuestion(q) && (data.get(`question_${g}_${i}`) || "").trim().length > 0).length;
    }, 0);

    const total = coreFields.length + 1 + requiredQs;
    const progress = Math.floor(((filled + answeredQs) / total) * 100);
    const final = Math.min(progress, 100);

    if (progressPercent) progressPercent.textContent = final;
    if (progressBar) progressBar.style.width = `${final}%`;
  }

  form.addEventListener("input", updateProgress);
  form.addEventListener("change", () => {
    renderCategoryQuestions();
    updateProgress();
  });

  const uploadZone = document.getElementById("uploadZone");
  const fileInput = document.getElementById("inventoryScreenshots");
  const preview = document.getElementById("screenshotPreview");

  uploadZone.addEventListener("click", () => fileInput.click());
  uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.style.borderColor = "var(--primary)"; });
  uploadZone.addEventListener("dragleave", () => { uploadZone.style.borderColor = ""; });
  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  function handleFiles(files) {
    Array.from(files).forEach(file => {
      if (selectedFiles.length >= 4 || !file.type.startsWith("image/")) return;
      selectedFiles.push(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement("div");
        div.className = "game-item-box preview-box";
        div.style.background = `url(${e.target.result}) center/cover`;
        div.style.position = "relative";
        div.style.height = "100px";
        div.innerHTML = `<button type="button" class="hover-target" style="position:absolute; top:5px; right:5px; background:var(--danger); border:none; color:#fff; width:20px; height:20px; border-radius:50%; font-size:10px;">✕</button>`;
        div.querySelector("button").onclick = () => { div.remove(); selectedFiles = selectedFiles.filter(f => f !== file); updateProgress(); };
        preview.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
    updateProgress();
  }

  const submitBtn = document.getElementById("submitButton");
  const statusEl = document.getElementById("formStatus");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (progressPercent.textContent !== "100") {
      statusEl.textContent = "[!] SECURITY ALERT: COMPLETE ALL SECTORS BEFORE TRANSMISSION";
      statusEl.style.color = "var(--danger)";
      return;
    }

    const btnText = submitBtn.querySelector(".btn-text");
    btnText.textContent = "ENCRYPTING DOSSIER...";
    submitBtn.style.pointerEvents = "none";
    submitBtn.style.opacity = "0.5";

    const formData = new FormData(form);
    const payload = {
      discordTag: formData.get("discordTag"),
      discordUserId: formData.get("discordUserId"),
      age: formData.get("age"),
      timezone: formData.get("timezone"),
      availability: formData.get("availability"),
      experience: formData.get("experience"),
      motivation: formData.get("motivation"),
      proofs: formData.get("proofs") || "",
      strongestGames: formData.getAll("strongestGames"),
      categoryResponses: {},
      termsAccepted: true,
      screenshots: []
    };

    payload.strongestGames.forEach(g => {
        payload.categoryResponses[g] = GAME_QUESTIONS[g].map((q, i) => ({
            question: q,
            answer: isScreenshotQuestion(q) ? `Included in telemetry` : formData.get(`question_${g}_${i}`)
        })).filter(r => r.answer);
    });

    try {
      for (const f of selectedFiles) {
        const base64 = await new Promise(r => {
          const fr = new FileReader();
          fr.onload = () => r(fr.result);
          fr.readAsDataURL(f);
        });
        payload.screenshots.push({ name: f.name, dataUrl: base64 });
      }

      const res = await fetch("/api/helper-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "UPLINK FAILED");

      btnText.textContent = "TRANSMISSION COMPLETE";
      submitBtn.style.background = "var(--success)";
      statusEl.textContent = `PROTOCOL FINISHED. REF_ID: ${json.referenceId}`;
      statusEl.style.color = "var(--success)";
      form.style.opacity = "0.3";
      form.style.pointerEvents = "none";
    } catch (err) {
      btnText.textContent = "RETRY UPLINK";
      submitBtn.style.pointerEvents = "auto";
      submitBtn.style.opacity = "1";
      statusEl.textContent = `[ERROR] ${err.message}`;
    }
  });

  async function loadEmojis() {
    try {
      const res = await fetch(`/api/status?t=${Date.now()}`);
      const d = await res.json();
      if (d.emojis && d.emojis.website) {
        const custom = d.emojis.website;
        const map = {
          n01: "stepIcon01",
          n02: "stepIcon02",
          n03: "stepIcon03"
        };
        for (const [key, id] of Object.entries(map)) {
          const val = String(custom[key] || '').trim();
          const el = document.getElementById(id);
          if (!el || !val) continue;

          el.innerHTML = '';

          if (val.startsWith('http')) {
            const img = document.createElement('img');
            img.src = val;
            img.style.width = '1.8em';
            img.style.height = '1.8em';
            img.style.objectFit = 'contain';
            img.style.verticalAlign = 'middle';
            img.onerror = () => img.style.display = 'none';
            el.appendChild(img);
          } else if (/^\d{17,20}$/.test(val)) {
            const img = document.createElement('img');
            img.src = `https://cdn.discordapp.com/emojis/${val}.webp?size=128&quality=lossless`;
            img.style.width = '1.8em';
            img.style.height = '1.8em';
            img.style.objectFit = 'contain';
            img.style.verticalAlign = 'middle';
            img.onerror = () => {
              img.src = `https://cdn.discordapp.com/emojis/${val}.png?size=128`;
            };
            el.appendChild(img);
          }
        }
      }
    } catch (e) {}
  }
  loadEmojis();
});