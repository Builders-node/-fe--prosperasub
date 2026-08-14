import { Navigate, useParams, useSearchParams } from "react-router-dom";

/**
 * Nothing is rendered here any more — this route is two forwarding rules.
 *
 * This file used to be the food plan page AND its checkout AND its renewal.
 * The plan page moved to the shared one, buying moved to the cart, and
 * renewal moved to the shared checkout, which renews every service. What was
 * left behind was a second, drifting copy of the food renewal that no URL
 * could reach — the redirects below fenced it in on both sides.
 *
 * A link carrying `?renew=` is a renewal, so it lands on the shared checkout;
 * anything else is someone looking at a plan, so it lands on the plan page.
 * Old bookmarks and emails keep working, and there is one of each flow.
 */
const FoodPlanDetailRoute = () => {
  const [sp] = useSearchParams();
  const { planId } = useParams<{ planId: string }>();
  const renew = sp.get("renew");
  if (renew && planId) return <Navigate to={`/checkout/${planId}?renew=${renew}`} replace />;
  return <Navigate to={`/services/food/plans/${planId}`} replace />;
};

export default FoodPlanDetailRoute;
