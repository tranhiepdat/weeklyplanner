import goalsAiHandler from "./goals-ai";

// Backward-compatible route used by the Goals UI.
// Normalize the UI's currentGoals payload into the activeGoals shape
// expected by the main goals-ai handler.
export default function handler(req, res) {
  if (req.method === "POST" && req.body && !Array.isArray(req.body.activeGoals)) {
    const currentGoals = Array.isArray(req.body.currentGoals) ? req.body.currentGoals : [];
    req.body.activeGoals = currentGoals.slice(0, 3).map((goal) =>
      typeof goal === "string" ? { title: goal } : goal
    );
  }
  return goalsAiHandler(req, res);
}
