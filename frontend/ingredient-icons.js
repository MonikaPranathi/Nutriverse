/*
  INGREDIENT ICONS
  -----------------------------------------------------------------
  The backend doesn't store or return an icon/image per ingredient
  (see MEMBER4_NOTES.md gap list), so this maps common ingredient
  name substrings to an emoji as a lightweight stand-in "icon" —
  no image assets or network requests needed, renders everywhere.

  nvIngredientIcon("2 cups rice") -> "🍚"
  nvIngredientChip("2 cups rice") -> "<span class='nv-ing-chip'>🍚 2 cups rice</span>"
*/

const NV_INGREDIENT_ICONS = [
  [/rice/i, "🍚"],
  [/ice cubes/i, "🧊"],
  [/baking soda/i, "🧂"],
  [/cocoa powder/i, "🍫"],
  [/peas/i, "🫘"],
  [/honey/i, "🍯"],
  [/mustard/i, "🟡"],
  [/saffron/i, "🌼"],
  [/shahjeera/i, "🌿"],
  [/paneer|cottage cheese/i, "🧀"],
  [/chocolate ice cream/i, "🍨"],
  [/chocolate/i, "🍫"],
  [/vanilla essence/i, "🧴"],
  [/cheese/i, "🧀"],
  [/tomato/i, "🍅"],
  [/onion/i, "🧅"],
  [/garlic/i, "🧄"],
  [/ginger/i, "🫚"],
  [/chil(l)?i/i, "🌶️"],
  [/potato/i, "🥔"],
  [/egg/i, "🥚"],
  [/chicken/i, "🍗"],
  [/mutton|lamb|goat/i, "🍖"],
  [/fish/i, "🐟"],
  [/shrimp|prawn/i, "🦐"],
  [/milk/i, "🥛"],
  [/butter|ghee/i, "🧈"],
  [/oil/i, "🫒"],
  [/lemon|lime/i, "🍋"],
  [/coriander|cilantro|mint|curry leaves/i, "🌿"],
  [/spinach|greens|methi/i, "🥬"],
  [/cabbage/i, "🥬"],
  [/broccoli/i, "🥦"],
  [/beetroot/i, "🫜"],
  [/carrot/i, "🥕"],
  [/banana/i, "🍌"],
  [/bajra/i, "🌾"],
  [/barley/i, "🌾"],
  [/cumin/i, "🌿"],
[/drumstick/i, "🌿"],
[/lettuce/i, "🥬"],
[/pistachios?/i, "🥜"],
[/soy sauce/i, "🥣"],
[/soya chunks/i, "🫘"],
  [/basil/i, "🌿"],
  [/ajwain/i, "🌿"],
[/asafoetida/i, "🧂"],
[/avocado/i, "🥑"],
[/black chickpeas/i, "🫘"],
[/black gram/i, "🫘"],
[/brinjal|eggplant/i, "🍆"],
[/capsicum/i, "🫑"],
[/cardamom/i, "🌿"],
[/chaat masala|chat masala/i, "🧂"],
[/chia seeds/i, "🌱"],
[/chickpeas/i, "🫘"],
[/cream/i, "🥛"],
[/dates/i, "🌴"],
[/dill leaves/i, "🌿"],
[/fenugreek leaves/i, "🥬"],
[/flax seeds/i, "🌱"],
[/grapes/i, "🍇"],
  [/bay leaf/i, "🍃"],
  [/dosa batter/i, "🥣"],
  [/sambar powder/i, "🧂"],
  [/green pea/i, "🫛"],
  [/okra|bhindi/i, "🫛"],
  [/corn|bhutta/i, "🌽"],
  [/cucumber|kheera/i, "🥒"],
  [/gourd|lauki|karela/i, "🥒"],
  [/cauliflower|gobi/i, "🥦"],
  [/jamun/i, "🫐"],
  [/pomegranate|anar/i, "🍎"],
  [/custard apple|sitaphal/i, "🍈"],
  [/amla/i, "🫒"],
  [/coconut/i, "🥥"],
  [/flour|atta|wheat|maida/i, "🌾"],
  [/sugar|jaggery/i, "🍬"],
  [/salt/i, "🧂"],
  [/water/i, "💧"],
  [/mustard seeds/i, "🟡"],
  [/curd|yog[ho]urt/i, "🥣"],
  [/dal|lentil|bean/i, "🫘"],
  [/mushroom/i, "🍄"],
  [/bread/i, "🍞"],
  [/pineapple/i, "🍍"],
  [/apple/i, "🍎"],
  [/mango/i, "🥭"],
  [/strawberry/i, "🍓"],
  [/nut|almond|cashew|peanut/i, "🥜"],
  [/pepper/i, "⚫"],
  [/cinnamon|clove|cardamom|spice|masala/i, "🧂"],
  [/fennel seeds/i, "🌱"],
[/fenugreek seeds/i, "🟤"],
[/hemp seeds/i, "🌱"],
[/mixed sprouts/i, "🌱"],
[/nigella seeds/i, "⚫"],
[/noodles/i, "🍜"],
[/pumpkin seeds/i, "🌱"],
[/radish/i, "🫜"],
[/rasam powder/i, "🧂"],
[/sesame seeds/i, "🌱"],
[/sunflower seeds/i, "🌻"],
[/tamarind/i, "🫘"],
[/beef/i, "🥩"],
[/mutton|lamb|goat/i, "🍖"],
[/greek yogurt/i, "🥣"],
[/green gram/i, "🫘"],
[/fig/i, "🫐"],
[/tofu/i, "🧊"],
[/orange/i, "🍊"],
[/ragi/i, "🌾"],
[/moong sprouts/i, "🌱"],
[/guava/i, "🍐"],
[/vinegar/i, "🧴"],
[/yogurt/i, "🥣"],
[/moringa leaves/i, "🌿"],
[/zucchini/i, "🥒"],
[/kiwi/i, "🥝"],
[/mayonnaise/i, "🥣"],
[/millet/i, "🌾"],
[/jowar/i, "🌾"],
[/rajma/i, "🫘"],
[/pumpkin/i, "🎃"],
[/semolina/i, "🌾"],
[/oats/i, "🌾"],
[/quinoa/i, "🌾"],
[/papaya/i, "🧡"],
[/parsley/i, "🌿"],
[/turnip/i, "🫜"],
[/raisins/i, "🍇"],
[/star anise/i, "⭐"],
[/turmeric/i, "🟡"],
[/vermicelli/i, "🍜"],
];

