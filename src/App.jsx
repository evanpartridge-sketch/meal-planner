import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = "730204181239-qhan4dk94d69e94lb1dt55b4k1j58pri.apps.googleusercontent.com";
const DRIVE_FOLDER_ID = "1OwlVzGl91UjJegeyYJP1efQTq2eLZ-qO";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const CALORIE_GOAL = 1800;

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MEALS = ["Breakfast", "Lunch", "Dinner"];

const EMPTY_PLAN = {
  Monday:    { Breakfast: null, Lunch: null, Dinner: null },
  Tuesday:   { Breakfast: null, Lunch: null, Dinner: null },
  Wednesday: { Breakfast: null, Lunch: null, Dinner: null },
  Thursday:  { Breakfast: null, Lunch: null, Dinner: null },
  Friday:    { Breakfast: null, Lunch: null, Dinner: null },
  Saturday:  { Breakfast: null, Lunch: null, Dinner: null },
  Sunday:    { Breakfast: null, Lunch: null, Dinner: null },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRecipe(id, recipes) {
  return recipes.find(r => r.id === id) || null;
}

function getDayCalories(dayPlan, recipes) {
  return Object.values(dayPlan).reduce((sum, slot) => {
    if (!slot) return sum;
    const arr = Array.isArray(slot) ? slot : [{ type: "recipe", recipeId: slot }];
    return sum + arr.reduce((s, item) => {
      if (item.type !== "recipe") return s;
      const r = getRecipe(item.recipeId, recipes);
      return s + (r?.caloriesPerServing || 0) * (item.servings || 1);
    }, 0);
  }, 0);
}

// ─── Shopping List Helpers ────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "produce",  icon: "🥬", name: "Produce",        keywords: ["tomato","lettuce","spinach","kale","onion","garlic","ginger","lemon","lime","apple","banana","pepper","broccoli","carrot","celery","cucumber","zucchini","herb","cilantro","parsley","basil","avocado","mushroom","potato","sweet potato","scallion","shallot","arugula","chard","beet","radish","fennel","artichoke","asparagus","corn","pea","bean sprout","green bean","bok choy","leek","chive"] },
  { id: "meat",     icon: "🥩", name: "Meat & Seafood",  keywords: ["chicken","beef","pork","turkey","salmon","shrimp","tuna","bacon","sausage","lamb","steak","thigh","breast","ground","cod","tilapia","halibut","crab","lobster","scallop","anchov","prosciutto","pancetta","chorizo","duck","venison","bison"] },
  { id: "dairy",    icon: "🥛", name: "Dairy & Eggs",    keywords: ["milk","cheese","butter","cream","yogurt","egg","cheddar","mozzarella","parmesan","ricotta","sour cream","half-and-half","whipping cream","heavy cream","feta","goat cheese","brie","cottage cheese","kefir","ghee","crème fraîche"] },
  { id: "pantry",   icon: "🥫", name: "Pantry & Canned", keywords: ["sauce","soy sauce","gochujang","honey","oil","vinegar","broth","stock","canned","beans","lentil","tomato paste","coconut milk","flour","sugar","salt","spice","cumin","paprika","oregano","sesame","mustard","mayo","ketchup","pepper","baking","tahini","miso","fish sauce","oyster sauce","hoisin","sriracha","hot sauce","curry","turmeric","coriander","cardamom","cinnamon","nutmeg","bay leaf","thyme","rosemary","sage","chili flake","red pepper flake","dressing","syrup","jam","paste","puree","chickpea","black bean","kidney bean","lentil","split pea","tofu","tempeh","nutritional yeast","anchovy paste","capers","olive","pickle","sauerkraut","kimchi","nori"] },
  { id: "grains",   icon: "🍞", name: "Bread & Grains",  keywords: ["bread","rice","pasta","noodle","tortilla","wrap","bagel","oats","quinoa","couscous","cereal","cracker","panko","breadcrumb","pita","roll","baguette","sourdough","rye","barley","farro","bulgur","polenta","grits","semolina","spaghetti","linguine","fettuccine","penne","rigatoni","orzo","udon","ramen","soba","rice noodle","lasagna","macaroni"] },
  { id: "frozen",   icon: "🧊", name: "Frozen",          keywords: ["frozen","ice cream","gelato","sorbet"] },
  { id: "other",    icon: "🧴", name: "Other",            keywords: [] },
];

function detectCategory(text) {
  const lower = text.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.id === "other") return cat;
    if (cat.keywords.some(kw => lower.includes(kw))) return cat;
  }
  return CATEGORIES[CATEGORIES.length - 1];
}

// Quantity parsing helpers
const UNICODE_FRACS = { "½":0.5, "⅓":1/3, "⅔":2/3, "¼":0.25, "¾":0.75, "⅛":0.125, "⅜":0.375, "⅝":0.625, "⅞":0.875 };
const FRAC_DISPLAY   = [[0.875,"⅞"],[0.75,"¾"],[0.625,"⅝"],[0.5,"½"],[0.375,"⅜"],[0.25,"¼"],[1/3,"⅓"],[2/3,"⅔"],[0.125,"⅛"]];

function parseIngredientQty(text) {
  // Match: optional whole number, optional unicode fraction, optional /denom, then rest
  const m = text.match(/^(\d+)?([\u00BC-\u00BE\u2150-\u215E])?(?:\s*\/\s*(\d+))?\s*(.*)/);
  if (!m || (!m[1] && !m[2])) return null;
  const whole = m[1] ? parseInt(m[1]) : 0;
  const unicodeFrac = m[2] ? (UNICODE_FRACS[m[2]] || 0) : 0;
  const denomStr = m[3];
  let value;
  if (denomStr && !unicodeFrac) {
    value = whole + 1 / parseInt(denomStr);
  } else {
    value = whole + unicodeFrac;
  }
  if (value <= 0) return null;
  return { value, rest: m[4] || "" };
}

function formatQty(value) {
  if (value <= 0) return "0";
  const whole = Math.floor(value);
  const frac = value - whole;
  const nearFrac = FRAC_DISPLAY.find(([f]) => Math.abs(f - frac) < 0.06);
  if (Math.abs(frac) < 0.06) return String(whole || 0);
  if (whole === 0 && nearFrac) return nearFrac[1];
  if (nearFrac) return `${whole}${nearFrac[1]}`;
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function getQtyStep(value) {
  if (value <= 0.25) return 0.125;
  if (value < 1) return 0.25;
  return 1;
}

function generateShoppingItems(plan, recipes, recipeEdits, manualItems, qtyOverrides, servingOverrides = {}) {
  const itemMap = {};
  DAYS.forEach(day => {
    MEALS.forEach(meal => {
      const slot = plan[day]?.[meal];
      if (!slot) return;
      const arr = Array.isArray(slot) ? slot : [{ type: "recipe", recipeId: slot }];
      arr.forEach(item => {
        if (item.type !== "recipe") return;
        const r = recipes.find(rec => rec.id === item.recipeId);
        if (!r) return;
        const baseServings = parseServings(r.yield);
        const targetServings = servingOverrides[item.recipeId] ?? baseServings;
        const ratio = baseServings > 0 ? targetServings / baseServings : 1;
        const ings = recipeEdits[item.recipeId]?.ingredients ?? r.ingredients ?? [];
        ings.forEach(ing => {
          const key = ing.toLowerCase().trim();
          if (!itemMap[key]) {
            // Scale the text for this ingredient based on servings ratio
            const scaledText = scaleIngredient(ing, ratio);
            itemMap[key] = { key, origText: ing, scaledText, count: 0, isManual: false };
          }
          itemMap[key].count++;
        });
      });
    });
  });
  const planItems = Object.values(itemMap).map(it => ({
    ...it,
    // qtyOverrides (manual +/-) take precedence over serving-scaled text
    text: qtyOverrides[it.key] ?? it.scaledText,
    category: detectCategory(it.origText),
  }));
  const manualFormatted = (manualItems || []).map(mi => ({
    key: mi.id,
    origText: mi.text,
    scaledText: mi.text,
    text: qtyOverrides[mi.id] ?? mi.text,
    count: 1,
    isManual: true,
    category: detectCategory(mi.text),
  }));
  return [...planItems, ...manualFormatted];
}

// Legacy wrapper kept for calorie tab (not used for shopping display)
function generateShoppingList(plan, recipes) {
  const ingredientMap = {};
  Object.values(plan).forEach(dayPlan => {
    Object.values(dayPlan).forEach(slot => {
      if (!slot) return;
      const arr = Array.isArray(slot) ? slot : [{ type: "recipe", recipeId: slot }];
      arr.forEach(item => {
        if (item.type !== "recipe") return;
        const r = getRecipe(item.recipeId, recipes);
        if (!r) return;
        (r.ingredients || []).forEach(ing => {
          const key = ing.toLowerCase().trim();
          ingredientMap[key] = (ingredientMap[key] || 0) + 1;
        });
      });
    });
  });
  return Object.entries(ingredientMap).sort((a, b) => a[0].localeCompare(b[0]));
}

const ABBY_BLOCKED = [
  // Eggs
  /\beggs?\b/i,
  /\bmayo(?:nnaise)?\b/i,
  // Dairy — exclude common dairy-free alternatives
  /(?<!peanut |almond |cashew |nut )\bbutter\b/i,
  /(?<!coconut |oat |almond |soy |rice )\bmilk\b/i,
  /\bcheese\b/i,
  /(?<!coconut )\bcream\b/i,
  /\byogurt\b/i,
  /\bghee\b/i,
  /\bwhey\b/i,
  /\bcasein\b/i,
  /\blactose\b/i,
  // Wheat / Gluten
  /\bwheat\b/i,
  /(?<!almond |rice |oat |coconut |chickpea )\bflour\b/i,
  /\bgluten\b/i,
  /\bbarley\b/i,
  /\brye\b/i,
  // Wheat-based pasta & grains
  /\borzo\b/i,
  /\bpasta\b/i,
  /\bspaghetti\b/i,
  /\bpenne\b/i,
  /\bfettuccine?\b/i,
  /\brigatoni\b/i,
  /\bfusilli\b/i,
  /\bcouscous\b/i,
  /\bsemolina\b/i,
  /\bfarro\b/i,
  /\bspelt\b/i,
  /\bbreadcrumbs?\b/i,
  /\bpanko\b/i,
];

function isAbbyApproved(recipe) {
  const allText = [
    ...(recipe.ingredients || []),
    ...(recipe.tags || []),
    recipe.title || "",
  ].join(" ");
  return !ABBY_BLOCKED.some(re => re.test(allText));
}

function parseTotalMinutes(timeStr) {
  if (!timeStr) return null;
  const s = timeStr.toLowerCase();
  // Handle Unicode fractions (e.g. "1¼ hours", "¾ hour")
  const fracToMins = { '¼': 15, '½': 30, '¾': 45, '⅓': 20, '⅔': 40 };
  const hourMatch = /(\d*)(¼|½|¾|⅓|⅔)?\s*hour/.exec(s);
  const h = parseInt(hourMatch?.[1] || '0', 10);
  const frac = hourMatch?.[2] ? (fracToMins[hourMatch[2]] || 0) : 0;
  const m = parseInt((/(\d+)\s*min/.exec(s))?.[1] || '0', 10);
  const total = h * 60 + m + frac;
  return total > 0 ? total : null;
}

function StarRating({ rating, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1,2,3,4,5].map(s => (
        <span
          key={s}
          onClick={() => onChange && onChange(s)}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          style={{
            cursor: onChange ? "pointer" : "default",
            color: s <= (hover || rating) ? "#e8a030" : "#d4c9b8",
            fontSize: 14,
            transition: "color 0.1s"
          }}
        >★</span>
      ))}
    </div>
  );
}

const RECIPE_EMOJIS = ["🥗", "🍲", "🥘", "🍜", "🫕", "🥙", "🍱"];
function recipeEmoji(id) {
  const code = id?.charCodeAt?.(id.length - 1) ?? 0;
  return RECIPE_EMOJIS[code % RECIPE_EMOJIS.length];
}

// ─── Week Helpers ─────────────────────────────────────────────────────────────

function getSundayOfWeek(offset) {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun, 1=Mon, …
  const d = new Date(today);
  d.setDate(today.getDate() - dow + offset * 7);
  return d;
}

// Keep old name as alias so existing call-sites work
const getMondayOfWeek = getSundayOfWeek;

function getWeekLabel(offset) {
  if (offset === 0) return "This Week";
  if (offset === -1) return "Last Week";
  if (offset === 1) return "Next Week";
  const sun = getSundayOfWeek(offset);
  return `Week of ${sun.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// ─── Google Drive API ─────────────────────────────────────────────────────────

async function fetchRecipesFromDrive(token) {
  // List all JSON files in the folder, paginating through all results
  const q = encodeURIComponent(
    `'${DRIVE_FOLDER_ID}' in parents and mimeType='application/json' and trashed=false`
  );
  const allFiles = [];
  let pageToken = null;
  do {
    const url = `${DRIVE_API}/files?q=${q}&fields=nextPageToken,files(id,name)&pageSize=1000`
      + (pageToken ? `&pageToken=${pageToken}` : "");
    const listRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!listRes.ok) {
      const err = await listRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Drive API error ${listRes.status}`);
    }
    const listData = await listRes.json();
    if (listData.files) allFiles.push(...listData.files);
    pageToken = listData.nextPageToken || null;
  } while (pageToken);

  if (allFiles.length === 0) return [];

  // Fetch each file's content in parallel
  const results = await Promise.all(
    allFiles.map(async file => {
      try {
        const contentRes = await fetch(
          `${DRIVE_API}/files/${file.id}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!contentRes.ok) return null;
        const recipe = await contentRes.json();
        return { recipe, fileId: file.id };
      } catch {
        return null;
      }
    })
  );

  return results.filter(Boolean);
}

async function updateRecipeInDrive(token, fileId, recipe) {
  await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(recipe, null, 2),
    }
  );
}

async function createRecipeInDrive(token, recipe) {
  const boundary = "mealplanner_boundary";
  const safeName = (recipe.title || recipe.id).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
  const metadata = JSON.stringify({ name: `${safeName}.json`, parents: [DRIVE_FOLDER_ID], mimeType: "application/json" });
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(recipe, null, 2)}\r\n--${boundary}--`;
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) throw new Error(`Drive create failed: ${res.status}`);
  const data = await res.json();
  return data.id; // Drive file ID
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────

function Spinner({ message = "Loading recipes from Google Drive…" }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: 320, gap: 20
    }}>
      <div style={{
        width: 44, height: 44, border: "3px solid #e8e0d4",
        borderTopColor: "#c8a03c", borderRadius: "50%",
        animation: "spin 0.8s linear infinite"
      }} />
      <div style={{ fontSize: 14, color: "#8a7f72" }}>{message}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Sign In Screen ───────────────────────────────────────────────────────────

function SignInScreen({ onSignIn }) {
  useEffect(() => {
    // Load Google Identity Services script
    if (document.getElementById("google-gsi")) return;
    const script = document.createElement("script");
    script.id = "google-gsi";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  function handleSignIn() {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive",
      callback: (response) => {
        if (response.access_token) {
          onSignIn(response.access_token);
        }
      },
    });
    client.requestAccessToken();
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: 400, gap: 20, textAlign: "center"
    }}>
      <div style={{ fontSize: 48 }}>🌿</div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600 }}>
        Connect Google Drive
      </div>
      <div style={{ fontSize: 14, color: "#8a7f72", maxWidth: 360, lineHeight: 1.6 }}>
        Sign in to load your saved NYT Cooking recipes from Google Drive.
      </div>
      <button
        onClick={handleSignIn}
        style={{
          background: "#1c1915", color: "#f5f0e8",
          border: "none", borderRadius: 10,
          padding: "12px 28px", fontSize: 14, fontWeight: 500,
          cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
          fontFamily: "'DM Sans', sans-serif",
          transition: "background 0.2s"
        }}
      >
        <img src="https://www.google.com/favicon.ico" width={16} height={16} alt="" />
        Sign in with Google
      </button>
    </div>
  );
}

// ─── Serving Scaler Helpers ───────────────────────────────────────────────────

function parseServings(yieldText) {
  if (!yieldText) return 4;
  const match = yieldText.match(/\d+/);
  return match ? parseInt(match[0], 10) : 4;
}

