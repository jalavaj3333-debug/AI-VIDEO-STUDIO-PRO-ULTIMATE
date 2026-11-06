
(() => {
  "use strict";

  const tools = [
    {
      name: "Bing Image Creator",
      category: "image",
      description: "إنشاء الصور من وصف مكتوب.",
      access: "مجاني بحدود استعمال",
      url: "https://www.bing.com/images/create"
    },
    {
      name: "Qwen",
      category: "image",
      description: "إنشاء الصور انطلاقاً من وصف المشاهد.",
      access: "حسب حدود الحساب",
      url: "https://chat.qwen.ai/"
    },
    {
      name: "AI Horde",
      category: "image",
      description: "توليد الصور باستعمال نماذج مفتوحة.",
      access: "مجاني مع انتظار",
      url: "https://aihorde.net/"
    },
    {
      name: "Hailuo AI",
      category: "video",
      description: "إنشاء فيديوهات قصيرة بالذكاء الاصطناعي.",
      access: "رصيد مجاني محدود",
      url: "https://hailuoai.video/"
    },
    {
      name: "Bing Video Creator",
      category: "video",
      description: "إنشاء فيديوهات من وصف نصي.",
      access: "استعمال مجاني بحدود",
      url: "https://www.bing.com/create"
    },
    {
      name: "Suno",
      category: "audio",
      description: "إنشاء موسيقى من وصف مكتوب.",
      access: "خطة مجانية محدودة",
      url: "https://suno.com/"
    },
    {
      name: "ElevenLabs",
      category: "audio",
      description: "تحويل النص إلى صوت.",
      access: "رصيد مجاني محدود",
      url: "https://elevenlabs.io/"
    },
    {
      name: "Poe AI Assistant",
      category: "assistant",
      description: "إنشاء Prompts وسيناريوهات ووصف حركة الأشخاص والعناصر.",
      access: "نقاط مجانية محدودة حسب الحساب",
      url: "https://poe.com/"
    },
    {
      name: "There's An AI For That",
      category: "directory",
      description: "البحث عن أدوات الذكاء الاصطناعي.",
      access: "الدليل مجاني",
      url: "https://theresanaiforthat.com/"
    }
  ];

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function initAIHub() {
    const root = document.getElementById("aiToolsHub");

    if (!root || root.dataset.initialized === "true") return;

    root.dataset.initialized = "true";

    root.innerHTML = `
      <section class="ath-wrap">
        <header class="ath-header">
          <div>
            <span class="ath-label">AI VIDEO STUDIO PRO</span>
            <h2>✦ AI Tools Hub</h2>
            <p>اكتشف أدوات الذكاء الاصطناعي في مكان واحد.</p>
          </div>
        </header>

        <input
          class="ath-search"
          id="athSearch"
          type="search"
          placeholder="🔍 ابحث عن أداة..."
          aria-label="البحث عن أدوات الذكاء الاصطناعي"
        >

        <nav class="ath-filters" aria-label="تصنيفات الأدوات">
          <button class="active" data-category="all">الكل</button>
          <button data-category="image">🖼️ الصور</button>
          <button data-category="video">🎬 الفيديو</button>
          <button data-category="audio">🎙️ الصوت</button>
          <button data-category="assistant">🤖 المساعدات الذكية</button>
          <button data-category="directory">📚 الأدلة</button>
        </nav>

        <p id="athCount" class="ath-count"></p>
        <div id="athGrid" class="ath-grid"></div>

        <p class="ath-disclaimer">
          المجانية وحدود الاستعمال كتختلف حسب الخدمة والحساب.
          تأكد من الشروط في الموقع الأصلي.
        </p>
      </section>
    `;

    const search = root.querySelector("#athSearch");
    const grid = root.querySelector("#athGrid");
    const count = root.querySelector("#athCount");
    const filters = root.querySelector(".ath-filters");

    let category = "all";

    const icons = {
      image: "🖼️",
      video: "🎬",
      audio: "🎙️",
      assistant: "🤖",
      directory: "📚"
    };

    function render() {
      const query = search.value.trim().toLowerCase();

      const results = tools.filter(tool => {
        const matchesCategory =
          category === "all" || tool.category === category;

        const searchable =
          `${tool.name} ${tool.description} ${tool.access}`.toLowerCase();

        return matchesCategory && searchable.includes(query);
      });

      count.textContent = `${results.length} أداة`;

      grid.innerHTML = results.map(tool => `
        <article class="ath-card">
          <div class="ath-card-icon">
            ${icons[tool.category] || "✨"}
          </div>

          <h3>${escapeHTML(tool.name)}</h3>
          <p>${escapeHTML(tool.description)}</p>

          <span class="ath-access">
            ${escapeHTML(tool.access)}
          </span>

          <a
            class="ath-open"
            href="${escapeHTML(tool.url)}"
            target="_blank"
            rel="noopener noreferrer"
          >Open Tool ↗</a>
        </article>
      `).join("");

      if (!results.length) {
        grid.innerHTML =
          '<p class="ath-empty">ما لقينا حتى أداة بهاد البحث.</p>';
      }
    }

    search.addEventListener("input", render);

    filters.addEventListener("click", event => {
      const button = event.target.closest("[data-category]");
      if (!button) return;

      category = button.dataset.category;

      filters.querySelectorAll("button").forEach(item => {
        item.classList.toggle("active", item === button);
      });

      render();
    });

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAIHub);
  } else {
    initAIHub();
  }
})();
