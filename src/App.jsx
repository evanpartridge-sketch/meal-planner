import { useState, useEffect } from "react";

// ─── Sample Data ──────────────────────────────────────────────────────────────

const SAMPLE_RECIPES = [
  { id: "r1", title: "Roasted Salmon with Herbs", ingredients: ["salmon fillet", "lemon", "dill", "olive oil", "garlic"], caloriesPerServing: 420, times: { "total time": "25 min" }, yield: "2 servings", tags: ["fish", "quick", "healthy"], rating: 5, timesCooked: 4, source: "NYT Cooking", image: null },
  { id: "r2", title: "Chickpea & Spinach Curry", ingredients: ["chickpeas", "spinach", "coconut milk", "tomatoes", "garam masala", "ginger", "onion"], caloriesPerServing: 380, times: { "total time": "35 min" }, yield: "4 servings", tags: ["vegetarian", "curry"], rating: 4, timesCooked: 2, source: "NYT Cooking", image: null },
  { id: "r3", title: "Sheet Pan Chicken Thighs", ingredients: ["chicken thighs", "sweet potato", "broccoli", "olive oil", "paprika", "garlic powder"], caloriesPerServing: 510, times: { "total time": "45 min" }, yield: "4 servings", tags: ["chicken", "meal prep"], rating: 5, timesCooked: 6, source: "NYT Cooking", image: null },
  { id: "r4", title: "Lentil Soup", ingredients: ["red lentils", "carrots", "celery", "onion", "cumin", "turmeric", "vegetable broth"], caloriesPerServing: 290, times: { "total time": "40 min" }, yield: "6 servings", tags: ["soup", "vegetarian", "meal prep"], rating: 4, timesCooked: 3, source: "NYT Cooking", image: null },
  { id: "r5", title: "Zucchini Noodles with Pesto", ingredients: ["zucchini", "basil pesto", "cherry tomatoes", "pine nuts", "parmesan"], caloriesPerServing: 260, times: { "total time": "15 min" }, yield: "2 servings", tags: ["quick", "vegetarian", "low-carb"], rating: 3, timesCooked: 1, source: "NYT Cooking", image: null },
  { id: "r6", title: "Turkey & Veggie Meatballs", ingredients: ["ground turkey", "zucchini", "egg", "breadcrumbs", "garlic", "parsley", "marinara"], caloriesPerServing: 360, times: { "total time": "50 min" }, yield: "4 servings", tags: ["turkey", "meal prep"], rating: 4, timesCooked: 2, source: "NYT Cooking", image: null },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MEALS = ["Breakfast", "Lunch", "Dinner"];

const INITIAL_PLAN = {
  Monday:    { Breakfast: null, Lunch: "r4", Dinner: "r1" },
  Tuesday:   { Breakfast: null, Lunch: null,  Dinner: "r2" },
  Wednesday: { Breakfast: null, Lunch: "r4",  Dinner: "r3" },
  Thursday:  { Breakfast: null, Lunch: null,  Dinner: "r6" },
  Friday:    { Breakfast: null, Lunch: "r5",  Dinner: "r1" },
  Saturday:  { Breakfast: null, Lunch: null,  Dinner: "r3" },
  Sunday:    { Breakfast: null, Lunch: "r2",  Dinner: "r4" },
};

const CALORIE_GOAL = 1800;

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

// ─── Recipe emoji placeholder ─────────────────────────────────────────────────

const RECIPE_EMOJIS = ["🥗", "🍲", "🥘", "🍜", "🫕", "🥙", "🍱"];
function recipeEmoji(id) {
  return RECIPE_EMOJIS[id.charCodeAt(1) % RECIPE_EMOJIS.length];
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function MealPlannerApp() {
  const [activeTab, setActiveTab] = useState("planner");
  const [recipes, setRecipes] = useState(SAMPLE_RECIPES);
  const [plan, setPlan] = useState(INITIAL_PLAN);
  const [checkedItems, setCheckedItems] = useState({});
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [dragging, setDragging] = useState(null);

  const shoppingList = generateShoppingList(plan, recipes);
  const totalWeekCalories = Object.keys(plan).reduce((sum, day) => sum + getDayCalories(plan[day], recipes), 0);
  const avgDailyCalories = Math.round(totalWeekCalories / 7);

  function removeFromPlan(day, meal) {
    setPlan(p => ({ ...p, [day]: { ...p[day], [meal]: null } }));
  }

  function addToPlan(day, meal, recipeId) {
    setPlan(p => ({ ...p, [day]: { ...p[day], [meal]: recipeId } }));
  }

  function updateRating(id, rating) {
    setRecipes(rs => rs.map(r => r.id === id ? { ...r, rating } : r));
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
      </header>

      {/* Content */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>

        {/* ── WEEK PLANNER ── */}
        {activeTab === "planner" && (
          <div className="fade-in">
            <div style={{ marginBottom: 24, display: "flex", alignItems: "baseline", gap: 12 }}>
              <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 600, margin: 0 }}>
                This Week
              </h1>
              <span style={{ color: "#8a7f72", fontSize: 14 }}>
                Week of Feb 24 – Mar 2
              </span>
            </div>

            <div style={{ overflowX: "auto", paddingBottom: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", gap: 6, minWidth: 860 }}>

                {/* Header row */}
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

                {/* Meal rows */}
                {MEALS.map(meal => (
                  <>
                    <div key={meal} style={{
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
                  </>
                ))}
              </div>
            </div>

            <div style={{
              marginTop: 20,
              background: "#faf7f2",
              border: "1px solid #e8e0d4",
              borderRadius: 10,
              padding: "12px 18px",
              fontSize: 12,
              color: "#8a7f72",
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
              💡 <strong style={{ color: "#1c1915" }}>Tip:</strong> Drag recipes from the Recipe Library onto any meal slot, or click the × to remove a meal.
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
                  onClick={() => setSelectedRecipe(selectedRecipe?.id === recipe.id ? null : recipe)}
                  style={{
                    background: "#faf7f2",
                    border: `1.5px solid ${selectedRecipe?.id === recipe.id ? "#c8a03c" : "#e8e0d4"}`,
                    borderRadius: 12,
                    overflow: "hidden",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                    opacity: dragging === recipe.id ? 0.5 : 1,
                  }}
                >
                  {/* Card header */}
                  <div style={{
                    background: "linear-gradient(135deg, #2a2420 0%, #3d3128 100%)",
                    padding: "20px 20px 16px",
                    position: "relative"
                  }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>{recipeEmoji(recipe.id)}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 600, color: "#f5f0e8", lineHeight: 1.3 }}>
                      {recipe.title}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <StarRating rating={recipe.rating} onChange={r => updateRating(recipe.id, r)} />
                    </div>
                    <div style={{
                      position: "absolute", top: 12, right: 12,
                      background: "rgba(200,160,60,0.2)",
                      border: "1px solid rgba(200,160,60,0.4)",
                      borderRadius: 20, padding: "3px 10px",
                      fontSize: 11, color: "#c8a03c", fontWeight: 500
                    }}>
                      {recipe.caloriesPerServing} cal
                    </div>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
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

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
                      {recipe.tags.slice(0, 3).map(tag => (
                        <span key={tag} style={{
                          background: "#f0ebe2", borderRadius: 20, padding: "2px 9px",
                          fontSize: 10, color: "#8a7f72", fontWeight: 500
                        }}>{tag}</span>
                      ))}
                    </div>

                    {selectedRecipe?.id === recipe.id && (
                      <div style={{ borderTop: "1px solid #e8e0d4", paddingTop: 12, marginTop: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: "#1c1915", marginBottom: 6 }}>Ingredients</div>
                        <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 11, color: "#5a544c", lineHeight: 1.8 }}>
                          {recipe.ingredients.map(ing => <li key={ing}>{ing}</li>)}
                        </ul>
                      </div>
                    )}

                    <div style={{ fontSize: 10, color: "#c0b8ac", marginTop: 8, fontStyle: "italic" }}>
                      Drag onto the planner to schedule
                    </div>
                  </div>
                </div>
              ))}

              {/* Add recipe placeholder */}
              <div style={{
                background: "transparent",
                border: "1.5px dashed #d4c9b8",
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 32,
                minHeight: 180,
                cursor: "pointer",
                color: "#c0b8ac",
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>+</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Add from NYT Cooking</div>
                <div style={{ fontSize: 11, marginTop: 4, textAlign: "center", lineHeight: 1.5 }}>
                  Use the Chrome extension<br />to import recipes
                </div>
              </div>
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
              >
                Reset all
              </button>
            </div>

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
                      borderRadius: 10,
                      padding: "12px 16px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
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
                        <div style={{ fontSize: 10, color: "#8a7f72", marginTop: 1 }}>
                          used in {count} meals
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{
              marginTop: 20, padding: "14px 18px",
              background: "#faf7f2", border: "1px solid #e8e0d4",
              borderRadius: 10, fontSize: 12, color: "#8a7f72",
              maxWidth: 720
            }}>
              📋 {shoppingList.length} items · {Object.values(checkedItems).filter(Boolean).length} checked off
              · Based on your current week's meal plan
            </div>
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

            {/* Summary cards */}
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

            {/* Daily breakdown bars */}
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
                        background: over
                          ? "linear-gradient(90deg, #c94040, #e05050)"
                          : "linear-gradient(90deg, #4a7c59, #5e9970)",
                        width: `${pct}%`
                      }} />
                    </div>
                    {meals && (
                      <div style={{ fontSize: 10, color: "#8a7f72", lineHeight: 1.5 }}>{meals}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}