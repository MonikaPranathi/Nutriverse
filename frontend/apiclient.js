/*
  API CLIENT — Member 4 pages
  -----------------------------------------------------------------
  Based on the real backend-db branch code (admin.js, auth.js, db.js,
  notifications.js, classes.js, server.js), NOT the PHP contract
  described in the original procedure doc. Key facts:

  - Base URL: http://localhost:5000/api  (server.js: PORT=5000, all
    routes mounted at /api). Change API_BASE below once there's a
    deployed URL.
  - All routes return { success, message, data }.
  - Real filter/enum fields (classes table) — NOT "cuisine"/"mood":
      category:    gut_health | family | quick_no_stove | veg | nonveg_egg | seafood
      budget:      low | medium | high
      time_needed: quick | medium | long
      taste:       spicy | sweet | neutral
      skill_level: beginner | intermediate | advanced
      meal_time:   morning | afternoon | evening | night
      source_type: native | youtube | external
  - GET /api/classes returns rows with: id, title, category, budget,
    time_needed, taste, skill_level, meal_time, video_url, source_type,
    uploader_id, status, created_at. No thumbnail, instructor, or
    rating fields exist in the schema.

  GAPS in the current backend (flagged to raise with Divya/Pranathi —
  see MEMBER4_NOTES.md):
    1. No GET /api/classes/:id — class-detail.html falls back to
       fetching the approved list and finding the id client-side.
    2. No endpoint to list a user's liked/saved classes (only
       POST /api/like-class to record one). "Saved classes" on the
       dashboard can't be populated yet.
    3. No endpoint to list a user's own uploads. Worked around by
       fetching pending/approved/rejected classes and filtering by
       uploader_id client-side — inefficient, ask for a
       GET /api/my-uploads?user_id= endpoint.
    4. server.js doesn't serve the uploads/ folder statically
       (no app.use('/uploads', express.static(...))), so native
       video uploads won't actually play until that's added.
    5. No dish-photo field. The classes table has no image_url column,
       and GET /api/classes doesn't return ingredient names (only
       match-ingredients touches ingredients, and only as counts).
       nvUploadClass() below already sends an optional "image" file
       so the frontend is ready the moment the backend adds an
       image_url column + returns it — until then, cards fall back to
       a cute category-based placeholder graphic (see ingredient-icons.js
       nvCardArtHtml()) instead of a real photo.
*/

const API_BASE = "http://localhost:5000/api";

const NV_ENUMS = {
  category: [
    { value: "gut_health", label: "Gut Health" },
    { value: "family", label: "Family-Friendly" },
    { value: "quick_no_stove", label: "Quick & No-Stove" },
    { value: "veg", label: "Vegetarian" },
    { value: "nonveg_egg", label: "Non-Veg & Egg" },
    { value: "seafood", label: "Seafood" },
  ],
  budget: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  time_needed: [
    { value: "quick", label: "Quick" },
    { value: "medium", label: "Medium" },
    { value: "long", label: "Long" },
  ],
  taste: [
    { value: "spicy", label: "Spicy" },
    { value: "sweet", label: "Sweet" },
    { value: "neutral", label: "Neutral" },
  ],
  skill_level: [
    { value: "beginner", label: "Beginner" },
    { value: "intermediate", label: "Intermediate" },
    { value: "advanced", label: "Advanced" },
  ],
  meal_time: [
    { value: "morning", label: "Morning" },
    { value: "afternoon", label: "Afternoon" },
    { value: "evening", label: "Evening" },
    { value: "night", label: "Night" },
  ],
  source_type: [
    { value: "native", label: "Upload a video" },
    { value: "youtube", label: "YouTube link" },
    { value: "external", label: "Other external link" },
  ],
  tip_type: [
    { value: "storage", label: "Storage" },
    { value: "fix_mistake", label: "Fix a mistake" },
    { value: "substitution", label: "Substitution" },
    { value: "general", label: "General" },
  ],
  gender: [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
  ],
  activity_level: [
    { value: "sedentary", label: "Sedentary" },
    { value: "light", label: "Lightly active" },
    { value: "moderate", label: "Moderately active" },
    { value: "active", label: "Active" },
    { value: "very_active", label: "Very active" },
  ],
  goal: [
    { value: "weight_loss", label: "Weight loss" },
    { value: "maintenance", label: "Maintenance" },
    { value: "muscle_gain", label: "Muscle gain" },
    { value: "diabetes_management", label: "Diabetes management" },
    { value: "general_health", label: "General health" },
  ],
  spice_tolerance: [
    { value: "mild", label: "Mild" },
    { value: "medium", label: "Medium" },
    { value: "hot", label: "Hot" },
    { value: "extra_hot", label: "Extra hot" },
  ],
};

