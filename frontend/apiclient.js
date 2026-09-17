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

// GET /api/admin/pending
function nvGetPendingClasses() {
  return nvApi("/admin/pending", { method: "GET" });
}

// POST /api/admin/review  { class_id, decision: 'approve' | 'reject' }
function nvReviewClass(classId, decision) {
  return nvApi("/admin/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ class_id: classId, decision }),
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
function nvUploadClass(formFields, videoFile) {
  const fd = new FormData();
  Object.entries(formFields).forEach(([k, v]) => fd.append(k, v));
  if (videoFile) fd.append("video", videoFile);
  return nvApi("/upload-class", { method: "POST", body: fd });
}

// Converts a plain YouTube URL (watch?v=, youtu.be/, etc.) to an
// embeddable URL. Falls back to the original string if it doesn't match.
function nvToYoutubeEmbed(url) {
  const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}