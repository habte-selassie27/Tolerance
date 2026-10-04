import type { RouteObject } from "react-router";
import { createBrowserRouter } from "react-router";

import { RouteError } from "./components/feedback";
import {
  ForgotPasswordRoute,
  LoginRoute,
  ResetPasswordRoute,
  SignupRoute,
  forgotPasswordAction,
  loginAction,
  loginLoader,
  resetPasswordAction,
  signupAction,
  signupLoader,
} from "./routes/auth";
import InvitationRoute, {
  ErrorBoundary as InvitationErrorBoundary,
  loader as invitationLoader,
} from "./routes/invite";
import { DemoRoute, LandingRoute, NotFoundRoute } from "./routes/public";
import {
  AccountRoute,
  ActivityRoute,
  accountLoader,
  activityLoader,
} from "./routes/workspace/account";
import {
  DealRoute,
  DealsRoute,
  ObligationRoute,
  dealAction,
  dealLoader,
  dealsAction,
  dealsLoader,
  obligationLoader,
} from "./routes/workspace/commercial";
import WorkspaceHomeRoute, {
  loader as workspaceHomeLoader,
} from "./routes/workspace/home";
import WorkspaceLayout, {
  action as workspaceAction,
  loader as workspaceLoader,
} from "./routes/workspace/layout";
import {
  EmailStepRoute,
  emailAction,
  emailLoader,
} from "./routes/workspace/email";
import {
  OnboardingRoute,
  onboardingAction,
  onboardingLoader,
} from "./routes/workspace/onboarding";
import {
  DisputeRoute,
  DisputesRoute,
  StartDisputeRoute,
  disputeAction,
  disputeLoader,
  disputesLoader,
  startDisputeLoader,
} from "./routes/workspace/disputes";

export const routes: RouteObject[] = [
  { path: "/", element: <LandingRoute /> },
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
      {
        path: "activity",
        element: <ActivityRoute />,
        loader: activityLoader,
      },
      { path: "account", element: <AccountRoute />, loader: accountLoader },
      {
        path: "email",
        element: <EmailStepRoute />,
        loader: emailLoader,
        action: emailAction,
      },
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
