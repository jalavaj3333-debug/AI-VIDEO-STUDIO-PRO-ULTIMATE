
(() => {
    "use strict";

    const SERVER = "http://127.0.0.1:8000";

    const connectButton = document.getElementById(
        "automationConnect"
    );

    const testButton = document.getElementById(
        "automationTest"
    );

    const tokenInput = document.getElementById(
        "automationToken"
    );

    const connectionStatus = document.getElementById(
        "automationConnectionStatus"
    );

    const result = document.getElementById(
        "automationResult"
    );

    if (!connectButton || !testButton || !tokenInput) {
        console.warn("Automation interface not found.");
        return;
    }

    let connected = false;

    function showStatus(message) {
        connectionStatus.textContent = message;
    }

    async function connectServer() {
        connected = false;
        testButton.disabled = true;

        const token = tokenInput.value.trim();

        if (!token) {
            showStatus("أدخل رمز الحماية أولاً.");
            return;
        }

        showStatus("جاري الاتصال بالسيرفر...");

        try {
            const response = await fetch(SERVER + "/", {
                method: "GET",
                mode: "cors",
                headers: {
                    "X-Automation-Token": token
                }
            });

            if (!response.ok) {
                throw new Error("Server returned " + response.status);
            }

            const data = await response.json();

            if (data.status !== "online") {
                throw new Error("Unexpected server response");
            }

            connected = true;
            testButton.disabled = false;

            showStatus("● متصل بالسيرفر المحلي");
            result.textContent = "الاتصال ناجح.";

        } catch (error) {
            connected = false;
            testButton.disabled = true;

            showStatus("تعذر الاتصال بالسيرفر.");
            result.textContent =
                error.message +
                " — تأكد أن السيرفر شغال وأن المتصفح سمح بالاتصال المحلي.";
        }
    }

    async function runExample() {
        if (!connected) {
            result.textContent = "اتصل بالسيرفر أولاً.";
            return;
        }

        testButton.disabled = true;
        result.textContent = "جاري تنفيذ المهمة...";

        try {
            const response = await fetch(
                SERVER + "/open-example",
                {
                    method: "POST",
                    mode: "cors",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Automation-Token": tokenInput.value.trim()
                    },
                    body: JSON.stringify({})
                }
            );

            const data = await response.json();

            if (!response.ok || data.status !== "success") {
                throw new Error(
                    data.message || "Automation failed"
                );
            }

            result.textContent =
                "نجاح! عنوان الصفحة: " + data.title;

        } catch (error) {
            result.textContent =
                "فشل تنفيذ المهمة: " + error.message;

        } finally {
            testButton.disabled = !connected;
        }
    }

    connectButton.addEventListener("click", connectServer);
    testButton.addEventListener("click", runExample);
})();
