import React, { useState, useEffect, useCallback } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = "730204181239-qhan4dk94d69e94lb1dt55b4k1j58pri.apps.googleusercontent.com";
const DRIVE_FOLDER_ID = "1OwlVzGl91UjJegeyYJP1efQTq2eLZ-qO";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const CALORIE_GOAL = 1800;

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
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
  return Object.values(dayPlan).reduce((sum, id) => {
    if (!id) return sum;
    const r = getRecipe(id, recipes);
    return sum + (r?.caloriesPerServing || 0);
  }, 0);
}

function generateShoppingList(plan, recipes) {
  const ingredientMap = {};
  Object.values(plan).forEach(dayPlan => {
    Object.values(dayPlan).forEach(id => {
      if (!id) return;
      const r = getRecipe(id, recipes);
      if (!r) return;
      r.ingredients.forEach(ing => {
        const key = ing.toLowerCase().trim();
        ingredientMap[key] = (ingredientMap[key] || 0) + 1;
      });
    });
  });
  return Object.entries(ingredientMap).sort((a, b) => a[0].localeCompare(b[0]));
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

// ─── Google Drive API ─────────────────────────────────────────────────────────

async function fetchRecipesFromDrive(token) {
  // List all JSON files in the folder
  const q = encodeURIComponent(
    `'${DRIVE_FOLDER_ID}' in parents and mimeType='application/json' and trashed=false`
  );
  const listRes = await fetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name)&pageSize=200`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Drive API error ${listRes.status}`);
  }
  const listData = await listRes.json();
  if (!listData.files || listData.files.length === 0) return [];

  // Fetch each file's content in parallel
  const recipes = await Promise.all(
    listData.files.map(async file => {
      try {
        const contentRes = await fetch(
          `${DRIVE_API}/files/${file.id}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!contentRes.ok) return null;
        return await contentRes.json();
      } catch {
        return null;
      }
    })
  );

  return recipes.filter(Boolean);
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
      scope: "https://www.googleapis.com/auth/drive.readonly",
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

// ─── Recipe Detail Modal ──────────────────────────────────────────────────────

function RecipeDetail({ recipe, onClose, onRate, onMarkCooked }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const timeEntries = Object.entries(recipe.times || {}).filter(([, v]) => v);

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
          <h1 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 38, fontWeight: 700, margin: "0 0 6px",
            lineHeight: 1.15, color: "#1c1915",
          }}>
            {recipe.title}
          </h1>
          {recipe.author && (
            <div style={{ fontSize: 13, color: "#8a7f72", marginBottom: 14 }}>
              By {recipe.author}
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
          {(timeEntries.length > 0 || recipe.yield || recipe.caloriesPerServing) && (
            <>
              <div style={{ height: 1, background: "#e8e0d4", margin: "0 0 20px" }} />
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 20 }}>
                {timeEntries.map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, color: "#8a7f72", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 3 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 15, color: "#1c1915", fontWeight: 500 }}>{value}</div>
                  </div>
                ))}
                {recipe.yield && (
                  <div>
                    <div style={{ fontSize: 10, color: "#8a7f72", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 3 }}>
                      Yield
                    </div>
                    <div style={{ fontSize: 15, color: "#1c1915", fontWeight: 500 }}>{recipe.yield}</div>
                  </div>
                )}
                {recipe.caloriesPerServing && (
                  <div>
                    <div style={{ fontSize: 10, color: "#8a7f72", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 3 }}>
                      Calories
                    </div>
                    <div style={{ fontSize: 15, color: "#1c1915", fontWeight: 500 }}>{recipe.caloriesPerServing} / serving</div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Description */}
          {recipe.description && (
            <>
              <div style={{ height: 1, background: "#e8e0d4", margin: "0 0 20px" }} />
              <p style={{
                fontSize: 14, color: "#5a544c", lineHeight: 1.75,
                fontStyle: "italic", margin: "0 0 20px",
              }}>
                {recipe.description}
              </p>
            </>
          )}

          {/* Ingredients + Instructions two-column */}
          {(recipe.ingredients?.length > 0 || recipe.instructions?.length > 0) && (
            <>
              <div style={{ height: 1, background: "#e8e0d4", margin: "0 0 28px" }} />
              <div style={{
                display: "grid",
                gridTemplateColumns: recipe.instructions?.length > 0 ? "1fr 1.8fr" : "1fr",
                gap: 40,
                alignItems: "start",
              }}>

                {/* Ingredients */}
                {recipe.ingredients?.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: 10, color: "#8a7f72", textTransform: "uppercase",
                      letterSpacing: "0.1em", fontWeight: 500,
                      borderBottom: "1px solid #c8a03c", paddingBottom: 8, marginBottom: 16,
                    }}>
                      Ingredients
                    </div>
                    {recipe.ingredients.map((ing, i) => (
                      <div key={i} style={{
                        fontSize: 14, color: "#1c1915", lineHeight: 1.7,
                        padding: "7px 0",
                        borderBottom: "1px solid #f0ebe2",
                      }}>
                        {ing.replace(/(\d)([a-zA-Z])/g, "$1 $2")}
                      </div>
                    ))}
                  </div>
                )}

                {/* Instructions */}
                {recipe.instructions?.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: 10, color: "#8a7f72", textTransform: "uppercase",
                      letterSpacing: "0.1em", fontWeight: 500,
                      borderBottom: "1px solid #c8a03c", paddingBottom: 8, marginBottom: 16,
                    }}>
                      Preparation
                    </div>
                    {recipe.instructions.map((step, i) => (
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
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Tags + source link */}
          {(recipe.tags?.length > 0 || recipe.sourceUrl) && (
            <>
              <div style={{ height: 1, background: "#e8e0d4", margin: "28px 0 20px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {recipe.tags?.map(tag => (
                  <span key={tag} style={{
                    background: "#f0ebe2", borderRadius: 20,
                    padding: "3px 11px", fontSize: 11, color: "#8a7f72", fontWeight: 500,
                  }}>{tag}</span>
                ))}
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
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function MealPlannerApp() {
  const [activeTab, setActiveTab] = useState("planner");
  const [recipes, setRecipes] = useState([]);
  const [plan, setPlan] = useState(EMPTY_PLAN);
  const [checkedItems, setCheckedItems] = useState({});
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [dragging, setDragging] = useState(null);

  // Auth state
  const [token, setToken] = useState(null);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [driveError, setDriveError] = useState(null);

  const shoppingList = generateShoppingList(plan, recipes);
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

  function handleSignIn(accessToken) {
    setToken(accessToken);
    loadRecipes(accessToken);
  }

  function removeFromPlan(day, meal) {
    setPlan(p => ({ ...p, [day]: { ...p[day], [meal]: null } }));
  }

  function addToPlan(day, meal, recipeId) {
    setPlan(p => ({ ...p, [day]: { ...p[day], [meal]: recipeId } }));
  }

  function updateRating(id, rating) {
    setRecipes(rs => rs.map(r => r.id === id ? { ...r, rating } : r));
  }

  function markCooked(id) {
    setRecipes(rs => rs.map(r => r.id === id ? { ...r, timesCooked: (r.timesCooked || 0) + 1 } : r));
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
        .tab-btn { transition: all 0.2s; }
        .tab-btn:hover { background: rgba(200,160,60,0.12) !important; }
        .recipe-card { transition: transform 0.15s, box-shadow 0.15s; cursor: pointer; }
        .recipe-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.1) !important; }
        .meal-slot { transition: background 0.15s, border-color 0.15s; }
        .meal-slot:hover { background: rgba(200,160,60,0.06) !important; }
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
          <div style={{
            background: "rgba(200,160,60,0.12)",
            border: "1px solid rgba(200,160,60,0.3)",
            borderRadius: 20,
            padding: "6px 14px",
            fontSize: 12,
            color: "#c8a03c",
            fontWeight: 500
          }}>
            Goal: {CALORIE_GOAL} cal/day
          </div>
          {token && (
            <button
              onClick={() => loadRecipes(token)}
              title="Refresh recipes from Drive"
              style={{
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, padding: "6px 10px", cursor: "pointer",
                color: "#8a7f72", fontSize: 14
              }}
            >↻</button>
          )}
        </div>
      </header>

      {/* Recipe Detail Modal */}
      {selectedRecipe && (
        <RecipeDetail
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onRate={r => { updateRating(selectedRecipe.id, r); setSelectedRecipe(prev => ({ ...prev, rating: r })); }}
          onMarkCooked={() => { markCooked(selectedRecipe.id); setSelectedRecipe(prev => ({ ...prev, timesCooked: (prev.timesCooked || 0) + 1 })); }}
        />
      )}

      {/* Content */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>

        {/* Not signed in */}
        {!token && <SignInScreen onSignIn={handleSignIn} />}

        {/* Signed in — loading */}
        {token && loadingRecipes && <Spinner />}

        {/* Error state */}
        {token && !loadingRecipes && driveError && (
          <div style={{
            background: "#fff0f0", border: "1px solid #f5c0c0", borderRadius: 10,
            padding: "16px 20px", color: "#c94040", fontSize: 14, marginBottom: 20
          }}>
            {driveError}
            <button onClick={() => loadRecipes(token)} style={{
              marginLeft: 12, background: "none", border: "1px solid #c94040",
              borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "#c94040", fontSize: 12
            }}>Retry</button>
          </div>
        )}

        {/* Signed in — loaded */}
        {token && !loadingRecipes && !driveError && (
          <>
            {/* Empty state */}
            {recipes.length === 0 && (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", minHeight: 320, gap: 16, textAlign: "center"
              }}>
                <div style={{ fontSize: 48 }}>📭</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600 }}>
                  No recipes yet
                </div>
                <div style={{ fontSize: 14, color: "#8a7f72", maxWidth: 340, lineHeight: 1.6 }}>
                  Use the Chrome extension to scrape recipes from NYT Cooking — they'll appear here automatically.
                </div>
              </div>
            )}

            {recipes.length > 0 && (
              <>
                {/* ── WEEK PLANNER ── */}
                {activeTab === "planner" && (
                  <div className="fade-in">
                    <div style={{ marginBottom: 24, display: "flex", alignItems: "baseline", gap: 12 }}>
                      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, margin: 0 }}>
                        This Week
                      </h1>
                    </div>

                    <div style={{ overflowX: "auto", paddingBottom: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", gap: 6, minWidth: 860 }}>
                        <div />
                        {DAYS.map(day => {
                          const cals = getDayCalories(plan[day], recipes);
                          const pct = Math.min((cals / CALORIE_GOAL) * 100, 100);
                          const over = cals > CALORIE_GOAL;
                          return (
                            <div key={day} style={{ textAlign: "center", paddingBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 500, color: "#8a7f72", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                {day.slice(0, 3)}
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
                              const recipeId = plan[day][meal];
                              const recipe = recipeId ? getRecipe(recipeId, recipes) : null;
                              const isOver = dragOver === `${day}-${meal}`;
                              return (
                                <div
                                  key={`${day}-${meal}`}
                                  className="meal-slot"
                                  onDragOver={e => { e.preventDefault(); setDragOver(`${day}-${meal}`); }}
                                  onDragLeave={() => setDragOver(null)}
                                  onDrop={e => {
                                    e.preventDefault();
                                    const id = e.dataTransfer.getData("recipeId");
                                    if (id) addToPlan(day, meal, id);
                                    setDragOver(null);
                                  }}
                                  style={{
                                    minHeight: 70,
                                    background: isOver ? "rgba(200,160,60,0.1)" : "#faf7f2",
                                    border: `1.5px ${isOver ? "dashed" : "solid"} ${isOver ? "#c8a03c" : "#e8e0d4"}`,
                                    borderRadius: 8,
                                    padding: 8,
                                    position: "relative",
                                  }}
                                >
                                  {recipe ? (
                                    <div>
                                      <div style={{ fontSize: 18, marginBottom: 3 }}>{recipeEmoji(recipe.id)}</div>
                                      <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.3, color: "#1c1915", marginBottom: 3 }}>
                                        {recipe.title.length > 28 ? recipe.title.slice(0, 28) + "…" : recipe.title}
                                      </div>
                                      <div style={{ fontSize: 10, color: "#8a7f72" }}>{recipe.caloriesPerServing} cal</div>
                                      <button
                                        onClick={() => removeFromPlan(day, meal)}
                                        style={{
                                          position: "absolute", top: 5, right: 5,
                                          background: "none", border: "none", cursor: "pointer",
                                          color: "#c0b8ac", fontSize: 14, padding: 2, lineHeight: 1
                                        }}
                                      >×</button>
                                    </div>
                                  ) : (
                                    <div style={{
                                      height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                                      color: "#c0b8ac", fontSize: 18
                                    }}>+</div>
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
                      💡 <strong style={{ color: "#1c1915" }}>Tip:</strong> Drag recipes from the Recipe Library onto any meal slot, or click × to remove.
                    </div>
                  </div>
                )}

                {/* ── RECIPES ── */}
                {activeTab === "recipes" && (
                  <div className="fade-in">
                    <div style={{ marginBottom: 24, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, margin: 0 }}>
                        Recipe Library
                      </h1>
                      <span style={{ color: "#8a7f72", fontSize: 13 }}>{recipes.length} recipes saved</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                      {recipes.map(recipe => (
                        <div
                          key={recipe.id}
                          className="recipe-card"
                          draggable
                          onDragStart={e => {
                            e.dataTransfer.setData("recipeId", recipe.id);
                            setDragging(recipe.id);
                          }}
                          onDragEnd={() => setDragging(null)}
                          onClick={() => setSelectedRecipe(recipe)}
                          style={{
                            background: "#faf7f2",
                            border: "1.5px solid #e8e0d4",
                            borderRadius: 12,
                            overflow: "hidden",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                            opacity: dragging === recipe.id ? 0.5 : 1,
                          }}
                        >
                          <div style={{
                            background: "linear-gradient(135deg, #2a2420 0%, #3d3128 100%)",
                            padding: "20px 20px 16px",
                            position: "relative"
                          }}>
                            {recipe.image ? (
                              <img src={recipe.image} alt={recipe.title} style={{
                                width: "100%", height: 120, objectFit: "cover",
                                borderRadius: 6, marginBottom: 10
                              }} />
                            ) : (
                              <div style={{ fontSize: 36, marginBottom: 8 }}>{recipeEmoji(recipe.id)}</div>
                            )}
                            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 600, color: "#f5f0e8", lineHeight: 1.3 }}>
                              {recipe.title}
                            </div>
                            <div style={{ marginTop: 6 }}>
                              <StarRating rating={recipe.rating} onChange={r => updateRating(recipe.id, r)} />
                            </div>
                            {recipe.caloriesPerServing && (
                              <div style={{
                                position: "absolute", top: 12, right: 12,
                                background: "rgba(200,160,60,0.2)", border: "1px solid rgba(200,160,60,0.4)",
                                borderRadius: 20, padding: "3px 10px",
                                fontSize: 11, color: "#c8a03c", fontWeight: 500
                              }}>
                                {recipe.caloriesPerServing} cal
                              </div>
                            )}
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

                            {recipe.tags?.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
                                {recipe.tags.slice(0, 3).map(tag => (
                                  <span key={tag} style={{
                                    background: "#f0ebe2", borderRadius: 20, padding: "2px 9px",
                                    fontSize: 10, color: "#8a7f72", fontWeight: 500
                                  }}>{tag}</span>
                                ))}
                              </div>
                            )}

                            <div style={{ fontSize: 10, color: "#c0b8ac", marginTop: 8, fontStyle: "italic" }}>
                              Click to view · Drag to plan
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── SHOPPING LIST ── */}
                {activeTab === "shopping" && (
                  <div className="fade-in">
                    <div style={{ marginBottom: 24, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, margin: 0 }}>
                        Shopping List
                      </h1>
                      <button
                        onClick={() => setCheckedItems({})}
                        style={{
                          background: "none", border: "1px solid #d4c9b8", borderRadius: 8,
                          padding: "6px 14px", fontSize: 12, color: "#8a7f72", cursor: "pointer",
                          fontFamily: "'DM Sans', sans-serif"
                        }}
                      >Reset all</button>
                    </div>

                    {shoppingList.length === 0 ? (
                      <div style={{ color: "#8a7f72", fontSize: 14, textAlign: "center", paddingTop: 60 }}>
                        Add meals to your planner to generate a shopping list.
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 720 }}>
                          {shoppingList.map(([ingredient, count]) => {
                            const checked = !!checkedItems[ingredient];
                            return (
                              <div
                                key={ingredient}
                                className={`check-item ${checked ? "checked" : ""}`}
                                onClick={() => setCheckedItems(c => ({ ...c, [ingredient]: !c[ingredient] }))}
                                style={{
                                  background: checked ? "#f0ebe2" : "#faf7f2",
                                  border: `1.5px solid ${checked ? "#d4c9b8" : "#e8e0d4"}`,
                                  borderRadius: 10, padding: "12px 16px", cursor: "pointer",
                                  display: "flex", alignItems: "center", gap: 12,
                                }}
                              >
                                <div style={{
                                  width: 20, height: 20, borderRadius: 5,
                                  border: `2px solid ${checked ? "#4a7c59" : "#c8bfb0"}`,
                                  background: checked ? "#4a7c59" : "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  flexShrink: 0, transition: "all 0.15s"
                                }}>
                                  {checked && <span style={{ color: "white", fontSize: 12, lineHeight: 1 }}>✓</span>}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{
                                    fontSize: 13, fontWeight: 400, color: "#1c1915",
                                    textDecoration: checked ? "line-through" : "none",
                                    textDecorationColor: "#8a7f72"
                                  }}>
                                    {ingredient}
                                  </div>
                                  {count > 1 && (
                                    <div style={{ fontSize: 10, color: "#8a7f72", marginTop: 1 }}>used in {count} meals</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{
                          marginTop: 20, padding: "14px 18px",
                          background: "#faf7f2", border: "1px solid #e8e0d4",
                          borderRadius: 10, fontSize: 12, color: "#8a7f72", maxWidth: 720
                        }}>
                          📋 {shoppingList.length} items · {Object.values(checkedItems).filter(Boolean).length} checked off · Based on your current week's meal plan
                        </div>
                      </>
                    )}
                  </div>
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
                        { label: "Daily Goal", value: CALORIE_GOAL, unit: "cal", color: "#c8a03c" },
                        { label: "Avg This Week", value: avgDailyCalories, unit: "cal", color: avgDailyCalories > CALORIE_GOAL ? "#c94040" : "#4a7c59" },
                        { label: "Deficit / Day", value: Math.abs(CALORIE_GOAL - avgDailyCalories), unit: `cal ${CALORIE_GOAL > avgDailyCalories ? "under" : "over"}`, color: CALORIE_GOAL > avgDailyCalories ? "#4a7c59" : "#c94040" },
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
                        const pct = Math.min((cals / CALORIE_GOAL) * 100, 100);
                        const over = cals > CALORIE_GOAL;
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