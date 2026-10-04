import type { RouteObject } from "react-router";
import { createBrowserRouter } from "react-router";

import RouteError from "./components/route-error";
import DemoRoute from "./routes/demo";
import ForgotPasswordRoute, {
  action as forgotPasswordAction,
} from "./routes/forgot-password";
import HomeRoute from "./routes/home";
import InvitationRoute, {
  ErrorBoundary as InvitationErrorBoundary,
  loader as invitationLoader,
} from "./routes/invite";
import LoginRoute, {
  action as loginAction,
  loader as loginLoader,
} from "./routes/login";
import NotFoundRoute from "./routes/not-found";
import ResetPasswordRoute, {
  action as resetPasswordAction,
} from "./routes/reset-password";
import SignupRoute, {
  action as signupAction,
  loader as signupLoader,
} from "./routes/signup";
import AccountRoute, {
  loader as accountLoader,
} from "./routes/workspace/account";
import ActivityRoute, {
  loader as activityLoader,
} from "./routes/workspace/activity";
import DealRoute, {
  action as dealAction,
  loader as dealLoader,
} from "./routes/workspace/deal";
import DealsRoute, {
  action as dealsAction,
  loader as dealsLoader,
} from "./routes/workspace/deals";
import DisputeRoute, {
  genlayerAction as disputeAction,
  loader as disputeLoader,
} from "./routes/workspace/dispute";
import DisputesRoute, {
  loader as disputesLoader,
} from "./routes/workspace/disputes";
import WorkspaceHomeRoute, {
  loader as workspaceHomeLoader,
} from "./routes/workspace/home";
import WorkspaceLayout, {
  action as workspaceAction,
  loader as workspaceLoader,
} from "./routes/workspace/layout";
import ObligationRoute, {
  loader as obligationLoader,
} from "./routes/workspace/obligation";
import OnboardingRoute, {
  action as onboardingAction,
  loader as onboardingLoader,
} from "./routes/workspace/onboarding";
import StartDisputeRoute, {
  loader as startDisputeLoader,
} from "./routes/workspace/start-dispute";

export const routes: RouteObject[] = [
  { path: "/", element: <HomeRoute /> },
  { path: "/demo", element: <DemoRoute /> },
  {
    path: "/login",
    element: <LoginRoute />,
    loader: loginLoader,
    action: loginAction,
  },
  {
    path: "/signup",
    element: <SignupRoute />,
    loader: signupLoader,
    action: signupAction,
  },
  {
    path: "/forgot-password",
    element: <ForgotPasswordRoute />,
    action: forgotPasswordAction,
  },
  {
    path: "/reset-password",
    element: <ResetPasswordRoute />,
    action: resetPasswordAction,
  },
  {
    path: "/invite/:token",
    element: <InvitationRoute />,
    loader: invitationLoader,
    ErrorBoundary: InvitationErrorBoundary,
  },
  {
    path: "/app",
    element: <WorkspaceLayout />,
    loader: workspaceLoader,
    action: workspaceAction,
    ErrorBoundary: RouteError,
    children: [
      {
        index: true,
        element: <WorkspaceHomeRoute />,
        loader: workspaceHomeLoader,
      },
      {
        path: "deals",
        element: <DealsRoute />,
        loader: dealsLoader,
        action: dealsAction,
      },
      {
        path: "deals/:dealId",
        element: <DealRoute />,
        loader: dealLoader,
        action: dealAction,
      },
      {
        path: "deals/:dealId/obligations/:obligationId",
        element: <ObligationRoute />,
        loader: obligationLoader,
      },
      {
        path: "disputes",
        element: <DisputesRoute />,
        loader: disputesLoader,
      },
      {
        path: "disputes/new",
        element: <StartDisputeRoute />,
        loader: startDisputeLoader,
      },
      {
        path: "disputes/:workflowId",
        element: <DisputeRoute />,
        loader: disputeLoader,
        action: disputeAction,
      },
      { path: "activity", element: <ActivityRoute />, loader: activityLoader },
      { path: "account", element: <AccountRoute />, loader: accountLoader },
      {
        path: "onboarding",
        element: <OnboardingRoute />,
        loader: onboardingLoader,
        action: onboardingAction,
      },
    ],
  },
  { path: "*", element: <NotFoundRoute /> },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