function nvLabel(field, value) {
  const found = (NV_ENUMS[field] || []).find((o) => o.value === value);
  return found ? found.label : value;
}

// ---------------------------------------------------------------------
// Session — Member 3's login/signup pages should call nvSetCurrentUser()
// with the `user` object auth.js's /api/login returns: { id, name, role }
// ---------------------------------------------------------------------
function nvSetCurrentUser(user) {
  sessionStorage.setItem("nv_user", JSON.stringify(user));
}
function nvGetCurrentUser() {
  try {
    return JSON.parse(sessionStorage.getItem("nv_user"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Generic request helper — real endpoints, real error surfacing.
// No dummy-data fallback here: the backend exists, so failures should
// be visible (e.g. "backend not running") rather than silently masked.
// ---------------------------------------------------------------------
async function nvApi(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const data = await res.json().catch(() => ({ success: false, message: "Invalid server response." }));
  if (!data.success) {
    throw new Error(data.message || "Request failed.");
  }
  return data.data;
}

// GET /api/classes?status=&category=&budget=&time_needed=&taste=&skill_level=&meal_time=
function nvGetClasses(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const qs = params.toString();
  return nvApi(`/classes${qs ? `?${qs}` : ""}`, { method: "GET" });
}

// No GET /api/classes/:id in the current backend — fetch the approved
// list and find the match client-side. Swap this for a real endpoint
// call the moment one exists.
async function nvGetClassById(id) {
  const classes = await nvGetClasses({ status: "approved" });
  const found = classes.find((c) => String(c.id) === String(id));
  if (found) return found;
  // fall back to pending, in case a contributor is previewing their own submission
  const pending = await nvGetClasses({ status: "pending" });
  return pending.find((c) => String(c.id) === String(id)) || null;
}

// GET /api/admin/pending?admin_id=
// admin.js's requireAdmin middleware reads admin_id from the query/body
// and checks that user's role — it has to be the logged-in user's id,
// not left off, or every admin call 401s/403s.
function nvGetPendingClasses() {
  const user = nvGetCurrentUser();
  return nvApi(`/admin/pending?admin_id=${user ? user.id : ""}`, { method: "GET" });
}

// POST /api/admin/review  { admin_id, class_id, decision: 'approve' | 'reject' }
function nvReviewClass(classId, decision) {
  const user = nvGetCurrentUser();
  return nvApi("/admin/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ admin_id: user ? user.id : null, class_id: classId, decision }),
  });
}

// GET /api/notifications?user_id=
function nvGetNotifications(userId) {
  return nvApi(`/notifications?user_id=${userId}`, { method: "GET" });
}

// POST /api/like-class  { user_id, class_id }
function nvLikeClass(userId, classId) {
  return nvApi("/like-class", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, class_id: classId }),
  });
}

// POST /api/upload-class — multipart/form-data (multer expects field
// name "video" for the file). formFields is a plain object of the
// text fields; videoFile is an optional File.
//
// imageFile (a dish photo) is sent as a field named "image" so the
// upload is future-proofed for when the backend adds image support
// (see gap #5 above). The current multer setup on /api/upload-class
// only declares upload.single('video'), so an extra "image" field in
// the same multipart body will likely be silently ignored (or, if
// multer is strict there, could error) until the backend adds
// upload.fields([{ name: 'video' }, { name: 'image' }]) — flag this
// with the backend before relying on it.
function nvUploadClass(formFields, videoFile, imageFile) {
  const fd = new FormData();
  Object.entries(formFields).forEach(([k, v]) => fd.append(k, v));
  if (videoFile) fd.append("video", videoFile);
  if (imageFile) fd.append("image", imageFile);
  return nvApi("/upload-class", { method: "POST", body: fd });
}

// Converts a plain YouTube URL (watch?v=, youtu.be/, etc.) to an
// embeddable URL. Falls back to the original string if it doesn't match.
function nvToYoutubeEmbed(url) {
  const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

/* =====================================================================
   EVERYTHING BELOW IS NEW — wrappers for classes.js/profile.js/planner.js/
   social.js/collections.js/cookbooks.js/discovery.js/tips.js endpoints
   that didn't have frontend pages yet.
   ===================================================================== */

// ---- classes.js: lookups + steps ----
function nvGetMoods() { return nvApi("/moods", { method: "GET" }); }
function nvGetAllergens() { return nvApi("/allergens", { method: "GET" }); }
function nvGetCuisines() { return nvApi("/cuisines", { method: "GET" }); }
function nvGetClassSteps(classId) { return nvApi(`/class-steps?class_id=${classId}`, { method: "GET" }); }
function nvAddIngredient(name) {
  return nvApi("/add-ingredient", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

// ---- social.js: favorites + reviews ----
function nvFavoriteClass(userId, classId) {
  return nvApi("/favorite-class", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, class_id: classId }),
  });
}
function nvUnfavoriteClass(userId, classId) {
  return nvApi("/favorite-class", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, class_id: classId }),
  });
}
function nvGetFavorites(userId) { return nvApi(`/favorites?user_id=${userId}`, { method: "GET" }); }

