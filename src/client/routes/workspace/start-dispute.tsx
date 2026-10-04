import { useEffect, useState } from "react";
import { redirect, useLoaderData, useNavigate } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

import { jsonBody, submit } from "../../lib/api";

export function loader({ request }: LoaderFunctionArgs) {
  const obligationId = new URL(request.url).searchParams.get("obligation");
  if (!obligationId) throw redirect("/app/deals");
  return { obligationId };
}

export default function StartDisputeRoute() {
  const { obligationId } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function start() {
      const result = await submit<{ workflowId: string; reused: boolean }>(
        "/api/disputes",
        jsonBody({ obligationId }),
        "Tolerance could not open a dispute for that obligation.",
      );
      if (!active) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      navigate(`/app/disputes/${result.data.workflowId}`, { replace: true });
    }
    void start();
    return () => {
      active = false;
    };
  }, [navigate, obligationId]);

  return (
    <section className="empty" role="status">
      <h1>Preparing the dispute packet</h1>
      <p>
        Tolerance freezes the authorized evidence packet and records the X Layer
        dispute commitment for this obligation.
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