function nvIngredientIcon(name) {
  const match = NV_INGREDIENT_ICONS.find(([re]) => re.test(name));
  return match ? match[1] : "🥄";
}

function nvIngredientChip(name) {
  return `<span class="nv-ing-chip">${nvIngredientIcon(name)} ${name}</span>`;
}

function nvIngredientChipsHtml(commaSeparatedOrArray) {
  const list = Array.isArray(commaSeparatedOrArray)
    ? commaSeparatedOrArray
    : String(commaSeparatedOrArray || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return "";
  return `<div class="d-flex flex-wrap gap-2">${list.map(nvIngredientChip).join("")}</div>`;
}

// Category -> pastel gradient + big emoji, used as a card "photo" when no
// real dish image is provided.
const NV_CATEGORY_ART = {
  gut_health: { gradient: "linear-gradient(135deg,#DCEFE2,#B9E0C4)", emoji: "🥗" },
  family: { gradient: "linear-gradient(135deg,#FBE3D6,#F6C9AE)", emoji: "🍲" },
  quick_no_stove: { gradient: "linear-gradient(135deg,#DCEEF7,#B7DDEF)", emoji: "🥪" },
  veg: { gradient: "linear-gradient(135deg,#E4F3D8,#C6E8AE)", emoji: "🥦" },
  nonveg_egg: { gradient: "linear-gradient(135deg,#FDECC8,#FAD98A)", emoji: "🍳" },
  seafood: { gradient: "linear-gradient(135deg,#D9F1F1,#AEE0E0)", emoji: "🦐" },
};

// Resolves a class's image_url into something a browser can actually load.
// - Full external URLs (http://..., https://...) are used as-is — e.g. a
//   contributor pasted a photo link directly, same as external video_urls.
// - A locally-uploaded path (e.g. "uploads/images/dish_123.png") is
//   relative to the BACKEND (port 5000), not the frontend's own origin
//   (port 5500 per package.json) — so it needs the backend's origin
//   prefixed, exactly like classdetail.html already does for native
//   video playback via API_BASE.replace("/api", "").
function nvResolveImageUrl(imageUrl) {
  if (/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }
  const backendOrigin = API_BASE.replace(/\/api$/, "");
  return `${backendOrigin}/${imageUrl}`;
}

// Renders the card "photo" area: a real image if the class has one,
// otherwise a cute pastel placeholder keyed by category.
function nvCardArtHtml(cls) {
  const art = NV_CATEGORY_ART[cls.category] || {
    gradient: "linear-gradient(135deg,#F3E9D8,#E8D6B8)",
    emoji: "🍽️"
  };

  // Get YouTube video ID
  let videoId = null;

  if (cls.video_url) {
    const match = cls.video_url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\/]+)/
    );

    if (match) {
      videoId = match[1];
    }
  }

  // If YouTube ID exists, show thumbnail
  if (videoId) {
    return `
      <div class="nv-card-thumb nv-youtube-thumb"
           style="background:${art.gradient};">

        <img
          src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg"
          alt="${cls.title}"
          onerror="this.style.display='none'; this.parentElement.querySelector('.nv-thumb-fallback').style.display='flex';"
        >

        <div class="nv-thumb-fallback"
             style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:60px;">
          ${art.emoji}
        </div>

      </div>
    `;
  }

  // No YouTube URL → show emoji
  return `
    <div
      class="nv-card-thumb nv-card-art"
      style="background:${art.gradient};"
    >
      <span>${art.emoji}</span>
    </div>
  `;
}