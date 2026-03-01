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

// ─── Week Helpers ─────────────────────────────────────────────────────────────

function getMondayOfWeek(offset) {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun, 1=Mon, …
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const d = new Date(today);
  d.setDate(today.getDate() + daysToMon + offset * 7);
  return d;
}

function getWeekLabel(offset) {
  if (offset === 0) return "This Week";
  if (offset === -1) return "Last Week";
  if (offset === 1) return "Next Week";
  const mon = getMondayOfWeek(offset);
  return `Week of ${mon.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
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

function RecipeDetail({ recipe, onClose, onRate, onMarkCooked, onEstimateCalories }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const origServings = parseServings(recipe.yield);
  const [servingCount, setServingCount] = useState(origServings);
  const [isEstimating, setIsEstimating] = useState(false);
  const ratio = origServings > 0 ? servingCount / origServings : 1;

  async function handleEstimate() {
    setIsEstimating(true);
    try { await onEstimateCalories(recipe); }
    finally { setIsEstimating(false); }
  }

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
          {(timeEntries.length > 0 || recipe.yield || recipe.caloriesPerServing || onEstimateCalories) && (
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
                      Servings
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => setServingCount(s => Math.max(1, s - 1))} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #d4c9b8", background: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a7f72", padding: 0 }}>−</button>
                      <span style={{ fontSize: 15, color: "#1c1915", fontWeight: 500, minWidth: 24, textAlign: "center" }}>{servingCount}</span>
                      <button onClick={() => setServingCount(s => s + 1)} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #d4c9b8", background: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a7f72", padding: 0 }}>+</button>
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, color: "#8a7f72", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 3 }}>
                    Calories
                  </div>
                  {recipe.caloriesPerServing ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15, color: "#1c1915", fontWeight: 500 }}>{recipe.caloriesPerServing} / serving</span>
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
                        {scaleIngredient(ing, ratio).replace(/(\d)([a-zA-Z])/g, "$1 $2")}
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
  const [recipeSort, setRecipeSort] = useState("default");

  // Auth state
  const [token, setToken] = useState(null);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [driveError, setDriveError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const plan = plans[weekOffset] ?? EMPTY_PLAN;

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
        if (data.plans) setPlans(data.plans);
        if (data.checkedItems) setCheckedItems(data.checkedItems);
        if (data.calorieGoal) setCalorieGoal(data.calorieGoal);
      }
      const cachedRecipes = localStorage.getItem("mealplanner_recipes");
      if (cachedRecipes) setRecipes(JSON.parse(cachedRecipes));
      const lastSync = localStorage.getItem("mealplanner_last_sync");
      if (lastSync) setLastSyncTime(lastSync);
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
      scope: "https://www.googleapis.com/auth/drive.readonly",
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
    setDriveError(null);
    try {
      const data = await fetchRecipesFromDrive(accessToken);
      setRecipes(data);
      localStorage.setItem("mealplanner_recipes", JSON.stringify(data));
      const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      localStorage.setItem("mealplanner_last_sync", now);
      setLastSyncTime(now);
    } catch (err) {
      setDriveError("Couldn't sync recipes from Drive. Please try again.");
      console.error(err);
    } finally {
      setLoadingRecipes(false);
    }
  }

  function syncFromDrive() {
    if (token) { doSync(token); }
    else { triggerOAuth((accessToken) => doSync(accessToken)); }
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
        const updated = recipes.map(r =>
          r.id === recipe.id ? { ...r, caloriesPerServing: data.caloriesPerServing } : r
        );
        setRecipes(updated);
        localStorage.setItem("mealplanner_recipes", JSON.stringify(updated));
        return data.caloriesPerServing;
      }
    } catch (err) {
      console.error("Failed to estimate calories:", err);
    }
    return null;
  }

  function removeFromPlan(day, meal) {
    setPlans(prev => {
      const cur = prev[weekOffset] ?? EMPTY_PLAN;
      return { ...prev, [weekOffset]: { ...cur, [day]: { ...cur[day], [meal]: null } } };
    });
  }

  function addToPlan(day, meal, recipeId) {
    setPlans(prev => {
      const cur = prev[weekOffset] ?? EMPTY_PLAN;
      return { ...prev, [weekOffset]: { ...cur, [day]: { ...cur[day], [meal]: recipeId } } };
    });
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

      {/* Recipe Picker Modal */}
      {pickerTarget && (
        <RecipePicker
          recipes={recipes}
          target={pickerTarget}
          search={pickerSearch}
          onSearchChange={setPickerSearch}
          onSelect={recipe => {
            addToPlan(pickerTarget.day, pickerTarget.meal, recipe.id);
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
            const cal = await estimateCalories(recipe);
            if (cal) setSelectedRecipe(prev => ({ ...prev, caloriesPerServing: cal }));
          }}
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
                  Use the Chrome extension to save recipes from NYT Cooking, then sync from Drive.
                </div>
                <button
                  onClick={syncFromDrive}
                  style={{
                    background: "#1c1915", color: "#f5f0e8", border: "none", borderRadius: 10,
                    padding: "10px 22px", fontSize: 14, fontWeight: 500, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 8, fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <img src="https://www.google.com/favicon.ico" width={14} height={14} alt="" />
                  Sync from Drive
                </button>
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
                        {DAYS.map(day => {
                          const cals = getDayCalories(plan[day], recipes);
                          const pct = Math.min((cals / calorieGoal) * 100, 100);
                          const over = cals > calorieGoal;
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
                                    position: "relative",
                                  }}
                                >
                                  {recipe ? (
                                    <div
                                      onClick={() => setSelectedRecipe(recipe)}
                                      style={{ cursor: "pointer", height: "100%" }}
                                    >
                                      <div style={{ fontSize: 18, marginBottom: 3 }}>{recipeEmoji(recipe.id)}</div>
                                      <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.3, color: "#1c1915", marginBottom: 3 }}>
                                        {recipe.title.length > 28 ? recipe.title.slice(0, 28) + "…" : recipe.title}
                                      </div>
                                      <div style={{ fontSize: 10, color: "#8a7f72" }}>{recipe.caloriesPerServing} cal</div>
                                      <button
                                        onClick={e => { e.stopPropagation(); removeFromPlan(day, meal); }}
                                        style={{
                                          position: "absolute", top: 5, right: 5,
                                          background: "none", border: "none", cursor: "pointer",
                                          color: "#c0b8ac", fontSize: 14, padding: 2, lineHeight: 1
                                        }}
                                      >×</button>
                                    </div>
                                  ) : (
                                    <div
                                      onClick={() => { setPickerTarget({ day, meal }); setPickerSearch(""); }}
                                      style={{
                                        height: "100%", minHeight: 54,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        color: "#c0b8ac", fontSize: 18,
                                        cursor: "pointer",
                                      }}
                                    >+</div>
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
                      💡 <strong style={{ color: "#1c1915" }}>Tip:</strong> Click any empty meal slot to pick a recipe. Click × on a filled slot to remove it.
                    </div>
                  </div>
                )}

                {/* ── RECIPES ── */}
                {activeTab === "recipes" && (() => {
                  const sortedFiltered = recipes
                    .filter(r => r.title.toLowerCase().includes(recipeSearch.toLowerCase()))
                    .sort((a, b) => {
                      if (recipeSort === "rating") return (b.rating || 0) - (a.rating || 0);
                      if (recipeSort === "cooked") return (b.timesCooked || 0) - (a.timesCooked || 0);
                      if (recipeSort === "az") return a.title.localeCompare(b.title);
                      return 0;
                    });
                  return (
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
                      </div>
                    </div>

                    {/* Search + sort bar */}
                    <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                      <div style={{ position: "relative", flex: 1 }}>
                        <span style={{
                          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                          fontSize: 14, color: "#c0b8ac", pointerEvents: "none",
                        }}>🔍</span>
                        <input
                          type="text"
                          placeholder="Search recipes…"
                          value={recipeSearch}
                          onChange={e => setRecipeSearch(e.target.value)}
                          style={{
                            width: "100%", border: "1.5px solid #e8e0d4", borderRadius: 10,
                            padding: "9px 14px 9px 36px", fontSize: 13,
                            fontFamily: "'DM Sans', sans-serif", color: "#1c1915",
                            background: "#fff", outline: "none",
                          }}
                        />
                      </div>
                      <select
                        value={recipeSort}
                        onChange={e => setRecipeSort(e.target.value)}
                        style={{
                          border: "1.5px solid #e8e0d4", borderRadius: 10,
                          padding: "9px 14px", fontSize: 13,
                          fontFamily: "'DM Sans', sans-serif", color: "#1c1915",
                          background: "#fff", cursor: "pointer", outline: "none",
                        }}
                      >
                        <option value="default">Default</option>
                        <option value="rating">Top Rated</option>
                        <option value="cooked">Most Cooked</option>
                        <option value="az">A → Z</option>
                      </select>
                    </div>

                    {sortedFiltered.length === 0 && (
                      <div style={{ color: "#8a7f72", fontSize: 14, textAlign: "center", paddingTop: 60 }}>
                        No recipes match "{recipeSearch}"
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
                              Click to view recipe
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })()}

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