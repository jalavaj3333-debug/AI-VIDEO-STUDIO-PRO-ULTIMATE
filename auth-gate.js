(() => {
  "use strict";

  const API = "https://ai-video-studio-automation.jalavaj-3333.workers.dev";
  const LOGIN = API + "/auth/github";
  const SESSION_KEY = "avs_cloud_session";

  const style = document.createElement("style");
  style.textContent = `
    html.auth-check .app-container { visibility: hidden !important; }
    #avs-auth-screen {
      position: fixed; inset: 0; z-index: 2147483000;
      display: grid; place-items: center; padding: 24px;
      background: radial-gradient(circle at 50% 15%, #28200d 0, #101010 42%, #050505 100%);
      color: #f6f0df; font-family: Cairo, Arial, sans-serif; direction: rtl;
    }
    #avs-auth-screen .avs-auth-card {
      width: min(100%, 440px); padding: 34px 28px; text-align: center;
      background: rgba(18,18,18,.96); border: 1px solid #8d6c2c;
      border-radius: 22px; box-shadow: 0 24px 90px #000b;
    }
    #avs-auth-screen .avs-mark { color: #d6ad55; font-size: 38px; }
    #avs-auth-screen h1 { margin: 8px 0; font-size: 25px; letter-spacing: .5px; }
    #avs-auth-screen p { color: #bdb6a6; line-height: 1.9; margin: 10px 0 22px; }
    #avs-auth-screen .avs-login {
      display: inline-flex; justify-content: center; align-items: center;
      width: 100%; box-sizing: border-box; padding: 13px 18px;
      border-radius: 12px; background: linear-gradient(135deg,#e0bd70,#a87925);
      color: #17120a; font-weight: 800; text-decoration: none;
    }
    #avs-auth-screen .avs-note { display:block; margin-top:16px; font-size:12px; color:#8f8879; }
    #avs-auth-screen .avs-error { color:#ffb0a6; min-height:24px; font-size:13px; }
    .avs-user-chip { display:inline-flex; align-items:center; gap:10px; margin-inline-start:12px; }
    .avs-user-chip button { color:#d8b76d; font-size:12px; background:transparent; border:0; cursor:pointer; }
  `;
  document.head.appendChild(style);

  function takeTokenFromFragment() {
    const hash = new URLSearchParams(location.hash.slice(1));
    const token = hash.get("avs_session");
    if (token) {
      sessionStorage.setItem(SESSION_KEY, token);
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function getToken() {
    return sessionStorage.getItem(SESSION_KEY) || "";
  }

  function showGate(message) {
    document.documentElement.classList.remove("auth-check");
    if (document.getElementById("avs-auth-screen")) return;

    const screen = document.createElement("div");
    screen.id = "avs-auth-screen";
    const card = document.createElement("div");
    card.className = "avs-auth-card";

    const mark = document.createElement("div");
    mark.className = "avs-mark";
    mark.textContent = "✦";

    const title = document.createElement("h1");
    title.textContent = "AI VIDEO STUDIO PRO ULTIMATE";

    const description = document.createElement("p");
    description.textContent = "سجّل الدخول بحساب GitHub المصرّح به للوصول إلى مساحة الاستوديو.";

    const error = document.createElement("div");
    error.className = "avs-error";
    error.setAttribute("role", "status");
    error.textContent = message || "";

    const link = document.createElement("a");
    link.className = "avs-login";
    link.href = LOGIN;
    link.textContent = "الدخول باستعمال GitHub";

    const note = document.createElement("small");
    note.className = "avs-note";
    note.textContent = "الحساب المسموح به: jalavaj3333-debug";

    card.append(mark, title, description, error, link, note);
    screen.appendChild(card);
    document.body.appendChild(screen);
  }

  async function checkSession() {
    takeTokenFromFragment();

    try {
      const response = await fetch(API + "/auth/me", {
        method: "GET",
        cache: "no-store",
        headers: {
          "Accept": "application/json",
          ...(getToken() ? { "Authorization": "Bearer " + getToken() } : {})
        }
      });

      const data = await response.json();

      if (!response.ok || !data.authenticated || data.login !== "jalavaj3333-debug") {
        sessionStorage.removeItem(SESSION_KEY);
        showGate("");
        return;
      }

      document.documentElement.classList.remove("auth-check");

      const topActions = document.querySelector(".topbar .top-actions");
      if (topActions && !document.getElementById("avs-user-chip")) {
        const chip = document.createElement("span");
        chip.id = "avs-user-chip";
        chip.className = "avs-user-chip";

        const user = document.createElement("span");
        user.textContent = "GitHub: " + data.user;

        const logout = document.createElement("button");
        logout.type = "button";
        logout.textContent = "تسجيل الخروج";
        logout.addEventListener("click", () => {
          sessionStorage.removeItem(SESSION_KEY);
          location.reload();
        });

        chip.append(user, logout);
        topActions.appendChild(chip);
      }
    } catch (error) {
      showGate("تعذر التحقق من الجلسة. تأكد من الاتصال ثم أعد تحميل الصفحة.");
    }
  }

  checkSession();
})();