// POST /api/review-class — multipart (photo optional). fields: user_id,
// class_id, rating, review_text?. photoFile is an optional File.
function nvSubmitReview(fields, photoFile) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  if (photoFile) fd.append("photo", photoFile);
  return nvApi("/review-class", { method: "POST", body: fd });
}
function nvGetReviews(classId) { return nvApi(`/reviews?class_id=${classId}`, { method: "GET" }); }
function nvGetTopRated(limit) { return nvApi(`/top-rated${limit ? `?limit=${limit}` : ""}`, { method: "GET" }); }

// ---- profile.js: profile, dietary, allergies, body metrics, cuisine prefs ----
function nvGetProfile(userId) { return nvApi(`/profile?user_id=${userId}`, { method: "GET" }); }
function nvUpdateProfile(userId, fields) {
  return nvApi("/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, ...fields }),
  });
}
function nvGetDietaryOptions() { return nvApi("/dietary-options", { method: "GET" }); }
function nvGetDietaryPreferences(userId) { return nvApi(`/dietary-preferences?user_id=${userId}`, { method: "GET" }); }
function nvSetDietaryPreferences(userId, preferences) {
  return nvApi("/dietary-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, preferences }),
  });
}
function nvGetAllergies(userId) { return nvApi(`/allergies?user_id=${userId}`, { method: "GET" }); }
function nvSetAllergies(userId, allergies) {
  return nvApi("/allergies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, allergies }),
  });
}
function nvGetCuisinePreferences(userId) { return nvApi(`/cuisine-preferences?user_id=${userId}`, { method: "GET" }); }
function nvSetCuisinePreferences(userId, cuisines) {
  return nvApi("/cuisine-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, cuisines }),
  });
}
function nvLogBodyMetrics(userId, fields) {
  return nvApi("/body-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, ...fields }),
  });
}
function nvGetBodyMetrics(userId) { return nvApi(`/body-metrics?user_id=${userId}`, { method: "GET" }); }

// ---- planner.js: meal plan + shopping list ----
function nvSetMealPlanEntry(userId, planDate, mealTime, classId) {
  return nvApi("/meal-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, plan_date: planDate, meal_time: mealTime, class_id: classId }),
  });
}
function nvGetMealPlan(userId, startDate, endDate) {
  return nvApi(`/meal-plan?user_id=${userId}&start_date=${startDate}&end_date=${endDate}`, { method: "GET" });
}
function nvDeleteMealPlanEntry(userId, planDate, mealTime) {
  return nvApi("/meal-plan", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, plan_date: planDate, meal_time: mealTime }),
  });
}
function nvGetShoppingList(userId, startDate, endDate) {
  return nvApi(`/shopping-list?user_id=${userId}&start_date=${startDate}&end_date=${endDate}`, { method: "GET" });
}

// ---- collections.js: curated collections ----
function nvGetCollections() { return nvApi("/collections", { method: "GET" }); }
function nvGetCollectionClasses(collectionId) { return nvApi(`/collection-classes?collection_id=${collectionId}`, { method: "GET" }); }
function nvCreateCollection(name, description) {
  return nvApi("/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
}
function nvAddClassToCollection(collectionId, classId) {
  return nvApi("/collection-classes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collection_id: collectionId, class_id: classId }),
  });
}
function nvGetSeasonalIngredients(month) {
  return nvApi(`/seasonal-ingredients${month ? `?month=${month}` : ""}`, { method: "GET" });
}

// ---- cookbooks.js: user-created cookbooks ----
function nvGetCookbooks(userId) { return nvApi(`/cookbooks?user_id=${userId}`, { method: "GET" }); }
function nvCreateCookbook(userId, name, description) {
  return nvApi("/cookbooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, name, description }),
  });
}
function nvGetCookbookClasses(cookbookId) { return nvApi(`/cookbook-classes?cookbook_id=${cookbookId}`, { method: "GET" }); }
function nvAddClassToCookbook(userId, cookbookId, classId) {
  return nvApi("/cookbook-classes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, cookbook_id: cookbookId, class_id: classId }),
  });
}
function nvRemoveClassFromCookbook(userId, cookbookId, classId) {
  return nvApi("/cookbook-classes", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, cookbook_id: cookbookId, class_id: classId }),
  });
}