function formatAmount(n) {
  if (n <= 0) return "0";
  const whole = Math.floor(n);
  const frac = n - whole;
  const fracs = [
    [1/8,"⅛"],[1/4,"¼"],[1/3,"⅓"],[3/8,"⅜"],[1/2,"½"],
    [5/8,"⅝"],[2/3,"⅔"],[3/4,"¾"],[7/8,"⅞"],
  ];
  for (const [val, sym] of fracs) {
    if (Math.abs(frac - val) < 0.06) return whole > 0 ? `${whole}${sym}` : sym;
  }
  if (frac < 0.06) return String(whole);
  return String(Math.round(n * 4) / 4);
}

function scaleIngredient(ing, ratio) {
  if (Math.abs(ratio - 1) < 0.001) return ing;
  const unicodeMap = {"½":.5,"⅓":1/3,"⅔":2/3,"¼":.25,"¾":.75,"⅛":.125,"⅜":.375,"⅝":.625,"⅞":.875};
  const pattern = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+[½⅓⅔¼¾⅛⅜⅝⅞]|[½⅓⅔¼¾⅛⅜⅝⅞]|\d+\.?\d*)/;
  const match = ing.match(pattern);
  if (!match) return ing;
  const raw = match[1];
  let num;
  if (/^\d+\s+\d+\/\d+$/.test(raw)) {
    const [w, f] = raw.split(/\s+/);
    const [n, d] = f.split("/");
    num = parseInt(w) + parseInt(n) / parseInt(d);
  } else if (/^\d+\/\d+$/.test(raw)) {
    const [n, d] = raw.split("/");
    num = parseInt(n) / parseInt(d);
  } else {
    const uniMatch = raw.match(/^(\d*)([½⅓⅔¼¾⅛⅜⅝⅞]?)$/);
    const intPart = uniMatch && uniMatch[1] ? parseInt(uniMatch[1]) : 0;
    const uniPart = uniMatch && uniMatch[2] ? (unicodeMap[uniMatch[2]] || 0) : 0;
    num = intPart + uniPart;
  }
  if (!num) return ing;
  return ing.replace(raw, formatAmount(num * ratio));
}

// ─── Recipe Detail Modal ──────────────────────────────────────────────────────

