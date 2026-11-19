(() => {
  "use strict";

  const API = "https://ai-video-studio-automation.jalavaj-3333.workers.dev";
  const SESSION_KEY = "avs_cloud_session";

  const connectButton = document.getElementById("automationConnect");
  const testButton = document.getElementById("automationTest");
  const connectionStatus = document.getElementById("automationConnectionStatus");
  const result = document.getElementById("automationResult");
  const tasksList = document.getElementById("automationTasksList");

  if (!connectButton || !testButton || !connectionStatus || !result) {
    console.warn("Cloud Automation interface elements are missing.");
    return;
  }

  let connected = false;
  let refreshTimer = null;

  function status(message) {
    connectionStatus.textContent = message;
  }

  function getToken() {
    return sessionStorage.getItem(SESSION_KEY) || "";
  }

  function addLine(parent, label, value) {
    if (value === null || value === undefined || value === "") return;
    const line = document.createElement("small");
    line.textContent = label + ": " + String(value);
    parent.appendChild(line);
  }

  function showTasks(tasks) {
    if (!tasksList) return;
    tasksList.replaceChildren();

    if (!Array.isArray(tasks) || tasks.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "مازال ما تسجلات حتى مهمة.";
      tasksList.appendChild(empty);
      return;
    }

    for (const task of tasks) {
      const item = document.createElement("div");
      item.className = "automation-task-item";

      const title = document.createElement("strong");
      title.textContent = task.title || "مهمة بدون عنوان";

      const meta = document.createElement("small");
      meta.textContent = (task.task_type || "task") + " · " + (task.status || "unknown");

      item.append(title, meta);

      addLine(item, "تاريخ الإنشاء", task.created_at);
      addLine(item, "بداية التنفيذ", task.started_at);
      addLine(item, "نهاية التنفيذ", task.completed_at);
      addLine(item, "عدد المحاولات", task.attempts);

      if (task.result) {
        const resultLine = document.createElement("small");
        resultLine.textContent = "النتيجة: " + (
          typeof task.result === "string" ? task.result : JSON.stringify(task.result)
        );
        item.appendChild(resultLine);
      }

      if (task.error) {
        const errorLine = document.createElement("small");
        errorLine.textContent = "الخطأ: " + task.error;
        item.appendChild(errorLine);
      }

      tasksList.appendChild(item);
    }
  }

  async function api(path, options = {}) {
    const token = getToken();

    return fetch(API + path, {
      ...options,
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        ...(token ? { "Authorization": "Bearer " + token } : {}),
        ...(options.headers || {})
      }
    });
  }

  async function loadTasks() {
    const response = await api("/api/tasks");
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "تعذر تحميل المهام.");
    }

    showTasks(data.tasks || []);
  }

  async function connectCloud() {
    connected = false;
    testButton.disabled = true;
    connectButton.disabled = true;
    status("جاري التحقق من تسجيل الدخول والاتصال السحابي...");
    result.textContent = "";

    try {
      const [healthResponse, sessionResponse] = await Promise.all([
        api("/health"),
        api("/auth/me")
      ]);

      const health = await healthResponse.json();
      const session = await sessionResponse.json();

      if (!healthResponse.ok || health.status !== "online") {
        throw new Error("خدمة Cloudflare Worker غير متاحة.");
      }

      if (!sessionResponse.ok || !session.authenticated ||
          session.user !== "jalavaj3333-debug") {
        throw new Error("خاصك تسجل الدخول بحساب GitHub المصرح به.");
      }

      connected = true;
      testButton.disabled = false;
      status("● متصل بالسحابة — " + session.user);
      result.textContent = "الاتصال ناجح. المهام والنتائج كتتحدث من قاعدة البيانات السحابية.";

      await loadTasks();

      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(() => {
        if (connected) {
          loadTasks().catch(error => {
            console.warn("Task refresh failed:", error);
          });
        }
      }, 15000);
    } catch (error) {
      status("غير متصل بالسحابة.");
      result.textContent = error.message;
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
    } finally {
      connectButton.disabled = false;
    }
  }

  async function createTestTask() {
    if (!connected) {
      result.textContent = "اختبر الاتصال السحابي أولاً.";
      return;
    }

    testButton.disabled = true;
    result.textContent = "جاري حفظ مهمة الاختبار...";

    try {
      const response = await api("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          task_type: "connection_test",
          title: "اختبار اتصال AI Video Studio",
          payload: {
            source: "Automation Studio",
            created_from: "AI VIDEO STUDIO PRO ULTIMATE"
          }
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "تعذر حفظ المهمة.");
      }

      result.textContent = "تم تسجيل المهمة. المحرك السحابي غادي يعالجها حسب الجدولة.";
      await loadTasks();
    } catch (error) {
      result.textContent = "فشل حفظ المهمة: " + error.message;
    } finally {
      testButton.disabled = !connected;
    }
  }

  connectButton.addEventListener("click", connectCloud);
  testButton.addEventListener("click", createTestTask);

  connectCloud();
})();