// ---- discovery.js: waste-not chain, skill ladder, substitutions ----
function nvGetWasteNotChain(classId, limit) {
  return nvApi(`/waste-not-chain?class_id=${classId}${limit ? `&limit=${limit}` : ""}`, { method: "GET" });
}
function nvCompleteClass(userId, classId) {
  return nvApi("/complete-class", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, class_id: classId }),
  });
}
function nvGetSkillLadder(userId) { return nvApi(`/skill-ladder?user_id=${userId}`, { method: "GET" }); }
function nvGetSubstitutions(ingredient) { return nvApi(`/substitutions?ingredient=${encodeURIComponent(ingredient)}`, { method: "GET" }); }
function nvAddSubstitution(ingredient, substitute, notes) {
  return nvApi("/substitutions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredient, substitute, notes }),
  });
}

// ---- tips.js: tip of the day + browsing ----
function nvGetTipOfDay() { return nvApi("/tip-of-the-day", { method: "GET" }); }
function nvGetTips(type) { return nvApi(`/tips${type ? `?type=${type}` : ""}`, { method: "GET" }); }
function nvAddTip(tipText, tipType) {
  return nvApi("/tips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tip_text: tipText, tip_type: tipType }),
  });
}

// ---- shared small helper: turn an Enter-separated / comma list input
// into the pipe/comma strings the upload-class endpoint expects ----
function nvCleanCsv(str) {
  return String(str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}

/* =====================================================================
   SHARED NAVBAR — every page has <nav id="nv-navbar-root" class="navbar
   navbar-expand-lg nv-navbar sticky-top"></nav> and calls
   nvRenderNavbar("key") once apiclient.js has loaded. Centralizing this
   means every new page (planner, cookbooks, profile, tips...) shows up
   in the nav automatically instead of 10 copies going out of sync.
   ===================================================================== */
const NV_NAV_LINKS = [
  { href: "index.html", label: "Home", key: "home" },
  { href: "classlisting.html", label: "Classes", key: "classes" },
  { href: "ingredientmatch.html", label: "Ingredient Match", key: "match" },
  { href: "substitutions.html", label: "Substitutions", key: "subs" },
  { href: "upload.html", label: "Upload", key: "upload" },
  { href: "planner.html", label: "Planner", key: "planner" },
  { href: "cookbooks.html", label: "Cookbooks", key: "cookbooks" },
  { href: "tips.html", label: "Tips", key: "tips" },
  { href: "userdashboard.html", label: "Dashboard", key: "dashboard" },
];

function nvRenderNavbar(activeKey) {
  const root = document.getElementById("nv-navbar-root");
  if (!root) return;
  const user = nvGetCurrentUser();

  const links = NV_NAV_LINKS.map(
    (l) => `<li class="nav-item"><a class="nav-link${l.key === activeKey ? " active" : ""}" href="${l.href}">${l.label}</a></li>`
  ).join("");

  const adminLink = user && user.role === "admin"
    ? `<li class="nav-item"><a class="nav-link${activeKey === "admin" ? " active" : ""}" href="admindashboard.html">Admin</a></li>`
    : "";

  const authLink = user
    ? `<li class="nav-item"><a class="nav-link${activeKey === "profile" ? " active" : ""}" href="profile.html">${user.name}</a></li>
       <li class="nav-item"><a class="nav-link" href="#" id="logout-link">Log out</a></li>`
    : `<li class="nav-item"><a class="nav-link" href="login.html">Log In</a></li>`;

  root.innerHTML = `
    <div class="container">
      <a class="navbar-brand" href="index.html">Nutriverse</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nvNav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="nvNav">
        <ul class="navbar-nav ms-auto align-items-lg-center">
          ${links}
          ${adminLink}
          ${authLink}
        </ul>
      </div>
    </div>`;

  const logoutLink = document.getElementById("logout-link");
  if (logoutLink) {
    logoutLink.addEventListener("click", (e) => {
      e.preventDefault();
      sessionStorage.removeItem("nv_user");
      sessionStorage.removeItem("nv_meal_time");
      window.location.href = "login.html";
    });
  }
}

// Small shared helper: render a 1-5 star display (read-only) from a
// numeric rating, used on class cards/detail/reviews.
function nvStarDisplay(rating) {
  const r = Math.round(Number(rating) || 0);
  return `<span class="nv-star-display">${"★".repeat(r)}${"☆".repeat(5 - r)}</span>`;
}