function RecipeDetail({ recipe, onClose, onRate, onMarkCooked, onEstimateCalories, edits, onSaveEdits, onDuplicate, onDelete }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const effectiveYield = edits?.yield ?? recipe.yield ?? "";
  const origServings = parseServings(effectiveYield);
  const [servingCount, setServingCount] = useState(origServings);
  const [isEstimating, setIsEstimating] = useState(false);
  const [showCalTooltip, setShowCalTooltip] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftIngredients, setDraftIngredients] = useState([]);
  const [draftInstructions, setDraftInstructions] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [draftYield, setDraftYield] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftTotalTime, setDraftTotalTime] = useState("");
  const [draftTags, setDraftTags] = useState([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [draftCalorieLines, setDraftCalorieLines] = useState([]); // [{ label, cal }]

  const ratio = origServings > 0 ? servingCount / origServings : 1;

  const effectiveTitle = edits?.title ?? recipe.title;
  const effectiveIngredients = edits?.ingredients ?? recipe.ingredients ?? [];
  const effectiveInstructions = edits?.instructions ?? recipe.instructions ?? [];
  const effectiveDescription = edits?.description ?? recipe.description ?? "";
  const effectiveTotalTime = (edits?.times ?? recipe.times)?.["total time"] ?? "";
  const effectiveTags = edits?.tags ?? recipe.tags ?? [];
  const comments = edits?.comments ?? [];
  const effectiveCaloriesPerServing = edits?.caloriesPerServing ?? recipe.caloriesPerServing;
  const effectiveCalorieReasoning = edits?.calorieReasoning ?? recipe.calorieReasoning;

  function enterEditMode() {
    setDraftTitle(effectiveTitle);
    setDraftIngredients([...effectiveIngredients]);
    setDraftInstructions([...effectiveInstructions]);
    setDraftYield(effectiveYield);
    setDraftDescription(effectiveDescription);
    setDraftTotalTime(effectiveTotalTime);
    setDraftTags([...effectiveTags]);
    const reasoning = edits?.calorieReasoning ?? recipe.calorieReasoning ?? "";
    setDraftCalorieLines(
      reasoning.split("\n")
        .filter(l => l.trim().startsWith("•"))
        .map(l => {
          const calMatch = l.match(/:\s*(\d+)\s*cal\s*$/i);
          return { label: calMatch ? l.slice(0, l.lastIndexOf(":")).trim() : l.trim(), cal: calMatch ? parseInt(calMatch[1], 10) : 0 };
        })
    );
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
  }

  function saveEdit() {
    const autoNotes = [];
    const ts = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const filteredIngredients = draftIngredients.filter(i => i.trim());
    const filteredInstructions = draftInstructions.filter(s => s.trim());

    if (draftTitle.trim() && draftTitle.trim() !== effectiveTitle) {
      autoNotes.push({ id: `${Date.now()}-title`, text: `Title changed: "${effectiveTitle}" → "${draftTitle.trim()}"`, timestamp: ts, isAutoNote: true });
    }
    const removedIngs = effectiveIngredients.filter(i => !filteredIngredients.includes(i));
    const addedIngs = filteredIngredients.filter(i => !effectiveIngredients.includes(i));
    if (removedIngs.length > 0) {
      autoNotes.push({ id: `${Date.now()}-ing-rem`, text: `Removed ingredient${removedIngs.length > 1 ? "s" : ""}: ${removedIngs.join(", ")}`, timestamp: ts, isAutoNote: true });
    }
    if (addedIngs.length > 0) {
      autoNotes.push({ id: `${Date.now()}-ing-add`, text: `Added ingredient${addedIngs.length > 1 ? "s" : ""}: ${addedIngs.join(", ")}`, timestamp: ts, isAutoNote: true });
    }
    const instructionsChanged = filteredInstructions.length !== effectiveInstructions.length || filteredInstructions.some((s, i) => s !== effectiveInstructions[i]);
    if (instructionsChanged) {
      autoNotes.push({ id: `${Date.now()}-inst`, text: "Preparation steps updated", timestamp: ts, isAutoNote: true });
    }
    if (draftYield.trim() !== effectiveYield) {
      autoNotes.push({ id: `${Date.now()}-yield`, text: `Yield updated to "${draftYield.trim() || "—"}"`, timestamp: ts, isAutoNote: true });
    }
    if (draftDescription.trim() !== effectiveDescription) {
      autoNotes.push({ id: `${Date.now()}-desc`, text: "Description updated", timestamp: ts, isAutoNote: true });
    }
    if (draftTotalTime.trim() !== effectiveTotalTime) {
      autoNotes.push({ id: `${Date.now()}-time`, text: `Total time updated to "${draftTotalTime.trim() || "—"}"`, timestamp: ts, isAutoNote: true });
    }
    const addedTags = draftTags.filter(t => !effectiveTags.includes(t));
    const removedTags = effectiveTags.filter(t => !draftTags.includes(t));
    if (addedTags.length > 0) autoNotes.push({ id: `${Date.now()}-tag-add`, text: `Added tag${addedTags.length > 1 ? "s" : ""}: ${addedTags.join(", ")}`, timestamp: ts, isAutoNote: true });
    if (removedTags.length > 0) autoNotes.push({ id: `${Date.now()}-tag-rem`, text: `Removed tag${removedTags.length > 1 ? "s" : ""}: ${removedTags.join(", ")}`, timestamp: ts, isAutoNote: true });
    const newEdits = {
      ...(edits || {}),
      title: draftTitle.trim() || effectiveTitle,
      ingredients: filteredIngredients,
      instructions: filteredInstructions,
      yield: draftYield.trim() || effectiveYield,
      description: draftDescription.trim(),
      times: { ...(recipe.times || {}), "total time": draftTotalTime.trim() },
      tags: draftTags,
      comments: [...comments, ...autoNotes],
    };
    if (draftCalorieLines.length > 0) {
      const calTotal = draftCalorieLines.reduce((s, l) => s + (l.cal || 0), 0);
      const calServings = parseServings(draftYield.trim() || effectiveYield) || 1;
      const calPerServing = Math.round(calTotal / calServings);
      newEdits.caloriesPerServing = calPerServing;
      newEdits.calorieReasoning = [
        ...draftCalorieLines.map(l => `${l.label}: ${l.cal} cal`),
        `Total: ${calTotal} cal ÷ ${calServings} servings = ${calPerServing} / serving`,
      ].join("\n");
    }
    onSaveEdits(newEdits);
    setEditMode(false);
  }

  function submitComment() {
    if (!newComment.trim()) return;
    const ts = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const comment = { id: `${Date.now()}-comment`, text: newComment.trim(), timestamp: ts, isAutoNote: false };
    onSaveEdits({ ...(edits || {}), comments: [...comments, comment] });
    setNewComment("");
  }

  function deleteComment(id) {
    onSaveEdits({ ...(edits || {}), comments: comments.filter(c => c.id !== id) });
  }

  async function handleEstimate() {
    setIsEstimating(true);
    try { await onEstimateCalories({ ...recipe, ingredients: effectiveIngredients, yield: effectiveYield }); }
    finally { setIsEstimating(false); }
  }

  const timeEntries = Object.entries(edits?.times ?? recipe.times ?? {}).filter(([, v]) => v);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#faf7f2",
          borderRadius: 14,
          width: "100%",
          maxWidth: 860,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
          position: "relative",
          fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        }}
      >
        {/* ── Hero ── */}
        <div style={{ position: "relative" }}>
          {recipe.image ? (
            <img
              src={recipe.image}
              alt={recipe.title}
              style={{ width: "100%", height: 300, objectFit: "cover", borderRadius: "14px 14px 0 0", display: "block" }}
            />
          ) : (
            <div style={{
              height: 200, borderRadius: "14px 14px 0 0",
              background: "linear-gradient(135deg, #2a2420 0%, #3d3128 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 72,
            }}>
              {recipeEmoji(recipe.id)}
            </div>
          )}
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 14, right: 14,
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(0,0,0,0.45)", border: "none",
              color: "#fff", fontSize: 20, lineHeight: 1,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(4px)",
            }}
          >×</button>
        </div>

        {/* ── Content ── */}
        <div style={{ padding: "28px 36px 36px" }}>

          {/* Title + author + rating row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
            {editMode ? (
              <input
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 32, fontWeight: 700, lineHeight: 1.15, color: "#1c1915",
                  border: "none", borderBottom: "2px solid #c8a03c", background: "transparent",
                  outline: "none", flex: 1, padding: "2px 0",
                }}
              />
            ) : (
              <h1 style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 38, fontWeight: 700, margin: 0,
                lineHeight: 1.15, color: "#1c1915", flex: 1,
              }}>
                {effectiveTitle}
              </h1>
            )}
            {!editMode ? (
              <div style={{ display: "flex", gap: 8, flexShrink: 0, marginTop: 6 }}>
                <button
                  onClick={enterEditMode}
                  style={{
                    background: "none", border: "1px solid #d4c9b8", borderRadius: 8,
                    padding: "6px 14px", fontSize: 12, color: "#8a7f72", cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >✏️ Edit Recipe</button>
                <button
                  onClick={onDuplicate}
                  title="Duplicate this recipe"
                  style={{
                    background: "none", border: "1px solid #d4c9b8", borderRadius: 8,
                    padding: "6px 14px", fontSize: 12, color: "#8a7f72", cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >⧉ Duplicate</button>
                {recipe.isCustom && onDelete && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete "${effectiveTitle}"? This cannot be undone.`)) {
                        onDelete();
                      }
                    }}
                    style={{
                      background: "none", border: "1px solid #f5c0c0", borderRadius: 8,
                      padding: "6px 14px", fontSize: 12, color: "#c94040", cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >🗑 Delete</button>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexShrink: 0, marginTop: 6 }}>
                <button
                  onClick={saveEdit}
                  style={{
                    background: "#1c1915", color: "#f5f0e8", border: "none", borderRadius: 8,
                    padding: "6px 16px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >Save</button>
                <button
                  onClick={cancelEdit}
                  style={{
                    background: "none", border: "1px solid #d4c9b8", borderRadius: 8,
                    padding: "6px 14px", fontSize: 12, color: "#8a7f72", cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >Cancel</button>
              </div>
            )}
          </div>
          {recipe.isCustom && (
            <div style={{ fontSize: 12, color: "#6aaa7e", marginBottom: 8, fontWeight: 500 }}>
              ✦ My Recipe
            </div>
          )}
          {recipe.author && (
            <div style={{ fontSize: 13, color: "#8a7f72", marginBottom: 14 }}>
              By {recipe.author}
            </div>
          )}

          {edits && !editMode && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(200,160,60,0.08)", border: "1px solid rgba(200,160,60,0.25)",
              borderRadius: 8, padding: "7px 12px", marginBottom: 16,
              fontSize: 12, color: "#c8a03c",
            }}>
              <span>●</span>
              <span>Changes saved locally — sync to Drive to save permanently</span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
            <StarRating rating={recipe.rating} onChange={onRate} />
            {recipe.timesCooked > 0 && (
              <span style={{ fontSize: 12, color: "#4a7c59", fontWeight: 500 }}>
                ✓ Made {recipe.timesCooked}×
              </span>
            )}
            <button
              onClick={onMarkCooked}
              style={{
                marginLeft: "auto",
                background: "none", border: "1px solid #c8a03c",
                borderRadius: 8, padding: "5px 14px",
                fontSize: 12, color: "#c8a03c", fontWeight: 500,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              }}
            >
              + Mark as Cooked
            </button>
          </div>

          {/* Stats row */}
          {(true || timeEntries.length > 0 || recipe.caloriesPerServing || onEstimateCalories) && (
            <>
              <div style={{ height: 1, background: "#e8e0d4", margin: "0 0 20px" }} />
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 20 }}>
                {timeEntries.map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, color: "#8a7f72", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 3 }}>
                      {label}
                    </div>
                    {editMode && label === "total time" ? (
                      <input
                        value={draftTotalTime}
                        onChange={e => setDraftTotalTime(e.target.value)}
                        placeholder="e.g. 45 minutes"
                        style={{
                          fontSize: 14, color: "#1c1915", fontWeight: 500,
                          border: "1px solid #d4c9b8", borderRadius: 6,
                          padding: "3px 8px", width: 130,
                          fontFamily: "'DM Sans', sans-serif", background: "#fffef8",
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: 15, color: "#1c1915", fontWeight: 500 }}>{value}</div>
                    )}
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 10, color: "#8a7f72", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 3 }}>
                    Servings
                  </div>
                  {editMode ? (
                    <input
                      value={draftYield}
                      onChange={e => setDraftYield(e.target.value)}
                      placeholder="e.g. 4 servings"
                      style={{
                        fontSize: 14, color: "#1c1915", fontWeight: 500,
                        border: "1px solid #d4c9b8", borderRadius: 6,
                        padding: "3px 8px", width: 120,
                        fontFamily: "'DM Sans', sans-serif", background: "#fffef8",
                      }}
                    />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => setServingCount(s => Math.max(1, s - 1))} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #d4c9b8", background: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a7f72", padding: 0 }}>−</button>
                      <span style={{ fontSize: 15, color: "#1c1915", fontWeight: 500, minWidth: 24, textAlign: "center" }}>{servingCount}</span>
                      <button onClick={() => setServingCount(s => s + 1)} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #d4c9b8", background: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a7f72", padding: 0 }}>+</button>
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#8a7f72", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 3 }}>
                    Calories
                  </div>
                  {editMode && draftCalorieLines.length > 0 ? (() => {
                    const draftCalorieTotal = draftCalorieLines.reduce((s, l) => s + (l.cal || 0), 0);
                    const draftServings = parseServings(draftYield || effectiveYield) || 1;
                    const draftCalPerServing = Math.round(draftCalorieTotal / draftServings);
                    return (
                      <div style={{ fontSize: 12, color: "#5a544c" }}>
                        {draftCalorieLines.map((line, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ flex: 1, color: "#1c1915" }}>{line.label}:</span>
                            <input
                              type="number"
                              min="0"
                              value={line.cal}
                              onChange={e => {
                                const next = [...draftCalorieLines];
                                next[i] = { ...next[i], cal: parseInt(e.target.value, 10) || 0 };
                                setDraftCalorieLines(next);
                              }}
                              style={{
                                width: 60, textAlign: "right", fontSize: 12, padding: "2px 4px",
                                border: "1px solid #d4c9b8", borderRadius: 4,
                                fontFamily: "'DM Sans', sans-serif", color: "#1c1915",
                              }}
                            />
                            <span style={{ color: "#8a7f72" }}>cal</span>
                          </div>
                        ))}
                        <div style={{ borderTop: "1px solid #e8e0d4", marginTop: 6, paddingTop: 6, color: "#8a7f72", fontStyle: "italic" }}>
                          Total: {draftCalorieTotal} ÷ {draftServings} servings = <strong style={{ color: "#1c1915" }}>{draftCalPerServing} / serving</strong>
                        </div>
                      </div>
                    );
                  })() : effectiveCaloriesPerServing ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ position: "relative", display: "inline-block" }}
                        onMouseEnter={() => effectiveCalorieReasoning && setShowCalTooltip(true)}
                        onMouseLeave={() => setShowCalTooltip(false)}
                      >
                        <span style={{ fontSize: 15, color: "#1c1915", fontWeight: 500, cursor: effectiveCalorieReasoning ? "help" : "default" }}>{effectiveCaloriesPerServing} / serving</span>
                        {showCalTooltip && effectiveCalorieReasoning && (
                          <div style={{
                            position: "absolute", bottom: "100%", left: 0,
                            paddingBottom: 8, zIndex: 10,
                          }}>
                            <div style={{
                              background: "#2c2820", color: "#f5f0e8",
                              borderRadius: 8, padding: "10px 14px",
                              fontSize: 12, lineHeight: 1.7,
                              whiteSpace: "pre-line", width: 260,
                              maxHeight: 260, overflowY: "auto",
                              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
                            }}>
                              {effectiveCalorieReasoning}
                            </div>
                          </div>
                        )}
                      </div>
                      {onEstimateCalories && (
                        <button onClick={handleEstimate} disabled={isEstimating} style={{ fontSize: 10, color: "#8a7f72", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", fontFamily: "'DM Sans', sans-serif" }}>
                          {isEstimating ? "…" : "re-estimate"}
                        </button>
                      )}
                    </div>
                  ) : onEstimateCalories ? (
                    <button onClick={handleEstimate} disabled={isEstimating} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "1px solid #d4c9b8", borderRadius: 6, padding: "4px 10px", cursor: isEstimating ? "default" : "pointer", fontSize: 12, color: "#8a7f72", fontFamily: "'DM Sans', sans-serif", opacity: isEstimating ? 0.6 : 1 }}>
                      {isEstimating ? "Estimating…" : "✨ Estimate with AI"}
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          )}

          {/* Description */}
          {(effectiveDescription || editMode) && (
            <>
              <div style={{ height: 1, background: "#e8e0d4", margin: "0 0 20px" }} />
              {editMode ? (
                <textarea
                  value={draftDescription}
                  onChange={e => setDraftDescription(e.target.value)}
                  placeholder="Add a description…"
                  rows={3}
                  style={{
                    width: "100%", boxSizing: "border-box", resize: "vertical",
                    fontSize: 14, color: "#5a544c", lineHeight: 1.75, fontStyle: "italic",
                    margin: "0 0 20px", border: "1px solid #d4c9b8", borderRadius: 6,
                    padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", background: "#fffef8",
                  }}
                />
              ) : (
                <p style={{ fontSize: 14, color: "#5a544c", lineHeight: 1.75, fontStyle: "italic", margin: "0 0 20px" }}>
                  {effectiveDescription}
                </p>
              )}
            </>
          )}

          {/* Ingredients + Instructions two-column */}
          {(effectiveIngredients.length > 0 || effectiveInstructions.length > 0 || editMode) && (
            <>
              <div style={{ height: 1, background: "#e8e0d4", margin: "0 0 28px" }} />
              <div style={{
                display: "grid",
                gridTemplateColumns: effectiveInstructions.length > 0 ? "1fr 1.8fr" : "1fr",
                gap: 40,
                alignItems: "start",
              }}>

                {/* Ingredients */}
                {(effectiveIngredients.length > 0 || editMode) && (
                  <div>
                    <div style={{
                      fontSize: 10, color: "#8a7f72", textTransform: "uppercase",
                      letterSpacing: "0.1em", fontWeight: 500,
                      borderBottom: "1px solid #c8a03c", paddingBottom: 8, marginBottom: 16,
                    }}>
                      Ingredients
                    </div>
                    {editMode ? (
                      <>
                        {draftIngredients.map((ing, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <input
                              value={ing}
                              onChange={e => {
                                const next = [...draftIngredients];
                                next[i] = e.target.value;
                                setDraftIngredients(next);
                              }}
                              style={{
                                flex: 1, border: "1px solid #d4c9b8", borderRadius: 6,
                                padding: "6px 10px", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                                color: "#1c1915", background: "#fff", outline: "none",
                              }}
                            />
                            <button
                              onClick={() => setDraftIngredients(draftIngredients.filter((_, j) => j !== i))}
                              style={{
                                background: "none", border: "1px solid #e8d0d0", borderRadius: 6,
                                width: 28, height: 28, cursor: "pointer", color: "#c94040",
                                fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0, padding: 0,
                              }}
                            >×</button>
                          </div>
                        ))}
                        <button
                          onClick={() => setDraftIngredients([...draftIngredients, ""])}
                          style={{
                            background: "none", border: "1.5px dashed #c8a03c", borderRadius: 8,
                            padding: "7px 14px", fontSize: 12, color: "#c8a03c", cursor: "pointer",
                            fontFamily: "'DM Sans', sans-serif", marginTop: 4, width: "100%",
                          }}
                        >+ Add Ingredient</button>
                      </>
                    ) : (
                      effectiveIngredients.map((ing, i) => (
                        <div key={i} style={{
                          fontSize: 14, color: "#1c1915", lineHeight: 1.7,
                          padding: "7px 0",
                          borderBottom: "1px solid #f0ebe2",
                        }}>
                          {scaleIngredient(ing, ratio).replace(/(\d)([a-zA-Z])/g, "$1 $2")}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Instructions */}
                {(effectiveInstructions.length > 0 || editMode) && (
                  <div>
                    <div style={{
                      fontSize: 10, color: "#8a7f72", textTransform: "uppercase",
                      letterSpacing: "0.1em", fontWeight: 500,
                      borderBottom: "1px solid #c8a03c", paddingBottom: 8, marginBottom: 16,
                    }}>
                      Preparation
                    </div>
                    {editMode ? (
                      <>
                        {draftInstructions.map((step, i) => (
                          <div key={i} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
                            <div style={{
                              fontFamily: "'Cormorant Garamond', serif",
                              fontSize: 22, fontWeight: 700, color: "#c8a03c",
                              lineHeight: 1, paddingTop: 6, minWidth: 24, flexShrink: 0,
                            }}>
                              {i + 1}
                            </div>
                            <textarea
                              value={step}
                              onChange={e => {
                                const next = [...draftInstructions];
                                next[i] = e.target.value;
                                setDraftInstructions(next);
                              }}
                              rows={3}
                              style={{
                                flex: 1, border: "1px solid #d4c9b8", borderRadius: 6,
                                padding: "7px 10px", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                                color: "#1c1915", background: "#fff", outline: "none",
                                lineHeight: 1.6, resize: "vertical",
                              }}
                            />
                            <button
                              onClick={() => setDraftInstructions(draftInstructions.filter((_, j) => j !== i))}
                              style={{
                                background: "none", border: "1px solid #e8d0d0", borderRadius: 6,
                                width: 28, height: 28, cursor: "pointer", color: "#c94040",
                                fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0, padding: 0, marginTop: 4,
                              }}
                            >×</button>
                          </div>
                        ))}
                        <button
                          onClick={() => setDraftInstructions([...draftInstructions, ""])}
                          style={{
                            background: "none", border: "1.5px dashed #c8a03c", borderRadius: 8,
                            padding: "7px 14px", fontSize: 12, color: "#c8a03c", cursor: "pointer",
                            fontFamily: "'DM Sans', sans-serif", marginTop: 4, width: "100%",
                          }}
                        >+ Add Step</button>
                      </>
                    ) : (
                      effectiveInstructions.map((step, i) => (
                        <div key={i} style={{ display: "flex", gap: 16, marginBottom: 22 }}>
                          <div style={{
                            fontFamily: "'Cormorant Garamond', serif",
                            fontSize: 22, fontWeight: 700, color: "#c8a03c",
                            lineHeight: 1, paddingTop: 2, minWidth: 24, flexShrink: 0,
                          }}>
                            {i + 1}
                          </div>
                          <p style={{ fontSize: 14, color: "#1c1915", lineHeight: 1.8, margin: 0 }}>
                            {step}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Tags + source link */}
          {(effectiveTags.length > 0 || recipe.sourceUrl || editMode) && (
            <>
              <div style={{ height: 1, background: "#e8e0d4", margin: "28px 0 20px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {editMode ? (
                  <>
                    {draftTags.map(tag => (
                      <span key={tag} style={{
                        background: "#f0ebe2", borderRadius: 20,
                        padding: "3px 8px 3px 11px", fontSize: 11, color: "#8a7f72", fontWeight: 500,
                        display: "inline-flex", alignItems: "center", gap: 4,
                      }}>
                        {tag}
                        <button
                          onClick={() => setDraftTags(prev => prev.filter(t => t !== tag))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#8a7f72", padding: "0 2px", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center" }}
                        >×</button>
                      </span>
                    ))}
                    <input
                      value={newTagInput}
                      onChange={e => setNewTagInput(e.target.value)}
                      onKeyDown={e => {
                        if ((e.key === "Enter" || e.key === ",") && newTagInput.trim()) {
                          e.preventDefault();
                          const tag = newTagInput.trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");
                          if (tag && !draftTags.includes(tag)) setDraftTags(prev => [...prev, tag]);
                          setNewTagInput("");
                        }
                      }}
                      placeholder="Add tag…"
                      style={{
                        fontSize: 11, color: "#8a7f72", border: "1px solid #d4c9b8",
                        borderRadius: 20, padding: "3px 11px", width: 90,
                        fontFamily: "'DM Sans', sans-serif", background: "#fffef8", outline: "none",
                      }}
                    />
                  </>
                ) : (
                  effectiveTags.map(tag => (
                    <span key={tag} style={{
                      background: "#f0ebe2", borderRadius: 20,
                      padding: "3px 11px", fontSize: 11, color: "#8a7f72", fontWeight: 500,
                    }}>{tag}</span>
                  ))
                )}
                {recipe.sourceUrl && (
                  <a
                    href={recipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      marginLeft: "auto", fontSize: 12, color: "#c8a03c",
                      textDecoration: "none", fontWeight: 500,
                      display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    View on NYT Cooking ↗
                  </a>
                )}
              </div>
            </>
          )}

          {/* Comments */}
          <div style={{ height: 1, background: "#e8e0d4", margin: "28px 0 20px" }} />
          <div>
            <div style={{
              fontSize: 10, color: "#8a7f72", textTransform: "uppercase",
              letterSpacing: "0.1em", fontWeight: 500,
              borderBottom: "1px solid #c8a03c", paddingBottom: 8, marginBottom: 16,
            }}>
              Comments & Notes
            </div>

            {/* Existing comments */}
            {comments.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {comments.map(comment => (
                  <div key={comment.id} style={{
                    background: comment.isAutoNote ? "#f8f5ef" : "#fff",
                    border: `1px solid ${comment.isAutoNote ? "#e8e0d4" : "#d4c9b8"}`,
                    borderRadius: 8, padding: "10px 14px", marginBottom: 8,
                    display: "flex", gap: 10, alignItems: "flex-start",
                  }}>
                    <div style={{ flex: 1 }}>
                      {comment.isAutoNote && (
                        <span style={{
                          fontSize: 10, color: "#c8a03c", fontWeight: 500,
                          background: "rgba(200,160,60,0.12)", borderRadius: 4,
                          padding: "1px 6px", marginRight: 6, letterSpacing: "0.04em",
                        }}>auto-note</span>
                      )}
                      <span style={{ fontSize: 13, color: "#1c1915", lineHeight: 1.6 }}>{comment.text}</span>
                      <div style={{ fontSize: 10, color: "#b0a898", marginTop: 4 }}>{comment.timestamp}</div>
                    </div>
                    <button
                      onClick={() => deleteComment(comment.id)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "#c0b8ac", fontSize: 14, padding: 2, lineHeight: 1, flexShrink: 0,
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {/* New comment input */}
            <div style={{ display: "flex", gap: 8 }}>
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                placeholder="Add a comment… (Enter to submit, Shift+Enter for new line)"
                rows={2}
                style={{
                  flex: 1, border: "1.5px solid #e8e0d4", borderRadius: 8,
                  padding: "9px 12px", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                  color: "#1c1915", background: "#fff", outline: "none",
                  lineHeight: 1.6, resize: "none",
                }}
              />
              <button
                onClick={submitComment}
                disabled={!newComment.trim()}
                style={{
                  background: newComment.trim() ? "#1c1915" : "#e8e0d4",
                  color: newComment.trim() ? "#f5f0e8" : "#b0a898",
                  border: "none", borderRadius: 8,
                  padding: "0 18px", fontSize: 13, fontWeight: 500, cursor: newComment.trim() ? "pointer" : "default",
                  fontFamily: "'DM Sans', sans-serif", flexShrink: 0, transition: "all 0.15s",
                }}
              >Post</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Recipe Picker Modal ──────────────────────────────────────────────────────

function RecipePicker({ recipes, target, search, onSearchChange, onSelect, onClose }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const filtered = recipes.filter(r =>
    r.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#faf7f2",
          borderRadius: 16,
          width: "90%",
          maxWidth: 560,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 20px 0",
          borderBottom: "1px solid #e8e0d4",
          paddingBottom: 16,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
            <div>
              <div style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                fontWeight: 700,
                color: "#1c1915",
                lineHeight: 1.2,
              }}>Pick a Recipe</div>
              {target && (
                <div style={{ fontSize: 13, color: "#8a7f72", marginTop: 3 }}>
                  For {target.day} · {target.meal}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: "rgba(0,0,0,0.06)",
                border: "none",
                borderRadius: 20,
                width: 32, height: 32,
                cursor: "pointer",
                fontSize: 18,
                color: "#8a7f72",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                marginLeft: 12,
              }}
            >×</button>
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginTop: 14 }}>
            <span style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              fontSize: 14, color: "#c0b8ac", pointerEvents: "none",
            }}>🔍</span>
            <input
              autoFocus
              type="text"
              placeholder="Search recipes..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              style={{
                width: "100%",
                border: "1.5px solid #e8e0d4",
                borderRadius: 10,
                padding: "10px 14px 10px 36px",
                fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
                color: "#1c1915",
                background: "#fff",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Scrollable recipe grid */}
        <div style={{ overflowY: "auto", flex: 1, padding: 16 }}>
          {filtered.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "40px 0",
              color: "#8a7f72", fontSize: 14,
            }}>
              No recipes match "{search}"
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: 12,
            }}>
              {filtered.map(recipe => (
                <div
                  key={recipe.id}
                  onClick={() => onSelect(recipe)}
                  className="picker-card"
                  style={{
                    background: "#fff",
                    border: "1.5px solid #e8e0d4",
                    borderRadius: 10,
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                >
                  {/* Thumbnail */}
                  {recipe.image ? (
                    <img
                      src={recipe.image}
                      alt={recipe.title}
                      style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <div style={{
                      height: 80,
                      background: "linear-gradient(135deg, #2a2420 0%, #3d3128 100%)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 28,
                    }}>
                      {recipeEmoji(recipe.id)}
                    </div>
                  )}
                  {/* Title */}
                  <div style={{
                    padding: "8px 10px 4px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#1c1915",
                    lineHeight: 1.35,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {recipe.title}
                  </div>
                  {/* Time */}
                  {recipe.times?.["total time"] && (
                    <div style={{ padding: "0 10px 8px", fontSize: 10, color: "#8a7f72" }}>
                      ⏱ {recipe.times["total time"]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FreeformSlotItem ─────────────────────────────────────────────────────────

function FreeformSlotItem({ text, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  function commit() {
    setEditing(false);
    onSave(draft);
  }

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(text); setEditing(false); } }}
          style={{
            flex: 1, minWidth: 0, fontSize: 11, border: "1px solid #c8a03c", borderRadius: 4,
            padding: "2px 5px", fontFamily: "'DM Sans', sans-serif", outline: "none", color: "#1c1915",
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 4, minWidth: 0 }}>
      <div
        onClick={() => { setDraft(text); setEditing(true); }}
        style={{ flex: 1, minWidth: 0, cursor: "text" }}
      >
        <div style={{ fontSize: 11, lineHeight: 1.3, color: "#3d5a4a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          ✏️ {text}
        </div>
      </div>
      <button
        onClick={onRemove}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#c0b8ac", fontSize: 13, padding: "0 1px", lineHeight: 1, flexShrink: 0 }}
      >×</button>
    </div>
  );
}

// ─── BuildMealModal ────────────────────────────────────────────────────────────

function BuildMealModal({ target, recipes, recipeEdits, currentItems, onSelectRecipe, onAddFreeform, onUpdateServings, onRemoveItem, onClose }) {
  const [innerTab, setInnerTab] = useState("library");
  const [libSearch, setLibSearch] = useState("");
  const [freeformText, setFreeformText] = useState("");

  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const filtered = recipes.filter(r => {
    const title = (recipeEdits?.[r.id]?.title ?? r.title ?? "").toLowerCase();
    return title.includes(libSearch.toLowerCase());
  });

  const hasMealItems = currentItems && currentItems.length > 0;

  const servBtn = {
    width: 26, height: 26, borderRadius: 6, border: "1.5px solid #e8e0d4",
    background: "#faf7f2", cursor: "pointer", fontSize: 15, color: "#5a5248",
    display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, flexShrink: 0,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#faf7f2",
          borderRadius: 16,
          width: "90%",
          maxWidth: 560,
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 20px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: "#1c1915", lineHeight: 1.2 }}>
                Build a Meal
              </div>
              {target && (
                <div style={{ fontSize: 13, color: "#8a7f72", marginTop: 3 }}>
                  {target.day} · {target.meal}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: "rgba(0,0,0,0.06)", border: "none", borderRadius: 20,
                width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#8a7f72",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 12,
              }}
            >×</button>
          </div>
        </div>

        {/* Current items in this slot */}
        {hasMealItems && (
          <div style={{ padding: "0 20px 14px", flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#8a7f72", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Your meal
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {currentItems.map((item, idx) => {
                if (item.type === "recipe") {
                  const recipe = recipes.find(r => r.id === item.recipeId);
                  if (!recipe) return null;
                  const title = recipeEdits?.[recipe.id]?.title ?? recipe.title ?? "";
                  const servings = item.servings || 1;
                  const totalCal = recipe.caloriesPerServing ? Math.round(recipe.caloriesPerServing * servings) : null;
                  return (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1.5px solid #e8e0d4", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#1c1915", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {recipeEmoji(recipe.id)} {title}
                        </div>
                        {totalCal != null && (
                          <div style={{ fontSize: 11, color: "#8a7f72", marginTop: 1 }}>
                            {totalCal} cal
                            {servings !== 1 && <span style={{ color: "#c0b8ac" }}> ({servings} serving{servings !== 1 ? "s" : ""})</span>}
                          </div>
                        )}
                      </div>
                      {/* Servings control */}
                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                        <button onClick={() => onUpdateServings(idx, servings - 0.5)} style={servBtn}>−</button>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1c1915", minWidth: 22, textAlign: "center" }}>
                          {servings % 1 === 0 ? servings : servings}
                        </span>
                        <button onClick={() => onUpdateServings(idx, servings + 0.5)} style={servBtn}>+</button>
                      </div>
                      <button onClick={() => onRemoveItem(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0b8ac", fontSize: 16, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>×</button>
                    </div>
                  );
                }
                if (item.type === "freeform") {
                  return (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1.5px solid #e8e0d4", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#3d5a4a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        ✏️ {item.text}
                      </div>
                      <button onClick={() => onRemoveItem(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0b8ac", fontSize: 16, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>×</button>
                    </div>
                  );
                }
                return null;
              })}
            </div>
            <div style={{ borderBottom: "1px solid #e8e0d4", marginTop: 14 }} />
          </div>
        )}

        {/* Add more section — tabs */}
        <div style={{ padding: "0 20px", borderBottom: "1px solid #e8e0d4", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 0 }}>
            {[{ id: "library", label: "From Library" }, { id: "freeform", label: "Free Form" }].map(t => (
              <button
                key={t.id}
                onClick={() => setInnerTab(t.id)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "10px 18px", fontSize: 13, fontWeight: 500,
                  fontFamily: "'DM Sans', sans-serif",
                  color: innerTab === t.id ? "#1c1915" : "#8a7f72",
                  borderBottom: innerTab === t.id ? "2px solid #c8a03c" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {/* Library tab */}
        {innerTab === "library" && (
          <>
            <div style={{ padding: "14px 20px 0", flexShrink: 0 }}>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#c0b8ac", pointerEvents: "none" }}>🔍</span>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search recipes..."
                  value={libSearch}
                  onChange={e => setLibSearch(e.target.value)}
                  style={{
                    width: "100%", border: "1.5px solid #e8e0d4", borderRadius: 10,
                    padding: "10px 14px 10px 36px", fontSize: 13,
                    fontFamily: "'DM Sans', sans-serif", color: "#1c1915",
                    background: "#fff", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: 16 }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#8a7f72", fontSize: 14 }}>
                  No recipes match "{libSearch}"
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {filtered.map(recipe => (
                    <div
                      key={recipe.id}
                      onClick={() => onSelectRecipe(recipe)}
                      className="picker-card"
                      style={{ background: "#fff", border: "1.5px solid #e8e0d4", borderRadius: 10, overflow: "hidden", cursor: "pointer" }}
                    >
                      {recipe.image ? (
                        <img src={recipe.image} alt={recipe.title} style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{ height: 80, background: "linear-gradient(135deg, #2a2420 0%, #3d3128 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                          {recipeEmoji(recipe.id)}
                        </div>
                      )}
                      <div style={{ padding: "8px 10px 4px", fontSize: 12, fontWeight: 600, color: "#1c1915", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {recipeEdits?.[recipe.id]?.title ?? recipe.title}
                      </div>
                      {recipe.times?.["total time"] && (
                        <div style={{ padding: "0 10px 8px", fontSize: 10, color: "#8a7f72" }}>⏱ {recipe.times["total time"]}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Free form tab */}
        {innerTab === "freeform" && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
            <textarea
              autoFocus
              placeholder="e.g. Grilled salmon with roasted asparagus, leftover stir fry, pasta with whatever's in the fridge…"
              value={freeformText}
              onChange={e => setFreeformText(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (freeformText.trim()) { onAddFreeform(freeformText.trim()); setFreeformText(""); }
                }
              }}
              style={{
                flex: 1, minHeight: 120, border: "1.5px solid #e8e0d4", borderRadius: 10,
                padding: "12px 14px", fontSize: 14, fontFamily: "'DM Sans', sans-serif",
                color: "#1c1915", background: "#fff", outline: "none", resize: "none",
                lineHeight: 1.5,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => { if (freeformText.trim()) { onAddFreeform(freeformText.trim()); setFreeformText(""); } }}
                disabled={!freeformText.trim()}
                style={{
                  background: freeformText.trim() ? "#1c1915" : "#e8e0d4",
                  color: freeformText.trim() ? "#f5f0e8" : "#c0b8ac",
                  border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13,
                  fontWeight: 500, cursor: freeformText.trim() ? "pointer" : "default",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >Add</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shopping: SwipeableItem ──────────────────────────────────────────────────

function ShoppingItem({ item, checked, onToggle, onDelete, onAdjustQty, search }) {
  const rowRef = useRef(null);
  const swipe = useRef({ startX: 0, startY: 0, dx: 0, active: false, didSwipe: false });

  function onTouchStart(e) {
    swipe.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, dx: 0, active: false, didSwipe: false };
  }
  function onTouchMove(e) {
    const dx = e.touches[0].clientX - swipe.current.startX;
    const dy = e.touches[0].clientY - swipe.current.startY;
    if (!swipe.current.active) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll wins
      swipe.current.active = true;
    }
    const clamped = Math.min(0, dx);
    swipe.current.dx = clamped;
    if (rowRef.current) rowRef.current.style.transform = `translateX(${clamped}px)`;
    e.preventDefault();
  }
  function onTouchEnd() {
    if (!swipe.current.active) return;
    const dx = swipe.current.dx;
    const width = rowRef.current?.offsetWidth || 300;
    swipe.current.active = false;
    swipe.current.didSwipe = true;
    setTimeout(() => { swipe.current.didSwipe = false; }, 50);
    if (Math.abs(dx) > width * 0.45) {
      if (rowRef.current) { rowRef.current.style.transition = "transform 0.15s"; rowRef.current.style.transform = "translateX(-110%)"; }
      setTimeout(onDelete, 160);
    } else {
      if (rowRef.current) {
        rowRef.current.style.transition = "transform 0.2s";
        rowRef.current.style.transform = "translateX(0)";
        setTimeout(() => { if (rowRef.current) rowRef.current.style.transition = ""; }, 220);
      }
    }
  }

  const parsed = parseIngredientQty(item.text);

  function highlightText(text) {
    if (!search) return text;
    const idx = text.toLowerCase().indexOf(search.toLowerCase());
    if (idx === -1) return text;
    return <>{text.slice(0, idx)}<mark style={{ background: "#ffe066", borderRadius: 2, padding: "0 1px" }}>{text.slice(idx, idx + search.length)}</mark>{text.slice(idx + search.length)}</>;
  }

  return (
    <div style={{ position: "relative", overflow: "hidden", marginBottom: 8, borderRadius: 10 }}>
      {/* Red delete background */}
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 72, background: "#e53535", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🗑️</div>
      {/* Item row */}
      <div
        ref={rowRef}
        onClick={() => { if (!swipe.current.didSwipe) onToggle(); }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          background: checked ? "#f0ebe2" : "#faf7f2",
          border: `1.5px solid ${checked ? "#d4c9b8" : "#e8e0d4"}`,
          borderRadius: 10, padding: "11px 14px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 10,
          opacity: checked ? 0.55 : 1,
          transition: "opacity 0.3s",
          position: "relative", zIndex: 1,
        }}
      >
        {/* Checkbox */}
        <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? "#4a7c59" : "#c8bfb0"}`, background: checked ? "#4a7c59" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
          {checked && <span style={{ color: "white", fontSize: 11, lineHeight: 1 }}>✓</span>}
        </div>
        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#1c1915", textDecoration: checked ? "line-through" : "none", textDecorationColor: "#8a7f72", lineHeight: 1.4 }}>
            {highlightText(item.text)}
          </div>
          {item.count > 1 && !item.isManual && (
            <div style={{ fontSize: 10, color: "#8a7f72", marginTop: 2 }}>used in {item.count} recipes</div>
          )}
        </div>
        {/* Qty +/- */}
        {parsed && !checked && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => onAdjustQty(-getQtyStep(parsed.value))} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #d4c9b8", background: "#fff", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a7f72", padding: 0, lineHeight: 1, fontFamily: "inherit" }}>−</button>
            <button onClick={() => onAdjustQty(getQtyStep(parsed.value))} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #d4c9b8", background: "#fff", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a7f72", padding: 0, lineHeight: 1, fontFamily: "inherit" }}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shopping: Main Tab Component ─────────────────────────────────────────────

function ShoppingListTab({ plan, recipes, recipeEdits, checkedItems, onSetCheckedItems }) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(new Set());
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [manualItems, setManualItems] = useState([]);
  const [qtyOverrides, setQtyOverrides] = useState({});
  const [hidden, setHidden] = useState(new Set());
  const [servingOverrides, setServingOverrides] = useState({});
  const [toast, setToast] = useState(null); // { type:"copy"|"undo", text? }
  const [addText, setAddText] = useState("");
  const [addExpanded, setAddExpanded] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const undoTimer = useRef(null);
  const lastDeleted = useRef(null);
  const addInputRef = useRef(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const m = localStorage.getItem("mealplanner_manual_items"); if (m) setManualItems(JSON.parse(m));
      const q = localStorage.getItem("mealplanner_qty_overrides"); if (q) setQtyOverrides(JSON.parse(q));
      const h = localStorage.getItem("mealplanner_hidden_items"); if (h) setHidden(new Set(JSON.parse(h)));
      const s = localStorage.getItem("mealplanner_serving_overrides"); if (s) setServingOverrides(JSON.parse(s));
    } catch {}
    // iOS install banner
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
    const dismissed = localStorage.getItem("mealplanner_banner_dismissed");
    if (isIOS && !dismissed) setShowBanner(true);
    // Android/Chrome install prompt
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); if (!localStorage.getItem("mealplanner_banner_dismissed")) setShowBanner(true); });
  }, []);

  useEffect(() => { localStorage.setItem("mealplanner_manual_items", JSON.stringify(manualItems)); }, [manualItems]);
  useEffect(() => { localStorage.setItem("mealplanner_qty_overrides", JSON.stringify(qtyOverrides)); }, [qtyOverrides]);
  useEffect(() => { localStorage.setItem("mealplanner_hidden_items", JSON.stringify([...hidden])); }, [hidden]);
  useEffect(() => { localStorage.setItem("mealplanner_serving_overrides", JSON.stringify(servingOverrides)); }, [servingOverrides]);

  // Unique recipes planned this week with their serving counts
  const weekRecipes = useMemo(() => {
    const seen = new Set();
    const result = [];
    DAYS.forEach(day => {
      MEALS.forEach(meal => {
        const recipeId = plan[day]?.[meal];
        if (!recipeId || seen.has(recipeId)) return;
        seen.add(recipeId);
        const recipe = recipes.find(r => r.id === recipeId);
        if (!recipe) return;
        const baseServings = parseServings(recipe.yield);
        const servings = servingOverrides[recipeId] ?? baseServings;
        const effectiveTitle = recipeEdits[recipeId]?.title ?? recipe.title;
        result.push({ recipe, baseServings, servings, effectiveTitle });
      });
    });
    return result;
  }, [plan, recipes, recipeEdits, servingOverrides]);

  function setServings(recipeId, value) {
    setServingOverrides(s => ({ ...s, [recipeId]: Math.max(1, value) }));
    // Clear any manual qty overrides since scaling has changed
    setQtyOverrides({});
  }

  const allItems = useMemo(
    () => generateShoppingItems(plan, recipes, recipeEdits, manualItems, qtyOverrides, servingOverrides),
    [plan, recipes, recipeEdits, manualItems, qtyOverrides, servingOverrides]
  );

  const visibleItems = useMemo(() => allItems.filter(it => !hidden.has(it.key)), [allItems, hidden]);
  const activeItems  = useMemo(() => visibleItems.filter(it => !checkedItems[it.key]), [visibleItems, checkedItems]);
  const doneItems    = useMemo(() => visibleItems.filter(it => !!checkedItems[it.key]), [visibleItems, checkedItems]);

  const searchLower = search.toLowerCase();
  const filteredActive = useMemo(
    () => search ? activeItems.filter(it => it.text.toLowerCase().includes(searchLower)) : activeItems,
    [activeItems, search, searchLower]
  );

  const grouped = useMemo(() => {
    const map = {};
    filteredActive.forEach(item => {
      const cid = item.category.id;
      if (!map[cid]) map[cid] = { cat: item.category, items: [] };
      map[cid].items.push(item);
    });
    Object.values(map).forEach(g => g.items.sort((a, b) => {
      // Sort by ingredient name (after leading quantity), not by the number
      const nameA = (parseIngredientQty(a.text)?.rest || a.text).trim().toLowerCase();
      const nameB = (parseIngredientQty(b.text)?.rest || b.text).trim().toLowerCase();
      return nameA.localeCompare(nameB);
    }));
    return CATEGORIES.map(cat => map[cat.id]).filter(Boolean);
  }, [filteredActive]);

  function toggleCheck(key) { onSetCheckedItems(c => ({ ...c, [key]: !c[key] })); }

  function deleteItem(item) {
    setHidden(h => new Set([...h, item.key]));
    lastDeleted.current = item;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setToast({ type: "undo", text: item.text });
    undoTimer.current = setTimeout(() => { setToast(null); lastDeleted.current = null; }, 4000);
  }

  function undoDelete() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (lastDeleted.current) {
      const it = lastDeleted.current;
      setHidden(h => { const n = new Set(h); n.delete(it.key); return n; });
      lastDeleted.current = null;
    }
    setToast(null);
  }

  function adjustQty(item, delta) {
    const parsed = parseIngredientQty(item.text);
    if (!parsed) return;
    const newVal = Math.max(0, parsed.value + delta);
    if (newVal === 0) { deleteItem(item); return; }
    const newText = formatQty(newVal) + (parsed.rest ? " " + parsed.rest : "");
    setQtyOverrides(q => ({ ...q, [item.key]: newText }));
  }

  function addManualItem() {
    const text = addText.trim();
    if (!text) return;
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setManualItems(m => [...m, { id, text }]);
    setAddText("");
    setAddExpanded(false);
  }

  async function copyList() {
    const lines = ["🛒 My Meal Plan Shopping List", ""];
    CATEGORIES.forEach(cat => {
      const items = filteredActive.filter(it => it.category.id === cat.id && !checkedItems[it.key]);
      if (!items.length) return;
      lines.push(`${cat.icon} ${cat.name.toUpperCase()}`);
      items.forEach(it => lines.push(`• ${it.text}`));
      lines.push("");
    });
    const text = lines.join("\n").trim();
    if (navigator.share && /mobile|android|iphone|ipad/i.test(navigator.userAgent)) {
      try { await navigator.share({ title: "Shopping List", text }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(text); } catch { try { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); } catch {} }
    setToast({ type: "copy" });
    setTimeout(() => setToast(null), 2000);
  }

  function resetAll() {
    onSetCheckedItems({});
    setHidden(new Set());
    setManualItems([]);
    setQtyOverrides({});
    setServingOverrides({});
    localStorage.removeItem("mealplanner_manual_items");
    localStorage.removeItem("mealplanner_qty_overrides");
    localStorage.removeItem("mealplanner_hidden_items");
    localStorage.removeItem("mealplanner_serving_overrides");
  }

  function toggleCollapse(catId) {
    setCollapsed(c => { const n = new Set(c); n.has(catId) ? n.delete(catId) : n.add(catId); return n; });
  }

  const smallBtn = { background: "none", border: "1px solid #d4c9b8", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#8a7f72", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" };
  const sectionHeaderStyle = { width: "100%", background: "none", border: "none", padding: "10px 0 8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: "#5a544c", letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif" };

  return (
    <div className="fade-in">
      {/* PWA install banner */}
      {showBanner && (
        <div style={{ background: "#2c2820", color: "#f5f0e8", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 720 }}>
          <span style={{ fontSize: 13 }}>📲 Add Meal Planner to your home screen for quick access</span>
          <button onClick={() => { setShowBanner(false); localStorage.setItem("mealplanner_banner_dismissed", "1"); }} style={{ background: "none", border: "none", color: "#8a7f72", fontSize: 18, cursor: "pointer", padding: "0 0 0 12px", lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, margin: 0 }}>Shopping List</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={copyList} style={smallBtn}>📋 Copy list</button>
          <button onClick={resetAll} style={smallBtn}>Reset all</button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ position: "relative", marginBottom: 20, maxWidth: 720 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items…"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 36px 10px 14px", background: "#faf7f2", border: "1.5px solid #e8e0d4", borderRadius: 10, fontSize: 14, color: "#1c1915", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#8a7f72", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        )}
      </div>

      {/* Recipes this week + serving controls */}
      {weekRecipes.length > 0 && (
        <div style={{ maxWidth: 720, marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: "#8a7f72", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 10 }}>
            Recipes this week
          </div>
          {weekRecipes.map(({ recipe, baseServings, servings, effectiveTitle }) => (
            <div key={recipe.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#faf7f2", border: "1.5px solid #e8e0d4", borderRadius: 10, padding: "11px 16px", marginBottom: 8, flexWrap: "wrap" }}>
              {/* Recipe name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#1c1915", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{effectiveTitle}</div>
                <div style={{ fontSize: 10, color: "#8a7f72", marginTop: 2 }}>base recipe: {baseServings} serving{baseServings !== 1 ? "s" : ""}</div>
              </div>
              {/* Serving stepper */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: "#8a7f72", letterSpacing: "0.04em" }}>servings to cook</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => setServings(recipe.id, servings - 1)}
                    style={{ width: 26, height: 26, borderRadius: "50%", border: "1.5px solid #d4c9b8", background: "#fff", cursor: servings <= 1 ? "default" : "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: servings <= 1 ? "#d4c9b8" : "#8a7f72", padding: 0, lineHeight: 1, fontFamily: "inherit" }}
                    disabled={servings <= 1}
                  >−</button>
                  <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: "#1c1915", minWidth: 28, textAlign: "center", lineHeight: 1 }}>{servings}</span>
                  <button
                    onClick={() => setServings(recipe.id, servings + 1)}
                    style={{ width: 26, height: 26, borderRadius: "50%", border: "1.5px solid #d4c9b8", background: "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a7f72", padding: 0, lineHeight: 1, fontFamily: "inherit" }}
                  >+</button>
                </div>
                <button
                  onClick={() => setServings(recipe.id, baseServings)}
                  style={{ fontSize: 10, color: "#8a7f72", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", fontFamily: "'DM Sans', sans-serif", visibility: servings !== baseServings ? "visible" : "hidden" }}
                >reset</button>
              </div>
            </div>
          ))}
          <div style={{ height: 1, background: "#e8e0d4", marginTop: 8 }} />
        </div>
      )}

      {/* Body */}
      {allItems.length === 0 ? (
        <div style={{ color: "#8a7f72", fontSize: 14, textAlign: "center", paddingTop: 60 }}>Add meals to your planner to generate a shopping list.</div>
      ) : (
        <>
          {/* Category sections */}
          {grouped.map(({ cat, items }) => (
            <div key={cat.id} style={{ maxWidth: 720, marginBottom: 4 }}>
              <button style={sectionHeaderStyle} onClick={() => toggleCollapse(cat.id)}>
                <span>{cat.icon} {cat.name} <span style={{ color: "#c0b8ac", fontWeight: 400 }}>· {items.length} item{items.length !== 1 ? "s" : ""}</span></span>
                <span style={{ fontSize: 10, color: "#c0b8ac" }}>{collapsed.has(cat.id) ? "▸" : "▾"}</span>
              </button>
              {!collapsed.has(cat.id) && (
                <div style={{ paddingBottom: 8 }}>
                  {items.map(item => (
                    <ShoppingItem key={item.key} item={item} checked={false} onToggle={() => toggleCheck(item.key)} onDelete={() => deleteItem(item)} onAdjustQty={d => adjustQty(item, d)} search={search} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* No search results */}
          {search && filteredActive.length === 0 && (
            <div style={{ color: "#8a7f72", fontSize: 14, textAlign: "center", padding: "40px 0" }}>No items match "{search}"</div>
          )}

          {/* Completed section */}
          {doneItems.length > 0 && (
            <div style={{ maxWidth: 720, marginTop: 16 }}>
              <div style={{ height: 1, background: "#e8e0d4", marginBottom: 12 }} />
              <button style={sectionHeaderStyle} onClick={() => setCompletedCollapsed(c => !c)}>
                <span>✓ Completed <span style={{ color: "#c0b8ac", fontWeight: 400 }}>· {doneItems.length}</span></span>
                <span style={{ fontSize: 10, color: "#c0b8ac" }}>{completedCollapsed ? "▸" : "▾"}</span>
              </button>
              {!completedCollapsed && (
                <div style={{ paddingBottom: 8 }}>
                  {doneItems.map(item => (
                    <ShoppingItem key={item.key} item={item} checked={true} onToggle={() => toggleCheck(item.key)} onDelete={() => deleteItem(item)} onAdjustQty={d => adjustQty(item, d)} search="" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add item */}
          <div style={{ maxWidth: 720, marginTop: 24 }}>
            {addExpanded ? (
              <div style={{ background: "#faf7f2", border: "1.5px solid #e8e0d4", borderRadius: 10, padding: "12px 14px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  ref={addInputRef}
                  value={addText}
                  onChange={e => setAddText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addManualItem(); if (e.key === "Escape") { setAddExpanded(false); setAddText(""); } }}
                  placeholder="e.g. 2 cups almond milk"
                  autoFocus
                  style={{ flex: "1 1 180px", padding: "7px 10px", background: "#fff", border: "1px solid #d4c9b8", borderRadius: 7, fontSize: 13, color: "#1c1915", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
                />
                <div style={{ fontSize: 11, color: "#8a7f72", padding: "4px 6px", background: "#f0ebe2", borderRadius: 6, whiteSpace: "nowrap" }}>
                  {detectCategory(addText).icon} {detectCategory(addText).name}
                </div>
                <button onClick={addManualItem} style={{ background: "#1c1915", color: "#f5f0e8", border: "none", borderRadius: 7, padding: "7px 16px", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Add</button>
                <button onClick={() => { setAddExpanded(false); setAddText(""); }} style={{ ...smallBtn, border: "none", padding: "7px 10px" }}>Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setAddExpanded(true)}
                style={{ width: "100%", background: "none", border: "2px dashed #d4c9b8", borderRadius: 10, padding: "12px", fontSize: 13, color: "#8a7f72", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textAlign: "left" }}
              >+ Add item manually</button>
            )}
          </div>

          {/* Footer summary */}
          <div style={{ marginTop: 20, padding: "14px 18px", background: "#faf7f2", border: "1px solid #e8e0d4", borderRadius: 10, fontSize: 12, color: "#8a7f72", maxWidth: 720 }}>
            📋 {visibleItems.length} items · {doneItems.length} checked off · Based on your current week's meal plan
          </div>
        </>
      )}

      {/* Copy toast */}
      {toast?.type === "copy" && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "#2c2820", color: "#f5f0e8", borderRadius: 8, padding: "10px 22px", fontSize: 14, fontWeight: 500, zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,0.3)", pointerEvents: "none" }}>
          ✓ Copied!
        </div>
      )}
      {/* Undo toast */}
      {toast?.type === "undo" && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "#2c2820", color: "#f5f0e8", borderRadius: 8, padding: "10px 16px", fontSize: 14, display: "flex", alignItems: "center", gap: 16, zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,0.3)", whiteSpace: "nowrap" }}>
          <span>Item removed</span>
          <button onClick={undoDelete} style={{ background: "#e8a030", color: "#1c1915", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Undo</button>
        </div>
      )}
    </div>
  );
}

// ─── Create Recipe Modal ──────────────────────────────────────────────────────

function CreateRecipeModal({ onSave, onClose }) {
  const [title, setTitle] = useState("");
  const [yieldText, setYieldText] = useState("4 servings");
  const [totalTime, setTotalTime] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [instructionsText, setInstructionsText] = useState("");

  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleSave() {
    if (!title.trim()) return;
    const ingredients = ingredientsText.split("\n").map(l => l.trim()).filter(Boolean);
    const instructions = instructionsText.split("\n").map(l => l.trim()).filter(Boolean);
    const id = "custom_" + Date.now();
    onSave({
      id,
      title: title.trim(),
      isCustom: true,
      yield: yieldText.trim() || "4 servings",
      times: totalTime.trim() ? { "total time": totalTime.trim() } : {},
      ingredients,
      instructions,
      tags: [],
      rating: 0,
      timesCooked: 0,
    });
  }

  const inputStyle = {
    width: "100%", border: "1.5px solid #e8e0d4", borderRadius: 8,
    padding: "10px 14px", fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    color: "#1c1915", background: "#fff", outline: "none",
  };
  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 500, color: "#8a7f72",
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 16px", overflowY: "auto",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#faf7f2", borderRadius: 14, width: "100%", maxWidth: 620,
          maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
          padding: "36px 40px",
          fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, margin: 0, color: "#1c1915" }}>
            New Recipe
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: "#8a7f72", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Title */}
        <label style={labelStyle}>Recipe Title *</label>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
          placeholder="e.g. Roasted Garlic Pasta"
          style={{ ...inputStyle, fontSize: 15, marginBottom: 18 }}
        />

        {/* Yield + Time */}
        <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Servings</label>
            <input
              value={yieldText}
              onChange={e => setYieldText(e.target.value)}
              placeholder="e.g. 4 servings"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Total Time</label>
            <input
              value={totalTime}
              onChange={e => setTotalTime(e.target.value)}
              placeholder="e.g. 30 minutes"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Ingredients */}
        <label style={labelStyle}>
          Ingredients{" "}
          <span style={{ fontStyle: "italic", textTransform: "none", fontSize: 11, fontWeight: 400 }}>(one per line)</span>
        </label>
        <textarea
          value={ingredientsText}
          onChange={e => setIngredientsText(e.target.value)}
          placeholder={"2 cups all-purpose flour\n1 tsp salt\n3 cloves garlic, minced"}
          rows={6}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, marginBottom: 18 }}
        />

        {/* Instructions */}
        <label style={labelStyle}>
          Instructions{" "}
          <span style={{ fontStyle: "italic", textTransform: "none", fontSize: 11, fontWeight: 400 }}>(one step per line)</span>
        </label>
        <textarea
          value={instructionsText}
          onChange={e => setInstructionsText(e.target.value)}
          placeholder={"Preheat oven to 400°F.\nToss vegetables with olive oil and salt.\nRoast for 25 minutes until golden."}
          rows={6}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, marginBottom: 28 }}
        />

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "1px solid #d4c9b8", borderRadius: 8,
              padding: "10px 22px", fontSize: 13, color: "#8a7f72", cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            style={{
              background: title.trim() ? "#1c1915" : "#c0b8ac",
              color: "#f5f0e8", border: "none", borderRadius: 8,
              padding: "10px 24px", fontSize: 13, fontWeight: 500,
              cursor: title.trim() ? "pointer" : "default",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >Save Recipe</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function MealPlannerApp() {
  const [activeTab, setActiveTab] = useState("planner");
  const [recipes, setRecipes] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [plans, setPlans] = useState({}); // { [weekOffset]: plan }
  const [checkedItems, setCheckedItems] = useState({});
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [pickerTarget, setPickerTarget] = useState(null); // { day, meal } | null
  const [pickerSearch, setPickerSearch] = useState("");
  const [calorieGoal, setCalorieGoal] = useState(CALORIE_GOAL);
  const [editingGoal, setEditingGoal] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeSort, setRecipeSort] = useState("az");
  const [abbeyApproved, setAbbeyApproved] = useState(false);
  const [cookTimeFilter, setCookTimeFilter] = useState("any"); // "any" | "30" | "60"
  const [selectedTags, setSelectedTags] = useState([]);        // string[]
  const [recipeEdits, setRecipeEdits] = useState({});
  const [showCreateRecipe, setShowCreateRecipe] = useState(false);

  // Auth state
  const [token, setToken] = useState(null);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [driveError, setDriveError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [addMealTarget, setAddMealTarget] = useState(null); // { day, meal } | null

  const plan = plans[weekOffset] ?? EMPTY_PLAN;

  const totalWeekCalories = Object.keys(plan).reduce((sum, day) => sum + getDayCalories(plan[day], recipes), 0);
  const avgDailyCalories = Math.round(totalWeekCalories / 7);

  // Load recipes when we get a token
  const loadRecipes = useCallback(async (accessToken) => {
    setLoadingRecipes(true);
    setDriveError(null);
    try {
      const data = await fetchRecipesFromDrive(accessToken);
      setRecipes(data);
    } catch (err) {
      setDriveError("Couldn't load recipes. Please try signing in again.");
      console.error(err);
    } finally {
      setLoadingRecipes(false);
    }
  }, []);

  // Load GIS script + cached data on mount
  useEffect(() => {
    if (!document.getElementById("google-gsi")) {
      const script = document.createElement("script");
      script.id = "google-gsi";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      document.head.appendChild(script);
    }
    try {
      const saved = localStorage.getItem("mealPlannerState");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.plans) {
          // Migrate old string-based slots to SlotItem[] format
          const migrated = {};
          Object.entries(data.plans).forEach(([wk, weekPlan]) => {
            migrated[wk] = {};
            Object.entries(weekPlan).forEach(([day, dayPlan]) => {
              migrated[wk][day] = {};
              Object.entries(dayPlan).forEach(([meal, slot]) => {
                if (typeof slot === "string") {
                  migrated[wk][day][meal] = [{ type: "recipe", recipeId: slot }];
                } else if (Array.isArray(slot)) {
                  migrated[wk][day][meal] = slot;
                } else {
                  migrated[wk][day][meal] = [];
                }
              });
            });
          });
          setPlans(migrated);
        }
        if (data.checkedItems) setCheckedItems(data.checkedItems);
        if (data.calorieGoal) setCalorieGoal(data.calorieGoal);
      }
      const cachedDrive = localStorage.getItem("mealplanner_recipes");
      const cachedCustom = localStorage.getItem("mealplanner_custom_recipes");
      const rawDrive = cachedDrive ? JSON.parse(cachedDrive) : [];
      const customRecipes = cachedCustom ? JSON.parse(cachedCustom) : [];
      // Re-evaluate Abby Approved on load so badges reflect the current rules immediately
      const driveRecipes = rawDrive.map(r => ({ ...r, abbeyApproved: isAbbyApproved(r) }));
      if (driveRecipes.length || customRecipes.length) {
        setRecipes([...customRecipes, ...driveRecipes]);
        localStorage.setItem("mealplanner_recipes", JSON.stringify(driveRecipes));
      }
      const lastSync = localStorage.getItem("mealplanner_last_sync");
      if (lastSync) setLastSyncTime(lastSync);
      const savedEdits = localStorage.getItem("mealplanner_recipe_edits");
      if (savedEdits) setRecipeEdits(JSON.parse(savedEdits));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("mealPlannerState", JSON.stringify({ plans, checkedItems, calorieGoal }));
  }, [plans, checkedItems, calorieGoal]);

  function handleSignIn(accessToken) {
    setToken(accessToken);
    loadRecipes(accessToken);
  }

  function triggerOAuth(callback) {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive",
      callback: (response) => {
        if (response.access_token) {
          setToken(response.access_token);
          callback(response.access_token);
        }
      },
    });
    client.requestAccessToken();
  }

  async function doSync(accessToken) {
    setLoadingRecipes(true);
    setSyncStatus(null);
    setDriveError(null);

    let syncedData = null;
    try {
      const pendingEdits = JSON.parse(localStorage.getItem("mealplanner_recipe_edits") || "{}");
      const savedEditsAfterSync = { ...pendingEdits };

      // ── 1. Fetch all Drive files first (build fileId map for dedup + calorie saves) ─
      const results = await fetchRecipesFromDrive(accessToken);
      const driveFileIds = {};
      results.forEach(({ recipe, fileId }) => { driveFileIds[recipe.id] = fileId; });

      // ── 2. Upload custom recipes to Drive ─────────────────────────────────────
      const customRecipes = JSON.parse(localStorage.getItem("mealplanner_custom_recipes") || "[]");
      const uploadedIds = new Set();
      const promotedRecipes = [];
      for (const recipe of customRecipes) {
        const edits = pendingEdits[recipe.id] || {};
        const toSave = { ...recipe, ...edits, abbeyApproved: isAbbyApproved({ ...recipe, ...edits }) };
        try {
          if (driveFileIds[recipe.id]) {
            // Already in Drive — PATCH instead of creating a duplicate
            await updateRecipeInDrive(accessToken, driveFileIds[recipe.id], toSave);
          } else {
            const newFileId = await createRecipeInDrive(accessToken, toSave);
            driveFileIds[recipe.id] = newFileId;
          }
          uploadedIds.add(recipe.id);
          delete savedEditsAfterSync[recipe.id];
          promotedRecipes.push(toSave);
        } catch (e) {
          console.error("Failed to upload custom recipe:", recipe.title, e);
        }
      }
      const remainingCustom = customRecipes.filter(r => !uploadedIds.has(r.id));
      localStorage.setItem("mealplanner_custom_recipes", JSON.stringify(remainingCustom));

      // ── 3. Apply edits + re-evaluate Abby Approved; PATCH only when changed ───
      const processedResults = await Promise.all(
        results
          .filter(({ recipe }) => !uploadedIds.has(recipe.id)) // already handled above
          .map(async ({ recipe, fileId }) => {
            const edits = savedEditsAfterSync[recipe.id] || {};
            const merged = Object.keys(edits).length > 0 ? { ...recipe, ...edits } : recipe;
            const approved = isAbbyApproved(merged);
            const needsPatch = Object.keys(edits).length > 0 || merged.abbeyApproved !== approved;
            if (!needsPatch) return merged;
            const toSave = { ...merged, abbeyApproved: approved };
            try {
              await updateRecipeInDrive(accessToken, fileId, toSave);
              delete savedEditsAfterSync[recipe.id];
            } catch (e) {
              console.error("Failed to update Drive recipe:", recipe.title, e);
            }
            return toSave;
          })
      );

      localStorage.setItem("mealplanner_recipe_edits", JSON.stringify(savedEditsAfterSync));
      setRecipeEdits(savedEditsAfterSync);
      // Save fileId map so estimateCalories can PATCH Drive immediately
      localStorage.setItem("mealplanner_file_ids", JSON.stringify(driveFileIds));

      // ── 4. Preserve rating/timesCooked (localStorage-only); calories now in Drive ─
      const allDriveRecipes = [...processedResults, ...promotedRecipes];
      const existingCached = JSON.parse(localStorage.getItem("mealplanner_recipes") || "[]");
      const preserved = {};
      existingCached.forEach(r => {
        if (r.rating || r.timesCooked) {
          preserved[r.id] = {
            ...(r.rating      && { rating:      r.rating }),
            ...(r.timesCooked && { timesCooked: r.timesCooked }),
          };
        }
      });
      const mergedData = allDriveRecipes.map(r => preserved[r.id] ? { ...r, ...preserved[r.id] } : r);

      setRecipes([...remainingCustom, ...mergedData]);
      localStorage.setItem("mealplanner_recipes", JSON.stringify(mergedData));
      const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      localStorage.setItem("mealplanner_last_sync", now);
      setLastSyncTime(now);

      syncedData = { mergedData, driveFileIds };
    } catch (err) {
      setDriveError("Couldn't sync recipes from Drive. Please try again.");
      console.error(err);
    } finally {
      setLoadingRecipes(false);
    }

    // ── 5. Auto-estimate calories for any recipe still missing them ───────────
    if (!syncedData) return;
    const { mergedData: syncedRecipes, driveFileIds: syncedFileIds } = syncedData;
    const needsCalories = syncedRecipes.filter(
      r => r.caloriesPerServing == null && (r.ingredients?.length || 0) > 0
    );
    if (needsCalories.length === 0) return;

    setSyncStatus(`Estimating calories (0/${needsCalories.length})…`);
    const calUpdates = {};
    let done = 0;
    for (const recipe of needsCalories) {
      try {
        const res = await fetch("/api/estimate-calories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredients: recipe.ingredients, yield: recipe.yield }),
        });
        const data = await res.json();
        if (data.caloriesPerServing) {
          calUpdates[recipe.id] = {
            caloriesPerServing: data.caloriesPerServing,
            calorieReasoning: data.calorieReasoning || "",
          };
          setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, ...calUpdates[recipe.id] } : r));
          const fileId = syncedFileIds[recipe.id];
          if (fileId) {
            updateRecipeInDrive(accessToken, fileId, { ...recipe, ...calUpdates[recipe.id] })
              .catch(e => console.error("Failed to save calories to Drive:", e));
          }
        }
      } catch (e) {
        console.error("Failed to estimate calories for:", recipe.title, e);
      }
      done++;
      setSyncStatus(`Estimating calories (${done}/${needsCalories.length})…`);
    }

    // Final localStorage update with all estimated calorie data
    if (Object.keys(calUpdates).length > 0) {
      const finalRecipes = syncedRecipes.map(r => calUpdates[r.id] ? { ...r, ...calUpdates[r.id] } : r);
      localStorage.setItem("mealplanner_recipes", JSON.stringify(finalRecipes));
    }
    setSyncStatus(null);
  }

  function syncFromDrive() {
    if (token) { doSync(token); }
    else { triggerOAuth((accessToken) => doSync(accessToken)); }
  }

  async function reEstimateAllCalories(accessToken) {
    const fileIds = JSON.parse(localStorage.getItem("mealplanner_file_ids") || "{}");
    const allRecipes = recipes.filter(r => (r.ingredients?.length || 0) > 0);
    if (allRecipes.length === 0) return;

    setSyncStatus(`Re-estimating calories (0/${allRecipes.length})…`);
    const calUpdates = {};
    let done = 0;
    for (const recipe of allRecipes) {
      try {
        const res = await fetch("/api/estimate-calories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredients: recipe.ingredients, yield: recipe.yield }),
        });
        const data = await res.json();
        if (data.caloriesPerServing) {
          calUpdates[recipe.id] = {
            caloriesPerServing: data.caloriesPerServing,
            calorieReasoning: data.calorieReasoning || "",
          };
          setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, ...calUpdates[recipe.id] } : r));
          const fileId = fileIds[recipe.id];
          if (fileId) {
            updateRecipeInDrive(accessToken, fileId, { ...recipe, ...calUpdates[recipe.id] })
              .catch(e => console.error("Failed to save calories to Drive:", e));
          }
        }
      } catch (e) {
        console.error("Failed to estimate calories for:", recipe.title, e);
      }
      done++;
      setSyncStatus(`Re-estimating calories (${done}/${allRecipes.length})…`);
    }

    if (Object.keys(calUpdates).length > 0) {
      setRecipes(prev => {
        const updated = prev.map(r => calUpdates[r.id] ? { ...r, ...calUpdates[r.id] } : r);
        localStorage.setItem("mealplanner_recipes", JSON.stringify(updated.filter(r => !r.isCustom)));
        localStorage.setItem("mealplanner_custom_recipes", JSON.stringify(updated.filter(r => r.isCustom)));
        return updated;
      });
    }
    setSyncStatus(null);
  }

  function bulkReEstimate() {
    if (token) { reEstimateAllCalories(token); }
    else { triggerOAuth((accessToken) => reEstimateAllCalories(accessToken)); }
  }

  async function estimateCalories(recipe) {
    try {
      const res = await fetch("/api/estimate-calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: recipe.ingredients, yield: recipe.yield }),
      });
      const data = await res.json();
      if (data.caloriesPerServing) {
        const calories = data.caloriesPerServing;
        const reasoning = data.calorieReasoning || "";
        // Update state + localStorage
        setRecipes(prev => {
          const updated = prev.map(r =>
            r.id === recipe.id ? { ...r, caloriesPerServing: calories, calorieReasoning: reasoning } : r
          );
          localStorage.setItem("mealplanner_recipes", JSON.stringify(updated.filter(r => !r.isCustom)));
          localStorage.setItem("mealplanner_custom_recipes", JSON.stringify(updated.filter(r => r.isCustom)));
          return updated;
        });
        // Also PATCH Drive so calories persist across devices and localStorage clears
        if (token) {
          const fileIds = JSON.parse(localStorage.getItem("mealplanner_file_ids") || "{}");
          const fileId = fileIds[recipe.id];
          if (fileId) {
            updateRecipeInDrive(token, fileId, { ...recipe, caloriesPerServing: calories, calorieReasoning: reasoning })
              .catch(e => console.error("Failed to save calories to Drive:", e));
          }
        }
        return { calories, reasoning };
      }
    } catch (err) {
      console.error("Failed to estimate calories:", err);
    }
    return null;
  }

  // ─── Recipe Filter Derived Values ──────────────────────────────────────────

  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  const allTags = useMemo(() => {
    const seen = new Set();
    recipes.forEach(r => (r.tags || []).forEach(tag => {
      const t = tag.toLowerCase().trim();
      if (t) seen.add(t);
    }));
    return [...seen].sort();
  }, [recipes]);

  const abbeyApprovedTagSet = useMemo(() => {
    const seen = new Set();
    recipes.forEach(r => {
      if (r.abbeyApproved === true || (r.abbeyApproved === undefined && isAbbyApproved(r))) {
        (r.tags || []).forEach(tag => seen.add(tag.toLowerCase().trim()));
      }
    });
    return seen;
  }, [recipes]);

  const sortedFiltered = useMemo(() => {
    const q = recipeSearch.toLowerCase();
    const limit = cookTimeFilter === "30" ? 30 : cookTimeFilter === "60" ? 60 : null;
    return recipes
      .filter(r => {
        if (!q) return true;
        if (r.title?.toLowerCase().includes(q)) return true;
        if (r.tags?.some(t => t.toLowerCase().includes(q))) return true;
        if (r.ingredients?.some(i => i.toLowerCase().includes(q))) return true;
        return false;
      })
      .filter(r => abbeyApproved
        ? (r.abbeyApproved === true || (r.abbeyApproved === undefined && isAbbyApproved(r)))
        : true)
      .filter(r => {
        if (!limit) return true;
        const timeStr = r.times?.["total time"] || r.times?.["active time"] || r.times?.["cook time"];
        const mins = parseTotalMinutes(timeStr);
        return mins === null || mins <= limit;
      })
      .filter(r => {
        if (selectedTags.length === 0) return true;
        const rt = (r.tags || []).map(t => t.toLowerCase().trim());
        return selectedTags.some(sel => rt.includes(sel));
      })
      .sort((a, b) => {
        if (recipeSort === "rating") return (b.rating || 0) - (a.rating || 0);
        if (recipeSort === "cooked") return (b.timesCooked || 0) - (a.timesCooked || 0);
        if (recipeSort === "az")     return a.title.localeCompare(b.title);
        return 0;
      });
  }, [recipes, recipeSearch, abbeyApproved, cookTimeFilter, selectedTags, recipeSort]);

  function clearAllFilters() {
    setRecipeSearch(""); setRecipeSort("az");
    setAbbeyApproved(false); setCookTimeFilter("any"); setSelectedTags([]);
  }

  const activeFilterCount = (recipeSearch ? 1 : 0) + (abbeyApproved ? 1 : 0)
    + (cookTimeFilter !== "any" ? 1 : 0) + selectedTags.length;

  function removeFromPlan(day, meal, index) {
    setPlans(prev => {
      const cur = prev[weekOffset] ?? EMPTY_PLAN;
      const existing = Array.isArray(cur[day]?.[meal]) ? cur[day][meal] : [];
      const updated = existing.filter((_, i) => i !== index);
      return { ...prev, [weekOffset]: { ...cur, [day]: { ...cur[day], [meal]: updated } } };
    });
  }

  function updateSlotItemServings(day, meal, index, servings) {
    setPlans(prev => {
      const cur = prev[weekOffset] ?? EMPTY_PLAN;
      const arr = [...(Array.isArray(cur[day]?.[meal]) ? cur[day][meal] : [])];
      arr[index] = { ...arr[index], servings: Math.max(0.5, servings) };
      return { ...prev, [weekOffset]: { ...cur, [day]: { ...cur[day], [meal]: arr } } };
    });
  }

  function addToPlan(day, meal, item) {
    setPlans(prev => {
      const cur = prev[weekOffset] ?? EMPTY_PLAN;
      const existing = Array.isArray(cur[day]?.[meal]) ? cur[day][meal] : [];
      return { ...prev, [weekOffset]: { ...cur, [day]: { ...cur[day], [meal]: [...existing, item] } } };
    });
  }

  function updateRating(id, rating) {
    setRecipes(rs => {
      const updated = rs.map(r => r.id === id ? { ...r, rating } : r);
      localStorage.setItem("mealplanner_recipes", JSON.stringify(updated.filter(r => !r.isCustom)));
      localStorage.setItem("mealplanner_custom_recipes", JSON.stringify(updated.filter(r => r.isCustom)));
      return updated;
    });
  }

  function markCooked(id) {
    setRecipes(rs => {
      const updated = rs.map(r => r.id === id ? { ...r, timesCooked: (r.timesCooked || 0) + 1 } : r);
      localStorage.setItem("mealplanner_recipes", JSON.stringify(updated.filter(r => !r.isCustom)));
      localStorage.setItem("mealplanner_custom_recipes", JSON.stringify(updated.filter(r => r.isCustom)));
      return updated;
    });
  }

  function saveRecipeEdits(recipeId, edits) {
    setRecipeEdits(prev => {
      const updated = { ...prev, [recipeId]: edits };
      localStorage.setItem("mealplanner_recipe_edits", JSON.stringify(updated));
      return updated;
    });
  }

  function createRecipe(recipe) {
    const existing = JSON.parse(localStorage.getItem("mealplanner_custom_recipes") || "[]");
    const updated = [recipe, ...existing];
    localStorage.setItem("mealplanner_custom_recipes", JSON.stringify(updated));
    setRecipes(prev => [recipe, ...prev]);
    setShowCreateRecipe(false);
  }

  function duplicateRecipe(recipe, edits) {
    // Build a display title from effective values
    const baseTitle = edits?.title ?? recipe.title ?? "Recipe";
    // Strip any existing " (N)" suffix to find the root title
    const rootTitle = baseTitle.replace(/\s*\(\d+\)\s*$/, "");
    // Find the next available number
    const used = new Set(
      recipes
        .map(r => recipeEdits[r.id]?.title ?? r.title ?? "")
        .filter(t => t === rootTitle || t.startsWith(rootTitle + " ("))
        .map(t => { const m = t.match(/\((\d+)\)$/); return m ? parseInt(m[1], 10) : 0; })
    );
    let n = 1;
    while (used.has(n)) n++;
    const newTitle = `${rootTitle} (${n})`;

    const newRecipe = {
      id: "custom_" + Date.now(),
      isCustom: true,
      title: newTitle,
      yield: edits?.yield ?? recipe.yield ?? "",
      times: edits?.times ?? recipe.times ?? {},
      ingredients: edits?.ingredients ?? recipe.ingredients ?? [],
      instructions: edits?.instructions ?? recipe.instructions ?? [],
      description: edits?.description ?? recipe.description ?? "",
      tags: edits?.tags ?? recipe.tags ?? [],
      caloriesPerServing: edits?.caloriesPerServing ?? recipe.caloriesPerServing ?? null,
      calorieReasoning: edits?.calorieReasoning ?? recipe.calorieReasoning ?? "",
      rating: 0,
      timesCooked: 0,
      ...(recipe.author ? { author: recipe.author } : {}),
      ...(recipe.sourceUrl ? { sourceUrl: recipe.sourceUrl } : {}),
      ...(recipe.image ? { image: recipe.image } : {}),
    };
    const existing = JSON.parse(localStorage.getItem("mealplanner_custom_recipes") || "[]");
    localStorage.setItem("mealplanner_custom_recipes", JSON.stringify([newRecipe, ...existing]));
    setRecipes(prev => [newRecipe, ...prev]);
    setSelectedRecipe(newRecipe);
  }

  function deleteCustomRecipe(id) {
    const existing = JSON.parse(localStorage.getItem("mealplanner_custom_recipes") || "[]");
    localStorage.setItem("mealplanner_custom_recipes", JSON.stringify(existing.filter(r => r.id !== id)));
    setRecipes(prev => prev.filter(r => r.id !== id));
    setSelectedRecipe(null);
  }

  const tabs = [
    { id: "planner", label: "Week Planner", icon: "📅" },
    { id: "recipes", label: "My Recipes", icon: "📖" },
    { id: "shopping", label: "Shopping List", icon: "🛒" },
    { id: "calories", label: "Calories", icon: "📊" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f5f0e8",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: "#1c1915",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #c8bfb0; border-radius: 3px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .tab-btn { transition: all 0.2s; }
        .tab-btn:hover { background: rgba(200,160,60,0.12) !important; }
        .recipe-card { transition: transform 0.15s, box-shadow 0.15s; cursor: pointer; }
        .recipe-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.1) !important; }
        .meal-slot { transition: background 0.15s, border-color 0.15s; cursor: pointer; }
        .meal-slot:hover { background: rgba(200,160,60,0.06) !important; }
        .picker-card { transition: border-color 0.12s, background 0.12s; }
        .picker-card:hover { border-color: #c8a03c !important; background: #fffbf0 !important; }
        .check-item { transition: opacity 0.2s; }
        .check-item.checked { opacity: 0.45; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .fade-in { animation: fadeIn 0.3s ease forwards; }
        .cal-bar-fill { transition: width 0.6s cubic-bezier(0.34,1.2,0.64,1); }
        .signin-btn:hover { background: #2e2820 !important; }
      `}</style>

      {/* Header */}
      <header style={{
        background: "#1c1915",
        padding: "0 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 64,
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 2px 20px rgba(0,0,0,0.25)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, background: "#c8a03c", borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18
          }}>🌿</div>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: "#f5f0e8", letterSpacing: "0.02em" }}>
              Meal Planner
            </div>
            <div style={{ fontSize: 10, color: "#8a7f72", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Powered by Claude
            </div>
          </div>
        </div>

        <nav style={{ display: "flex", gap: 4 }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className="tab-btn"
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: activeTab === tab.id ? "rgba(200,160,60,0.18)" : "transparent",
                border: "none",
                color: activeTab === tab.id ? "#c8a03c" : "#8a7f72",
                padding: "8px 16px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 500 : 400,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {editingGoal ? (
            <input
              autoFocus
              type="number"
              value={calorieGoal}
              onChange={e => setCalorieGoal(Math.max(1, Number(e.target.value)))}
              onBlur={() => setEditingGoal(false)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditingGoal(false); }}
              style={{
                width: 110, background: "rgba(200,160,60,0.12)",
                border: "1px solid rgba(200,160,60,0.5)", borderRadius: 20,
                padding: "5px 12px", fontSize: 12, color: "#c8a03c",
                fontWeight: 500, fontFamily: "'DM Sans', sans-serif", outline: "none",
              }}
            />
          ) : (
            <div
              onClick={() => setEditingGoal(true)}
              title="Click to edit calorie goal"
              style={{
                background: "rgba(200,160,60,0.12)",
                border: "1px solid rgba(200,160,60,0.3)",
                borderRadius: 20, padding: "6px 14px",
                fontSize: 12, color: "#c8a03c", fontWeight: 500,
                cursor: "pointer", userSelect: "none",
              }}
            >
              Goal: {calorieGoal.toLocaleString()} cal/day ✎
            </div>
          )}
          <button
            onClick={syncFromDrive}
            title="Sync recipes from Drive"
            disabled={loadingRecipes}
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, padding: "6px 10px", cursor: loadingRecipes ? "default" : "pointer",
              color: loadingRecipes ? "#555" : "#8a7f72", fontSize: 14,
              opacity: loadingRecipes ? 0.5 : 1,
            }}
          >↻</button>
        </div>
      </header>

      {/* Calorie estimation progress banner */}
      {syncStatus && (
        <div style={{
          background: "rgba(200,160,60,0.08)", borderBottom: "1px solid rgba(200,160,60,0.2)",
          padding: "7px 24px", display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, color: "#c8a03c",
        }}>
          <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>↻</span>
          {syncStatus}
        </div>
      )}

      {/* Recipe Picker Modal */}
      {pickerTarget && (
        <RecipePicker
          recipes={recipes}
          target={pickerTarget}
          search={pickerSearch}
          onSearchChange={setPickerSearch}
          onSelect={recipe => {
            addToPlan(pickerTarget.day, pickerTarget.meal, { type: "recipe", recipeId: recipe.id });
            setPickerTarget(null);
            setPickerSearch("");
          }}
          onClose={() => { setPickerTarget(null); setPickerSearch(""); }}
        />
      )}

      {/* Recipe Detail Modal */}
      {selectedRecipe && (
        <RecipeDetail
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onRate={r => { updateRating(selectedRecipe.id, r); setSelectedRecipe(prev => ({ ...prev, rating: r })); }}
          onMarkCooked={() => { markCooked(selectedRecipe.id); setSelectedRecipe(prev => ({ ...prev, timesCooked: (prev.timesCooked || 0) + 1 })); }}
          onEstimateCalories={async (recipe) => {
            const result = await estimateCalories(recipe);
            if (result) setSelectedRecipe(prev => ({ ...prev, caloriesPerServing: result.calories, calorieReasoning: result.reasoning }));
          }}
          edits={recipeEdits[selectedRecipe.id]}
          onSaveEdits={edits => saveRecipeEdits(selectedRecipe.id, edits)}
          onDuplicate={() => duplicateRecipe(selectedRecipe, recipeEdits[selectedRecipe.id])}
          onDelete={selectedRecipe.isCustom ? () => deleteCustomRecipe(selectedRecipe.id) : undefined}
        />
      )}

      {/* Build Meal Modal */}
      {addMealTarget && (
        <BuildMealModal
          target={addMealTarget}
          recipes={recipes}
          recipeEdits={recipeEdits}
          currentItems={(() => {
            const raw = plans[weekOffset]?.[addMealTarget.day]?.[addMealTarget.meal];
            return Array.isArray(raw) ? raw : (typeof raw === "string" ? [{ type: "recipe", recipeId: raw }] : []);
          })()}
          onSelectRecipe={recipe => {
            addToPlan(addMealTarget.day, addMealTarget.meal, { type: "recipe", recipeId: recipe.id, servings: 1 });
          }}
          onAddFreeform={text => {
            addToPlan(addMealTarget.day, addMealTarget.meal, { type: "freeform", text });
          }}
          onUpdateServings={(index, servings) => updateSlotItemServings(addMealTarget.day, addMealTarget.meal, index, servings)}
          onRemoveItem={index => removeFromPlan(addMealTarget.day, addMealTarget.meal, index)}
          onClose={() => setAddMealTarget(null)}
        />
      )}

      {/* Create Recipe Modal */}
      {showCreateRecipe && (
        <CreateRecipeModal
          onSave={createRecipe}
          onClose={() => setShowCreateRecipe(false)}
        />
      )}

      {/* Content */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>

        {/* Syncing from scratch */}
        {loadingRecipes && recipes.length === 0 && <Spinner message="Syncing recipes from Google Drive…" />}

        {/* Error banner */}
        {driveError && (
          <div style={{
            background: "#fff0f0", border: "1px solid #f5c0c0", borderRadius: 10,
            padding: "16px 20px", color: "#c94040", fontSize: 14, marginBottom: 20
          }}>
            {driveError}
            <button onClick={syncFromDrive} style={{
              marginLeft: 12, background: "none", border: "1px solid #c94040",
              borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "#c94040", fontSize: 12
            }}>Retry</button>
          </div>
        )}

        {/* App content */}
        {(!loadingRecipes || recipes.length > 0) && (
          <>
            {/* Empty state */}
            {recipes.length === 0 && !driveError && (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", minHeight: 320, gap: 16, textAlign: "center"
              }}>
                <div style={{ fontSize: 48 }}>📭</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600 }}>
                  No recipes yet
                </div>
                <div style={{ fontSize: 14, color: "#8a7f72", maxWidth: 340, lineHeight: 1.6 }}>
                  Create your own recipes, or use the Chrome extension to save from NYT Cooking.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setShowCreateRecipe(true)}
                    style={{
                      background: "#1c1915", color: "#f5f0e8", border: "none", borderRadius: 10,
                      padding: "10px 22px", fontSize: 14, fontWeight: 500, cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    + New Recipe
                  </button>
                  <button
                    onClick={syncFromDrive}
                    style={{
                      background: "#fff", color: "#1c1915", border: "1.5px solid #e8e0d4", borderRadius: 10,
                      padding: "10px 22px", fontSize: 14, fontWeight: 500, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8, fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <img src="https://www.google.com/favicon.ico" width={14} height={14} alt="" />
                    Sync from Drive
                  </button>
                </div>
              </div>
            )}

            {recipes.length > 0 && (
              <>
                {/* ── WEEK PLANNER ── */}
                {activeTab === "planner" && (
                  <div className="fade-in">
                    <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
                      <button
                        onClick={() => setWeekOffset(w => w - 1)}
                        style={{
                          background: "#faf7f2", border: "1.5px solid #e8e0d4", borderRadius: 8,
                          width: 36, height: 36, cursor: "pointer", fontSize: 16, color: "#8a7f72",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}
                      >←</button>
                      <div>
                        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, margin: 0, lineHeight: 1 }}>
                          {getWeekLabel(weekOffset)}
                        </h1>
                        <div style={{ fontSize: 12, color: "#8a7f72", marginTop: 4 }}>
                          {getMondayOfWeek(weekOffset).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                          {" – "}
                          {new Date(getMondayOfWeek(weekOffset).getTime() + 6 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                      <button
                        onClick={() => setWeekOffset(w => w + 1)}
                        style={{
                          background: "#faf7f2", border: "1.5px solid #e8e0d4", borderRadius: 8,
                          width: 36, height: 36, cursor: "pointer", fontSize: 16, color: "#8a7f72",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}
                      >→</button>
                      {weekOffset !== 0 && (
                        <button
                          onClick={() => setWeekOffset(0)}
                          style={{
                            background: "none", border: "1px solid #d4c9b8", borderRadius: 8,
                            padding: "6px 14px", fontSize: 12, color: "#8a7f72", cursor: "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >Today</button>
                      )}
                    </div>

                    <div style={{ overflowX: "auto", paddingBottom: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", gap: 6, minWidth: 860 }}>
                        <div />
                        {DAYS.map((day, dayIdx) => {
                          const cals = getDayCalories(plan[day], recipes);
                          const pct = Math.min((cals / calorieGoal) * 100, 100);
                          const over = cals > calorieGoal;
                          const dayDate = new Date(getSundayOfWeek(weekOffset).getTime() + dayIdx * 86400000);
                          const isToday = dayDate.toDateString() === new Date().toDateString();
                          return (
                            <div key={day} style={{ textAlign: "center", paddingBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 500, color: isToday ? "#c8a03c" : "#8a7f72", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                {day.slice(0, 3)}
                              </div>
                              <div style={{ fontSize: 11, color: isToday ? "#c8a03c" : "#b0a898", fontWeight: isToday ? 600 : 400, marginBottom: 2 }}>
                                {dayDate.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                              </div>
                              <div style={{ fontSize: 12, color: over ? "#c94040" : "#4a7c59", fontWeight: 500, margin: "3px 0 5px" }}>
                                {cals > 0 ? `${cals} cal` : "—"}
                              </div>
                              <div style={{ height: 4, background: "#e0d8cc", borderRadius: 2, overflow: "hidden" }}>
                                <div className="cal-bar-fill" style={{
                                  height: "100%", borderRadius: 2,
                                  background: over ? "#c94040" : "#4a7c59",
                                  width: `${pct}%`
                                }} />
                              </div>
                            </div>
                          );
                        })}

                        {MEALS.map(meal => (
                          <React.Fragment key={meal}>
                            <div style={{
                              display: "flex", alignItems: "center", justifyContent: "flex-end",
                              paddingRight: 10, paddingTop: 6
                            }}>
                              <span style={{ fontSize: 11, color: "#8a7f72", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                                {meal}
                              </span>
                            </div>
                            {DAYS.map(day => {
                              const rawSlot = plan[day][meal];
                              const slotItems = Array.isArray(rawSlot) ? rawSlot : (typeof rawSlot === "string" ? [{ type: "recipe", recipeId: rawSlot }] : []);
                              return (
                                <div
                                  key={`${day}-${meal}`}
                                  className="meal-slot"
                                  style={{
                                    minHeight: 70,
                                    background: "#faf7f2",
                                    border: "1.5px solid #e8e0d4",
                                    borderRadius: 8,
                                    padding: 8,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                  }}
                                >
                                  {slotItems.length === 0 ? (
                                    <div
                                      onClick={() => setAddMealTarget({ day, meal })}
                                      style={{
                                        flex: 1, minHeight: 54,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        color: "#c0b8ac", fontSize: 18, cursor: "pointer",
                                      }}
                                    >+</div>
                                  ) : (
                                    <>
                                      {slotItems.map((item, idx) => {
                                        if (item.type === "recipe") {
                                          const recipe = getRecipe(item.recipeId, recipes);
                                          if (!recipe) return null;
                                          const title = recipeEdits[recipe.id]?.title ?? recipe.title ?? "";
                                          const servings = item.servings || 1;
                                          const dispCal = recipe.caloriesPerServing ? Math.round(recipe.caloriesPerServing * servings) : null;
                                          return (
                                            <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 4, minWidth: 0 }}>
                                              <div
                                                onClick={() => setAddMealTarget({ day, meal })}
                                                style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                                              >
                                                <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.3, color: "#1c1915", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                  {recipeEmoji(recipe.id)} {title}
                                                </div>
                                                {dispCal != null && (
                                                  <div style={{ fontSize: 10, color: "#8a7f72" }}>
                                                    {dispCal} cal{servings !== 1 && <span style={{ color: "#c0b8ac" }}> ×{servings}</span>}
                                                  </div>
                                                )}
                                              </div>
                                              <button
                                                onClick={() => removeFromPlan(day, meal, idx)}
                                                style={{ background: "none", border: "none", cursor: "pointer", color: "#c0b8ac", fontSize: 13, padding: "0 1px", lineHeight: 1, flexShrink: 0 }}
                                              >×</button>
                                            </div>
                                          );
                                        }
                                        if (item.type === "freeform") {
                                          return (
                                            <FreeformSlotItem
                                              key={idx}
                                              text={item.text}
                                              onSave={newText => {
                                                if (!newText.trim()) { removeFromPlan(day, meal, idx); return; }
                                                setPlans(prev => {
                                                  const cur = prev[weekOffset] ?? EMPTY_PLAN;
                                                  const arr = [...(Array.isArray(cur[day]?.[meal]) ? cur[day][meal] : [])];
                                                  arr[idx] = { ...arr[idx], text: newText.trim() };
                                                  return { ...prev, [weekOffset]: { ...cur, [day]: { ...cur[day], [meal]: arr } } };
                                                });
                                              }}
                                              onRemove={() => removeFromPlan(day, meal, idx)}
                                            />
                                          );
                                        }
                                        return null;
                                      })}
                                      <button
                                        onClick={() => setAddMealTarget({ day, meal })}
                                        style={{
                                          background: "none", border: "1px dashed #d4c9b8", borderRadius: 6,
                                          padding: "3px 6px", fontSize: 10, color: "#c0b8ac", cursor: "pointer",
                                          fontFamily: "'DM Sans', sans-serif", textAlign: "center", marginTop: 2,
                                        }}
                                      >+ add</button>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    <div style={{
                      marginTop: 20, background: "#faf7f2", border: "1px solid #e8e0d4",
                      borderRadius: 10, padding: "12px 18px", fontSize: 12, color: "#8a7f72",
                      display: "flex", alignItems: "center", gap: 8
                    }}>
                      💡 <strong style={{ color: "#1c1915" }}>Tip:</strong> Click any meal slot to open Build a Meal — add recipes, adjust servings, or add free-form notes. Click × to remove individual items.
                    </div>
                  </div>
                )}

                {/* ── RECIPES ── */}
                {activeTab === "recipes" && (
                  <div className="fade-in">
                    <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, margin: 0 }}>
                          Recipe Library
                        </h1>
                        <span style={{ color: "#8a7f72", fontSize: 13 }}>
                          {sortedFiltered.length === recipes.length ? `${recipes.length} recipes` : `${sortedFiltered.length} of ${recipes.length}`}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        {lastSyncTime && <span style={{ fontSize: 11, color: "#c0b8ac" }}>Last synced: {lastSyncTime}</span>}
                        <button
                          onClick={() => setShowCreateRecipe(true)}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            background: "#1c1915", border: "none", borderRadius: 8,
                            padding: "7px 14px", fontSize: 12, color: "#f5f0e8",
                            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                            fontWeight: 500,
                          }}
                        >
                          + New Recipe
                        </button>
                        <button
                          onClick={syncFromDrive}
                          disabled={loadingRecipes}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            background: "#fff", border: "1.5px solid #e8e0d4", borderRadius: 8,
                            padding: "7px 14px", fontSize: 12, color: "#1c1915",
                            cursor: loadingRecipes ? "default" : "pointer",
                            fontFamily: "'DM Sans', sans-serif", opacity: loadingRecipes ? 0.6 : 1,
                          }}
                        >
                          <img src="https://www.google.com/favicon.ico" width={12} height={12} alt="" />
                          {loadingRecipes ? "Syncing…" : "Sync from Drive"}
                        </button>
                        <button
                          onClick={bulkReEstimate}
                          disabled={!!syncStatus}
                          title="Re-estimate calories for all recipes using the latest AI model"
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            background: "#fff", border: "1.5px solid #e8e0d4", borderRadius: 8,
                            padding: "7px 14px", fontSize: 12, color: "#1c1915",
                            cursor: syncStatus ? "default" : "pointer",
                            fontFamily: "'DM Sans', sans-serif", opacity: syncStatus ? 0.6 : 1,
                          }}
                        >
                          ✨ Re-estimate all calories
                        </button>
                      </div>
                    </div>

                    {/* ── Filter Row 1: Search ── */}
                    <style>{`.tag-scroll::-webkit-scrollbar { display: none; }`}</style>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ position: "relative" }}>
                        <span style={{
                          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                          fontSize: 14, color: "#c0b8ac", pointerEvents: "none",
                        }}>🔍</span>
                        <input
                          type="text"
                          placeholder="Search by title, ingredient, or tag…"
                          value={recipeSearch}
                          onChange={e => setRecipeSearch(e.target.value)}
                          style={{
                            width: "100%", boxSizing: "border-box",
                            border: "1.5px solid #e8e0d4", borderRadius: 10,
                            padding: "9px 14px 9px 36px", fontSize: 13,
                            fontFamily: "'DM Sans', sans-serif", color: "#1c1915",
                            background: "#fff", outline: "none",
                          }}
                        />
                      </div>
                    </div>

                    {/* ── Filter Row 2: Sort / Time / Abby / Clear ── */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                      <select
                        value={recipeSort}
                        onChange={e => setRecipeSort(e.target.value)}
                        style={{
                          border: "1.5px solid #e8e0d4", borderRadius: 10,
                          padding: "8px 12px", fontSize: 13,
                          fontFamily: "'DM Sans', sans-serif", color: "#1c1915",
                          background: "#fff", cursor: "pointer", outline: "none",
                        }}
                      >
                        <option value="default">Default</option>
                        <option value="rating">Top Rated</option>
                        <option value="cooked">Most Cooked</option>
                        <option value="az">A → Z</option>
                      </select>
                      {[["any","Any time"],["30","≤ 30 min"],["60","≤ 1 hr"]].map(([val, label]) => (
                        <button key={val} onClick={() => setCookTimeFilter(val)} style={{
                          border: "1.5px solid #e8e0d4", borderRadius: 20,
                          padding: "7px 13px", fontSize: 12, fontWeight: 500,
                          cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                          background: cookTimeFilter === val ? "#1c1915" : "#fff",
                          color: cookTimeFilter === val ? "#f5f0e8" : "#1c1915",
                          transition: "all 0.15s", whiteSpace: "nowrap",
                        }}>{label}</button>
                      ))}
                      <button
                        onClick={() => setAbbeyApproved(v => !v)}
                        title="Hide recipes with eggs, dairy, wheat, or gluten"
                        style={{
                          background: abbeyApproved ? "#4a7c59" : "transparent",
                          color: abbeyApproved ? "#fff" : "#4a7c59",
                          border: "1.5px solid #4a7c59", borderRadius: 20,
                          padding: "8px 14px", fontSize: 12, fontWeight: 500,
                          cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                          fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
                          whiteSpace: "nowrap",
                        }}
                      >🌿 Abby Approved</button>
                      {allTags.length > 0 && (
                        <div style={{ position: "relative" }}>
                          <button
                            onClick={() => setShowTagDropdown(v => !v)}
                            style={{
                              border: "1.5px solid #e8e0d4", borderRadius: 20,
                              padding: "7px 13px", fontSize: 12, fontWeight: 500,
                              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                              background: selectedTags.length > 0 ? "#1c1915" : "#fff",
                              color: selectedTags.length > 0 ? "#f5f0e8" : "#1c1915",
                              whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5,
                            }}
                          >
                            🏷 Tags{selectedTags.length > 0 ? ` (${selectedTags.length})` : ""} ▾
                          </button>
                          {showTagDropdown && (
                            <>
                              <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={() => setShowTagDropdown(false)} />
                              <div style={{
                                position: "absolute", top: "calc(100% + 6px)", left: 0,
                                background: "#fff", border: "1px solid #e8e0d4",
                                borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                                zIndex: 10, width: 230, maxHeight: 320, display: "flex", flexDirection: "column",
                              }}>
                                <div style={{ padding: "8px 10px", borderBottom: "1px solid #e8e0d4" }}>
                                  <input
                                    value={tagSearch}
                                    onChange={e => setTagSearch(e.target.value)}
                                    placeholder="Search tags…"
                                    autoFocus
                                    style={{
                                      width: "100%", boxSizing: "border-box",
                                      border: "1px solid #d4c9b8", borderRadius: 6,
                                      padding: "5px 9px", fontSize: 12,
                                      fontFamily: "'DM Sans', sans-serif", background: "#faf7f2", outline: "none",
                                    }}
                                  />
                                </div>
                                <div style={{ overflowY: "auto", padding: "4px 0" }}>
                                  {allTags.filter(t => (!abbeyApproved || abbeyApprovedTagSet.has(t)) && (!tagSearch || t.includes(tagSearch.toLowerCase()))).map(tag => {
                                    const active = selectedTags.includes(tag);
                                    return (
                                      <label key={tag} style={{
                                        display: "flex", alignItems: "center", gap: 8,
                                        padding: "5px 12px", cursor: "pointer", fontSize: 12,
                                        color: "#1c1915", fontFamily: "'DM Sans', sans-serif",
                                        background: active ? "#f5f0e8" : "transparent",
                                      }}>
                                        <input
                                          type="checkbox"
                                          checked={active}
                                          onChange={() => setSelectedTags(prev => active ? prev.filter(t => t !== tag) : [...prev, tag])}
                                          style={{ accentColor: "#1c1915", cursor: "pointer", flexShrink: 0 }}
                                        />
                                        {tag}
                                      </label>
                                    );
                                  })}
                                </div>
                                {selectedTags.length > 0 && (
                                  <div style={{ padding: "6px 12px", borderTop: "1px solid #e8e0d4" }}>
                                    <button onClick={() => setSelectedTags([])} style={{
                                      background: "none", border: "none", cursor: "pointer",
                                      fontSize: 11, color: "#8a7f72", textDecoration: "underline",
                                      fontFamily: "'DM Sans', sans-serif", padding: 0,
                                    }}>Clear tag filters</button>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      {activeFilterCount > 0 && (
                        <button onClick={clearAllFilters} style={{
                          marginLeft: "auto", background: "transparent", border: "none",
                          padding: "7px 4px", fontSize: 12, color: "#8a7f72",
                          cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                          display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                        }}>
                          <span style={{
                            background: "#e8e0d4", borderRadius: 20,
                            padding: "1px 7px", fontSize: 11, color: "#5a5248", fontWeight: 600,
                          }}>{activeFilterCount}</span>
                          Clear filters ×
                        </button>
                      )}
                    </div>


                    {sortedFiltered.length === 0 && (
                      <div style={{ color: "#8a7f72", fontSize: 14, textAlign: "center", paddingTop: 60 }}>
                        {activeFilterCount > 0
                          ? <span>No recipes match your filters. <button onClick={clearAllFilters} style={{ background: "none", border: "none", color: "#4a7c59", cursor: "pointer", fontSize: 14, textDecoration: "underline", fontFamily: "'DM Sans', sans-serif", padding: 0 }}>Clear filters</button></span>
                          : "No recipes yet."}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                      {sortedFiltered.map(recipe => (
                        <div
                          key={recipe.id}
                          className="recipe-card"
                          onClick={() => setSelectedRecipe(recipe)}
                          style={{
                            background: "#faf7f2",
                            border: "1.5px solid #e8e0d4",
                            borderRadius: 12,
                            overflow: "hidden",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                          }}
                        >
                          <div style={{
                            background: "linear-gradient(135deg, #2a2420 0%, #3d3128 100%)",
                            padding: "10px 12px 16px",
                          }}>
                            {/* Badge row — sits in the dark area above the image */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 26, marginBottom: 8 }}>
                              <div>
                                {recipe.isCustom && (
                                  <div style={{
                                    background: "rgba(74,124,89,0.25)", border: "1px solid rgba(74,124,89,0.5)",
                                    borderRadius: 20, padding: "3px 10px",
                                    fontSize: 10, color: "#6aaa7e", fontWeight: 500, display: "inline-block"
                                  }}>
                                    ✦ My Recipe
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                                {recipe.abbeyApproved === true && (
                                  <div style={{
                                    background: "rgba(74,124,89,0.25)", border: "1px solid rgba(74,124,89,0.5)",
                                    borderRadius: 20, padding: "3px 10px",
                                    fontSize: 10, color: "#e8f5ee", fontWeight: 500
                                  }}>
                                    🌿 Abby Approved
                                  </div>
                                )}
                                {(recipeEdits[recipe.id]?.caloriesPerServing ?? recipe.caloriesPerServing) ? (
                                  <div style={{
                                    background: "rgba(200,160,60,0.2)", border: "1px solid rgba(200,160,60,0.4)",
                                    borderRadius: 20, padding: "3px 10px",
                                    fontSize: 11, color: "#f5dfa0", fontWeight: 500
                                  }}>
                                    {recipeEdits[recipe.id]?.caloriesPerServing ?? recipe.caloriesPerServing} cal
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            {recipe.image ? (
                              <img src={recipe.image} alt={recipe.title} style={{
                                width: "100%", height: 120, objectFit: "cover",
                                borderRadius: 6, marginBottom: 10
                              }} />
                            ) : (
                              <div style={{ fontSize: 36, marginBottom: 8 }}>{recipeEmoji(recipe.id)}</div>
                            )}
                            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 600, color: "#f5f0e8", lineHeight: 1.3, minHeight: "2.6em" }}>
                              {recipeEdits[recipe.id]?.title ?? recipe.title}
                            </div>
                            <div style={{ marginTop: 6 }}>
                              <StarRating rating={recipe.rating} onChange={r => updateRating(recipe.id, r)} />
                            </div>
                          </div>

                          <div style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                              {recipe.times?.["total time"] && (
                                <span style={{ fontSize: 11, color: "#8a7f72" }}>⏱ {recipe.times["total time"]}</span>
                              )}
                              {recipe.yield && (
                                <span style={{ fontSize: 11, color: "#8a7f72" }}>👤 {recipe.yield}</span>
                              )}
                              {recipe.timesCooked > 0 && (
                                <span style={{ fontSize: 11, color: "#4a7c59" }}>✓ Made {recipe.timesCooked}×</span>
                              )}
                            </div>

                            {(recipeEdits[recipe.id]?.tags ?? recipe.tags)?.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
                                {(recipeEdits[recipe.id]?.tags ?? recipe.tags).slice(0, 3).map(tag => (
                                  <span key={tag} style={{
                                    background: "#f0ebe2", borderRadius: 20, padding: "2px 9px",
                                    fontSize: 10, color: "#8a7f72", fontWeight: 500
                                  }}>{tag}</span>
                                ))}
                              </div>
                            )}

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                              <div style={{ fontSize: 10, color: "#c0b8ac", fontStyle: "italic" }}>Click to view recipe</div>
                              {recipeEdits[recipe.id] && (
                                <div title="Changes not synced to Drive" style={{
                                  fontSize: 9, color: "#c8a03c", fontWeight: 600,
                                  background: "rgba(200,160,60,0.12)", borderRadius: 10,
                                  padding: "2px 7px", letterSpacing: "0.03em",
                                }}>
                                  unsynced
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── SHOPPING LIST ── */}
                {activeTab === "shopping" && (
                  <ShoppingListTab
                    plan={plan}
                    recipes={recipes}
                    recipeEdits={recipeEdits}
                    checkedItems={checkedItems}
                    onSetCheckedItems={setCheckedItems}
                  />
                )}

                {/* ── CALORIES ── */}
                {activeTab === "calories" && (
                  <div className="fade-in">
                    <div style={{ marginBottom: 24 }}>
                      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, margin: 0 }}>
                        Calorie Summary
                      </h1>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28, maxWidth: 600 }}>
                      {[
                        { label: "Daily Goal", value: calorieGoal, unit: "cal", color: "#c8a03c" },
                        { label: "Avg This Week", value: avgDailyCalories, unit: "cal", color: avgDailyCalories > calorieGoal ? "#c94040" : "#4a7c59" },
                        { label: "Deficit / Day", value: Math.abs(calorieGoal - avgDailyCalories), unit: `cal ${calorieGoal > avgDailyCalories ? "under" : "over"}`, color: calorieGoal > avgDailyCalories ? "#4a7c59" : "#c94040" },
                      ].map(card => (
                        <div key={card.label} style={{
                          background: "#faf7f2", border: "1.5px solid #e8e0d4",
                          borderRadius: 12, padding: "18px 20px"
                        }}>
                          <div style={{ fontSize: 11, color: "#8a7f72", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                            {card.label}
                          </div>
                          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: card.color, lineHeight: 1 }}>
                            {card.value.toLocaleString()}
                          </div>
                          <div style={{ fontSize: 11, color: "#8a7f72", marginTop: 3 }}>{card.unit}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ maxWidth: 600 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#8a7f72", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>
                        Daily Breakdown
                      </div>
                      {DAYS.map(day => {
                        const cals = getDayCalories(plan[day], recipes);
                        const pct = Math.min((cals / calorieGoal) * 100, 100);
                        const over = cals > calorieGoal;
                        const meals = Object.entries(plan[day])
                          .filter(([, id]) => id)
                          .map(([meal, id]) => `${meal}: ${getRecipe(id, recipes)?.title}`)
                          .join(" · ");

                        return (
                          <div key={day} style={{ marginBottom: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{day}</span>
                              <span style={{ fontSize: 13, color: over ? "#c94040" : cals > 0 ? "#4a7c59" : "#c0b8ac", fontWeight: 500 }}>
                                {cals > 0 ? `${cals} cal ${over ? "▲" : ""}` : "No meals planned"}
                              </span>
                            </div>
                            <div style={{ height: 10, background: "#e8e0d4", borderRadius: 5, overflow: "hidden", marginBottom: 4 }}>
                              <div className="cal-bar-fill" style={{
                                height: "100%", borderRadius: 5,
                                background: over ? "linear-gradient(90deg, #c94040, #e05050)" : "linear-gradient(90deg, #4a7c59, #5e9970)",
                                width: `${pct}%`
                              }} />
                            </div>
                            {meals && <div style={{ fontSize: 10, color: "#8a7f72", lineHeight: 1.5 }}>{meals}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}