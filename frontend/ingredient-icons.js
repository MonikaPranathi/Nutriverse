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
  [/paneer|cottage cheese/i, "🧀"],
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
  [/carrot/i, "🥕"],
  [/banana/i, "🍌"],
  [/coconut/i, "🥥"],
  [/flour|atta|wheat|maida/i, "🌾"],
  [/sugar|jaggery/i, "🍬"],
  [/salt/i, "🧂"],
  [/water/i, "💧"],
  [/curd|yog[ho]urt/i, "🥣"],
  [/dal|lentil|bean/i, "🫘"],
  [/mushroom/i, "🍄"],
  [/bread/i, "🍞"],
  [/apple/i, "🍎"],
  [/mango/i, "🥭"],
  [/nut|almond|cashew|peanut/i, "🥜"],
  [/pepper/i, "🫑"],
  [/cinnamon|clove|cardamom|spice|masala/i, "🧂"],
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

// Renders the card "photo" area: a real image if the class has one
// (once the backend supports image_url — see gap in MEMBER4_NOTES.md),
// otherwise a cute pastel placeholder keyed by category.
function nvCardArtHtml(cls) {
  if (cls.image_url) {
    return `<img src="${cls.image_url}" class="nv-card-thumb" alt="${cls.title}">`;
  }
  const art = NV_CATEGORY_ART[cls.category] || { gradient: "linear-gradient(135deg,#F3E9D8,#E8D6B8)", emoji: "🍽️" };
  return `<div class="nv-card-thumb nv-card-art" style="background:${art.gradient}"><span>${art.emoji}</span></div>`;
}
